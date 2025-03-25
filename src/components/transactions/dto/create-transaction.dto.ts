import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, MinLength, Min, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export class CreateTransactionDto {
  @ApiProperty({ 
    description: 'Unique transaction ID (UTR)',
    example: 'TXN123456789',
    minLength: 8 
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  transactionId: string;

  @ApiProperty({ 
    description: 'Amount involved in the transaction',
    example: 100.50,
    minimum: 0 
  })
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiProperty({ 
    description: 'Issue type reported by the user',
    example: 'payment_failed'
  })
  @IsString()
  @IsNotEmpty()
  issue: string;

  @ApiProperty({ 
    description: 'Description of issue reported by the user',
    example: 'Payment failed due to network error'
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Refund method selected by the user',
    example: 'bank_transfer',
    required: false
  })
  @IsString()
  @IsOptional()
  refundMethod?: string;

  @ApiPropertyOptional({ 
    description: 'User profile ID',
    example: 'user123',
    required: false 
  })
  @IsString()
  @IsOptional()
  profile: string = "undefined";

  @ApiPropertyOptional({ 
    description: 'User chat ID',
    example: 'chat123',
    required: false
  })
  @IsString()
  @IsOptional()
  chatId: string = "undefined";

  @ApiPropertyOptional({ 
    description: 'IP address of the user',
    example: '192.168.1.1',
    required: false
  })
  @IsString()
  @IsOptional()
  ip: string = "undefined";

  @ApiPropertyOptional({ 
    description: 'Transaction status',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
    required: false
  })
  @IsEnum(TransactionStatus)
  @IsOptional()
  status: TransactionStatus = TransactionStatus.PENDING;
}
