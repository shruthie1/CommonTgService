import { SessionService } from './session.service';
export declare class CreateSessionDto {
    mobile?: string;
    session?: string;
    forceNew?: boolean;
}
export declare class SearchAuditDto {
    mobile?: string;
    status?: string;
    limit?: number;
    offset?: number;
}
export declare class GetOldestSessionDto {
    mobile: string;
    allowFallback?: boolean;
    maxAgeDays?: number;
}
export declare class SessionController {
    private readonly sessionService;
    constructor(sessionService: SessionService);
    createSession(body: CreateSessionDto): Promise<{
        success: boolean;
        message: string;
        session: string;
        isNew: boolean;
    }>;
    searchAudit(mobile?: string, status?: string, limit?: number, offset?: number): Promise<{
        success: boolean;
        data: any;
        total: any;
        message: string;
    }>;
    getOldestSessionOrCreate(body: GetOldestSessionDto): Promise<{
        session: string;
        sessionAge: number;
        isNew: boolean;
        usageCount: number;
        lastUsedAt: string;
        createdAt: string;
    }>;
}
