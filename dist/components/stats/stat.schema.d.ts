import { Document } from 'mongoose';
export type StatDocument = Stat & Document;
export declare class Stat {
    chatId: string;
    count: number;
    payAmount: number;
    demoGiven: boolean;
    demoGivenToday: boolean;
    newUser: boolean;
    paidReply: boolean;
    name: string;
    secondShow: boolean;
    didPay: boolean | null;
    client: string;
    profile: string;
}
export declare const StatSchema: import("mongoose").Schema<Stat, import("mongoose").Model<Stat, any, any, any, any, any, Stat>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Stat, Document<unknown, {}, Stat, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    chatId?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    count?: import("mongoose").SchemaDefinitionProperty<number, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    payAmount?: import("mongoose").SchemaDefinitionProperty<number, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    demoGiven?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    demoGivenToday?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    newUser?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    paidReply?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    name?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    secondShow?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    didPay?: import("mongoose").SchemaDefinitionProperty<boolean, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    client?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profile?: import("mongoose").SchemaDefinitionProperty<string, Stat, Document<unknown, {}, Stat, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, Stat>;
