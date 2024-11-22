import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { Transaction } from './schemas/transaction.schema';
import axios from 'axios';

@Injectable()
export class TransactionService {
  constructor(
    @InjectModel(Transaction.name)
    private transactionModel: Model<Transaction>,
  ) {}

  async create(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    const transaction = new this.transactionModel(createTransactionDto);
    await transaction.save();

    // Send data to Telegram
    const message = this.formatMessage(createTransactionDto);
    await this.sendToTelegram(message, createTransactionDto.transactionImageUrl);

    return transaction;
  }

  private formatMessage(data: CreateTransactionDto): string {
    return `🚨 *Transaction Issue Report* 🚨\n\n` +
      `*Transaction ID:* ${data.transactionId}\n` +
      `*Amount:* ₹${data.amount}\n` +
      `*Issue:* ${data.issue}\n` +
      `*Profile:* ${data.profile}\n` +
      `*Chat ID:* ${data.chatId}\n` +
      `*IP Address:* ${data.ipAddress}`;
  }

  private async sendToTelegram(message: string, imageUrl?: string): Promise<void> {
    const telegramBotToken = '6735591051:AAELwIkSHegcBIVv5pf484Pn09WNQj1Nl54';
    const tgChatId = '-1001972065816';
    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;

    // Send text message
    await axios.post(url, {
      chat_id: tgChatId,
      text: message,
      parse_mode: 'Markdown',
    });

    // Send image if available
    if (imageUrl) {
      const photoUrl = `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`;
      await axios.post(photoUrl, {
        chat_id: tgChatId,
        photo: imageUrl,
      });
    }
  }
}
