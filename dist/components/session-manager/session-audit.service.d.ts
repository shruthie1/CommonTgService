import { Model } from 'mongoose';
import { SessionAudit, SessionAuditDocument } from './schemas/sessions.schema';
import { CreateSessionAuditDto, UpdateSessionAuditDto, SessionAuditQueryDto, SessionAuditStatsDto } from './dto/session-audit.dto';
export declare class SessionAuditService {
    private sessionAuditModel;
    private readonly logger;
    constructor(sessionAuditModel: Model<SessionAuditDocument>);
    createAuditRecord(createDto: CreateSessionAuditDto): Promise<SessionAudit>;
    updateAuditRecord(mobile: string, sessionString: string | undefined, updateDto: UpdateSessionAuditDto): Promise<SessionAudit | null>;
    markSessionUsed(mobile: string, sessionString?: string): Promise<SessionAudit | null>;
    markSessionFailed(mobile: string, sessionString: string | undefined, errorMessage: string): Promise<SessionAudit | null>;
    revokeSession(mobile: string, sessionString: string, reason?: string): Promise<SessionAudit | null>;
    getSessionsFormobile(mobile: string, activeOnly?: boolean): Promise<SessionAudit[]>;
    getLatestActiveSession(mobile: string): Promise<SessionAudit | null>;
    querySessionAudits(queryDto: SessionAuditQueryDto): Promise<{
        sessions: SessionAudit[];
        total: number;
        page: number;
        limit: number;
    }>;
    getSessionStats(mobile?: string, days?: number): Promise<SessionAuditStatsDto>;
    cleanupOldSessions(days?: number): Promise<{
        deletedCount: number;
    }>;
    findValidSessionThisMonth(mobile: string): Promise<SessionAudit[]>;
    markExpiredSessions(inactiveDays?: number): Promise<{
        modifiedCount: number;
    }>;
}
