import { Document } from 'mongoose';
export type UserDataDocument = UserData & Document;
export declare class UserData {
    chatId: string;
    totalCount: number;
    picCount: number;
    lastMsgTimeStamp: number;
    limitTime: number;
    paidCount: number;
    prfCount: number;
    canReply: number;
    payAmount: number;
    username: string;
    accessHash: string;
    paidReply: boolean;
    demoGiven: boolean;
    secondShow: boolean;
    fullShow: number;
    profile: string;
    picSent: boolean;
    highestPayAmount: number;
    cheatCount: number;
    callTime: number;
    videos: number[];
    promotionChannels?: string[];
    attributionMethod?: string;
    attributedAt?: number;
}
export declare const UserDataSchema: import("mongoose").Schema<UserData, import("mongoose").Model<UserData, any, any, any, any, any, UserData>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, UserData, Document<unknown, {}, UserData, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    chatId?: import("mongoose").SchemaDefinitionProperty<string, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    totalCount?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    picCount?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastMsgTimeStamp?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    limitTime?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    paidCount?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    prfCount?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    canReply?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    payAmount?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    username?: import("mongoose").SchemaDefinitionProperty<string, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    accessHash?: import("mongoose").SchemaDefinitionProperty<string, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    paidReply?: import("mongoose").SchemaDefinitionProperty<boolean, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    demoGiven?: import("mongoose").SchemaDefinitionProperty<boolean, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    secondShow?: import("mongoose").SchemaDefinitionProperty<boolean, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    fullShow?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profile?: import("mongoose").SchemaDefinitionProperty<string, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    picSent?: import("mongoose").SchemaDefinitionProperty<boolean, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    highestPayAmount?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    cheatCount?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    callTime?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    videos?: import("mongoose").SchemaDefinitionProperty<number[], UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    promotionChannels?: import("mongoose").SchemaDefinitionProperty<string[], UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    attributionMethod?: import("mongoose").SchemaDefinitionProperty<string, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    attributedAt?: import("mongoose").SchemaDefinitionProperty<number, UserData, Document<unknown, {}, UserData, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<UserData & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, UserData>;
