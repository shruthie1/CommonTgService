import { Document, Schema as MongooseSchema } from 'mongoose';
import { TransactionStatus } from '../dto/create-transaction.dto';
export type TransactionDocument = Transaction & Document;
export declare class Transaction {
    transactionId: string;
    amount: number;
    issue: string;
    description: string;
    refundMethod: string;
    profile: string;
    chatId: string;
    ip: string;
    status: TransactionStatus;
    createdAt?: Date;
    updatedAt?: Date;
}
export declare const TransactionSchema: MongooseSchema<Transaction, import("mongoose").Model<Transaction, any, any, any, Document<unknown, any, Transaction, any> & Transaction & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Transaction, Document<unknown, {}, import("mongoose").FlatRecord<Transaction>, {}> & import("mongoose").FlatRecord<Transaction> & {
    _id: import("mongoose").Types.ObjectId;
} & {
    __v: number;
}>;
