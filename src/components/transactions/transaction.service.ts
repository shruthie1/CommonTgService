import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { Transaction, TransactionDocument } from './schemas/transaction.schema';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    this.logger.debug('Creating new transaction with data:', createTransactionDto);

    try {
      const newTransaction = new this.transactionModel(createTransactionDto);
      this.logger.debug('Transaction model created:', newTransaction.toObject());

      const savedTransaction = await newTransaction.save();
      this.logger.debug('Transaction saved successfully:', savedTransaction.toObject());

      return savedTransaction;
    } catch (error) {
      this.logger.error('Error saving transaction:', error);
      this.logger.error('Transaction data that failed:', createTransactionDto);
      throw error;
    }
  }

  async findOne(id: string): Promise<Transaction> {
    const transaction = await this.transactionModel.findById(id).exec();
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async findAll(
    search?: string,
    limit = 10,
    offset = 0,
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const query = search
      ? {
        $or: [
          { transactionId: { $regex: search, $options: 'i' } },
          { issue: { $regex: search, $options: 'i' } },
          { profile: { $regex: search, $options: 'i' } },
          { chatId: { $regex: search, $options: 'i' } },
        ],
      }
      : {};

    const transactions = await this.transactionModel
      .find(query)
      .skip(offset)
      .limit(limit)
      .exec();
    const total = await this.transactionModel.countDocuments(query).exec();

    return { transactions, total };
  }

  async update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<Transaction> {
    const updatedTransaction = await this.transactionModel
      .findByIdAndUpdate(id, updateTransactionDto, { new: true })
      .exec();
    if (!updatedTransaction) {
      throw new NotFoundException('Transaction not found');
    }
    return updatedTransaction;
  }

  async delete(id: string): Promise<Transaction> {
    const deletedTransaction = await this.transactionModel.findByIdAndDelete(id).exec();
    if (!deletedTransaction) {
      throw new NotFoundException('Transaction not found');
    }
    return deletedTransaction;
  }
}
