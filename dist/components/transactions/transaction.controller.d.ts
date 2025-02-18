import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionService } from './transaction.service';
export declare class TransactionController {
    private readonly transactionService;
    constructor(transactionService: TransactionService);
    create(createTransactionDto: CreateTransactionDto): Promise<import("src/components/transactions/schemas/transaction.schema").Transaction>;
    findOne(id: string): Promise<import("src/components/transactions/schemas/transaction.schema").Transaction>;
    findAll(search?: string, limit?: number, offset?: number): Promise<{
        transactions: import("src/components/transactions/schemas/transaction.schema").Transaction[];
        total: number;
    }>;
    update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<import("src/components/transactions/schemas/transaction.schema").Transaction>;
    delete(id: string): Promise<import("src/components/transactions/schemas/transaction.schema").Transaction>;
}
