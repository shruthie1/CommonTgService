import mongoose, { Document } from 'mongoose';
export type TransactionDocument = Transaction & Document;
export declare class Transaction {
    clientId: string;
    amount: number;
    status: string;
    timestamp: number;
    type: string;
    metadata: any;
    paymentId?: string;
    orderId?: string;
    signature?: string;
    currency?: string;
}
export declare const TransactionSchema: mongoose.Schema<Transaction, mongoose.Model<Transaction, any, any, any, mongoose.Document<unknown, any, Transaction, any> & Transaction & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}, any>, {}, {}, {}, {}, mongoose.DefaultSchemaOptions, Transaction, mongoose.Document<unknown, {}, mongoose.FlatRecord<Transaction>, {}> & mongoose.FlatRecord<Transaction> & {
    _id: mongoose.Types.ObjectId;
} & {
    __v: number;
}>;
