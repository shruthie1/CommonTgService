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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotsService = exports.ChannelCategory = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const utils_1 = require("../../utils");
const bot_schema_1 = require("./schemas/bot.schema");
var ChannelCategory;
(function (ChannelCategory) {
    ChannelCategory["CLIENT_UPDATES"] = "CLIENT_UPDATES";
    ChannelCategory["USER_WARNINGS"] = "USER_WARNINGS";
    ChannelCategory["VC_WARNINGS"] = "VC_WARNINGS";
    ChannelCategory["USER_REQUESTS"] = "USER_REQUESTS";
    ChannelCategory["VC_NOTIFICATIONS"] = "VC_NOTIFICATIONS";
    ChannelCategory["CHANNEL_NOTIFICATIONS"] = "CHANNEL_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_NOTIFICATIONS"] = "ACCOUNT_NOTIFICATIONS";
    ChannelCategory["ACCOUNT_LOGIN_FAILURES"] = "ACCOUNT_LOGIN_FAILURES";
    ChannelCategory["PROMOTION_ACCOUNT"] = "PROMOTION_ACCOUNT";
    ChannelCategory["CLIENT_ACCOUNT"] = "CLIENT_ACCOUNT";
    ChannelCategory["PAYMENT_FAIL_QUERIES"] = "PAYMENT_FAIL_QUERIES";
    ChannelCategory["SAVED_MESSAGES"] = "SAVED_MESSAGES";
    ChannelCategory["HTTP_FAILURES"] = "HTTP_FAILURES";
    ChannelCategory["UNVDS"] = "UNVDS";
    ChannelCategory["PROM_LOGS1"] = "PROM_LOGS1";
    ChannelCategory["PROM_LOGS2"] = "PROM_LOGS2";
    ChannelCategory["UNAUTH_CALLS"] = "UNAUTH_CALLS";
})(ChannelCategory || (exports.ChannelCategory = ChannelCategory = {}));
let BotsService = class BotsService {
    constructor(botModel) {
        this.botModel = botModel;
    }
    async createBot(createBotDto) {
        const username = await this.fetchUsername(createBotDto.token);
        if (!username) {
            throw new Error('Invalid bot token or unable to fetch bot username');
        }
        const existingBot = await this.botModel.findOne({ token: createBotDto.token });
        if (existingBot) {
            throw new Error('Bot with this token already exists');
        }
        const createdBot = new this.botModel({
            ...createBotDto,
            username,
            lastUsed: new Date(),
            stats: {
                messagesSent: 0,
                photosSent: 0,
                videosSent: 0,
                documentsSent: 0,
                audiosSent: 0,
                voicesSent: 0,
                animationsSent: 0,
                stickersSent: 0,
                mediaGroupsSent: 0
            }
        });
        return createdBot.save();
    }
    async getBots(category) {
        if (category) {
            return this.botModel.find({ category }).exec();
        }
        return this.botModel.find().exec();
    }
    async getBotById(id) {
        const bot = await this.botModel.findById(id).exec();
        if (!bot) {
            throw new common_1.NotFoundException(`Bot with ID ${id} not found`);
        }
        return bot;
    }
    async updateBot(id, updateBotDto) {
        const bot = await this.botModel
            .findByIdAndUpdate(id, updateBotDto, { new: true })
            .exec();
        if (!bot) {
            throw new common_1.NotFoundException(`Bot with ID ${id} not found`);
        }
        return bot;
    }
    async deleteBot(id) {
        const result = await this.botModel.findByIdAndDelete(id).exec();
        if (!result) {
            throw new common_1.NotFoundException(`Bot with ID ${id} not found`);
        }
    }
    async sendByCategoryWithFailover(category, sender, ...args) {
        const availableBots = await this.botModel
            .find({ category })
            .sort({ lastUsed: 'asc' })
            .exec();
        if (availableBots.length === 0) {
            console.error(`No bots found for category: ${category}`);
            return false;
        }
        for (const bot of availableBots) {
            const success = await sender.call(this, bot.id, ...args);
            if (success) {
                await this.botModel.findByIdAndUpdate(bot.id, { lastUsed: new Date() });
                return true;
            }
            console.warn(`Sending via bot ${bot.username} for category ${category} failed. Trying next available bot.`);
        }
        console.error(`Failed to send for category ${category} after trying all ${availableBots.length} available bot(s).`);
        return false;
    }
    async sendMessageByCategory(category, message, options) {
        return this.sendByCategoryWithFailover(category, this.sendMessageByBotId, message, options);
    }
    async sendPhotoByCategory(category, photo, options) {
        return this.sendByCategoryWithFailover(category, this.sendPhotoByBotId, photo, options);
    }
    async sendVideoByCategory(category, video, options) {
        return this.sendByCategoryWithFailover(category, this.sendVideoByBotId, video, options);
    }
    async sendAudioByCategory(category, audio, options) {
        return this.sendByCategoryWithFailover(category, this.sendAudioByBotId, audio, options);
    }
    async sendDocumentByCategory(category, document, options) {
        return this.sendByCategoryWithFailover(category, this.sendDocumentByBotId, document, options);
    }
    async sendVoiceByCategory(category, voice, options) {
        return this.sendByCategoryWithFailover(category, this.sendVoiceByBotId, voice, options);
    }
    async sendAnimationByCategory(category, animation, options) {
        return this.sendByCategoryWithFailover(category, this.sendAnimationByBotId, animation, options);
    }
    async sendStickerByCategory(category, sticker, options) {
        return this.sendByCategoryWithFailover(category, this.sendStickerByBotId, sticker, options);
    }
    async sendMediaGroupByCategory(category, media, options) {
        return this.sendByCategoryWithFailover(category, this.sendMediaGroupByBotId, media, options);
    }
    async sendMessageByBotId(botId, message, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMessage(bot, message, options);
        if (success) {
            await this.updateBotStats(bot.id, 'messagesSent');
        }
        return success;
    }
    async sendPhotoByBotId(botId, photo, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendPhoto', photo, options);
        if (success) {
            await this.updateBotStats(bot.id, 'photosSent');
        }
        return success;
    }
    async sendVideoByBotId(botId, video, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVideo', video, options);
        if (success) {
            await this.updateBotStats(bot.id, 'videosSent');
        }
        return success;
    }
    async sendAudioByBotId(botId, audio, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAudio', audio, options);
        if (success) {
            await this.updateBotStats(bot.id, 'audiosSent');
        }
        return success;
    }
    async sendDocumentByBotId(botId, document, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendDocument', document, options);
        if (success) {
            await this.updateBotStats(bot.id, 'documentsSent');
        }
        return success;
    }
    async sendVoiceByBotId(botId, voice, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVoice', voice, options);
        if (success) {
            await this.updateBotStats(bot.id, 'voicesSent');
        }
        return success;
    }
    async sendAnimationByBotId(botId, animation, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAnimation', animation, options);
        if (success) {
            await this.updateBotStats(bot.id, 'animationsSent');
        }
        return success;
    }
    async sendStickerByBotId(botId, sticker, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendSticker', sticker, options);
        if (success) {
            await this.updateBotStats(bot.id, 'stickersSent');
        }
        return success;
    }
    async sendMediaGroupByBotId(botId, media, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMediaGroup(bot, media, options);
        if (success) {
            await this.updateBotStats(bot.id, 'mediaGroupsSent');
        }
        return success;
    }
    async executeSendMessage(bot, text, options) {
        try {
            const response = await axios_1.default.post(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
                chat_id: bot.channelId,
                text: `${process.env.clientId?.toUpperCase()}:\n\n${text}`,
                parse_mode: options?.parseMode,
                disable_web_page_preview: options?.disableWebPagePreview,
                disable_notification: options?.disableNotification,
                reply_to_message_id: options?.replyToMessageId,
                allow_sending_without_reply: options?.allowSendingWithoutReply,
                protect_content: options?.protectContent,
                link_preview_options: options?.linkPreviewOptions,
            }, { timeout: 10000 });
            if (!response.data?.ok) {
                console.error(`Telegram API error for sendMessage with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        }
        catch (error) {
            (0, utils_1.parseError)(error, `Failed to execute sendMessage for bot ${bot.username}`);
            return false;
        }
    }
    async executeSendMedia(bot, method, media, options = {}) {
        const formData = new form_data_1.default();
        formData.append('chat_id', bot.channelId);
        const mediaField = method.replace('send', '').toLowerCase();
        if (Buffer.isBuffer(media)) {
            formData.append(mediaField, media, `${mediaField}.${this.getDefaultExtension(mediaField)}`);
        }
        else {
            formData.append(mediaField, media);
        }
        if (options.caption) {
            formData.append('caption', `${process.env.clientId?.toUpperCase()}:\n\n${options.caption}`);
        }
        if (options.parseMode)
            formData.append('parse_mode', options.parseMode);
        if (options.disableNotification)
            formData.append('disable_notification', 'true');
        if (options.replyToMessageId)
            formData.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply)
            formData.append('allow_sending_without_reply', 'true');
        if (options.protectContent)
            formData.append('protect_content', 'true');
        if (options.hasSpoiler)
            formData.append('has_spoiler', 'true');
        this.addMethodSpecificOptions(method, options, formData);
        try {
            const response = await axios_1.default.post(`https://api.telegram.org/bot${bot.token}/${method}`, formData, { timeout: 30000, headers: formData.getHeaders() });
            if (!response.data?.ok) {
                console.error(`Telegram API error for ${method} with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        }
        catch (error) {
            (0, utils_1.parseError)(error, `Failed to execute ${method} for bot ${bot.username}`);
            return false;
        }
    }
    async executeSendMediaGroup(bot, media, options) {
        const formData = new form_data_1.default();
        formData.append('chat_id', bot.channelId);
        const mediaArray = media.map((item, i) => {
            const mediaObj = {
                type: item.type,
                media: Buffer.isBuffer(item.media) ? `attach://file${i}` : item.media,
            };
            if (item.caption)
                mediaObj.caption = `${process.env.clientId?.toUpperCase()}:\n\n${item.caption}`;
            if (item.parseMode)
                mediaObj.parse_mode = item.parseMode;
            if (item.hasSpoiler)
                mediaObj.has_spoiler = true;
            if (item.type === 'video') {
                if (item.duration)
                    mediaObj.duration = item.duration;
                if (item.width)
                    mediaObj.width = item.width;
                if (item.height)
                    mediaObj.height = item.height;
                if (item.supportsStreaming)
                    mediaObj.supports_streaming = true;
            }
            if (item.type === 'audio') {
                if (item.duration)
                    mediaObj.duration = item.duration;
                if (item.performer)
                    mediaObj.performer = item.performer;
                if (item.title)
                    mediaObj.title = item.title;
            }
            if (Buffer.isBuffer(item.media)) {
                const filename = item.extension ? `file${i}.${item.extension}` : `file${i}.${this.getDefaultExtension(item.type)}`;
                formData.append(`file${i}`, item.media, filename);
            }
            if (item.thumbnail && Buffer.isBuffer(item.thumbnail)) {
                mediaObj.thumbnail = `attach://thumb${i}`;
                formData.append(`thumb${i}`, item.thumbnail, `thumb${i}.jpg`);
            }
            return mediaObj;
        });
        formData.append('media', JSON.stringify(mediaArray));
        if (options) {
            if (options.disableNotification)
                formData.append('disable_notification', 'true');
            if (options.replyToMessageId)
                formData.append('reply_to_message_id', options.replyToMessageId.toString());
            if (options.allowSendingWithoutReply)
                formData.append('allow_sending_without_reply', 'true');
            if (options.protectContent)
                formData.append('protect_content', 'true');
        }
        try {
            const response = await axios_1.default.post(`https://api.telegram.org/bot${bot.token}/sendMediaGroup`, formData, { timeout: 30000, headers: formData.getHeaders() });
            if (!response.data?.ok) {
                console.error(`Telegram API error for sendMediaGroup with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        }
        catch (error) {
            (0, utils_1.parseError)(error, `Failed to execute sendMediaGroup for bot ${bot.username}`);
            return false;
        }
    }
    async fetchUsername(token) {
        if (!token || typeof token !== 'string' || token.length < 10) {
            return '';
        }
        try {
            const res = await axios_1.default.get(`https://api.telegram.org/bot${token}/getMe`, {
                timeout: 5000
            });
            return res.data?.ok ? res.data.result.username : '';
        }
        catch (error) {
            (0, utils_1.parseError)(error, 'Failed fetching bot username:');
            return '';
        }
    }
    async updateBotStats(botId, statField) {
        await this.botModel.findByIdAndUpdate(botId, {
            $inc: { [`stats.${statField}`]: 1 },
            lastUsed: new Date(),
        });
    }
    getDefaultExtension(type) {
        switch (type) {
            case 'photo': return 'jpg';
            case 'video': return 'mp4';
            case 'audio': return 'mp3';
            case 'document': return 'bin';
            default: return 'dat';
        }
    }
    addMethodSpecificOptions(method, options, formData) {
        if (method === 'sendVideo' || method === 'sendAnimation') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
            if (options.width)
                formData.append('width', options.width.toString());
            if (options.height)
                formData.append('height', options.height.toString());
            if (options.supportsStreaming)
                formData.append('supports_streaming', 'true');
        }
        if (method === 'sendAudio') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
            if (options.performer)
                formData.append('performer', options.performer);
            if (options.title)
                formData.append('title', options.title);
        }
        if (options.thumbnail) {
            if (Buffer.isBuffer(options.thumbnail)) {
                formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
            }
            else {
                formData.append('thumbnail', options.thumbnail);
            }
        }
        if (method === 'sendDocument' && options.disableContentTypeDetection) {
            formData.append('disable_content_type_detection', 'true');
        }
        if (method === 'sendVoice' || method === 'sendVideoNote') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
        }
        if (method === 'sendVideoNote' && options.length) {
            formData.append('length', options.length.toString());
        }
        if (method === 'sendSticker' && options.emoji) {
            formData.append('emoji', options.emoji);
        }
    }
    async getBotStatsByCategory(category) {
        const stats = await this.botModel.aggregate([
            { $match: { category } },
            {
                $group: {
                    _id: '$category',
                    totalBots: { $sum: 1 },
                    totalMessagesSent: { $sum: '$stats.messagesSent' },
                    totalPhotosSent: { $sum: '$stats.photosSent' },
                    totalVideosSent: { $sum: '$stats.videosSent' },
                    totalDocumentsSent: { $sum: '$stats.documentsSent' },
                    totalAudiosSent: { $sum: '$stats.audiosSent' },
                    totalMediaGroupsSent: { $sum: '$stats.mediaGroupsSent' },
                    avgFailedAttempts: { $avg: '$failedAttempts' }
                }
            }
        ]);
        return stats[0] || { _id: category, totalBots: 0 };
    }
};
exports.BotsService = BotsService;
exports.BotsService = BotsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(bot_schema_1.Bot.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], BotsService);
//# sourceMappingURL=bots.service.js.map