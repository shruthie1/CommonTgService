import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import FormData from 'form-data';
import NodeCache from 'node-cache';
import { parseError } from '../../utils';
import { Bot, BotDocument } from './schemas/bot.schema';

export enum ChannelCategory {
    CLIENT_UPDATES = 'CLIENT_UPDATES',
    USER_WARNINGS = 'USER_WARNINGS',
    VC_WARNINGS = 'VC_WARNINGS',
    USER_REQUESTS = 'USER_REQUESTS',
    VC_NOTIFICATIONS = 'VC_NOTIFICATIONS',
    CHANNEL_NOTIFICATIONS = 'CHANNEL_NOTIFICATIONS',
    ACCOUNT_NOTIFICATIONS = 'ACCOUNT_NOTIFICATIONS',
    ACCOUNT_LOGIN_FAILURES = 'ACCOUNT_LOGIN_FAILURES',
    PROMOTION_ACCOUNT = 'PROMOTION_ACCOUNT',
    CLIENT_ACCOUNT = 'CLIENT_ACCOUNT',
    PAYMENT_FAIL_QUERIES = 'PAYMENT_FAIL_QUERIES',
    SAVED_MESSAGES = 'SAVED_MESSAGES',
    HTTP_FAILURES = 'HTTP_FAILURES',
    UNVDS = 'UNVDS',
    PROM_LOGS1 = 'PROM_LOGS1',
    PROM_LOGS2 = 'PROM_LOGS2',
    UNAUTH_CALLS = 'UNAUTH_CALLS',
}

export interface SendMessageOptions {
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
    disableWebPagePreview?: boolean;
    disableNotification?: boolean;
    replyToMessageId?: number;
    allowSendingWithoutReply?: boolean;
    protectContent?: boolean;
    linkPreviewOptions?: {
        isDisabled?: boolean;
        url?: string;
        preferSmallMedia?: boolean;
        preferLargeMedia?: boolean;
        showAboveText?: boolean;
    };
}

export interface MediaOptions extends Omit<SendMessageOptions, 'disableWebPagePreview' | 'linkPreviewOptions'> {
    caption?: string;
    hasSpoiler?: boolean;
}

export interface PhotoOptions extends MediaOptions {}
export interface VideoOptions extends MediaOptions {
    duration?: number;
    width?: number;
    height?: number;
    thumbnail?: Buffer | string;
    supportsStreaming?: boolean;
}

export interface AudioOptions extends MediaOptions {
    duration?: number;
    performer?: string;
    title?: string;
    thumbnail?: Buffer | string;
}

export interface DocumentOptions extends MediaOptions {
    thumbnail?: Buffer | string;
    disableContentTypeDetection?: boolean;
}

export interface VoiceOptions extends Omit<MediaOptions, 'caption'> {
    duration?: number;
}

export interface VideoNoteOptions extends Omit<MediaOptions, 'caption'> {
    duration?: number;
    length?: number;
    thumbnail?: Buffer | string;
}

export interface AnimationOptions extends MediaOptions {
    duration?: number;
    width?: number;
    height?: number;
    thumbnail?: Buffer | string;
}

export interface StickerOptions extends Omit<MediaOptions, 'caption'> {
    emoji?: string;
}

export interface MediaGroupItem {
    type: 'photo' | 'video' | 'audio' | 'document';
    media: Buffer | string;
    caption?: string;
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    hasSpoiler?: boolean;
    extension?: string;
    duration?: number;
    width?: number;
    height?: number;
    supportsStreaming?: boolean;
    performer?: string;
    title?: string;
    thumbnail?: Buffer;
}

export interface MediaGroupOptions extends Omit<SendMessageOptions, 'parseMode' | 'disableWebPagePreview' | 'linkPreviewOptions'> {}

@Injectable()
export class BotsService implements OnModuleInit {
    private cache: NodeCache;
    private readonly flushInterval = 300000; // 5 minutes in milliseconds
    private readonly maxPendingUpdates = 100; // Max pending updates before forcing a flush

    constructor(
        @InjectModel(Bot.name) private botModel: Model<BotDocument>
    ) {
        // Initialize cache with a TTL of 5 minutes (300 seconds) and check period of 60 seconds
        this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    }

    async onModuleInit(): Promise<void> {
        await this.initializeCache();
        // Start periodic flush of pending stat updates
        this.startPeriodicFlush();
    }

    private async initializeCache(): Promise<void> {
        try {
            const bots = await this.botModel.find().lean().exec();
            const botsByCategory = bots.reduce((acc, bot) => {
                if (!acc[bot.category]) {
                    acc[bot.category] = [];
                }
                acc[bot.category].push(bot);
                return acc;
            }, {} as Record<ChannelCategory, BotDocument[]>);

            // Cache bots by category and by ID
            for (const category in botsByCategory) {
                const sortedBots = botsByCategory[category as ChannelCategory].sort(
                    (a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime()
                );
                this.cache.set(`category:${category}`, sortedBots);
                sortedBots.forEach(bot => this.cache.set(`bot:${bot._id}`, bot));
            }
            console.log('Bot cache initialized with', Object.keys(botsByCategory).length, 'categories');
        } catch (error) {
            console.error('Failed to initialize bot cache:', error);
        }
    }

    private startPeriodicFlush(): void {
        setInterval(async () => {
            await this.flushPendingStats();
        }, this.flushInterval);
    }

    private async flushPendingStats(): Promise<void> {
        const pendingUpdates = this.cache.get<Record<string, Partial<Bot['stats'] & { lastUsed?: Date }>>>('pendingStats') || {};
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

            // Clear pending stats after flushing
            this.cache.del('pendingStats');
        } catch (error) {
            console.error('Failed to flush pending stats:', error);
        }
    }

    async createBot(createBotDto: {
        token: string;
        category: ChannelCategory;
        channelId: string;
        description?: string;
    }): Promise<BotDocument> {
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
        // Update caches
        const cachedBots = this.cache.get<BotDocument[]>(`category:${createBotDto.category}`) || [];
        cachedBots.push(savedBot.toObject());
        this.cache.set(`category:${createBotDto.category}`, cachedBots.sort(
            (a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime()
        ));
        this.cache.set(`bot:${savedBot._id}`, savedBot.toObject());
        return savedBot;
    }

    async getBots(category?: ChannelCategory): Promise<BotDocument[]> {
        if (category) {
            const cachedBots = this.cache.get<BotDocument[]>(`category:${category}`);
            if (cachedBots) {
                return cachedBots;
            }
            console.warn(`Cache miss for category: ${category}`);
            const bots = await this.botModel.find({ category }).lean().exec();
            this.cache.set(`category:${category}`, bots);
            bots.forEach(bot => this.cache.set(`bot:${bot._id}`, bot));
            return bots;
        }
        // For all bots, aggregate from category caches if available
        const allCategories = Object.values(ChannelCategory);
        const allBots: BotDocument[] = [];
        for (const cat of allCategories) {
            const bots = this.cache.get<BotDocument[]>(`category:${cat}`) || [];
            allBots.push(...bots);
        }
        if (allBots.length > 0) {
            return allBots;
        }
        console.warn('Cache miss for all bots');
        const bots = await this.botModel.find().lean().exec();
        bots.forEach(bot => this.cache.set(`bot:${bot._id}`, bot));
        const botsByCategory = bots.reduce((acc, bot) => {
            if (!acc[bot.category]) acc[bot.category] = [];
            acc[bot.category].push(bot);
            return acc;
        }, {} as Record<ChannelCategory, BotDocument[]>);
        for (const category in botsByCategory) {
            this.cache.set(`category:${category}`, botsByCategory[category as ChannelCategory]);
        }
        return bots;
    }

    async getBotById(id: string): Promise<BotDocument> {
        const cachedBot = this.cache.get<BotDocument>(`bot:${id}`);
        if (cachedBot) {
            return cachedBot;
        }
        console.warn(`Cache miss for bot ID: ${id}`);
        const bot = await this.botModel.findById(id).lean().exec();
        if (!bot) {
            throw new NotFoundException(`Bot with ID ${id} not found`);
        }
        this.cache.set(`bot:${id}`, bot);
        const cachedBots = this.cache.get<BotDocument[]>(`category:${bot.category}`) || [];
        if (!cachedBots.some(b => b._id.toString() === id)) {
            cachedBots.push(bot);
            this.cache.set(`category:${bot.category}`, cachedBots.sort(
                (a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime()
            ));
        }
        return bot;
    }

    async updateBot(id: string, updateBotDto: Partial<Bot>): Promise<BotDocument> {
        const bot = await this.botModel
            .findByIdAndUpdate(id, { ...updateBotDto, lastUsed: new Date() }, { new: true })
            .lean()
            .exec();
        if (!bot) {
            throw new NotFoundException(`Bot with ID ${id} not found`);
        }
        // Update caches
        this.cache.set(`bot:${id}`, bot);
        const cachedBots = this.cache.get<BotDocument[]>(`category:${bot.category}`) || [];
        const updatedBots = cachedBots
            .filter(b => b._id.toString() !== id)
            .concat(bot)
            .sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
        this.cache.set(`category:${bot.category}`, updatedBots);
        return bot;
    }

    async deleteBot(id: string): Promise<void> {
        const bot = await this.botModel.findById(id).lean().exec();
        if (!bot) {
            throw new NotFoundException(`Bot with ID ${id} not found`);
        }
        await this.botModel.findByIdAndDelete(id).exec();
        // Update caches
        this.cache.del(`bot:${id}`);
        const cachedBots = this.cache.get<BotDocument[]>(`category:${bot.category}`) || [];
        const updatedBots = cachedBots
            .filter(b => b._id.toString() !== id)
            .sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
        this.cache.set(`category:${bot.category}`, updatedBots);
    }

    private async sendByCategoryWithFailover<T extends any[]>(
        category: ChannelCategory,
        sender: (botId: string, ...args: T) => Promise<boolean>,
        ...args: T
    ): Promise<boolean> {
        let availableBots = this.cache.get<BotDocument[]>(`category:${category}`);
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
                // Update lastUsed in pending stats for eventual DB flush
                const pendingStats = this.cache.get<Record<string, Partial<Bot['stats'] & { lastUsed?: Date }>>>('pendingStats') || {};
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

    async sendMessageByCategory(category: ChannelCategory, message: string, options?: SendMessageOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendMessageByBotId, message, options);
    }

    async sendPhotoByCategory(category: ChannelCategory, photo: string | Buffer, options?: PhotoOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendPhotoByBotId, photo, options);
    }

    async sendVideoByCategory(category: ChannelCategory, video: string | Buffer, options?: VideoOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendVideoByBotId, video, options);
    }

    async sendAudioByCategory(category: ChannelCategory, audio: string | Buffer, options?: AudioOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendAudioByBotId, audio, options);
    }

    async sendDocumentByCategory(category: ChannelCategory, document: string | Buffer, options?: DocumentOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendDocumentByBotId, document, options);
    }

    async sendVoiceByCategory(category: ChannelCategory, voice: string | Buffer, options?: VoiceOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendVoiceByBotId, voice, options);
    }

    async sendAnimationByCategory(category: ChannelCategory, animation: string | Buffer, options?: AnimationOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendAnimationByBotId, animation, options);
    }

    async sendStickerByCategory(category: ChannelCategory, sticker: string | Buffer, options?: StickerOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendStickerByBotId, sticker, options);
    }

    async sendMediaGroupByCategory(category: ChannelCategory, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendMediaGroupByBotId, media, options);
    }

    async sendMessageByBotId(botId: string, message: string, options?: SendMessageOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMessage(bot, message, options);
        if (success) {
            await this.updateBotStats(botId, 'messagesSent', bot);
        }
        return success;
    }

    async sendPhotoByBotId(botId: string, photo: string | Buffer, options?: PhotoOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendPhoto', photo, options);
        if (success) {
            await this.updateBotStats(botId, 'photosSent', bot);
        }
        return success;
    }

    async sendVideoByBotId(botId: string, video: string | Buffer, options?: VideoOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVideo', video, options);
        if (success) {
            await this.updateBotStats(botId, 'videosSent', bot);
        }
        return success;
    }

    async sendAudioByBotId(botId: string, audio: string | Buffer, options?: AudioOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAudio', audio, options);
        if (success) {
            await this.updateBotStats(botId, 'audiosSent', bot);
        }
        return success;
    }

    async sendDocumentByBotId(botId: string, document: string | Buffer, options?: DocumentOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendDocument', document, options);
        if (success) {
            await this.updateBotStats(botId, 'documentsSent', bot);
        }
        return success;
    }

    async sendVoiceByBotId(botId: string, voice: string | Buffer, options?: VoiceOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendVoice', voice, options);
        if (success) {
            await this.updateBotStats(botId, 'voicesSent', bot);
        }
        return success;
    }

    async sendAnimationByBotId(botId: string, animation: string | Buffer, options?: AnimationOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendAnimation', animation, options);
        if (success) {
            await this.updateBotStats(botId, 'animationsSent', bot);
        }
        return success;
    }

    async sendStickerByBotId(botId: string, sticker: string | Buffer, options?: StickerOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMedia(bot, 'sendSticker', sticker, options);
        if (success) {
            await this.updateBotStats(botId, 'stickersSent', bot);
        }
        return success;
    }

    async sendMediaGroupByBotId(botId: string, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMediaGroup(bot, media, options);
        if (success) {
            await this.updateBotStats(botId, 'mediaGroupsSent', bot);
        }
        return success;
    }

    private async executeSendMessage(bot: BotDocument, text: string, options?: SendMessageOptions): Promise<boolean> {
        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${bot.token}/sendMessage`,
                {
                    chat_id: bot.channelId,
                    text: `${process.env.clientId?.toUpperCase()}:\n\n${text}`,
                    parse_mode: options?.parseMode,
                    disable_web_page_preview: options?.disableWebPagePreview,
                    disable_notification: options?.disableNotification,
                    reply_to_message_id: options?.replyToMessageId,
                    allow_sending_without_reply: options?.allowSendingWithoutReply,
                    protect_content: options?.protectContent,
                    link_preview_options: options?.linkPreviewOptions,
                },
                { timeout: 15000 }
            );
            if (!response.data?.ok) {
                console.error(`Telegram API error for sendMessage with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        } catch (error) {
            parseError(error, `Failed to execute sendMessage for bot ${bot.username}`);
            return false;
        }
    }

    private async executeSendMedia(bot: BotDocument, method: string, media: Buffer | string, options: any = {}): Promise<boolean> {
        const formData = new FormData();
        formData.append('chat_id', bot.channelId);

        const mediaField = method.replace('send', '').toLowerCase();
        if (Buffer.isBuffer(media)) {
            formData.append(mediaField, media, `${mediaField}.${this.getDefaultExtension(mediaField)}`);
        } else {
            formData.append(mediaField, media);
        }

        if (options.caption) {
            formData.append('caption', `${process.env.clientId?.toUpperCase()}:\n\n${options.caption}`);
        }
        if (options.parseMode) formData.append('parse_mode', options.parseMode);
        if (options.disableNotification) formData.append('disable_notification', 'true');
        if (options.replyToMessageId) formData.append('reply_to_message_id', options.replyToMessageId.toString());
        if (options.allowSendingWithoutReply) formData.append('allow_sending_without_reply', 'true');
        if (options.protectContent) formData.append('protect_content', 'true');
        if (options.hasSpoiler) formData.append('has_spoiler', 'true');

        this.addMethodSpecificOptions(method, options, formData);

        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${bot.token}/${method}`,
                formData,
                { timeout: 30000, headers: formData.getHeaders() }
            );
            if (!response.data?.ok) {
                console.error(`Telegram API error for ${method} with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        } catch (error) {
            parseError(error, `Failed to execute ${method} for bot ${bot.username}`);
            return false;
        }
    }

    private async executeSendMediaGroup(bot: BotDocument, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean> {
        const formData = new FormData();
        formData.append('chat_id', bot.channelId);

        const mediaArray = media.map((item, i) => {
            const mediaObj: any = {
                type: item.type,
                media: Buffer.isBuffer(item.media) ? `attach://file${i}` : item.media,
            };
            if (item.caption) mediaObj.caption = `${process.env.clientId?.toUpperCase()}:\n\n${item.caption}`;
            if (item.parseMode) mediaObj.parse_mode = item.parseMode;
            if (item.hasSpoiler) mediaObj.has_spoiler = true;
            if (item.type === 'video') {
                if (item.duration) mediaObj.duration = item.duration;
                if (item.width) mediaObj.width = item.width;
                if (item.height) mediaObj.height = item.height;
                if (item.supportsStreaming) mediaObj.supports_streaming = true;
            }
            if (item.type === 'audio') {
                if (item.duration) mediaObj.duration = item.duration;
                if (item.performer) mediaObj.performer = item.performer;
                if (item.title) mediaObj.title = item.title;
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
            if (options.disableNotification) formData.append('disable_notification', 'true');
            if (options.replyToMessageId) formData.append('reply_to_message_id', options.replyToMessageId.toString());
            if (options.allowSendingWithoutReply) formData.append('allow_sending_without_reply', 'true');
            if (options.protectContent) formData.append('protect_content', 'true');
        }

        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${bot.token}/sendMediaGroup`,
                formData,
                { timeout: 30000, headers: formData.getHeaders() }
            );
            if (!response.data?.ok) {
                console.error(`Telegram API error for sendMediaGroup with bot ${bot.username}:`, response.data.description);
            }
            return response.data?.ok === true;
        } catch (error) {
            parseError(error, `Failed to execute sendMediaGroup for bot ${bot.username}`);
            return false;
        }
    }

    private async fetchUsername(token: string): Promise<string> {
        if (!token || typeof token !== 'string' || token.length < 10) {
            return '';
        }

        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, {
                timeout: 10000
            });
            return res.data?.ok ? res.data.result.username : '';
        } catch (error) {
            parseError(error, 'Failed fetching bot username:');
            return '';
        }
    }

    private async updateBotStats(botId: string, statField: keyof Bot['stats'], bot: BotDocument): Promise<void> {
        // Update in-memory bot stats
        const updatedBot = {
            ...bot,
            stats: {
                ...bot.stats,
                [statField]: bot.stats[statField] + 1,
            },
            lastUsed: new Date(),
        };

        // Update bot cache
        this.cache.set(`bot:${botId}`, updatedBot);

        // Update category cache
        const cachedBots = this.cache.get<BotDocument[]>(`category:${bot.category}`) || [];
        const updatedBots = cachedBots
            .map(b => b._id.toString() === botId ? updatedBot : b)
            .sort((a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime());
        this.cache.set(`category:${bot.category}`, updatedBots);

        // Add to pending stats updates
        const pendingStats = this.cache.get<Record<string, Partial<Bot['stats'] & { lastUsed?: Date }>>>('pendingStats') || {};
        pendingStats[botId] = pendingStats[botId] || {};
        pendingStats[botId][statField] = (pendingStats[botId][statField] || 0) + 1;
        pendingStats[botId].lastUsed = updatedBot.lastUsed;

        this.cache.set('pendingStats', pendingStats);

        // Flush immediately if too many pending updates
        if (Object.keys(pendingStats).length >= this.maxPendingUpdates) {
            await this.flushPendingStats();
        }
    }

    private getDefaultExtension(type: string): string {
        switch (type) {
            case 'photo': return 'jpg';
            case 'video': return 'mp4';
            case 'audio': return 'mp3';
            case 'document': return 'bin';
            default: return 'dat';
        }
    }

    private addMethodSpecificOptions(method: string, options: any, formData: FormData): void {
        if (method === 'sendVideo' || method === 'sendAnimation') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.width) formData.append('width', options.width.toString());
            if (options.height) formData.append('height', options.height.toString());
            if (options.supportsStreaming) formData.append('supports_streaming', 'true');
        }
        if (method === 'sendAudio') {
            if (options.duration) formData.append('duration', options.duration.toString());
            if (options.performer) formData.append('performer', options.performer);
            if (options.title) formData.append('title', options.title);
        }
        if (options.thumbnail) {
            if (Buffer.isBuffer(options.thumbnail)) {
                formData.append('thumbnail', options.thumbnail, 'thumbnail.jpg');
            } else {
                formData.append('thumbnail', options.thumbnail);
            }
        }
        if (method === 'sendDocument' && options.disableContentTypeDetection) {
            formData.append('disable_content_type_detection', 'true');
        }
        if (method === 'sendVoice' || method === 'sendVideoNote') {
            if (options.duration) formData.append('duration', options.duration.toString());
        }
        if (method === 'sendVideoNote' && options.length) {
            formData.append('length', options.length.toString());
        }
        if (method === 'sendSticker' && options.emoji) {
            formData.append('emoji', options.emoji);
        }
    }

    async getBotStatsByCategory(category: ChannelCategory): Promise<any> {
        const cacheKey = `stats:${category}`;
        const cachedStats = this.cache.get<any>(cacheKey);
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
}