import { Document } from 'mongoose';
export type StatDocument = Stat & Document;
export declare class Stat {
    chatId: string;
    count: number;
    payAmount: number;
    demoGiven: boolean;
    demoGivenToday: boolean;
    newUser: boolean;
    paidReply: boolean;
    name: string;
    secondShow: boolean;
    didPay: boolean | null;
    client: string;
    profile: string;
}
export declare const StatSchema: import("mongoose").Schema<Stat, import("mongoose").Model<Stat, any, any, any, Document<unknown, any, Stat> & Stat & {
    _id: import("mongoose").Types.ObjectId;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Stat, Document<unknown, {}, import("mongoose").FlatRecord<Stat>> & import("mongoose").FlatRecord<Stat> & {
    _id: import("mongoose").Types.ObjectId;
}>;
