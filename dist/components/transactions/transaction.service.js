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
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
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
            let query = {};
            let transactions = [];
            let total = 0;
            if (filters.transactionId) {
                const transactionIdQuery = {
                    $or: [
                        { transactionId: filters.transactionId.toLowerCase() }
                    ]
                };
                if ((0, mongoose_2.isValidObjectId)(filters.transactionId)) {
                    transactionIdQuery.$or.push({ _id: filters.transactionId });
                }
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(transactionIdQuery)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(transactionIdQuery).exec(),
                ]);
                if (total > 0) {
                    this.logger.debug(`Found ${total} transactions matching transactionId: ${filters.transactionId}`);
                    await this.sendNotification(filters, total);
                    return { transactions, total };
                }
            }
            if (filters.ip) {
                query = { ip: filters.ip };
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(query)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(query).exec(),
                ]);
                if (total > 0) {
                    this.logger.debug(`Found ${total} transactions matching ip: ${filters.ip}`);
                    await this.sendNotification(filters, total);
                    return { transactions, total };
                }
            }
            if (filters.chatId) {
                query = { chatId: filters.chatId };
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(query)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(query).exec(),
                ]);
                if (total > 0) {
                    this.logger.debug(`Found ${total} transactions matching chatId: ${filters.chatId}`);
                    await this.sendNotification(filters, total);
                    return { transactions, total };
                }
            }
            const remainingFilters = {};
            if (filters.profile)
                remainingFilters['profile'] = filters.profile;
            if (filters.amount)
                remainingFilters['amount'] = filters.amount;
            if (filters.issue)
                remainingFilters['issue'] = filters.issue;
            if (filters.refundMethod)
                remainingFilters['refundMethod'] = filters.refundMethod;
            if (filters.status)
                remainingFilters['status'] = filters.status;
            if (Object.keys(remainingFilters).length > 0) {
                query = remainingFilters;
                [transactions, total] = await Promise.all([
                    this.transactionModel
                        .find(query)
                        .sort({ createdAt: -1 })
                        .skip(offset)
                        .limit(limit)
                        .exec(),
                    this.transactionModel.countDocuments(query).exec(),
                ]);
            }
            this.logger.debug(`Found ${total} transactions matching remaining filters`);
            await this.sendNotification(filters, total);
            return { transactions, total };
        }
        catch (error) {
            this.logger.error(`Error finding transactions: ${error.message}`, error.stack);
            throw new common_1.BadRequestException('Failed to fetch transactions');
        }
    }
    async sendNotification(filters, total) {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)(process.env.accountsChannel)}&text=${encodeURIComponent(`Found ${total} transactions matching ip: ${filters.ip || 'N/A'}\nchatId: ${filters.chatId || 'N/A'}\ntransactionId: ${filters.transactionId || 'N/A'}\nprofile: ${filters.profile || 'N/A'}`)}`);
        }
        catch (error) {
            this.logger.error(`Failed to send notification: ${error.message}`);
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