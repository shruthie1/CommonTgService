import { Model } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { Transaction } from './schemas/transaction.schema';
export declare class TransactionService {
    private transactionModel;
    constructor(transactionModel: Model<Transaction>);
    create(createTransactionDto: CreateTransactionDto): Promise<Transaction>;
    private formatMessage;
    private sendToTelegram;
}
