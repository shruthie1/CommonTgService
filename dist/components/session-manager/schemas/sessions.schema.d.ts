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
export declare const SessionAuditSchema: import("mongoose").Schema<SessionAudit, import("mongoose").Model<SessionAudit, any, any, any, (Document<unknown, any, SessionAudit, any, import("mongoose").DefaultSchemaOptions> & SessionAudit & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, SessionAudit, any, import("mongoose").DefaultSchemaOptions> & SessionAudit & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, SessionAudit>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, SessionAudit, Document<unknown, {}, SessionAudit, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    mobile?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    sessionString?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    status?: import("mongoose").SchemaDefinitionProperty<SessionStatus, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    creationMethod?: import("mongoose").SchemaDefinitionProperty<SessionCreationMethod, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    creationMessage?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    previousSessionString?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUsedAt?: import("mongoose").SchemaDefinitionProperty<Date, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    expiresAt?: import("mongoose").SchemaDefinitionProperty<Date, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    username?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    retryAttempts?: import("mongoose").SchemaDefinitionProperty<number, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    errorMessage?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    metadata?: import("mongoose").SchemaDefinitionProperty<Record<string, any>, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    isActive?: import("mongoose").SchemaDefinitionProperty<boolean, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    revokedAt?: import("mongoose").SchemaDefinitionProperty<Date, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    revocationReason?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    usageCount?: import("mongoose").SchemaDefinitionProperty<number, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastError?: import("mongoose").SchemaDefinitionProperty<string, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastErrorAt?: import("mongoose").SchemaDefinitionProperty<Date, SessionAudit, Document<unknown, {}, SessionAudit, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<SessionAudit & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, SessionAudit>;
