import { Document } from 'mongoose';
export declare class Transaction extends Document {
    transactionId: string;
    amount: number;
    issue: string;
    refundMethod: string;
    transactionImageUrl: string;
    profile: string;
    chatId: string;
    ipAddress: string;
}
export declare const TransactionSchema: import("mongoose").Schema<Transaction, import("mongoose").Model<Transaction, any, any, any, Document<unknown, any, Transaction> & Transaction & Required<{
    _id: unknown;
}> & {
    __v?: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Transaction, Document<unknown, {}, import("mongoose").FlatRecord<Transaction>> & import("mongoose").FlatRecord<Transaction> & Required<{
    _id: unknown;
}> & {
    __v?: number;
}>;
