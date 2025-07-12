import { Document } from 'mongoose';
export type SessionAuditDocument = SessionAudit & Document;
export declare enum SessionStatus {
    CREATED = "created",
    ACTIVE = "active",
    EXPIRED = "expired",
    REVOKED = "revoked",
    FAILED = "failed"
}
export declare enum SessionCreationMethod {
    OLD_SESSION = "old_session",
    USER_MOBILE = "user_mobile",
    INPUT_SESSION = "input_session"
}
export declare class SessionAudit {
    mobile: string;
    sessionString?: string;
    status: SessionStatus;
    creationMethod: SessionCreationMethod;
    creationMessage?: string;
    previousSessionString?: string;
    createdAt: Date;
    lastUsedAt: Date;
    expiresAt?: Date;
    clientId?: string;
    username?: string;
    retryAttempts: number;
    errorMessage?: string;
    metadata?: Record<string, any>;
    isActive: boolean;
    revokedAt?: Date;
    revocationReason?: string;
    usageCount: number;
    lastError?: string;
    lastErrorAt?: Date;
}
export declare const SessionAuditSchema: import("mongoose").Schema<SessionAudit, import("mongoose").Model<SessionAudit, any, any, any, Document<unknown, any, SessionAudit, any> & SessionAudit & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, SessionAudit, Document<unknown, {}, import("mongoose").FlatRecord<SessionAudit>, {}> & import("mongoose").FlatRecord<SessionAudit> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
