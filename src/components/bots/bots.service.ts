import { Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import FormData from 'form-data';
import NodeCache from 'node-cache';
import * as schedule from 'node-schedule-tz';
import { parseError } from '../../utils';
import { Bot, BotDocument } from './schemas/bot.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { UsersService } from '../users/users.service';

export enum ChannelCategory {
    CLIENT_UPDATES = 'CLIENT_UPDATES',
    USER_WARNINGS = 'USER_WARNINGS',
    VC_WARNINGS = 'VC_WARNINGS',
    USER_REQUESTS = 'USER_REQUESTS',
    VC_NOTIFICATIONS = 'VC_NOTIFICATIONS',
    CHANNEL_NOTIFICATIONS = 'CHANNEL_NOTIFICATIONS',
    ACCOUNT_NOTIFICATIONS = 'ACCOUNT_NOTIFICATIONS',
    ACCOUNT_LOGIN_FAILURES = 'ACCOUNT_LOGIN_FAILURES',
    ACCOUNT_LOGINS = 'ACCOUNT_LOGINS',
    PROMOTION_ACCOUNT = 'PROMOTION_ACCOUNT',
    CLIENT_ACCOUNT = 'CLIENT_ACCOUNT',
    PAYMENT_FAIL_QUERIES = 'PAYMENT_FAIL_QUERIES',
    SAVED_MESSAGES = 'SAVED_MESSAGES',
    HTTP_FAILURES = 'HTTP_FAILURES',
    UNVDS = 'UNVDS',
    PROM_LOGS1 = 'PROM_LOGS1',
    PROM_LOGS2 = 'PROM_LOGS2',
    UNAUTH_CALLS = 'UNAUTH_CALLS',
    CLIENT_PROMOTIONS_1 = 'CLIENT_PROMOTIONS_1',
    CLIENT_PROMOTIONS_2 = 'CLIENT_PROMOTIONS_2',
}

/** Minimal fields the replacement flow needs from a dead bot (plain, not a Mongoose doc). */
export interface DeadBotInfo {
    username: string;
    category: ChannelCategory;
    channelId: string;
    token: string;
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

export type PhotoOptions = MediaOptions;
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

export type MediaGroupOptions = Omit<SendMessageOptions, 'parseMode' | 'disableWebPagePreview' | 'linkPreviewOptions'>;

@Injectable()
export class BotsService implements OnModuleInit, OnModuleDestroy {
    private cache: NodeCache;
    private readonly flushInterval = 300000; // 5 minutes in milliseconds
    private readonly maxPendingUpdates = 100; // Max pending updates before forcing a flush

    // ---- Daily health-check + auto-replace config ----
    private static readonly HEALTH_JOB_NAME = 'bot-health-check';
    private static readonly HEALTH_JOB_CRON = '30 3 * * *'; // daily 03:30, off-peak
    private static readonly HEALTH_JOB_TZ = 'Asia/Kolkata';
    // Conservative: replace at most this many dead bots per run to avoid BotFather rate-limits / flags.
    private readonly maxReplacementsPerRun = 1;
    private healthCheckJob: schedule.Job | null = null;
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private destroyed = false;
    private replaceInProgress = false;

    constructor(
        @InjectModel(Bot.name) private botModel: Model<BotDocument>,
        @Inject(forwardRef(() => TelegramService)) private readonly telegramService: TelegramService,
        @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    ) {
        // Initialize cache with a TTL of 5 minutes (300 seconds) and check period of 60 seconds
        this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    }

    async onModuleInit(): Promise<void> {
        await this.initializeCache();
        // Start periodic flush of pending stat updates (safe to run on every pod — it only
        // writes each pod's own accumulated counters).
        this.startPeriodicFlush();
        // The daily bot health-check + auto-replace loop is DANGEROUS to run on more than one
        // pod at once: N pods = N concurrent BotFather bot-creations + admin-promotion bursts,
        // which is exactly what gets the manager account flood-banned. There is no cross-pod
        // lock here (replaceInProgress is per-process only), so we gate the scheduler behind an
        // env flag the operator sets on EXACTLY ONE pod. Default OFF — no pod runs it unless
        // explicitly enabled.
        if (this.isBotHealthJobEnabled()) {
            console.log('[BotHealth] BOT_HEALTH_JOB_ENABLED is set on this pod — scheduling daily job');
            this.scheduleBotHealthCheck();
        } else {
            console.log('[BotHealth] daily job disabled on this pod (set BOT_HEALTH_JOB_ENABLED=true on ONE pod to enable)');
        }
    }

    /**
     * Whether THIS pod should run the daily bot-health scheduler. Must be enabled on exactly
     * ONE pod to avoid concurrent BotFather bursts across replicas (ban risk). The manual
     * POST /bots/validate-and-replace endpoint is NOT gated by this — it's an explicit operator
     * action, but it shares the same per-process replaceInProgress guard.
     */
    private isBotHealthJobEnabled(): boolean {
        const v = (process.env.BOT_HEALTH_JOB_ENABLED || '').trim().toLowerCase();
        return v === 'true' || v === '1' || v === 'yes' || v === 'on';
    }

    private scheduleBotHealthCheck(): void {
        // Daily cron via node-schedule-tz (timezone-aware, no manual re-arm/drift), matching the
        // platform's scheduling convention. Runs off-peak. scheduleJob returns a Job we cancel on
        // destroy. The job body catches its own errors so a failure never kills the schedule.
        this.healthCheckJob = schedule.scheduleJob(
            BotsService.HEALTH_JOB_NAME,
            BotsService.HEALTH_JOB_CRON,
            BotsService.HEALTH_JOB_TZ,
            async () => {
                if (this.destroyed) return;
                try {
                    await this.validateAndReplaceBots();
                } catch (err) {
                    parseError(err, '[BotHealth] daily validateAndReplaceBots failed', true);
                }
            },
        );
        console.log(`[BotHealth] daily bot health-check scheduled (cron '${BotsService.HEALTH_JOB_CRON}' ${BotsService.HEALTH_JOB_TZ})`);
    }

    onModuleDestroy(): void {
        this.destroyed = true;
        try { this.healthCheckJob?.cancel?.(); } catch { /* noop */ }
        this.healthCheckJob = null;
        if (this.flushTimer) { clearInterval(this.flushTimer); this.flushTimer = null; }
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
        this.flushTimer = setInterval(async () => {
            await this.flushPendingStats();
        }, this.flushInterval);
        this.flushTimer.unref?.();
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
        // For "all bots" we cannot trust per-category caches: only some categories may be warm
        // (sendByCategoryWithFailover warms one at a time), and aggregating warm caches would
        // silently return an INCOMPLETE set. Use a dedicated all-bots cache key instead, and
        // fall back to the DB (refreshing both the all-bots and per-category caches).
        const ALL_BOTS_KEY = 'all-bots';
        const cachedAll = this.cache.get<BotDocument[]>(ALL_BOTS_KEY);
        if (cachedAll) {
            return cachedAll;
        }
        console.warn('Cache miss for all bots');
        const bots = await this.botModel.find().lean().exec();
        this.cache.set(ALL_BOTS_KEY, bots);
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

        // Exclude bots already known-dead (token revoked). They still live in the cache/DB
        // for reporting + replacement, but must never be selected for sending — that's what
        // produced repeated 401s. Fall back to the full list only if every bot is flagged
        // dead (better to try a maybe-recovered one than send nothing).
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

    async sendMessageByCategory(category: ChannelCategory, message: string, options?: SendMessageOptions, allowServiceName: boolean = true): Promise<boolean> {
        return this.sendByCategoryWithFailover(category, this.sendMessageByBotId, message, options, allowServiceName);
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

    async sendMessageByBotId(botId: string, message: string, options?: SendMessageOptions, allowServiceName: boolean = true): Promise<boolean> {
        const bot = await this.getBotById(botId);
        const success = await this.executeSendMessage(bot, message, options, allowServiceName);
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

    private async executeSendMessage(bot: BotDocument, text: string, options?: SendMessageOptions, allowServiceName: boolean = true): Promise<boolean> {
        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${bot.token}/sendMessage`,
                {
                    chat_id: bot.channelId,
                    text: `${allowServiceName ? `${process.env.clientId?.toUpperCase()}\n\n${text}` : text}`,
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
            console.error('Error fetching bot username with provided token:', error);
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

    // ════════════════════════════════════════════════════════════
    // Bot health check + auto-replacement (BotFather)
    // ════════════════════════════════════════════════════════════

    private readonly BOT_TOKEN_REGEX = /^\d+:[A-Za-z0-9_-]+$/;
    private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

    /**
     * Human-paced delay: a randomized gap so privileged actions (promoting a bot to admin via
     * a manager account) never look like a scripted burst — bursts are what trip Telegram's
     * anti-abuse and can get the manager account (@myvcacc) flagged/banned. Default 60–180s.
     */
    private humanDelay(minMs = 60_000, maxMs = 180_000): Promise<void> {
        const jitter = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs));
        return this.sleep(jitter);
    }

    /** True if an error looks like a Telegram rate-limit / spam-guard signal — abort on these. */
    private isFloodSignal(err: any): boolean {
        // GramJS surfaces flood info variously (.message, .errorMessage, .code) — check all.
        const m = [err?.message, err?.errorMessage, err?.code, String(err || '')].filter(Boolean).join(' ').toLowerCase();
        return /flood|too many|spam|420|peer_flood|slowmode/.test(m);
    }

    /**
     * Live-validate a token via getMe.
     *   'alive'     — HTTP 200, ok:true
     *   'dead'      — HTTP 401/403/404 (token revoked, bot blocked/deleted, or invalid) — disable
     *   'unknown'   — timeout / 5xx / 429 / network / any other — DO NOT disable (transient)
     * We deliberately keep 429 (rate limit) and 5xx (Telegram-side) as 'unknown' so a transient
     * blip never retires a live bot; only client-side permanent auth failures count as dead.
     */
    private async checkBotToken(token: string): Promise<'alive' | 'dead' | 'unknown'> {
        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 12000 });
            return res.data?.ok === true ? 'alive' : 'unknown';
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 401 || status === 403 || status === 404) return 'dead';
            return 'unknown';
        }
    }

    /**
     * Daily job: validate every bot, mark 401s inactive, and conservatively replace
     * dead bots via BotFather using a random healthy user account. Title = category,
     * description = "<creatorMobile> @<creatorUsername>". New bot is added to the dead
     * bot's channel as admin (via an admin account resolved from the channel).
     */
    async validateAndReplaceBots(): Promise<{ checked: number; alive: number; dead: number; unknown: number; replaced: number; failures: string[] }> {
        // Per-process guard: catches same-pod overlap (scheduled tick + a manual endpoint call).
        // Multi-pod safety is handled by the BOT_HEALTH_JOB_ENABLED env gate — the scheduler runs
        // on exactly ONE pod, so no cross-pod lock is needed.
        if (this.replaceInProgress) {
            console.warn('[BotHealth] validateAndReplaceBots already running on this pod — skipping');
            return { checked: 0, alive: 0, dead: 0, unknown: 0, replaced: 0, failures: ['already running (this pod)'] };
        }
        this.replaceInProgress = true;
        const failures: string[] = [];
        let alive = 0, dead = 0, unknown = 0, replaced = 0;
        const deadBots: DeadBotInfo[] = [];
        try {
            const bots = await this.botModel.find().lean().exec();
            for (const bot of bots) {
                const verdict = await this.checkBotToken(bot.token);
                if (verdict === 'alive') {
                    alive++;
                    // Recover: a previously-dead bot that now validates goes back to active.
                    if (bot.status === 'inactive') {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { status: 'active', deadReason: null }, $unset: { deadAt: '' } }).exec();
                    } else {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { lastValidatedAt: new Date() } }).exec();
                    }
                } else if (verdict === 'dead') {
                    dead++;
                    if (bot.status !== 'inactive') {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { status: 'inactive', deadReason: 'getMe 401 Unauthorized (token revoked)', deadAt: new Date() } }).exec();
                        console.warn(`[BotHealth] marked dead: @${bot.username} (${bot.category})`);
                    }
                    deadBots.push({ username: bot.username, category: bot.category, channelId: bot.channelId, token: bot.token });
                } else {
                    unknown++;
                }
                await this.sleep(1200); // space getMe calls to avoid Telegram rate-limits
            }

            // Persist any accumulated stat counters BEFORE flushing the cache — flushAll()
            // wipes the whole NodeCache including the unflushed `pendingStats` key, which would
            // silently drop message/media counters since the last 5-min flush.
            await this.flushPendingStats();
            // Invalidate caches so dead bots stop being selected immediately.
            this.cache.flushAll();

            // Conservatively replace dead bots (cap per run).
            const toReplace = deadBots.slice(0, this.maxReplacementsPerRun);
            for (const deadBot of toReplace) {
                try {
                    const newBot = await this.replaceDeadBot(deadBot);
                    if (newBot) replaced++;
                } catch (err: any) {
                    const msg = `replace @${deadBot.username} (${deadBot.category}): ${err?.message || err}`;
                    failures.push(msg);
                    parseError(err, `[BotHealth] ${msg}`, true);
                    // If BotFather rate-limited us, stop replacing this run.
                    if (/flood|too many|rate/i.test(err?.message || '')) {
                        failures.push('BotFather rate-limit hit — aborting further replacements this run');
                        break;
                    }
                }
            }

            await this.sendHealthSummary({ checked: bots.length, alive, dead, unknown, replaced, deadRemaining: deadBots.length - replaced, failures });
            return { checked: bots.length, alive, dead, unknown, replaced, failures };
        } finally {
            this.replaceInProgress = false;
        }
    }

    /** Create a replacement bot via BotFather and add it to the dead bot's channel. */
    private async replaceDeadBot(deadBot: DeadBotInfo): Promise<BotDocument | null> {
        const category = deadBot.category;
        const channelId = deadBot.channelId;

        // 1. Pick a random healthy creator account (alive session, not expired, our 2FA).
        const creator = await this.pickRandomHealthyUser();
        if (!creator) {
            throw new Error('no healthy user account available to create bot');
        }

        // 2. Create the bot via the existing BotFather automation.
        //    Title = category; description = "<mobile> @<username>".
        const creatorHandle = creator.username ? `@${creator.username}` : (creator.firstName || 'unknown');
        const description = `${creator.mobile} ${creatorHandle}`.slice(0, 512);
        const usernameSeed = `${category}`.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24); // BotFather appends _xxx_bot
        const { botToken, username } = await this.telegramService.createBot(creator.mobile, {
            name: `${category}`,
            username: usernameSeed,
            description,
            aboutText: description,
        });
        if (!botToken || !this.BOT_TOKEN_REGEX.test(botToken)) {
            throw new Error(`BotFather did not return a valid token (got: ${String(botToken).slice(0, 20)})`);
        }

        // 3. Persist the new bot as INACTIVE first. We only flip it to 'active' once it is
        //    VERIFIED admin in the channel (step 4). Persisting active-then-adding would leave
        //    a selectable-but-unusable bot in rotation if the channel-add silently fails.
        const saved = await this.createBot({ token: botToken, category, channelId, description });
        await this.botModel.updateOne(
            { _id: saved._id },
            { $set: { createdByMobile: creator.mobile, replacedBotUsername: deadBot.username, status: 'inactive', deadReason: 'awaiting channel-admin add', lastValidatedAt: new Date() } },
        ).exec();

        // 4. Add the new bot to its channel as admin AND verify it. Only on verified success
        //    do we activate it. On failure it stays inactive (never selected) + we alert.
        try {
            const botId = await this.addBotToChannelAsAdmin(channelId, botToken, username);
            const verified = await this.verifyBotIsChannelAdmin(channelId, botId);
            if (!verified) {
                throw new Error('post-add verification failed: bot is not listed as an admin of the channel');
            }
            await this.botModel.updateOne(
                { _id: saved._id },
                { $set: { status: 'active' }, $unset: { deadReason: '' } },
            ).exec();
            // Remove the OLD dead bot doc now that a verified replacement is live — otherwise
            // stale dead rows accumulate forever and keep inflating each run's dead count.
            try { await this.botModel.deleteOne({ token: deadBot.token }).exec(); } catch { /* non-fatal */ }
            await this.flushPendingStats(); // don't lose counters when we drop the cache next
            this.cache.flushAll(); // refresh caches so the now-active bot becomes selectable
        } catch (err: any) {
            parseError(err, `[BotHealth] created @${username} but failed to add/verify in channel ${channelId} — left INACTIVE`, true);
            await this.notify(`⚠️ <b>Bot replaced but NOT usable (left inactive)</b>\nCategory: ${category}\nNew bot: @${username}\nChannel: ${channelId}\nAction: add it as admin manually, then it self-activates on next health check.\nReason: ${err?.message || err}`);
            console.log(`[BotHealth] replaced dead @${deadBot.username} with @${username} (${category}) — created but NOT yet admin (inactive)`);
            // Return null: the bot exists but is INACTIVE/unusable, so the caller must NOT count
            // it as a successful replacement (else the summary overstates success + under-reports
            // deadRemaining). It will self-activate on a later run once it's actually admin.
            return null;
        }

        console.log(`[BotHealth] replaced dead @${deadBot.username} with @${username} (${category}) via ${creator.mobile} — active`);
        return saved;
    }

    /**
     * Resolve a channel admin (one of our accounts) and promote the new bot to admin there.
     * Returns the new bot's telegram id (for post-add verification). Throws if no admin account
     * can act, or on a flood/spam signal (to protect the manager account).
     * NOTE: setupBotInChannel swallows its own errors, so success is NOT guaranteed by it
     * returning — the caller MUST verify via verifyBotIsChannelAdmin.
     */
    private async addBotToChannelAsAdmin(channelId: string, botToken: string, botUsername: string): Promise<string> {
        const botInfo = await this.telegramService.getBotInfo(botToken);
        const botId = String(botInfo?.id ?? '');
        if (!botId) throw new Error('could not resolve new bot id from getBotInfo');

        const adminMobile = await this.resolveChannelAdminMobile(channelId);
        if (!adminMobile) throw new Error(`no controllable admin account found for channel ${channelId}`);

        // Human-paced: wait a randomized gap BEFORE the privileged promote so the manager
        // account's admin actions don't cluster into a scripted burst (ban risk).
        await this.humanDelay();
        try {
            await this.telegramService.setupBotInChannel(adminMobile, channelId, botId, botUsername, {
                changeInfo: true, postMessages: true, editMessages: true, deleteMessages: true,
                banUsers: true, inviteUsers: true, pinMessages: true, addAdmins: false,
                anonymous: true, manageCall: true,
            });
        } catch (err) {
            if (this.isFloodSignal(err)) {
                // Do NOT retry — a flood/spam signal on the manager account means back off entirely.
                throw new Error(`FLOOD/spam signal promoting via ${adminMobile} in ${channelId} — aborting to protect the manager account: ${(err as any)?.message || err}`);
            }
            throw err;
        }
        console.log(`[BotHealth] attempted add of @${botUsername} to channel ${channelId} via ${adminMobile}`);
        return botId;
    }

    /**
     * Read back the channel's admin list and confirm the bot id is present. Needed because
     * setupBotInChannel swallows failures — this is the only reliable success signal.
     */
    private async verifyBotIsChannelAdmin(channelId: string, botId: string): Promise<boolean> {
        // Small settle delay: admin membership can take a moment to propagate.
        await this.sleep(3000);
        for (const viewerMobile of [...this.getChannelManagerMobiles(), ...(await this.getHealthyAccountMobiles(10))]) {
            try {
                const admins = await this.telegramService.getGroupAdmins(viewerMobile, channelId);
                const ids = new Set((Array.isArray(admins) ? admins : []).map((a: any) => String(a?.id ?? a?.userId ?? a?.user?.id ?? '')));
                if (ids.size > 0) return ids.has(String(botId)); // a viewer that could read admins is authoritative
            } catch {
                continue; // this viewer can't read the channel — try the next
            }
        }
        return false; // couldn't confirm with any viewer → treat as not-verified (safe)
    }

    /**
     * Channel-operator accounts used to promote a freshly-created bot to admin, in priority
     * order. Configured in the `configuration` collection (loaded into process.env at boot):
     *   channelManagerPrimary  — the DEDICATED backup/operator account, tried FIRST so day-to-day
     *                            bot management never touches the critical service account.
     *   channelManagerBackup   — the critical service account (@myvcacc); LAST resort only, used
     *                            solely for channels where the primary operator isn't yet admin.
     * We only ever ACT through an account verified to be admin in the specific target channel
     * (see resolveChannelAdminMobile), so a configured-but-not-yet-admin primary simply gets
     * skipped for that channel rather than failing. Editable in DB without a redeploy; falls
     * back to a live admin scan if neither is set/usable.
     */
    private getChannelManagerMobiles(): string[] {
        return [process.env.channelManagerPrimary, process.env.channelManagerBackup]
            .map(m => (m || '').trim())
            .filter(Boolean);
    }

    /**
     * Find one of OUR accounts that is an admin of the channel, so it can promote the new
     * bot. Preference order (to protect the manager accounts, we only USE one that is verified
     * admin in THIS channel — never blind-fire):
     *   1. configured channel-manager accounts (primary then backup) — verify each is actually
     *      admin in this specific channel before using it,
     *   2. otherwise scan healthy accounts and match one against the channel's admin set.
     */
    private async resolveChannelAdminMobile(channelId: string): Promise<string | null> {
        // 1. Configured managers first — confirm the manager can see the channel AND is admin there.
        for (const managerMobile of this.getChannelManagerMobiles()) {
            try {
                const admins = await this.telegramService.getGroupAdmins(managerMobile, channelId);
                const adminIds = new Set((Array.isArray(admins) ? admins : []).map((a: any) => String(a?.id ?? a?.userId ?? a?.user?.id ?? '')));
                // Confirm the manager account itself is among the admins (so it can promote).
                const mgrUser = (await this.usersService.search({ mobile: managerMobile }))[0];
                const mgrTgId = mgrUser?.tgId ? String(mgrUser.tgId) : null;
                if (mgrTgId && adminIds.has(mgrTgId)) {
                    return managerMobile;
                }
            } catch {
                // this manager can't act on this channel — try the next / fall through to scan
            }
        }

        // 2. Fallback: try each healthy account as the "viewer" to read admins; return the
        //    first one of our accounts that appears among the channel's admin set.
        const candidates = await this.getHealthyAccountMobiles(15);
        for (const mobile of candidates) {
            try {
                const admins = await this.telegramService.getGroupAdmins(mobile, channelId);
                if (!Array.isArray(admins) || admins.length === 0) continue;
                const adminIds = new Set(admins.map((a: any) => String(a?.id ?? a?.userId ?? a?.user?.id ?? '')));
                // Match any of our accounts (with a live session) against the admin set — that
                // account can then promote the new bot.
                const ownMobile = await this.matchOwnMobileToAdminIds(adminIds);
                if (ownMobile) return ownMobile;
            } catch {
                continue; // this account can't see the channel — try next
            }
        }
        return null;
    }

    /** Map a set of admin telegram-ids back to one of our controllable account mobiles. */
    private async matchOwnMobileToAdminIds(adminIds: Set<string>): Promise<string | null> {
        if (adminIds.size === 0) return null;
        // Our accounts live in users (tgId) — find one whose tgId is an admin AND has a session.
        const users = await this.usersService.search({ expired: false });
        for (const u of users) {
            if (u.tgId && adminIds.has(String(u.tgId)) && u.session && String(u.session).trim()) {
                return u.mobile;
            }
        }
        return null;
    }

    private shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /**
     * Pick a healthy account to drive BotFather. Prefers the CONFIGURED channel-manager
     * accounts (known-good, controllable) — falling back to a random users-collection account
     * only if no manager is usable. NOTE: a non-empty `session` string in the DB is a weak
     * signal (dead sessions linger), so managers-first materially improves the odds the
     * BotFather connect actually succeeds. (search() caps at 200 rows, so this is best-effort.)
     */
    private async pickRandomHealthyUser(): Promise<{ mobile: string; username?: string | null; firstName?: string | null } | null> {
        // 1. Prefer configured managers, resolving their identity from the users collection.
        for (const managerMobile of this.getChannelManagerMobiles()) {
            const u = (await this.usersService.search({ mobile: managerMobile }))[0];
            if (u && u.session && String(u.session).trim()) {
                return { mobile: u.mobile, username: u.username, firstName: u.firstName };
            }
        }
        // 2. Fallback: random healthy user (shuffled so we don't always try the same stale one).
        const users = await this.usersService.search({ expired: false });
        const healthy = this.shuffle(users.filter(u => u.session && String(u.session).trim() && u.mobile));
        if (healthy.length === 0) return null;
        const pick = healthy[0];
        return { mobile: pick.mobile, username: pick.username, firstName: pick.firstName };
    }

    /**
     * Healthy account mobiles to use as channel viewers/admins. Managers first (most likely to
     * be admins of our channels), then a shuffled sample of other healthy accounts.
     */
    private async getHealthyAccountMobiles(limit: number): Promise<string[]> {
        const managers = this.getChannelManagerMobiles();
        const users = await this.usersService.search({ expired: false });
        const others = this.shuffle(
            users.filter(u => u.session && String(u.session).trim() && u.mobile).map(u => u.mobile),
        );
        // Dedupe while preserving manager-first order.
        const ordered: string[] = [];
        for (const m of [...managers, ...others]) {
            if (m && !ordered.includes(m)) ordered.push(m);
            if (ordered.length >= limit) break;
        }
        return ordered;
    }

    private async notify(html: string): Promise<void> {
        try {
            await this.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, html, { parseMode: 'HTML' });
        } catch (err) {
            console.error('[BotHealth] failed to send notification:', err);
        }
    }

    private async sendHealthSummary(s: { checked: number; alive: number; dead: number; unknown: number; replaced: number; deadRemaining: number; failures: string[] }): Promise<void> {
        const lines = [
            '<b>Bot Health Check</b>',
            `Checked: ${s.checked} | Alive: ${s.alive} | Dead: ${s.dead} | Unknown: ${s.unknown}`,
            `Replaced this run: ${s.replaced} | Dead remaining: ${s.deadRemaining}`,
        ];
        if (s.failures.length) lines.push(`<b>Failures:</b>\n${s.failures.map(f => `• ${f}`).join('\n')}`);
        await this.notify(lines.join('\n'));
    }
}