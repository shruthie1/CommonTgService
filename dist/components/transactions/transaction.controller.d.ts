import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionService } from './transaction.service';
import { Transaction } from './schemas/transaction.schema';
export declare class TransactionController {
    private readonly transactionService;
    constructor(transactionService: TransactionService);
    create(createTransactionDto: CreateTransactionDto): Promise<Transaction>;
    findOne(id: string): Promise<Transaction>;
    findAll(transactionId?: string, amount?: number, issue?: string, refundMethod?: string, profile?: string, chatId?: string, ip?: string, status?: string, limit?: number, offset?: number): Promise<{
        transactions: Transaction[];
        total: number;
    }>;
    update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<Transaction>;
    delete(id: string): Promise<Transaction>;
}
