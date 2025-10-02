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
                const cleanDto = Object.fromEntries(Object.entries(dto).filter(([_, value]) => value !== undefined && value !== null));
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
            return await this.activeChannelModel.aggregate(pipeline).exec();
        }
        catch (error) {
            throw this.handleError(error, 'Failed to fetch active channels');
        }
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
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for Reset Word Restrictions`);
            await this.activeChannelModel.updateMany({ banned: false }, { $set: { wordRestriction: 0, dMRestriction: 0, updatedAt: new Date() } });
        }
        catch (error) {
            throw this.handleError(error, 'Failed to reset word restrictions');
        }
    }
    async resetAvailableMsgs() {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for Reset Available Messages`);
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
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for Update Banned Channels`);
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