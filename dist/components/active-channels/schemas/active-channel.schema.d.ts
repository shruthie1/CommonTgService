import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
export type ActiveChannelDocument = ActiveChannel & Document;
export declare class ActiveChannel {
    channelId: string;
    broadcast: boolean;
    canSendMsgs: boolean;
    participantsCount: number;
    restricted: boolean;
    sendMessages: boolean;
    title: string;
    username: string;
    wordRestriction: number;
    dMRestriction: number;
    availableMsgs: string[];
    reactions: string[];
    banned: boolean;
    megagroup: boolean;
    private: boolean;
    reactRestricted: boolean;
    forbidden: boolean;
}
export declare const ActiveChannelSchema: mongoose.Schema<ActiveChannel, mongoose.Model<ActiveChannel, any, any, any, Document<unknown, any, ActiveChannel> & ActiveChannel & {
    _id: mongoose.Types.ObjectId;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, ActiveChannel, Document<unknown, {}, mongoose.FlatRecord<ActiveChannel>> & mongoose.FlatRecord<ActiveChannel> & {
    _id: mongoose.Types.ObjectId;
}>;
