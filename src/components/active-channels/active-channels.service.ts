import { PromoteMsgsService } from './../promote-msgs/promote-msgs.service';
// src/activechannels/activechannels.service.ts
import { BadRequestException, Inject, Injectable, InternalServerErrorException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateActiveChannelDto } from './dto/create-active-channel.dto';
import { UpdateActiveChannelDto } from './dto/update-active-channel.dto';
import { ActiveChannel, ActiveChannelDocument } from './schemas/active-channel.schema';
import { parseError } from '../../utils';
@Injectable()
export class ActiveChannelsService {
  constructor(
    @InjectModel(ActiveChannel.name) private activeChannelModel: Model<ActiveChannelDocument>,
    @Inject(forwardRef(() => PromoteMsgsService))
    private promoteMsgsService: PromoteMsgsService
  ) { }

  async create(createActiveChannelDto: CreateActiveChannelDto): Promise<ActiveChannel> {
    const createdChannel = new this.activeChannelModel(createActiveChannelDto);
    return createdChannel.save();
  }

  async findAll(): Promise<ActiveChannel[]> {
    return this.activeChannelModel.find().exec();
  }

  async findOne(channelId: string): Promise<ActiveChannel> {
    const channel = await this.activeChannelModel.findOne({ channelId }).exec();
    return channel;
  }

  async update(channelId: string, updateActiveChannelDto: UpdateActiveChannelDto): Promise<ActiveChannel> {
    delete updateActiveChannelDto["_id"]
    const updatedChannel = await this.activeChannelModel.findOneAndUpdate(
      { channelId },
      { $set: updateActiveChannelDto },
      { new: true, upsert: true },
    ).exec();
    return updatedChannel;
  }

  async remove(channelId: string): Promise<void> {
    const result = await this.activeChannelModel.findOneAndDelete({ channelId }).exec();
  }

  async search(filter: any): Promise<ActiveChannel[]> {
    console.log(filter)
    return this.activeChannelModel.find(filter).exec();
  }

  async addReactions(channelId: string, reactions: string[]): Promise<ActiveChannel> {
    const channel = await this.activeChannelModel.findOneAndUpdate({ channelId }, {
      $addToSet: { availableMsgs: reactions }
    })
    return channel;
  }

  async getRandomReaction(channelId: string): Promise<string> {
    const channel = await this.activeChannelModel.findOne({ channelId }).exec();
    if (!channel) {
      return undefined;
    }
    if (channel.reactions.length === 0) {
      return undefined;
    }
    const randomIndex = Math.floor(Math.random() * channel.reactions.length);
    return channel.reactions[randomIndex];
  }

  async removeReaction(channelId: string, reaction: string): Promise<ActiveChannel> {
    const channel = await this.activeChannelModel.findOneAndUpdate({ channelId }, {
      $pull: { reactions: reaction }
    })
    return channel;
  }

  async getActiveChannels(limit = 50, skip = 0, keywords = [], notIds = []) {
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
      const result: ActiveChannel[] = await this.activeChannelModel.find(query).sort(sort).skip(skip).limit(limit).exec();
      return result;
    } catch (error) {
      console.error('Error:', error);
      return [];
    }
  }

  async executeQuery(query: any, sort?: any, limit?: number, skip?: number): Promise<ActiveChannel[]> {
    try {
      if (!query) {
        throw new BadRequestException('Query is invalid.');
      }
      const queryExec = this.activeChannelModel.find(query);

      if (sort) {
        queryExec.sort(sort);
      }

      if (limit) {
        queryExec.limit(limit);
      }

      if (skip) {
        queryExec.skip(skip);
      }

      return await queryExec.exec();
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async resetAvailableMsgs() {
    try {
      const data = await this.promoteMsgsService.findOne();
      const keys = Object.keys(data);
      await this.activeChannelModel.updateMany({
        $expr: {
          $lt: [{ $size: { $ifNull: ["$availableMsgs", []] } }, 5]
        }
      }, {
        $set: {
          "wordRestriction": 0,
          "dMRestriction": 0,
          "banned": false,
          "availableMsgs": keys
        }
      })
    } catch (e) {
      console.log(parseError(e))
    }
  }

  async updateBannedChannels() {
    await this.activeChannelModel.updateMany({ banned: true }, {
      $set: {
        "wordRestriction": 0,
        "dMRestriction": 0,
        banned: false,
        "availableMsgs": [
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
          "14",
          "15",
          "16"
        ]
      }
    })
  }

  async updateDefaultReactions() {
    await this.activeChannelModel.updateMany({}, {
      $set: {
        reactions: [
          '❤', '🔥', '👏', '🥰', '😁', '🤔',
          '🤯', '😱', '🤬', '😢', '🎉', '🤩',
          '🤮', '💩', '🙏', '👌', '🕊', '🤡',
          '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
          '🤣', '💔', '🏆', '😭', '😴', '👍',
          '🌚', '⚡', '🍌', '😐', '💋', '👻',
          '👀', '🙈', '🤝', '🤗', '🆒',
          '🗿', '🙉', '🙊', '🤷', '👎'
        ]
      }
    })
  }
}
