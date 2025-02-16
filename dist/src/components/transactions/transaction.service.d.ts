import { Model } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction } from './schemas/transaction.schema';
export declare class TransactionService {
    private readonly transactionModel;
    constructor(transactionModel: Model<Transaction>);
    create(createTransactionDto: CreateTransactionDto): Promise<Transaction>;
    findOne(id: string): Promise<Transaction>;
    findAll(search?: string, limit?: number, offset?: number): Promise<{
        transactions: Transaction[];
        total: number;
    }>;
    update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<Transaction>;
    delete(id: string): Promise<Transaction>;
}
