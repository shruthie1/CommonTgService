import { Document } from 'mongoose';
export type UserDataDocument = UserData & Document;
export declare class UserData {
    chatId: string;
    totalCount: number;
    picCount: number;
    lastMsgTimeStamp: number;
    limitTime: number;
    paidCount: number;
    prfCount: number;
    canReply: number;
    payAmount: number;
    username: string;
    accessHash: string;
    paidReply: boolean;
    demoGiven: boolean;
    secondShow: boolean;
    profile: string;
}
export declare const UserDataSchema: import("mongoose").Schema<UserData, import("mongoose").Model<UserData, any, any, any, Document<unknown, any, UserData> & UserData & {
    _id: import("mongoose").Types.ObjectId;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, UserData, Document<unknown, {}, import("mongoose").FlatRecord<UserData>> & import("mongoose").FlatRecord<UserData> & {
    _id: import("mongoose").Types.ObjectId;
}>;
