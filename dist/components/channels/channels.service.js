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
exports.ChannelsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const channel_schema_1 = require("./schemas/channel.schema");
const bots_1 = require("../bots");
const utils_1 = require("../../utils");
let ChannelsService = class ChannelsService {
    constructor(ChannelModel) {
        this.ChannelModel = ChannelModel;
    }
    async create(createChannelDto) {
        const createdChannel = new this.ChannelModel(createChannelDto);
        return createdChannel.save();
    }
    async createMultiple(createChannelDtos) {
        const bulkOps = createChannelDtos.map((dto) => {
            const setFields = {};
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
        await this.ChannelModel.bulkWrite(bulkOps, { ordered: false });
        return 'Channels Saved';
    }
    async findAll() {
        return this.ChannelModel.find().exec();
    }
    async findOne(channelId) {
        const channel = (await this.ChannelModel.findOne({ channelId }).exec())?.toJSON();
        return channel;
    }
    async update(channelId, updateChannelDto) {
        const updatedChannel = await this.ChannelModel.findOneAndUpdate({ channelId }, { $set: updateChannelDto }, { new: true, upsert: true }).exec();
        return updatedChannel;
    }
    async remove(channelId) {
        const botsService = (0, utils_1.getBotsServiceInstance)();
        if (botsService) {
            botsService.sendMessageByCategory(bots_1.ChannelCategory.PROM_LOGS2, `Removing Channel: ${channelId}`);
        }
        const result = await this.ChannelModel.findOneAndDelete({ channelId }).exec();
    }
    async search(filter) {
        console.log(filter);
        return this.ChannelModel.find(filter).exec();
    }
    async getChannels(limit = 50, skip = 0, keywords = [], notIds = []) {
        const pattern = new RegExp(keywords.join('|'), 'i');
        const notPattern = new RegExp('online|board|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser', "i");
        const query = {
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
        const sort = { participantsCount: "desc" };
        try {
            const result = await this.ChannelModel.find(query).sort(sort).skip(skip).limit(limit).exec();
            return result;
        }
        catch (error) {
            console.error('Error:', error);
            return [];
        }
    }
    async executeQuery(query, sort, limit) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.ChannelModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async getActiveChannels(limit = 50, skip = 0, notIds = []) {
        const query = {
            '$and': [
                {
                    '$and': [
                        {
                            title: {
                                $exists: true,
                                $type: "string",
                                '$not': { '$regex': /online|realestat|propert|freefire|bgmi|promo|agent|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i }
                            }
                        },
                        {
                            username: {
                                $exists: true,
                                $type: "string",
                                '$not': { '$regex': /online|freefire|bgmi|promo|agent|realestat|propert|board|design|realt|clas|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser/i }
                            }
                        },
                    ]
                },
                {
                    channelId: { '$nin': notIds },
                    participantsCount: { $gt: 1000 },
                    username: { $ne: null },
                    canSendMsgs: true,
                    restricted: false,
                }
            ]
        };
        try {
            const pipeline = [
                { $match: query },
                { $addFields: { randomField: { $rand: {} } } },
                { $sort: { randomField: 1 } },
                { $skip: skip },
                { $limit: limit },
                { $project: { randomField: 0 } }
            ];
            const result = await this.ChannelModel.aggregate(pipeline, { allowDiskUse: true }).exec();
            return result;
        }
        catch (error) {
            console.error('🔴 Aggregation Error:', error);
            return [];
        }
    }
};
exports.ChannelsService = ChannelsService;
exports.ChannelsService = ChannelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(channel_schema_1.Channel.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ChannelsService);
//# sourceMappingURL=channels.service.js.map