import { BadRequestException, Injectable, NotFoundException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import FormData from 'form-data';
import NodeCache from 'node-cache';
import * as schedule from 'node-schedule-tz';
import { parseError } from '../../utils';
import { Bot, BotDocument, BotLifecycle } from './schemas/bot.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { UsersService } from '../users/users.service';

// ChannelCategory lives in ./channel-category.enum to break a circular import
// (create-bot.dto -> bots.service -> TelegramService -> ... -> create-bot.dto).
import { ChannelCategory } from './channel-category.enum';

/** Minimal fields the replacement flow needs from a dead bot (plain, not a Mongoose doc). */
export interface DeadBotInfo {
    username: string;
    category: ChannelCategory;
    channelId: string;
    token: string;
}

interface TokenCheckResult {
    verdict: 'alive' | 'dead' | 'unknown';
    status?: number;
}

interface BotHealthRunOptions {
    /** Reads and validates tokens, but never writes bot state or touches Telegram user accounts. */
    dryRun?: boolean;
}

export interface BotHealthRunResult {
    checked: number;
    alive: number;
    dead: number;
    unknown: number;
    replaced: number;
    toppedUp: number;
    failures: string[];
    dryRun: boolean;
    proposedActions: string[];
    /**
     * Categories whose CHANNEL is unreachable (getChat "chat not found" / bot not a member).
     * A bot can pass getMe (token alive) and still be unable to post because the channel itself
     * is dead — the exact blind spot that let the FailedPayments channel sit dead unnoticed.
     * Empty on a healthy run.
     */
    deadChannels: string[];
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
    // Every category should keep at least this many HEALTHY (active + admin-verified) bots so a
    // single dead bot never leaves a channel dark. After the dead-replacement pass, the health run
    // tops up any category below this floor by provisioning fresh bots (random creator → BotFather
    // → channel-admin add → verify).
    private readonly minHealthyBotsPerCategory = 2;
    // Replacement and redundancy top-up share one BotFather creation budget. A run can never
    // turn one dead token plus two low categories into a burst of privileged Telegram actions.
    private readonly maxBotCreationsPerRun = 1;
    private readonly maxPendingAdminRepairsPerRun = 1;
    private readonly maxPendingAdminRepairAttempts = 3;
    private healthCheckJob: schedule.Job | null = null;
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private destroyed = false;
    private replaceInProgress = false;

    constructor(
        @InjectModel(Bot.name) private botModel: Model<BotDocument>,
        private readonly moduleRef: ModuleRef,
    ) {
        // Initialize cache with a TTL of 5 minutes (300 seconds) and check period of 60 seconds
        this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    }

    // Lazy, cycle-free access to Telegram/Users services. Injecting them via the constructor
    // creates a DI cycle (BotsModule<->TelegramModule/UsersModule) that NestJS can't resolve.
    // Resolving lazily through ModuleRef (strict:false) keeps BotsModule OUT of that cycle,
    // so BotsModule imports neither module. Only the bot-health path uses these.
    private get telegramService(): TelegramService {
        return this.moduleRef.get(TelegramService, { strict: false });
    }
    private get usersService(): UsersService {
        return this.moduleRef.get(UsersService, { strict: false });
    }

    async onModuleInit(): Promise<void> {
        try {
            await this.migrateLegacyLifecycle();
        } catch (err: any) {
            // Preserve CMS availability if Mongo is briefly unavailable at boot. Legacy records
            // are still classified safely in-memory by lifecycleOf until the next health run.
            console.error('[BotHealth] lifecycle migration deferred; Mongo unavailable at startup', err?.message || err);
        }
        await this.initializeCache();
        // Start periodic flush of pending stat updates (safe to run on every pod — it only
        // writes each pod's own accumulated counters).
        this.startPeriodicFlush();
        if (this.isCmsSchedulerEnabled()) {
            console.log('[BotHealth] ENABLE_CMS_SCHEDULER is set on CMS — scheduling daily job');
            this.scheduleBotHealthCheck();
        } else {
            console.log('[BotHealth] daily job disabled on CMS (set ENABLE_CMS_SCHEDULER=true to enable)');
        }
    }

    private isCmsSchedulerEnabled(): boolean {
        const value = (process.env.ENABLE_CMS_SCHEDULER || '').trim().toLowerCase();
        return value === 'true' || value === '1' || value === 'yes' || value === 'on';
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

    /** Map pre-lifecycle documents once, retaining their legacy fields for old callers. */
    private async migrateLegacyLifecycle(): Promise<void> {
        const legacyBots = await this.botModel.find({ lifecycle: { $exists: false } }).lean().exec();
        if (legacyBots.length === 0) return;
        const now = new Date();
        await this.botModel.bulkWrite(legacyBots.map(bot => ({
            updateOne: {
                filter: { _id: bot._id, lifecycle: { $exists: false } },
                update: { $set: this.legacyLifecycleUpdate(bot, now) },
            },
        })));
        console.log(`[BotHealth] migrated lifecycle metadata for ${legacyBots.length} legacy bot record(s)`);
    }

    private legacyLifecycleUpdate(bot: Partial<Bot>, now = new Date()): Pick<Bot, 'lifecycle' | 'lifecycleReason' | 'lifecycleUpdatedAt' | 'repairAttempts'> {
        const reason = bot.deadReason || '';
        if (bot.status !== 'inactive') {
            return { lifecycle: 'active_verified', lifecycleReason: 'migrated legacy active record', lifecycleUpdatedAt: now, repairAttempts: 0 };
        }
        if (/awaiting.*admin|admin.*add/i.test(reason)) {
            return { lifecycle: 'pending_admin', lifecycleReason: reason || 'migrated pending channel-admin verification', lifecycleUpdatedAt: now, repairAttempts: 0 };
        }
        if (/getme|token|unauthori[sz]ed|revoked|invalid/i.test(reason)) {
            return { lifecycle: 'dead_token', lifecycleReason: reason || 'migrated token failure', lifecycleUpdatedAt: now, repairAttempts: 0 };
        }
        return { lifecycle: 'manual_attention', lifecycleReason: reason || 'migrated inactive record with unknown cause', lifecycleUpdatedAt: now, repairAttempts: 0 };
    }

    private lifecycleOf(bot: Partial<Bot>): BotLifecycle {
        if (bot.lifecycle) return bot.lifecycle;
        return this.legacyLifecycleUpdate(bot).lifecycle;
    }

    private isSelectable(bot: Partial<Bot>): boolean {
        return this.lifecycleOf(bot) === 'active_verified';
    }

    private nextRepairDate(attempts: number, now = Date.now()): Date {
        // 5m, 10m, 20m ... capped at 24h. Pending-admin reconciliation is intentionally slow.
        const delay = Math.min(24 * 60 * 60 * 1000, 5 * 60 * 1000 * (2 ** Math.max(0, attempts - 1)));
        return new Date(now + delay);
    }

    private async refreshBotCache(): Promise<void> {
        await this.flushPendingStats();
        this.cache.flushAll();
    }

    /** Remove a newly unsafe bot from warm send caches without dropping pending stat counters. */
    private evictBotFromSendCache(bot: Partial<Bot> & { _id?: any }): void {
        const id = bot._id?.toString();
        if (!id || !bot.category) return;
        this.cache.del(`bot:${id}`);
        const categoryKey = `category:${bot.category}`;
        const cached = this.cache.get<BotDocument[]>(categoryKey);
        if (cached) this.cache.set(categoryKey, cached.filter(item => item._id.toString() !== id));
        this.cache.del('all-bots');
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

    /** Registering a token through the public API never makes it send-eligible. */
    async createBot(createBotDto: {
        token: string;
        category: ChannelCategory;
        channelId: string;
        description?: string;
    }): Promise<BotDocument> {
        // Pick fields explicitly: global validation intentionally preserves unknown properties for
        // older APIs, but callers must not be able to smuggle a lifecycle into this path.
        const { token, category, channelId, description } = createBotDto;
        return this.createBotRecord({
            token,
            category,
            channelId,
            description,
            lifecycle: 'pending_admin',
            lifecycleReason: 'awaiting channel-admin verification',
        });
    }

    /** Internal-only persistence path used by BotFather provisioning. */
    private async createBotRecord(createBotDto: {
        token: string;
        category: ChannelCategory;
        channelId: string;
        description?: string;
        lifecycle?: BotLifecycle;
        lifecycleReason?: string;
        createdByMobile?: string;
        replacedBotUsername?: string;
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
            // A manually registered token is not proof that the bot is an admin in its target
            // channel. It remains non-selectable until the reconciliation verifies membership.
            lifecycle: createBotDto.lifecycle || 'pending_admin',
            lifecycleReason: createBotDto.lifecycleReason || 'awaiting channel-admin verification',
            lifecycleUpdatedAt: new Date(),
            repairAttempts: 0,
            nextRepairAt: new Date(),
            status: createBotDto.lifecycle === 'active_verified' ? 'active' : 'inactive',
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
        this.cache.del('all-bots');
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
        const lifecycleFields: Array<keyof Bot> = [
            'status', 'lifecycle', 'lifecycleReason', 'lifecycleUpdatedAt',
            'lastValidatedAt', 'lastAdminVerifiedAt', 'repairAttempts', 'nextRepairAt',
            'deadStatus', 'deadReason', 'deadAt', 'createdByMobile', 'replacedBotUsername',
        ];
        if (lifecycleFields.some(field => updateBotDto[field] !== undefined)) {
            throw new BadRequestException('Bot lifecycle fields are managed only by the health workflow');
        }
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

        // Do not ever fall back to inactive, pending-admin, or manual-attention records. A
        // valid token is not enough to send: only a separately verified channel admin is safe.
        availableBots = availableBots.filter(bot => this.isSelectable(bot));

        if (availableBots.length === 0) {
            await this.alertCategoryUnhealthy(category);
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

    private async alertCategoryUnhealthy(category: ChannelCategory): Promise<void> {
        const key = `category-unhealthy-alert:${category}`;
        if (this.cache.get<boolean>(key)) return;
        this.cache.set(key, true, 60 * 60);
        console.error(JSON.stringify({ event: 'bot_category_unhealthy', category, requiredLifecycle: 'active_verified' }));
        // Avoid recursive notification attempts if the notification category itself is unhealthy.
        if (category !== ChannelCategory.ACCOUNT_NOTIFICATIONS) {
            await this.notify(`<b>Bot category unhealthy</b>\nCategory: ${category}\nNo verified active bot is eligible to send. Repair is required.`);
        }
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
        if (!this.isSelectable(bot)) {
            console.warn(`[BotHealth] refused direct send through non-verified bot @${bot.username}`);
            return false;
        }
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
        if (!this.isSelectable(bot)) {
            console.warn(`[BotHealth] refused direct ${method} through non-verified bot @${bot.username}`);
            return false;
        }
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
        if (!this.isSelectable(bot)) {
            console.warn(`[BotHealth] refused direct sendMediaGroup through non-verified bot @${bot.username}`);
            return false;
        }
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
     * anti-abuse. A short 10–20s jitter is enough to avoid a scripted-burst pattern while keeping
     * a run responsive (the per-run replacement/top-up caps already bound total volume).
     */
    private humanDelay(minMs = 10_000, maxMs = 20_000): Promise<void> {
        const jitter = minMs + Math.floor(Math.random() * Math.max(1, maxMs - minMs));
        return this.sleep(jitter);
    }

    /** True if an error looks like a Telegram rate-limit / spam-guard signal — abort on these. */
    private isFloodSignal(err: any): boolean {
        // GramJS surfaces flood info variously (.message, .errorMessage, .code) — check all.
        const m = [err?.message, err?.errorMessage, err?.code, String(err || '')].filter(Boolean).join(' ').toLowerCase();
        return /flood|too many|rate.?limit|spam|420|peer_flood|slowmode/.test(m);
    }

    /**
     * Live-validate a token via getMe.
     *   'alive'     — HTTP 200, ok:true
     *   'dead'      — HTTP 401/403/404 (token revoked, bot blocked/deleted, or invalid) — disable
     *   'unknown'   — timeout / 5xx / 429 / network / any other — DO NOT disable (transient)
     * We deliberately keep 429 (rate limit) and 5xx (Telegram-side) as 'unknown' so a transient
     * blip never retires a live bot; only client-side permanent auth failures count as dead.
     */
    private async checkBotToken(token: string): Promise<TokenCheckResult> {
        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 12000 });
            return res.data?.ok === true ? { verdict: 'alive', status: res.status } : { verdict: 'unknown', status: res.status };
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 401 || status === 403 || status === 404) return { verdict: 'dead', status };
            return { verdict: 'unknown', status };
        }
    }

    /**
     * Probe whether a bot can actually reach its target CHANNEL via getChat.
     *   'alive'   — getChat ok:true (channel exists and this bot is a member).
     *   'dead'    — 400 "chat not found" / 403 "bot is not a member"/"kicked" — the channel is
     *               unreachable for this bot; sends will silently no-op.
     *   'unknown' — timeout / 5xx / 429 / network — transient, do NOT treat as dead.
     * getMe proves only the TOKEN is alive; this proves the CHANNEL is postable. The gap between
     * the two is exactly what let the FailedPayments channel sit dead unnoticed.
     */
    private async probeChannelAlive(token: string, channelId: string): Promise<'alive' | 'dead' | 'unknown'> {
        try {
            const res = await axios.get(`https://api.telegram.org/bot${token}/getChat`, {
                params: { chat_id: channelId }, timeout: 12000,
            });
            return res.data?.ok === true ? 'alive' : 'unknown';
        } catch (error: any) {
            const status = error?.response?.status;
            const desc = String(error?.response?.data?.description || '').toLowerCase();
            if (status === 400 && desc.includes('chat not found')) return 'dead';
            if (status === 403 && (desc.includes('not a member') || desc.includes('kicked') || desc.includes('bot was blocked'))) return 'dead';
            if (status === 400 || status === 404) return 'dead';
            return 'unknown';
        }
    }

    /**
     * Category-channel canary: for every category that has at least one live bot, verify the
     * category's CHANNEL is actually reachable (getChat). Returns the list of categories whose
     * channel is dead. This is the check missing from getMe + admin-reconcile: those confirm the
     * token is alive and (for pending bots) that the bot is a channel admin, but NEVER that the
     * channel itself still exists / is postable. A dead channel (e.g. deleted, or the bot removed)
     * therefore fails every send as a swallowed log line, indefinitely, with no operator signal.
     *
     * One getChat per distinct (category, channelId) using that category's own live bot token, so
     * the probe uses a token that SHOULD be a member. Alerting is folded into the health summary,
     * and additionally emitted to stderr (console.error) — an independent, non-Telegram trace, so a
     * dead ACCOUNT_NOTIFICATIONS channel (the alert channel itself) still leaves a footprint.
     */
    private async probeCategoryChannels(bots: Array<Partial<Bot>>): Promise<string[]> {
        // One representative live bot per (category → channelId). Skip dead-token / no-channel bots.
        const probes = new Map<string, { category: string; channelId: string; token: string }>();
        for (const bot of bots) {
            if (!bot.channelId || !bot.token) continue;
            if (this.lifecycleOf(bot) === 'dead_token') continue;
            const key = `${bot.category}::${bot.channelId}`;
            if (!probes.has(key)) probes.set(key, { category: String(bot.category), channelId: bot.channelId, token: bot.token });
        }

        const deadChannels: string[] = [];
        for (const { category, channelId, token } of probes.values()) {
            const verdict = await this.probeChannelAlive(token, channelId);
            if (verdict === 'dead') {
                deadChannels.push(`${category} (channel ${channelId})`);
                // Independent-of-Telegram trace: if the dead channel IS the alert channel, the
                // health-summary send will also fail — this stderr line is the only surviving signal.
                console.error(JSON.stringify({ event: 'dead_channel_detected', category, channelId }));
            }
            await this.sleep(1200); // space getChat calls, same pacing as getMe
        }
        return deadChannels;
    }

    /**
     * Daily job: validate every bot, mark 401s inactive, and conservatively replace
     * dead bots via BotFather using a random healthy user account. Title = category,
     * description = "<creatorMobile> @<creatorUsername>". New bot is added to the dead
     * bot's channel as admin (via an admin account resolved from the channel).
     */
    async validateAndReplaceBots(options: BotHealthRunOptions = {}): Promise<BotHealthRunResult> {
        const empty = (failure: string): BotHealthRunResult => ({
            checked: 0, alive: 0, dead: 0, unknown: 0, replaced: 0, toppedUp: 0,
            failures: [failure], dryRun: Boolean(options.dryRun), proposedActions: [], deadChannels: [],
        });
        // Per-process guard: catches same-pod overlap (scheduled tick + a manual endpoint call).
        if (this.replaceInProgress) {
            console.warn('[BotHealth] validateAndReplaceBots already running on this pod — skipping');
            return empty('already running (this pod)');
        }
        this.replaceInProgress = true;
        const failures: string[] = [];
        const proposedActions: string[] = [];
        let alive = 0, dead = 0, unknown = 0, replaced = 0;
        const deadBots: DeadBotInfo[] = [];
        let creationBudget = this.maxBotCreationsPerRun;
        let stopPrivilegedWork = false;
        try {
            if (!options.dryRun) await this.migrateLegacyLifecycle();
            const bots = await this.botModel.find().lean().exec();
            for (const bot of bots) {
                const check = await this.checkBotToken(bot.token);
                const lifecycle = this.lifecycleOf(bot);
                if (check.verdict === 'alive') {
                    alive++;
                    // Only an explicitly token-retired record may recover from getMe. A pending
                    // channel-admin record stays pending until membership is separately proved.
                    if (lifecycle === 'dead_token') {
                        proposedActions.push(`recover @${bot.username} from dead_token after live getMe`);
                        if (!options.dryRun) {
                            await this.botModel.updateOne({ _id: bot._id, lifecycle: 'dead_token' }, {
                                $set: { lifecycle: 'active_verified', lifecycleReason: 'token recovered by getMe', lifecycleUpdatedAt: new Date(), status: 'active', lastValidatedAt: new Date(), repairAttempts: 0 },
                                $unset: { deadAt: '', deadReason: '', deadStatus: '', nextRepairAt: '' },
                            }).exec();
                        }
                    } else if (!options.dryRun) {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { lastValidatedAt: new Date() } }).exec();
                    }
                } else if (check.verdict === 'dead') {
                    dead++;
                    if (lifecycle !== 'dead_token') {
                        proposedActions.push(`retire @${bot.username} as dead_token (getMe ${check.status})`);
                        if (!options.dryRun) {
                            await this.botModel.updateOne({ _id: bot._id }, {
                                $set: { lifecycle: 'dead_token', lifecycleReason: `getMe ${check.status} permanent token failure`, lifecycleUpdatedAt: new Date(), status: 'inactive', deadReason: `getMe ${check.status} permanent token failure`, deadStatus: check.status, deadAt: new Date() },
                                $unset: { nextRepairAt: '' },
                            }).exec();
                            this.evictBotFromSendCache(bot);
                        }
                        console.warn(`[BotHealth] marked dead: @${bot.username} (${bot.category})`);
                    }
                    deadBots.push({ username: bot.username, category: bot.category, channelId: bot.channelId, token: bot.token });
                } else {
                    unknown++;
                    const attempts = (bot.repairAttempts || 0) + 1;
                    proposedActions.push(`retry token validation for @${bot.username} after transient ${check.status || 'network'} failure`);
                    if (!options.dryRun) {
                        await this.botModel.updateOne({ _id: bot._id }, { $set: { nextRepairAt: this.nextRepairDate(attempts) } }).exec();
                    }
                }
                await this.sleep(1200); // space getMe calls to avoid Telegram rate-limits
            }

            if (!options.dryRun) await this.refreshBotCache();

            // Per-run cache of channel controllability (channelId -> admin mobile | null). Shared by
            // reconcile + top-up so resolveChannelAdminMobile (Telegram admin-list scans) runs at
            // most once per channel per run, and both paths make the SAME create/skip decision.
            const controllability = new Map<string, string | null>();

            const pendingRepair = await this.reconcilePendingAdminBots(options, controllability);
            failures.push(...pendingRepair.failures);
            proposedActions.push(...pendingRepair.proposedActions);
            stopPrivilegedWork = pendingRepair.stopPrivilegedWork;

            // Retire only permanently dead tokens. Replacement and top-up consume the same
            // single creation budget, and any flood/spam signal stops all remaining work.
            for (const deadBot of deadBots) {
                if (creationBudget <= 0 || stopPrivilegedWork) break;
                try {
                    proposedActions.push(`replace dead @${deadBot.username} in ${deadBot.category}`);
                    creationBudget--;
                    if (!options.dryRun) {
                        const newBot = await this.replaceDeadBot(deadBot);
                        if (newBot) replaced++;
                    }
                } catch (err: any) {
                    const msg = `replace @${deadBot.username} (${deadBot.category}): ${err?.message || err}`;
                    failures.push(msg);
                    parseError(err, `[BotHealth] ${msg}`, true);
                    if (this.isFloodSignal(err)) {
                        failures.push('flood/spam signal — aborting all remaining repair work this run');
                        stopPrivilegedWork = true;
                        break;
                    }
                }
            }

            // Redundancy top-up: after replacing dead bots, ensure every category still has at
            // least minHealthyBotsPerCategory live bots (so one death never leaves a channel dark).
            let toppedUp = 0;
            if (!stopPrivilegedWork && creationBudget > 0) {
                try {
                    const topUp = await this.topUpCategoriesToMinHealthy(creationBudget, options.dryRun, controllability);
                    toppedUp = topUp.toppedUp;
                    creationBudget -= topUp.creationAttempts;
                    failures.push(...topUp.topUpFailures);
                    proposedActions.push(...topUp.proposedActions);
                    stopPrivilegedWork = topUp.stopPrivilegedWork;
                } catch (err: any) {
                    const msg = `top-up pass failed: ${err?.message || err}`;
                    failures.push(msg);
                    parseError(err, `[BotHealth] ${msg}`, false);
                }
            }

            // Canary: verify each configured category's CHANNEL is still reachable (getChat), not
            // just that the tokens are alive. Runs in dry-run too — it's read-only (no mutations).
            const deadChannels = await this.probeCategoryChannels(bots);
            for (const dc of deadChannels) failures.push(`DEAD CHANNEL: ${dc} — sends silently no-op; repair/rotate the channel`);

            if (!options.dryRun) {
                await this.sendHealthSummary({ checked: bots.length, alive, dead, unknown, replaced, toppedUp, deadRemaining: deadBots.length - replaced, failures });
            }
            return { checked: bots.length, alive, dead, unknown, replaced, toppedUp, failures, dryRun: Boolean(options.dryRun), proposedActions, deadChannels };
        } finally {
            this.replaceInProgress = false;
        }
    }

    /** Reconcile pending bot records without treating a valid token as proof of channel access. */
    private async reconcilePendingAdminBots(options: BotHealthRunOptions, controllability: Map<string, string | null>): Promise<{ failures: string[]; proposedActions: string[]; stopPrivilegedWork: boolean }> {
        const failures: string[] = [];
        const proposedActions: string[] = [];
        const now = new Date();
        let stopPrivilegedWork = false;
        const pending = await this.botModel
            .find({ lifecycle: 'pending_admin', $or: [{ nextRepairAt: { $exists: false } }, { nextRepairAt: { $lte: now } }] })
            .sort({ nextRepairAt: 1, createdAt: 1 })
            .limit(this.maxPendingAdminRepairsPerRun)
            .lean()
            .exec();

        for (const bot of pending) {
            const attempts = bot.repairAttempts || 0;
            if (attempts >= this.maxPendingAdminRepairAttempts) {
                proposedActions.push(`move @${bot.username} to manual_attention after ${attempts} failed admin repairs`);
                if (!options.dryRun) {
                    await this.botModel.updateOne({ _id: bot._id, lifecycle: 'pending_admin' }, {
                        $set: { lifecycle: 'manual_attention', lifecycleReason: 'channel-admin verification retry limit reached', lifecycleUpdatedAt: now, status: 'inactive' },
                        $unset: { nextRepairAt: '' },
                    }).exec();
                }
                continue;
            }
            if (options.dryRun) {
                // Dry-run validates tokens above, then reports the bounded reconciliation that a
                // real run would attempt. Do not connect accounts, query channel admins, trigger
                // fetchWithTimeout notifications, or perform any Telegram mutation (so the
                // controllability scan below is deliberately NOT run in dry-run).
                proposedActions.push(`reconcile pending-admin @${bot.username} in ${bot.channelId}`);
                continue;
            }
            // Skip bots whose channel is NOT controllable: re-adding can never succeed (no admin
            // account of ours), so retrying just hammers Telegram and burns the retry cap toward
            // manual_attention for a problem that isn't the bot's fault. Don't touch repairAttempts;
            // leave it pending so it auto-recovers once the channel is made controllable. The
            // top-up circuit-breaker raises the one alert. (Cache: at most one scan per channel/run.)
            if (!(await this.resolveChannelAdminCached(bot.channelId, controllability))) {
                proposedActions.push(`skip pending-admin @${bot.username}: channel ${bot.channelId} not controllable (no re-add possible)`);
                continue;
            }
            try {
                const info = await this.telegramService.getBotInfo(bot.token);
                const botId = String(info?.id || '');
                if (!botId) throw new Error('could not resolve pending bot id');
                const alreadyAdmin = await this.verifyBotIsChannelAdmin(bot.channelId, botId);
                if (alreadyAdmin) {
                    proposedActions.push(`activate verified pending-admin @${bot.username}`);
                    if (!options.dryRun) {
                        await this.botModel.updateOne({ _id: bot._id, lifecycle: 'pending_admin' }, {
                            $set: { lifecycle: 'active_verified', lifecycleReason: 'channel-admin membership verified', lifecycleUpdatedAt: now, lastAdminVerifiedAt: now, status: 'active', repairAttempts: attempts },
                            $unset: { deadReason: '', nextRepairAt: '' },
                        }).exec();
                    }
                    continue;
                }

                proposedActions.push(`add/verify pending-admin @${bot.username} in ${bot.channelId}`);
                if (!options.dryRun) {
                    await this.addBotToChannelAsAdmin(bot.channelId, bot.token, bot.username);
                    if (!(await this.verifyBotIsChannelAdmin(bot.channelId, botId))) {
                        throw new Error('post-add verification failed: bot is not listed as a channel admin');
                    }
                    await this.botModel.updateOne({ _id: bot._id, lifecycle: 'pending_admin' }, {
                        $set: { lifecycle: 'active_verified', lifecycleReason: 'channel-admin membership verified', lifecycleUpdatedAt: new Date(), lastAdminVerifiedAt: new Date(), status: 'active', repairAttempts: attempts },
                        $unset: { deadReason: '', nextRepairAt: '' },
                    }).exec();
                }
            } catch (err: any) {
                const nextAttempts = attempts + 1;
                const msg = `pending-admin @${bot.username}: ${err?.message || err}`;
                failures.push(msg);
                if (!options.dryRun) {
                    await this.botModel.updateOne({ _id: bot._id, lifecycle: 'pending_admin' }, {
                        $set: {
                            repairAttempts: nextAttempts,
                            lifecycleReason: `admin reconciliation failed: ${(err?.message || String(err)).slice(0, 180)}`,
                            lifecycleUpdatedAt: new Date(),
                            nextRepairAt: this.nextRepairDate(nextAttempts),
                            status: 'inactive',
                        },
                    }).exec();
                }
                if (this.isFloodSignal(err)) {
                    failures.push('flood/spam signal during pending-admin reconciliation — aborting remaining privileged work');
                    stopPrivilegedWork = true;
                    break;
                }
            }
        }
        if (!options.dryRun) await this.refreshBotCache();
        return { failures, proposedActions, stopPrivilegedWork };
    }

    /**
     * Provision ONE fresh bot for a category: random creator → BotFather create → persist inactive
     * → add to channel as admin → verify → activate. Returns the saved+active doc, or null if it
     * was created but couldn't be verified admin (left inactive; self-activates on a later run).
     * Shared by both dead-replacement and the min-healthy top-up so the create/add/verify logic
     * lives in exactly one place.
     */
    private async provisionBotForCategory(
        category: ChannelCategory,
        channelId: string,
        opts: { replacesUsername?: string } = {},
    ): Promise<{ saved: BotDocument; username: string; active: boolean }> {
        // 1. Get several random healthy creator candidates (NOT channel managers; foreign numbers
        //    preferred). We try them in order because any given account may be BotFather-restricted
        //    ("cannot create new bots") — we skip those and move to the next rather than failing.
        // One creator attempt per provision keeps the global creation budget meaningful. A
        // later run can choose a different healthy account after any non-flood failure.
        const candidates = await this.pickHealthyCreatorCandidates(1);
        if (candidates.length === 0) {
            throw new Error('no healthy user account available to create bot');
        }

        // 2. Create the bot via the existing BotFather automation, trying candidates until one works.
        //    Title = category; description = "<mobile> @<username>".
        const usernameSeed = `${category}`.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24); // BotFather appends _xxx_bot
        let creator: { mobile: string; username?: string | null; firstName?: string | null } | null = null;
        let botToken = '';
        let username = '';
        let lastErr: any = null;
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
                lastErr = new Error('BotFather did not return a valid token');
            } catch (err: any) {
                lastErr = err;
                const msg = err?.message || String(err);
                // Account is BotFather-restricted → skip to the next candidate.
                if (/BOTFATHER_CANNOT_CREATE|cannot create new bots|too many attempts/i.test(msg)) {
                    console.warn(`[BotHealth] creator ${cand.mobile} cannot create bots — trying next candidate`);
                    continue;
                }
                // Flood on the account → abort entirely (don't hammer more accounts).
                if (this.isFloodSignal(err) || /flood|peer_flood/i.test(msg)) {
                    throw err;
                }
                // Other error (e.g. dead session, sync issue) → try the next candidate.
                console.warn(`[BotHealth] createBot via ${cand.mobile} failed (${msg.slice(0, 80)}) — trying next`);
                continue;
            }
        }
        if (!creator || !botToken) {
            throw lastErr || new Error('all creator candidates failed to create a bot');
        }
        const creatorHandle = creator.username ? `@${creator.username}` : (creator.firstName || 'unknown');
        const description = `${creator.mobile} ${creatorHandle}`.slice(0, 512);

        // 3. Persist as pending_admin in the initial write. There is never an active/selectable
        //    interval before the channel membership has been verified.
        const saved = await this.createBotRecord({
            token: botToken,
            category,
            channelId,
            description,
            lifecycle: 'pending_admin',
            lifecycleReason: 'awaiting channel-admin add',
            createdByMobile: creator.mobile,
            ...(opts.replacesUsername ? { replacedBotUsername: opts.replacesUsername } : {}),
        });

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
                { $set: { lifecycle: 'active_verified', lifecycleReason: 'channel-admin membership verified', lifecycleUpdatedAt: new Date(), lastAdminVerifiedAt: new Date(), status: 'active', lastValidatedAt: new Date(), repairAttempts: 0 }, $unset: { deadReason: '', nextRepairAt: '' } },
            ).exec();
            await this.refreshBotCache();
            console.log(`[BotHealth] provisioned @${username} (${category}) via ${creator.mobile} — active`);
            return { saved, username, active: true };
        } catch (err: any) {
            parseError(err, `[BotHealth] created @${username} but failed to add/verify in channel ${channelId} — left INACTIVE`, false);
            await this.botModel.updateOne(
                { _id: saved._id, lifecycle: 'pending_admin' },
                { $set: { repairAttempts: 1, lifecycleReason: `admin setup failed: ${(err?.message || String(err)).slice(0, 180)}`, lifecycleUpdatedAt: new Date(), nextRepairAt: this.nextRepairDate(1), status: 'inactive' } },
            ).exec();
            await this.refreshBotCache();
            await this.notify(`<b>Bot created but NOT usable (left inactive)</b>\nCategory: ${category}\nNew bot: @${username}\nChannel: ${channelId}\nAction: add it as admin manually, then it self-activates on next health check.\nReason: ${(err?.message || String(err)).substring(0, 120)}`);
            console.log(`[BotHealth] provisioned @${username} (${category}) — created but NOT yet admin (inactive)`);
            return { saved, username, active: false };
        }
    }

    /** Create a replacement bot via BotFather and add it to the dead bot's channel. */
    private async replaceDeadBot(deadBot: DeadBotInfo): Promise<BotDocument | null> {
        const { saved, active } = await this.provisionBotForCategory(deadBot.category, deadBot.channelId, {
            replacesUsername: deadBot.username,
        });
        if (!active) {
            // Created but not verified admin — do NOT delete the old dead doc yet (keep the record)
            // and do NOT count it as a successful replacement.
            return null;
        }
        // Remove the OLD dead bot doc now that a verified replacement is live — otherwise stale
        // dead rows accumulate forever and keep inflating each run's dead count.
        try { await this.botModel.deleteOne({ token: deadBot.token }).exec(); } catch { /* non-fatal */ }
        console.log(`[BotHealth] replaced dead @${deadBot.username} (${deadBot.category}) — active`);
        return saved;
    }

    /**
     * REUSE-FIRST: before minting a new bot, try to (re)activate an existing bot in the category
     * that has a LIVE token but isn't verified in the channel (pending_admin / manual_attention).
     * We accumulated dozens of such live-token bots (kicked from the channel) while the top-up
     * kept creating brand-new ones that hit the same wall — pure waste. Re-adding an existing live
     * bot is free (no BotFather budget) and idempotent. Returns the number reactivated (0..want).
     */
    private async reuseExistingBotsForCategory(
        category: ChannelCategory,
        channelId: string,
        want: number,
        dryRun: boolean,
        controllability: Map<string, string | null>,
    ): Promise<{ reused: number; proposedActions: string[]; stopPrivilegedWork: boolean }> {
        const proposedActions: string[] = [];
        if (want <= 0) return { reused: 0, proposedActions, stopPrivilegedWork: false };
        // Candidates: same category+channel, live-token-but-unverified (pending_admin/manual_attention).
        const candidates = await this.botModel.find({
            category,
            channelId,
            lifecycle: { $in: ['pending_admin', 'manual_attention'] },
        }).sort({ lastValidatedAt: -1, createdAt: -1 }).limit(want * 3).lean().exec();
        if (candidates.length === 0) return { reused: 0, proposedActions, stopPrivilegedWork: false };
        // Dry-run: report the reuse that a real run would attempt, WITHOUT the controllability
        // scan or any Telegram mutation (honor the no-Telegram dry-run contract).
        if (dryRun) {
            for (const bot of candidates.slice(0, want)) {
                proposedActions.push(`reuse live-token @${bot.username} (${category}) — would re-add to ${channelId} instead of creating`);
            }
            return { reused: Math.min(want, candidates.length), proposedActions, stopPrivilegedWork: false };
        }
        // Real run: reuse only makes sense on a CONTROLLABLE channel — if we can't add bots at all,
        // don't bother; the circuit-breaker handles the alert.
        if (!(await this.resolveChannelAdminCached(channelId, controllability))) {
            return { reused: 0, proposedActions, stopPrivilegedWork: false };
        }
        let reused = 0;
        for (const bot of candidates) {
            if (reused >= want) break;
            // Only reuse a bot whose token is actually alive (else it's genuinely dead → skip).
            const check = await this.checkBotToken(bot.token);
            if (check.verdict !== 'alive') continue;
            proposedActions.push(`reuse live-token @${bot.username} (${category}) — re-add to ${channelId} instead of creating`);
            try {
                const info = await this.telegramService.getBotInfo(bot.token);
                const botId = String(info?.id || '');
                if (!botId) continue;
                await this.addBotToChannelAsAdmin(channelId, bot.token, bot.username);
                if (!(await this.verifyBotIsChannelAdmin(channelId, botId))) continue; // re-add didn't stick; leave as-is
                await this.botModel.updateOne({ _id: bot._id }, {
                    $set: { lifecycle: 'active_verified', lifecycleReason: 'reused: re-added to channel as admin', lifecycleUpdatedAt: new Date(), lastAdminVerifiedAt: new Date(), status: 'active', repairAttempts: 0 },
                    $unset: { deadReason: '', deadAt: '', nextRepairAt: '' },
                }).exec();
                reused++;
                console.log(`[BotHealth] REUSED @${bot.username} (${category}) — re-added to ${channelId} (no new bot created)`);
            } catch (err) {
                // A FLOOD/spam signal on the manager account means back off ALL privileged work this
                // run — don't keep re-adding more bots (that hammers a flooding account).
                if (this.isFloodSignal(err)) {
                    if (reused > 0 && !dryRun) await this.refreshBotCache();
                    return { reused, proposedActions, stopPrivilegedWork: true };
                }
                // Any other re-add failure: leave the bot as-is, try the next candidate.
            }
        }
        if (reused > 0 && !dryRun) await this.refreshBotCache();
        return { reused, proposedActions, stopPrivilegedWork: false };
    }

    /**
     * Per-run controllability cache: resolveChannelAdminMobile does Telegram admin-list scans
     * across viewer accounts (expensive + a mild footprint), and the same channel is checked by
     * both reconcile and top-up. Resolve it at most ONCE per channel per run. null = not
     * controllable by any of our accounts (bots can never be added → creation is futile).
     */
    private async resolveChannelAdminCached(channelId: string, cache: Map<string, string | null>): Promise<string | null> {
        if (cache.has(channelId)) return cache.get(channelId) ?? null;
        const admin = await this.resolveChannelAdminMobile(channelId).catch(() => null);
        cache.set(channelId, admin);
        return admin;
    }

    /**
     * Ensure every category holds at least `minHealthyBotsPerCategory` HEALTHY (active) bots.
     * Runs AFTER the dead-replacement pass so a just-revived/just-replaced bot counts. Provisions
     * fresh bots for any category below the floor, subject to the run's shared BotFather creation
     * budget (BotFather flood safety). Returns how many new bots were provisioned active.
     */
    private async topUpCategoriesToMinHealthy(
        creationBudget: number,
        dryRun: boolean,
        controllability: Map<string, string | null>,
    ): Promise<{ toppedUp: number; creationAttempts: number; topUpFailures: string[]; proposedActions: string[]; stopPrivilegedWork: boolean }> {
        const topUpFailures: string[] = [];
        const proposedActions: string[] = [];
        let toppedUp = 0;
        let creationAttempts = 0;
        let stopPrivilegedWork = false;
        // Re-read from DB (post replacement) grouped by category, counting only live (active) bots.
        const all = await this.botModel.find().lean().exec();
        const byCategory = all.reduce((acc, b) => {
            (acc[b.category] = acc[b.category] || []).push(b);
            return acc;
        }, {} as Record<string, BotDocument[]>);

        for (const [category, list] of Object.entries(byCategory)) {
            if (creationAttempts >= creationBudget) {
                topUpFailures.push(`global creation budget (${creationBudget}) reached — remaining low categories deferred to next run`);
                break;
            }
            const liveCount = list.filter(b => this.isSelectable(b)).length;
            const deficit = this.minHealthyBotsPerCategory - liveCount;
            if (deficit <= 0) continue;
            // channelId to use for the new bot(s): take it from any existing doc in the category
            // (all bots of a category share the same channel).
            const channelId = list[0]?.channelId;
            if (!channelId) {
                topUpFailures.push(`${category}: below floor (${liveCount}/${this.minHealthyBotsPerCategory}) but no channelId known — skipped`);
                continue;
            }

            // REUSE-FIRST: satisfy the deficit from existing live-token bots (re-add to channel)
            // before spending any BotFather budget. Free, idempotent, and prevents the "create a
            // fresh bot that hits the same wall" waste (this incident: 20+ live bots, kept minting).
            const reuse = await this.reuseExistingBotsForCategory(category as ChannelCategory, channelId, deficit, dryRun, controllability);
            proposedActions.push(...reuse.proposedActions);
            if (reuse.stopPrivilegedWork) { stopPrivilegedWork = true; break; } // flood during reuse → abort run
            const remainingDeficit = deficit - reuse.reused;
            if (remainingDeficit <= 0) {
                if (reuse.reused > 0) console.log(`[BotHealth] ${category}: deficit met by REUSING ${reuse.reused} existing bot(s) — no creation`);
                continue;
            }

            // CIRCUIT-BREAKER: if the channel is NOT controllable (no account of ours is an admin,
            // so a bot can never be added), creating more bots is futile — every new one lands in
            // pending_admin and is abandoned (the root cause of the over-creation loop). Stop
            // creating for this category and alert for a one-time human fix instead of minting corpses.
            // Uses the per-run controllability cache (resolved at most once per channel). Skipped in
            // dry-run to honor the no-Telegram contract (the scan hits accounts) — dry-run just
            // reports the would-create below.
            if (!dryRun) {
                const adminMobile = await this.resolveChannelAdminCached(channelId, controllability);
                if (!adminMobile) {
                    const msg = `${category}: channel ${channelId} has NO controllable admin — NOT creating bots (would be abandoned). ${liveCount}/${this.minHealthyBotsPerCategory} live; ${reuse.reused} reused. Fix: make a manager account admin of the channel, or re-point the category to a controllable channel.`;
                    topUpFailures.push(msg);
                    await this.notify(`<b>Bot top-up BLOCKED — uncontrollable channel</b>\nCategory: ${category}\nChannel: ${channelId}\nHealthy: ${liveCount}/${this.minHealthyBotsPerCategory}\nCreation skipped to avoid orphan bots. Add a manager as channel admin, then bots self-heal.`);
                    console.warn(`[BotHealth] ${msg}`);
                    continue;
                }
            }

            const need = Math.min(remainingDeficit, creationBudget - creationAttempts);
            for (let i = 0; i < need; i++) {
                try {
                    proposedActions.push(`top up ${category} in ${channelId}`);
                    if (dryRun) {
                        creationAttempts++;
                        continue;
                    }
                    creationAttempts++;
                    const { active, username } = await this.provisionBotForCategory(category as ChannelCategory, channelId);
                    if (active) {
                        toppedUp++;
                        console.log(`[BotHealth] topped up ${category}: added @${username} (was ${liveCount}/${this.minHealthyBotsPerCategory})`);
                    } else {
                        topUpFailures.push(`${category}: created @${username} but not yet admin (inactive)`);
                    }
                } catch (err: any) {
                    const msg = `top-up ${category}: ${err?.message || err}`;
                    topUpFailures.push(msg);
                    parseError(err, `[BotHealth] ${msg}`, false);
                    // Flood on BotFather / manager account → stop all further top-ups this run.
                    if (this.isFloodSignal(err) || /flood|too many|rate/i.test(err?.message || '')) {
                        topUpFailures.push('flood/rate signal — aborting further top-ups this run');
                        stopPrivilegedWork = true;
                        return { toppedUp, creationAttempts, topUpFailures, proposedActions, stopPrivilegedWork };
                    }
                    break; // move to next category on a non-flood error
                }
            }
        }
        return { toppedUp, creationAttempts, topUpFailures, proposedActions, stopPrivilegedWork };
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

        // Only request rights the PROMOTER actually holds. Telegram's EditAdmin returns
        // RIGHT_FORBIDDEN if you try to grant a right you don't have yourself — e.g. our channel
        // manager has addAdmins but NOT postMessages in some channels, so a blanket postMessages:true
        // fails the whole promotion. Intersecting with the promoter's own rights keeps it robust.
        const desired = {
            changeInfo: true, postMessages: true, editMessages: true, deleteMessages: true,
            banUsers: true, inviteUsers: true, pinMessages: true, addAdmins: false,
            anonymous: true, manageCall: true,
        };
        const granted = await this.intersectWithPromoterRights(adminMobile, channelId, desired);

        // Human-paced: wait a randomized gap BEFORE the privileged promote so the manager
        // account's admin actions don't cluster into a scripted burst (ban risk).
        await this.humanDelay();
        try {
            await this.telegramService.promoteBotInChannel(adminMobile, channelId, botId, botUsername, granted);
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
        // Read the channel's admin list ONCE via any account that can see it (managers first,
        // then healthy accounts), then pick the BEST of OUR controllable admins to promote with —
        // preferring one that has `addAdmins` (required to promote a bot) AND `postMessages` (so the
        // bot can be granted post). This avoids RIGHT_FORBIDDEN and naturally selects a
        // full-rights/creator account (e.g. @Saurabh) over a limited manager.
        const viewers = [...this.getChannelManagerMobiles(), ...(await this.getHealthyAccountMobiles(15))];
        let admins: any[] | null = null;
        for (const viewer of viewers) {
            try {
                const res = await this.telegramService.getGroupAdmins(viewer, channelId);
                if (Array.isArray(res) && res.length > 0) { admins = res; break; }
            } catch {
                continue; // this viewer can't see the channel — try next
            }
        }

        const healthy = await this.getHealthyAccounts();
        const byMobile = new Map(healthy.map(u => [u.mobile, u]));

        // DESCRIPTION-FIRST: our channels record the creator's mobile in the channel About
        // (e.g. "917306148704"). If that account is one we control with a live session, it's the
        // creator → the ideal promoter (full rights, incl. post). Try it before the admin scan; it
        // also rescues channels our admin-list scan can't cover.
        try {
            for (const viewer of viewers) {
                let about = '';
                try { about = await this.telegramService.getChannelAbout(viewer, channelId); }
                catch { continue; }
                if (!about) continue;
                for (const m of about.match(/\d{10,13}/g) || []) {
                    if (byMobile.has(m)) return m; // controllable creator account named in the description
                }
                break; // got the about (even if no controllable mobile) — no need to re-read via others
            }
        } catch { /* best-effort — fall through to the admin scan */ }

        if (!admins) return null;

        // Map admin tgId → our controllable account (has a live session).
        const byTgId = new Map(healthy.filter(u => u.tgId).map(u => [String(u.tgId), u]));

        // Score OUR admins by usefulness for promoting a bot with full rights.
        const scored: Array<{ mobile: string; score: number }> = [];
        for (const a of admins) {
            const tgId = String(a?.userId ?? a?.id ?? '');
            const ours = byTgId.get(tgId);
            if (!ours) continue;
            const perms = a?.permissions || {};
            const isCreator = a?.rank === 'creator';
            if (!isCreator && !perms.addAdmins) continue; // can't promote a bot without addAdmins
            // Prefer creator > addAdmins+post > addAdmins-only.
            const score = isCreator ? 3 : (perms.postMessages ? 2 : 1);
            scored.push({ mobile: ours.mobile, score });
        }
        if (scored.length === 0) return null;
        scored.sort((x, y) => y.score - x.score);
        return scored[0].mobile;
    }

    /**
     * Cap the desired bot-admin rights to what the PROMOTER account itself holds in the channel.
     * Telegram's EditAdmin returns RIGHT_FORBIDDEN if you grant a right you don't have — e.g. our
     * manager has addAdmins but not postMessages in some channels, so a blanket postMessages:true
     * fails the whole promotion. A creator (all rights) passes everything through unchanged.
     */
    private async intersectWithPromoterRights(
        promoterMobile: string,
        channelId: string,
        desired: Record<string, boolean>,
    ): Promise<Record<string, boolean>> {
        try {
            const promoterUser = (await this.usersService.search({ mobile: promoterMobile }))[0];
            const promoterTgId = promoterUser?.tgId ? String(promoterUser.tgId) : null;
            if (!promoterTgId) return desired;
            const admins = await this.telegramService.getGroupAdmins(promoterMobile, channelId);
            const me = (Array.isArray(admins) ? admins : []).find((a: any) => String(a?.userId ?? a?.id) === promoterTgId);
            // Creator (rank 'creator' or all-perms) → keep desired as-is.
            const perms = (me as any)?.permissions;
            if (!perms || (me as any)?.rank === 'creator') return desired;
            const capped: Record<string, boolean> = {};
            for (const [k, v] of Object.entries(desired)) {
                // Grant a right only if desired AND the promoter holds it (anonymous is cosmetic — keep).
                capped[k] = k === 'anonymous' ? v : Boolean(v && perms[k]);
            }
            return capped;
        } catch {
            return desired; // best-effort — if we can't read rights, try the full set
        }
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
     * SINGLE source of "our usable accounts" for channel-admin viewing/matching: expired=false, has
     * a non-empty session + mobile, shuffled. Used by the channel-admin flows (viewers, admin-id
     * matching) where any healthy account works. Bot CREATION uses a separate, foreign-first query
     * (pickHealthyCreatorCandidates → usersService.getBotCreatorAccounts) because search()'s 200-row
     * cap only surfaces the newest (mostly Indian) accounts.
     */
    private async getHealthyAccounts(): Promise<Array<{ mobile: string; username?: string | null; firstName?: string | null; tgId?: string | null; session?: string | null }>> {
        const users = await this.usersService.search({ expired: false });
        return this.shuffle(users.filter(u => u.session && String(u.session).trim() && u.mobile));
    }

    /**
     * Return up to `n` DISTINCT healthy creator candidates for BotFather bot creation. Deliberately
     * does NOT use the channel-manager accounts (managers do heavy admin activity → most likely to
     * be BotFather-restricted "cannot create new bots"). Ordering preference:
     *   1. FOREIGN numbers first (non +91 India) — e.g. Pakistan +92 — they're less bot-flagged and
     *      spread creation across accounts/countries,
     *   2. then remaining (Indian) non-manager accounts,
     *   3. managers only as an absolute last resort.
     * The provision flow tries these in order, skipping any BotFather has banned from creating.
     */
    private async pickHealthyCreatorCandidates(n: number): Promise<Array<{ mobile: string; username?: string | null; firstName?: string | null }>> {
        const managerMobiles = new Set(this.getChannelManagerMobiles());
        // Foreign-first, server-side sampled (bypasses search()'s 200-row India-heavy cap).
        const accounts = await this.usersService.getBotCreatorAccounts(Math.max(n * 3, 30));
        // Never use a channel-manager to CREATE bots (they're the most BotFather-restricted).
        const usable = accounts.filter(u => u.mobile && !managerMobiles.has(u.mobile));
        return usable.slice(0, Math.max(1, n)).map(u => ({ mobile: u.mobile, username: u.username, firstName: u.firstName }));
    }

    /**
     * Healthy account mobiles to use as channel viewers/admins. Managers first (most likely to
     * be admins of our channels), then a shuffled sample of other healthy accounts.
     */
    private async getHealthyAccountMobiles(limit: number): Promise<string[]> {
        const managers = this.getChannelManagerMobiles();
        const others = (await this.getHealthyAccounts()).map(u => u.mobile);
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

    private async sendHealthSummary(s: { checked: number; alive: number; dead: number; unknown: number; replaced: number; toppedUp: number; deadRemaining: number; failures: string[] }): Promise<void> {
        const lines = [
            '<b>Bot Health Check</b>',
            `Checked: ${s.checked} | Alive: ${s.alive} | Dead: ${s.dead} | Unknown: ${s.unknown}`,
            `Replaced: ${s.replaced} | Topped up: ${s.toppedUp} | Dead remaining: ${s.deadRemaining}`,
        ];
        if (s.failures.length) {
            const shown = s.failures.slice(0, 10).map(f => `• ${f}`);
            if (s.failures.length > 10) shown.push(`(+${s.failures.length - 10} more)`);
            lines.push(`<b>Failures:</b>\n${shown.join('\n')}`);
        }
        await this.notify(lines.join('\n'));
    }
}
