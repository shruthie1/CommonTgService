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
exports.TransactionSchema = exports.Transaction = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const swagger_1 = require("@nestjs/swagger");
const create_transaction_dto_1 = require("../dto/create-transaction.dto");
let Transaction = class Transaction {
};
exports.Transaction = Transaction;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unique transaction ID (UTR)' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        required: true,
        unique: true,
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "transactionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Amount involved in the transaction' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.Number,
        required: true,
        min: 0
    }),
    __metadata("design:type", Number)
], Transaction.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Issue type reported by the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        required: true,
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "issue", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Description of issue reported by the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        required: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Refund method selected by the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined',
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "refundMethod", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User profile ID' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined',
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "profile", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'User chat ID' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined',
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "chatId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'IP address of the user' }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        default: 'undefined'
    }),
    __metadata("design:type", String)
], Transaction.prototype, "ip", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Transaction status',
        enum: create_transaction_dto_1.TransactionStatus,
        default: create_transaction_dto_1.TransactionStatus.PENDING
    }),
    (0, mongoose_1.Prop)({
        type: mongoose_2.Schema.Types.String,
        enum: Object.values(create_transaction_dto_1.TransactionStatus),
        default: create_transaction_dto_1.TransactionStatus.PENDING,
        index: true
    }),
    __metadata("design:type", String)
], Transaction.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Creation timestamp' }),
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Transaction.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last update timestamp' }),
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Transaction.prototype, "updatedAt", void 0);
exports.Transaction = Transaction = __decorate([
    (0, mongoose_1.Schema)({
        collection: 'transactions',
        versionKey: false,
        autoIndex: true,
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                ret.id = ret._id;
                delete ret._id;
                return ret;
            },
        }
    })
], Transaction);
exports.TransactionSchema = mongoose_1.SchemaFactory.createForClass(Transaction);
//# sourceMappingURL=transaction.schema.js.map