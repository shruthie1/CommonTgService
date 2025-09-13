import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { Logger } from '../../utils';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
  ) { }

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
      let query = {};
      let transactions: Transaction[] = [];
      let total = 0;

      // Check each condition sequentially, only moving to the next if no results are found
      if (filters.transactionId) {
        // First check transactionId
        const transactionIdQuery: any = { 
          $or: [
            { transactionId: filters.transactionId.toLowerCase() }
          ] 
        };
        
        // Only attempt to query by _id if the ID is a valid MongoDB ObjectId
        if (isValidObjectId(filters.transactionId)) {
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
        // Then check IP if no transaction ID match
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
        // Then check chatId if no IP match
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
      
      // Finally, check remaining filters
      const remainingFilters = {};
      
      if (filters.profile) remainingFilters['profile'] = filters.profile;
      if (filters.amount) remainingFilters['amount'] = filters.amount;
      if (filters.issue) remainingFilters['issue'] = filters.issue;
      if (filters.refundMethod) remainingFilters['refundMethod'] = filters.refundMethod;
      if (filters.status) remainingFilters['status'] = filters.status;
      
      // Only proceed if at least one remaining filter exists
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
    } catch (error) {
      this.logger.error(`Error finding transactions: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to fetch transactions');
    }
  }

  // Helper method to send notification
  private async sendNotification(filters: any, total: number): Promise<void> {
    try {
      await fetchWithTimeout(`${notifbot(process.env.accountsChannel)}&text=${encodeURIComponent(`Found ${total} transactions matching ip: ${filters.ip || 'N/A'}\nchatId: ${filters.chatId || 'N/A'}\ntransactionId: ${filters.transactionId || 'N/A'}\nprofile: ${filters.profile || 'N/A'}`)}`);
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error.message}`);
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
