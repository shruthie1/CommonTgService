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

@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel(Channel.name) private ChannelModel: Model<ChannelDocument>,
  ) {
  }

  async create(createChannelDto: CreateChannelDto): Promise<Channel> {
    const createdChannel = new this.ChannelModel(createChannelDto);
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
        channelId: dto.channelId,
        broadcast: false,
        canSendMsgs: false,
        participantsCount: 0,
        reactRestricted: false,
        availableMsgs: [],
        banned: false,
        bannedAt: null,
        megagroup: true,
        private: false,
      };

      return {
        updateOne: {
          filter: { channelId: dto.channelId },
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
    const channel = (await this.ChannelModel.findOne({ channelId }).exec())?.toJSON();
    return channel;
  }

  /** See ActiveChannelsService.findExistingChannelIds. */
  async findExistingChannelIds(channelIds: string[]): Promise<string[]> {
    const ids = [...new Set(channelIds.filter((channelId) => typeof channelId === 'string' && channelId.trim()))];
    if (!ids.length) return [];
    const rows = await this.ChannelModel
      .find({ channelId: { $in: ids } }, { channelId: 1, _id: 0 })
      .lean()
      .exec();
    return rows.map((row) => row.channelId).filter((channelId): channelId is string => Boolean(channelId));
  }

  async update(channelId: string, updateChannelDto: UpdateChannelDto): Promise<Channel> {
    const existing = await this.ChannelModel.findOne({ channelId }).lean().exec();
    const update = { ...updateChannelDto } as Record<string, unknown>;
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
      { channelId },
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
    const result = await this.ChannelModel.findOneAndDelete({ channelId }).exec();
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
                  '$not': { '$regex': /online|realestat|propert|freefire|bgmi|promo|agent|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i }
                }
              },
              {
                username:
                {
                  $exists: true,
                  $type: "string",
                  '$not': { '$regex': /online|freefire|bgmi|promo|agent|realestat|propert|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i }
                }
              },
            ]
          },
          {
            channelId: { '$nin': notIds },
            participantsCount: { $gt: 1000 },
            username: { $ne: null },
            canSendMsgs: true,
            banned: { $ne: true },
            forbidden: { $ne: true },
            private: { $ne: true },
            broadcast: { $ne: true }
          }
        ]
    }

    try {

      const pipeline: PipelineStage[] = [
        { $match: query },
        {
          $addFields: {
            sortScore: {
              $multiply: [
                { $rand: {} },
                { $cond: [{ $eq: ['$reactRestricted', true] }, 0.3, 1] },
                { $divide: [1, { $add: [{ $ifNull: ['$clientsJoined', 0] }, 1] }] },
              ],
            },
          },
        },
        { $sort: { sortScore: -1 as const } },
        { $skip: skip },
        { $limit: limit },
        { $project: { sortScore: 0 } }
      ];
      const result: Channel[] = await this.ChannelModel.aggregate<Channel>(pipeline, { allowDiskUse: true }).exec();
      return result;
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
