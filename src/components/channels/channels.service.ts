// src/channels/channels.service.ts
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel, ChannelDocument } from './schemas/channel.schema';
@Injectable()
export class ChannelsService {
  constructor(
    @InjectModel(Channel.name) private ChannelModel: Model<ChannelDocument>,
  ) { console.log(Channel.name) }

  async create(createChannelDto: CreateChannelDto): Promise<Channel> {
    const createdChannel = new this.ChannelModel(createChannelDto);
    return createdChannel.save();
  }

  async createMultiple(createChannelDtos: CreateChannelDto[]): Promise<string> {
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
    let query = {
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
          {
            '$or':
              [
                { title: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
                { username: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
              ]
          },
          {
            '$or': [
              { title: { '$not': { '$regex': /online|realestat|propert|board|design|realt|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i } } },
              { username: { '$not': { '$regex': /online|realestat|propert|board|design|realt|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i } } },
            ]
          },
          {
            channelId: { '$nin': notIds },
            participantsCount: { $gt: 1000 },
            username: { "$ne": null },
            private: false,
            banned: false,
            canSendMsgs: true,
            forbidden: false
          }
        ]
    }

    const sort: Record<string, 1 | -1> = notIds.length > 300 && false ? { randomField: 1 } : { participantsCount: -1 }
    try {
      const result: Channel[] = await this.ChannelModel.aggregate([
        { $match: query },
        { $skip: skip },
        { $limit: limit },
        { $addFields: { randomField: { $rand: {} } } }, // Add a random field
        { $sort: sort }, // Sort by the random field
        { $project: { randomField: 0 } } // Remove the random field from the output
      ]).exec();
      return result;
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  }
}
