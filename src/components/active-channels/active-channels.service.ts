import { PromoteMsgsService } from './../promote-msgs/promote-msgs.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ActiveChannel, ActiveChannelDocument } from './schemas/active-channel.schema';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { getBotsServiceInstance } from '../../utils';
import { ChannelCategory } from '../bots';

@Injectable()
export class ActiveChannelsService {
  private readonly DEFAULT_LIMIT = 50;
  private readonly DEFAULT_SKIP = 0;
  private readonly MIN_PARTICIPANTS_COUNT = 600;

  constructor(
    @InjectModel(ActiveChannel.name) private activeChannelModel: Model<ActiveChannelDocument>,
    @Inject(forwardRef(() => PromoteMsgsService))
    private promoteMsgsService: PromoteMsgsService,
  ) { }

  async create(createActiveChannelDto: CreateActiveChannelDto): Promise<ActiveChannel> {
    try {
      if (!createActiveChannelDto.channelId) {
        throw new BadRequestException('Channel ID is required');
      }

      const availableMsgs = await this.getAvailableMessages();
      const createdChannel = new this.activeChannelModel({
        ...createActiveChannelDto,
        availableMsgs,
        createdAt: new Date(),
      });

      return await createdChannel.save();
    } catch (error) {
      throw this.handleError(error, 'Failed to create channel');
    }
  }

  async createMultiple(createChannelDtos: Partial<CreateActiveChannelDto>[]): Promise<string> {
    try {
      if (!createChannelDtos?.length) {
        throw new BadRequestException('At least one channel DTO is required');
      }

      const bulkOps = createChannelDtos.map((dto) => {
        if (!dto.channelId) {
          throw new BadRequestException('Channel ID is required for all DTOs');
        }

        const setFields: Record<string, unknown> = { updatedAt: new Date() };
        if (dto.title != null) setFields.title = dto.title;
        if (dto.username != null) setFields.username = dto.username;
        if (dto.participantsCount != null) setFields.participantsCount = dto.participantsCount;
        if (dto.megagroup !== undefined) setFields.megagroup = dto.megagroup;

        const defaults: Record<string, unknown> = {
          channelId: dto.channelId,
          broadcast: false,
          canSendMsgs: true,
          participantsCount: 0,
          restricted: false,
          sendMessages: true,
          reactRestricted: false,
          wordRestriction: 0,
          dMRestriction: 0,
          availableMsgs: [],
          banned: false,
          megagroup: true,
          private: false,
          createdAt: new Date(),
        };

        // Remove keys already in $set to avoid MongoDB path conflict
        for (const key of Object.keys(setFields)) {
          delete defaults[key];
        }

        return {
          updateOne: {
            filter: { channelId: dto.channelId },
            update: {
              $set: setFields,
              $setOnInsert: defaults,
            },
            upsert: true,
          },
        };
      });

      await this.activeChannelModel.bulkWrite(bulkOps, { ordered: false });
      return `Successfully processed ${createChannelDtos.length} channels`;
    } catch (error) {
      throw this.handleError(error, 'Failed to create multiple channels');
    }
  }

  async findAll(): Promise<ActiveChannel[]> {
    try {
      return await this.activeChannelModel.find().lean().exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch all channels');
    }
  }

  async findOne(channelId: string): Promise<ActiveChannel | null> {
    try {
      if (!channelId) {
        throw new BadRequestException('Channel ID is required');
      }
      return await this.activeChannelModel.findOne({ channelId }).lean().exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch channel');
    }
  }

  async update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel> {
    try {
      delete updateActiveChannelDto["_id"]
      if (!channelId) {
        throw new BadRequestException('Channel ID is required');
      }

      const cleanDto = Object.fromEntries(
        Object.entries(updateActiveChannelDto).filter(([_, value]) => value !== undefined)
      );

      if (Object.keys(cleanDto).length === 0) {
        throw new BadRequestException('At least one field to update is required');
      }

      const updatedChannel = await this.activeChannelModel
        .findOneAndUpdate(
          { channelId },
          { $set: { ...cleanDto, updatedAt: new Date() } },
          { new: true, upsert: true, lean: true }
        )
        .exec();

      return updatedChannel;
    } catch (error) {
      throw this.handleError(error, 'Failed to update channel');
    }
  }

  async removeFromAvailableMsgs(channelId: string, msg: string): Promise<ActiveChannel | null> {
    try {
      if (!channelId || !msg) {
        throw new BadRequestException('Channel ID and message are required');
      }

      return await this.activeChannelModel
        .findOneAndUpdate(
          { channelId },
          { $pull: { availableMsgs: msg }, $set: { updatedAt: new Date() } },
          { new: true, lean: true }
        )
        .exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to remove message from available messages');
    }
  }

  async addToAvailableMsgs(channelId: string, msg: string): Promise<ActiveChannel | null> {
    try {
      if (!channelId || !msg) {
        throw new BadRequestException('Channel ID and message are required');
      }

      return await this.activeChannelModel
        .findOneAndUpdate(
          { channelId },
          { $addToSet: { availableMsgs: msg }, $set: { updatedAt: new Date() } },
          { new: true, lean: true }
        )
        .exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to add message to available messages');
    }
  }

  async remove(channelId: string): Promise<void> {
    try {
      if (!channelId) {
        throw new BadRequestException('Channel ID is required');
      }

      const botsService = getBotsServiceInstance();
      if (botsService) {
        await botsService.sendMessageByCategory(
          ChannelCategory.PROM_LOGS2,
          `Removing Active Channel: ${channelId}`
        );
      }

      await this.activeChannelModel.findOneAndDelete({ channelId }).exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to remove channel');
    }
  }

  async search(filter: any): Promise<ActiveChannel[]> {
    try {
      if (!filter || Object.keys(filter).length === 0) {
        throw new BadRequestException('Search filter is required');
      }

      return await this.activeChannelModel.find(filter).lean().exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to search channels');
    }
  }

  async getActiveChannels(limit = this.DEFAULT_LIMIT, skip = this.DEFAULT_SKIP, notIds: string[] = []): Promise<ActiveChannel[]> {
    try {
      const positiveKeywords = [
        'wife', 'adult', 'lanj', 'lesb', 'paid', 'coupl', 'cpl', 'randi', 'bhab', 'boy', 'girl',
        'friend', 'frnd', 'boob', 'pussy', 'dating', 'swap', 'gay', 'sex', 'bitch', 'love', 'video',
        'service', 'real', 'call', 'desi', 'partner', 'hook', 'romance', 'flirt', 'single', 'chat',
        'meet', 'intimate', 'escort', 'night', 'fun', 'hot', 'sexy', 'lovers', 'connect', 'relationship'
      ];

      const negativeKeywords = [
        'online', 'realestat', 'propert', 'freefire', 'bgmi', 'promo', 'agent', 'board', 'design',
        'realt', 'clas', 'PROFIT', 'wholesale', 'retail', 'topper', 'exam', 'motivat', 'medico',
        'shop', 'follower', 'insta', 'traini', 'cms', 'cma', 'subject', 'currency', 'color', 'amity',
        'game', 'gamin', 'like', 'earn', 'popcorn', 'TANISHUV', 'bitcoin', 'crypto', 'mall', 'work',
        'folio', 'health', 'civil', 'win', 'casino', 'promot', 'english', 'invest', 'fix', 'money',
        'book', 'anim', 'angime', 'support', 'cinema', 'bet', 'predic', 'study', 'youtube', 'sub',
        'open', 'trad', 'cric', 'quot', 'exch', 'movie', 'search', 'film', 'offer', 'ott', 'deal',
        'quiz', 'academ', 'insti', 'talkies', 'screen', 'series', 'webser', 'business', 'market',
        'trade', 'news', 'tech', 'education', 'learn', 'course', 'job', 'career', 'finance', 'stock',
        'shopify', 'ecommerce', 'advert', 'marketing', 'blog', 'vlog', 'tutorial', 'fitness', 'gym',
        'diet', 'travel', 'tour', 'hotel', 'food', 'recipe', 'fashion', 'style', 'beauty', 'music',
        'art', 'craft', 'event', 'party', 'ticket'
      ];

      const query = {
        $and: [
          {
            $or: [
              { title: { $regex: positiveKeywords.join('|'), $options: 'i' } },
              { username: { $regex: positiveKeywords.join('|'), $options: 'i' } },
            ],
          },
          {
            $and: [
              {
                title: {
                  $exists: true,
                  $type: 'string',
                  $not: { $regex: negativeKeywords.join('|'), $options: 'i' },
                },
              },
              {
                username: {
                  $exists: true,
                  $type: 'string',
                  $not: { $regex: negativeKeywords.join('|'), $options: 'i' },
                },
              },
            ],
          },
          {
            channelId: { $nin: notIds },
            participantsCount: { $gt: this.MIN_PARTICIPANTS_COUNT },
            username: { $ne: null },
            deletedCount: { $lte: 30 },
            canSendMsgs: true,
            restricted: false,
            banned: false,
            forbidden: false,
          },
        ],
      };

      const pipeline: PipelineStage[] = [
        { $match: query },
        { $addFields: { randomField: { $rand: {} } } },
        { $sort: { randomField: 1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { randomField: 0 } },
      ];

      return await this.activeChannelModel.aggregate<ActiveChannel>(pipeline, { allowDiskUse: true }).exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch active channels');
    }
  }

  async analytics(): Promise<Record<string, any>> {
    const [result] = await this.activeChannelModel.aggregate([
      {
        $facet: {
          // ── Overall counts ──
          overview: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                canSend: { $sum: { $cond: [{ $eq: ['$canSendMsgs', true] }, 1, 0] } },
                restricted: { $sum: { $cond: [{ $eq: ['$restricted', true] }, 1, 0] } },
                banned: { $sum: { $cond: [{ $eq: ['$banned', true] }, 1, 0] } },
                forbidden: { $sum: { $cond: [{ $eq: ['$forbidden', true] }, 1, 0] } },
                tempBan: { $sum: { $cond: [{ $eq: ['$tempBan', true] }, 1, 0] } },
                reactRestricted: { $sum: { $cond: [{ $eq: ['$reactRestricted', true] }, 1, 0] } },
                isPrivate: { $sum: { $cond: [{ $eq: ['$private', true] }, 1, 0] } },
                broadcast: { $sum: { $cond: [{ $eq: ['$broadcast', true] }, 1, 0] } },
                megagroup: { $sum: { $cond: [{ $eq: ['$megagroup', true] }, 1, 0] } },
                starred: { $sum: { $cond: [{ $eq: ['$starred', true] }, 1, 0] } },
                withUsername: { $sum: { $cond: [{ $and: [{ $ne: ['$username', null] }, { $ne: ['$username', ''] }] }, 1, 0] } },
              },
            },
          ],
          // ── Message performance ──
          messageStats: [
            {
              $group: {
                _id: null,
                totalSent: { $sum: { $ifNull: ['$successMsgCount', 0] } },
                totalFailed: { $sum: { $ifNull: ['$failureMsgCount', 0] } },
                totalDeleted: { $sum: { $ifNull: ['$deletedCount', 0] } },
                followupSent: { $sum: { $ifNull: ['$followupMsgSuccessCount', 0] } },
                followupFailed: { $sum: { $ifNull: ['$followupMsgFailureCount', 0] } },
                channelsWithSends: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$successMsgCount', 0] }, 0] }, 1, 0] } },
                channelsWithFailures: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$failureMsgCount', 0] }, 0] }, 1, 0] } },
                channelsWithDeleted: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$deletedCount', 0] }, 0] }, 1, 0] } },
                avgSent: { $avg: { $ifNull: ['$successMsgCount', 0] } },
                avgFailed: { $avg: { $ifNull: ['$failureMsgCount', 0] } },
              },
            },
          ],
          // ── Participant stats ──
          participantStats: [
            {
              $group: {
                _id: null,
                totalParticipants: { $sum: { $ifNull: ['$participantsCount', 0] } },
                avgParticipants: { $avg: { $ifNull: ['$participantsCount', 0] } },
                maxParticipants: { $max: { $ifNull: ['$participantsCount', 0] } },
                above10k: { $sum: { $cond: [{ $gte: [{ $ifNull: ['$participantsCount', 0] }, 10000] }, 1, 0] } },
                above1k: { $sum: { $cond: [{ $gte: [{ $ifNull: ['$participantsCount', 0] }, 1000] }, 1, 0] } },
                below600: { $sum: { $cond: [{ $lt: [{ $ifNull: ['$participantsCount', 0] }, 600] }, 1, 0] } },
              },
            },
          ],
          // ── Restriction stats ──
          restrictionStats: [
            {
              $group: {
                _id: null,
                wordRestricted: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$wordRestriction', 0] }, 0] }, 1, 0] } },
                dmRestricted: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$dMRestriction', 0] }, 0] }, 1, 0] } },
                totalWordRestrictions: { $sum: { $ifNull: ['$wordRestriction', 0] } },
                totalDmRestrictions: { $sum: { $ifNull: ['$dMRestriction', 0] } },
              },
            },
          ],
          // ── Promo coverage ──
          promoCoverage: [
            {
              $group: {
                _id: null,
                withPromos: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 0] }, 1, 0] } },
                exhausted: { $sum: { $cond: [{ $eq: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 0] }, 1, 0] } },
                avgPromoCount: { $avg: { $size: { $ifNull: ['$availableMsgs', []] } } },
                totalPromos: { $sum: { $size: { $ifNull: ['$availableMsgs', []] } } },
              },
            },
          ],
          // ── Error breakdown ──
          errorBreakdown: [
            { $match: { lastErrorType: { $ne: null, $exists: true } } },
            { $group: { _id: '$lastErrorType', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 },
          ],
          // ── Success rate distribution ──
          successRateDist: [
            {
              $match: {
                $expr: {
                  $gt: [{ $add: [{ $ifNull: ['$successMsgCount', 0] }, { $ifNull: ['$failureMsgCount', 0] }] }, 0],
                },
              },
            },
            {
              $addFields: {
                _rate: {
                  $multiply: [
                    { $divide: [{ $ifNull: ['$successMsgCount', 0] }, { $add: [{ $ifNull: ['$successMsgCount', 0] }, { $ifNull: ['$failureMsgCount', 0] }] }] },
                    100,
                  ],
                },
              },
            },
            {
              $bucket: {
                groupBy: '$_rate',
                boundaries: [0, 20, 40, 60, 80, 101],
                default: 'other',
                output: { count: { $sum: 1 } },
              },
            },
          ],
          // ── Top by success ──
          topBySuccess: [
            { $match: { successMsgCount: { $gt: 0 } } },
            { $sort: { successMsgCount: -1 } },
            { $limit: 10 },
            { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, successMsgCount: 1, failureMsgCount: 1, deletedCount: 1 } },
          ],
          // ── Top by failure ──
          topByFailure: [
            { $match: { failureMsgCount: { $gt: 0 } } },
            { $sort: { failureMsgCount: -1 } },
            { $limit: 10 },
            { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, successMsgCount: 1, failureMsgCount: 1, lastErrorType: 1 } },
          ],
          // ── Top by deleted ──
          topByDeleted: [
            { $match: { deletedCount: { $gt: 0 } } },
            { $sort: { deletedCount: -1 } },
            { $limit: 10 },
            { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, deletedCount: 1, successMsgCount: 1 } },
          ],
          // ── Top by participants ──
          topByParticipants: [
            { $sort: { participantsCount: -1 } },
            { $limit: 10 },
            { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, successMsgCount: 1, canSendMsgs: 1, banned: 1 } },
          ],
        },
      },
    ]).allowDiskUse(true).exec();

    const overview = result.overview[0] || {};
    const msgStats = result.messageStats[0] || {};
    const partStats = result.participantStats[0] || {};
    const restrictStats = result.restrictionStats[0] || {};
    const promoCov = result.promoCoverage[0] || {};
    const totalAttempts = (msgStats.totalSent || 0) + (msgStats.totalFailed || 0);

    return {
      overview: {
        total: overview.total || 0,
        canSend: overview.canSend || 0,
        restricted: overview.restricted || 0,
        banned: overview.banned || 0,
        forbidden: overview.forbidden || 0,
        tempBan: overview.tempBan || 0,
        reactRestricted: overview.reactRestricted || 0,
        private: overview.isPrivate || 0,
        broadcast: overview.broadcast || 0,
        megagroup: overview.megagroup || 0,
        starred: overview.starred || 0,
        withUsername: overview.withUsername || 0,
      },
      messages: {
        totalSent: msgStats.totalSent || 0,
        totalFailed: msgStats.totalFailed || 0,
        totalDeleted: msgStats.totalDeleted || 0,
        followupSent: msgStats.followupSent || 0,
        followupFailed: msgStats.followupFailed || 0,
        successRate: totalAttempts > 0 ? Math.round(((msgStats.totalSent || 0) / totalAttempts) * 100) : 0,
        channelsWithSends: msgStats.channelsWithSends || 0,
        channelsWithFailures: msgStats.channelsWithFailures || 0,
        channelsWithDeleted: msgStats.channelsWithDeleted || 0,
        avgSent: Math.round(msgStats.avgSent || 0),
        avgFailed: Math.round(msgStats.avgFailed || 0),
      },
      participants: {
        total: partStats.totalParticipants || 0,
        average: Math.round(partStats.avgParticipants || 0),
        max: partStats.maxParticipants || 0,
        above10k: partStats.above10k || 0,
        above1k: partStats.above1k || 0,
        below600: partStats.below600 || 0,
      },
      restrictions: {
        wordRestricted: restrictStats.wordRestricted || 0,
        dmRestricted: restrictStats.dmRestricted || 0,
        totalWordRestrictions: restrictStats.totalWordRestrictions || 0,
        totalDmRestrictions: restrictStats.totalDmRestrictions || 0,
      },
      promos: {
        withPromos: promoCov.withPromos || 0,
        exhausted: promoCov.exhausted || 0,
        avgPromoCount: Math.round((promoCov.avgPromoCount || 0) * 10) / 10,
        totalPromos: promoCov.totalPromos || 0,
      },
      errorBreakdown: (result.errorBreakdown || []).map((e: any) => ({
        error: e._id,
        count: e.count,
      })),
      successRateDistribution: (result.successRateDist || []).map((b: any) => ({
        range: b._id === 'other' ? 'other' : `${b._id}-${b._id + 20}%`,
        count: b.count,
      })),
      topBySuccess: result.topBySuccess || [],
      topByFailure: result.topByFailure || [],
      topByDeleted: result.topByDeleted || [],
      topByParticipants: result.topByParticipants || [],
    };
  }

  async paginated(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
    filter?: string;
  }): Promise<{
    channels: ActiveChannel[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 50,
      sortBy = 'successMsgCount',
      sortOrder = 'desc',
      search,
      filter = 'all',
    } = options;

    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 200);
    const skip = (pageNum - 1) * limitNum;

    const query: any = {};

    if (filter === 'can_send') { query.canSendMsgs = true; query.restricted = { $ne: true }; query.banned = { $ne: true }; query.forbidden = { $ne: true }; }
    else if (filter === 'restricted') query.restricted = true;
    else if (filter === 'banned') { query.$or = [{ banned: true }, { forbidden: true }]; }
    else if (filter === 'temp_banned') query.tempBan = true;
    else if (filter === 'with_errors') { query.lastErrorType = { $ne: null, $exists: true }; }
    else if (filter === 'exhausted') { query.$expr = { $eq: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 0] }; }
    else if (filter === 'high_deleted') { query.deletedCount = { $gt: 30 }; }

    if (search?.trim()) {
      const q = search.trim();
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
        { channelId: q },
      ];
    }

    const total = await this.activeChannelModel.countDocuments(query).exec();
    const totalPages = Math.ceil(total / limitNum);

    if (total === 0) {
      return { channels: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
    }

    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const channels = await this.activeChannelModel
      .find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean()
      .exec();

    return { channels: channels as ActiveChannel[], total, page: pageNum, limit: limitNum, totalPages };
  }

  async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<ActiveChannel[]> {
    try {
      if (!query || Object.keys(query).length === 0) {
        throw new BadRequestException('Query is required');
      }

      const queryExec = this.activeChannelModel.find(query).lean();

      if (sort && Object.keys(sort).length > 0) {
        queryExec.sort(sort);
      }

      if (limit && limit > 0) {
        queryExec.limit(limit);
      }

      if (skip && skip >= 0) {
        queryExec.skip(skip);
      }

      return await queryExec.exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to execute query');
    }
  }

  async resetWordRestrictions(): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Channel Maintenance\n\nAction: Reset Word Restrictions\nStatus: Processing`)}`);
      await this.activeChannelModel.updateMany(
        { banned: false },
        { $set: { wordRestriction: 0, dMRestriction: 0, updatedAt: new Date() } }
      );
    } catch (error) {
      throw this.handleError(error, 'Failed to reset word restrictions');
    }
  }

  async resetAvailableMsgs(): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Channel Maintenance\n\nAction: Reset Available Messages\nStatus: Processing`)}`);
      const availableMsgs = await this.getAvailableMessages();

      await this.activeChannelModel.updateMany(
        {
          $expr: {
            $lt: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 5],
          },
        },
        {
          $set: {
            wordRestriction: 0,
            dMRestriction: 0,
            banned: false,
            availableMsgs,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      throw this.handleError(error, 'Failed to reset available messages');
    }
  }

  async updateBannedChannels(): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Channel Maintenance\n\nAction: Update Banned Channels\nStatus: Processing`)}`);
      await this.activeChannelModel.updateMany(
        { $or: [{ banned: true }, { private: true }] },
        {
          $set: {
            wordRestriction: 0,
            dMRestriction: 0,
            banned: false,
            private: false,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      throw this.handleError(error, 'Failed to update banned channels');
    }
  }

  private async getAvailableMessages(): Promise<string[]> {
    try {
      const data = await this.promoteMsgsService.findOne();
      return Object.keys(data || {});
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch available messages');
    }
  }

  private handleError(error: any, message: string): Error {
    parseError(error, message);
    if (error instanceof BadRequestException) {
      return error;
    }
    return new InternalServerErrorException(`${message}: ${error.message}`);
  }
}