import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel, ChannelDocument } from './schemas/channel.schema';
import { PipelineStage } from 'mongoose';

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

  async createMultiple(createChannelDtos: Partial<CreateChannelDto[]>): Promise<string> {
    const bulkOps = createChannelDtos.map((dto) => ({
      updateOne: {
        filter: { channelId: dto.channelId },
        update: { $set: dto },
        upsert: true
      }
    }));

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

  async update(channelId: string, updateChannelDto: UpdateChannelDto): Promise<Channel> {
    const updatedChannel = await this.ChannelModel.findOneAndUpdate(
      { channelId },
      { $set: updateChannelDto },
      { new: true, upsert: true },
    ).exec();
    return updatedChannel;
  }

  async remove(channelId: string): Promise<void> {
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
          sendMessages: false,
          broadcast: false,
          restricted: false
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
            // banned: false,
            restricted: false,
            forbidden: false
          }
        ]
    }

    try {

      const pipeline: PipelineStage[] = [
        { $match: query },
        { $addFields: { randomField: { $rand: {} } } },
        { $sort: { randomField: 1 as const } },
        { $skip: skip },
        { $limit: limit },
        { $project: { randomField: 0 } }
      ];
      const result: Channel[] = await this.ChannelModel.aggregate<Channel>(pipeline).exec();
      return result;
    } catch (error) {
      console.error('🔴 Aggregation Error:', error);
      return [];
    }

  }
}
