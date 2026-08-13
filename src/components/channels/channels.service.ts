import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel, ChannelDocument } from './schemas/channel.schema';
import { PipelineStage } from 'mongoose';
import { ChannelCategory } from '../bots';
import { getBotsServiceInstance } from '../../utils';
import { buildDurableChannelUpsertPipeline } from '../../utils/telegram-utils/durable-channel-upsert';
import { normalizeTelegramChannelId } from '../../utils/telegram-utils/channel-live-facts';
import { ChannelIntelligenceReadService } from '../active-channels/channel-intelligence-read.service';

@Injectable()
export class ChannelsService {
  /**
   * Fields a caller may write through `update()`. Mirrors ActiveChannelsService.writableFields.
   *
   * `update()` previously did a raw `$set` of the whole DTO, so ANY caller-supplied key landed in
   * the document — including `_id` and `channelId` (which would move the doc's identity out from
   * under its own filter on an upsert) and any stray/typo'd field, which then silently accumulates
   * as schema drift. The durable-flag guards below are kept; this only bounds WHICH keys are set.
   */
  private readonly writableFields = new Set([
    'title', 'username', 'participantsCount', 'broadcast', 'canSendMsgs',
    'megagroup', 'availableMsgs', 'banned', 'bannedAt', 'forbidden',
    'private', 'reactRestricted', 'reactRestrictedAt',
  ]);

  /**
   * Canonical channelId key for the `channels` collection — same shared normalizer the
   * activeChannels service and both tg-platform apps use, so one chat is always one document
   * regardless of whether the caller passed `-100123`, `-123`, `123` or a padded id.
   */
  private channelKey(channelId: string | number): string {
    const raw = String(channelId ?? '').trim();
    // normalizeTelegramChannelId is a strict VALIDATOR (returns '' for anything not a plain
    // positive integer). Never blank the key — that would retarget the query at another document.
    return normalizeTelegramChannelId(raw) || raw.replace(/^-100/, '').replace(/^-/, '');
  }

  constructor(
    @InjectModel(Channel.name) private ChannelModel: Model<ChannelDocument>,
    private readonly channelIntelligenceReadService: ChannelIntelligenceReadService,
  ) {
  }

  async create(createChannelDto: CreateChannelDto): Promise<Channel> {
    const createdChannel = new this.ChannelModel({
      ...createChannelDto,
      channelId: this.channelKey(createChannelDto.channelId),
    });
    return createdChannel.save();
  }


  async createMultiple(createChannelDtos: Partial<CreateChannelDto>[]): Promise<string> {
    if (!createChannelDtos?.length) {
      throw new BadRequestException('At least one channel DTO is required');
    }

    const bulkOps = createChannelDtos.map((dto) => {
      if (!dto.channelId) {
        throw new BadRequestException('Channel ID is required for all DTOs');
      }

      const setFields: Record<string, unknown> = {};
      this.copyDefinedFields(dto, setFields, [
        'title',
        'username',
        'participantsCount',
        'megagroup',
        'broadcast',
        'canSendMsgs',
        'reactRestricted',
      ]);
      // `private` is a live Telegram fact and is refreshed both ways.
      if (typeof dto.private === 'boolean') setFields.private = dto.private;
      // `forbidden` remains a durable safety stop until explicitly cleared.
      if (dto.forbidden === true) setFields.forbidden = true;
      if (dto.banned === true) {
        setFields.banned = true;
        setFields.bannedAt = dto.bannedAt ?? Date.now();
      }

      const defaults: Record<string, unknown> = {
        channelId: this.channelKey(dto.channelId),
        broadcast: false,
        canSendMsgs: false,
        participantsCount: 0,
        reactRestricted: false,
        availableMsgs: [],
        banned: false,
        bannedAt: null,
        // `megagroup` deliberately NOT defaulted — see active-channels.service. Defaulting it to
        // `true` invented a supergroup claim for an unobserved channel AND made the doc pass the
        // consumer-side critical-field check, so it never self-healed. Absent = "unknown", which
        // is the truth and lets hydration fill in the real value.
        private: false,
      };

      return {
        updateOne: {
          filter: { channelId: this.channelKey(dto.channelId) },
          update: buildDurableChannelUpsertPipeline(setFields, defaults, dto),
          upsert: true,
        },
      };
    });

    await this.ChannelModel.bulkWrite(bulkOps, { ordered: false });
    return 'Channels Saved';
  }
  async findAll(): Promise<Channel[]> {
    return this.ChannelModel.find().exec();
  }

  async findOne(channelId: string): Promise<Channel> {
    const channel = (await this.ChannelModel.findOne({ channelId: this.channelKey(channelId) }).exec())?.toJSON();
    return channel;
  }

  /** See ActiveChannelsService.findExistingChannelIds. */
  async findExistingChannelIds(channelIds: string[]): Promise<string[]> {
    const ids = [...new Set(
      channelIds
        .filter((channelId) => typeof channelId === 'string' && channelId.trim())
        .map((channelId) => this.channelKey(channelId))
        .filter(Boolean),
    )];
    if (!ids.length) return [];
    const rows = await this.ChannelModel
      .find({ channelId: { $in: ids } }, { channelId: 1, _id: 0 })
      .lean()
      .exec();
    return rows.map((row) => row.channelId).filter((channelId): channelId is string => Boolean(channelId));
  }

  async update(channelId: string, updateChannelDto: UpdateChannelDto): Promise<Channel> {
    const existing = await this.ChannelModel.findOne({ channelId: this.channelKey(channelId) }).lean().exec();
    // Bound the write to known fields — never let a caller set _id/channelId or unknown keys.
    const update: Record<string, unknown> = Object.fromEntries(
      Object.entries(updateChannelDto as Record<string, unknown>)
        .filter(([key]) => this.writableFields.has(key)),
    );
    if (
      (existing?.banned === true || existing?.forbidden === true)
      && update.canSendMsgs === true
    ) {
      update.canSendMsgs = false;
    }
    if (existing?.banned === true && update.banned === false) delete update.banned;
    if (existing?.forbidden === true && update.forbidden === false) delete update.forbidden;
    if (update.private === true || update.forbidden === true || update.banned === true) {
      update.canSendMsgs = false;
    }
    const updatedChannel = await this.ChannelModel.findOneAndUpdate(
      { channelId: this.channelKey(channelId) },
      { $set: update },
      { new: true, upsert: true },
    ).exec();
    return updatedChannel;
  }

  async remove(channelId: string): Promise<void> {
    const botsService = getBotsServiceInstance();
    if (botsService) {
      botsService.sendMessageByCategory(
        ChannelCategory.PROM_LOGS2,
        `Removing channel ${channelId}`,
        { parseMode: 'HTML' }
      );
    }
    const result = await this.ChannelModel.findOneAndDelete({ channelId: this.channelKey(channelId) }).exec();
  }

  async search(filter: any): Promise<Channel[]> {
    console.log(filter)
    return this.ChannelModel.find(filter).exec();
  }

  async getChannels(limit = 50, skip = 0, keywords = [], notIds = []) {

    const pattern = new RegExp(keywords.join('|'), 'i');
    const notPattern = new RegExp('online|board|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser', "i")
    const query = {
      $and: [
        { username: { $ne: null } },
        {
          $or: [
            { title: { $regex: pattern } },
            { username: { $regex: pattern } }
          ]
        },
        {
          username: {
            $not: {
              $regex: "^(" + notIds.map(id => "(?i)" + id?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))?.join("|") + ")$"
            }
          }
        },
        {
          title: { $not: { $regex: notPattern } }
        },
        {
          username: { $not: { $regex: notPattern } }
        },
        {
          canSendMsgs: true,
          broadcast: { $ne: true },
          banned: { $ne: true },
          forbidden: { $ne: true },
          private: { $ne: true }
        }
      ]
    };

    const sort: { participantsCount: "desc" } = { participantsCount: "desc" };
    try {
      const result: Channel[] = await this.ChannelModel.find(query).sort(sort).skip(skip).limit(limit).exec();
      return result;
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  }

  async executeQuery(query: any, sort?: any, limit?: number): Promise<Channel[]> {
    try {
      if (!query) {
        throw new BadRequestException('Query is invalid.');
      }
      const queryExec = this.ChannelModel.find(query);
      if (sort) {
        queryExec.sort(sort);
      }

      if (limit) {
        queryExec.limit(limit);
      }

      return await queryExec.exec();
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async getActiveChannels(limit = 50, skip = 0, notIds = []) {
    if (limit <= 0) return [];
    const queryLimit = Math.min(Math.max(limit * 3, limit), 100);

    const query = {
      '$and':
        [
          // {
          //   '$or':
          //     [
          //       { title: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
          //       { username: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
          //     ]
          // },
          {
            '$and': [
              {
                title: {
                  $exists: true,
                  $type: "string",
                  $ne: '',
                  '$not': { '$regex': /online|realestat|propert|freefire|bgmi|promo|agent|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i }
                }
              },
              {
                username:
                {
                  $exists: true,
                  $type: "string",
                  $ne: '',
                  '$not': { '$regex': /online|freefire|bgmi|promo|agent|realestat|propert|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i }
                }
              },
            ]
          },
          {
            channelId: { '$nin': notIds },
            participantsCount: { $gt: 1000 },
            canSendMsgs: true,
            banned: { $ne: true },
            forbidden: { $ne: true },
            private: { $ne: true },
            broadcast: { $ne: true }
          }
        ]
    }

    try {

      const prior = await this.channelIntelligenceReadService.getFleetPrior();

      const buildPipeline = (sortStages: PipelineStage[]): PipelineStage[] => [
        { $match: query },
        ...sortStages,
        { $sort: { sortScore: -1 as const } },
        { $skip: skip },
        { $limit: queryLimit },
        { $project: { sortScore: 0 } }
      ];

      let result: Channel[];
      let usedRandomFallback = false;
      try {
        // Conversion-aware, stateless sort (spec 2026-08-01) — same shared helper as ActiveChannelsService.
        const pipeline = buildPipeline(this.channelIntelligenceReadService.buildConversionAwareSortStages(prior));
        result = await this.ChannelModel.aggregate<Channel>(pipeline, { allowDiskUse: true }).exec();
      } catch (sortError) {
        // Fail-open (spec 2026-08-01, Error handling): degrade to random-only selection if the
        // conversion-aware aggregation ($lookup) errors, rather than starving the join pipeline.
        // error-level: a persistent fallback silently disables the conversion tilt fleet-wide.
        console.error(
          `Conversion-aware sort failed — falling back to RANDOM-ONLY selection (conversion tilt disabled this query): ${sortError instanceof Error ? sortError.message : sortError}`,
        );
        const fallbackPipeline = buildPipeline(this.channelIntelligenceReadService.buildRandomOnlySortStages());
        result = await this.ChannelModel.aggregate<Channel>(fallbackPipeline, { allowDiskUse: true }).exec();
        usedRandomFallback = true;
      }

      // The random fallback intentionally avoids the lookup that failed above, so
      // run the same hard exclusion as a separate fail-open safety gate only here.
      if (usedRandomFallback && result.length) {
        const candidateIds = result
          .map((channel: any) => channel.channelId)
          .filter((channelId: any): channelId is string => Boolean(channelId));
        let excludedIds: Set<string> = new Set();
        try {
          excludedIds = await this.channelIntelligenceReadService.getExcludedChannelIds(candidateIds);
        } catch (excludeError) {
          console.warn(
            `getExcludedChannelIds failed, skipping exclusion (fail-open): ${excludeError instanceof Error ? excludeError.message : excludeError}`,
          );
        }
        if (excludedIds.size) {
          return result
            .filter((channel: any) => !excludedIds.has(String(channel.channelId)))
            .slice(0, limit);
        }
      }

      return result.slice(0, limit);
    } catch (error) {
      console.error('🔴 Aggregation Error:', error);
      return [];
    }

  }

  private copyDefinedFields(
    source: Partial<CreateChannelDto>,
    target: Record<string, unknown>,
    fields: Array<keyof CreateChannelDto>,
  ): void {
    for (const field of fields) {
      if (source[field] !== undefined) {
        target[field] = source[field];
      }
    }
  }

}
