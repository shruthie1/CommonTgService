"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TransactionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const transaction_schema_1 = require("./schemas/transaction.schema");
let TransactionService = TransactionService_1 = class TransactionService {
    constructor(transactionModel) {
        this.transactionModel = transactionModel;
        this.logger = new common_1.Logger(TransactionService_1.name);
    }
    async create(createTransactionDto) {
        this.logger.log(`Creating new transaction: ${JSON.stringify(createTransactionDto)}`);
        try {
            const existingTransaction = await this.transactionModel
                .findOne({ transactionId: createTransactionDto.transactionId })
                .exec();
            if (existingTransaction) {
                throw new common_1.BadRequestException('Transaction with this ID already exists');
            }
            const newTransaction = new this.transactionModel(createTransactionDto);
            const savedTransaction = await newTransaction.save();
            this.logger.log(`Transaction created successfully: ${savedTransaction.transactionId}`);
            return savedTransaction;
        }
        catch (error) {
            this.logger.error(`Error creating transaction: ${error.message}`, error.stack);
            throw error instanceof common_1.BadRequestException ? error : new common_1.BadRequestException('Failed to create transaction');
        }
    }
    async findOne(id) {
        this.logger.debug(`Finding transaction by ID: ${id}`);
        try {
            const transaction = await this.transactionModel.findById(id).exec();
            if (!transaction) {
                this.logger.warn(`Transaction not found with ID: ${id}`);
                throw new common_1.NotFoundException('Transaction not found');
            }
            return transaction;
        }
        catch (error) {
            this.logger.error(`Error finding transaction: ${error.message}`, error.stack);
            if (error instanceof common_1.NotFoundException)
                throw error;
            throw new common_1.BadRequestException('Invalid transaction ID format');
        }
    }
    async findAll(filters, limit = 10, offset = 0) {
        this.logger.debug(`Finding transactions with filters: ${JSON.stringify(filters)}`);
        try {
            const orConditions = [];
            if (filters.transactionId) {
                orConditions.push({ transactionId: { $regex: filters.transactionId, $options: 'i' } });
            }
            if (filters.amount) {
                orConditions.push({ amount: filters.amount });
            }
            if (filters.issue) {
                orConditions.push({ issue: { $regex: filters.issue, $options: 'i' } });
            }
            if (filters.refundMethod) {
                orConditions.push({ refundMethod: { $regex: filters.refundMethod, $options: 'i' } });
            }
            if (filters.profile) {
                orConditions.push({ profile: { $regex: filters.profile, $options: 'i' } });
            }
            if (filters.chatId) {
                orConditions.push({ chatId: { $regex: filters.chatId, $options: 'i' } });
            }
            if (filters.status) {
                orConditions.push({ status: { $regex: filters.status, $options: 'i' } });
            }
            if (filters.ip) {
                orConditions.push({ ip: { $regex: filters.ip, $options: 'i' } });
            }
            const query = orConditions.length > 0 ? { $or: orConditions } : {};
            const [transactions, total] = await Promise.all([
                this.transactionModel
                    .find(query)
                    .sort({ createdAt: -1 })
                    .skip(offset)
                    .limit(limit)
                    .exec(),
                this.transactionModel.countDocuments(query).exec(),
            ]);
            this.logger.debug(`Found ${total} transactions matching filters`);
            return { transactions, total };
        }
        catch (error) {
            this.logger.error(`Error finding transactions: ${error.message}`, error.stack);
            throw new common_1.BadRequestException('Failed to fetch transactions');
        }
    }
    async update(id, updateTransactionDto) {
        this.logger.debug(`Updating transaction ${id} with data: ${JSON.stringify(updateTransactionDto)}`);
        try {
            const updatedTransaction = await this.transactionModel
                .findByIdAndUpdate(id, updateTransactionDto, {
                new: true,
                runValidators: true
            })
                .exec();
            if (!updatedTransaction) {
                this.logger.warn(`Transaction not found for update with ID: ${id}`);
                throw new common_1.NotFoundException('Transaction not found');
            }
            this.logger.log(`Transaction ${id} updated successfully`);
            return updatedTransaction;
        }
        catch (error) {
            this.logger.error(`Error updating transaction: ${error.message}`, error.stack);
            if (error instanceof common_1.NotFoundException)
                throw error;
            throw new common_1.BadRequestException('Failed to update transaction');
        }
    }
    async delete(id) {
        this.logger.debug(`Deleting transaction: ${id}`);
        try {
            const deletedTransaction = await this.transactionModel.findByIdAndDelete(id).exec();
            if (!deletedTransaction) {
                this.logger.warn(`Transaction not found for deletion with ID: ${id}`);
                throw new common_1.NotFoundException('Transaction not found');
            }
            this.logger.log(`Transaction ${id} deleted successfully`);
            return deletedTransaction;
        }
        catch (error) {
            this.logger.error(`Error deleting transaction: ${error.message}`, error.stack);
            if (error instanceof common_1.NotFoundException)
                throw error;
            throw new common_1.BadRequestException('Failed to delete transaction');
        }
    }
};
exports.TransactionService = TransactionService;
exports.TransactionService = TransactionService = TransactionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(transaction_schema_1.Transaction.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], TransactionService);
//# sourceMappingURL=transaction.service.js.map