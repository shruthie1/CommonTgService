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
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.clientRegistry = client_registry_1.ClientRegistry.getInstance();
        this.DEFAULT_PASSWORD = "Ajtdmwajt1@";
        this.DEFAULT_MAX_RETRIES = 3;
        this.DEFAULT_RETRY_DELAY = 5000;
        this.OTP_WAIT_TIME = 120000;
        this.OTP_CHECK_INTERVAL = 3000;
    }
    static getInstance() {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager();
        }
        return SessionManager.instance;
    }
    async createSession(options) {
        const { mobile, oldSession, password = this.DEFAULT_PASSWORD } = options;
        this.logger.logOperation(mobile, 'Starting session creation process with priority order');
        const existingCheck = this.checkExistingSession(mobile);
        if (!existingCheck.canProceed) {
            return existingCheck.result;
        }
        const strategies = this.getCreationStrategies(options);
        this.logger.logOperation(mobile, `Available strategies: ${strategies.map(s => s.strategyName).join(', ')}`);
        for (const strategy of strategies) {
            try {
                this.logger.logOperation(mobile, `Attempting strategy: ${strategy.strategyName}`);
                const result = await strategy();
                if (result.success) {
                    this.logger.logOperation(mobile, `✓ Session creation successful with ${strategy.strategyName}`);
                    return result;
                }
                this.logger.logOperation(mobile, `✗ Strategy ${strategy.strategyName} failed: ${result.error}`);
            }
            catch (error) {
                this.logger.logError(mobile, `✗ Strategy ${strategy.strategyName} threw error`, error);
            }
        }
        return { success: false, error: 'All SessionManager strategies failed', retryable: false };
    }
    checkExistingSession(mobile) {
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
            tempClient = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionString), parseInt(process.env.API_ID), process.env.API_HASH, { connectionRetries: 1 });
            await tempClient.connect();
            const userInfo = await tempClient.getMe();
            if (!userInfo || userInfo.phone !== mobile) {
                return { isValid: false, error: 'Phone number mismatch or invalid user info' };
            }
            return { isValid: true, userInfo };
        }
        catch (error) {
            return { isValid: false, error: error.message || error.toString() || error.errorMessage };
        }
        finally {
            await this.cleanupClient(tempClient, mobile);
        }
    }
    async performSessionCreation(oldSessionString, mobile, password, attempt) {
        let oldClient = null;
        let newClient = null;
        try {
            oldClient = new telegram_1.TelegramClient(new sessions_1.StringSession(oldSessionString), parseInt(process.env.API_ID), process.env.API_HASH, { connectionRetries: 1 });
            await oldClient.connect();
            await oldClient.getMe();
            newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), parseInt(process.env.API_ID), process.env.API_HASH, { connectionRetries: 1 });
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
        this.logger.logOperation(mobile, `Waiting for OTP (attempt ${attempt})`);
        while (Date.now() - startTime < this.OTP_WAIT_TIME) {
            try {
                const messages = await oldClient.getMessages('777000', { limit: 1 });
                const message = messages[0];
                if (message && message.date && (message.date * 1000) > (Date.now() - 120000)) {
                    const code = this.extractOtpCode(message.text.toLowerCase());
                    if (code) {
                        this.logger.logOperation(mobile, `OTP extracted: ${code}`);
                        return code;
                    }
                }
                await (0, utils_1.sleep)(this.OTP_CHECK_INTERVAL);
            }
            catch (error) {
                this.logger.logError(mobile, 'Error checking OTP messages', error);
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
            await client.destroy();
            client._eventBuilders = [];
            connection_manager_1.connectionManager.unregisterClient(mobile);
            await (0, utils_1.sleep)(1000);
        }
        catch (error) {
            this.logger.logError(mobile, 'Client cleanup error', error);
        }
        finally {
            client._destroyed = true;
            if (client._sender && typeof client._sender.disconnect === 'function') {
                await client._sender.disconnect().catch(() => { });
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
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.sessionManager = SessionManager.getInstance();
        this.rateLimitMap = new Map();
        this.MAX_SESSIONS_PER_HOUR = 3;
        this.RATE_LIMIT_WINDOW = 3600000;
        this.sessionAuditService = sessionAuditService;
    }
    checkRateLimit(mobile) {
        const now = Date.now();
        const rateLimit = this.rateLimitMap.get(mobile);
        if (!rateLimit || now > rateLimit.resetTime) {
            this.rateLimitMap.set(mobile, { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW });
            return { allowed: true };
        }
        if (rateLimit.count >= this.MAX_SESSIONS_PER_HOUR) {
            return { allowed: false, resetTime: rateLimit.resetTime };
        }
        rateLimit.count++;
        return { allowed: true };
    }
    async extractMobileFromSession(sessionString) {
        let tempClient = null;
        try {
            tempClient = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionString), parseInt(process.env.API_ID), process.env.API_HASH, { connectionRetries: 1 });
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
                    tempClient._destroyed = true;
                    if (tempClient._sender && typeof tempClient._sender.disconnect === 'function') {
                        await tempClient._sender.disconnect().catch(() => { });
                    }
                }
            }
        }
    }
    async createSession(options) {
        let mobile = options.mobile;
        if (!mobile && options.oldSession) {
            const extractResult = await this.extractMobileFromSession(options.oldSession);
            if (extractResult.error) {
                return { success: false, error: `Failed to extract mobile from session: ${extractResult.error}`, retryable: false };
            }
            mobile = extractResult.mobile;
            options.mobile = mobile;
        }
        this.logger.logOperation(mobile || 'unknown', 'Service: Creating session with priority order: 1.Old Session -> 2.Existing Manager -> 3.Audit Sessions');
        if (!mobile) {
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
                this.logger.logOperation(mobile, 'Trying with provided old session (Priority 1)');
                const result = await this.sessionManager.createSession(options);
                if (result.success && result.session) {
                    await this.updateAuditOnSuccess(mobile, result.session, sessions_schema_1.SessionCreationMethod.INPUT_SESSION);
                    return result;
                }
                else {
                    this.logger.logOperation(mobile, `Old session failed: ${result.error}`);
                }
            }
            this.logger.logOperation(mobile, 'Trying with existing manager (Priority 2)');
            const managerResult = await this.sessionManager.createSession({
                ...options,
                oldSession: undefined
            });
            if (managerResult.success && managerResult.session) {
                await this.updateAuditOnSuccess(mobile, managerResult.session, sessions_schema_1.SessionCreationMethod.USER_MOBILE);
                return managerResult;
            }
            else {
                this.logger.logOperation(mobile, `Existing manager failed: ${managerResult.error}`);
            }
            this.logger.logOperation(mobile, 'Trying with audit sessions (Priority 3)');
            const auditResult = await this.tryAuditSessions(mobile, options);
            if (auditResult.success) {
                await this.updateAuditOnSuccess(mobile, auditResult.session, sessions_schema_1.SessionCreationMethod.OLD_SESSION);
                return auditResult;
            }
            else {
                this.logger.logOperation(mobile, `Audit sessions failed: ${auditResult.error}`);
            }
            const finalError = 'All session creation strategies failed: old session, existing manager, and audit sessions';
            (0, utils_1.parseError)(finalError);
            return {
                success: false,
                error: finalError,
                retryable: false
            };
        }
        catch (error) {
            (0, utils_1.parseError)(error);
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
                    this.logger.logError(mobile, `Audit session ${i + 1} failed`, error);
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
            this.logger.logError(mobile, 'Failed to create new audit record on success', error);
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
                this.logger.logOperation(mobile, 'Session last used timestamp updated');
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
    async findValidSessionThisMonth(mobile) {
        try {
            const recentSessions = await this.sessionAuditService.findValidSessionThisMonth(mobile);
            this.logger.logDebug(mobile, `Found ${recentSessions.length} recent sessions for this month`);
            for (const session of recentSessions) {
                const isActive = await this.sessionManager.validateSession(session.sessionString, mobile);
                if (isActive.isValid) {
                    return { success: true, session };
                }
                else {
                    this.logger.logDebug(mobile, `Session found from this month but not valid: ${session}`);
                    this.sessionAuditService.revokeSession(session.mobile, session.sessionString, isActive.error);
                }
            }
            this.logger.logDebug(mobile, 'No valid session found from this month');
            return { success: false, error: 'No valid session found from this month' };
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to find valid session from this month', error);
            return { success: false, error: error.message || 'Failed to find valid session from this month' };
        }
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [session_audit_service_1.SessionAuditService])
], SessionService);
//# sourceMappingURL=session.service.js.map