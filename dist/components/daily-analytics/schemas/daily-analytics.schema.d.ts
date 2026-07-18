import { HydratedDocument } from 'mongoose';
export declare class PromoteStatDaily {
    date: string;
    namespace?: string;
    clientId: string;
    mobile?: string;
    profile?: string;
    sent?: number;
    success?: number;
    failed?: number;
    banned?: number;
    expireAt?: Date;
}
export type PromoteStatDailyDocument = HydratedDocument<PromoteStatDaily>;
export declare const PromoteStatDailySchema: import("mongoose").Schema<PromoteStatDaily, import("mongoose").Model<PromoteStatDaily, any, any, any, any, any, PromoteStatDaily>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    date?: import("mongoose").SchemaDefinitionProperty<string, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    namespace?: import("mongoose").SchemaDefinitionProperty<string, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    mobile?: import("mongoose").SchemaDefinitionProperty<string, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profile?: import("mongoose").SchemaDefinitionProperty<string, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    sent?: import("mongoose").SchemaDefinitionProperty<number, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    success?: import("mongoose").SchemaDefinitionProperty<number, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    failed?: import("mongoose").SchemaDefinitionProperty<number, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    banned?: import("mongoose").SchemaDefinitionProperty<number, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    expireAt?: import("mongoose").SchemaDefinitionProperty<Date, PromoteStatDaily, import("mongoose").Document<unknown, {}, PromoteStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<PromoteStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, PromoteStatDaily>;
export declare class ReactionStatDaily {
    date: string;
    namespace?: string;
    clientId: string;
    mobile?: string;
    profile?: string;
    success?: number;
    failed?: number;
    restricted?: number;
    floods?: number;
    expireAt?: Date;
}
export type ReactionStatDailyDocument = HydratedDocument<ReactionStatDaily>;
export declare const ReactionStatDailySchema: import("mongoose").Schema<ReactionStatDaily, import("mongoose").Model<ReactionStatDaily, any, any, any, any, any, ReactionStatDaily>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    date?: import("mongoose").SchemaDefinitionProperty<string, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    namespace?: import("mongoose").SchemaDefinitionProperty<string, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    mobile?: import("mongoose").SchemaDefinitionProperty<string, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profile?: import("mongoose").SchemaDefinitionProperty<string, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    success?: import("mongoose").SchemaDefinitionProperty<number, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    failed?: import("mongoose").SchemaDefinitionProperty<number, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    restricted?: import("mongoose").SchemaDefinitionProperty<number, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    floods?: import("mongoose").SchemaDefinitionProperty<number, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    expireAt?: import("mongoose").SchemaDefinitionProperty<Date, ReactionStatDaily, import("mongoose").Document<unknown, {}, ReactionStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<ReactionStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, ReactionStatDaily>;
export declare class UserStatDaily {
    date: string;
    namespace?: string;
    clientId: string;
    mobile?: string;
    profile?: string;
    newUsers?: number;
    active?: number;
    paid?: number;
    revenue?: number;
    expireAt?: Date;
}
export type UserStatDailyDocument = HydratedDocument<UserStatDaily>;
export declare const UserStatDailySchema: import("mongoose").Schema<UserStatDaily, import("mongoose").Model<UserStatDaily, any, any, any, any, any, UserStatDaily>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    date?: import("mongoose").SchemaDefinitionProperty<string, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    namespace?: import("mongoose").SchemaDefinitionProperty<string, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    clientId?: import("mongoose").SchemaDefinitionProperty<string, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    mobile?: import("mongoose").SchemaDefinitionProperty<string, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profile?: import("mongoose").SchemaDefinitionProperty<string, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    newUsers?: import("mongoose").SchemaDefinitionProperty<number, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    active?: import("mongoose").SchemaDefinitionProperty<number, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    paid?: import("mongoose").SchemaDefinitionProperty<number, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    revenue?: import("mongoose").SchemaDefinitionProperty<number, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    expireAt?: import("mongoose").SchemaDefinitionProperty<Date, UserStatDaily, import("mongoose").Document<unknown, {}, UserStatDaily, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserStatDaily & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, UserStatDaily>;
