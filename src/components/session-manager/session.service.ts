import { Injectable } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { parseError, sleep } from '../../utils';
import { TelegramLogger } from '../Telegram/utils/telegram-logger';
import { connectionManager } from '../Telegram/utils/connection-manager';
import { ClientRegistry } from './client-registry';
import { SessionAuditService } from './session-audit.service';
import { SessionCreationMethod, SessionStatus, SessionAudit } from './schemas/sessions.schema';
import { SessionAuditStatsDto } from './dto/session-audit.dto';

export interface SessionCreationOptions {
    oldSession?: string;
    mobile?: string;
    password?: string;
    maxRetries?: number;
    retryDelay?: number;
}

export interface SessionCreationResult {
    success: boolean;
    session?: string;
    error?: string;
    retryable?: boolean;
}

export class SessionManager {
    private static instance: SessionManager | null = null;
    private readonly logger = TelegramLogger.getInstance();
    private readonly clientRegistry = ClientRegistry.getInstance();

    // Constants
    private readonly DEFAULT_PASSWORD = "Ajtdmwajt1@";
    private readonly DEFAULT_MAX_RETRIES = 3;
    private readonly DEFAULT_RETRY_DELAY = 5000;
    private readonly OTP_WAIT_TIME = 120000; // 2 minutes
    private readonly OTP_CHECK_INTERVAL = 3000; // 3 seconds

    private constructor() {
    }

    private getApiId(): number {
        const apiId = parseInt(process.env.API_ID!);
        if (isNaN(apiId)) {
            throw new Error('Invalid API_ID: must be a number');
        }
        return apiId;
    }

    private getApiHash(): string {
        const apiHash = process.env.API_HASH;
        if (!apiHash) {
            throw new Error('API_HASH environment variable is required');
        }
        return apiHash;
    }

    public static getInstance(): SessionManager {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager();
        }
        return SessionManager.instance;
    }

    /**
     * Main entry point for session creation with fallback strategies
     */
    public async createSession(options: SessionCreationOptions): Promise<SessionCreationResult> {
        const { mobile, oldSession, password = this.DEFAULT_PASSWORD } = options;

        // Validate mobile parameter
        if (!mobile) {
            return { success: false, error: 'Mobile number is required', retryable: false };
        }

        this.logger.logOperation(mobile, 'Starting session creation process with priority order');

        // Check for existing sessions
        const existingCheck = this.checkExistingSession(mobile);
        if (!existingCheck.canProceed) {
            return existingCheck.result;
        }

        // Try strategies in priority order: 1. Old session -> 2. Existing manager
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
            } catch (error) {
                this.logger.logError(mobile, `✗ Strategy ${strategy.strategyName} threw error`, error);
            }
        }

        return { success: false, error: 'All SessionManager strategies failed', retryable: false };
    }

    /**
     * Check if session creation can proceed
     */
    private checkExistingSession(mobile: string): { canProceed: boolean; result?: SessionCreationResult } {
        // Validate mobile parameter
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

    /**
     * Get creation strategies in priority order
     * Priority: 1. Old session -> 2. Existing manager -> 3. Audit sessions (handled at service level)
     */
    private getCreationStrategies(options: SessionCreationOptions) {
        const strategies = [];

        // Strategy 1: Use old session if provided (HIGHEST PRIORITY)
        if (options.oldSession) {
            const strategyFunction = () => this.createFromOldSession(options);
            strategyFunction.strategyName = 'oldSession';
            strategies.push(strategyFunction);
        }

        // Strategy 2: Use existing TelegramManager (SECOND PRIORITY)
        if (options.mobile) {
            const strategyFunction = () => this.createFromExistingManager(options.mobile);
            strategyFunction.strategyName = 'existingManager';
            strategies.push(strategyFunction);
        }

        return strategies;
    }

    /**
     * Create session from old session string
     */
    private async createFromOldSession(options: SessionCreationOptions): Promise<SessionCreationResult> {
        const { oldSession, mobile, password, maxRetries = this.DEFAULT_MAX_RETRIES, retryDelay = this.DEFAULT_RETRY_DELAY } = options;

        // Validate old session first
        const validation = await this.validateSession(oldSession!, mobile);
        if (!validation.isValid) {
            return { success: false, error: `Session validation failed: ${validation.error}`, retryable: false };
        }

        // Acquire lock
        const lockId = await this.clientRegistry.waitForLock(mobile);

        try {
            this.clientRegistry.markClientCreating(mobile, lockId);

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const newSession = await this.performSessionCreation(oldSession!, mobile, password!, attempt);
                    return { success: true, session: newSession };
                } catch (error) {
                    const errorMessage = error.message || error.toString();
                    const isRetryable = this.isRetryableError(errorMessage);

                    if (!isRetryable || attempt === maxRetries) {
                        return { success: false, error: errorMessage, retryable: isRetryable };
                    }

                    if (attempt < maxRetries) {
                        await sleep(retryDelay);
                    }
                }
            }

            return { success: false, error: 'Max retries exceeded', retryable: false };

        } finally {
            if (lockId) {
                await this.clientRegistry.removeClient(mobile, lockId);
                this.clientRegistry.releaseLock(mobile, lockId);
            }
        }
    }

    /**
     * Create session using existing TelegramManager
     */
    private async createFromExistingManager(mobile: string): Promise<SessionCreationResult> {
        try {
            const client = await connectionManager.getClient(mobile);
            const newSession = await client.createNewSession();
            return { success: true, session: newSession };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Existing manager method failed',
                retryable: this.isRetryableError(error.message)
            };
        } finally {
            await connectionManager.unregisterClient(mobile);
        }
    }

    /**
     * Validate session functionality
     */
    public async validateSession(sessionString: string, mobile: string): Promise<{ isValid: boolean; error?: string; userInfo?: Api.User }> {
        let tempClient: TelegramClient | null = null;

        try {
            tempClient = new TelegramClient(
                new StringSession(sessionString),
                this.getApiId(),
                this.getApiHash(),
                { connectionRetries: 1 }
            );

            await tempClient.connect();
            const userInfo = await tempClient.getMe() as Api.User;

            if (!userInfo || userInfo.phone !== mobile) {
                return { isValid: false, error: 'Phone number mismatch or invalid user info' };
            }
            this.logger.logOperation(mobile, 'Session validation successful');
            await this.cleanupClient(tempClient, mobile);
            return { isValid: true, userInfo };
        } catch (error) {
            this.logger.logError(mobile, 'Session validation failed', error);
            await this.cleanupClient(tempClient, mobile);
            return { isValid: false, error: error.message || error.toString() || error.errorMessage };
        } finally {
        }
    }

    /**
     * Perform the actual session creation
     */
    private async performSessionCreation(oldSessionString: string, mobile: string, password: string, attempt: number): Promise<string> {
        let oldClient: TelegramClient | null = null;
        let newClient: TelegramClient | null = null;

        try {
            // Connect to old session
            oldClient = new TelegramClient(
                new StringSession(oldSessionString),
                this.getApiId(),
                this.getApiHash(),
                { connectionRetries: 1 }
            );

            await oldClient.connect();
            await oldClient.getMe(); // Verify connection

            // Create new client
            newClient = new TelegramClient(
                new StringSession(''),
                this.getApiId(),
                this.getApiHash(),
                { connectionRetries: 1 }
            );

            // Start session creation
            await newClient.start({
                phoneNumber: mobile,
                password: async () => password,
                phoneCode: async () => this.waitForOtp(oldClient!, mobile, attempt),
                onError: (err: any) => {
                    throw new Error(`Session start error: ${err.message || err}`);
                }
            });

            return newClient.session.save() as unknown as string;

        } finally {
            await Promise.all([
                this.cleanupClient(newClient, mobile),
                this.cleanupClient(oldClient, mobile)
            ]);
        }
    }

    /**
     * Wait for OTP from Telegram (chat ID 777000)
     */
    private async waitForOtp(oldClient: TelegramClient, mobile: string, attempt: number): Promise<string> {
        const startTime = Date.now();

        this.logger.logOperation(mobile, `Waiting for OTP (attempt ${attempt})`);

        while (Date.now() - startTime < this.OTP_WAIT_TIME) {
            try {
                const messages = await oldClient.getMessages('777000', { limit: 1 });
                const message = messages[0];

                if (message && message.date && (message.date * 1000) > (Date.now() - 120000)) {
                    // Safely check if message has text before processing
                    const messageText = message.text || message.message || '';
                    if (messageText) {
                        const code = this.extractOtpCode(messageText.toLowerCase());
                        if (code) {
                            this.logger.logOperation(mobile, `OTP extracted: ${code}`);
                            return code;
                        }
                    }
                }

                await sleep(this.OTP_CHECK_INTERVAL);

            } catch (error) {
                this.logger.logError(mobile, 'Error checking OTP messages', error);
                await sleep(this.OTP_CHECK_INTERVAL);
            }
        }

        throw new Error(`OTP timeout after ${this.OTP_WAIT_TIME}ms`);
    }

    /**
     * Extract OTP code from message text
     */
    private extractOtpCode(messageText: string): string | null {
        const patterns = [
            /code:\*\*(\d{5,6})/,
            /login code:\s*(\d{5,6})/,
            /your code is\s*(\d{5,6})/,
            /verification code:\s*(\d{5,6})/,
            /\b(\d{5,6})\b/
        ];

        for (const pattern of patterns) {
            const match = messageText.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    /**
     * Clean up Telegram client with enhanced safety
     */
    private async cleanupClient(client: TelegramClient | null, mobile: string): Promise<void> {
        if (!client) return;
        try {
            // Check if client is already destroyed to prevent double cleanup
            if ((client as any)._destroyed) {
                this.logger.logOperation(mobile, 'Client already destroyed, skipping cleanup');
                return;
            }

            await client.destroy();

            // Safely handle private properties that might not exist
            if ((client as any)._eventBuilders) {
                (client as any)._eventBuilders = [];
            }

            connectionManager.unregisterClient(mobile);
            await sleep(1000);
        } catch (error) {
            this.logger.logError(mobile, 'Client cleanup error', error);
        } finally {
            if (client) {
                try {
                    (client as any)._destroyed = true;
                    if ((client as any)._sender && typeof (client as any)._sender.disconnect === 'function') {
                        await (client as any)._sender.disconnect().catch(() => {});
                    }
                } catch (finalCleanupError) {
                    this.logger.logError(mobile, 'Final cleanup error', finalCleanupError);
                }
                this.logger.logOperation(mobile, 'Client cleanup completed');
            }
        }
    }

    /**
     * Check if error is retryable
     */
    private isRetryableError(errorMessage: string): boolean {
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

        return true; // Default to retryable for unknown errors
    }

    /**
     * Get session status
     */
    public getSessionStatus(mobile: string): {
        status: 'active' | 'inactive' | 'creating' | 'error';
        activeClients: number;
        lastActivity?: Date;
    } {
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

    /**
     * Cleanup sessions
     */
    public async cleanupSessions(mobile: string, force: boolean = false): Promise<{
        success: boolean;
        cleanedCount: number;
        error?: string;
    }> {
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

        } catch (error) {
            return {
                success: false,
                cleanedCount: 0,
                error: error.message || 'Cleanup failed'
            };
        }
    }

    /**
     * Get registry statistics
     */
    public getRegistryStats(): { activeClients: number; activeLocks: number; mobiles: string[] } {
        return this.clientRegistry.getStats();
    }
}

@Injectable()
export class SessionService {

    private readonly logger = TelegramLogger.getInstance();
    private readonly sessionManager = SessionManager.getInstance();
    private readonly sessionAuditService: SessionAuditService;
    private readonly rateLimitMap = new Map<string, { count: number; resetTime: number }>();
    private readonly MAX_SESSIONS_PER_HOUR = 3;
    private readonly RATE_LIMIT_WINDOW = 3600000; // 1 hour

    constructor(sessionAuditService: SessionAuditService) {
        this.sessionAuditService = sessionAuditService;
    }

    private getApiId(): number {
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

    private getApiHash(): string {
        const apiHash = process.env.API_HASH;
        if (!apiHash) {
            throw new Error('API_HASH environment variable is required');
        }
        return apiHash;
    }

    private checkRateLimit(mobile: string): { allowed: boolean; resetTime?: number } {
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

    private async extractMobileFromSession(sessionString: string): Promise<{ mobile?: string; error?: string }> {
        let tempClient: TelegramClient | null = null;

        try {
            tempClient = new TelegramClient(
                new StringSession(sessionString),
                this.getApiId(),
                this.getApiHash(),
                { connectionRetries: 1 }
            );

            await tempClient.connect();
            const userInfo = await tempClient.getMe() as Api.User;

            if (!userInfo || !userInfo.phone) {
                return { error: 'Unable to extract phone number from session' };
            }

            return { mobile: userInfo.phone };

        } catch (error) {
            return { error: error.message || error.toString() };
        } finally {
            if (tempClient) {
                try {
                    await tempClient.destroy();
                    tempClient._eventBuilders = [];
                    await sleep(1000);
                } catch (cleanupError) {
                } finally {
                    if (tempClient) {
                        tempClient._destroyed = true;
                        if (tempClient._sender && typeof tempClient._sender.disconnect === 'function') {
                            await tempClient._sender.disconnect().catch(() => {});
                        }
                    }
                }
            }
        }
    }

    async createSession(options: SessionCreationOptions): Promise<SessionCreationResult> {
        // Validate input parameters
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
                mobile = extractResult.mobile!;
                options.mobile = mobile;
            } catch (error) {
                return { success: false, error: `Error extracting mobile from session: ${error.message}`, retryable: false };
            }
        }

        this.logger.logOperation(mobile || 'unknown', 'Service: Creating session with priority order: 1.Old Session -> 2.Existing Manager -> 3.Audit Sessions');

        if (!mobile || typeof mobile !== 'string') {
            return { success: false, error: 'Mobile number is required or must be extractable from session', retryable: false };
        }

        // Check rate limit
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
                    await this.updateAuditOnSuccess(mobile, result.session, SessionCreationMethod.INPUT_SESSION);
                    return result;
                } else {
                    this.logger.logOperation(mobile, `Old session failed: ${result.error}`);
                }
            }

            // PRIORITY 2: Try with existing manager (mobile-based)
            this.logger.logOperation(mobile, 'Trying with existing manager (Priority 2)');
            const managerResult = await this.sessionManager.createSession({
                ...options,
                oldSession: undefined // Clear old session to force using existing manager
            });

            if (managerResult.success && managerResult.session) {
                await this.updateAuditOnSuccess(mobile, managerResult.session, SessionCreationMethod.USER_MOBILE);
                return managerResult;
            } else {
                this.logger.logOperation(mobile, `Existing manager failed: ${managerResult.error}`);
            }

            // PRIORITY 3: Try with audit sessions (fallback)
            this.logger.logOperation(mobile, 'Trying with audit sessions (Priority 3)');
            const auditResult = await this.tryAuditSessions(mobile, options);
            if (auditResult.success) {
                await this.updateAuditOnSuccess(mobile, auditResult.session!, SessionCreationMethod.OLD_SESSION);
                return auditResult;
            } else {
                this.logger.logOperation(mobile, `Audit sessions failed: ${auditResult.error}`);
            }

            // All strategies failed
            const finalError = 'All session creation strategies failed: old session, existing manager, and audit sessions';
            parseError(finalError);
            return {
                success: false,
                error: finalError,
                retryable: false
            };

        } catch (error) {
            parseError(error);
            return {
                success: false,
                error: error.message || 'Unexpected error',
                retryable: false
            };
        }
    }

    private async tryAuditSessions(mobile: string, options: SessionCreationOptions): Promise<SessionCreationResult> {
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
                        // Don't mark session as used - let the main success handler create new audit record
                        return result;
                    }
                } catch (error) {
                    this.logger.logError(mobile, `Audit session ${i + 1} failed`, error);
                }
            }

            return { success: false, error: 'All audit sessions failed', retryable: false };

        } catch (error) {
            return { success: false, error: 'Failed to process audit sessions', retryable: false };
        }
    }

    /**
     * Create new audit record on success (always create new, don't update existing)
     */
    private async updateAuditOnSuccess(mobile: string, sessionString: string, creationMethod: SessionCreationMethod): Promise<void> {
        try {
            // Always create a new audit record for successful session creation
            await this.sessionAuditService.createAuditRecord({
                mobile,
                sessionString,
                creationMethod,
                creationMessage: 'Session created successfully'
            });
        } catch (error) {
            this.logger.logError(mobile, 'Failed to create new audit record on success', error);
        }
    }
    async getSessionAuditHistory(mobile: string, options?: {
        limit?: number;
        offset?: number;
        status?: SessionStatus;
    }): Promise<{ success: boolean; data?: SessionAudit[]; total?: number; error?: string }> {
        try {
            const result = await this.sessionAuditService.querySessionAudits({
                mobile,
                limit: options?.limit,
                offset: options?.offset,
                status: options?.status
            });

            return { success: true, data: result.sessions, total: result.total };
        } catch (error) {
            return { success: false, error: error.message || 'Failed to get audit history' };
        }
    }

    async getActiveSession(mobile: string): Promise<{ success: boolean; session?: SessionAudit; error?: string }> {
        try {
            const activeSession = await this.sessionAuditService.getLatestActiveSession(mobile);
            return { success: true, session: activeSession || undefined };
        } catch (error) {
            return { success: false, error: error.message || 'Failed to get active session' };
        }
    }

    async updateSessionLastUsed(mobile: string, sessionString?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const result = await this.sessionAuditService.markSessionUsed(mobile, sessionString);
            if (result) {
                this.logger.logOperation(mobile, 'Session last used timestamp updated');
                return { success: true };
            } else {
                return { success: false, error: 'No active session found to update' };
            }
        } catch (error) {
            return { success: false, error: error.message || 'Failed to update session last used timestamp' };
        }
    }

    async findRecentValidSession(mobile: string): Promise<{ success: boolean; session?: SessionAudit; error?: string }> {
        try {
            // Validate mobile parameter
            if (!mobile || typeof mobile !== 'string') {
                return { success: false, error: 'Invalid mobile number provided' };
            }

            const recentSessions = await this.sessionAuditService.findRecentSessions(mobile);
            this.logger.logDebug(mobile, `Found ${recentSessions?.length || 0} recent sessions for this month`);

            if (!recentSessions || recentSessions.length === 0) {
                this.logger.logDebug(mobile, 'No recent sessions found for this month');
                return { success: false, error: 'No recent sessions found for this month' };
            }

            for (const session of recentSessions) {
                if (session && session.sessionString) {
                    return { success: true, session };
                    // const isActive = await this.sessionManager.validateSession(session.sessionString, mobile);
                    // if (isActive.isValid) {
                    //     return { success: true, session };
                    // } else {
                    //     this.logger.logDebug(mobile, `Session found from this month but not valid: ${session}`);
                    //     this.sessionAuditService.revokeSession(session.mobile, session.sessionString, isActive.error);
                    // }
                }
            }

            this.logger.logDebug(mobile, 'No valid session found from this month');
            return { success: false, error: 'No valid session found from this month' };
        } catch (error) {
            this.logger.logError(mobile, 'Failed to find valid session from this month', error);
            return { success: false, error: error.message || 'Failed to find valid session from this month' };
        }
    }
}