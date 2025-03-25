/// <reference types="mongoose/types/aggregate" />
/// <reference types="mongoose/types/callback" />
/// <reference types="mongoose/types/collection" />
/// <reference types="mongoose/types/connection" />
/// <reference types="mongoose/types/cursor" />
/// <reference types="mongoose/types/document" />
/// <reference types="mongoose/types/error" />
/// <reference types="mongoose/types/expressions" />
/// <reference types="mongoose/types/helpers" />
/// <reference types="mongoose/types/middlewares" />
/// <reference types="mongoose/types/indexes" />
/// <reference types="mongoose/types/models" />
/// <reference types="mongoose/types/mongooseoptions" />
/// <reference types="mongoose/types/pipelinestage" />
/// <reference types="mongoose/types/populate" />
/// <reference types="mongoose/types/query" />
/// <reference types="mongoose/types/schemaoptions" />
/// <reference types="mongoose/types/schematypes" />
/// <reference types="mongoose/types/session" />
/// <reference types="mongoose/types/types" />
/// <reference types="mongoose/types/utility" />
/// <reference types="mongoose/types/validation" />
/// <reference types="mongoose/types/virtuals" />
/// <reference types="mongoose/types/inferschematype" />
/// <reference types="mongoose/types/inferrawdoctype" />
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
    }, limit?: number, offset?: number): Promise<{
        transactions: Transaction[];
        total: number;
    }>;
    update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<Transaction>;
    delete(id: string): Promise<Transaction>;
}
