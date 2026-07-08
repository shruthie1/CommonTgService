import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
export type ChannelDocument = Channel & Document;
export declare class Channel {
    channelId: string;
    broadcast: boolean;
    canSendMsgs: boolean;
    participantsCount: number;
    restricted: boolean;
    sendMessages: boolean;
    sendPlain: boolean;
    title: string;
    username: string;
    private: boolean;
    forbidden: boolean;
    megagroup: boolean;
    reactRestricted: boolean;
    reactRestrictedAt: Date | null;
    wordRestriction: number;
    dMRestriction: number;
    availableMsgs: any[];
    banned: boolean;
    bannedAt?: number | null;
    starred: boolean;
    score: number;
}
export declare const ChannelSchema: mongoose.Schema<Channel, mongoose.Model<Channel, any, any, any, any, any, Channel>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Channel, Document<unknown, {}, Channel, {
    id: string;
}, mongoose.DefaultSchemaOptions> & Omit<Channel & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, "id"> & mongoose.HydratedDocumentOverrides<{
    id: string;
}>, {
    channelId?: mongoose.SchemaDefinitionProperty<string, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    broadcast?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    canSendMsgs?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    participantsCount?: mongoose.SchemaDefinitionProperty<number, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    restricted?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    sendMessages?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    sendPlain?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    title?: mongoose.SchemaDefinitionProperty<string, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    username?: mongoose.SchemaDefinitionProperty<string, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    private?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    forbidden?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    megagroup?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    reactRestricted?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    reactRestrictedAt?: mongoose.SchemaDefinitionProperty<Date, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    wordRestriction?: mongoose.SchemaDefinitionProperty<number, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    dMRestriction?: mongoose.SchemaDefinitionProperty<number, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    availableMsgs?: mongoose.SchemaDefinitionProperty<any[], Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    banned?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    bannedAt?: mongoose.SchemaDefinitionProperty<number, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    starred?: mongoose.SchemaDefinitionProperty<boolean, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
    score?: mongoose.SchemaDefinitionProperty<number, Channel, Document<unknown, {}, Channel, {
        id: string;
    }, mongoose.DefaultSchemaOptions> & Omit<Channel & {
        _id: mongoose.Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & mongoose.HydratedDocumentOverrides<{
        id: string;
    }>>;
}, Channel>;
