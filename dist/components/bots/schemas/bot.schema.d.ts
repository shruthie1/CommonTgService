import { Document } from 'mongoose';
import { ChannelCategory } from '../bots.service';
export type BotDocument = Bot & Document;
export declare class Bot {
    token: string;
    username: string;
    category: ChannelCategory;
    channelId: string;
    description?: string;
    lastUsed: Date;
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
export declare const BotSchema: import("mongoose").Schema<Bot, import("mongoose").Model<Bot, any, any, any, (Document<unknown, any, Bot, any, import("mongoose").DefaultSchemaOptions> & Bot & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
} & {
    id: string;
}) | (Document<unknown, any, Bot, any, import("mongoose").DefaultSchemaOptions> & Bot & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}), any, Bot>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Bot, Document<unknown, {}, Bot, {
    id: string;
}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, "id"> & {
    id: string;
}, {
    token?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    username?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    category?: import("mongoose").SchemaDefinitionProperty<ChannelCategory, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    channelId?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    description?: import("mongoose").SchemaDefinitionProperty<string, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
    lastUsed?: import("mongoose").SchemaDefinitionProperty<Date, Bot, Document<unknown, {}, Bot, {
        id: string;
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
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
    }, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & Omit<Bot & {
        _id: import("mongoose").Types.ObjectId;
    } & {
        __v: number;
    }, "id"> & {
        id: string;
    }>;
}, Bot>;
