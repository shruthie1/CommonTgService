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
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const active_channel_schema_1 = require("./schemas/active-channel.schema");
let ActiveChannelsService = class ActiveChannelsService {
    constructor(activeChannelModel) {
        this.activeChannelModel = activeChannelModel;
    }
    async create(createActiveChannelDto) {
        const createdChannel = new this.activeChannelModel(createActiveChannelDto);
        return createdChannel.save();
    }
    async findAll() {
        return this.activeChannelModel.find().exec();
    }
    async findOne(channelId) {
        const channel = await this.activeChannelModel.findOne({ channelId }).exec();
        return channel;
    }
    async update(channelId, updateActiveChannelDto) {
        const updatedChannel = await this.activeChannelModel.findOneAndUpdate({ channelId }, { $set: updateActiveChannelDto }, { new: true, upsert: true }).exec();
        return updatedChannel;
    }
    async remove(channelId) {
        const result = await this.activeChannelModel.findOneAndDelete({ channelId }).exec();
    }
    async search(filter) {
        console.log(filter);
        return this.activeChannelModel.find(filter).exec();
    }
    async addReactions(channelId, reactions) {
        const channel = await this.activeChannelModel.findOneAndUpdate({ channelId }, {
            $addToSet: { availableMsgs: reactions }
        });
        return channel;
    }
    async getRandomReaction(channelId) {
        const channel = await this.activeChannelModel.findOne({ channelId }).exec();
        if (!channel) {
            return undefined;
        }
        if (channel.reactions.length === 0) {
            return undefined;
        }
        const randomIndex = Math.floor(Math.random() * channel.reactions.length);
        return channel.reactions[randomIndex];
    }
    async removeReaction(channelId, reaction) {
        const channel = await this.activeChannelModel.findOneAndUpdate({ channelId }, {
            $pull: { reactions: reaction }
        });
        return channel;
    }
    async getActiveChannels(limit = 50, skip = 0, keywords = [], notIds = []) {
        const pattern = new RegExp(keywords.join('|'), 'i');
        const notPattern = new RegExp('online|board|class|PROFIT|wholesale|retail|topper|exam|motivat|medico|shop|follower|insta|traini|cms|cma|subject|currency|color|amity|game|gamin|like|earn|popcorn|TANISHUV|bitcoin|crypto|mall|work|folio|health|civil|win|casino|shop|promot|english|invest|fix|money|book|anim|angime|support|cinema|bet|predic|study|youtube|sub|open|trad|cric|quot|exch|movie|search|film|offer|ott|deal|quiz|academ|insti|talkies|screen|series|webser', "i");
        let query = {
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
            const result = await this.activeChannelModel.find(query).sort(sort).skip(skip).limit(limit).exec();
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
            const queryExec = this.activeChannelModel.find(query);
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
};
exports.ActiveChannelsService = ActiveChannelsService;
exports.ActiveChannelsService = ActiveChannelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(active_channel_schema_1.ActiveChannel.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ActiveChannelsService);
//# sourceMappingURL=activechannels.service.js.map