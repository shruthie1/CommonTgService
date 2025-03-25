import { Body, Controller, Get, Post, Put, Delete, Param, Query, HttpStatus, ValidationPipe, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionService } from './transaction.service';
import { Transaction } from './schemas/transaction.schema';

@ApiTags('Transactions')
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new transaction',
    description: 'Creates a new transaction record with the provided details'
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Transaction created successfully.',
    type: Transaction
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data provided.'
  })
  async create(@Body() createTransactionDto: CreateTransactionDto): Promise<Transaction> {
    return this.transactionService.create(createTransactionDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get transaction by ID',
    description: 'Retrieves a specific transaction by its unique identifier'
  })
  @ApiParam({
    name: 'id',
    description: 'Transaction unique identifier',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction retrieved successfully.',
    type: Transaction
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transaction not found.'
  })
  async findOne(@Param('id') id: string): Promise<Transaction> {
    return this.transactionService.findOne(id);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all transactions',
    description: 'Retrieves all transactions with optional filtering, pagination and sorting'
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transactions retrieved successfully.',
    type: [Transaction]
  })
  @ApiQuery({ name: 'transactionId', required: false, description: 'Filter by transaction ID (UTR)' })
  @ApiQuery({ name: 'amount', required: false, type: 'number', description: 'Filter by transaction amount' })
  @ApiQuery({ name: 'issue', required: false, description: 'Filter by issue type' })
  @ApiQuery({ name: 'refundMethod', required: false, description: 'Filter by refund method' })
  @ApiQuery({ name: 'profile', required: false, description: 'Filter by user profile' })
  @ApiQuery({ name: 'chatId', required: false, description: 'Filter by chat ID' })
  @ApiQuery({ name: 'ip', required: false, description: 'Filter by IP address' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by transaction status' })
  @ApiQuery({ name: 'limit', required: false, type: 'number', description: 'Number of records to return', example: 10 })
  @ApiQuery({ name: 'offset', required: false, type: 'number', description: 'Number of records to skip', example: 0 })
  async findAll(
    @Query('transactionId') transactionId?: string,
    @Query('amount') amount?: number,
    @Query('issue') issue?: string,
    @Query('refundMethod') refundMethod?: string,
    @Query('profile') profile?: string,
    @Query('chatId') chatId?: string,
    @Query('ip') ip?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<{ transactions: Transaction[]; total: number }> {
    return this.transactionService.findAll(
      { transactionId, amount, issue, refundMethod, profile, chatId, status, ip },
      limit,
      offset
    );
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update a transaction',
    description: 'Updates an existing transaction by its unique identifier'
  })
  @ApiParam({
    name: 'id',
    description: 'Transaction unique identifier',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction updated successfully.',
    type: Transaction
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transaction not found.'
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data provided.'
  })
  async update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
  ): Promise<Transaction> {
    return this.transactionService.update(id, updateTransactionDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a transaction',
    description: 'Deletes a transaction by its unique identifier'
  })
  @ApiParam({
    name: 'id',
    description: 'Transaction unique identifier',
    required: true
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transaction deleted successfully.',
    type: Transaction
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Transaction not found.'
  })
  async delete(@Param('id') id: string): Promise<Transaction> {
    return this.transactionService.delete(id);
  }
}
