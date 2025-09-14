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
export declare const BotSchema: import("mongoose").Schema<Bot, import("mongoose").Model<Bot, any, any, any, Document<unknown, any, Bot, any> & Bot & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Bot, Document<unknown, {}, import("mongoose").FlatRecord<Bot>, {}> & import("mongoose").FlatRecord<Bot> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
