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
    minLength: 8 
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  transactionId: string;

  @ApiProperty({ 
    description: 'Amount involved in the transaction',
    minimum: 0 
  })
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  amount: number;

  @ApiProperty({ 
    description: 'Issue type reported by the user'})
  @IsString()
  @IsNotEmpty()
  issue: string;

  @ApiProperty({ 
    description: 'Description of issue reported by the user'})
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'Refund method selected by the user',
    required: false
  })
  @IsString()
  @IsOptional()
  refundMethod?: string;

  @ApiPropertyOptional({ 
    description: 'User profile ID',
    required: false 
  })
  @IsString()
  @IsOptional()
  profile: string = "undefined";

  @ApiPropertyOptional({ 
    description: 'User chat ID',
    required: false
  })
  @IsString()
  @IsOptional()
  chatId: string = "undefined";

  @ApiPropertyOptional({ 
    description: 'IP address of the user',
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
