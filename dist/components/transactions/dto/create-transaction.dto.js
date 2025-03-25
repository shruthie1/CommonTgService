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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateTransactionDto = exports.TransactionStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var TransactionStatus;
(function (TransactionStatus) {
    TransactionStatus["PENDING"] = "pending";
    TransactionStatus["COMPLETED"] = "completed";
    TransactionStatus["FAILED"] = "failed";
    TransactionStatus["CANCELLED"] = "cancelled";
})(TransactionStatus || (exports.TransactionStatus = TransactionStatus = {}));
class CreateTransactionDto {
    constructor() {
        this.profile = "undefined";
        this.chatId = "undefined";
        this.ip = "undefined";
        this.status = TransactionStatus.PENDING;
    }
}
exports.CreateTransactionDto = CreateTransactionDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Unique transaction ID (UTR)',
        example: 'TXN123456789',
        minLength: 8
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "transactionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Amount involved in the transaction',
        example: 100.50,
        minimum: 0
    }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_transformer_1.Transform)(({ value }) => parseFloat(value)),
    __metadata("design:type", Number)
], CreateTransactionDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Issue type reported by the user',
        example: 'payment_failed'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Description of issue reported by the user',
        example: 'Payment failed due to network error'
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Refund method selected by the user',
        example: 'bank_transfer',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "refundMethod", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'User profile ID',
        example: 'user123',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'User chat ID',
        example: 'chat123',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'IP address of the user',
        example: '192.168.1.1',
        required: false
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "ip", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Transaction status',
        enum: TransactionStatus,
        default: TransactionStatus.PENDING,
        required: false
    }),
    (0, class_validator_1.IsEnum)(TransactionStatus),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateTransactionDto.prototype, "status", void 0);
//# sourceMappingURL=create-transaction.dto.js.map