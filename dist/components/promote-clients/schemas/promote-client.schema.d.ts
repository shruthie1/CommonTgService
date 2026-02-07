import { Document } from 'mongoose';
export type PromoteClientDocument = PromoteClient & Document;
export declare class PromoteClient {
    tgId: string;
    mobile: string;
    lastActive: string;
    availableDate: string;
    channels: number;
    clientId?: string;
    status: string;
    message: string;
    lastUsed: Date;
    privacyUpdatedAt: Date;
    profilePicsUpdatedAt: Date;
    nameBioUpdatedAt: Date;
    profilePicsDeletedAt: Date;
    usernameUpdatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    lastChecked: Date;
    lastUpdateAttempt: Date;
    failedUpdateAttempts: number;
    lastUpdateFailure: Date;
}
export declare const PromoteClientSchema: import("mongoose").Schema<PromoteClient, import("mongoose").Model<PromoteClient, any, any, any, (Document<unknown, any, PromoteClient, any, import("mongoose").DefaultSchemaOptions> & PromoteClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, PromoteClient, any, import("mongoose").DefaultSchemaOptions> & PromoteClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, PromoteClient>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PromoteClient, Document<unknown, {}, PromoteClient, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    tgId?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    mobile?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastActive?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    availableDate?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    channels?: import("mongoose").SchemaDefinitionProperty<number, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    status?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    message?: import("mongoose").SchemaDefinitionProperty<string, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUsed?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    privacyUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    profilePicsUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    nameBioUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    profilePicsDeletedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    usernameUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    updatedAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastChecked?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUpdateAttempt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    failedUpdateAttempts?: import("mongoose").SchemaDefinitionProperty<number, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUpdateFailure?: import("mongoose").SchemaDefinitionProperty<Date, PromoteClient, Document<unknown, {}, PromoteClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, PromoteClient>;
