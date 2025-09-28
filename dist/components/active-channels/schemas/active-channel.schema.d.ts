import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
export type ActiveChannelDocument = ActiveChannel & Document;
export declare class ActiveChannel {
    channelId: string;
    title: string;
    participantsCount: number;
    username: string;
    restricted: boolean;
    broadcast: boolean;
    sendMessages: boolean;
    canSendMsgs: boolean;
    megagroup?: boolean;
    wordRestriction?: number;
    dMRestriction?: number;
    availableMsgs?: string[];
    banned?: boolean;
    forbidden?: boolean;
    reactRestricted?: boolean;
    private?: boolean;
    lastMessageTime?: number;
    messageIndex?: number;
    messageId?: number;
    tempBan?: boolean;
    deletedCount?: number;
}
export declare const ActiveChannelSchema: mongoose.Schema<ActiveChannel, mongoose.Model<ActiveChannel, any, any, any, Document<unknown, any, ActiveChannel, any, {}> & ActiveChannel & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, ActiveChannel, Document<unknown, {}, mongoose.FlatRecord<ActiveChannel>, {}, mongoose.ResolveSchemaOptions<mongoose.DefaultSchemaOptions>> & mongoose.FlatRecord<ActiveChannel> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
