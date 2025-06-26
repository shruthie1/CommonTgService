import { SessionStatus, SessionCreationMethod } from '../schemas/sessions.schema';
export declare class CreateSessionAuditDto {
    mobile: string;
    sessionString?: string;
    creationMethod: SessionCreationMethod;
    creationMessage?: string;
    previousSessionString?: string;
    clientId?: string;
    username?: string;
    retryAttempts?: number;
    metadata?: Record<string, any>;
}
export declare class UpdateSessionAuditDto {
    sessionString?: string;
    status?: SessionStatus;
    clientId?: string;
    username?: string;
    errorMessage?: string;
    revocationReason?: string;
    isActive?: boolean;
    usageCount?: number;
    lastError?: string;
    revokedAt?: Date;
}
export declare class SessionAuditQueryDto {
    mobile?: string;
    status?: SessionStatus;
    creationMethod?: SessionCreationMethod;
    isActive?: boolean;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
}
export declare class SessionAuditStatsDto {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    revokedSessions: number;
    failedSessions: number;
    creationMethodBreakdown: Record<string, number>;
    dateRange: {
        start: Date;
        end: Date;
    };
}
