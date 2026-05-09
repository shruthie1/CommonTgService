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
exports.ActiveChannelsService = void 0;
const promote_msgs_service_1 = require("./../promote-msgs/promote-msgs.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const active_channel_schema_1 = require("./schemas/active-channel.schema");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const utils_1 = require("../../utils");
const bots_1 = require("../bots");
let ActiveChannelsService = class ActiveChannelsService {
    constructor(activeChannelModel, promoteMsgsService) {
        this.activeChannelModel = activeChannelModel;
        this.promoteMsgsService = promoteMsgsService;
        this.DEFAULT_LIMIT = 50;
        this.DEFAULT_SKIP = 0;
        this.MIN_PARTICIPANTS_COUNT = 600;
    }
    async create(createActiveChannelDto) {
        try {
            if (!createActiveChannelDto.channelId) {
                throw new common_1.BadRequestException('Channel ID is required');
            }
            const availableMsgs = await this.getAvailableMessages();
            const createdChannel = new this.activeChannelModel({
                ...createActiveChannelDto,
                availableMsgs,
                createdAt: new Date(),
            });
            return await createdChannel.save();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to create channel');
        }
    }
    async createMultiple(createChannelDtos) {
        try {
            if (!createChannelDtos?.length) {
                throw new common_1.BadRequestException('At least one channel DTO is required');
            }
            const bulkOps = createChannelDtos.map((dto) => {
                if (!dto.channelId) {
                    throw new common_1.BadRequestException('Channel ID is required for all DTOs');
                }
                const setFields = { updatedAt: new Date() };
                if (dto.title != null)
                    setFields.title = dto.title;
                if (dto.username != null)
                    setFields.username = dto.username;
                if (dto.participantsCount != null)
                    setFields.participantsCount = dto.participantsCount;
                if (dto.megagroup !== undefined)
                    setFields.megagroup = dto.megagroup;
                const defaults = {
                    channelId: dto.channelId,
                    broadcast: false,
                    canSendMsgs: true,
                    participantsCount: 0,
                    restricted: false,
                    sendMessages: true,
                    reactRestricted: false,
                    wordRestriction: 0,
                    dMRestriction: 0,
                    availableMsgs: [],
                    banned: false,
                    megagroup: true,
                    private: false,
                    createdAt: new Date(),
                };
                for (const key of Object.keys(setFields)) {
                    delete defaults[key];
                }
                return {
                    updateOne: {
                        filter: { channelId: dto.channelId },
                        update: {
                            $set: setFields,
                            $setOnInsert: defaults,
                        },
                        upsert: true,
                    },
                };
            });
            await this.activeChannelModel.bulkWrite(bulkOps, { ordered: false });
            return `Successfully processed ${createChannelDtos.length} channels`;
        }
        catch (error) {
            throw this.handleError(error, 'Failed to create multiple channels');
        }
    }
    async findAll() {
        try {
            return await this.activeChannelModel.find().lean().exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to fetch all channels');
        }
    }
    async findOne(channelId) {
        try {
            if (!channelId) {
                throw new common_1.BadRequestException('Channel ID is required');
            }
            return await this.activeChannelModel.findOne({ channelId }).lean().exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to fetch channel');
        }
    }
    async update(channelId, updateActiveChannelDto) {
        try {
            delete updateActiveChannelDto["_id"];
            if (!channelId) {
                throw new common_1.BadRequestException('Channel ID is required');
            }
            const cleanDto = Object.fromEntries(Object.entries(updateActiveChannelDto).filter(([_, value]) => value !== undefined));
            if (Object.keys(cleanDto).length === 0) {
                throw new common_1.BadRequestException('At least one field to update is required');
            }
            const updatedChannel = await this.activeChannelModel
                .findOneAndUpdate({ channelId }, { $set: { ...cleanDto, updatedAt: new Date() } }, { new: true, upsert: true, lean: true })
                .exec();
            return updatedChannel;
        }
        catch (error) {
            throw this.handleError(error, 'Failed to update channel');
        }
    }
    async removeFromAvailableMsgs(channelId, msg) {
        try {
            if (!channelId || !msg) {
                throw new common_1.BadRequestException('Channel ID and message are required');
            }
            return await this.activeChannelModel
                .findOneAndUpdate({ channelId }, { $pull: { availableMsgs: msg }, $set: { updatedAt: new Date() } }, { new: true, lean: true })
                .exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to remove message from available messages');
        }
    }
    async addToAvailableMsgs(channelId, msg) {
        try {
            if (!channelId || !msg) {
                throw new common_1.BadRequestException('Channel ID and message are required');
            }
            return await this.activeChannelModel
                .findOneAndUpdate({ channelId }, { $addToSet: { availableMsgs: msg }, $set: { updatedAt: new Date() } }, { new: true, lean: true })
                .exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to add message to available messages');
        }
    }
    async remove(channelId) {
        try {
            if (!channelId) {
                throw new common_1.BadRequestException('Channel ID is required');
            }
            const botsService = (0, utils_1.getBotsServiceInstance)();
            if (botsService) {
                await botsService.sendMessageByCategory(bots_1.ChannelCategory.PROM_LOGS2, `Removing Active Channel: ${channelId}`);
            }
            await this.activeChannelModel.findOneAndDelete({ channelId }).exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to remove channel');
        }
    }
    async search(filter) {
        try {
            if (!filter || Object.keys(filter).length === 0) {
                throw new common_1.BadRequestException('Search filter is required');
            }
            return await this.activeChannelModel.find(filter).lean().exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to search channels');
        }
    }
    async getActiveChannels(limit = this.DEFAULT_LIMIT, skip = this.DEFAULT_SKIP, notIds = []) {
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
                        deletedCount: { $lte: 30 },
                        canSendMsgs: true,
                        restricted: false,
                        banned: false,
                        forbidden: false,
                    },
                ],
            };
            const pipeline = [
                { $match: query },
                { $addFields: { randomField: { $rand: {} } } },
                { $sort: { randomField: 1 } },
                { $skip: skip },
                { $limit: limit },
                { $project: { randomField: 0 } },
            ];
            return await this.activeChannelModel.aggregate(pipeline, { allowDiskUse: true }).exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to fetch active channels');
        }
    }
    async analytics() {
        const [result] = await this.activeChannelModel.aggregate([
            {
                $facet: {
                    overview: [
                        {
                            $group: {
                                _id: null,
                                total: { $sum: 1 },
                                canSend: { $sum: { $cond: [{ $eq: ['$canSendMsgs', true] }, 1, 0] } },
                                restricted: { $sum: { $cond: [{ $eq: ['$restricted', true] }, 1, 0] } },
                                banned: { $sum: { $cond: [{ $eq: ['$banned', true] }, 1, 0] } },
                                forbidden: { $sum: { $cond: [{ $eq: ['$forbidden', true] }, 1, 0] } },
                                tempBan: { $sum: { $cond: [{ $eq: ['$tempBan', true] }, 1, 0] } },
                                reactRestricted: { $sum: { $cond: [{ $eq: ['$reactRestricted', true] }, 1, 0] } },
                                isPrivate: { $sum: { $cond: [{ $eq: ['$private', true] }, 1, 0] } },
                                broadcast: { $sum: { $cond: [{ $eq: ['$broadcast', true] }, 1, 0] } },
                                megagroup: { $sum: { $cond: [{ $eq: ['$megagroup', true] }, 1, 0] } },
                                starred: { $sum: { $cond: [{ $eq: ['$starred', true] }, 1, 0] } },
                                withUsername: { $sum: { $cond: [{ $and: [{ $ne: ['$username', null] }, { $ne: ['$username', ''] }] }, 1, 0] } },
                            },
                        },
                    ],
                    messageStats: [
                        {
                            $group: {
                                _id: null,
                                totalSent: { $sum: { $ifNull: ['$successMsgCount', 0] } },
                                totalFailed: { $sum: { $ifNull: ['$failureMsgCount', 0] } },
                                totalDeleted: { $sum: { $ifNull: ['$deletedCount', 0] } },
                                followupSent: { $sum: { $ifNull: ['$followupMsgSuccessCount', 0] } },
                                followupFailed: { $sum: { $ifNull: ['$followupMsgFailureCount', 0] } },
                                channelsWithSends: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$successMsgCount', 0] }, 0] }, 1, 0] } },
                                channelsWithFailures: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$failureMsgCount', 0] }, 0] }, 1, 0] } },
                                channelsWithDeleted: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$deletedCount', 0] }, 0] }, 1, 0] } },
                                avgSent: { $avg: { $ifNull: ['$successMsgCount', 0] } },
                                avgFailed: { $avg: { $ifNull: ['$failureMsgCount', 0] } },
                            },
                        },
                    ],
                    participantStats: [
                        {
                            $group: {
                                _id: null,
                                totalParticipants: { $sum: { $ifNull: ['$participantsCount', 0] } },
                                avgParticipants: { $avg: { $ifNull: ['$participantsCount', 0] } },
                                maxParticipants: { $max: { $ifNull: ['$participantsCount', 0] } },
                                above10k: { $sum: { $cond: [{ $gte: [{ $ifNull: ['$participantsCount', 0] }, 10000] }, 1, 0] } },
                                above1k: { $sum: { $cond: [{ $gte: [{ $ifNull: ['$participantsCount', 0] }, 1000] }, 1, 0] } },
                                below600: { $sum: { $cond: [{ $lt: [{ $ifNull: ['$participantsCount', 0] }, 600] }, 1, 0] } },
                            },
                        },
                    ],
                    restrictionStats: [
                        {
                            $group: {
                                _id: null,
                                wordRestricted: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$wordRestriction', 0] }, 0] }, 1, 0] } },
                                dmRestricted: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$dMRestriction', 0] }, 0] }, 1, 0] } },
                                totalWordRestrictions: { $sum: { $ifNull: ['$wordRestriction', 0] } },
                                totalDmRestrictions: { $sum: { $ifNull: ['$dMRestriction', 0] } },
                            },
                        },
                    ],
                    promoCoverage: [
                        {
                            $group: {
                                _id: null,
                                withPromos: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 0] }, 1, 0] } },
                                exhausted: { $sum: { $cond: [{ $eq: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 0] }, 1, 0] } },
                                avgPromoCount: { $avg: { $size: { $ifNull: ['$availableMsgs', []] } } },
                                totalPromos: { $sum: { $size: { $ifNull: ['$availableMsgs', []] } } },
                            },
                        },
                    ],
                    errorBreakdown: [
                        { $match: { lastErrorType: { $ne: null, $exists: true } } },
                        { $group: { _id: '$lastErrorType', count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 15 },
                    ],
                    successRateDist: [
                        {
                            $match: {
                                $expr: {
                                    $gt: [{ $add: [{ $ifNull: ['$successMsgCount', 0] }, { $ifNull: ['$failureMsgCount', 0] }] }, 0],
                                },
                            },
                        },
                        {
                            $addFields: {
                                _rate: {
                                    $multiply: [
                                        { $divide: [{ $ifNull: ['$successMsgCount', 0] }, { $add: [{ $ifNull: ['$successMsgCount', 0] }, { $ifNull: ['$failureMsgCount', 0] }] }] },
                                        100,
                                    ],
                                },
                            },
                        },
                        {
                            $bucket: {
                                groupBy: '$_rate',
                                boundaries: [0, 20, 40, 60, 80, 101],
                                default: 'other',
                                output: { count: { $sum: 1 } },
                            },
                        },
                    ],
                    topBySuccess: [
                        { $match: { successMsgCount: { $gt: 0 } } },
                        { $sort: { successMsgCount: -1 } },
                        { $limit: 10 },
                        { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, successMsgCount: 1, failureMsgCount: 1, deletedCount: 1 } },
                    ],
                    topByFailure: [
                        { $match: { failureMsgCount: { $gt: 0 } } },
                        { $sort: { failureMsgCount: -1 } },
                        { $limit: 10 },
                        { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, successMsgCount: 1, failureMsgCount: 1, lastErrorType: 1 } },
                    ],
                    topByDeleted: [
                        { $match: { deletedCount: { $gt: 0 } } },
                        { $sort: { deletedCount: -1 } },
                        { $limit: 10 },
                        { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, deletedCount: 1, successMsgCount: 1 } },
                    ],
                    topByParticipants: [
                        { $sort: { participantsCount: -1 } },
                        { $limit: 10 },
                        { $project: { channelId: 1, title: 1, username: 1, participantsCount: 1, successMsgCount: 1, canSendMsgs: 1, banned: 1 } },
                    ],
                },
            },
        ]).allowDiskUse(true).exec();
        const overview = result.overview[0] || {};
        const msgStats = result.messageStats[0] || {};
        const partStats = result.participantStats[0] || {};
        const restrictStats = result.restrictionStats[0] || {};
        const promoCov = result.promoCoverage[0] || {};
        const totalAttempts = (msgStats.totalSent || 0) + (msgStats.totalFailed || 0);
        return {
            overview: {
                total: overview.total || 0,
                canSend: overview.canSend || 0,
                restricted: overview.restricted || 0,
                banned: overview.banned || 0,
                forbidden: overview.forbidden || 0,
                tempBan: overview.tempBan || 0,
                reactRestricted: overview.reactRestricted || 0,
                private: overview.isPrivate || 0,
                broadcast: overview.broadcast || 0,
                megagroup: overview.megagroup || 0,
                starred: overview.starred || 0,
                withUsername: overview.withUsername || 0,
            },
            messages: {
                totalSent: msgStats.totalSent || 0,
                totalFailed: msgStats.totalFailed || 0,
                totalDeleted: msgStats.totalDeleted || 0,
                followupSent: msgStats.followupSent || 0,
                followupFailed: msgStats.followupFailed || 0,
                successRate: totalAttempts > 0 ? Math.round(((msgStats.totalSent || 0) / totalAttempts) * 100) : 0,
                channelsWithSends: msgStats.channelsWithSends || 0,
                channelsWithFailures: msgStats.channelsWithFailures || 0,
                channelsWithDeleted: msgStats.channelsWithDeleted || 0,
                avgSent: Math.round(msgStats.avgSent || 0),
                avgFailed: Math.round(msgStats.avgFailed || 0),
            },
            participants: {
                total: partStats.totalParticipants || 0,
                average: Math.round(partStats.avgParticipants || 0),
                max: partStats.maxParticipants || 0,
                above10k: partStats.above10k || 0,
                above1k: partStats.above1k || 0,
                below600: partStats.below600 || 0,
            },
            restrictions: {
                wordRestricted: restrictStats.wordRestricted || 0,
                dmRestricted: restrictStats.dmRestricted || 0,
                totalWordRestrictions: restrictStats.totalWordRestrictions || 0,
                totalDmRestrictions: restrictStats.totalDmRestrictions || 0,
            },
            promos: {
                withPromos: promoCov.withPromos || 0,
                exhausted: promoCov.exhausted || 0,
                avgPromoCount: Math.round((promoCov.avgPromoCount || 0) * 10) / 10,
                totalPromos: promoCov.totalPromos || 0,
            },
            errorBreakdown: (result.errorBreakdown || []).map((e) => ({
                error: e._id,
                count: e.count,
            })),
            successRateDistribution: (result.successRateDist || []).map((b) => ({
                range: b._id === 'other' ? 'other' : `${b._id}-${b._id + 20}%`,
                count: b.count,
            })),
            topBySuccess: result.topBySuccess || [],
            topByFailure: result.topByFailure || [],
            topByDeleted: result.topByDeleted || [],
            topByParticipants: result.topByParticipants || [],
        };
    }
    async paginated(options) {
        const { page = 1, limit = 50, sortBy = 'successMsgCount', sortOrder = 'desc', search, filter = 'all', } = options;
        const pageNum = Math.max(1, Math.floor(page));
        const limitNum = Math.min(Math.max(1, Math.floor(limit)), 200);
        const skip = (pageNum - 1) * limitNum;
        const query = {};
        if (filter === 'can_send') {
            query.canSendMsgs = true;
            query.restricted = { $ne: true };
            query.banned = { $ne: true };
            query.forbidden = { $ne: true };
        }
        else if (filter === 'restricted')
            query.restricted = true;
        else if (filter === 'banned') {
            query.$or = [{ banned: true }, { forbidden: true }];
        }
        else if (filter === 'temp_banned')
            query.tempBan = true;
        else if (filter === 'with_errors') {
            query.lastErrorType = { $ne: null, $exists: true };
        }
        else if (filter === 'exhausted') {
            query.$expr = { $eq: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 0] };
        }
        else if (filter === 'high_deleted') {
            query.deletedCount = { $gt: 30 };
        }
        if (search?.trim()) {
            const q = search.trim();
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { username: { $regex: q, $options: 'i' } },
                { channelId: q },
            ];
        }
        const total = await this.activeChannelModel.countDocuments(query).exec();
        const totalPages = Math.ceil(total / limitNum);
        if (total === 0) {
            return { channels: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
        }
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
        const channels = await this.activeChannelModel
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .lean()
            .exec();
        return { channels: channels, total, page: pageNum, limit: limitNum, totalPages };
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query || Object.keys(query).length === 0) {
                throw new common_1.BadRequestException('Query is required');
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
        }
        catch (error) {
            throw this.handleError(error, 'Failed to execute query');
        }
    }
    async resetWordRestrictions() {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Channel Maintenance\n\nAction: Reset Word Restrictions\nStatus: Processing`)}`);
            await this.activeChannelModel.updateMany({ banned: false }, { $set: { wordRestriction: 0, dMRestriction: 0, updatedAt: new Date() } });
        }
        catch (error) {
            throw this.handleError(error, 'Failed to reset word restrictions');
        }
    }
    async resetAvailableMsgs() {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Channel Maintenance\n\nAction: Reset Available Messages\nStatus: Processing`)}`);
            const availableMsgs = await this.getAvailableMessages();
            await this.activeChannelModel.updateMany({
                $expr: {
                    $lt: [{ $size: { $ifNull: ['$availableMsgs', []] } }, 5],
                },
            }, {
                $set: {
                    wordRestriction: 0,
                    dMRestriction: 0,
                    banned: false,
                    availableMsgs,
                    updatedAt: new Date(),
                },
            });
        }
        catch (error) {
            throw this.handleError(error, 'Failed to reset available messages');
        }
    }
    async updateBannedChannels() {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Channel Maintenance\n\nAction: Update Banned Channels\nStatus: Processing`)}`);
            await this.activeChannelModel.updateMany({ $or: [{ banned: true }, { private: true }] }, {
                $set: {
                    wordRestriction: 0,
                    dMRestriction: 0,
                    banned: false,
                    private: false,
                    updatedAt: new Date(),
                },
            });
        }
        catch (error) {
            throw this.handleError(error, 'Failed to update banned channels');
        }
    }
    async getAvailableMessages() {
        try {
            const data = await this.promoteMsgsService.findOne();
            return Object.keys(data || {});
        }
        catch (error) {
            throw this.handleError(error, 'Failed to fetch available messages');
        }
    }
    handleError(error, message) {
        (0, parseError_1.parseError)(error, message);
        if (error instanceof common_1.BadRequestException) {
            return error;
        }
        return new common_1.InternalServerErrorException(`${message}: ${error.message}`);
    }
};
exports.ActiveChannelsService = ActiveChannelsService;
exports.ActiveChannelsService = ActiveChannelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(active_channel_schema_1.ActiveChannel.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => promote_msgs_service_1.PromoteMsgsService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        promote_msgs_service_1.PromoteMsgsService])
], ActiveChannelsService);
//# sourceMappingURL=active-channels.service.js.map