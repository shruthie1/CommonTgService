import { Document } from 'mongoose';
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
export declare const ActiveChannelSchema: import("mongoose").Schema<ActiveChannel, import("mongoose").Model<ActiveChannel, any, any, any, Document<unknown, any, ActiveChannel, any, {}> & ActiveChannel & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, ActiveChannel, Document<unknown, {}, import("mongoose").FlatRecord<ActiveChannel>, {}, import("mongoose").ResolveSchemaOptions<import("mongoose").DefaultSchemaOptions>> & import("mongoose").FlatRecord<ActiveChannel> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
