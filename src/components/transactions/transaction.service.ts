import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    this.logger.log(`Creating new transaction: ${JSON.stringify(createTransactionDto)}`);
    try {
      // Check if transaction with same ID already exists
      const existingTransaction = await this.transactionModel
        .findOne({ transactionId: createTransactionDto.transactionId })
        .exec();

      if (existingTransaction) {
        throw new BadRequestException('Transaction with this ID already exists');
      }

      const newTransaction = new this.transactionModel(createTransactionDto);
      const savedTransaction = await newTransaction.save();
      this.logger.log(`Transaction created successfully: ${savedTransaction.transactionId}`);
      return savedTransaction;
    } catch (error) {
      this.logger.error(`Error creating transaction: ${error.message}`, error.stack);
      throw error instanceof BadRequestException ? error : new BadRequestException('Failed to create transaction');
    }
  }

  async findOne(id: string): Promise<Transaction> {
    this.logger.debug(`Finding transaction by ID: ${id}`);
    try {
      const transaction = await this.transactionModel.findById(id).exec();
      if (!transaction) {
        this.logger.warn(`Transaction not found with ID: ${id}`);
        throw new NotFoundException('Transaction not found');
      }
      return transaction;
    } catch (error) {
      this.logger.error(`Error finding transaction: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Invalid transaction ID format');
    }
  }

  async findAll(
    filters: {
      transactionId?: string;
      amount?: number;
      issue?: string;
      refundMethod?: string;
      profile?: string;
      chatId?: string;
      status?: string;
      ip?: string;
    },
    limit = 10,
    offset = 0,
  ): Promise<{ transactions: Transaction[]; total: number }> {
    this.logger.debug(`Finding transactions with filters: ${JSON.stringify(filters)}`);
    try {
      const orConditions = [];

      if (filters.transactionId) {
        orConditions.push({ transactionId: filters.transactionId.toLowerCase() });
      }
      if (filters.amount) {
        orConditions.push({ amount: filters.amount });
      }
      if (filters.issue) {
        orConditions.push({ issue: filters.issue });
      }
      if (filters.refundMethod) {
        orConditions.push({ refundMethod: filters.refundMethod });
      }
      if (filters.profile) {
        orConditions.push({ profile: filters.profile });
      }
      if (filters.chatId) {
        orConditions.push({ chatId: filters.chatId });
      }
      if (filters.status) {
        orConditions.push({ status: filters.status });
      }
      if (filters.ip) {
        orConditions.push({ ip: filters.ip });
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
      await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=${encodeURIComponent(`Found ${total} transactions matching ip: ${filters.ip}\nchatId: ${filters.chatId}\ntransactionId: ${filters.transactionId}\nprofile: ${filters.profile}`)}`);
      return { transactions, total };
    } catch (error) {
      this.logger.error(`Error finding transactions: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to fetch transactions');
    }
  }

  async update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<Transaction> {
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
        throw new NotFoundException('Transaction not found');
      }

      this.logger.log(`Transaction ${id} updated successfully`);
      return updatedTransaction;
    } catch (error) {
      this.logger.error(`Error updating transaction: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Failed to update transaction');
    }
  }

  async delete(id: string): Promise<Transaction> {
    this.logger.debug(`Deleting transaction: ${id}`);
    try {
      const deletedTransaction = await this.transactionModel.findByIdAndDelete(id).exec();
      if (!deletedTransaction) {
        this.logger.warn(`Transaction not found for deletion with ID: ${id}`);
        throw new NotFoundException('Transaction not found');
      }
      this.logger.log(`Transaction ${id} deleted successfully`);
      return deletedTransaction;
    } catch (error) {
      this.logger.error(`Error deleting transaction: ${error.message}`, error.stack);
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Failed to delete transaction');
    }
  }
}
