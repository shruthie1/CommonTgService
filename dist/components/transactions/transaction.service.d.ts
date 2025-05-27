import { Model } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
export declare class TransactionService {
    private readonly transactionModel;
    private readonly logger;
    constructor(transactionModel: Model<TransactionDocument>);
    create(createTransactionDto: CreateTransactionDto): Promise<Transaction>;
    findOne(id: string): Promise<Transaction>;
    findAll(filters: {
        transactionId?: string;
        amount?: number;
        issue?: string;
        refundMethod?: string;
        profile?: string;
        chatId?: string;
        status?: string;
        ip?: string;
    }, limit?: number, offset?: number): Promise<{
        transactions: Transaction[];
        total: number;
    }>;
    private sendNotification;
    update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<Transaction>;
    delete(id: string): Promise<Transaction>;
}
