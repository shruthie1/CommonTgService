"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseClientService = exports.performOrganicActivity = exports.getWarmupPhaseAction = exports.isAccountWarmingUp = exports.isAccountReady = exports.WarmupPhase = exports.ClientStatus = void 0;
const common_1 = require("@nestjs/common");
const Helpers_1 = require("telegram/Helpers");
const parseError_1 = require("../../utils/parseError");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const utils_1 = require("../../utils");
const channelinfo_1 = require("../../utils/telegram-utils/channelinfo");
const path_1 = __importDefault(require("path"));
const cloudinary_1 = require("../../cloudinary");
const telegram_1 = require("telegram");
const Password_1 = require("telegram/Password");
const isPermanentError_1 = __importDefault(require("../../utils/isPermanentError"));
const bots_1 = require("../bots");
const client_helper_utils_1 = require("./client-helper.utils");
const organic_activity_1 = require("./organic-activity");
Object.defineProperty(exports, "performOrganicActivity", { enumerable: true, get: function () { return organic_activity_1.performOrganicActivity; } });
const warmup_phases_1 = require("./warmup-phases");
Object.defineProperty(exports, "getWarmupPhaseAction", { enumerable: true, get: function () { return warmup_phases_1.getWarmupPhaseAction; } });
Object.defineProperty(exports, "WarmupPhase", { enumerable: true, get: function () { return warmup_phases_1.WarmupPhase; } });
Object.defineProperty(exports, "isAccountReady", { enumerable: true, get: function () { return warmup_phases_1.isAccountReady; } });
Object.defineProperty(exports, "isAccountWarmingUp", { enumerable: true, get: function () { return warmup_phases_1.isAccountWarmingUp; } });
exports.ClientStatus = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
};
class BaseClientService {
    resetDailyJoinCountersIfNeeded() {
        const today = client_helper_utils_1.ClientHelperUtils.getTodayDateString();
        if (today !== this.dailyJoinDate) {
            this.dailyJoinCounts.clear();
            this.dailyJoinDate = today;
        }
    }
    getDailyJoinCount(mobile) {
        this.resetDailyJoinCountersIfNeeded();
        return this.dailyJoinCounts.get(mobile) || 0;
    }
    incrementDailyJoinCount(mobile) {
        this.dailyJoinCounts.set(mobile, this.getDailyJoinCount(mobile) + 1);
    }
    isMobileDailyCapped(mobile) {
        return this.getDailyJoinCount(mobile) >= this.config.maxChannelJoinsPerDay;
    }
    getEffectiveCooldownMs(mobile, lastUpdateAttempt) {
        const baseCooldownMs = this.config.cooldownHours * 60 * 60 * 1000;
        if (lastUpdateAttempt <= 0)
            return baseCooldownMs;
        const seed = `${mobile}:${lastUpdateAttempt}`;
        const hashToUnit = (input) => {
            let hash = 0;
            for (let i = 0; i < input.length; i++) {
                hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
            }
            return (hash >>> 0) / 0xffffffff;
        };
        const averagedUnit = (hashToUnit(`${seed}:a`) + hashToUnit(`${seed}:b`) + hashToUnit(`${seed}:c`)) / 3;
        const minJitterMs = -30 * 60 * 1000;
        const maxJitterMs = 60 * 60 * 1000;
        const jitterMs = Math.round(minJitterMs + averagedUnit * (maxJitterMs - minJitterMs));
        return baseCooldownMs + jitterMs;
    }
    isOnCooldown(mobile, lastUpdateAttempt, now) {
        const lastAttemptTs = client_helper_utils_1.ClientHelperUtils.getTimestamp(lastUpdateAttempt);
        if (lastAttemptTs <= 0)
            return false;
        return now - lastAttemptTs < this.getEffectiveCooldownMs(mobile, lastAttemptTs);
    }
    inferWarmupPhaseFromProgress(doc) {
        if (doc.warmupPhase)
            return doc.warmupPhase;
        if (doc.sessionRotatedAt)
            return warmup_phases_1.WarmupPhase.SESSION_ROTATED;
        if (doc.profilePicsUpdatedAt)
            return warmup_phases_1.WarmupPhase.MATURING;
        if ((doc.channels || 0) >= warmup_phases_1.MIN_CHANNELS_FOR_MATURING || doc.usernameUpdatedAt)
            return warmup_phases_1.WarmupPhase.GROWING;
        if (doc.nameBioUpdatedAt || doc.profilePicsDeletedAt)
            return warmup_phases_1.WarmupPhase.IDENTITY;
        if (doc.otherAuthsRemovedAt || doc.twoFASetAt || doc.privacyUpdatedAt)
            return warmup_phases_1.WarmupPhase.SETTLING;
        return warmup_phases_1.WarmupPhase.ENROLLED;
    }
    getWarmupPhaseRank(phase) {
        const order = {
            [warmup_phases_1.WarmupPhase.ENROLLED]: 0,
            [warmup_phases_1.WarmupPhase.SETTLING]: 1,
            [warmup_phases_1.WarmupPhase.IDENTITY]: 2,
            [warmup_phases_1.WarmupPhase.GROWING]: 3,
            [warmup_phases_1.WarmupPhase.MATURING]: 4,
            [warmup_phases_1.WarmupPhase.READY]: 5,
            [warmup_phases_1.WarmupPhase.SESSION_ROTATED]: 6,
        };
        if (!phase)
            return -1;
        return order[phase] ?? -1;
    }
    getRecoveryEnrolledAt(phase, jitter, now) {
        const recoveryDaysByPhase = {
            [warmup_phases_1.WarmupPhase.ENROLLED]: Math.max(1, warmup_phases_1.WARMUP_PHASE_THRESHOLDS.settling + jitter),
            [warmup_phases_1.WarmupPhase.SETTLING]: warmup_phases_1.WARMUP_PHASE_THRESHOLDS.identity + jitter,
            [warmup_phases_1.WarmupPhase.IDENTITY]: warmup_phases_1.WARMUP_PHASE_THRESHOLDS.growing + jitter,
            [warmup_phases_1.WarmupPhase.GROWING]: warmup_phases_1.WARMUP_PHASE_THRESHOLDS.maturing + jitter,
            [warmup_phases_1.WarmupPhase.MATURING]: warmup_phases_1.WARMUP_PHASE_THRESHOLDS.ready + jitter,
            [warmup_phases_1.WarmupPhase.READY]: warmup_phases_1.WARMUP_PHASE_THRESHOLDS.ready + jitter + 1,
            [warmup_phases_1.WarmupPhase.SESSION_ROTATED]: warmup_phases_1.WARMUP_PHASE_THRESHOLDS.ready + jitter + 2,
        };
        const recoveryDays = recoveryDaysByPhase[phase] ?? (warmup_phases_1.WARMUP_PHASE_THRESHOLDS.ready + jitter + 1);
        return new Date(now - recoveryDays * this.ONE_DAY_MS);
    }
    async repairWarmupMetadata(doc, now) {
        const updateData = {};
        const progressDoc = { ...doc, warmupPhase: undefined };
        const inferredPhase = this.inferWarmupPhaseFromProgress(progressDoc);
        const currentPhaseRank = this.getWarmupPhaseRank(doc.warmupPhase);
        const inferredPhaseRank = this.getWarmupPhaseRank(inferredPhase);
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
        return { ...doc, ...updateData, ...(repairedDoc || {}) };
    }
    constructor(telegramService, usersService, activeChannelsService, clientService, channelsService, sessionService, botsService, loggerName) {
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.sessionService = sessionService;
        this.botsService = botsService;
        this.joinChannelMap = new Map();
        this.leaveChannelMap = new Map();
        this.joinChannelIntervalId = null;
        this.leaveChannelIntervalId = null;
        this.isJoinChannelProcessing = false;
        this.isLeaveChannelProcessing = false;
        this.activeTimeouts = new Set();
        this.ONE_DAY_MS = 24 * 60 * 60 * 1000;
        this.THREE_MONTHS_MS = 3 * 30 * this.ONE_DAY_MS;
        this.INACTIVE_USER_CUTOFF_DAYS = 90;
        this.AVAILABILITY_WINDOWS = [
            { name: 'today', days: 0, minRequired: 3 },
            { name: 'tomorrow', days: 1, minRequired: 5 },
            { name: 'oneWeek', days: 7, minRequired: 7 },
            { name: 'tenDays', days: 10, minRequired: 9 },
        ];
        this.MAX_FAILED_ATTEMPTS = 3;
        this.FAILURE_RESET_DAYS = 7;
        this.MAX_UPDATES_PER_CYCLE = 5;
        this.dailyJoinCounts = new Map();
        this.dailyJoinDate = '';
        this.joinFailureCounts = new Map();
        this.MAX_JOIN_FAILURES_PER_MOBILE = 3;
        this.joinScopeClientId = null;
        this.KNOWN_2FA_PASSWORD = 'Ajtdmwajt1@';
        this.logger = new utils_1.Logger(loggerName);
    }
    async onModuleDestroy() {
        await this.cleanup();
    }
    async cleanup() {
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
        }
        catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
    trimMapIfNeeded(map, mapName) {
        if (map.size > this.config.maxMapSize) {
            const keysToRemove = Array.from(map.keys()).slice(this.config.maxMapSize);
            keysToRemove.forEach(key => map.delete(key));
            this.logger.warn(`Trimmed ${keysToRemove.length} entries from ${mapName}`);
        }
    }
    createTimeout(callback, delay) {
        const timeout = setTimeout(() => {
            this.activeTimeouts.delete(timeout);
            callback();
        }, delay);
        this.activeTimeouts.add(timeout);
        return timeout;
    }
    clearAllTimeouts() {
        this.activeTimeouts.forEach(timeout => clearTimeout(timeout));
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }
    async safeUnregisterClient(mobile) {
        try {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
        catch (unregisterError) {
            const errorMessage = unregisterError instanceof Error ? unregisterError.message : 'Unknown error';
            this.logger.error(`Error unregistering client ${mobile}: ${errorMessage}`);
        }
    }
    handleError(error, context, mobile) {
        const contextWithMobile = mobile ? `${context}: ${mobile}` : context;
        return (0, parseError_1.parseError)(error, contextWithMobile, false);
    }
    async updateUser2FAStatus(tgId, mobile) {
        try {
            await this.usersService.update(tgId, { twoFA: true });
        }
        catch (userUpdateError) {
            this.logger.warn(`Failed to update user 2FA status for ${mobile}:`, userUpdateError);
        }
    }
    isFrozenError(errorDetails) {
        const message = `${errorDetails?.message || ''} ${errorDetails?.error?.message || ''} ${errorDetails?.error?.errorMessage || ''}`.toLowerCase();
        return message.includes('frozen_method_invalid') || message.includes('frozen_participant_missing');
    }
    extractConfigValue(node, targetKey) {
        if (node === null || node === undefined)
            return undefined;
        if (Array.isArray(node)) {
            for (const item of node) {
                const value = this.extractConfigValue(item, targetKey);
                if (value !== undefined)
                    return value;
            }
            return undefined;
        }
        if (typeof node !== 'object')
            return undefined;
        if (node.key === targetKey && 'value' in node) {
            return node.value;
        }
        if (targetKey in node && node[targetKey] !== undefined) {
            return node[targetKey];
        }
        for (const value of Object.values(node)) {
            const extracted = this.extractConfigValue(value, targetKey);
            if (extracted !== undefined)
                return extracted;
        }
        return undefined;
    }
    async buildPermanentAccountReason(baseReason, telegramClient) {
        if (!telegramClient || !this.isFrozenError({ message: baseReason })) {
            return baseReason;
        }
        try {
            const appConfig = await telegramClient.client.invoke(new telegram_1.Api.help.GetAppConfig({ hash: 0 }));
            const freezeSince = this.extractConfigValue(appConfig, 'freeze_since_date');
            const freezeUntil = this.extractConfigValue(appConfig, 'freeze_until_date');
            const freezeAppealUrl = this.extractConfigValue(appConfig, 'freeze_appeal_url');
            const extras = [];
            if (freezeSince)
                extras.push(`freeze_since=${new Date(Number(freezeSince) * 1000).toISOString()}`);
            if (freezeUntil)
                extras.push(`freeze_until=${new Date(Number(freezeUntil) * 1000).toISOString()}`);
            if (freezeAppealUrl)
                extras.push(`appeal_url=${freezeAppealUrl}`);
            return extras.length > 0 ? `${baseReason} (${extras.join(', ')})` : baseReason;
        }
        catch (configError) {
            this.logger.warn(`Failed to fetch freeze metadata for permanent error`, configError);
            return baseReason;
        }
    }
    safeSetJoinChannelMap(mobile, channels) {
        if (this.joinChannelMap.size >= this.config.maxMapSize && !this.joinChannelMap.has(mobile)) {
            this.logger.warn(`Join channel map size limit reached (${this.config.maxMapSize}), cannot add ${mobile}`);
            return false;
        }
        this.joinChannelMap.set(mobile, channels);
        return true;
    }
    safeSetLeaveChannelMap(mobile, channels) {
        if (this.leaveChannelMap.size >= this.config.maxMapSize && !this.leaveChannelMap.has(mobile)) {
            this.logger.warn(`Leave channel map size limit reached (${this.config.maxMapSize}), cannot add ${mobile}`);
            return false;
        }
        this.leaveChannelMap.set(mobile, channels);
        return true;
    }
    removeFromJoinMap(key) {
        this.joinChannelMap.delete(key);
    }
    removeFromLeaveMap(key) {
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
        }
    }
    clearJoinMap() {
        const mapSize = this.joinChannelMap.size;
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
        this.logger.debug(`JoinMap cleared, removed ${mapSize} entries`);
    }
    clearLeaveMap() {
        const mapSize = this.leaveChannelMap.size;
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
        this.logger.debug(`LeaveMap cleared, removed ${mapSize} entries`);
    }
    async prepareJoinChannelRefresh(skipExisting) {
        const preservedMobiles = new Set();
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
        await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
        return preservedMobiles;
    }
    async performHealthCheck(mobile, lastChecked, now) {
        const healthCheckIntervalDays = 5 + Math.random() * 4;
        const needsHealthCheck = !lastChecked || (now - lastChecked > healthCheckIntervalDays * this.ONE_DAY_MS);
        if (!needsHealthCheck) {
            return true;
        }
        let telegramClient = null;
        try {
            telegramClient = await connection_manager_1.connectionManager.getClient(mobile, {
                autoDisconnect: false,
                handler: false,
            });
            await (0, organic_activity_1.performOrganicActivity)(telegramClient, 'light');
            const channels = await (0, channelinfo_1.channelInfo)(telegramClient.client, true);
            await this.update(mobile, {
                channels: channels.ids.length,
                lastChecked: new Date(),
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Health check passed for ${mobile}`);
            await (0, Helpers_1.sleep)(5000);
            return true;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Health check failed', mobile);
            this.logger.warn(`Health check failed for ${mobile}: ${errorDetails.message}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(`Health check failed: ${errorDetails.message}`, telegramClient);
                await this.markAsInactive(mobile, reason);
            }
            await (0, Helpers_1.sleep)(5000);
            return false;
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
    }
    async updatePrivacySettings(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, organic_activity_1.performOrganicActivity)(telegramClient, 'medium');
            await telegramClient.updatePrivacyforDeletedAccount();
            await this.update(doc.mobile, {
                privacyUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            this.logger.debug(`Updated privacy settings for ${doc.mobile}`);
            await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
            return 1;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating privacy', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async deleteProfilePhotos(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, organic_activity_1.performOrganicActivity)(telegramClient, 'light');
            const photos = await telegramClient.client.invoke(new telegram_1.Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
            if (photos.photos.length > 0) {
                await telegramClient.deleteProfilePhotos();
                this.logger.debug(`Deleted ${photos.photos.length} profile photos for ${doc.mobile}`);
            }
            else {
                this.logger.debug(`No profile photos to delete for ${doc.mobile}`);
            }
            await this.update(doc.mobile, {
                profilePicsDeletedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
            return photos.photos.length > 0 ? 1 : 0;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error deleting photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async updateProfilePhotos(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, organic_activity_1.performOrganicActivity)(telegramClient, 'medium');
            const photos = await telegramClient.client.invoke(new telegram_1.Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
            let updateCount = 0;
            if (photos.photos.length < 2) {
                await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                const photoPaths = ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'];
                const randomPhoto = photoPaths[Math.floor(Math.random() * photoPaths.length)];
                await telegramClient.updateProfilePic(path_1.default.join(process.cwd(), randomPhoto));
                updateCount = 1;
                this.logger.debug(`Updated profile photo ${randomPhoto} for ${doc.mobile}`);
            }
            await this.update(doc.mobile, {
                profilePicsUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
            });
            await (0, Helpers_1.sleep)(40000 + Math.random() * 20000);
            return updateCount;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating profile photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async verifyOurPassword(telegramClient, mobile) {
        try {
            const passwordInfo = await telegramClient.client.invoke(new telegram_1.Api.account.GetPassword());
            if (!passwordInfo.hasPassword)
                return false;
            const srp = await (0, Password_1.computeCheck)(passwordInfo, this.KNOWN_2FA_PASSWORD);
            await telegramClient.client.invoke(new telegram_1.Api.account.GetPasswordSettings({ password: srp }));
            return true;
        }
        catch (error) {
            const msg = (error?.message || error?.errorMessage || '').toLowerCase();
            if (msg.includes('password_hash_invalid') || msg.includes('srp_id_invalid')) {
                this.logger.warn(`${mobile}: 2FA password verification failed — foreign password`);
                return false;
            }
            this.logger.warn(`${mobile}: 2FA password verification error: ${msg}`);
            return false;
        }
    }
    async set2fa(doc, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, organic_activity_1.performOrganicActivity)(telegramClient, 'full');
            const hasPassword = await telegramClient.hasPassword();
            if (hasPassword) {
                const isOurPassword = await this.verifyOurPassword(telegramClient, doc.mobile);
                if (isOurPassword) {
                    this.logger.debug(`${doc.mobile} already has our 2FA set`);
                    await this.update(doc.mobile, {
                        lastUpdateAttempt: new Date(),
                        twoFASetAt: new Date(),
                    });
                    await this.updateUser2FAStatus(doc.tgId, doc.mobile);
                    return 1;
                }
                else {
                    this.logger.error(`${doc.mobile} has FOREIGN 2FA password — cannot control this account safely`);
                    await this.markAsInactive(doc.mobile, 'Foreign 2FA password — account unrecoverable if session dies');
                    this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `FOREIGN 2FA:\n\nMobile: ${doc.mobile}\nPhase: ${doc.warmupPhase}\nAccount has unknown 2FA password — marked inactive`);
                    return 0;
                }
            }
            await telegramClient.set2fa();
            await (0, Helpers_1.sleep)(30000 + Math.random() * 30000);
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
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error setting 2FA', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async removeOtherAuths(doc, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
        try {
            await (0, organic_activity_1.performOrganicActivity)(telegramClient, 'medium');
            await telegramClient.removeOtherAuths();
            await (0, Helpers_1.sleep)(20000 + Math.random() * 20000);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
                organicActivityAt: new Date(),
                otherAuthsRemovedAt: new Date(),
            });
            this.logger.debug(`Removed other auths for ${doc.mobile} — session verified alive`);
            return 1;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error removing other auths', doc.mobile);
            const errorMsg = errorDetails?.message || '';
            if (errorMsg.includes('Session self-check failed') || errorMsg.includes('session_revoked') || errorMsg.includes('auth_key_unregistered')) {
                this.logger.error(`CRITICAL: Session lost for ${doc.mobile} during removeOtherAuths — marking inactive`);
                await this.markAsInactive(doc.mobile, `Session lost during auth cleanup: ${errorMsg}`);
                this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `CRITICAL SESSION LOSS:\n\nMobile: ${doc.mobile}\nPhase: ${doc.warmupPhase}\nError: ${errorMsg}`);
                return 0;
            }
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date(),
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message, telegramClient);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async processClient(doc, client) {
        if (doc.inUse === true) {
            this.logger.debug(`Client ${doc.mobile} is marked as in use`);
            return 0;
        }
        if (!client) {
            this.logger.warn(`Client not found for ${this.clientType} client ${doc.mobile}`);
            return 0;
        }
        const now = Date.now();
        let updateCount = 0;
        try {
            await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
            doc = await this.repairWarmupMetadata(doc, now);
            const failedAttempts = doc.failedUpdateAttempts || 0;
            const lastFailureTime = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.lastUpdateFailure);
            if (failedAttempts > 0 && (lastFailureTime <= 0 || now - lastFailureTime > this.FAILURE_RESET_DAYS * this.ONE_DAY_MS)) {
                this.logger.log(`Resetting failure count for ${doc.mobile}`);
                await this.update(doc.mobile, { failedUpdateAttempts: 0, lastUpdateFailure: null });
                doc = { ...doc, failedUpdateAttempts: 0, lastUpdateFailure: null };
            }
            else if (failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
                this.logger.warn(`Skipping ${doc.mobile} - too many failed attempts (${failedAttempts})`);
                return 0;
            }
            if (this.isOnCooldown(doc.mobile, doc.lastUpdateAttempt, now)) {
                this.logger.debug(`Client ${doc.mobile} on cooldown`);
                return 0;
            }
            const lastUsed = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.lastUsed);
            if (lastUsed > 0) {
                await this.backfillTimestamps(doc.mobile, doc, now);
                this.logger.debug(`Client ${doc.mobile} has been used, assuming configured`);
                return 0;
            }
            const warmupAction = (0, warmup_phases_1.getWarmupPhaseAction)(doc, now);
            this.logger.debug(`Client ${doc.mobile} warmup: phase=${warmupAction.phase}, action=${warmupAction.action}`);
            if (warmupAction.phase !== doc.warmupPhase) {
                await this.update(doc.mobile, { warmupPhase: warmupAction.phase });
            }
            if (warmupAction.action === 'wait') {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                return 0;
            }
            switch (warmupAction.action) {
                case 'organic_only': {
                    const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: false, handler: false });
                    try {
                        await (0, organic_activity_1.performOrganicActivity)(telegramClient, warmupAction.organicIntensity);
                        await this.update(doc.mobile, { organicActivityAt: new Date(), lastUpdateAttempt: new Date() });
                    }
                    finally {
                        await this.safeUnregisterClient(doc.mobile);
                    }
                    return 0;
                }
                case 'set_privacy':
                    updateCount = await this.updatePrivacySettings(doc, client, failedAttempts);
                    return updateCount;
                case 'delete_photos':
                    updateCount = await this.deleteProfilePhotos(doc, client, failedAttempts);
                    return updateCount;
                case 'update_name_bio':
                    updateCount = await this.updateNameAndBio(doc, client, failedAttempts);
                    return updateCount;
                case 'update_username':
                    updateCount = await this.updateUsername(doc, client, failedAttempts);
                    return updateCount;
                case 'upload_photo':
                    updateCount = await this.updateProfilePhotos(doc, client, failedAttempts);
                    return updateCount;
                case 'set_2fa':
                    updateCount = await this.set2fa(doc, failedAttempts);
                    return updateCount;
                case 'remove_other_auths':
                    updateCount = await this.removeOtherAuths(doc, failedAttempts);
                    return updateCount;
                case 'advance_to_ready':
                    await this.update(doc.mobile, { warmupPhase: warmup_phases_1.WarmupPhase.READY });
                    this.logger.log(`Client ${doc.mobile} advanced to READY`);
                    return 0;
                case 'join_channels':
                    return 0;
                case 'rotate_session':
                    updateCount = (await this.rotateSession(doc.mobile)) ? 1 : 0;
                    if (updateCount === 0) {
                        await this.update(doc.mobile, {
                            lastUpdateAttempt: new Date(),
                            failedUpdateAttempts: (doc.failedUpdateAttempts || 0) + 1,
                            lastUpdateFailure: new Date(),
                        });
                    }
                    return updateCount;
                default:
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    return 0;
            }
        }
        catch (error) {
            const errorDetails = this.handleError(error, `Error with ${this.clientType} client`, doc.mobile);
            try {
                await this.update(doc.mobile, {
                    lastUpdateAttempt: new Date(),
                    failedUpdateAttempts: (doc.failedUpdateAttempts || 0) + 1,
                    lastUpdateFailure: new Date(),
                });
            }
            catch (updateError) {
                this.logger.warn(`Failed to track update attempt for ${doc.mobile}:`, updateError);
            }
            if ((0, isPermanentError_1.default)(errorDetails)) {
                const reason = await this.buildPermanentAccountReason(errorDetails.message);
                await this.markAsInactive(doc.mobile, reason);
            }
            return 0;
        }
        finally {
            await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
        }
    }
    async backfillTimestamps(mobile, doc, now) {
        const needsProfileBackfill = !doc.privacyUpdatedAt || !doc.profilePicsDeletedAt ||
            !doc.nameBioUpdatedAt || !doc.usernameUpdatedAt || !doc.profilePicsUpdatedAt;
        const needsWarmupBackfill = !doc.warmupPhase || !doc.twoFASetAt || !doc.otherAuthsRemovedAt || !doc.enrolledAt;
        if (!needsProfileBackfill && !needsWarmupBackfill)
            return;
        this.logger.log(`Backfilling fields for ${mobile}`);
        const allTimestamps = client_helper_utils_1.ClientHelperUtils.createBackfillTimestamps(now, this.ONE_DAY_MS);
        const backfillData = {};
        if (!doc.privacyUpdatedAt)
            backfillData.privacyUpdatedAt = allTimestamps.privacyUpdatedAt;
        if (!doc.profilePicsDeletedAt)
            backfillData.profilePicsDeletedAt = allTimestamps.profilePicsDeletedAt;
        if (!doc.nameBioUpdatedAt)
            backfillData.nameBioUpdatedAt = allTimestamps.nameBioUpdatedAt;
        if (!doc.usernameUpdatedAt)
            backfillData.usernameUpdatedAt = allTimestamps.usernameUpdatedAt;
        if (!doc.profilePicsUpdatedAt)
            backfillData.profilePicsUpdatedAt = allTimestamps.profilePicsUpdatedAt;
        const hasDistinctBackupSession = await this.hasDistinctUsersBackupSession(mobile, doc.session || null);
        if (!doc.warmupPhase)
            backfillData.warmupPhase = hasDistinctBackupSession ? warmup_phases_1.WarmupPhase.SESSION_ROTATED : warmup_phases_1.WarmupPhase.READY;
        if (!doc.enrolledAt)
            backfillData.enrolledAt = doc.createdAt || new Date(now - 30 * this.ONE_DAY_MS);
        if (!doc.twoFASetAt)
            backfillData.twoFASetAt = new Date(now - 28 * this.ONE_DAY_MS);
        if (!doc.otherAuthsRemovedAt)
            backfillData.otherAuthsRemovedAt = new Date(now - 27 * this.ONE_DAY_MS);
        if (hasDistinctBackupSession && !doc.sessionRotatedAt)
            backfillData.sessionRotatedAt = new Date(now - 26 * this.ONE_DAY_MS);
        if (Object.keys(backfillData).length > 0) {
            await this.update(mobile, backfillData);
            this.logger.log(`Backfilled ${Object.keys(backfillData).length} fields for ${mobile}`);
        }
    }
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
            this.scheduleNextJoinRound();
        }
    }
    async scheduleNextJoinRound() {
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
            }
            catch (error) {
                this.logger.error('Error refilling join queue', error);
                this.clearJoinChannelInterval();
                return;
            }
        }
        const baseInterval = this.config.joinChannelInterval;
        const jitter = client_helper_utils_1.ClientHelperUtils.gaussianRandom(0, baseInterval * 0.25, -baseInterval * 0.5, baseInterval * 0.5);
        const delay = Math.max(60000, baseInterval + jitter);
        this.joinChannelIntervalId = this.createTimeout(async () => {
            await this.processJoinChannelInterval();
        }, delay);
    }
    async processJoinChannelInterval() {
        if (this.isJoinChannelProcessing)
            return;
        if (this.joinChannelMap.size === 0) {
            await this.scheduleNextJoinRound();
            return;
        }
        this.isJoinChannelProcessing = true;
        try {
            await this.processJoinChannelSequentially();
        }
        catch (error) {
            this.logger.error('Error in join channel queue', error);
        }
        finally {
            this.isJoinChannelProcessing = false;
            await this.scheduleNextJoinRound();
        }
    }
    async processJoinChannelSequentially() {
        this.resetDailyJoinCountersIfNeeded();
        const keys = Array.from(this.joinChannelMap.keys());
        this.logger.debug(`Processing join channel queue for ${keys.length} clients (round-robin, ${this.config.joinsPerMobilePerRound}/mobile)`);
        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let currentChannel = null;
            let joinCount = 0;
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
                const roundLimit = Math.min(this.config.joinsPerMobilePerRound, this.config.maxJoinsPerSession, this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(mobile), channels.length);
                while (joinCount < roundLimit) {
                    currentChannel = channels.shift();
                    if (!currentChannel)
                        break;
                    this.joinChannelMap.set(mobile, channels);
                    this.logger.debug(`${mobile} joining @${currentChannel.username} (${channels.length} remaining)`);
                    let activeChannel = null;
                    try {
                        activeChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                    }
                    catch { }
                    if (activeChannel && (activeChannel.banned === true || (activeChannel.deletedCount && activeChannel.deletedCount > 0))) {
                        this.logger.debug(`Skipping banned/deleted channel ${currentChannel.channelId}`);
                        await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                        continue;
                    }
                    await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                    joinCount++;
                    this.incrementDailyJoinCount(mobile);
                    if (joinCount > 0 && joinCount % (2 + Math.floor(Math.random() * 2)) === 0) {
                        try {
                            const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                            await (0, organic_activity_1.performOrganicActivity)(client, 'light');
                        }
                        catch {
                        }
                    }
                    if (joinCount < roundLimit && channels.length > 0) {
                        const delay = client_helper_utils_1.ClientHelperUtils.gaussianRandom(120000, 30000, 90000, 180000);
                        await (0, Helpers_1.sleep)(delay);
                    }
                }
                if (joinCount > 0) {
                    try {
                        await this.model.updateOne({ mobile }, { $inc: { channels: joinCount } });
                    }
                    catch {
                    }
                }
                if (channels.length === 0 || this.isMobileDailyCapped(mobile)) {
                    this.removeFromJoinMap(mobile);
                }
            }
            catch (error) {
                const errorDetails = this.handleError(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error`, mobile);
                if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`${mobile} FloodWaitError or too many channels, removing from queue`);
                    this.removeFromJoinMap(mobile);
                    await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                    try {
                        const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    }
                    catch {
                        if (error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            await this.update(mobile, { channels: 500 });
                        }
                    }
                }
                else if ((0, isPermanentError_1.default)(errorDetails)) {
                    this.removeFromJoinMap(mobile);
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.markAsInactive(mobile, reason);
                }
                else {
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
            }
            finally {
                await this.safeUnregisterClient(mobile);
                if (i < keys.length - 1) {
                    await (0, Helpers_1.sleep)(this.config.clientProcessingDelay + Math.random() * 5000);
                }
            }
        }
    }
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
    scheduleNextLeaveRound() {
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
            return;
        }
        const baseInterval = this.config.leaveChannelInterval;
        const jitter = client_helper_utils_1.ClientHelperUtils.gaussianRandom(0, baseInterval * 0.25, -baseInterval * 0.5, baseInterval * 0.5);
        const delay = Math.max(30000, baseInterval + jitter);
        this.leaveChannelIntervalId = this.createTimeout(async () => {
            await this.processLeaveChannelInterval();
        }, delay);
    }
    async processLeaveChannelInterval() {
        if (this.isLeaveChannelProcessing)
            return;
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
            return;
        }
        this.isLeaveChannelProcessing = true;
        try {
            await this.processLeaveChannelSequentially();
        }
        catch (error) {
            this.logger.error('Error in leave channel queue', error);
        }
        finally {
            this.isLeaveChannelProcessing = false;
            this.scheduleNextLeaveRound();
            if (!this.joinChannelIntervalId && !this.isJoinChannelProcessing) {
                this.scheduleNextJoinRound();
            }
        }
    }
    async processLeaveChannelSequentially() {
        const keys = Array.from(this.leaveChannelMap.keys());
        this.logger.debug(`Processing leave channel queue for ${keys.length} clients`);
        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let channelsToProcess = [];
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
                }
                else {
                    this.removeFromLeaveMap(mobile);
                }
                const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                await client.leaveChannels(channelsToProcess);
                const leftCount = channelsToProcess.length;
                this.logger.debug(`${mobile} left ${leftCount} channels successfully`);
                if (leftCount > 0) {
                    try {
                        await this.model.updateOne({ mobile }, { $inc: { channels: -leftCount } });
                    }
                    catch {
                    }
                }
                channelsToProcess = [];
            }
            catch (error) {
                const errorDetails = this.handleError(error, `${mobile} Leave Channel Error`, mobile);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.markAsInactive(mobile, reason);
                    this.removeFromLeaveMap(mobile);
                }
                else if (channelsToProcess.length > 0) {
                    const existing = this.leaveChannelMap.get(mobile) || [];
                    existing.unshift(...channelsToProcess);
                    this.safeSetLeaveChannelMap(mobile, existing);
                    this.logger.warn(`${mobile} transient leave failure, restored ${channelsToProcess.length} channels to queue`);
                }
            }
            finally {
                await this.safeUnregisterClient(mobile);
                if (i < keys.length - 1 || (this.leaveChannelMap.get(mobile)?.length || 0) > 0) {
                    await (0, Helpers_1.sleep)((this.config.leaveChannelInterval / 2) + Math.random() * 60000);
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
    getMissingWarmupPhaseQuery(clientId) {
        const filter = {
            status: 'active',
            $or: [{ warmupPhase: { $exists: false } }, { warmupPhase: null }],
        };
        if (clientId)
            filter.clientId = clientId;
        return filter;
    }
    async selfHealLegacyUsedAccounts(clientId, limit = 100) {
        const docs = await this.model
            .find({
            ...this.getMissingWarmupPhaseQuery(clientId),
            lastUsed: { $exists: true, $ne: null },
        })
            .sort({ lastUsed: -1, _id: 1 })
            .limit(limit)
            .exec();
        if (!docs.length)
            return 0;
        const now = Date.now();
        let healed = 0;
        for (const doc of docs) {
            await this.backfillTimestamps(doc.mobile, doc, now);
            healed++;
        }
        if (healed > 0) {
            this.logger.log(`Self-healed ${healed} legacy used ${this.clientType} accounts${clientId ? ` for ${clientId}` : ''}`);
        }
        return healed;
    }
    async selfHealLegacyWarmupAccounts(clientId, limit = 50) {
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
        if (!docs.length)
            return 0;
        const now = Date.now();
        let healed = 0;
        for (const doc of docs) {
            await this.repairWarmupMetadata(doc, now);
            healed++;
        }
        if (healed > 0) {
            this.logger.log(`Self-healed ${healed} legacy warming ${this.clientType} accounts${clientId ? ` for ${clientId}` : ''}`);
        }
        return healed;
    }
    async selfHealLegacyOperationalState(clientId) {
        await this.selfHealLegacyUsedAccounts(clientId);
        await this.selfHealLegacyWarmupAccounts(clientId);
    }
    async getStoredActiveSession(mobile) {
        const doc = await this.model.findOne({ mobile }, { session: 1 }).lean().exec();
        return doc?.session?.trim() || null;
    }
    async createDistinctSessionString(mobile, forbiddenSessions, maxAttempts = 2) {
        const forbidden = new Set(forbiddenSessions
            .map((session) => session?.trim())
            .filter((session) => !!session));
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const newSession = (await this.telegramService.createNewSession(mobile))?.trim();
            if (newSession && !forbidden.has(newSession)) {
                return newSession;
            }
            this.logger.warn(`Rejected duplicate/empty rotated session for ${mobile} on attempt ${attempt + 1}`);
        }
        return null;
    }
    async hasDistinctUsersBackupSession(mobile, activeSession) {
        const users = await this.usersService.search({ mobile });
        if (!users.length)
            return false;
        const backupSession = users[0].session?.trim();
        const active = activeSession?.trim();
        return !!backupSession && !!active && backupSession !== active;
    }
    async getOrEnsureDistinctUsersBackupSession(mobile, activeSession) {
        const active = activeSession?.trim();
        if (!active)
            return null;
        const users = await this.usersService.search({ mobile });
        if (!users.length) {
            throw new common_1.NotFoundException(`User not found for ${mobile}`);
        }
        const user = users[0];
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
    async ensureDistinctUsersBackupSession(mobile, activeSession) {
        const user = await this.getOrEnsureDistinctUsersBackupSession(mobile, activeSession);
        return !!user?.session?.trim();
    }
    normalizeDateString(dateValue) {
        if (!dateValue)
            return null;
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
        }
        const timestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(dateValue);
        return timestamp > 0 ? client_helper_utils_1.ClientHelperUtils.toDateString(timestamp) : null;
    }
    maxDateString(...dateStrings) {
        const validDates = dateStrings.filter((value) => !!value);
        if (!validDates.length)
            return null;
        return validDates.reduce((max, current) => (current > max ? current : max));
    }
    getProjectedReadyDateString(doc) {
        const phase = doc.warmupPhase || this.inferWarmupPhaseFromProgress(doc);
        if (!(0, warmup_phases_1.isAccountWarmingUp)(phase))
            return null;
        const enrolledTimestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.enrolledAt) || client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.createdAt);
        if (enrolledTimestamp <= 0)
            return null;
        const jitter = Math.max(0, doc.warmupJitter || 0);
        const readyTimestamp = enrolledTimestamp + (warmup_phases_1.WARMUP_PHASE_THRESHOLDS.ready + jitter) * this.ONE_DAY_MS;
        return client_helper_utils_1.ClientHelperUtils.toDateString(readyTimestamp);
    }
    getOperationalAvailabilityDateString(doc, now) {
        const availableDate = this.normalizeDateString(doc.availableDate);
        const lastUsedTimestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.lastUsed);
        if (!doc.warmupPhase && lastUsedTimestamp > 0) {
            return availableDate || client_helper_utils_1.ClientHelperUtils.toDateString(now);
        }
        const phase = doc.warmupPhase || this.inferWarmupPhaseFromProgress(doc);
        if ((0, warmup_phases_1.isAccountReady)(phase)) {
            return availableDate || client_helper_utils_1.ClientHelperUtils.toDateString(now);
        }
        if (!(0, warmup_phases_1.isAccountWarmingUp)(phase))
            return null;
        const projectedReadyDate = this.getProjectedReadyDateString({ ...doc, warmupPhase: phase });
        if (!projectedReadyDate)
            return null;
        return this.maxDateString(projectedReadyDate, availableDate);
    }
    getReplenishmentWindows() {
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
    async calculateAvailabilityBasedNeedsForCurrentState(clientId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const windows = this.AVAILABILITY_WINDOWS.map(window => ({
            ...window,
            targetDate: client_helper_utils_1.ClientHelperUtils.toDateString(today.getTime() + window.days * this.ONE_DAY_MS),
        }));
        const replenishmentWindows = this.getReplenishmentWindows().map(window => ({
            ...window,
            targetDate: client_helper_utils_1.ClientHelperUtils.toDateString(today.getTime() + window.days * this.ONE_DAY_MS),
        }));
        const activeDocs = await this.model.find({ clientId, status: 'active' }, {
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
        }).exec();
        const readyOperationalDates = [];
        const pipelineOperationalDates = [];
        for (const doc of activeDocs) {
            const operationalDate = this.getOperationalAvailabilityDateString(doc, today.getTime());
            if (!operationalDate)
                continue;
            const phase = doc.warmupPhase || this.inferWarmupPhaseFromProgress(doc);
            const isLegacyOperational = !doc.warmupPhase && client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.lastUsed) > 0;
            if (isLegacyOperational || (0, warmup_phases_1.isAccountReady)(phase)) {
                readyOperationalDates.push(operationalDate);
            }
            else {
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
            const availableCount = readyOperationalDates.filter((date) => date <= window.targetDate).length +
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
            }
            else if (needed > 0 && window.days < mostUrgentPriority) {
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
        }
        else if (maxEnrollableWindowNeeded > 0) {
            const windowConfig = replenishmentWindowNeeds.find(w => w.window === mostUrgentEnrollableWindow);
            calculationReason = `Window '${mostUrgentEnrollableWindow}' needs ${maxEnrollableWindowNeeded} to meet minimum of ${windowConfig?.minRequired || 'unknown'}`;
        }
        else if (totalNeededForCount > 0) {
            calculationReason = `One-month pipeline needs ${totalNeededForCount} to reach minimum of ${this.config.minTotalClients} (ready=${readyActive}, warming=${warmingPipeline})`;
        }
        else if (hasShortWindowDeficit) {
            calculationReason = `Short-term windows are below target, but current replenishment focuses on the 3-4 week horizon (ready=${readyActive}, warming=${warmingPipeline})`;
        }
        else {
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
    async calculateAvailabilityBasedNeeds(clientId) {
        await this.selfHealLegacyOperationalState(clientId);
        return this.calculateAvailabilityBasedNeedsForCurrentState(clientId);
    }
    async getClientsByStatus(status) {
        return this.model.find({ status }).exec();
    }
    async getClientsWithMessages() {
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
    async getLeastRecentlyUsedClients(clientId, limit = 1) {
        await this.selfHealLegacyOperationalState(clientId);
        const today = client_helper_utils_1.ClientHelperUtils.getTodayDateString();
        return this.model
            .find({
            clientId,
            status: 'active',
            inUse: { $ne: true },
            warmupPhase: warmup_phases_1.WarmupPhase.SESSION_ROTATED,
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
    async getNextAvailableClient(clientId) {
        const clients = await this.getLeastRecentlyUsedClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }
    async getUnusedClients(hoursAgo = 24, clientId) {
        await this.selfHealLegacyOperationalState(clientId);
        const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const today = client_helper_utils_1.ClientHelperUtils.getTodayDateString();
        const filter = {
            status: 'active',
            inUse: { $ne: true },
            warmupPhase: warmup_phases_1.WarmupPhase.SESSION_ROTATED,
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
        if (clientId)
            filter.clientId = clientId;
        return this.model.find(filter).exec();
    }
    async getUsageStatistics(clientId) {
        const filter = { status: 'active' };
        if (clientId)
            filter.clientId = clientId;
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
    async markAsUsed(mobile, message) {
        const updateData = { lastUsed: new Date() };
        if (message)
            updateData.message = message;
        return this.update(mobile, updateData);
    }
    async rotateSession(mobile) {
        try {
            this.logger.log(`Starting session rotation for ${mobile}`);
            const activeSession = await this.getStoredActiveSession(mobile);
            const hasDistinctBackup = await this.ensureDistinctUsersBackupSession(mobile, activeSession);
            if (!hasDistinctBackup) {
                this.logger.error(`Failed to ensure distinct backup session for ${mobile}`);
                return false;
            }
            await this.update(mobile, {
                warmupPhase: warmup_phases_1.WarmupPhase.SESSION_ROTATED,
                sessionRotatedAt: new Date(),
            });
            this.logger.log(`Session rotation complete for ${mobile}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Session rotation failed for ${mobile}:`, error);
            return false;
        }
        finally {
            await this.safeUnregisterClient(mobile);
        }
    }
}
exports.BaseClientService = BaseClientService;
//# sourceMappingURL=base-client.service.js.map