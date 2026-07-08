import { Document } from 'mongoose';
export type Stat2Document = Stat2 & Document;
export declare class Stat2 {
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
export declare const StatSchema: import("mongoose").Schema<Stat2, import("mongoose").Model<Stat2, any, any, any, any, any, Stat2>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Stat2, Document<unknown, {}, Stat2, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    chatId?: import("mongoose").SchemaDefinitionProperty<string, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    count?: import("mongoose").SchemaDefinitionProperty<number, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    payAmount?: import("mongoose").SchemaDefinitionProperty<number, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    demoGiven?: import("mongoose").SchemaDefinitionProperty<boolean, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    demoGivenToday?: import("mongoose").SchemaDefinitionProperty<boolean, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    newUser?: import("mongoose").SchemaDefinitionProperty<boolean, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    paidReply?: import("mongoose").SchemaDefinitionProperty<boolean, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    name?: import("mongoose").SchemaDefinitionProperty<string, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    secondShow?: import("mongoose").SchemaDefinitionProperty<boolean, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    didPay?: import("mongoose").SchemaDefinitionProperty<boolean, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    client?: import("mongoose").SchemaDefinitionProperty<string, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    profile?: import("mongoose").SchemaDefinitionProperty<string, Stat2, Document<unknown, {}, Stat2, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Stat2 & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, Stat2>;
