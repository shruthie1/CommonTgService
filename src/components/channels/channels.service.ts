import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { SearchChannelDto } from './dto/search-channel.dto';
import { Channel, ChannelDocument } from './schemas/channel.schema';
import { PipelineStage } from 'mongoose';
import { ChannelCategory } from '../bots';
import { getBotsServiceInstance } from '../../utils';
import {
  BAN_GUARDED_FIELDS,
  buildDurableChannelUpsertPipeline,
  castUpdateFields,
  guardedChangeRefused,
  isOperatorBan,
  keepOnOperatorBan,
} from '../../utils/telegram-utils/durable-channel-upsert';
import { normalizeTelegramChannelId } from '../../utils/telegram-utils/channel-live-facts';
import { ChannelIntelligenceReadService } from '../active-channels/channel-intelligence-read.service';
import { channelNameAllowedFilter, computeChannelNameDenied, NAME_DENIED_PIPELINE_STAGE } from './channel-name-deny';

/**
 * Pipeline twin of `$setOnInsert: {createdAt}`: an upsert pipeline runs before Mongo adds `_id`, so
 * a missing `_id` means this write inserts the row. Existing rows keep their createdAt (or its
 * absence). Mongoose timestamps add only updatedAt to pipeline updates.
 */
export const CREATED_AT_ON_INSERT_STAGE = {
  $set: { createdAt: { $cond: [{ $eq: [{ $type: '$_id' }, 'missing'] }, '$$NOW', '$createdAt'] } },
};

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

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
      nameDenied: computeChannelNameDenied(createChannelDto.title, createChannelDto.username),
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
      // `forbidden` may be asserted but is never durable: a live "can send" observation clears it.
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
          // Last stage recomputes nameDenied from the merged title/username (see channel-name-deny).
          update: [...buildDurableChannelUpsertPipeline(setFields, defaults, dto), NAME_DENIED_PIPELINE_STAGE, CREATED_AT_ON_INSERT_STAGE],
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

  /**
   * Updates an EXISTING row only (owner 2026-11-20): never upserts, so a write for an unknown
   * channel cannot create a title-less stub. Rows are created only by create/createMultiple.
   *
   * One atomic pipeline write. The operator-ban guard (banned + bannedAt) is evaluated inside the
   * write against the stored row, never from an earlier read: on an operator-banned row, banned
   * and bannedAt keep their stored values and canSendMsgs stays false; every other field lands.
   * (A filter-only guard needs a second write for the other fields, and an unban between the two
   * writes loses the update; Codex review 2026-11-20.) nameDenied is recomputed in the same write
   * from the merged title/username. Values are cast by the schema first: a pipeline skips Mongoose
   * casting.
   *
   * Logs: `channel-update kind=no_row`, `channel-update kind=skip reason=banned`.
   */
  async update(channelId: string, updateChannelDto: UpdateChannelDto): Promise<Channel | null> {
    const key = this.channelKey(channelId);
    // Validate the normalized key: '  ' or '-100' normalize to '' and would target a blank-id row.
    if (!key) throw new BadRequestException('Channel ID is required');
    // Bound the write to known fields — never let a caller set _id/channelId or unknown keys.
    const update = castUpdateFields(this.ChannelModel, Object.fromEntries(
      Object.entries((updateChannelDto ?? {}) as Record<string, unknown>)
        .filter(([field, value]) => value !== undefined && this.writableFields.has(field)),
    ));
    if (update.private === true || update.forbidden === true || update.banned === true) {
      update.canSendMsgs = false;
    }

    if (!Object.keys(update).length) {
      const row = await this.ChannelModel.findOne({ channelId: key }).exec();
      if (!row) this.logger.warn(`channel-update kind=no_row channel=${key.slice(-4)}`);
      return row ?? null;
    }

    const set: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(update)) {
      set[field] = BAN_GUARDED_FIELDS.has(field) ? keepOnOperatorBan(field, value) : { $literal: value };
    }
    const stages: PipelineStage.Set[] = [{ $set: set }];
    if (update.title !== undefined || update.username !== undefined) {
      stages.push(NAME_DENIED_PIPELINE_STAGE as PipelineStage.Set);
    }
    const updated = await this.ChannelModel.findOneAndUpdate(
      { channelId: key },
      stages,
      { returnDocument: 'after', updatePipeline: true },
    ).exec();

    if (!updated) {
      this.logger.warn(`channel-update kind=no_row channel=${key.slice(-4)}`);
      return null;
    }
    if (isOperatorBan(updated) && guardedChangeRefused(update, updated)) {
      this.logger.warn(`channel-update kind=skip reason=banned channel=${key.slice(-4)}`);
    }
    return updated;
  }

  /**
   * Flag an existing channel as approval-only (a join returned INVITE_REQUEST_SENT). Never
   * upserts: a channel absent from this collection stays absent. Additive fields only.
   */
  async markJoinRequestRequired(channelId: string): Promise<void> {
    if (!channelId) return;
    await this.ChannelModel.updateOne(
      { channelId: this.channelKey(channelId) },
      { $set: { joinRequestRequired: true, joinRequestSeenAt: new Date() } },
    ).exec();
  }

  /** Deletes the one row with this exact channelId; true when a row was deleted. A blank id deletes nothing. */
  async remove(channelId: string): Promise<boolean> {
    const key = this.channelKey(channelId);
    if (!key) {
      this.logger.warn('channel-dead kind=skip reason=no_channel_id');
      return false;
    }
    const botsService = getBotsServiceInstance();
    if (botsService) {
      botsService.sendMessageByCategory(
        ChannelCategory.PROM_LOGS2,
        { title: 'Removing Channel', fields: [{ label: 'Channel', value: channelId }] },
      );
    }
    const deleted = await this.ChannelModel.findOneAndDelete({ channelId: key }).exec();
    return Boolean(deleted);
  }

  /**
   * GET /channels/search. min/maxParticipantsCount are DTO-only names (no such field), so they are
   * mapped to a participantsCount range instead of being passed through as a filter that matches
   * nothing.
   */
  async search(filter: SearchChannelDto): Promise<Channel[]> {
    const { minParticipantsCount, maxParticipantsCount, ...rest } = (filter ?? {}) as SearchChannelDto & Record<string, unknown>;
    const query: Record<string, unknown> = { ...rest };
    // Query-string values arrive as strings; blank or non-numeric bounds are ignored.
    const bound = (value: unknown): number | undefined => {
      if (value === undefined || value === null || String(value).trim() === '') return undefined;
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    };
    const range: Record<string, number> = {};
    const min = bound(minParticipantsCount);
    const max = bound(maxParticipantsCount);
    if (min !== undefined) range.$gte = min;
    if (max !== undefined) range.$lte = max;
    if (Object.keys(range).length) query.participantsCount = range;
    return this.ChannelModel.find(query).exec();
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
            title: { $exists: true, $type: "string", $ne: '' },
            username: { $exists: true, $type: "string", $ne: '' },
          },
          // Name deny-list: precomputed `nameDenied` when present, regex fallback for legacy docs.
          channelNameAllowedFilter(),
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
