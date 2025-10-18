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
const node_cache_1 = __importDefault(require("node-cache"));
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
    ChannelCategory["ACCOUNT_LOGINS"] = "ACCOUNT_LOGINS";
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
        this.flushInterval = 300000;
        this.maxPendingUpdates = 100;
        this.cache = new node_cache_1.default({ stdTTL: 300, checkperiod: 60 });
    }
    async onModuleInit() {
        await this.initializeCache();
        this.startPeriodicFlush();
    }
    async initializeCache() {
        try {
            const bots = await this.botModel.find().lean().exec();
            const botsByCategory = bots.reduce((acc, bot) => {
                if (!acc[bot.category]) {
                    acc[bot.category] = [];
                }
                acc[bot.category].push(bot);
                return acc;
            }, {});
            for (const category in botsByCategory) {
                const sortedBots = botsByCategory[category].sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
                this.cache.set(`category:${category}`, sortedBots);
                sortedBots.forEach(bot => this.cache.set(`bot:${bot._id}`, bot));
            }
            console.log('Bot cache initialized with', Object.keys(botsByCategory).length, 'categories');
        }
        catch (error) {
            console.error('Failed to initialize bot cache:', error);
        }
    }
    startPeriodicFlush() {
        setInterval(async () => {
            await this.flushPendingStats();
        }, this.flushInterval);
    }
    async flushPendingStats() {
        const pendingUpdates = this.cache.get('pendingStats') || {};
        if (Object.keys(pendingUpdates).length === 0) {
            return;
        }
        try {
            const bulkOps = Object.entries(pendingUpdates).map(([botId, updates]) => ({
                updateOne: {
                    filter: { _id: botId },
                    update: {
                        $inc: {
                            ...(updates.messagesSent ? { 'stats.messagesSent': updates.messagesSent } : {}),
                            ...(updates.photosSent ? { 'stats.photosSent': updates.photosSent } : {}),
                            ...(updates.videosSent ? { 'stats.videosSent': updates.videosSent } : {}),
                            ...(updates.documentsSent ? { 'stats.documentsSent': updates.documentsSent } : {}),
                            ...(updates.audiosSent ? { 'stats.audiosSent': updates.audiosSent } : {}),
                            ...(updates.voicesSent ? { 'stats.voicesSent': updates.voicesSent } : {}),
                            ...(updates.animationsSent ? { 'stats.animationsSent': updates.animationsSent } : {}),
                            ...(updates.stickersSent ? { 'stats.stickersSent': updates.stickersSent } : {}),
                            ...(updates.mediaGroupsSent ? { 'stats.mediaGroupsSent': updates.mediaGroupsSent } : {}),
                        },
                        ...(updates.lastUsed ? { $set: { lastUsed: updates.lastUsed } } : {}),
                    },
                },
            }));
            if (bulkOps.length > 0) {
                await this.botModel.bulkWrite(bulkOps);
                console.log(`Flushed ${bulkOps.length} pending stat updates to database`);
            }
            this.cache.del('pendingStats');
        }
        catch (error) {
            console.error('Failed to flush pending stats:', error);
        }
    }
    async createBot(createBotDto) {
        const username = await this.fetchUsername(createBotDto.token);
        if (!username) {
            throw new Error('Invalid bot token or unable to fetch bot username');
        }
        const existingBot = await this.botModel.findOne({ token: createBotDto.token }).exec();
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
        const savedBot = await createdBot.save();
        const cachedBots = this.cache.get(`category:${createBotDto.category}`) || [];
        cachedBots.push(savedBot.toObject());
        this.cache.set(`category:${createBotDto.category}`, cachedBots.sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime()));
        this.cache.set(`bot:${savedBot._id}`, savedBot.toObject());
        return savedBot;
    }
    async getBots(category) {
        if (category) {
            const cachedBots = this.cache.get(`category:${category}`);
            if (cachedBots) {
                return cachedBots;
            }
            console.warn(`Cache miss for category: ${category}`);
            const bots = await this.botModel.find({ category }).lean().exec();
            this.cache.set(`category:${category}`, bots);
            bots.forEach(bot => this.cache.set(`bot:${bot._id}`, bot));
            return bots;
        }
        const allCategories = Object.values(ChannelCategory);
        const allBots = [];
        for (const cat of allCategories) {
            const bots = this.cache.get(`category:${cat}`) || [];
            allBots.push(...bots);
        }
        if (allBots.length > 0) {
            return allBots;
        }
        console.warn('Cache miss for all bots');
        const bots = await this.botModel.find().lean().exec();
        bots.forEach(bot => this.cache.set(`bot:${bot._id}`, bot));
        const botsByCategory = bots.reduce((acc, bot) => {
            if (!acc[bot.category])
                acc[bot.category] = [];
            acc[bot.category].push(bot);
            return acc;
        }, {});
        for (const category in botsByCategory) {
            this.cache.set(`category:${category}`, botsByCategory[category]);
        }
        return bots;
    }
    async getBotById(id) {
        const cachedBot = this.cache.get(`bot:${id}`);
        if (cachedBot) {
            return cachedBot;
        }
        console.warn(`Cache miss for bot ID: ${id}`);
        const bot = await this.botModel.findById(id).lean().exec();
        if (!bot) {
            throw new common_1.NotFoundException(`Bot with ID ${id} not found`);
        }
        this.cache.set(`bot:${id}`, bot);
        const cachedBots = this.cache.get(`category:${bot.category}`) || [];
        if (!cachedBots.some(b => b._id.toString() === id)) {
            cachedBots.push(bot);
            this.cache.set(`category:${bot.category}`, cachedBots.sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime()));
        }
        return bot;
    }
    async updateBot(id, updateBotDto) {
        const bot = await this.botModel
            .findByIdAndUpdate(id, { ...updateBotDto, lastUsed: new Date() }, { new: true })
            .lean()
            .exec();
        if (!bot) {
            throw new common_1.NotFoundException(`Bot with ID ${id} not found`);
        }
        this.cache.set(`bot:${id}`, bot);
        const cachedBots = this.cache.get(`category:${bot.category}`) || [];
        const updatedBots = cachedBots
            .filter(b => b._id.toString() !== id)
            .concat(bot)
            .sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
        this.cache.set(`category:${bot.category}`, updatedBots);
        return bot;
    }
    async deleteBot(id) {
        const bot = await this.botModel.findById(id).lean().exec();
        if (!bot) {
            throw new common_1.NotFoundException(`Bot with ID ${id} not found`);
        }
        await this.botModel.findByIdAndDelete(id).exec();
        this.cache.del(`bot:${id}`);
        const cachedBots = this.cache.get(`category:${bot.category}`) || [];
        const updatedBots = cachedBots
            .filter(b => b._id.toString() !== id)
            .sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
        this.cache.set(`category:${bot.category}`, updatedBots);
    }
    async sendByCategoryWithFailover(category, sender, ...args) {
        let availableBots = this.cache.get(`category:${category}`);
        if (!availableBots || availableBots.length === 0) {
            console.warn(`Cache miss for category: ${category}`);
            availableBots = await this.botModel
                .find({ category })
                .sort({ lastUsed: 'asc' })
                .lean()
                .exec();
            this.cache.set(`category:${category}`, availableBots);
            availableBots.forEach(bot => this.cache.set(`bot:${bot._id}`, bot));
        }
        if (availableBots.length === 0) {
            console.error(`No bots found for category: ${category}`);
            return false;
        }
        for (const bot of availableBots) {
            const success = await sender.call(this, bot._id.toString(), ...args);
            if (success) {
                const updatedBot = { ...bot, lastUsed: new Date() };
                this.cache.set(`bot:${bot._id}`, updatedBot);
                const updatedBots = availableBots
                    .map(b => b._id.toString() === bot._id.toString() ? updatedBot : b)
                    .sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
                this.cache.set(`category:${category}`, updatedBots);
                const pendingStats = this.cache.get('pendingStats') || {};
                pendingStats[bot._id.toString()] = pendingStats[bot._id.toString()] || {};
                pendingStats[bot._id.toString()].lastUsed = new Date();
                this.cache.set('pendingStats', pendingStats);
                return true;
            }
            console.warn(`Sending via bot ${bot.username} for category ${category} failed. Trying next available bot.`);
        }
        console.error(`Failed to send for category ${category} after trying all ${availableBots.length} available bot(s).`);
        return false;
    }
    async sendMessageByCategory(category, message, options, allowServiceName = true) {
        return this.sendByCategoryWithFailover(category, this.sendMessageByBotId, message, options, allowServiceName);
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
    async sendMessageByBotId(botId, message, options, allowServiceName = true) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMessage(bot, message, options, allowServiceName);
        if (success) {
            await this.updateBotStats(botId, 'messagesSent', bot);
        }
        return success;
    }
    async sendPhotoByBotId(botId, photo, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendPhoto', photo, options);
        if (success) {
            await this.updateBotStats(botId, 'photosSent', bot);
        }
        return success;
    }
    async sendVideoByBotId(botId, video, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVideo', video, options);
        if (success) {
            await this.updateBotStats(botId, 'videosSent', bot);
        }
        return success;
    }
    async sendAudioByBotId(botId, audio, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAudio', audio, options);
        if (success) {
            await this.updateBotStats(botId, 'audiosSent', bot);
        }
        return success;
    }
    async sendDocumentByBotId(botId, document, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendDocument', document, options);
        if (success) {
            await this.updateBotStats(botId, 'documentsSent', bot);
        }
        return success;
    }
    async sendVoiceByBotId(botId, voice, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVoice', voice, options);
        if (success) {
            await this.updateBotStats(botId, 'voicesSent', bot);
        }
        return success;
    }
    async sendAnimationByBotId(botId, animation, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAnimation', animation, options);
        if (success) {
            await this.updateBotStats(botId, 'animationsSent', bot);
        }
        return success;
    }
    async sendStickerByBotId(botId, sticker, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendSticker', sticker, options);
        if (success) {
            await this.updateBotStats(botId, 'stickersSent', bot);
        }
        return success;
    }
    async sendMediaGroupByBotId(botId, media, options) {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMediaGroup(bot, media, options);
        if (success) {
            await this.updateBotStats(botId, 'mediaGroupsSent', bot);
        }
        return success;
    }
    async executeSendMessage(bot, text, options, allowServiceName = true) {
        try {
            const response = await axios_1.default.post(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
                chat_id: bot.channelId,
                text: `${allowServiceName ? `${process.env.clientId?.toUpperCase()}\n\n${text}` : text}`,
                parse_mode: options?.parseMode,
                disable_web_page_preview: options?.disableWebPagePreview,
                disable_notification: options?.disableNotification,
                reply_to_message_id: options?.replyToMessageId,
                allow_sending_without_reply: options?.allowSendingWithoutReply,
                protect_content: options?.protectContent,
                link_preview_options: options?.linkPreviewOptions,
            }, { timeout: 15000 });
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
                timeout: 10000
            });
            return res.data?.ok ? res.data.result.username : '';
        }
        catch (error) {
            console.error('Error fetching bot username with provided token:', error);
            (0, utils_1.parseError)(error, 'Failed fetching bot username:');
            return '';
        }
    }
    async updateBotStats(botId, statField, bot) {
        const updatedBot = {
            ...bot,
            stats: {
                ...bot.stats,
                [statField]: bot.stats[statField] + 1,
            },
            lastUsed: new Date(),
        };
        this.cache.set(`bot:${botId}`, updatedBot);
        const cachedBots = this.cache.get(`category:${bot.category}`) || [];
        const updatedBots = cachedBots
            .map(b => b._id.toString() === botId ? updatedBot : b)
            .sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
        this.cache.set(`category:${bot.category}`, updatedBots);
        const pendingStats = this.cache.get('pendingStats') || {};
        pendingStats[botId] = pendingStats[botId] || {};
        pendingStats[botId][statField] = (pendingStats[botId][statField] || 0) + 1;
        pendingStats[botId].lastUsed = updatedBot.lastUsed;
        this.cache.set('pendingStats', pendingStats);
        if (Object.keys(pendingStats).length >= this.maxPendingUpdates) {
            await this.flushPendingStats();
        }
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
        const cacheKey = `stats:${category}`;
        const cachedStats = this.cache.get(cacheKey);
        if (cachedStats) {
            return cachedStats;
        }
        console.warn(`Cache miss for stats: ${category}`);
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
        const result = stats[0] || { _id: category, totalBots: 0 };
        this.cache.set(cacheKey, result);
        return result;
    }
};
exports.BotsService = BotsService;
exports.BotsService = BotsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(bot_schema_1.Bot.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], BotsService);
//# sourceMappingURL=bots.service.js.map