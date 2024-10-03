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
    title: string;
    username: string;
    private: boolean;
    forbidden: boolean;
}
export declare const ChannelSchema: mongoose.Schema<Channel, mongoose.Model<Channel, any, any, any, Document<unknown, any, Channel> & Channel & {
    _id: mongoose.Types.ObjectId;
} & {
    __v?: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Channel, Document<unknown, {}, mongoose.FlatRecord<Channel>> & mongoose.FlatRecord<Channel> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v?: number;
}>;
