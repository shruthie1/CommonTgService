import { Document } from 'mongoose';
export type PromoteStatDocument = PromoteStat & Document;
export declare class PromoteStat {
    client: string;
    data: Map<string, number>;
    totalCount: number;
    uniqueChannels: number;
    releaseDay: number;
    isActive: boolean;
    lastUpdatedTimeStamp: number;
    channels: string[];
}
export declare const PromoteStatSchema: import("mongoose").Schema<PromoteStat, import("mongoose").Model<PromoteStat, any, any, any, (Document<unknown, any, PromoteStat, any, import("mongoose").DefaultSchemaOptions> & PromoteStat & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, PromoteStat, any, import("mongoose").DefaultSchemaOptions> & PromoteStat & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, PromoteStat>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PromoteStat, Document<unknown, {}, PromoteStat, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    client?: import("mongoose").SchemaDefinitionProperty<string, PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    data?: import("mongoose").SchemaDefinitionProperty<Map<string, number>, PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    totalCount?: import("mongoose").SchemaDefinitionProperty<number, PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    uniqueChannels?: import("mongoose").SchemaDefinitionProperty<number, PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    releaseDay?: import("mongoose").SchemaDefinitionProperty<number, PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    isActive?: import("mongoose").SchemaDefinitionProperty<boolean, PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUpdatedTimeStamp?: import("mongoose").SchemaDefinitionProperty<number, PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    channels?: import("mongoose").SchemaDefinitionProperty<string[], PromoteStat, Document<unknown, {}, PromoteStat, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<PromoteStat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, PromoteStat>;
