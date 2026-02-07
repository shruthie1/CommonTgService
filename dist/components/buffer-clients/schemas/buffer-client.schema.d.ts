import { Document } from 'mongoose';
export type BufferClientDocument = BufferClient & Document;
export declare class BufferClient {
    tgId: string;
    mobile: string;
    session: string;
    availableDate: string;
    channels: number;
    clientId: string;
    message: string;
    lastUsed: Date;
    lastChecked: Date;
    status: 'active' | 'inactive';
    inUse: boolean;
    privacyUpdatedAt: Date;
    profilePicsUpdatedAt: Date;
    nameBioUpdatedAt: Date;
    profilePicsDeletedAt: Date;
    usernameUpdatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    lastUpdateAttempt: Date;
    failedUpdateAttempts: number;
    lastUpdateFailure: Date;
}
export declare const BufferClientSchema: import("mongoose").Schema<BufferClient, import("mongoose").Model<BufferClient, any, any, any, (Document<unknown, any, BufferClient, any, import("mongoose").DefaultSchemaOptions> & BufferClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, BufferClient, any, import("mongoose").DefaultSchemaOptions> & BufferClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, BufferClient>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, BufferClient, Document<unknown, {}, BufferClient, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    tgId?: import("mongoose").SchemaDefinitionProperty<string, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    mobile?: import("mongoose").SchemaDefinitionProperty<string, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    session?: import("mongoose").SchemaDefinitionProperty<string, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    availableDate?: import("mongoose").SchemaDefinitionProperty<string, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    channels?: import("mongoose").SchemaDefinitionProperty<number, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    message?: import("mongoose").SchemaDefinitionProperty<string, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUsed?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastChecked?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    status?: import("mongoose").SchemaDefinitionProperty<"active" | "inactive", BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    inUse?: import("mongoose").SchemaDefinitionProperty<boolean, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    privacyUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    profilePicsUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    nameBioUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    profilePicsDeletedAt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    usernameUpdatedAt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    createdAt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    updatedAt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUpdateAttempt?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    failedUpdateAttempts?: import("mongoose").SchemaDefinitionProperty<number, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUpdateFailure?: import("mongoose").SchemaDefinitionProperty<Date, BufferClient, Document<unknown, {}, BufferClient, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<BufferClient & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, BufferClient>;
