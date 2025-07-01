import { Api } from 'telegram';
import { SessionAuditService } from './session-audit.service';
import { SessionStatus, SessionAudit } from './schemas/sessions.schema';
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
export declare class SessionManager {
    private static instance;
    private readonly logger;
    private readonly clientRegistry;
    private readonly DEFAULT_PASSWORD;
    private readonly DEFAULT_MAX_RETRIES;
    private readonly DEFAULT_RETRY_DELAY;
    private readonly OTP_WAIT_TIME;
    private readonly OTP_CHECK_INTERVAL;
    private constructor();
    private validateEnvironmentVariables;
    private getApiId;
    private getApiHash;
    static getInstance(): SessionManager;
    createSession(options: SessionCreationOptions): Promise<SessionCreationResult>;
    private checkExistingSession;
    private getCreationStrategies;
    private createFromOldSession;
    private createFromExistingManager;
    validateSession(sessionString: string, mobile: string): Promise<{
        isValid: boolean;
        error?: string;
        userInfo?: Api.User;
    }>;
    private performSessionCreation;
    private waitForOtp;
    private extractOtpCode;
    private cleanupClient;
    private isRetryableError;
    getSessionStatus(mobile: string): {
        status: 'active' | 'inactive' | 'creating' | 'error';
        activeClients: number;
        lastActivity?: Date;
    };
    cleanupSessions(mobile: string, force?: boolean): Promise<{
        success: boolean;
        cleanedCount: number;
        error?: string;
    }>;
    getRegistryStats(): {
        activeClients: number;
        activeLocks: number;
        mobiles: string[];
    };
}
export declare class SessionService {
    private readonly logger;
    private readonly sessionManager;
    private readonly sessionAuditService;
    private readonly rateLimitMap;
    private readonly MAX_SESSIONS_PER_HOUR;
    private readonly RATE_LIMIT_WINDOW;
    constructor(sessionAuditService: SessionAuditService);
    private getApiId;
    private getApiHash;
    private checkRateLimit;
    private extractMobileFromSession;
    createSession(options: SessionCreationOptions): Promise<SessionCreationResult>;
    private tryAuditSessions;
    private updateAuditOnSuccess;
    getSessionAuditHistory(mobile: string, options?: {
        limit?: number;
        offset?: number;
        status?: SessionStatus;
    }): Promise<{
        success: boolean;
        data?: SessionAudit[];
        total?: number;
        error?: string;
    }>;
    getActiveSession(mobile: string): Promise<{
        success: boolean;
        session?: SessionAudit;
        error?: string;
    }>;
    updateSessionLastUsed(mobile: string, sessionString?: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    findRecentValidSession(mobile: string): Promise<{
        success: boolean;
        session?: SessionAudit;
        error?: string;
    }>;
}
