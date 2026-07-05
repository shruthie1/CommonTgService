"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var BotsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotsService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const node_cache_1 = __importDefault(require("node-cache"));
const schedule = __importStar(require("node-schedule-tz"));
const utils_1 = require("../../utils");
const bot_schema_1 = require("./schemas/bot.schema");
const Telegram_service_1 = require("../Telegram/Telegram.service");
const users_service_1 = require("../users/users.service");
const channel_category_enum_1 = require("./channel-category.enum");
let BotsService = BotsService_1 = class BotsService {
    constructor(botModel, moduleRef) {
        this.botModel = botModel;
        this.moduleRef = moduleRef;
        this.flushInterval = 300000;
        this.maxPendingUpdates = 100;
        this.maxReplacementsPerRun = 1;
        this.minHealthyBotsPerCategory = 2;
        this.maxTopUpsPerRun = 2;
        this.healthCheckJob = null;
        this.flushTimer = null;
        this.destroyed = false;
        this.replaceInProgress = false;
        this.BOT_TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]+$/;
        this.cache = new node_cache_1.default({ stdTTL: 300, checkperiod: 60 });
    }
    get telegramService() {
        return this.moduleRef.get(Telegram_service_1.TelegramService, { strict: false });
    }
    get usersService() {
        return this.moduleRef.get(users_service_1.UsersService, { strict: false });
    }
    async onModuleInit() {
        await this.initializeCache();
        this.startPeriodicFlush();
        if (this.isBotHealthJobEnabled()) {
            console.log('[BotHealth] BOT_HEALTH_JOB_ENABLED is set on this pod — scheduling daily job');
            this.scheduleBotHealthCheck();
        }
        else {
            console.log('[BotHealth] daily job disabled on this pod (set BOT_HEALTH_JOB_ENABLED=true on ONE pod to enable)');
        }
    }
    isBotHealthJobEnabled() {
        const v = (process.env.BOT_HEALTH_JOB_ENABLED || '').trim().toLowerCase();
        return v === 'true' || v === '1' || v === 'yes' || v === 'on';
    }
    scheduleBotHealthCheck() {
        this.healthCheckJob = schedule.scheduleJob(BotsService_1.HEALTH_JOB_NAME, BotsService_1.HEALTH_JOB_CRON, BotsService_1.HEALTH_JOB_TZ, async () => {
            if (this.destroyed)
                return;
            try {
                await this.validateAndReplaceBots();
            }
            catch (err) {
                (0, utils_1.parseError)(err, '[BotHealth] daily validateAndReplaceBots failed', true);
            }
        });
        console.log(`[BotHealth] daily bot health-check scheduled (cron '${BotsService_1.HEALTH_JOB_CRON}' ${BotsService_1.HEALTH_JOB_TZ})`);
    }
    onModuleDestroy() {
        this.destroyed = true;
        try {
            this.healthCheckJob?.cancel?.();
        }
        catch { }
        this.healthCheckJob = null;
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
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
        this.flushTimer = setInterval(async () => {
            await this.flushPendingStats();
        }, this.flushInterval);
        this.flushTimer.unref?.();
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
        const ALL_BOTS_KEY = 'all-bots';
        const cachedAll = this.cache.get(ALL_BOTS_KEY);
        if (cachedAll) {
            return cachedAll;
        }
        console.warn('Cache miss for all bots');
        const bots = await this.botModel.find().lean().exec();
        this.cache.set(ALL_BOTS_KEY, bots);
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
        const liveBots = availableBots.filter(b => b.status !== 'inactive');
        if (liveBots.length > 0) {
            availableBots = liveBots;
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
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    humanDelay(minMs = 10_000, maxMs = 20_000) {
        const jitter = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs));
        return this.sleep(jitter);
    }
    isFloodSignal(err) {
        const m = [err?.message, err?.errorMessage, err?.code, String(err || '')].filter(Boolean).join(' ').toLowerCase();
        return /flood|too many|spam|420|peer_flood|slowmode/.test(m);
    }
    async checkBotToken(token) {
        try {
            const res = await axios_1.default.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 12000 });
            return res.data?.ok === true ? 'alive' : 'unknown';
        }
        catch (error) {
            const status = error?.response?.status;
            if (status === 401 || status === 403 || status === 404)
                return 'dead';
            return 'unknown';
        }
    }
    async validateAndReplaceBots() {
        if (this.replaceInProgress) {
            console.warn('[BotHealth] validateAndReplaceBots already running on this pod — skipping');
            return { checked: 0, alive: 0, dead: 0, unknown: 0, replaced: 0, toppedUp: 0, failures: ['already running (this pod)'] };
        }
        this.replaceInProgress = true;
        const failures = [];
        let alive = 0, dead = 0, unknown = 0, replaced = 0;
        const deadBots = [];
        try {
            const bots = await this.botModel.find().lean().exec();
            for (const bot of bots) {
                const verdict = await this.checkBotToken(bot.token);
                if (verdict === 'alive') {
                    alive++;
                    if (bot.status === 'inactive') {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { status: 'active', deadReason: null }, $unset: { deadAt: '' } }).exec();
                    }
                    else {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { lastValidatedAt: new Date() } }).exec();
                    }
                }
                else if (verdict === 'dead') {
                    dead++;
                    if (bot.status !== 'inactive') {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { status: 'inactive', deadReason: 'getMe 401 Unauthorized (token revoked)', deadAt: new Date() } }).exec();
                        console.warn(`[BotHealth] marked dead: @${bot.username} (${bot.category})`);
                    }
                    deadBots.push({ username: bot.username, category: bot.category, channelId: bot.channelId, token: bot.token });
                }
                else {
                    unknown++;
                }
                await this.sleep(1200);
            }
            await this.flushPendingStats();
            this.cache.flushAll();
            const toReplace = deadBots.slice(0, this.maxReplacementsPerRun);
            for (const deadBot of toReplace) {
                try {
                    const newBot = await this.replaceDeadBot(deadBot);
                    if (newBot)
                        replaced++;
                }
                catch (err) {
                    const msg = `replace @${deadBot.username} (${deadBot.category}): ${err?.message || err}`;
                    failures.push(msg);
                    (0, utils_1.parseError)(err, `[BotHealth] ${msg}`, true);
                    if (/flood|too many|rate/i.test(err?.message || '')) {
                        failures.push('BotFather rate-limit hit — aborting further replacements this run');
                        break;
                    }
                }
            }
            let toppedUp = 0;
            try {
                const topUp = await this.topUpCategoriesToMinHealthy();
                toppedUp = topUp.toppedUp;
                failures.push(...topUp.topUpFailures);
            }
            catch (err) {
                const msg = `top-up pass failed: ${err?.message || err}`;
                failures.push(msg);
                (0, utils_1.parseError)(err, `[BotHealth] ${msg}`, false);
            }
            await this.sendHealthSummary({ checked: bots.length, alive, dead, unknown, replaced, toppedUp, deadRemaining: deadBots.length - replaced, failures });
            return { checked: bots.length, alive, dead, unknown, replaced, toppedUp, failures };
        }
        finally {
            this.replaceInProgress = false;
        }
    }
    async provisionBotForCategory(category, channelId, opts = {}) {
        const candidates = await this.pickHealthyCreatorCandidates(5);
        if (candidates.length === 0) {
            throw new Error('no healthy user account available to create bot');
        }
        const usernameSeed = `${category}`.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
        let creator = null;
        let botToken = '';
        let username = '';
        let lastErr = null;
        for (const cand of candidates) {
            const creatorHandle = cand.username ? `@${cand.username}` : (cand.firstName || 'unknown');
            const description = `${cand.mobile} ${creatorHandle}`.slice(0, 512);
            try {
                const res = await this.telegramService.createBot(cand.mobile, {
                    name: `${category}`,
                    username: usernameSeed,
                    description,
                    aboutText: description,
                });
                if (res?.botToken && this.BOT_TOKEN_REGEX.test(res.botToken)) {
                    creator = cand;
                    botToken = res.botToken;
                    username = res.username;
                    break;
                }
                lastErr = new Error(`BotFather did not return a valid token (got: ${String(res?.botToken).slice(0, 20)})`);
            }
            catch (err) {
                lastErr = err;
                const msg = err?.message || String(err);
                if (/BOTFATHER_CANNOT_CREATE|cannot create new bots|too many attempts/i.test(msg)) {
                    console.warn(`[BotHealth] creator ${cand.mobile} cannot create bots — trying next candidate`);
                    continue;
                }
                if (this.isFloodSignal(err) || /flood|peer_flood/i.test(msg)) {
                    throw err;
                }
                console.warn(`[BotHealth] createBot via ${cand.mobile} failed (${msg.slice(0, 80)}) — trying next`);
                continue;
            }
        }
        if (!creator || !botToken) {
            throw lastErr || new Error('all creator candidates failed to create a bot');
        }
        const creatorHandle = creator.username ? `@${creator.username}` : (creator.firstName || 'unknown');
        const description = `${creator.mobile} ${creatorHandle}`.slice(0, 512);
        const saved = await this.createBot({ token: botToken, category, channelId, description });
        await this.botModel.updateOne({ _id: saved._id }, { $set: { createdByMobile: creator.mobile, ...(opts.replacesUsername ? { replacedBotUsername: opts.replacesUsername } : {}), status: 'inactive', deadReason: 'awaiting channel-admin add', lastValidatedAt: new Date() } }).exec();
        try {
            const botId = await this.addBotToChannelAsAdmin(channelId, botToken, username);
            const verified = await this.verifyBotIsChannelAdmin(channelId, botId);
            if (!verified) {
                throw new Error('post-add verification failed: bot is not listed as an admin of the channel');
            }
            await this.botModel.updateOne({ _id: saved._id }, { $set: { status: 'active' }, $unset: { deadReason: '' } }).exec();
            await this.flushPendingStats();
            this.cache.flushAll();
            console.log(`[BotHealth] provisioned @${username} (${category}) via ${creator.mobile} — active`);
            return { saved, username, active: true };
        }
        catch (err) {
            (0, utils_1.parseError)(err, `[BotHealth] created @${username} but failed to add/verify in channel ${channelId} — left INACTIVE`, false);
            await this.notify(`<b>Bot created but NOT usable (left inactive)</b>\nCategory: ${category}\nNew bot: @${username}\nChannel: ${channelId}\nAction: add it as admin manually, then it self-activates on next health check.\nReason: ${(err?.message || String(err)).substring(0, 120)}`);
            console.log(`[BotHealth] provisioned @${username} (${category}) — created but NOT yet admin (inactive)`);
            return { saved, username, active: false };
        }
    }
    async replaceDeadBot(deadBot) {
        const { saved, active } = await this.provisionBotForCategory(deadBot.category, deadBot.channelId, {
            replacesUsername: deadBot.username,
        });
        if (!active) {
            return null;
        }
        try {
            await this.botModel.deleteOne({ token: deadBot.token }).exec();
        }
        catch { }
        console.log(`[BotHealth] replaced dead @${deadBot.username} (${deadBot.category}) — active`);
        return saved;
    }
    async topUpCategoriesToMinHealthy() {
        const topUpFailures = [];
        let toppedUp = 0;
        const all = await this.botModel.find().lean().exec();
        const byCategory = all.reduce((acc, b) => {
            (acc[b.category] = acc[b.category] || []).push(b);
            return acc;
        }, {});
        for (const [category, list] of Object.entries(byCategory)) {
            if (toppedUp >= this.maxTopUpsPerRun) {
                topUpFailures.push(`top-up cap (${this.maxTopUpsPerRun}) reached — remaining low categories deferred to next run`);
                break;
            }
            const liveCount = list.filter(b => b.status !== 'inactive').length;
            const deficit = this.minHealthyBotsPerCategory - liveCount;
            if (deficit <= 0)
                continue;
            const channelId = list[0]?.channelId;
            if (!channelId) {
                topUpFailures.push(`${category}: below floor (${liveCount}/${this.minHealthyBotsPerCategory}) but no channelId known — skipped`);
                continue;
            }
            const need = Math.min(deficit, this.maxTopUpsPerRun - toppedUp);
            for (let i = 0; i < need; i++) {
                try {
                    const { active, username } = await this.provisionBotForCategory(category, channelId);
                    if (active) {
                        toppedUp++;
                        console.log(`[BotHealth] topped up ${category}: added @${username} (was ${liveCount}/${this.minHealthyBotsPerCategory})`);
                    }
                    else {
                        topUpFailures.push(`${category}: created @${username} but not yet admin (inactive)`);
                    }
                }
                catch (err) {
                    const msg = `top-up ${category}: ${err?.message || err}`;
                    topUpFailures.push(msg);
                    (0, utils_1.parseError)(err, `[BotHealth] ${msg}`, false);
                    if (this.isFloodSignal(err) || /flood|too many|rate/i.test(err?.message || '')) {
                        topUpFailures.push('flood/rate signal — aborting further top-ups this run');
                        return { toppedUp, topUpFailures };
                    }
                    break;
                }
            }
        }
        return { toppedUp, topUpFailures };
    }
    async addBotToChannelAsAdmin(channelId, botToken, botUsername) {
        const botInfo = await this.telegramService.getBotInfo(botToken);
        const botId = String(botInfo?.id ?? '');
        if (!botId)
            throw new Error('could not resolve new bot id from getBotInfo');
        const adminMobile = await this.resolveChannelAdminMobile(channelId);
        if (!adminMobile)
            throw new Error(`no controllable admin account found for channel ${channelId}`);
        const desired = {
            changeInfo: true, postMessages: true, editMessages: true, deleteMessages: true,
            banUsers: true, inviteUsers: true, pinMessages: true, addAdmins: false,
            anonymous: true, manageCall: true,
        };
        const granted = await this.intersectWithPromoterRights(adminMobile, channelId, desired);
        await this.humanDelay();
        try {
            await this.telegramService.setupBotInChannel(adminMobile, channelId, botId, botUsername, granted);
        }
        catch (err) {
            if (this.isFloodSignal(err)) {
                throw new Error(`FLOOD/spam signal promoting via ${adminMobile} in ${channelId} — aborting to protect the manager account: ${err?.message || err}`);
            }
            throw err;
        }
        console.log(`[BotHealth] attempted add of @${botUsername} to channel ${channelId} via ${adminMobile}`);
        return botId;
    }
    async verifyBotIsChannelAdmin(channelId, botId) {
        await this.sleep(3000);
        for (const viewerMobile of [...this.getChannelManagerMobiles(), ...(await this.getHealthyAccountMobiles(10))]) {
            try {
                const admins = await this.telegramService.getGroupAdmins(viewerMobile, channelId);
                const ids = new Set((Array.isArray(admins) ? admins : []).map((a) => String(a?.id ?? a?.userId ?? a?.user?.id ?? '')));
                if (ids.size > 0)
                    return ids.has(String(botId));
            }
            catch {
                continue;
            }
        }
        return false;
    }
    getChannelManagerMobiles() {
        return [process.env.channelManagerPrimary, process.env.channelManagerBackup]
            .map(m => (m || '').trim())
            .filter(Boolean);
    }
    async resolveChannelAdminMobile(channelId) {
        const viewers = [...this.getChannelManagerMobiles(), ...(await this.getHealthyAccountMobiles(15))];
        let admins = null;
        for (const viewer of viewers) {
            try {
                const res = await this.telegramService.getGroupAdmins(viewer, channelId);
                if (Array.isArray(res) && res.length > 0) {
                    admins = res;
                    break;
                }
            }
            catch {
                continue;
            }
        }
        const healthy = await this.getHealthyAccounts();
        const byMobile = new Map(healthy.map(u => [u.mobile, u]));
        try {
            for (const viewer of viewers) {
                let about = '';
                try {
                    about = await this.telegramService.getChannelAbout(viewer, channelId);
                }
                catch {
                    continue;
                }
                if (!about)
                    continue;
                for (const m of about.match(/\d{10,13}/g) || []) {
                    if (byMobile.has(m))
                        return m;
                }
                break;
            }
        }
        catch { }
        if (!admins)
            return null;
        const byTgId = new Map(healthy.filter(u => u.tgId).map(u => [String(u.tgId), u]));
        const scored = [];
        for (const a of admins) {
            const tgId = String(a?.userId ?? a?.id ?? '');
            const ours = byTgId.get(tgId);
            if (!ours)
                continue;
            const perms = a?.permissions || {};
            const isCreator = a?.rank === 'creator';
            if (!isCreator && !perms.addAdmins)
                continue;
            const score = isCreator ? 3 : (perms.postMessages ? 2 : 1);
            scored.push({ mobile: ours.mobile, score });
        }
        if (scored.length === 0)
            return null;
        scored.sort((x, y) => y.score - x.score);
        return scored[0].mobile;
    }
    async intersectWithPromoterRights(promoterMobile, channelId, desired) {
        try {
            const promoterUser = (await this.usersService.search({ mobile: promoterMobile }))[0];
            const promoterTgId = promoterUser?.tgId ? String(promoterUser.tgId) : null;
            if (!promoterTgId)
                return desired;
            const admins = await this.telegramService.getGroupAdmins(promoterMobile, channelId);
            const me = (Array.isArray(admins) ? admins : []).find((a) => String(a?.userId ?? a?.id) === promoterTgId);
            const perms = me?.permissions;
            if (!perms || me?.rank === 'creator')
                return desired;
            const capped = {};
            for (const [k, v] of Object.entries(desired)) {
                capped[k] = k === 'anonymous' ? v : Boolean(v && perms[k]);
            }
            return capped;
        }
        catch {
            return desired;
        }
    }
    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    async getHealthyAccounts() {
        const users = await this.usersService.search({ expired: false });
        return this.shuffle(users.filter(u => u.session && String(u.session).trim() && u.mobile));
    }
    async pickHealthyCreatorCandidates(n) {
        const managerMobiles = new Set(this.getChannelManagerMobiles());
        const accounts = await this.usersService.getBotCreatorAccounts(Math.max(n * 3, 30));
        const usable = accounts.filter(u => u.mobile && !managerMobiles.has(u.mobile));
        return usable.slice(0, Math.max(1, n)).map(u => ({ mobile: u.mobile, username: u.username, firstName: u.firstName }));
    }
    async getHealthyAccountMobiles(limit) {
        const managers = this.getChannelManagerMobiles();
        const others = (await this.getHealthyAccounts()).map(u => u.mobile);
        const ordered = [];
        for (const m of [...managers, ...others]) {
            if (m && !ordered.includes(m))
                ordered.push(m);
            if (ordered.length >= limit)
                break;
        }
        return ordered;
    }
    async notify(html) {
        try {
            await this.sendMessageByCategory(channel_category_enum_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, html, { parseMode: 'HTML' });
        }
        catch (err) {
            console.error('[BotHealth] failed to send notification:', err);
        }
    }
    async sendHealthSummary(s) {
        const lines = [
            '<b>Bot Health Check</b>',
            `Checked: ${s.checked} | Alive: ${s.alive} | Dead: ${s.dead} | Unknown: ${s.unknown}`,
            `Replaced: ${s.replaced} | Topped up: ${s.toppedUp} | Dead remaining: ${s.deadRemaining}`,
        ];
        if (s.failures.length) {
            const shown = s.failures.slice(0, 10).map(f => `• ${f}`);
            if (s.failures.length > 10)
                shown.push(`(+${s.failures.length - 10} more)`);
            lines.push(`<b>Failures:</b>\n${shown.join('\n')}`);
        }
        await this.notify(lines.join('\n'));
    }
};
exports.BotsService = BotsService;
BotsService.HEALTH_JOB_NAME = 'bot-health-check';
BotsService.HEALTH_JOB_CRON = '30 3 * * *';
BotsService.HEALTH_JOB_TZ = 'Asia/Kolkata';
exports.BotsService = BotsService = BotsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(bot_schema_1.Bot.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        core_1.ModuleRef])
], BotsService);
//# sourceMappingURL=bots.service.js.map