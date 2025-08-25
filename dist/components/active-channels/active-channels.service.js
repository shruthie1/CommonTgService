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
let ActiveChannelsService = class ActiveChannelsService {
    constructor(activeChannelModel, promoteMsgsService) {
        this.activeChannelModel = activeChannelModel;
        this.promoteMsgsService = promoteMsgsService;
    }
    async create(createActiveChannelDto) {
        createActiveChannelDto.availableMsgs = Object.keys(await this.promoteMsgsService.findOne());
        const createdChannel = new this.activeChannelModel(createActiveChannelDto);
        return createdChannel.save();
    }
    async createMultiple(createChannelDtos) {
        const bulkOps = createChannelDtos.map((dto) => ({
            updateOne: {
                filter: { channelId: dto.channelId },
                update: { $set: dto },
                upsert: true
            }
        }));
        await this.activeChannelModel.bulkWrite(bulkOps, { ordered: false });
        return 'Channels Saved';
    }
    async findAll() {
        return this.activeChannelModel.find().exec();
    }
    async findOne(channelId) {
        const channel = (await this.activeChannelModel.findOne({ channelId }).exec())?.toJSON();
        return channel;
    }
    async update(channelId, updateActiveChannelDto) {
        delete updateActiveChannelDto["_id"];
        const updatedChannel = await this.activeChannelModel.findOneAndUpdate({ channelId }, { $set: updateActiveChannelDto }, { new: true, upsert: true }).exec();
        return updatedChannel;
    }
    async removeFromAvailableMsgs(channelId, msg) {
        return await this.activeChannelModel.findOneAndUpdate({ channelId }, { $pull: { availableMsgs: msg } });
    }
    async addToAvailableMsgs(channelId, msg) {
        return await this.activeChannelModel.findOneAndUpdate({ channelId }, { $addToSet: { availableMsgs: msg } });
    }
    async remove(channelId) {
        const result = await this.activeChannelModel.findOneAndDelete({ channelId }).exec();
    }
    async search(filter) {
        console.log(filter);
        return this.activeChannelModel.find(filter).exec();
    }
    async getActiveChannels(limit = 50, skip = 0, notIds = []) {
        const query = {
            '$and': [
                {
                    '$or': [
                        { title: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
                        { username: { '$regex': /wife|adult|lanj|lesb|paid|coupl|cpl|randi|bhab|boy|girl|friend|frnd|boob|pussy|dating|swap|gay|sex|bitch|love|video|service|real|call|desi/i } },
                    ]
                },
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
                    participantsCount: { $gt: 600 },
                    username: { $ne: null },
                    canSendMsgs: true,
                    restricted: false,
                    banned: false,
                    forbidden: false
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
            const result = await this.activeChannelModel.aggregate(pipeline).exec();
            return result;
        }
        catch (error) {
            console.error('Error:', error);
            return [];
        }
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
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
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async resetWordRestrictions() {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for Reset Available Msgs`);
        try {
            await this.activeChannelModel.updateMany({
                banned: false
            }, {
                $set: {
                    "wordRestriction": 0,
                    "dMRestriction": 0
                }
            });
        }
        catch (e) {
            console.log((0, parseError_1.parseError)(e));
        }
    }
    async resetAvailableMsgs() {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for Reset Available Msgs`);
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
            });
        }
        catch (e) {
            console.log((0, parseError_1.parseError)(e));
        }
    }
    async updateBannedChannels() {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Request Received for update banned Channels`);
        await this.activeChannelModel.updateMany({ $or: [{ banned: true }, { private: true }] }, {
            $set: {
                "wordRestriction": 0,
                "dMRestriction": 0,
                banned: false,
                "private": false
            }
        });
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