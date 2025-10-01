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

        const cleanDto = Object.fromEntries(
          Object.entries(dto).filter(([_, value]) => value !== undefined && value !== null)
        );

        return {
          updateOne: {
            filter: { channelId: dto.channelId },
            update: {
              $set: {
                title: { $ifNull: [dto.title, '$title'] },
                username: { $ifNull: [dto.username, '$username'] },
                participantsCount: { $ifNull: [dto.participantsCount, '$participantsCount'] },
                updatedAt: new Date(),
              },
              $setOnInsert: {
                channelId: dto.channelId,
                broadcast: false,
                canSendMsgs: true,
                participantsCount: cleanDto.participantsCount ?? 0,
                restricted: false,
                sendMessages: true,
                reactRestricted: false,
                wordRestriction: 0,
                dMRestriction: 0,
                availableMsgs: [],
                banned: false,
                megagroup: cleanDto.megagroup ?? true,
                private: false,
                createdAt: new Date(),
              },
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

      return await this.activeChannelModel.aggregate<ActiveChannel>(pipeline).exec();
    } catch (error) {
      throw this.handleError(error, 'Failed to fetch active channels');
    }
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
      await fetchWithTimeout(`${notifbot()}&text=Request Received for Reset Word Restrictions`);
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
      await fetchWithTimeout(`${notifbot()}&text=Request Received for Reset Available Messages`);
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
      await fetchWithTimeout(`${notifbot()}&text=Request Received for Update Banned Channels`);
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
    parseError(error);
    if (error instanceof BadRequestException) {
      return error;
    }
    return new InternalServerErrorException(`${message}: ${error.message}`);
  }
}