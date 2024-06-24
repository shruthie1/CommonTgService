import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
export type ActiveChannelDocument = ActiveChannel & Document;
export declare class ActiveChannel extends Document {
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
    reactRestricted: boolean;
}
export declare const ActiveChannelSchema: mongoose.Schema<ActiveChannel, mongoose.Model<ActiveChannel, any, any, any, Document<unknown, any, ActiveChannel> & ActiveChannel & Required<{
    _id: unknown;
}>, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, ActiveChannel, Document<unknown, {}, mongoose.FlatRecord<ActiveChannel>> & mongoose.FlatRecord<ActiveChannel> & Required<{
    _id: unknown;
}>>;
