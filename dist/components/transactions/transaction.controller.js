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
exports.TransactionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const create_transaction_dto_1 = require("./dto/create-transaction.dto");
const update_transaction_dto_1 = require("./dto/update-transaction.dto");
const transaction_service_1 = require("./transaction.service");
const transaction_schema_1 = require("./schemas/transaction.schema");
let TransactionController = class TransactionController {
    constructor(transactionService) {
        this.transactionService = transactionService;
    }
    async create(createTransactionDto) {
        return this.transactionService.create(createTransactionDto);
    }
    async findOne(id) {
        return this.transactionService.findOne(id);
    }
    async findAll(transactionId, amount, issue, refundMethod, profile, chatId, ip, status, limit, offset) {
        return this.transactionService.findAll({ transactionId, amount, issue, refundMethod, profile, chatId, status, ip }, limit, offset);
    }
    async update(id, updateTransactionDto) {
        return this.transactionService.update(id, updateTransactionDto);
    }
    async delete(id) {
        return this.transactionService.delete(id);
    }
};
exports.TransactionController = TransactionController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a new transaction',
        description: 'Creates a new transaction record with the provided details'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.CREATED,
        description: 'Transaction created successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid input data provided.'
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_transaction_dto_1.CreateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get transaction by ID',
        description: 'Retrieves a specific transaction by its unique identifier'
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: 'Transaction unique identifier',
        required: true
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transaction retrieved successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.NOT_FOUND,
        description: 'Transaction not found.'
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Get all transactions',
        description: 'Retrieves all transactions with optional filtering, pagination and sorting'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transactions retrieved successfully.',
        type: [transaction_schema_1.Transaction]
    }),
    (0, swagger_1.ApiQuery)({ name: 'transactionId', required: false, description: 'Filter by transaction ID (UTR)' }),
    (0, swagger_1.ApiQuery)({ name: 'amount', required: false, type: 'number', description: 'Filter by transaction amount' }),
    (0, swagger_1.ApiQuery)({ name: 'issue', required: false, description: 'Filter by issue type' }),
    (0, swagger_1.ApiQuery)({ name: 'refundMethod', required: false, description: 'Filter by refund method' }),
    (0, swagger_1.ApiQuery)({ name: 'profile', required: false, description: 'Filter by user profile' }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: false, description: 'Filter by chat ID' }),
    (0, swagger_1.ApiQuery)({ name: 'ip', required: false, description: 'Filter by IP address' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: 'Filter by transaction status' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: 'number', description: 'Number of records to return', example: 10 }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: 'number', description: 'Number of records to skip', example: 0 }),
    __param(0, (0, common_1.Query)('transactionId')),
    __param(1, (0, common_1.Query)('amount')),
    __param(2, (0, common_1.Query)('issue')),
    __param(3, (0, common_1.Query)('refundMethod')),
    __param(4, (0, common_1.Query)('profile')),
    __param(5, (0, common_1.Query)('chatId')),
    __param(6, (0, common_1.Query)('ip')),
    __param(7, (0, common_1.Query)('status')),
    __param(8, (0, common_1.Query)('limit')),
    __param(9, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, String, String, String, String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "findAll", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Update a transaction',
        description: 'Updates an existing transaction by its unique identifier'
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: 'Transaction unique identifier',
        required: true
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transaction updated successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.NOT_FOUND,
        description: 'Transaction not found.'
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.BAD_REQUEST,
        description: 'Invalid input data provided.'
    }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_transaction_dto_1.UpdateTransactionDto]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Delete a transaction',
        description: 'Deletes a transaction by its unique identifier'
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: 'Transaction unique identifier',
        required: true
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.OK,
        description: 'Transaction deleted successfully.',
        type: transaction_schema_1.Transaction
    }),
    (0, swagger_1.ApiResponse)({
        status: common_1.HttpStatus.NOT_FOUND,
        description: 'Transaction not found.'
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TransactionController.prototype, "delete", null);
exports.TransactionController = TransactionController = __decorate([
    (0, swagger_1.ApiTags)('Transactions'),
    (0, common_1.Controller)('transactions'),
    __metadata("design:paramtypes", [transaction_service_1.TransactionService])
], TransactionController);
//# sourceMappingURL=transaction.controller.js.map