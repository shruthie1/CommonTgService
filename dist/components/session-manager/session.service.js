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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = exports.SessionManager = void 0;
const common_1 = require("@nestjs/common");
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const utils_1 = require("../../utils");
const telegram_logger_1 = require("../Telegram/utils/telegram-logger");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const client_registry_1 = require("./client-registry");
const session_audit_service_1 = require("./session-audit.service");
const sessions_schema_1 = require("./schemas/sessions.schema");
class SessionManager {
    constructor() {
        this.logger = new telegram_logger_1.TelegramLogger('SessionManager');
        this.clientRegistry = client_registry_1.ClientRegistry.getInstance();
        this.DEFAULT_PASSWORD = "Ajtdmwajt1@";
        this.DEFAULT_MAX_RETRIES = 3;
        this.DEFAULT_RETRY_DELAY = 5000;
        this.OTP_WAIT_TIME = 120000;
        this.OTP_CHECK_INTERVAL = 3000;
    }
    getApiId() {
        const apiId = parseInt(process.env.API_ID);
        if (isNaN(apiId)) {
            throw new Error('Invalid API_ID: must be a number');
        }
        return apiId;
    }
    getApiHash() {
        const apiHash = process.env.API_HASH;
        if (!apiHash) {
            throw new Error('API_HASH environment variable is required');
        }
        return apiHash;
    }
    static getInstance() {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager();
        }
        return SessionManager.instance;
    }
    async createSession(options) {
        const { mobile, oldSession, password = this.DEFAULT_PASSWORD } = options;
        if (!mobile) {
            return { success: false, error: 'Mobile number is required', retryable: false };
        }
        this.logger.info(mobile, 'Starting session creation process with priority order');
        const existingCheck = this.checkExistingSession(mobile);
        if (!existingCheck.canProceed) {
            return existingCheck.result;
        }
        const strategies = this.getCreationStrategies(options);
        this.logger.info(mobile, `Available strategies: ${strategies.map(s => s.strategyName).join(', ')}`);
        for (const strategy of strategies) {
            try {
                this.logger.info(mobile, `Attempting strategy: ${strategy.strategyName}`);
                const result = await strategy();
                if (result.success) {
                    this.logger.info(mobile, `✓ Session creation successful with ${strategy.strategyName}`);
                    return result;
                }
                this.logger.info(mobile, `✗ Strategy ${strategy.strategyName} failed: ${result.error}`);
            }
            catch (error) {
                this.logger.error(mobile, `✗ Strategy ${strategy.strategyName} threw error`, error);
            }
        }
        return { success: false, error: 'All SessionManager strategies failed', retryable: false };
    }
    checkExistingSession(mobile) {
        if (!mobile || typeof mobile !== 'string') {
            return {
                canProceed: false,
                result: { success: false, error: 'Invalid mobile number provided', retryable: false }
            };
        }
        if (this.clientRegistry.hasClient(mobile)) {
            const clientInfo = this.clientRegistry.getClientInfo(mobile);
            if (clientInfo?.isCreating) {
                return {
                    canProceed: false,
                    result: { success: false, error: 'Session creation already in progress', retryable: true }
                };
            }
            return {
                canProceed: false,
                result: { success: false, error: 'Active session exists. Use cleanup first.', retryable: false }
            };
        }
        return { canProceed: true };
    }
    getCreationStrategies(options) {
        const strategies = [];
        if (options.oldSession) {
            const strategyFunction = () => this.createFromOldSession(options);
            strategyFunction.strategyName = 'oldSession';
            strategies.push(strategyFunction);
        }
        if (options.mobile) {
            const strategyFunction = () => this.createFromExistingManager(options.mobile);
            strategyFunction.strategyName = 'existingManager';
            strategies.push(strategyFunction);
        }
        return strategies;
    }
    async createFromOldSession(options) {
        const { oldSession, mobile, password, maxRetries = this.DEFAULT_MAX_RETRIES, retryDelay = this.DEFAULT_RETRY_DELAY } = options;
        const validation = await this.validateSession(oldSession, mobile);
        if (!validation.isValid) {
            return { success: false, error: `Session validation failed: ${validation.error}`, retryable: false };
        }
        const lockId = await this.clientRegistry.waitForLock(mobile);
        try {
            this.clientRegistry.markClientCreating(mobile, lockId);
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const newSession = await this.performSessionCreation(oldSession, mobile, password, attempt);
                    return { success: true, session: newSession };
                }
                catch (error) {
                    const errorMessage = error.message || error.toString();
                    const isRetryable = this.isRetryableError(errorMessage);
                    if (!isRetryable || attempt === maxRetries) {
                        return { success: false, error: errorMessage, retryable: isRetryable };
                    }
                    if (attempt < maxRetries) {
                        await (0, utils_1.sleep)(retryDelay);
                    }
                }
            }
            return { success: false, error: 'Max retries exceeded', retryable: false };
        }
        finally {
            if (lockId) {
                await this.clientRegistry.removeClient(mobile, lockId);
                this.clientRegistry.releaseLock(mobile, lockId);
            }
        }
    }
    async createFromExistingManager(mobile) {
        try {
            const client = await connection_manager_1.connectionManager.getClient(mobile);
            const newSession = await client.createNewSession();
            return { success: true, session: newSession };
        }
        catch (error) {
            return {
                success: false,
                error: error.message || 'Existing manager method failed',
                retryable: this.isRetryableError(error.message)
            };
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
    }
    async validateSession(sessionString, mobile) {
        let tempClient = null;
        try {
            tempClient = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionString), this.getApiId(), this.getApiHash(), { connectionRetries: 1 });
            await tempClient.connect();
            const userInfo = await tempClient.getMe();
            if (!userInfo || userInfo.phone !== mobile) {
                return { isValid: false, error: 'Phone number mismatch or invalid user info' };
            }
            this.logger.info(mobile, 'Session validation successful');
            await this.cleanupClient(tempClient, mobile);
            return { isValid: true, userInfo };
        }
        catch (error) {
            this.logger.error(mobile, 'Session validation failed', error);
            await this.cleanupClient(tempClient, mobile);
            return { isValid: false, error: error.message || error.toString() || error.errorMessage };
        }
        finally {
        }
    }
    async performSessionCreation(oldSessionString, mobile, password, attempt) {
        let oldClient = null;
        let newClient = null;
        try {
            oldClient = new telegram_1.TelegramClient(new sessions_1.StringSession(oldSessionString), this.getApiId(), this.getApiHash(), { connectionRetries: 1 });
            await oldClient.connect();
            await oldClient.getMe();
            newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), this.getApiId(), this.getApiHash(), { connectionRetries: 1 });
            await newClient.start({
                phoneNumber: mobile,
                password: async () => password,
                phoneCode: async () => this.waitForOtp(oldClient, mobile, attempt),
                onError: (err) => {
                    throw new Error(`Session start error: ${err.message || err}`);
                }
            });
            return newClient.session.save();
        }
        finally {
            await Promise.all([
                this.cleanupClient(newClient, mobile),
                this.cleanupClient(oldClient, mobile)
            ]);
        }
    }
    async waitForOtp(oldClient, mobile, attempt) {
        const startTime = Date.now();
        this.logger.info(mobile, `Waiting for OTP (attempt ${attempt})`);
        while (Date.now() - startTime < this.OTP_WAIT_TIME) {
            try {
                const messages = await oldClient.getMessages('777000', { limit: 1 });
                const message = messages[0];
                if (message && message.date && (message.date * 1000) > (Date.now() - 120000)) {
                    const messageText = message.text || message.message || '';
                    if (messageText) {
                        const code = this.extractOtpCode(messageText.toLowerCase());
                        if (code) {
                            this.logger.info(mobile, `OTP extracted: ${code}`);
                            return code;
                        }
                    }
                }
                await (0, utils_1.sleep)(this.OTP_CHECK_INTERVAL);
            }
            catch (error) {
                this.logger.error(mobile, 'Error checking OTP messages', error);
                await (0, utils_1.sleep)(this.OTP_CHECK_INTERVAL);
            }
        }
        throw new Error(`OTP timeout after ${this.OTP_WAIT_TIME}ms`);
    }
    extractOtpCode(messageText) {
        const patterns = [
            /code:\*\*(\d{5,6})/,
            /login code:\s*(\d{5,6})/,
            /your code is\s*(\d{5,6})/,
            /verification code:\s*(\d{5,6})/,
            /\b(\d{5,6})\b/
        ];
        for (const pattern of patterns) {
            const match = messageText.match(pattern);
            if (match)
                return match[1];
        }
        return null;
    }
    async cleanupClient(client, mobile) {
        if (!client)
            return;
        try {
            if (client._destroyed) {
                this.logger.info(mobile, 'Client already destroyed, skipping cleanup');
                return;
            }
            await client.destroy();
            if (client._eventBuilders) {
                client._eventBuilders = [];
            }
            connection_manager_1.connectionManager.unregisterClient(mobile);
            await (0, utils_1.sleep)(1000);
        }
        catch (error) {
            this.logger.error(mobile, 'Client cleanup error', error);
        }
        finally {
            if (client) {
                try {
                    client._destroyed = true;
                    if (client._sender && typeof client._sender.disconnect === 'function') {
                        await client._sender.disconnect().catch(() => { });
                    }
                }
                catch (finalCleanupError) {
                    this.logger.error(mobile, 'Final cleanup error', finalCleanupError);
                }
                this.logger.info(mobile, 'Client cleanup completed');
            }
        }
    }
    isRetryableError(errorMessage) {
        const nonRetryableErrors = [
            'user_deactivated_ban', 'auth_key_unregistered', 'session_revoked',
            'phone_number_banned', 'user_deactivated', 'phone_number_invalid',
            'session_password_needed'
        ];
        const retryableErrors = [
            'timeout', 'network_error', 'connection_error', 'flood_wait', 'internal_server_error'
        ];
        const lowerErrorMessage = errorMessage.toLowerCase();
        if (nonRetryableErrors.some(error => lowerErrorMessage.includes(error))) {
            return false;
        }
        if (retryableErrors.some(error => lowerErrorMessage.includes(error))) {
            return true;
        }
        return true;
    }
    getSessionStatus(mobile) {
        const clientInfo = this.clientRegistry.getClientInfo(mobile);
        if (!clientInfo) {
            return { status: 'inactive', activeClients: 0 };
        }
        return {
            status: clientInfo.isCreating ? 'creating' : 'active',
            activeClients: 1,
            lastActivity: clientInfo.lastActivity
        };
    }
    async cleanupSessions(mobile, force = false) {
        try {
            const clientInfo = this.clientRegistry.getClientInfo(mobile);
            if (!clientInfo) {
                return { success: true, cleanedCount: 0 };
            }
            if (clientInfo.isCreating && !force) {
                return {
                    success: false,
                    cleanedCount: 0,
                    error: 'Session creation in progress. Use force=true to cleanup anyway.'
                };
            }
            const cleanedCount = await this.clientRegistry.forceCleanup(mobile);
            return { success: true, cleanedCount };
        }
        catch (error) {
            return {
                success: false,
                cleanedCount: 0,
                error: error.message || 'Cleanup failed'
            };
        }
    }
    getRegistryStats() {
        return this.clientRegistry.getStats();
    }
}
exports.SessionManager = SessionManager;
SessionManager.instance = null;
let SessionService = class SessionService {
    constructor(sessionAuditService) {
        this.logger = new telegram_logger_1.TelegramLogger('SessionService');
        this.sessionManager = SessionManager.getInstance();
        this.rateLimitMap = new Map();
        this.MAX_SESSIONS_PER_HOUR = 20;
        this.RATE_LIMIT_WINDOW = 3600000;
        this.sessionAuditService = sessionAuditService;
    }
    getApiId() {
        const apiId = process.env.API_ID;
        if (!apiId) {
            throw new Error('API_ID environment variable is required');
        }
        const parsedApiId = parseInt(apiId);
        if (isNaN(parsedApiId)) {
            throw new Error('Invalid API_ID: must be a number');
        }
        return parsedApiId;
    }
    getApiHash() {
        const apiHash = process.env.API_HASH;
        if (!apiHash) {
            throw new Error('API_HASH environment variable is required');
        }
        return apiHash;
    }
    checkRateLimit(mobile) {
        const now = Date.now();
        const rateLimit = this.rateLimitMap.get(mobile);
        if (rateLimit && now > rateLimit.resetTime) {
            this.rateLimitMap.delete(mobile);
        }
        const currentLimit = this.rateLimitMap.get(mobile);
        if (!currentLimit) {
            this.rateLimitMap.set(mobile, { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW });
            return { allowed: true };
        }
        if (currentLimit.count >= this.MAX_SESSIONS_PER_HOUR) {
            return { allowed: false, resetTime: currentLimit.resetTime };
        }
        currentLimit.count++;
        return { allowed: true };
    }
    async extractMobileFromSession(sessionString) {
        let tempClient = null;
        try {
            tempClient = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionString), this.getApiId(), this.getApiHash(), { connectionRetries: 1 });
            await tempClient.connect();
            const userInfo = await tempClient.getMe();
            if (!userInfo || !userInfo.phone) {
                return { error: 'Unable to extract phone number from session' };
            }
            return { mobile: userInfo.phone };
        }
        catch (error) {
            return { error: error.message || error.toString() };
        }
        finally {
            if (tempClient) {
                try {
                    await tempClient.destroy();
                    tempClient._eventBuilders = [];
                    await (0, utils_1.sleep)(1000);
                }
                catch (cleanupError) {
                }
                finally {
                    if (tempClient) {
                        tempClient._destroyed = true;
                        if (tempClient._sender && typeof tempClient._sender.disconnect === 'function') {
                            await tempClient._sender.disconnect().catch(() => { });
                        }
                    }
                }
            }
        }
    }
    async createSession(options) {
        if (!options || typeof options !== 'object') {
            return { success: false, error: 'Invalid options provided', retryable: false };
        }
        let mobile = options.mobile;
        if (!mobile && options.oldSession) {
            try {
                const extractResult = await this.extractMobileFromSession(options.oldSession);
                if (extractResult.error) {
                    return { success: false, error: `Failed to extract mobile from session: ${extractResult.error}`, retryable: false };
                }
                mobile = extractResult.mobile;
                options.mobile = mobile;
            }
            catch (error) {
                return { success: false, error: `Error extracting mobile from session: ${error.message}`, retryable: false };
            }
        }
        this.logger.info(mobile || 'unknown', 'Service: Creating session with priority order: 1.Old Session -> 2.Existing Manager -> 3.Audit Sessions');
        if (!mobile || typeof mobile !== 'string') {
            return { success: false, error: 'Mobile number is required or must be extractable from session', retryable: false };
        }
        const rateLimitCheck = this.checkRateLimit(mobile);
        if (!rateLimitCheck.allowed) {
            const resetTime = new Date(rateLimitCheck.resetTime || 0);
            return {
                success: false,
                error: `Rate limit exceeded. Try again after ${resetTime.toISOString()}`,
                retryable: true
            };
        }
        try {
            if (options.oldSession) {
                this.logger.info(mobile, 'Trying with provided old session (Priority 1)');
                const result = await this.sessionManager.createSession(options);
                if (result.success && result.session) {
                    await this.updateAuditOnSuccess(mobile, result.session, sessions_schema_1.SessionCreationMethod.INPUT_SESSION);
                    return result;
                }
                else {
                    this.logger.info(mobile, `Old session failed: ${result.error}`);
                }
            }
            this.logger.info(mobile, 'Trying with existing manager (Priority 2)');
            const managerResult = await this.sessionManager.createSession({
                ...options,
                oldSession: undefined
            });
            if (managerResult.success && managerResult.session) {
                await this.updateAuditOnSuccess(mobile, managerResult.session, sessions_schema_1.SessionCreationMethod.USER_MOBILE);
                return managerResult;
            }
            else {
                this.logger.info(mobile, `Existing manager failed: ${managerResult.error}`);
            }
            this.logger.info(mobile, 'Trying with audit sessions (Priority 3)');
            const auditResult = await this.tryAuditSessions(mobile, options);
            if (auditResult.success) {
                await this.updateAuditOnSuccess(mobile, auditResult.session, sessions_schema_1.SessionCreationMethod.OLD_SESSION);
                return auditResult;
            }
            else {
                this.logger.info(mobile, `Audit sessions failed: ${auditResult.error}`);
            }
            const finalError = 'All session creation strategies failed: old session, existing manager, and audit sessions';
            this.logger.warn(mobile, finalError);
            return {
                success: false,
                error: finalError,
                retryable: false
            };
        }
        catch (error) {
            (0, utils_1.parseError)(error, `Error While generating new Session`);
            return {
                success: false,
                error: error.message || 'Unexpected error',
                retryable: false
            };
        }
    }
    async tryAuditSessions(mobile, options) {
        try {
            const auditSessions = await this.sessionAuditService.getSessionsFormobile(mobile, true);
            if (!auditSessions || auditSessions.length === 0) {
                return { success: false, error: 'No audit sessions found', retryable: false };
            }
            for (let i = 0; i < Math.min(auditSessions.length, 2); i++) {
                const auditSession = auditSessions[i];
                try {
                    const result = await this.sessionManager.createSession({
                        ...options,
                        oldSession: auditSession.sessionString,
                        maxRetries: 1
                    });
                    if (result.success) {
                        return result;
                    }
                }
                catch (error) {
                    this.logger.error(mobile, `Audit session ${i + 1} failed`, error);
                }
            }
            return { success: false, error: 'All audit sessions failed', retryable: false };
        }
        catch (error) {
            return { success: false, error: 'Failed to process audit sessions', retryable: false };
        }
    }
    async updateAuditOnSuccess(mobile, sessionString, creationMethod) {
        try {
            await this.sessionAuditService.createAuditRecord({
                mobile,
                sessionString,
                creationMethod,
                creationMessage: 'Session created successfully'
            });
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to create new audit record on success', error);
        }
    }
    async getSessionAuditHistory(mobile, options) {
        try {
            const result = await this.sessionAuditService.querySessionAudits({
                mobile,
                limit: options?.limit,
                offset: options?.offset,
                status: options?.status
            });
            return { success: true, data: result.sessions, total: result.total };
        }
        catch (error) {
            return { success: false, error: error.message || 'Failed to get audit history' };
        }
    }
    async getActiveSession(mobile) {
        try {
            const activeSession = await this.sessionAuditService.getLatestActiveSession(mobile);
            return { success: true, session: activeSession || undefined };
        }
        catch (error) {
            return { success: false, error: error.message || 'Failed to get active session' };
        }
    }
    async updateSessionLastUsed(mobile, sessionString) {
        try {
            const result = await this.sessionAuditService.markSessionUsed(mobile, sessionString);
            if (result) {
                this.logger.info(mobile, 'Session last used timestamp updated');
                return { success: true };
            }
            else {
                return { success: false, error: 'No active session found to update' };
            }
        }
        catch (error) {
            return { success: false, error: error.message || 'Failed to update session last used timestamp' };
        }
    }
    async findRecentValidSession(mobile) {
        try {
            if (!mobile || typeof mobile !== 'string') {
                return { success: false, error: 'Invalid mobile number provided' };
            }
            const recentSessions = await this.sessionAuditService.findRecentSessions(mobile);
            this.logger.debug(mobile, `Found ${recentSessions?.length || 0} recent sessions for this month`);
            if (!recentSessions || recentSessions.length === 0) {
                this.logger.debug(mobile, 'No recent sessions found for this month');
                return { success: false, error: 'No recent sessions found for this month' };
            }
            for (const session of recentSessions) {
                if (session && session.sessionString) {
                    return { success: true, session };
                }
            }
            this.logger.debug(mobile, 'No valid session found from this month');
            return { success: false, error: 'No valid session found from this month' };
        }
        catch (error) {
            this.logger.error(mobile, 'Failed to find valid session from this month', error);
            return { success: false, error: error.message || 'Failed to find valid session from this month' };
        }
    }
    async getOldestSessionOrCreate(options) {
        const { mobile, allowFallback = true, maxAgeDays = 180 } = options;
        try {
            if (!mobile || typeof mobile !== 'string' || mobile.trim().length === 0) {
                return {
                    success: false,
                    message: 'Mobile number is required and must be a valid non-empty string',
                    code: 'INVALID_MOBILE'
                };
            }
            if (maxAgeDays <= 0 || maxAgeDays > 365) {
                return {
                    success: false,
                    message: 'maxAgeDays must be between 1 and 365 days',
                    code: 'INVALID_MAX_AGE'
                };
            }
            this.logger.info(mobile, `Starting getOldestSessionOrCreate with maxAge: ${maxAgeDays} days, fallback: ${allowFallback}`);
            const rateLimitCheck = this.checkRateLimit(mobile);
            if (!rateLimitCheck.allowed) {
                const resetTime = new Date(rateLimitCheck.resetTime || 0);
                return {
                    success: false,
                    message: `Rate limit exceeded. Maximum ${this.MAX_SESSIONS_PER_HOUR} requests per hour. Try again after ${resetTime.toISOString()}`,
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryable: true
                };
            }
            const oldestSessionResult = await this.findOldestValidSession(mobile, maxAgeDays);
            if (oldestSessionResult.success && oldestSessionResult.session) {
                this.logger.info(mobile, 'Oldest valid session found, updating usage and returning');
                try {
                    await this.sessionAuditService.markSessionUsed(mobile, oldestSessionResult.session.sessionString);
                }
                catch (updateError) {
                    this.logger.error(mobile, 'Warning: Failed to update session usage', updateError);
                }
                const sessionAge = this.calculateSessionAge(oldestSessionResult.session.createdAt);
                return {
                    success: true,
                    message: 'Oldest valid session retrieved successfully',
                    data: {
                        session: oldestSessionResult.session.sessionString,
                        sessionAge,
                        isNew: false,
                        usageCount: oldestSessionResult.session.usageCount,
                        lastUsedAt: oldestSessionResult.session.lastUsedAt.toISOString(),
                        createdAt: oldestSessionResult.session.createdAt.toISOString()
                    }
                };
            }
            if (!allowFallback) {
                this.logger.info(mobile, 'No valid session found and fallback is disabled');
                return {
                    success: false,
                    message: `No valid session found within ${maxAgeDays} days and fallback creation is disabled`,
                    code: 'FALLBACK_DISABLED'
                };
            }
            this.logger.info(mobile, 'No valid session found, creating new session as fallback');
            const createResult = await this.createSessionWithFallback(mobile);
            if (createResult.success && createResult.session) {
                return {
                    success: true,
                    message: 'No existing session found, new session created as fallback',
                    data: {
                        session: createResult.session,
                        sessionAge: 0,
                        isNew: true,
                        usageCount: 0,
                        lastUsedAt: new Date().toISOString(),
                        createdAt: new Date().toISOString()
                    }
                };
            }
            else {
                this.logger.error(mobile, 'Failed to create fallback session', createResult.error);
                return {
                    success: false,
                    message: `Failed to create fallback session: ${createResult.error}`,
                    code: 'FALLBACK_CREATION_FAILED',
                    retryable: createResult.retryable || false
                };
            }
        }
        catch (error) {
            this.logger.error(mobile, 'Unexpected error in getOldestSessionOrCreate', error);
            return {
                success: false,
                message: 'An unexpected error occurred while processing the request',
                code: 'INTERNAL_ERROR',
                retryable: false
            };
        }
    }
    async findOldestValidSession(mobile, maxAgeDays) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
            this.logger.info(mobile, `Searching for sessions newer than ${cutoffDate.toISOString()}`);
            const sessions = await this.sessionAuditService.querySessionAudits({
                mobile,
                isActive: true,
                startDate: cutoffDate,
                limit: 50,
                offset: 0
            });
            if (!sessions.sessions || sessions.sessions.length === 0) {
                this.logger.info(mobile, 'No sessions found within the specified age limit');
                return { success: false, error: 'No sessions found within age limit' };
            }
            const validSessions = sessions.sessions
                .filter(session => session &&
                session.sessionString &&
                typeof session.sessionString === 'string' &&
                session.sessionString.trim().length > 0 &&
                session.isActive === true &&
                (session.status === sessions_schema_1.SessionStatus.ACTIVE || session.status === sessions_schema_1.SessionStatus.CREATED))
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            if (validSessions.length === 0) {
                this.logger.info(mobile, 'No valid sessions found (all sessions are invalid or empty)');
                return { success: false, error: 'No valid sessions found' };
            }
            const oldestSession = validSessions[0];
            this.logger.info(mobile, `Found oldest valid session created at ${oldestSession.createdAt}`);
            return { success: true, session: oldestSession };
        }
        catch (error) {
            this.logger.error(mobile, 'Error finding oldest valid session', error);
            return { success: false, error: error.message || 'Failed to find oldest valid session' };
        }
    }
    async createSessionWithFallback(mobile) {
        try {
            return await this.createSession({ mobile });
        }
        catch (error) {
            this.logger.error(mobile, 'Error in createSessionWithFallback', error);
            return {
                success: false,
                error: error.message || 'Failed to create session',
                retryable: false
            };
        }
    }
    calculateSessionAge(createdAt) {
        const now = new Date();
        const sessionDate = new Date(createdAt);
        const diffTime = Math.abs(now.getTime() - sessionDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [session_audit_service_1.SessionAuditService])
], SessionService);
//# sourceMappingURL=session.service.js.map