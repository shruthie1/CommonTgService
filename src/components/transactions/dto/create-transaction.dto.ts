import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
  @IsNotEmpty()
  @IsString()
  transactionId: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  issue: string;

  @IsOptional()
  @IsString()
  refundMethod?: string;

  @IsOptional()
  @IsString()
  transactionImageUrl?: string;

  @IsNotEmpty()
  @IsString()
  profile: string;

  @IsNotEmpty()
  @IsString()
  chatId: string;

  @IsNotEmpty()
  @IsString()
  ipAddress: string;
}
