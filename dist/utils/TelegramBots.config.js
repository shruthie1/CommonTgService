"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotConfig = exports.ChannelCategory = void 0;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
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
class BotConfig {
    constructor() {
        this.categoryMap = new Map();
        this.initialized = false;
        this.initializing = false;
        this.initPromise = null;
        this.initRetries = 0;
        this.MAX_RETRIES = 3;
        this.RETRY_DELAY = 2000;
        this.initPromise = this.initialize();
    }
    static getInstance() {
        if (!BotConfig.instance) {
            BotConfig.instance = new BotConfig();
        }
        return BotConfig.instance;
    }
    static async initializeAndGetInstance() {
        const instance = BotConfig.getInstance();
        await instance.ready();
        return instance;
    }
    async ready() {
        if (this.initialized) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }
        return this.initPromise;
    }
    async initialize() {
        if (this.initialized || this.initializing) {
            return;
        }
        try {
            this.initializing = true;
            console.debug('Initializing Telegram channel configuration...');
            const envKeys = Object.keys(process.env).filter(key => key.startsWith('TELEGRAM_CHANNEL_CONFIG_'));
            for (const key of envKeys) {
                const value = process.env[key];
                if (!value)
                    continue;
                try {
                    const [channelId, description = '', botTokensStr] = value.split('::');
                    const botTokens = botTokensStr?.split(',').map(t => t.trim()).filter(Boolean);
                    if (!channelId || !botTokens || botTokens.length === 0) {
                        console.warn(`Invalid configuration for ${key}: missing channelId or botTokens`);
                        continue;
                    }
                    const category = this.getCategoryFromDescription(description);
                    if (!category) {
                        console.warn(`Invalid category in description for ${key}: ${description}`);
                        continue;
                    }
                    const botUsernames = [];
                    for (const token of botTokens) {
                        try {
                            const username = await this.fetchUsername(token);
                            if (!username) {
                                console.warn(`Invalid bot token in ${category}`);
                                continue;
                            }
                            botUsernames.push(username);
                        }
                        catch (error) {
                            console.error(`Error fetching username for token in ${category}:`, error);
                        }
                    }
                    if (botUsernames.length === 0) {
                        console.warn(`No valid bot usernames found for ${category}`);
                        continue;
                    }
                    this.categoryMap.set(category, {
                        botTokens,
                        botUsernames,
                        lastUsedIndex: -1,
                        channelId,
                    });
                }
                catch (error) {
                    console.error(`Error processing configuration for ${key}:`, error);
                }
            }
            await this.initializeBots();
            this.initialized = true;
            console.info(`BotConfig initialized successfully with ${this.categoryMap.size} categories.`);
        }
        catch (error) {
            console.error('Failed to initialize BotConfig:', error);
            if (this.initRetries < this.MAX_RETRIES) {
                this.initRetries++;
                console.info(`Retrying initialization (attempt ${this.initRetries}/${this.MAX_RETRIES})...`);
                this.initializing = false;
                this.initPromise = null;
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
                return this.initialize();
            }
            else {
                console.error(`Failed to initialize after ${this.MAX_RETRIES} attempts`);
                throw error;
            }
        }
        finally {
            this.initializing = false;
        }
    }
    getCategoryFromDescription(desc) {
        if (!desc)
            return null;
        const normalized = desc.trim().toUpperCase();
        return Object.values(ChannelCategory).find(cat => normalized.includes(cat) || cat.includes(normalized)) ?? null;
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
            console.error('Error fetching bot username:', error);
            return '';
        }
    }
    async getBotUsername(category) {
        await this.ensureInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return data.botUsernames[data.lastUsedIndex];
    }
    async getChannelId(category) {
        await this.ensureInitialized();
        const data = this.categoryMap.get(category);
        if (!data) {
            throw new Error(`No configuration found for ${category}`);
        }
        return data.channelId;
    }
    async getBotAndChannel(category) {
        await this.ensureInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botUsernames.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botUsernames.length;
        return {
            username: data.botUsernames[data.lastUsedIndex],
            channelId: data.channelId,
            token: data.botTokens[data.lastUsedIndex],
        };
    }
    async sendMessage(category, message, options = {}) {
        await this.ensureInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const botIndex = data.lastUsedIndex;
        const token = data.botTokens[botIndex];
        const channelId = data.channelId;
        const params = new URLSearchParams({
            chat_id: channelId,
            text: `${process.env.clientId?.toUpperCase()}:\n\n${message}`,
        });
        if (options.parseMode)
            params.append('parse_mode', options.parseMode);
        if (options.disableWebPagePreview)
            params.append('disable_web_page_preview', 'true');
        if (options.disableNotification)
            params.append('disable_notification', 'true');
        if (options.replyToMessageId)
            params.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply)
            params.append('allow_sending_without_reply', 'true');
        if (options.protectContent)
            params.append('protect_content', 'true');
        if (options.linkPreviewOptions) {
            const { isDisabled, url, preferSmallMedia, preferLargeMedia, showAboveText } = options.linkPreviewOptions;
            if (isDisabled)
                params.append('disable_web_page_preview', 'true');
            if (url)
                params.append('link_preview_url', url);
            if (preferSmallMedia)
                params.append('prefer_small_media', 'true');
            if (preferLargeMedia)
                params.append('prefer_large_media', 'true');
            if (showAboveText)
                params.append('show_above_text', 'true');
        }
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        try {
            const response = await axios_1.default.post(url, params, {
                timeout: 10000
            });
            return response.data?.ok === true;
        }
        catch (error) {
            console.error(`Failed to send message to ${channelId} using bot at index ${botIndex}:`, error);
            if (data.botTokens.length > 1 && data.botTokens.length > botIndex + 1) {
                console.debug(`Retrying with next available bot for ${category}`);
                data.lastUsedIndex = botIndex;
                return this.sendMessage(category, message, options);
            }
            return false;
        }
    }
    async sendPhoto(category, photo, options = {}) {
        return this.sendMedia(category, 'sendPhoto', photo, options);
    }
    async sendVideo(category, video, options = {}) {
        return this.sendMedia(category, 'sendVideo', video, options);
    }
    async sendAudio(category, audio, options = {}) {
        return this.sendMedia(category, 'sendAudio', audio, options);
    }
    async sendDocument(category, document, options = {}) {
        return this.sendMedia(category, 'sendDocument', document, options);
    }
    async sendVoice(category, voice, options = {}) {
        return this.sendMedia(category, 'sendVoice', voice, options);
    }
    async sendVideoNote(category, videoNote, options = {}) {
        return this.sendMedia(category, 'sendVideoNote', videoNote, options);
    }
    async sendAnimation(category, animation, options = {}) {
        return this.sendMedia(category, 'sendAnimation', animation, options);
    }
    async sendSticker(category, sticker, options = {}) {
        return this.sendMedia(category, 'sendSticker', sticker, options);
    }
    async sendMediaGroup(category, media, options = {}) {
        await this.ensureInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const botIndex = data.lastUsedIndex;
        const token = data.botTokens[botIndex];
        const channelId = data.channelId;
        const formData = new form_data_1.default();
        formData.append('chat_id', channelId);
        const mediaArray = [];
        for (let i = 0; i < media.length; i++) {
            const item = media[i];
            const mediaObj = {
                type: item.type,
                media: Buffer.isBuffer(item.media) ? `attach://file${i}` : item.media,
            };
            mediaObj.caption = `${process.env.clientId.toUpperCase()}:\n\n${item.caption || ''}`;
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
            if (item.type === 'document') {
                if (item.thumbnail && Buffer.isBuffer(item.thumbnail)) {
                    mediaObj.thumbnail = `attach://thumb${i}`;
                }
            }
            mediaArray.push(mediaObj);
            if (Buffer.isBuffer(item.media)) {
                let filename = `file${i}`;
                if (item.extension) {
                    filename = `file${i}.${item.extension}`;
                }
                else {
                    switch (item.type) {
                        case 'photo':
                            filename = `file${i}.jpg`;
                            break;
                        case 'video':
                            filename = `file${i}.mp4`;
                            break;
                        case 'audio':
                            filename = `file${i}.mp3`;
                            break;
                        case 'document':
                            filename = `file${i}.bin`;
                            break;
                    }
                }
                formData.append(`file${i}`, item.media, filename);
            }
            if (item.type === 'document' && item.thumbnail && Buffer.isBuffer(item.thumbnail)) {
                formData.append(`thumb${i}`, item.thumbnail, `thumb${i}.jpg`);
            }
        }
        formData.append('media', JSON.stringify(mediaArray));
        if (options.disableNotification)
            formData.append('disable_notification', 'true');
        if (options.replyToMessageId)
            formData.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply)
            formData.append('allow_sending_without_reply', 'true');
        if (options.protectContent)
            formData.append('protect_content', 'true');
        const url = `https://api.telegram.org/bot${token}/sendMediaGroup`;
        try {
            const response = await axios_1.default.post(url, formData, {
                timeout: 30000,
                headers: {
                    ...formData.getHeaders(),
                },
            });
            return response.data?.ok === true;
        }
        catch (error) {
            console.error(`Failed to send media group to ${channelId} using bot at index ${botIndex}:`, error);
            if (data.botTokens.length > 1 && data.botTokens.length > botIndex + 1) {
                console.debug(`Retrying with next available bot for ${category}`);
                data.lastUsedIndex = botIndex;
                return this.sendMediaGroup(category, media, options);
            }
            return false;
        }
    }
    async sendMedia(category, method, media, options = {}) {
        await this.ensureInitialized();
        const data = this.categoryMap.get(category);
        if (!data || data.botTokens.length === 0) {
            throw new Error(`No valid bots configured for ${category}`);
        }
        data.lastUsedIndex = (data.lastUsedIndex + 1) % data.botTokens.length;
        const botIndex = data.lastUsedIndex;
        const token = data.botTokens[botIndex];
        const channelId = data.channelId;
        const formData = new form_data_1.default();
        formData.append('chat_id', channelId);
        const mediaField = method.replace('send', '').toLowerCase();
        if (Buffer.isBuffer(media)) {
            formData.append(mediaField, media, `${mediaField}.dat`);
        }
        else {
            formData.append(mediaField, media);
        }
        if (options.caption)
            formData.append('caption', `${process.env.clientId.toUpperCase()}:\n\n${options.caption}`);
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
        if (method === 'sendVideo') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
            if (options.width)
                formData.append('width', options.width.toString());
            if (options.height)
                formData.append('height', options.height.toString());
            if (options.supportsStreaming)
                formData.append('supports_streaming', 'true');
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                }
                else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }
        if (method === 'sendAudio') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
            if (options.performer)
                formData.append('performer', options.performer);
            if (options.title)
                formData.append('title', options.title);
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                }
                else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }
        if (method === 'sendDocument') {
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                }
                else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
            if (options.disableContentTypeDetection)
                formData.append('disable_content_type_detection', 'true');
        }
        if (method === 'sendVoice') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
        }
        if (method === 'sendVideoNote') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
            if (options.length)
                formData.append('length', options.length.toString());
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                }
                else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }
        if (method === 'sendAnimation') {
            if (options.duration)
                formData.append('duration', options.duration.toString());
            if (options.width)
                formData.append('width', options.width.toString());
            if (options.height)
                formData.append('height', options.height.toString());
            if (options.thumbnail) {
                if (Buffer.isBuffer(options.thumbnail)) {
                    formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
                }
                else {
                    formData.append('thumbnail', options.thumbnail);
                }
            }
        }
        if (method === 'sendSticker') {
            if (options.emoji)
                formData.append('emoji', options.emoji);
        }
        const url = `https://api.telegram.org/bot${token}/${method}`;
        try {
            const response = await axios_1.default.post(url, formData, {
                timeout: 30000,
                headers: {
                    ...formData.getHeaders(),
                },
            });
            return response.data?.ok === true;
        }
        catch (error) {
            console.error(`Failed to send ${method} to ${channelId} using bot at index ${botIndex}:`, error);
            if (data.botTokens.length > 1 && data.botTokens.length > botIndex + 1) {
                console.debug(`Retrying with next available bot for ${category}`);
                data.lastUsedIndex = botIndex;
                return this.sendMedia(category, method, media, options);
            }
            return false;
        }
    }
    async initializeBots() {
        console.debug('Initializing bots with /start command...');
        const initPromises = [];
        for (const [category, data] of this.categoryMap) {
            for (const token of data.botTokens) {
                const promise = (async () => {
                    try {
                        const botInfo = await axios_1.default.get(`https://api.telegram.org/bot${token}/getMe`, {
                            timeout: 5000
                        });
                        if (!botInfo.data?.ok) {
                            console.error(`Failed to get bot info for ${category}`);
                            return;
                        }
                        console.debug(`Successfully initialized bot for ${category}`);
                    }
                    catch (error) {
                        console.error(`Failed to initialize bot for ${category}:`, error);
                    }
                })();
                initPromises.push(promise);
            }
        }
        await Promise.allSettled(initPromises);
    }
    async ensureInitialized() {
        if (!this.initialized) {
            await this.ready();
            if (!this.initialized) {
                throw new Error('BotConfig initialization failed. Unable to proceed.');
            }
        }
    }
    async hasCategory(category) {
        await this.ensureInitialized();
        return this.categoryMap.has(category);
    }
    async getConfiguredCategories() {
        await this.ensureInitialized();
        return Array.from(this.categoryMap.keys());
    }
}
exports.BotConfig = BotConfig;
//# sourceMappingURL=TelegramBots.config.js.map