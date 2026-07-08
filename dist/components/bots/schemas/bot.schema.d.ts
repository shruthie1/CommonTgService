import { Document } from 'mongoose';
import { ChannelCategory } from '../channel-category.enum';
export type BotDocument = Bot & Document;
export declare class Bot {
    token: string;
    username: string;
    category: ChannelCategory;
    channelId: string;
    description?: string;
    lastUsed: Date;
    status: 'active' | 'inactive';
    deadReason?: string;
    deadAt?: Date;
    lastValidatedAt?: Date;
    createdByMobile?: string;
    replacedBotUsername?: string;
    stats: {
        messagesSent: number;
        photosSent: number;
        videosSent: number;
        documentsSent: number;
        audiosSent: number;
        voicesSent: number;
        animationsSent: number;
        stickersSent: number;
        mediaGroupsSent: number;
    };
}
export declare const BotSchema: import("mongoose").Schema<Bot, import("mongoose").Model<Bot, any, any, any, any, any, Bot>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Bot, Document<unknown, {}, Bot, {
    id: string;
}, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & import("mongoose").HydratedDocumentOverrides<{
    id: string;
}>, {
    token?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    username?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    category?: import("mongoose").SchemaDefinitionProperty<ChannelCategory, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    channelId?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    description?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastUsed?: import("mongoose").SchemaDefinitionProperty<Date, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    status?: import("mongoose").SchemaDefinitionProperty<"active" | "inactive", Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    deadReason?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    deadAt?: import("mongoose").SchemaDefinitionProperty<Date, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    lastValidatedAt?: import("mongoose").SchemaDefinitionProperty<Date, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    createdByMobile?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    replacedBotUsername?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
    stats?: import("mongoose").SchemaDefinitionProperty<{
        messagesSent: number;
        photosSent: number;
        videosSent: number;
        documentsSent: number;
        audiosSent: number;
        voicesSent: number;
        animationsSent: number;
        stickersSent: number;
        mediaGroupsSent: number;
    }, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").DefaultSchemaOptions> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & import("mongoose").HydratedDocumentOverrides<{
        id: string;
    }>>;
}, Bot>;
