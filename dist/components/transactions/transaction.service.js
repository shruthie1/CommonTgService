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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const transaction_schema_1 = require("./schemas/transaction.schema");
const axios_1 = require("axios");
let TransactionService = class TransactionService {
    constructor(transactionModel) {
        this.transactionModel = transactionModel;
    }
    async create(createTransactionDto) {
        const transaction = new this.transactionModel(createTransactionDto);
        await transaction.save();
        const message = this.formatMessage(createTransactionDto);
        await this.sendToTelegram(message, createTransactionDto.transactionImageUrl);
        return transaction;
    }
    formatMessage(data) {
        return `🚨 *Transaction Issue Report* 🚨\n\n` +
            `*Transaction ID:* ${data.transactionId}\n` +
            `*Amount:* ₹${data.amount}\n` +
            `*Issue:* ${data.issue}\n` +
            `*Profile:* ${data.profile}\n` +
            `*Chat ID:* ${data.chatId}\n` +
            `*IP Address:* ${data.ipAddress}`;
    }
    async sendToTelegram(message, imageUrl) {
        const telegramBotToken = '6735591051:AAELwIkSHegcBIVv5pf484Pn09WNQj1Nl54';
        const tgChatId = '-1001972065816';
        const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
        await axios_1.default.post(url, {
            chat_id: tgChatId,
            text: message,
            parse_mode: 'Markdown',
        });
        if (imageUrl) {
            const photoUrl = `https://api.telegram.org/bot${telegramBotToken}/sendPhoto`;
            await axios_1.default.post(photoUrl, {
                chat_id: tgChatId,
                photo: imageUrl,
            });
        }
    }
};
exports.TransactionService = TransactionService;
exports.TransactionService = TransactionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(transaction_schema_1.Transaction.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], TransactionService);
//# sourceMappingURL=transaction.service.js.map