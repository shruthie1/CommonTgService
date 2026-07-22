import { PromoteMsgsService } from '../promote-msgs/promote-msgs.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, forwardRef } from '@nestjs/common';
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
import { buildDurableChannelUpsertPipeline } from '../../utils/telegram-utils/durable-channel-upsert';

@Injectable()
export class ActiveChannelsService {
  private readonly DEFAULT_LIMIT = 50;
  private readonly DEFAULT_SKIP = 0;
  private readonly MIN_PARTICIPANTS_COUNT = 600;
  private readonly logger = new Logger(ActiveChannelsService.name);
  private readonly writableFields = new Set([
    'title', 'username', 'participantsCount', 'accessHash', 'broadcast',
    'canSendMsgs', 'megagroup', 'availableMsgs', 'banned', 'bannedAt',
    'forbidden', 'private', 'reactRestricted', 'reactRestrictedAt',
    'clientsJoined', 'lastHydrationReason', 'lastHydrationStatus',
    'lastHydratedAt', 'lastLiveCheckedAt', 'lastMessageTime', 'messageIndex',
    'messageId', 'deletedCount', 'successMsgCount', 'failureMsgCount',
    'followupMsgSuccessCount', 'followupMsgFailureCount',
    'freeformDeletedCount', 'followUpDeletedCount', 'message',
  ]);

  constructor(
    @InjectModel(ActiveChannel.name) private activeChannelModel: Model<ActiveChannelDocument>,
    @Inject(forwardRef(() => PromoteMsgsService))
    private promoteMsgsService: PromoteMsgsService,
  ) { }

  // Auto-heal windows: a channel-level restriction is a transient signal, not a
  // permanent verdict. Clear it after the window so a one-off restriction (or a
  // false positive) doesn't keep a channel dead forever.
  private readonly REACT_RESTRICTED_HEAL_MS = 3 * 24 * 60 * 60 * 1000;  // 3 days

  /**
   * Clear time-expired channel-level restrictions so flagged channels can recover.
   *
   * The schema records `reactRestrictedAt` but nothing ever read it — meaning a channel marked
   * `reactRestricted` stayed dead permanently. This heals it once the window has elapsed
   * (REACT_RESTRICTED_HEAL_MS) so it's re-tried. Permanent flags (`banned`, `private`) are NOT touched.
   * (The old `tempBan` healing was removed — tempBan was a dead flag never set true.)
   */
  async autoHealChannels(): Promise<{ reactRestrictedHealed: number }> {
    const now = Date.now();
    const reactCutoff = new Date(now - this.REACT_RESTRICTED_HEAL_MS);

    // reactRestrictedAt is a Date; heal where it's older than the cutoff.
    const reactResult = await this.activeChannelModel.updateMany(
      { reactRestricted: true, reactRestrictedAt: { $ne: null, $lte: reactCutoff } },
      { $set: { reactRestricted: false, reactRestrictedAt: null, updatedAt: new Date() } },
    );

    const reactRestrictedHealed = reactResult.modifiedCount || 0;
    if (reactRestrictedHealed > 0) {
      this.logger.log(`Channel auto-heal: cleared reactRestricted on ${reactRestrictedHealed} channel(s)`);
    }
    return { reactRestrictedHealed };
  }

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
        this.copyDefinedFields(dto, setFields, [
          'title',
          'username',
          'participantsCount',
          'accessHash',
          'megagroup',
          'broadcast',
          'canSendMsgs',
          'reactRestricted',
          'lastHydrationReason',
          'lastHydrationStatus',
          'lastHydratedAt',
          'lastLiveCheckedAt',
        ]);
        // `private` is a live Telegram fact and is refreshed both ways.
        if (typeof dto.private === 'boolean') setFields.private = dto.private;
        // `forbidden` remains a durable safety stop until explicitly cleared.
        if (dto.forbidden === true) setFields.forbidden = true;

        const defaults: Record<string, unknown> = {
          channelId: dto.channelId,
          title: '',
          username: '',
          broadcast: false,
          canSendMsgs: false,
          participantsCount: 0,
          reactRestricted: false,
          freeformDeletedCount: 0,
          followUpDeletedCount: 0,
          availableMsgs: [],
          banned: dto.banned === true,
          bannedAt: dto.banned === true ? (dto.bannedAt ?? Date.now()) : null,
          megagroup: true,
          private: false,
          forbidden: false,
          createdAt: new Date(),
        };

        return {
          updateOne: {
            filter: { channelId: dto.channelId },
            update: buildDurableChannelUpsertPipeline(setFields, defaults, dto),
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

  async incrementClientsJoined(channelId: string): Promise<void> {
    try {
      await this.activeChannelModel.updateOne(
        { channelId },
        { $inc: { clientsJoined: 1 } }
      );
    } catch (error) {
      // Non-fatal — diversity scoring is best-effort
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

  /**
   * Returns the known subset of supplied IDs without loading the full shared
   * channel inventory. Discovery uses this to refresh a channel that became
   * unsendable, while avoiding creation of brand-new unsendable records.
   */
  async findExistingChannelIds(channelIds: string[]): Promise<string[]> {
    const ids = [...new Set(channelIds.filter((channelId) => typeof channelId === 'string' && channelId.trim()))];
    if (!ids.length) return [];
    const rows = await this.activeChannelModel
      .find({ channelId: { $in: ids } }, { channelId: 1, _id: 0 })
      .lean()
      .exec();
    return rows.map((row) => row.channelId).filter((channelId): channelId is string => Boolean(channelId));
  }

  async update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel> {
    try {
      delete updateActiveChannelDto["_id"]
      if (!channelId) {
        throw new BadRequestException('Channel ID is required');
      }

      const cleanDto: Record<string, any> = Object.fromEntries(
        Object.entries(updateActiveChannelDto).filter(
          ([key, value]) => value !== undefined && this.writableFields.has(key),
        )
      );

      if (Object.keys(cleanDto).length === 0) {
        throw new BadRequestException('At least one field to update is required');
      }

      const existing = await this.activeChannelModel.findOne({ channelId }).lean().exec();
      if (cleanDto.banned === true) {
        cleanDto.bannedAt = cleanDto.bannedAt ?? Date.now();
        cleanDto.canSendMsgs = false;
      } else if (cleanDto.banned === false) {
        // This explicit API update is the only supported unban path.
        cleanDto.bannedAt = null;
        // A fresh Telegram observation must restore sendability. The unban itself
        // never makes a channel selectable.
        cleanDto.canSendMsgs = false;
        cleanDto.lastHydrationStatus = 'needs_hydration';
        cleanDto.lastHydrationReason = 'operator_unbanned';
      } else if (
        (existing?.banned === true || existing?.forbidden === true)
        && cleanDto.canSendMsgs === true
      ) {
        cleanDto.canSendMsgs = false;
      }

      if (cleanDto.private === true || cleanDto.forbidden === true || cleanDto.broadcast === true) {
        cleanDto.canSendMsgs = false;
      }

      // A private channel is a live Telegram state and may be cleared on a
      // later verified refresh. `forbidden` remains durable.
      if (existing?.forbidden === true && cleanDto.forbidden === false) delete cleanDto.forbidden;

      const updatedChannel = await this.activeChannelModel
        .findOneAndUpdate(
          { channelId },
          {
            $set: { ...cleanDto, updatedAt: new Date() },
          },
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

      const normalizedFilter: Record<string, unknown> = { ...filter };

      // Guard against NoSQL operator injection: this endpoint takes a raw query object, so
      // an attacker could pass ?title[$ne]= or {$where:...} to bypass the filter / dump the
      // collection. Only allow flat scalar equality — reject $-prefixed keys and object/array
      // values (which is where operators like $ne/$gt/$regex/$where live).
      for (const [key, value] of Object.entries(normalizedFilter)) {
        if (key.startsWith('$')) {
          throw new BadRequestException(`Invalid search field: ${key}`);
        }
        if (value !== null && typeof value === 'object') {
          throw new BadRequestException(`Invalid search value for field: ${key}`);
        }
      }

      return await this.activeChannelModel.find(normalizedFilter).lean().exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to search channels');
    }
  }

  async getActiveChannels(limit = this.DEFAULT_LIMIT, skip = this.DEFAULT_SKIP, notIds: string[] = []): Promise<ActiveChannel[]> {
    try {
      // Positive keywords disabled — negative filter + quality filters are sufficient for channel selection
      // const positiveKeywords = [
      //   'wife', 'adult', 'lanj', 'lesb', 'paid', 'coupl', 'cpl', 'randi', 'bhab', 'boy', 'girl',
      //   'friend', 'frnd', 'boob', 'pussy', 'dating', 'swap', 'gay', 'sex', 'bitch', 'love', 'video',
      //   'service', 'real', 'call', 'desi', 'partner', 'hook', 'romance', 'flirt', 'single', 'chat',
      //   'meet', 'intimate', 'escort', 'night', 'fun', 'hot', 'sexy', 'lovers', 'connect', 'relationship'
      // ];

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

      const negativePattern = negativeKeywords.join('|');

      // Positive keyword match — disabled, negative filter + quality filters are sufficient
      // const positivePattern = positiveKeywords.join('|');
      // const positiveFilter = {
      //   $or: [
      //     { title: { $regex: positivePattern, $options: 'i' } },
      //     { username: { $regex: positivePattern, $options: 'i' } },
      //   ],
      // };

      const query = {
        $and: [
          // positiveFilter,
          {
            title: {
              $not: { $regex: negativePattern, $options: 'i' },
            },
          },
          {
            username: {
              $not: { $regex: negativePattern, $options: 'i' },
            },
          },
          {
            channelId: { $nin: notIds },
            participantsCount: { $gt: this.MIN_PARTICIPANTS_COUNT },
            username: { $ne: null },
            canSendMsgs: true,
            banned: { $ne: true },
            forbidden: { $ne: true },
            private: { $ne: true },
            broadcast: { $ne: true },
          },
        ],
      };

      const pipeline: PipelineStage[] = [
        { $match: query },
        // Deletion rate filter: skip channels with >15% deletion rate (min 5 total messages)
        {
          $match: {
            $or: [
              // Not enough data — allow
              { $expr: { $lt: [{ $add: [{ $ifNull: ['$successMsgCount', 0] }, { $ifNull: ['$deletedCount', 0] }] }, 5] } },
              // Deletion rate <= 15%
              { $expr: { $lte: [
                { $divide: [{ $ifNull: ['$deletedCount', 0] }, { $add: [{ $ifNull: ['$successMsgCount', 0] }, { $ifNull: ['$deletedCount', 0] }, 0.01] }] },
                0.15
              ] } },
            ],
          },
        },
        {
          $addFields: {
            sortScore: {
              $multiply: [
                { $rand: {} },
                // Reaction-enabled channels get full priority.
                { $cond: [{ $eq: ['$reactRestricted', true] }, 0.3, 1] },
                // Diversity weight: fewer clients joined = higher priority
                { $divide: [1, { $add: [{ $ifNull: ['$clientsJoined', 0] }, 1] }] },
              ],
            },
          },
        },
        { $sort: { sortScore: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { sortScore: 0 } },
      ];

      return await this.activeChannelModel.aggregate<ActiveChannel>(pipeline, { allowDiskUse: true }).exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch active channels');
    }
  }

  private copyDefinedFields(
    source: Partial<CreateActiveChannelDto>,
    target: Record<string, unknown>,
    fields: Array<keyof CreateActiveChannelDto>,
  ): void {
    for (const field of fields) {
      if (source[field] !== undefined) {
        target[field] = source[field];
      }
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
                unsendable: { $sum: { $cond: [
                  { $and: [
                    { $ne: ['$canSendMsgs', true] },
                    { $ne: ['$banned', true] },
                    { $ne: ['$forbidden', true] },
                    { $ne: ['$private', true] },
                    { $ne: ['$broadcast', true] },
                  ] },
                  1,
                  0,
                ] } },
                banned: { $sum: { $cond: [{ $eq: ['$banned', true] }, 1, 0] } },
                forbidden: { $sum: { $cond: [{ $eq: ['$forbidden', true] }, 1, 0] } },
                reactRestricted: { $sum: { $cond: [{ $eq: ['$reactRestricted', true] }, 1, 0] } },
                isPrivate: { $sum: { $cond: [{ $eq: ['$private', true] }, 1, 0] } },
                broadcast: { $sum: { $cond: [{ $eq: ['$broadcast', true] }, 1, 0] } },
                megagroup: { $sum: { $cond: [{ $eq: ['$megagroup', true] }, 1, 0] } },
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
                freeformDeletionChannels: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$freeformDeletedCount', 0] }, 0] }, 1, 0] } },
                followUpDeletionChannels: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$followUpDeletedCount', 0] }, 0] }, 1, 0] } },
                totalFreeformDeletions: { $sum: { $ifNull: ['$freeformDeletedCount', 0] } },
                totalFollowUpDeletions: { $sum: { $ifNull: ['$followUpDeletedCount', 0] } },
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
            { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, successMsgCount: 1, failureMsgCount: 1 } },
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
        unsendable: overview.unsendable || 0,
        banned: overview.banned || 0,
        forbidden: overview.forbidden || 0,
        reactRestricted: overview.reactRestricted || 0,
        private: overview.isPrivate || 0,
        broadcast: overview.broadcast || 0,
        megagroup: overview.megagroup || 0,
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
        freeformDeletionChannels: restrictStats.freeformDeletionChannels || 0,
        followUpDeletionChannels: restrictStats.followUpDeletionChannels || 0,
        totalFreeformDeletions: restrictStats.totalFreeformDeletions || 0,
        totalFollowUpDeletions: restrictStats.totalFollowUpDeletions || 0,
      },
      promos: {
        withPromos: promoCov.withPromos || 0,
        exhausted: promoCov.exhausted || 0,
        avgPromoCount: Math.round((promoCov.avgPromoCount || 0) * 10) / 10,
        totalPromos: promoCov.totalPromos || 0,
      },
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

    if (filter === 'can_send') { query.canSendMsgs = true; query.banned = { $ne: true }; query.forbidden = { $ne: true }; query.private = { $ne: true }; query.broadcast = { $ne: true }; }
    else if (filter === 'banned') { query.$or = [{ banned: true }, { forbidden: true }]; }
    else if (filter === 'unsendable') {
      query.canSendMsgs = { $ne: true };
      query.banned = { $ne: true };
      query.forbidden = { $ne: true };
      query.private = { $ne: true };
      query.broadcast = { $ne: true };
    }
    else if (filter === 'exhausted') { query.$expr = { $eq: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 0] }; }
    else if (filter === 'high_deleted') { query.deletedCount = { $gt: 30 }; }

    if (search?.trim()) {
      const q = search.trim();
      // Escape regex metacharacters so the term is matched literally (no ReDoS / wildcard over-match).
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchOr = [
        { title: { $regex: escaped, $options: 'i' } },
        { username: { $regex: escaped, $options: 'i' } },
        { channelId: q },
      ];
      // A filter (e.g. 'banned') may already have set query.$or. Don't overwrite it — combine
      // both $or groups under $and so the filter constraint is preserved alongside the search.
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
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

  async resetMessageDeletionCounters(): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Channel maint: reset message deletion counters`)}`);
      await this.activeChannelModel.updateMany(
        { banned: false },
        { $set: { freeformDeletedCount: 0, followUpDeletedCount: 0, updatedAt: new Date() } }
      );
    } catch (error) {
      throw this.handleError(error, 'Failed to reset message deletion counters');
    }
  }

  async resetAvailableMsgs(): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Channel maint: reset available messages`)}`);
      const availableMsgs = await this.getAvailableMessages();

      await this.activeChannelModel.updateMany(
        {
          $expr: {
            $lt: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 5],
          },
        },
        {
          $set: {
            freeformDeletedCount: 0,
            followUpDeletedCount: 0,
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
      await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Channel maint: update banned channels`)}`);
      await this.activeChannelModel.updateMany(
        { $or: [{ banned: true }, { private: true }] },
        {
          $set: {
            freeformDeletedCount: 0,
            followUpDeletedCount: 0,
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
      if (error instanceof NotFoundException || error?.status === 404) {
        return [];
      }
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
