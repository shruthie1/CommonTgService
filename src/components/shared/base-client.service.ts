import { NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Model, Document } from 'mongoose';
import { Channel } from '../channels/schemas/channel.schema';
import { TelegramService } from '../Telegram/Telegram.service';
import { sleep } from 'telegram/Helpers';
import { UsersService } from '../users/users.service';
import { ActiveChannelsService } from '../active-channels/active-channels.service';
import { ClientService } from '../clients/client.service';
import { ChannelsService } from '../channels/channels.service';
import { parseError } from '../../utils/parseError';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { SessionService } from '../session-manager';
import { Logger } from '../../utils';
import { ActiveChannel } from '../active-channels';
import { channelInfo } from '../../utils/telegram-utils/channelinfo';
import TelegramManager from '../Telegram/TelegramManager';
import { Client } from '../clients';
import { User } from '../users';
import * as fs from 'fs';
import path from 'path';
import { Api } from 'telegram';
import { TelegramClient } from 'telegram';
import { computeCheck } from 'telegram/Password';
import { StringSession } from 'telegram/sessions';
import isPermanentError from '../../utils/isPermanentError';
import { BotsService, ChannelCategory } from '../bots';
import { downloadFileFromUrl } from '../Telegram/manager/helpers';
import { generateTGConfig } from '../Telegram/utils/generateTGConfig';
import { ClientHelperUtils } from './client-helper.utils';
import { performOrganicActivity, OrganicIntensity } from './organic-activity';
import {
    getWarmupPhaseAction,
    WarmupPhase,
    WarmupPhaseType,
    WarmupAction,
    isAccountReady,
    isAccountWarmingUp,
    MIN_CHANNELS_FOR_MATURING,
    WARMUP_PHASE_THRESHOLDS,
} from './warmup-phases';

/**
 * Configuration constants that differ between buffer and promote clients.
 */
export interface ClientConfig {
    joinChannelInterval: number;
    leaveChannelInterval: number;
    leaveChannelBatchSize: number;
    channelProcessingDelay: number;
    channelTarget: number;
    maxJoinsPerSession: number;
    maxNewClientsPerTrigger: number;
    minTotalClients: number;
    maxMapSize: number;
    cooldownHours: number;
    clientProcessingDelay: number;
    maxChannelJoinsPerDay: number;
    joinsPerMobilePerRound: number;
}

export const ClientStatus = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
} as const;

export type ClientStatusType = typeof ClientStatus[keyof typeof ClientStatus];

/**
 * Common document fields shared by buffer and promote client schemas.
 */
export interface BaseClientDocument extends Document {
    tgId: string;
    mobile: string;
    session?: string;
    availableDate: string;
    channels: number;
    clientId?: string;
    status: ClientStatusType;
    message?: string;
    lastUsed?: Date;
    lastChecked?: Date;
    inUse?: boolean;
    privacyUpdatedAt?: Date;
    twoFASetAt?: Date;
    otherAuthsRemovedAt?: Date;
    profilePicsUpdatedAt?: Date;
    nameBioUpdatedAt?: Date;
    profilePicsDeletedAt?: Date;
    usernameUpdatedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    lastUpdateAttempt?: Date;
    failedUpdateAttempts?: number;
    lastUpdateFailure?: Date;
    // Warmup fields
    warmupPhase?: WarmupPhaseType;
    warmupJitter?: number;
    enrolledAt?: Date;
    organicActivityAt?: Date;
    sessionRotatedAt?: Date;
    // Persona assignment fields
    assignedFirstName?: string;
    assignedLastName?: string;
    assignedBio?: string;
    assignedProfilePics?: string[];
}

export type BaseClientUpdate = Partial<Pick<
    BaseClientDocument,
    | 'session'
    | 'availableDate'
    | 'channels'
    | 'clientId'
    | 'status'
    | 'message'
    | 'lastUsed'
    | 'lastChecked'
    | 'inUse'
    | 'privacyUpdatedAt'
    | 'twoFASetAt'
    | 'otherAuthsRemovedAt'
    | 'profilePicsUpdatedAt'
    | 'nameBioUpdatedAt'
    | 'profilePicsDeletedAt'
    | 'usernameUpdatedAt'
    | 'createdAt'
    | 'updatedAt'
    | 'lastUpdateAttempt'
    | 'failedUpdateAttempts'
    | 'lastUpdateFailure'
    | 'warmupPhase'
    | 'warmupJitter'
    | 'enrolledAt'
    | 'organicActivityAt'
    | 'sessionRotatedAt'
>>;

export interface ProcessClientResult {
    updateCount: number;
    updateSummary?: string | null;
}

/**
 * Availability window calculation result.
 */
export interface AvailabilityNeeds {
    totalNeeded: number;
    windowNeeds: Array<{
        window: string;
        available: number;
        needed: number;
        targetDate: string;
        minRequired: number;
    }>;
    totalActive: number;
    totalNeededForCount: number;
    calculationReason: string;
    priority: number;
    readyActive: number;
    warmingPipeline: number;
    replenishmentWindowNeeds: Array<{
        window: string;
        available: number;
        needed: number;
        targetDate: string;
        minRequired: number;
    }>;
    projectedWindowCounts: Array<{
        window: string;
        available: number;
        targetDate: string;
    }>;
}

// Re-export for subclasses
export { WarmupPhase, WarmupAction, isAccountReady, isAccountWarmingUp, getWarmupPhaseAction, performOrganicActivity };

/**
 * Abstract base class for buffer and promote client services.
 * Contains all shared logic: memory management, warmup execution, channel queues,
 * health checks, availability calculations, and stats.
 *
 * Subclasses implement type-specific behavior via abstract methods.
 */
export abstract class BaseClientService<TDoc extends BaseClientDocument> implements OnModuleDestroy {
    protected readonly logger: Logger;
    protected joinChannelMap: Map<string, (Channel | ActiveChannel)[]> = new Map();
    protected leaveChannelMap: Map<string, string[]> = new Map();
    protected joinChannelIntervalId: NodeJS.Timeout | null = null;
    protected leaveChannelIntervalId: NodeJS.Timeout | null = null;
    protected isJoinChannelProcessing: boolean = false;
    protected isLeaveChannelProcessing: boolean = false;
    protected activeTimeouts: Set<NodeJS.Timeout> = new Set();

    protected readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;
    protected readonly THREE_MONTHS_MS = 3 * 30 * this.ONE_DAY_MS;
    protected readonly INACTIVE_USER_CUTOFF_DAYS = 90;

    // Dynamic availability windows (same for both types)
    protected readonly AVAILABILITY_WINDOWS = [
        { name: 'today', days: 0, minRequired: 3 },
        { name: 'tomorrow', days: 1, minRequired: 5 },
        { name: 'oneWeek', days: 7, minRequired: 7 },
        { name: 'tenDays', days: 10, minRequired: 9 },
    ];

    protected readonly MAX_FAILED_ATTEMPTS = 3;
    protected readonly FAILURE_RESET_DAYS = 7;
    protected readonly MAX_UPDATES_PER_CYCLE = 5;
    protected dailyJoinCounts: Map<string, number> = new Map();
    protected dailyJoinDate: string = '';
    /** Tracks per-mobile transient join failures in the current loop. Reset on each refill. */
    protected joinFailureCounts: Map<string, number> = new Map();
    protected readonly MAX_JOIN_FAILURES_PER_MOBILE = 3;
    /** clientId scope from the HTTP trigger — refill respects this so a client-specific trigger doesn't spill. */
    protected joinScopeClientId: string | null = null;

    protected resetDailyJoinCountersIfNeeded(): void {
        const today = ClientHelperUtils.getTodayDateString();
        if (today !== this.dailyJoinDate) {
            this.dailyJoinCounts.clear();
            this.dailyJoinDate = today;
        }
    }

    protected getDailyJoinCount(mobile: string): number {
        this.resetDailyJoinCountersIfNeeded();
        return this.dailyJoinCounts.get(mobile) || 0;
    }

    protected incrementDailyJoinCount(mobile: string): void {
        this.dailyJoinCounts.set(mobile, this.getDailyJoinCount(mobile) + 1);
    }

    protected isMobileDailyCapped(mobile: string): boolean {
        return this.getDailyJoinCount(mobile) >= this.config.maxChannelJoinsPerDay;
    }

    /**
     * Use a stable per-attempt cooldown jitter so scheduler prechecks and processClient()
     * make the same decision for the same mobile + lastUpdateAttempt.
     */
    protected getEffectiveCooldownMs(mobile: string, lastUpdateAttempt: number): number {
        const baseCooldownMs = this.config.cooldownHours * 60 * 60 * 1000;
        if (lastUpdateAttempt <= 0) return baseCooldownMs;

        const seed = `${mobile}:${lastUpdateAttempt}`;
        const hashToUnit = (input: string): number => {
            let hash = 0;
            for (let i = 0; i < input.length; i++) {
                hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
            }
            return (hash >>> 0) / 0xffffffff;
        };

        // Average 3 deterministic uniforms to bias toward the middle of the range.
        const averagedUnit =
            (hashToUnit(`${seed}:a`) + hashToUnit(`${seed}:b`) + hashToUnit(`${seed}:c`)) / 3;
        const minJitterMs = -30 * 60 * 1000;
        const maxJitterMs = 60 * 60 * 1000;
        const jitterMs = Math.round(minJitterMs + averagedUnit * (maxJitterMs - minJitterMs));

        return baseCooldownMs + jitterMs;
    }

    protected isOnCooldown(mobile: string, lastUpdateAttempt: Date | string | null | undefined, now: number): boolean {
        const lastAttemptTs = ClientHelperUtils.getTimestamp(lastUpdateAttempt);
        if (lastAttemptTs <= 0) return false;
        return now - lastAttemptTs < this.getEffectiveCooldownMs(mobile, lastAttemptTs);
    }

    protected inferWarmupPhaseFromProgress(doc: TDoc): WarmupPhaseType {
        if (doc.warmupPhase) return doc.warmupPhase;
        if (doc.sessionRotatedAt) return WarmupPhase.SESSION_ROTATED;
        if (doc.profilePicsUpdatedAt) return WarmupPhase.MATURING;
        if ((doc.channels || 0) >= MIN_CHANNELS_FOR_MATURING || doc.usernameUpdatedAt) return WarmupPhase.GROWING;
        if (doc.nameBioUpdatedAt || doc.profilePicsDeletedAt) return WarmupPhase.IDENTITY;
        if (doc.otherAuthsRemovedAt || doc.twoFASetAt || doc.privacyUpdatedAt) return WarmupPhase.SETTLING;
        return WarmupPhase.ENROLLED;
    }

    protected getWarmupPhaseRank(phase: WarmupPhaseType | null | undefined): number {
        const order: Record<string, number> = {
            [WarmupPhase.ENROLLED]: 0,
            [WarmupPhase.SETTLING]: 1,
            [WarmupPhase.IDENTITY]: 2,
            [WarmupPhase.GROWING]: 3,
            [WarmupPhase.MATURING]: 4,
            [WarmupPhase.READY]: 5,
            [WarmupPhase.SESSION_ROTATED]: 6,
        };
        if (!phase) return -1;
        return order[phase] ?? -1;
    }

    protected getRecoveryEnrolledAt(phase: WarmupPhaseType, jitter: number, now: number): Date {
        const recoveryDaysByPhase: Record<WarmupPhaseType, number> = {
            [WarmupPhase.ENROLLED]: Math.max(1, WARMUP_PHASE_THRESHOLDS.settling + jitter),
            [WarmupPhase.SETTLING]: WARMUP_PHASE_THRESHOLDS.identity + jitter,
            [WarmupPhase.IDENTITY]: WARMUP_PHASE_THRESHOLDS.growing + jitter,
            [WarmupPhase.GROWING]: WARMUP_PHASE_THRESHOLDS.maturing + jitter,
            [WarmupPhase.MATURING]: WARMUP_PHASE_THRESHOLDS.ready + jitter,
            [WarmupPhase.READY]: WARMUP_PHASE_THRESHOLDS.ready + jitter + 1,
            [WarmupPhase.SESSION_ROTATED]: WARMUP_PHASE_THRESHOLDS.ready + jitter + 2,
        };

        const recoveryDays = recoveryDaysByPhase[phase] ?? (WARMUP_PHASE_THRESHOLDS.ready + jitter + 1);
        return new Date(now - recoveryDays * this.ONE_DAY_MS);
    }

    protected async repairWarmupMetadata(doc: TDoc, now: number): Promise<TDoc> {
        const updateData: BaseClientUpdate = {};
        const progressDoc = { ...doc, warmupPhase: undefined } as TDoc;
        const inferredPhase = this.inferWarmupPhaseFromProgress(progressDoc);
        const currentPhaseRank = this.getWarmupPhaseRank(doc.warmupPhase);
        const inferredPhaseRank = this.getWarmupPhaseRank(inferredPhase);

        // Recover missing or stale phase metadata, but never move backwards automatically.
        if (!doc.warmupPhase || inferredPhaseRank > currentPhaseRank) {
            updateData.warmupPhase = inferredPhase;
        }

        if (!doc.enrolledAt && !doc.createdAt) {
            updateData.enrolledAt = this.getRecoveryEnrolledAt(inferredPhase, doc.warmupJitter || 0, now);
        }

        if (Object.keys(updateData).length === 0) {
            return doc;
        }

        const repairedDoc = await this.update(doc.mobile, updateData);
        this.logger.warn(`Recovered warmup metadata for ${doc.mobile}`, updateData);
        return { ...doc, ...updateData, ...(repairedDoc || {}) } as TDoc;
    }

    constructor(
        protected readonly telegramService: TelegramService,
        protected readonly usersService: UsersService,
        protected readonly activeChannelsService: ActiveChannelsService,
        protected readonly clientService: ClientService,
        protected readonly channelsService: ChannelsService,
        protected readonly sessionService: SessionService,
        protected readonly botsService: BotsService,
        loggerName: string,
    ) {
        this.logger = new Logger(loggerName);
    }

    // ---- Abstract methods (subclasses MUST implement) ----

    /** Mongoose model for this client type */
    abstract get model(): Model<TDoc>;

    /** Client type label for logging/notifications */
    abstract get clientType(): 'buffer' | 'promote';

    /** Per-type configuration constants */
    abstract get config(): ClientConfig;

    /** Update name/bio — buffer uses full name, promote uses firstName + petName */
    abstract updateNameAndBio(doc: TDoc, client: Client, failedAttempts: number): Promise<number>;

    /** Update username — buffer sets username, promote clears it */
    abstract updateUsername(doc: TDoc, client: Client, failedAttempts: number): Promise<number>;

    /** Find one document by mobile */
    abstract findOne(mobile: string, throwErr?: boolean): Promise<TDoc>;

    /** Update a document by mobile */
    abstract update(mobile: string, updateDto: BaseClientUpdate): Promise<TDoc>;

    /** Mark as inactive */
    abstract markAsInactive(mobile: string, reason: string): Promise<TDoc | null>;

    /** Update status */
    abstract updateStatus(mobile: string, status: ClientStatusType, message?: string): Promise<TDoc>;

    /** Re-query DB for mobiles below channelTarget not yet daily-capped. Populate joinChannelMap. Respects joinScopeClientId if set. */
    abstract refillJoinQueue(clientId?: string | null): Promise<number>;

    // ---- Lifecycle ----

    async onModuleDestroy() {
        await this.cleanup();
    }

    protected async cleanup(): Promise<void> {
        try {
            this.clearAllTimeouts();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            this.joinChannelMap.clear();
            this.dailyJoinCounts.clear();
            this.joinFailureCounts.clear();
            this.joinScopeClientId = null;
            this.leaveChannelMap.clear();
            this.isJoinChannelProcessing = false;
            this.isLeaveChannelProcessing = false;
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }

    protected trimMapIfNeeded<T>(map: Map<string, T>, mapName: string): void {
        if (map.size > this.config.maxMapSize) {
            const keysToRemove = Array.from(map.keys()).slice(this.config.maxMapSize);
            keysToRemove.forEach(key => map.delete(key));
            this.logger.warn(`Trimmed ${keysToRemove.length} entries from ${mapName}`);
        }
    }

    protected createTimeout(callback: () => void, delay: number): NodeJS.Timeout {
        const timeout = setTimeout(() => {
            this.activeTimeouts.delete(timeout);
            callback();
        }, delay);
        this.activeTimeouts.add(timeout);
        return timeout;
    }

    protected clearAllTimeouts(): void {
        this.activeTimeouts.forEach(timeout => clearTimeout(timeout));
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }

    // ---- Common Helpers ----

    protected async safeUnregisterClient(mobile: string): Promise<void> {
        try {
            await connectionManager.unregisterClient(mobile);
        } catch (unregisterError: unknown) {
            const errorMessage = unregisterError instanceof Error ? unregisterError.message : 'Unknown error';
            this.logger.error(`Error unregistering client ${mobile}: ${errorMessage}`);
        }
    }

    protected handleError(error: unknown, context: string, mobile?: string): ReturnType<typeof parseError> {
        const contextWithMobile = mobile ? `${context}: ${mobile}` : context;
        return parseError(error, contextWithMobile, false);
    }

    protected async updateUser2FAStatus(tgId: string, mobile: string): Promise<void> {
        try {
            await this.usersService.update(tgId, { twoFA: true });
        } catch (userUpdateError) {
            this.logger.warn(`Failed to update user 2FA status for ${mobile}:`, userUpdateError);
        }
    }

    protected isFrozenError(errorDetails: { message?: string; error?: any }): boolean {
        const message = `${errorDetails?.message || ''} ${errorDetails?.error?.message || ''} ${errorDetails?.error?.errorMessage || ''}`.toLowerCase();
        return message.includes('frozen_method_invalid') || message.includes('frozen_participant_missing');
    }

    private extractConfigValue(node: any, targetKey: string): any {
        if (node === null || node === undefined) return undefined;

        if (Array.isArray(node)) {
            for (const item of node) {
                const value = this.extractConfigValue(item, targetKey);
                if (value !== undefined) return value;
            }
            return undefined;
        }

        if (typeof node !== 'object') return undefined;

        if (node.key === targetKey && 'value' in node) {
            return node.value;
        }

        if (targetKey in node && node[targetKey] !== undefined) {
            return node[targetKey];
        }

        for (const value of Object.values(node)) {
            const extracted = this.extractConfigValue(value, targetKey);
            if (extracted !== undefined) return extracted;
        }

        return undefined;
    }

    protected async buildPermanentAccountReason(baseReason: string, telegramClient?: TelegramManager | null): Promise<string> {
        if (!telegramClient || !this.isFrozenError({ message: baseReason })) {
            return baseReason;
        }

        try {
            const appConfig = await telegramClient.client.invoke(new Api.help.GetAppConfig({ hash: 0 }));
            const freezeSince = this.extractConfigValue(appConfig, 'freeze_since_date');
            const freezeUntil = this.extractConfigValue(appConfig, 'freeze_until_date');
            const freezeAppealUrl = this.extractConfigValue(appConfig, 'freeze_appeal_url');

            const extras: string[] = [];
            if (freezeSince) extras.push(`freeze_since=${new Date(Number(freezeSince) * 1000).toISOString()}`);
            if (freezeUntil) extras.push(`freeze_until=${new Date(Number(freezeUntil) * 1000).toISOString()}`);
            if (freezeAppealUrl) extras.push(`appeal_url=${freezeAppealUrl}`);

            return extras.length > 0 ? `${baseReason} (${extras.join(', ')})` : baseReason;
        } catch (configError) {
            this.logger.warn(`Failed to fetch freeze metadata for permanent error`, configError);
            return baseReason;
        }
    }

    // ---- Map Helpers ----

    protected safeSetJoinChannelMap(mobile: string, channels: (Channel | ActiveChannel)[]): boolean {
        if (this.joinChannelMap.size >= this.config.maxMapSize && !this.joinChannelMap.has(mobile)) {
            this.logger.warn(`Join channel map size limit reached (${this.config.maxMapSize}), cannot add ${mobile}`);
            return false;
        }
        this.joinChannelMap.set(mobile, channels);
        return true;
    }

    protected safeSetLeaveChannelMap(mobile: string, channels: string[]): boolean {
        if (this.leaveChannelMap.size >= this.config.maxMapSize && !this.leaveChannelMap.has(mobile)) {
            this.logger.warn(`Leave channel map size limit reached (${this.config.maxMapSize}), cannot add ${mobile}`);
            return false;
        }
        this.leaveChannelMap.set(mobile, channels);
        return true;
    }

    removeFromJoinMap(key: string) {
        this.joinChannelMap.delete(key);
    }

    removeFromLeaveMap(key: string) {
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
        }
    }

    clearJoinMap() {
        const mapSize = this.joinChannelMap.size;
        this.joinChannelMap.clear();
        this.joinFailureCounts.clear();
        this.joinScopeClientId = null;
        this.clearJoinChannelInterval();
        this.logger.debug(`JoinMap cleared, removed ${mapSize} entries`);
    }

    clearLeaveMap() {
        const mapSize = this.leaveChannelMap.size;
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
        this.logger.debug(`LeaveMap cleared, removed ${mapSize} entries`);
    }

    protected async prepareJoinChannelRefresh(skipExisting: boolean): Promise<Set<string>> {
        const preservedMobiles = new Set<string>();
        if (skipExisting) {
            for (const [mobile, channels] of this.joinChannelMap.entries()) {
                if (channels && channels.length > 0) {
                    preservedMobiles.add(mobile);
                }
            }
        }

        for (const key of this.joinChannelMap.keys()) {
            if (!preservedMobiles.has(key)) {
                this.joinChannelMap.delete(key);
            }
        }

        for (const [mobile, channels] of this.leaveChannelMap.entries()) {
            if (!channels || channels.length === 0) {
                this.leaveChannelMap.delete(mobile);
            }
        }

        this.clearJoinChannelInterval();
        await sleep(6000 + Math.random() * 3000);

        return preservedMobiles;
    }

    // ---- Health Check (redesigned: organic activity instead of SetPrivacy) ----

    protected async performHealthCheck(mobile: string, lastChecked: number, now: number): Promise<boolean> {
        // Randomize interval: 5-9 days instead of exactly 7
        const healthCheckIntervalDays = ClientHelperUtils.gaussianRandom(7, 1.5, 4, 10);
        const needsHealthCheck = !lastChecked || (now - lastChecked > healthCheckIntervalDays * this.ONE_DAY_MS);

        if (!needsHealthCheck) {
            return true;
        }

        let telegramClient: TelegramManager | null = null;
        try {
            telegramClient = await connectionManager.getClient(mobile, {
                autoDisconnect: false,
                handler: false,
            });

            // Organic activity instead of SetPrivacy
            await performOrganicActivity(telegramClient, 'light');

            const channels = await channelInfo(telegramClient.client, true);
            await this.update(mobile, {
                channels: channels.ids.length,
                lastChecked: new Date(),
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Health check passed for ${mobile}`);
            await sleep(5000);
            return true;
        } catch (error) {
            const errorDetails = this.handleError(error, 'Health check failed', mobile);
            this.logger.warn(`Health check failed for ${mobile}: ${errorDetails.message}`);
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(`Health check failed: ${errorDetails.message}`, telegramClient);
                await this.markAsInactive(mobile, reason);
            }
            await sleep(5000);
            return false;
        } finally {
            await connectionManager.unregisterClient(mobile);
        }
    }

    // ---- Warmup Step Execution ----

    protected async updatePrivacySettings(doc: TDoc, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            // Organic preamble
            await performOrganicActivity(telegramClient, 'medium');

            await telegramClient.updatePrivacyforDeletedAccount();
            await this.update(doc.mobile, {
                privacyUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Updated privacy settings for ${doc.mobile}`);
            await sleep(ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000));
            return 1;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating privacy', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    protected async deleteProfilePhotos(doc: TDoc, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'light');

            const photos = await telegramClient.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
            if (photos.photos.length > 0) {
                await telegramClient.deleteProfilePhotos();
                this.logger.debug(`Deleted ${photos.photos.length} profile photos for ${doc.mobile}`);
            } else {
                this.logger.debug(`No profile photos to delete for ${doc.mobile}`);
            }

            await this.update(doc.mobile, {
                profilePicsDeletedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            await sleep(ClientHelperUtils.gaussianRandom(40000, 5000, 30000, 50000));
            return photos.photos.length > 0 ? 1 : 0;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error deleting photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    private getProfilePicExtension(url: string): string {
        try {
            const parsed = new URL(url);
            const urlExt = path.extname(parsed.pathname);
            return urlExt || '.jpg';
        } catch {
            return '.jpg';
        }
    }

    private async uploadProfilePhotosFromUrls(
        telegramClient: TelegramManager,
        doc: TDoc,
        urls: string[],
    ): Promise<number> {
        let filesUploaded = 0;

        for (let index = 0; index < urls.length; index++) {
            const url = urls[index];
            const tempPath = path.join('/tmp', `persona-pool-${doc.mobile}-${Date.now()}-${index}${this.getProfilePicExtension(url)}`);

            try {
                const buffer = await downloadFileFromUrl(url);
                fs.writeFileSync(tempPath, buffer);
                await telegramClient.updateProfilePic(tempPath);
                filesUploaded++;
                this.logger.debug(`Uploaded profile pic pool URL for ${doc.mobile}`, {
                    url,
                });
                await sleep(ClientHelperUtils.gaussianRandom(5000, 1000, 3000, 7000));
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Failed to upload profile pic pool URL for ${doc.mobile}: ${errorMessage}`, {
                    url,
                });
            } finally {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            }
        }

        return filesUploaded;
    }

    public async refreshProfilePhotosOnDemand(mobile: string): Promise<{ refreshed: boolean; uploadedCount: number }> {
        const doc = await this.findOne(mobile, false);
        if (!doc) {
            throw new NotFoundException(`${this.clientType} client ${mobile} not found`);
        }
        if (!doc.clientId) {
            throw new NotFoundException(`${this.clientType} client ${mobile} is not linked to a clientId`);
        }

        const client = await this.clientService.findOne(doc.clientId, false);
        if (!client) {
            throw new NotFoundException(`Client ${doc.clientId} not found for ${mobile}`);
        }

        const assignedPhotoUrls = (doc.assignedProfilePics || []).filter((url): url is string => typeof url === 'string' && url.trim().length > 0);
        if (assignedPhotoUrls.length < 2) {
            this.logger.warn(`Skipping on-demand profile photo refresh for ${mobile}: assigned profile pic URLs are missing or too small`, {
                clientId: doc.clientId,
                assignedPhotoCount: assignedPhotoUrls.length,
            });
            return { refreshed: false, uploadedCount: 0 };
        }

        const uploadedCount = await this.updateProfilePhotos(doc, client, doc.failedUpdateAttempts || 0);
        this.logger.info(`Completed on-demand profile photo refresh for ${mobile}`, {
            clientId: doc.clientId,
            uploadedCount,
        });
        return { refreshed: uploadedCount > 0, uploadedCount };
    }

    protected async updateProfilePhotos(doc: TDoc, client: Client, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'medium');

            const photos = await telegramClient.client.invoke(new Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
            let updateCount = 0;

            if (doc.assignedProfilePics?.length > 0) {
                // ── PERSONA BRANCH: upload assigned photos ──────────────────
                if (photos.photos.length < 2) {
                    const assignedPhotoUrls = doc.assignedProfilePics.filter((url) => typeof url === 'string' && url.trim().length > 0);
                    if (assignedPhotoUrls.length > 1) {
                        this.logger.info(`Using assigned profile pic URLs for ${doc.mobile}`, { urlCount: assignedPhotoUrls.length });
                        updateCount = await this.uploadProfilePhotosFromUrls(telegramClient, doc, assignedPhotoUrls);
                    } else {
                        this.logger.warn(`Skipping profile photo update for ${doc.mobile}: assigned profile pic pool is missing or too small`, {
                            assignedCount: assignedPhotoUrls.length,
                        });
                    }

                    if (updateCount === 0) {
                        this.logger.warn(`No profile photos uploaded from assigned profile pic URLs for ${doc.mobile}, skipping profilePicsUpdatedAt stamp`);
                        await sleep(ClientHelperUtils.gaussianRandom(50000, 5000, 40000, 60000));
                        return 0;
                    }
                }
            } else {
                this.logger.debug(`Skipping profile photo update for ${doc.mobile}: no assigned profile pic URLs available`);
            }

            await this.update(doc.mobile, {
                ...(updateCount > 0 ? { profilePicsUpdatedAt: new Date() } : {}),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            await sleep(ClientHelperUtils.gaussianRandom(50000, 5000, 40000, 60000));
            return updateCount;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error updating profile photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    private readonly KNOWN_2FA_PASSWORD = 'Ajtdmwajt1@';

    /**
     * Verify that the existing 2FA password on a Telegram account is ours.
     * Uses account.GetPasswordSettings with SRP auth — if the password is wrong, Telegram rejects it.
     */
    private async verifyOurPassword(telegramClient: TelegramManager, mobile: string): Promise<boolean> {
        try {
            const passwordInfo = await telegramClient.client.invoke(new Api.account.GetPassword());
            if (!passwordInfo.hasPassword) return false; // No password set

            const srp = await computeCheck(passwordInfo, this.KNOWN_2FA_PASSWORD);
            await telegramClient.client.invoke(new Api.account.GetPasswordSettings({ password: srp }));
            // If we get here without throwing, the password is correct
            return true;
        } catch (error: any) {
            const msg = (error?.message || error?.errorMessage || '').toLowerCase();
            if (msg.includes('password_hash_invalid') || msg.includes('srp_id_invalid')) {
                // Password is wrong — this is a foreign password
                this.logger.warn(`${mobile}: 2FA password verification failed — foreign password`);
                return false;
            }
            // Other errors (network, etc.) — don't know, treat as unverifiable
            this.logger.warn(`${mobile}: 2FA password verification error: ${msg}`);
            return false;
        }
    }

    protected async set2fa(doc: TDoc, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'full');

            const hasPassword = await telegramClient.hasPassword();
            if (hasPassword) {
                // CRITICAL: Verify the password is OURS before proceeding.
                // If it's a foreign password, session rotation will fail later and the account is lost.
                const isOurPassword = await this.verifyOurPassword(telegramClient, doc.mobile);
                if (isOurPassword) {
                    this.logger.debug(`${doc.mobile} already has our 2FA set`);
                    await this.update(doc.mobile, {
                        lastUpdateAttempt: new Date(),
                        twoFASetAt: new Date(),
                    });
                    await this.updateUser2FAStatus(doc.tgId, doc.mobile);
                    return 1;
                } else {
                    // Foreign password — account is NOT safely controlled by us
                    this.logger.error(`${doc.mobile} has FOREIGN 2FA password — cannot control this account safely`);
                    await this.markAsInactive(doc.mobile, 'Foreign 2FA password — account unrecoverable if session dies');
                    this.botsService.sendMessageByCategory(
                        ChannelCategory.ACCOUNT_NOTIFICATIONS,
                        `FOREIGN 2FA:\n\nMobile: ${doc.mobile}\nPhase: ${doc.warmupPhase}\nAccount has unknown 2FA password — marked inactive`
                    );
                    return 0;
                }
            }

            await telegramClient.set2fa();
            await sleep(ClientHelperUtils.gaussianRandom(45000, 7500, 30000, 60000));

            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
                twoFASetAt: new Date(),
            });
            await this.updateUser2FAStatus(doc.tgId, doc.mobile);
            this.logger.debug(`Set 2FA for ${doc.mobile}`);
            return 1;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error setting 2FA', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    /**
     * Safely remove other authorizations.
     * Called AFTER 2FA is set (so account is secured first).
     * Wrapped in organic activity to look like a security-conscious user.
     */
    protected async removeOtherAuths(doc: TDoc, failedAttempts: number): Promise<number> {
        const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await performOrganicActivity(telegramClient, 'medium');

            // removeOtherAuths now includes post-revocation self-check (getMe).
            // If our session was accidentally revoked, it throws.
            await telegramClient.removeOtherAuths();
            await sleep(ClientHelperUtils.gaussianRandom(30000, 5000, 20000, 40000));

            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
                otherAuthsRemovedAt: new Date(),
            });
            this.logger.debug(`Removed other auths for ${doc.mobile} — session verified alive`);
            return 1;
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, 'Error removing other auths', doc.mobile);
            const errorMsg = errorDetails?.message || '';

            // If the self-check failed, our session is dead — this is critical
            if (errorMsg.includes('Session self-check failed') || errorMsg.includes('session_revoked') || errorMsg.includes('auth_key_unregistered')) {
                this.logger.error(`CRITICAL: Session lost for ${doc.mobile} during removeOtherAuths — marking inactive`);
                await this.markAsInactive(doc.mobile, `Session lost during auth cleanup: ${errorMsg}`);
                // Notify via bot
                this.botsService.sendMessageByCategory(
                    ChannelCategory.ACCOUNT_NOTIFICATIONS,
                    `CRITICAL SESSION LOSS:\n\nMobile: ${doc.mobile}\nPhase: ${doc.warmupPhase}\nError: ${errorMsg}`
                );
                return 0;
            }

            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        } finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }

    // ---- Main Warmup Processing (replaces processBufferClient / processPromoteClient) ----

    async processClient(doc: TDoc, client: Client): Promise<ProcessClientResult> {
        if (doc.inUse === true) {
            this.logger.debug(`Client ${doc.mobile} is marked as in use`);
            return { updateCount: 0 };
        }

        if (!client) {
            this.logger.warn(`Client not found for ${this.clientType} client ${doc.mobile}`);
            return { updateCount: 0 };
        }

        const now = Date.now();
        let updateCount = 0;

        try {
            await sleep(ClientHelperUtils.gaussianRandom(20000, 2500, 15000, 25000)); // 15-25s initial delay
            doc = await this.repairWarmupMetadata(doc, now);

            // Check failed attempts
            const failedAttempts = doc.failedUpdateAttempts || 0;
            const lastFailureTime = ClientHelperUtils.getTimestamp(doc.lastUpdateFailure);

            if (failedAttempts > 0 && (lastFailureTime <= 0 || now - lastFailureTime > this.FAILURE_RESET_DAYS * this.ONE_DAY_MS)) {
                this.logger.log(`Resetting failure count for ${doc.mobile}`);
                await this.update(doc.mobile, { failedUpdateAttempts: 0, lastUpdateFailure: null });
                doc = { ...doc, failedUpdateAttempts: 0, lastUpdateFailure: null } as TDoc;
            } else if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
                this.logger.warn(`Skipping ${doc.mobile} - too many failed attempts (${failedAttempts})`);
                return { updateCount: 0 };
            }

            // Check cooldown using the same stable jitter as outer schedulers.
            if (this.isOnCooldown(doc.mobile, doc.lastUpdateAttempt, now)) {
                this.logger.debug(`Client ${doc.mobile} on cooldown`);
                return { updateCount: 0 };
            }

            // Skip already-used clients (backfill timestamps)
            const lastUsed = ClientHelperUtils.getTimestamp(doc.lastUsed);
            if (lastUsed > 0) {
                await this.backfillTimestamps(doc.mobile, doc, now);
                this.logger.debug(`Client ${doc.mobile} has been used, assuming configured`);
                return { updateCount: 0, updateSummary: 'backfill_timestamps' };
            }

            // Get warmup phase action
            const warmupAction = getWarmupPhaseAction(doc, now);
            this.logger.debug(`Client ${doc.mobile} warmup: phase=${warmupAction.phase}, action=${warmupAction.action}`);

            // Update phase in DB if it changed
            if (warmupAction.phase !== doc.warmupPhase) {
                await this.update(doc.mobile, { warmupPhase: warmupAction.phase });
            }

            if (warmupAction.action === 'wait') {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                return { updateCount: 0 };
            }

            // Execute action
            switch (warmupAction.action) {
                case 'organic_only': {
                    const telegramClient = await connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
                    try {
                        await performOrganicActivity(telegramClient, warmupAction.organicIntensity);
                        await this.update(doc.mobile, { organicActivityAt: new Date(), lastUpdateAttempt: new Date() });
                    } finally {
                        await this.safeUnregisterClient(doc.mobile);
                    }
                    return { updateCount: 0, updateSummary: 'organic_only' };
                }

                case 'set_privacy':
                    updateCount = await this.updatePrivacySettings(doc, client, failedAttempts);
                    // Phase already updated to SETTLING by the phase-change check above (line 584)
                    return { updateCount, updateSummary: updateCount > 0 ? 'set_privacy' : null };

                case 'delete_photos':
                    updateCount = await this.deleteProfilePhotos(doc, client, failedAttempts);
                    return { updateCount, updateSummary: updateCount > 0 ? 'delete_photos' : null };

                case 'update_name_bio':
                    updateCount = await this.updateNameAndBio(doc, client, failedAttempts);
                    return { updateCount, updateSummary: updateCount > 0 ? 'update_name_bio' : null };

                case 'update_username':
                    updateCount = await this.updateUsername(doc, client, failedAttempts);
                    return { updateCount, updateSummary: updateCount > 0 ? 'update_username' : null };

                case 'upload_photo':
                    updateCount = await this.updateProfilePhotos(doc, client, failedAttempts);
                    return { updateCount, updateSummary: updateCount > 0 ? 'upload_photo' : null };

                case 'set_2fa':
                    updateCount = await this.set2fa(doc, failedAttempts);
                    return { updateCount, updateSummary: updateCount > 0 ? 'set_2fa' : null };

                case 'remove_other_auths':
                    updateCount = await this.removeOtherAuths(doc, failedAttempts);
                    return { updateCount, updateSummary: updateCount > 0 ? 'remove_other_auths' : null };

                case 'advance_to_ready':
                    await this.update(doc.mobile, { warmupPhase: WarmupPhase.READY });
                    this.logger.log(`Client ${doc.mobile} advanced to READY`);
                    return { updateCount: 0, updateSummary: 'advance_to_ready' };

                case 'join_channels':
                    // Channel joining handled separately by joinChannel* methods.
                    // Do NOT stamp lastUpdateAttempt or count as processed — this avoids
                    // wasting processing slots and cooldown cycles on a no-op.
                    return { updateCount: 0 };

                case 'rotate_session':
                    updateCount = (await this.rotateSession(doc.mobile)) ? 1 : 0;
                    if (updateCount === 0) {
                        await this.update(doc.mobile, {
                            lastUpdateAttempt: new Date(),
                            failedUpdateAttempts: (doc.failedUpdateAttempts || 0) + 1,
                            lastUpdateFailure: new Date(),
                        });
                    }
                    return { updateCount, updateSummary: updateCount > 0 ? 'rotate_session' : null };

                default:
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    return { updateCount: 0 };
            }
        } catch (error: unknown) {
            const errorDetails = this.handleError(error, `Error with ${this.clientType} client`, doc.mobile);
            try {
                await this.update(doc.mobile, {
                    lastUpdateAttempt: new Date(),
                    failedUpdateAttempts: (doc.failedUpdateAttempts || 0) + 1,
                    lastUpdateFailure: new Date(),
                });
            } catch (updateError) {
                this.logger.warn(`Failed to track update attempt for ${doc.mobile}:`, updateError);
            }
            if (isPermanentError(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message);
                await this.markAsInactive(doc.mobile, reason);
            }
            return { updateCount: 0 };
        } finally {
            await sleep(ClientHelperUtils.gaussianRandom(20000, 2500, 15000, 25000));
        }
    }

    // ---- Backfill Timestamps ----

    protected async backfillTimestamps(mobile: string, doc: TDoc, now: number): Promise<void> {
        const needsProfileBackfill = !doc.privacyUpdatedAt || !doc.profilePicsDeletedAt ||
            !doc.nameBioUpdatedAt || !doc.usernameUpdatedAt || !doc.profilePicsUpdatedAt;
        const needsWarmupBackfill = !doc.warmupPhase || !doc.twoFASetAt || !doc.otherAuthsRemovedAt || !doc.enrolledAt;

        if (!needsProfileBackfill && !needsWarmupBackfill) return;

        this.logger.log(`Backfilling fields for ${mobile}`);
        const allTimestamps = ClientHelperUtils.createBackfillTimestamps(now, this.ONE_DAY_MS);
        const backfillData: BaseClientUpdate = {};

        // Profile timestamps
        if (!doc.privacyUpdatedAt) backfillData.privacyUpdatedAt = allTimestamps.privacyUpdatedAt;
        if (!doc.profilePicsDeletedAt) backfillData.profilePicsDeletedAt = allTimestamps.profilePicsDeletedAt;
        if (!doc.nameBioUpdatedAt) backfillData.nameBioUpdatedAt = allTimestamps.nameBioUpdatedAt;
        if (!doc.usernameUpdatedAt) backfillData.usernameUpdatedAt = allTimestamps.usernameUpdatedAt;
        if (!doc.profilePicsUpdatedAt) backfillData.profilePicsUpdatedAt = allTimestamps.profilePicsUpdatedAt;

        // Warmup fields — migrated used accounts are already warmed
        const hasDistinctBackupSession = await this.hasDistinctUsersBackupSession(mobile, doc.session || null);
        if (!doc.warmupPhase) backfillData.warmupPhase = hasDistinctBackupSession ? WarmupPhase.SESSION_ROTATED : WarmupPhase.READY;
        if (!doc.enrolledAt) backfillData.enrolledAt = doc.createdAt || new Date(now - 30 * this.ONE_DAY_MS);
        if (!doc.twoFASetAt) backfillData.twoFASetAt = new Date(now - 28 * this.ONE_DAY_MS);
        if (!doc.otherAuthsRemovedAt) backfillData.otherAuthsRemovedAt = new Date(now - 27 * this.ONE_DAY_MS);
        if (hasDistinctBackupSession && !doc.sessionRotatedAt) backfillData.sessionRotatedAt = new Date(now - 26 * this.ONE_DAY_MS);

        if (Object.keys(backfillData).length > 0) {
            await this.update(mobile, backfillData);
            this.logger.log(`Backfilled ${Object.keys(backfillData).length} fields for ${mobile}`);
        }
    }

    // ---- Channel Queue Management ----

    async joinChannelQueue() {
        if (this.isJoinChannelProcessing) {
            this.logger.warn('Join channel process is already running');
            return;
        }

        if (this.joinChannelMap.size === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }

        if (!this.joinChannelIntervalId) {
            this.logger.debug('Starting join channel queue');
            // Use randomized setTimeout chain instead of fixed setInterval
            this.scheduleNextJoinRound();
        }
    }

    /**
     * Schedule the next join processing round with randomized delay.
     * Uses setTimeout chain (not setInterval) to avoid fixed-interval fingerprinting.
     */
    private async scheduleNextJoinRound() {
        if (this.joinChannelMap.size === 0) {
            try {
                this.joinFailureCounts.clear();
                const refilled = await this.refillJoinQueue(this.joinScopeClientId);
                if (refilled === 0) {
                    this.logger.debug('No eligible mobiles for channel joining — stopping until next trigger');
                    this.clearJoinChannelInterval();
                    return;
                }
                this.logger.log(`Refilled join queue with ${refilled} mobiles`);
            } catch (error) {
                this.logger.error('Error refilling join queue', error);
                this.clearJoinChannelInterval();
                return;
            }
        }

        // Randomize: base interval +/- 50% (e.g., 6min -> 3-9min)
        const baseInterval = this.config.joinChannelInterval;
        const jitter = ClientHelperUtils.gaussianRandom(0, baseInterval * 0.25, -baseInterval * 0.5, baseInterval * 0.5);
        const delay = Math.max(60000, baseInterval + jitter); // min 1 minute
        this.joinChannelIntervalId = this.createTimeout(async () => {
            await this.processJoinChannelInterval();
        }, delay);
    }

    protected async processJoinChannelInterval() {
        if (this.isJoinChannelProcessing) return;

        if (this.joinChannelMap.size === 0) {
            await this.scheduleNextJoinRound();
            return;
        }

        this.isJoinChannelProcessing = true;
        try {
            await this.processJoinChannelSequentially();
        } catch (error) {
            this.logger.error('Error in join channel queue', error);
        } finally {
            this.isJoinChannelProcessing = false;
            // Schedule next round (randomized) instead of fixed interval
            await this.scheduleNextJoinRound();
        }
    }

    /**
     * Round-robin channel joining with human-like pacing:
     * - Each mobile gets joinsPerMobilePerRound (3) joins before rotating to the next
     * - Daily cap of maxChannelJoinsPerDay (20) per mobile
     * - 90-180s between joins (Gaussian)
     * - Organic activity interleaved every 2-3 joins
     */
    protected async processJoinChannelSequentially() {
        this.resetDailyJoinCountersIfNeeded();

        const keys = Array.from(this.joinChannelMap.keys());
        this.logger.debug(`Processing join channel queue for ${keys.length} clients (round-robin, ${this.config.joinsPerMobilePerRound}/mobile)`);

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let currentChannel: Channel | ActiveChannel | null = null;
            let joinCount = 0;

            // Daily cap check — skip and remove if already at limit
            if (this.isMobileDailyCapped(mobile)) {
                this.logger.debug(`${mobile} hit daily cap (${this.config.maxChannelJoinsPerDay}), removing from queue`);
                this.removeFromJoinMap(mobile);
                continue;
            }

            try {
                const channels = this.joinChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.removeFromJoinMap(mobile);
                    continue;
                }

                const roundLimit = Math.min(
                    this.config.joinsPerMobilePerRound,
                    this.config.maxJoinsPerSession,
                    this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(mobile),
                    channels.length,
                );

                while (joinCount < roundLimit) {
                    currentChannel = channels.shift();
                    if (!currentChannel) break;

                    this.joinChannelMap.set(mobile, channels);
                    this.logger.debug(`${mobile} joining @${currentChannel.username} (${channels.length} remaining)`);

                    // Check if channel is banned
                    let activeChannel: ActiveChannel | null = null;
                    try {
                        activeChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                    } catch { /* ignore */ }

                    if (activeChannel && (activeChannel.banned === true || (activeChannel.deletedCount && activeChannel.deletedCount > 0))) {
                        this.logger.debug(`Skipping banned/deleted channel ${currentChannel.channelId}`);
                        await sleep(5000 + Math.random() * 3000);
                        continue;
                    }

                    await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                    joinCount++;
                    this.incrementDailyJoinCount(mobile);

                    // Organic interleaving every 2-3 joins
                    if (joinCount > 0 && joinCount % (2 + Math.floor(Math.random() * 2)) === 0) {
                        try {
                            const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                            await performOrganicActivity(client, 'light');
                        } catch {
                            // Non-fatal
                        }
                    }

                    // Human-like delay between joins: Gaussian mean=120s, stddev=30s, min=90s, max=180s
                    if (joinCount < roundLimit && channels.length > 0) {
                        const delay = ClientHelperUtils.gaussianRandom(120000, 30000, 90000, 180000);
                        await sleep(delay);
                    }
                }

                // Increment channel count by successful joins (no extra TG API call)
                if (joinCount > 0) {
                    try {
                        await this.model.updateOne({ mobile }, { $inc: { channels: joinCount } });
                    } catch {
                        // Non-fatal — count will be corrected on next health check
                    }
                }

                // Remove from map if empty or daily-capped; otherwise leave for next round
                if (channels.length === 0 || this.isMobileDailyCapped(mobile)) {
                    this.removeFromJoinMap(mobile);
                }
            } catch (error: any) {
                const errorDetails = this.handleError(
                    error,
                    `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error`,
                    mobile,
                );

                if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`${mobile} FloodWaitError or too many channels, removing from queue`);
                    this.removeFromJoinMap(mobile);

                    await sleep(ClientHelperUtils.gaussianRandom(12500, 1250, 10000, 15000));
                    try {
                        const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    } catch {
                        if (error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            await this.update(mobile, { channels: 500 });
                        }
                    }
                } else if (isPermanentError(errorDetails)) {
                    this.removeFromJoinMap(mobile);
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.markAsInactive(mobile, reason);
                    await this.expireUserByMobile(mobile);
                } else {
                    // Transient error — restore the failed channel and track failures
                    const channels = this.joinChannelMap.get(mobile);
                    if (currentChannel && channels) {
                        channels.unshift(currentChannel);
                    }
                    const failures = (this.joinFailureCounts.get(mobile) || 0) + 1;
                    this.joinFailureCounts.set(mobile, failures);
                    if (failures >= this.MAX_JOIN_FAILURES_PER_MOBILE) {
                        this.logger.warn(`${mobile} hit ${failures} transient join failures, quarantining for this cycle`);
                        this.removeFromJoinMap(mobile);
                    }
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                if (i < keys.length - 1) {
                    await sleep(this.config.clientProcessingDelay + Math.random() * 5000);
                }
            }
        }
    }

    // ---- Leave Channel Queue ----

    async leaveChannelQueue() {
        if (this.isLeaveChannelProcessing) {
            this.logger.warn('Leave channel process is already running');
            return;
        }

        if (this.leaveChannelMap.size === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }

        if (!this.leaveChannelIntervalId) {
            this.logger.debug('Starting leave channel queue');
            this.scheduleNextLeaveRound();
        }
    }

    private scheduleNextLeaveRound() {
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
            return;
        }
        const baseInterval = this.config.leaveChannelInterval;
        const jitter = ClientHelperUtils.gaussianRandom(0, baseInterval * 0.25, -baseInterval * 0.5, baseInterval * 0.5);
        const delay = Math.max(30000, baseInterval + jitter);
        this.leaveChannelIntervalId = this.createTimeout(async () => {
            await this.processLeaveChannelInterval();
        }, delay);
    }

    protected async processLeaveChannelInterval() {
        if (this.isLeaveChannelProcessing) return;

        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
            return;
        }

        this.isLeaveChannelProcessing = true;
        try {
            await this.processLeaveChannelSequentially();
        } catch (error) {
            this.logger.error('Error in leave channel queue', error);
        } finally {
            this.isLeaveChannelProcessing = false;
            this.scheduleNextLeaveRound();

            // After leave processing, kick the join loop if it's idle — accounts that
            // just left channels may now be eligible for new joins.
            if (!this.joinChannelIntervalId && !this.isJoinChannelProcessing) {
                this.scheduleNextJoinRound();
            }
        }
    }

    protected async processLeaveChannelSequentially() {
        const keys = Array.from(this.leaveChannelMap.keys());
        this.logger.debug(`Processing leave channel queue for ${keys.length} clients`);

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let channelsToProcess: string[] = [];

            try {
                const channels = this.leaveChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.removeFromLeaveMap(mobile);
                    continue;
                }

                channelsToProcess = channels.splice(0, this.config.leaveChannelBatchSize);
                this.logger.debug(`${mobile} leaving ${channelsToProcess.length} channels (${channels.length} remaining)`);

                if (channels.length > 0) {
                    this.leaveChannelMap.set(mobile, channels);
                } else {
                    this.removeFromLeaveMap(mobile);
                }

                const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                await client.leaveChannels(channelsToProcess);
                const leftCount = channelsToProcess.length;
                this.logger.debug(`${mobile} left ${leftCount} channels successfully`);

                // Decrement stored channel count so refill can pick this mobile up again
                if (leftCount > 0) {
                    try {
                        await this.model.updateOne({ mobile }, { $inc: { channels: -leftCount } });
                    } catch {
                        // Non-fatal — health check will correct
                    }
                }
                channelsToProcess = []; // Mark as consumed so catch doesn't restore
            } catch (error: unknown) {
                const errorDetails = this.handleError(error, `${mobile} Leave Channel Error`, mobile);
                if (isPermanentError(errorDetails)) {
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.markAsInactive(mobile, reason);
                    await this.expireUserByMobile(mobile);
                    this.removeFromLeaveMap(mobile);
                } else if (channelsToProcess.length > 0) {
                    // Transient failure — restore spliced channels back to the queue
                    const existing = this.leaveChannelMap.get(mobile) || [];
                    existing.unshift(...channelsToProcess);
                    this.safeSetLeaveChannelMap(mobile, existing);
                    this.logger.warn(`${mobile} transient leave failure, restored ${channelsToProcess.length} channels to queue`);
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                if (i < keys.length - 1 || (this.leaveChannelMap.get(mobile)?.length || 0) > 0) {
                    await sleep((this.config.leaveChannelInterval / 2) + Math.random() * 60000);
                }
            }
        }
    }

    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.activeTimeouts.delete(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
        this.isJoinChannelProcessing = false;
    }

    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            clearInterval(this.leaveChannelIntervalId);
            this.activeTimeouts.delete(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
    }

    protected getMissingWarmupPhaseQuery(clientId?: string): Record<string, any> {
        const filter: Record<string, any> = {
            status: 'active',
            $or: [{ warmupPhase: { $exists: false } }, { warmupPhase: null }],
        };
        if (clientId) filter.clientId = clientId;
        return filter;
    }

    protected async selfHealLegacyUsedAccounts(clientId?: string, limit: number = 100): Promise<number> {
        const docs = await this.model
            .find({
                ...this.getMissingWarmupPhaseQuery(clientId),
                lastUsed: { $exists: true, $ne: null },
            })
            .sort({ lastUsed: -1, _id: 1 })
            .limit(limit)
            .exec();

        if (!docs.length) return 0;

        const now = Date.now();
        let healed = 0;
        for (const doc of docs) {
            await this.backfillTimestamps(doc.mobile, doc as TDoc, now);
            healed++;
        }

        if (healed > 0) {
            this.logger.log(`Self-healed ${healed} legacy used ${this.clientType} accounts${clientId ? ` for ${clientId}` : ''}`);
        }
        return healed;
    }

    protected async selfHealLegacyWarmupAccounts(clientId?: string, limit: number = 50): Promise<number> {
        const docs = await this.model
            .find({
                $and: [
                    this.getMissingWarmupPhaseQuery(clientId),
                    { $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }] },
                ],
            })
            .sort({ createdAt: 1, _id: 1 })
            .limit(limit)
            .exec();

        if (!docs.length) return 0;

        const now = Date.now();
        let healed = 0;
        for (const doc of docs) {
            await this.repairWarmupMetadata(doc as TDoc, now);
            healed++;
        }

        if (healed > 0) {
            this.logger.log(`Self-healed ${healed} legacy warming ${this.clientType} accounts${clientId ? ` for ${clientId}` : ''}`);
        }
        return healed;
    }

    protected async selfHealLegacyOperationalState(clientId?: string): Promise<void> {
        await this.selfHealLegacyUsedAccounts(clientId);
        await this.selfHealLegacyWarmupAccounts(clientId);
    }

    // ---- Availability Calculations ----

    protected async getStoredActiveSession(mobile: string): Promise<string | null> {
        const doc = await this.model.findOne({ mobile }, { session: 1 }).lean<{ session?: string }>().exec();
        return doc?.session?.trim() || null;
    }

    protected async createDistinctSessionString(mobile: string, forbiddenSessions: Array<string | null | undefined>, maxAttempts: number = 2): Promise<string | null> {
        const forbidden = new Set(
            forbiddenSessions
                .map((session) => session?.trim())
                .filter((session): session is string => !!session),
        );

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const newSession = (await this.telegramService.createNewSession(mobile))?.trim();
            if (newSession && !forbidden.has(newSession)) {
                return newSession;
            }
            this.logger.warn(`Rejected duplicate/empty rotated session for ${mobile} on attempt ${attempt + 1}`);
        }

        return null;
    }

    protected async hasDistinctUsersBackupSession(mobile: string, activeSession: string | null | undefined): Promise<boolean> {
        const users = await this.usersService.search({ mobile });
        if (!users.length) return false;

        const backupSession = users[0].session?.trim();
        const active = activeSession?.trim();
        return !!backupSession && !!active && backupSession !== active;
    }

    public async getOrEnsureDistinctUsersBackupSession(
        mobile: string,
        activeSession: string | null | undefined,
    ): Promise<User | null> {
        const active = activeSession?.trim();
        if (!active) return null;

        const users = await this.usersService.search({ mobile });
        if (!users.length) {
            throw new NotFoundException(`User not found for ${mobile}`);
        }

        const user = users[0] as User;
        const currentBackup = user.session?.trim();
        if (currentBackup && currentBackup !== active) {
            return user;
        }

        const distinctBackup = await this.createDistinctSessionString(mobile, [active, currentBackup]);
        if (!distinctBackup) {
            return null;
        }

        await this.usersService.update(user.tgId, { session: distinctBackup });
        return {
            ...user,
            session: distinctBackup,
        };
    }

    public async ensureDistinctUsersBackupSession(mobile: string, activeSession: string | null | undefined): Promise<boolean> {
        const user = await this.getOrEnsureDistinctUsersBackupSession(mobile, activeSession);
        return !!user?.session?.trim();
    }

    protected async expireUserByMobile(mobile: string): Promise<void> {
        try {
            const users = await this.usersService.search({ mobile, expired: false });
            const user = users[0];
            if (user?.tgId) {
                await this.usersService.update(user.tgId, { expired: true });
            }
        } catch {
            // Non-fatal: client doc deactivation is the primary retirement action.
        }
    }

    protected normalizeDateString(dateValue?: string | Date | null): string | null {
        if (!dateValue) return null;
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
        }
        const timestamp = ClientHelperUtils.getTimestamp(dateValue);
        return timestamp > 0 ? ClientHelperUtils.toDateString(timestamp) : null;
    }

    protected maxDateString(...dateStrings: Array<string | null | undefined>): string | null {
        const validDates = dateStrings.filter((value): value is string => !!value);
        if (!validDates.length) return null;
        return validDates.reduce((max, current) => (current > max ? current : max));
    }

    protected getProjectedReadyDateString(doc: Partial<BaseClientDocument>): string | null {
        const phase = doc.warmupPhase || this.inferWarmupPhaseFromProgress(doc as TDoc);
        if (!isAccountWarmingUp(phase)) return null;

        const enrolledTimestamp = ClientHelperUtils.getTimestamp(doc.enrolledAt) || ClientHelperUtils.getTimestamp(doc.createdAt);
        if (enrolledTimestamp <= 0) return null;

        const jitter = Math.max(0, doc.warmupJitter || 0);
        const readyTimestamp = enrolledTimestamp + (WARMUP_PHASE_THRESHOLDS.ready + jitter) * this.ONE_DAY_MS;
        return ClientHelperUtils.toDateString(readyTimestamp);
    }

    protected getOperationalAvailabilityDateString(doc: Partial<BaseClientDocument>, now: number): string | null {
        const availableDate = this.normalizeDateString(doc.availableDate);
        const lastUsedTimestamp = ClientHelperUtils.getTimestamp(doc.lastUsed);

        // Legacy active accounts that were already used are operational now, even if warmup metadata
        // has not been backfilled yet. Credit them in planning so replenishment does not over-enroll.
        if (!doc.warmupPhase && lastUsedTimestamp > 0) {
            return availableDate || ClientHelperUtils.toDateString(now);
        }

        const phase = doc.warmupPhase || this.inferWarmupPhaseFromProgress(doc as TDoc);
        if (isAccountReady(phase)) {
            return availableDate || ClientHelperUtils.toDateString(now);
        }

        if (!isAccountWarmingUp(phase)) return null;

        const projectedReadyDate = this.getProjectedReadyDateString({ ...doc, warmupPhase: phase });
        if (!projectedReadyDate) return null;

        return this.maxDateString(projectedReadyDate, availableDate);
    }

    protected getReplenishmentWindows(): Array<{ name: string; days: number; minRequired: number }> {
        return [
            {
                name: 'threeWeeks',
                days: 21,
                minRequired: Math.max(1, Math.ceil(this.config.minTotalClients * 0.6)),
            },
            {
                name: 'oneMonth',
                days: 30,
                minRequired: this.config.minTotalClients,
            },
        ];
    }

    protected async calculateAvailabilityBasedNeedsForCurrentState(clientId: string): Promise<AvailabilityNeeds> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const windows = this.AVAILABILITY_WINDOWS.map(window => ({
            ...window,
            targetDate: ClientHelperUtils.toDateString(today.getTime() + window.days * this.ONE_DAY_MS),
        }));
        const replenishmentWindows = this.getReplenishmentWindows().map(window => ({
            ...window,
            targetDate: ClientHelperUtils.toDateString(today.getTime() + window.days * this.ONE_DAY_MS),
        }));
        const activeDocs = await this.model.find(
            { clientId, status: 'active' },
            {
                availableDate: 1,
                warmupPhase: 1,
                warmupJitter: 1,
                enrolledAt: 1,
                createdAt: 1,
                lastUsed: 1,
                sessionRotatedAt: 1,
                profilePicsUpdatedAt: 1,
                usernameUpdatedAt: 1,
                nameBioUpdatedAt: 1,
                profilePicsDeletedAt: 1,
                otherAuthsRemovedAt: 1,
                twoFASetAt: 1,
                privacyUpdatedAt: 1,
                channels: 1,
            },
        ).exec();

        const readyOperationalDates: string[] = [];
        const pipelineOperationalDates: string[] = [];

        for (const doc of activeDocs) {
            const operationalDate = this.getOperationalAvailabilityDateString(doc as Partial<BaseClientDocument>, today.getTime());
            if (!operationalDate) continue;

            const phase = doc.warmupPhase || this.inferWarmupPhaseFromProgress(doc as TDoc);
            const isLegacyOperational = !doc.warmupPhase && ClientHelperUtils.getTimestamp(doc.lastUsed) > 0;

            if (isLegacyOperational || isAccountReady(phase)) {
                readyOperationalDates.push(operationalDate);
            } else {
                pipelineOperationalDates.push(operationalDate);
            }
        }

        const readyActive = readyOperationalDates.length;
        const warmingPipeline = pipelineOperationalDates.length;
        const totalActive = readyActive + warmingPipeline;

        const windowNeeds = [];
        const projectedWindowCounts = [];
        const replenishmentWindowNeeds = [];
        let maxEnrollableWindowNeeded = 0;
        let mostUrgentEnrollableWindow = '';
        let mostUrgentPriority = 999;
        let hasShortWindowDeficit = false;

        for (const window of windows) {
            const readyAvailableCount = readyOperationalDates.filter((date) => date <= window.targetDate).length;
            const projectedAvailableCount = pipelineOperationalDates.filter((date) => date <= window.targetDate).length;
            const availableCount = readyAvailableCount + projectedAvailableCount;
            const needed = Math.max(0, window.minRequired - availableCount);
            windowNeeds.push({
                window: window.name,
                available: availableCount,
                needed,
                targetDate: window.targetDate,
                minRequired: window.minRequired,
            });
            projectedWindowCounts.push({
                window: window.name,
                available: availableCount,
                targetDate: window.targetDate,
            });
            if (needed > 0) {
                hasShortWindowDeficit = true;
            }
        }

        for (const window of replenishmentWindows) {
            const availableCount =
                readyOperationalDates.filter((date) => date <= window.targetDate).length +
                pipelineOperationalDates.filter((date) => date <= window.targetDate).length;
            const needed = Math.max(0, window.minRequired - availableCount);
            replenishmentWindowNeeds.push({
                window: window.name,
                available: availableCount,
                needed,
                targetDate: window.targetDate,
                minRequired: window.minRequired,
            });

            if (needed > maxEnrollableWindowNeeded) {
                maxEnrollableWindowNeeded = needed;
                mostUrgentEnrollableWindow = window.name;
                mostUrgentPriority = window.days;
            } else if (needed > 0 && window.days < mostUrgentPriority) {
                mostUrgentEnrollableWindow = window.name;
                mostUrgentPriority = window.days;
            }
        }

        const oneMonthWindow = replenishmentWindowNeeds.find((window) => window.window === 'oneMonth');
        const totalNeededForCount = oneMonthWindow?.needed || 0;
        const totalNeeded = maxEnrollableWindowNeeded;

        let priority = 100;
        if (maxEnrollableWindowNeeded > 0) {
            priority = mostUrgentPriority;
        }

        let calculationReason = '';
        if (maxEnrollableWindowNeeded > 0 && totalNeededForCount > 0) {
            calculationReason = `Window '${mostUrgentEnrollableWindow}' needs ${maxEnrollableWindowNeeded}, total pipeline count needs ${totalNeededForCount}`;
        } else if (maxEnrollableWindowNeeded > 0) {
            const windowConfig = replenishmentWindowNeeds.find(w => w.window === mostUrgentEnrollableWindow);
            calculationReason = `Window '${mostUrgentEnrollableWindow}' needs ${maxEnrollableWindowNeeded} to meet minimum of ${windowConfig?.minRequired || 'unknown'}`;
        } else if (totalNeededForCount > 0) {
            calculationReason = `One-month pipeline needs ${totalNeededForCount} to reach minimum of ${this.config.minTotalClients} (ready=${readyActive}, warming=${warmingPipeline})`;
        } else if (hasShortWindowDeficit) {
            calculationReason = `Short-term windows are below target, but current replenishment focuses on the 3-4 week horizon (ready=${readyActive}, warming=${warmingPipeline})`;
        } else {
            calculationReason = `Short-term and replenishment horizons satisfied (ready=${readyActive}, warming=${warmingPipeline})`;
        }

        return {
            totalNeeded,
            windowNeeds,
            totalActive,
            totalNeededForCount,
            calculationReason,
            priority,
            readyActive,
            warmingPipeline,
            replenishmentWindowNeeds,
            projectedWindowCounts,
        };
    }

    protected async calculateAvailabilityBasedNeeds(clientId: string): Promise<AvailabilityNeeds> {
        await this.selfHealLegacyOperationalState(clientId);
        return this.calculateAvailabilityBasedNeedsForCurrentState(clientId);
    }

    // ---- Stats / Query Helpers ----

    async getClientsByStatus(status: ClientStatusType): Promise<TDoc[]> {
        return this.model.find({ status }).exec();
    }

    async getClientsWithMessages(): Promise<Array<{ mobile: string; status: ClientStatusType; message?: string; clientId?: string; lastUsed?: Date }>> {
        const docs = await this.model
            .find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 })
            .lean()
            .exec();
        return docs.map((doc) => ({
            mobile: doc.mobile,
            status: doc.status,
            message: doc.message,
            clientId: doc.clientId,
            lastUsed: doc.lastUsed,
        }));
    }

    async getLeastRecentlyUsedClients(clientId: string, limit: number = 1): Promise<TDoc[]> {
        await this.selfHealLegacyOperationalState(clientId);
        const today = ClientHelperUtils.getTodayDateString();

        return this.model
            .find({
                clientId,
                status: 'active',
                inUse: { $ne: true },
                warmupPhase: WarmupPhase.SESSION_ROTATED,
                $or: [
                    { availableDate: { $lte: today } },
                    { availableDate: { $exists: false } },
                    { availableDate: null },
                ],
            })
            .sort({ lastUsed: 1, _id: 1 })
            .limit(limit)
            .exec();
    }

    async getNextAvailableClient(clientId: string): Promise<TDoc | null> {
        const clients = await this.getLeastRecentlyUsedClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }

    async getUnusedClients(hoursAgo: number = 24, clientId?: string): Promise<TDoc[]> {
        await this.selfHealLegacyOperationalState(clientId);

        const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const today = ClientHelperUtils.getTodayDateString();
        const filter: Record<string, any> = {
            status: 'active',
            inUse: { $ne: true },
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            $and: [
                {
                    $or: [
                        { availableDate: { $lte: today } },
                        { availableDate: { $exists: false } },
                        { availableDate: null },
                    ],
                },
                {
                    $or: [
                        { lastUsed: { $lt: cutoffDate } },
                        { lastUsed: { $exists: false } },
                        { lastUsed: null },
                    ],
                },
            ],
        };
        if (clientId) filter.clientId = clientId;
        return this.model.find(filter).exec();
    }

    async getUsageStatistics(clientId?: string): Promise<{
        totalClients: number;
        neverUsed: number;
        usedInLast24Hours: number;
        usedInLastWeek: number;
        averageUsageGap: number;
    }> {
        const filter: Record<string, any> = { status: 'active' };
        if (clientId) filter.clientId = clientId;

        const now = new Date();
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);
        const lastWeek = new Date(now.getTime() - 7 * this.ONE_DAY_MS);

        const [totalClients, neverUsed, usedInLast24Hours, usedInLastWeek, allClients] = await Promise.all([
            this.model.countDocuments(filter),
            this.model.countDocuments({ ...filter, $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }] }),
            this.model.countDocuments({ ...filter, lastUsed: { $gte: last24Hours } }),
            this.model.countDocuments({ ...filter, lastUsed: { $gte: lastWeek } }),
            this.model.find(filter, { lastUsed: 1, createdAt: 1 }).exec(),
        ]);

        let totalGap = 0;
        let gapCount = 0;
        for (const client of allClients) {
            if (client.lastUsed) {
                totalGap += now.getTime() - new Date(client.lastUsed).getTime();
                gapCount++;
            }
        }

        return {
            totalClients,
            neverUsed,
            usedInLast24Hours,
            usedInLastWeek,
            averageUsageGap: gapCount > 0 ? totalGap / gapCount / (60 * 60 * 1000) : 0,
        };
    }

    async markAsUsed(mobile: string, message?: string): Promise<TDoc> {
        const updateData: BaseClientUpdate = { lastUsed: new Date() };
        if (message) updateData.message = message;
        return this.update(mobile, updateData);
    }

    // ---- Session Rotation ----

    protected normalizeMobileNumber(value?: string | null): string {
        return (value || '').replace(/[^\d]/g, '');
    }

    protected async createVerifiedSessionClient(mobile: string, session: string): Promise<TelegramClient | null> {
        const trimmedSession = session?.trim();
        if (!trimmedSession) return null;

        let client: TelegramClient | null = null;
        try {
            const { apiId, apiHash, params } = await generateTGConfig(mobile);
            client = new TelegramClient(new StringSession(trimmedSession), apiId, apiHash, params);
            await client.connect();
            const me = await client.getMe() as Api.User | null;
            const sessionPhone = this.normalizeMobileNumber(me?.phone || '');
            const expectedMobile = this.normalizeMobileNumber(mobile);
            if (!sessionPhone || sessionPhone !== expectedMobile) {
                this.logger.warn(`Session mobile mismatch for ${mobile}: got ${sessionPhone || 'unknown'}`);
                await client.destroy();
                return null;
            }
            return client;
        } catch (error) {
            this.logger.warn(`Session liveness check failed for ${mobile}: ${parseError(error, 'verifySessionLive').message}`);
            if (client) {
                try {
                    await client.destroy();
                } catch {
                    // Best-effort cleanup only.
                }
            }
            return null;
        }
    }

    /**
     * Verify a stored session can still authenticate and belongs to the expected mobile.
     */
    protected async verifySessionLive(mobile: string, session: string): Promise<boolean> {
        const client = await this.createVerifiedSessionClient(mobile, session);
        if (!client) return false;
        try {
            return true;
        } finally {
            if (client) {
                try {
                    await client.destroy();
                } catch {
                    // Best-effort cleanup only.
                }
            }
        }
    }

    /**
     * Best-effort authorization inspection for the active session that remains on the client doc.
     */
    protected async verifySessionAuthorizations(mobile: string, session: string, existingClient?: TelegramClient): Promise<void> {
        const trimmedSession = session?.trim();
        if (!trimmedSession && !existingClient) return;

        let client: TelegramClient | null = existingClient || null;
        const ownsClientLifecycle = !existingClient;
        try {
            if (!client) {
                const { apiId, apiHash, params } = await generateTGConfig(mobile);
                client = new TelegramClient(new StringSession(trimmedSession), apiId, apiHash, params);
                await client.connect();
            }
            const authResult = await client.invoke(new Api.account.GetAuthorizations());
            this.logger.log(`Authorization check for ${mobile}: ${authResult.authorizations.length} active sessions found`);
        } catch (error) {
            this.logger.warn(`Authorization check failed for ${mobile}: ${parseError(error, 'GetAuthorizations').message}`);
        } finally {
            if (client && ownsClientLifecycle) {
                try {
                    await client.destroy();
                } catch {
                    // Best-effort cleanup only.
                }
            }
        }
    }

    protected async resolveRotationBackupSession(
        mobile: string,
        activeSession: string,
        user: User,
    ): Promise<{ backupSession: string | null; reusedExisting: boolean }> {
        const existingBackup = user.session?.trim() || null;

        if (existingBackup && existingBackup !== activeSession) {
            const backupSessionIsLive = await this.verifySessionLive(mobile, existingBackup);
            if (backupSessionIsLive) {
                this.logger.log(`Reusing existing users backup session for ${mobile}`);
                return { backupSession: existingBackup, reusedExisting: true };
            }
            this.logger.warn(`Existing backup session is not valid for ${mobile}; creating a fresh backup`);
        }

        this.logger.log(`Creating fresh backup session for ${mobile}`);
        const backupSession = await this.createDistinctSessionString(mobile, [activeSession, existingBackup]);
        if (!backupSession) {
            return { backupSession: null, reusedExisting: false };
        }

        await this.usersService.update(user.tgId, { session: backupSession });
        return { backupSession, reusedExisting: false };
    }

    protected async verifyRotationPersistence(
        mobile: string,
        activeSession: string,
        expectedBackupSession: string,
    ): Promise<boolean> {
        const persistedBackupUsers = await this.usersService.search({ mobile });
        const persistedBackup = persistedBackupUsers[0]?.session?.trim() || null;
        const persistedActive = await this.getStoredActiveSession(mobile);

        if (persistedActive?.trim() !== activeSession) {
            this.logger.error(`Active session changed unexpectedly during rotation for ${mobile}`);
            return false;
        }
        if (!persistedBackup || persistedBackup === activeSession || persistedBackup !== expectedBackupSession) {
            this.logger.error(`Backup session persistence verification failed for ${mobile}`);
            return false;
        }

        return true;
    }

    /**
     * Keep the existing active session on the buffer/promote client doc.
     * Reuse an existing distinct users backup when it is live for the same mobile,
     * otherwise create and persist a fresh distinct backup.
     */
    async rotateSession(mobile: string): Promise<boolean> {
        let activeClient: TelegramClient | null = null;
        try {
            this.logger.log(`Starting session rotation for ${mobile}`);

            const activeSession = await this.getStoredActiveSession(mobile);
            if (!activeSession) {
                this.logger.error(`No active session found in client doc for ${mobile}`);
                return false;
            }
            activeClient = await this.createVerifiedSessionClient(mobile, activeSession);
            if (!activeClient) {
                this.logger.error(`Active session is not live for the expected mobile ${mobile}`);
                return false;
            }

            const users = await this.usersService.search({ mobile });
            if (!users.length) {
                this.logger.error(`No user record found for ${mobile}`);
                return false;
            }

            const user = users[0] as User;
            const { backupSession } = await this.resolveRotationBackupSession(mobile, activeSession, user);
            if (!backupSession) {
                this.logger.error(`Failed to create distinct backup session for ${mobile}`);
                return false;
            }

            await this.verifySessionAuthorizations(mobile, activeSession, activeClient);

            const persistenceVerified = await this.verifyRotationPersistence(mobile, activeSession, backupSession);
            if (!persistenceVerified) {
                return false;
            }

            await this.update(mobile, {
                warmupPhase: WarmupPhase.SESSION_ROTATED,
                sessionRotatedAt: new Date(),
            });

            this.logger.log(`Session rotation complete for ${mobile} — active session retained, users backup verified`);
            return true;
        } catch (error) {
            this.logger.error(`Session rotation failed for ${mobile}: ${parseError(error, 'rotateSession').message}`);
            return false;
        } finally {
            if (activeClient) {
                try {
                    await activeClient.destroy();
                } catch {
                    // Best-effort cleanup only.
                }
            }
            await this.safeUnregisterClient(mobile);
        }
    }
}
