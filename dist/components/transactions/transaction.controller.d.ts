import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionService } from './transaction.service';
export declare class TransactionController {
    private readonly transactionService;
    constructor(transactionService: TransactionService);
    create(createTransactionDto: CreateTransactionDto): Promise<import("./schemas/transaction.schema").Transaction>;
}
