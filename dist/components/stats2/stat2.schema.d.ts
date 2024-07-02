import { Document } from 'mongoose';
export type Stat2Document = Stat2 & Document;
export declare class Stat2 {
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
export declare const StatSchema: import("mongoose").Schema<Stat2, import("mongoose").Model<Stat2, any, any, any, Document<unknown, any, Stat2> & Stat2 & {
    _id: import("mongoose").Types.ObjectId;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Stat2, Document<unknown, {}, import("mongoose").FlatRecord<Stat2>> & import("mongoose").FlatRecord<Stat2> & {
    _id: import("mongoose").Types.ObjectId;
}>;
