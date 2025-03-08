import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ description: 'Unique transaction ID (UTR).' })
  @IsString()
  transactionId: string;

  @ApiProperty({ description: 'Amount involved in the transaction.' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Issue type reported by the user.' })
  @IsString()
  issue: string;

  @ApiProperty({ description: 'Description of issue reported by the user.' })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    description: 'Refund method selected by the user.',
    required: false
  })
  @IsString()
  @IsOptional()
  refundMethod?: string;

  @ApiPropertyOptional({ description: 'User profile ID.', required: false })
  @IsString()
  @IsOptional()
  profile: string = "undefined";

  @ApiPropertyOptional({ description: 'User chat ID.', })
  @IsString()
  @IsOptional()
  chatId: string = "undefined";

  @ApiPropertyOptional({ description: 'IP address of the user.', required: false })
  @IsString()
  @IsOptional()
  ip: string = "undefined";

  @ApiPropertyOptional({ description: 'Transaction status.', required: false })
  @IsString()
  @IsOptional()
  status: string = "pending";
}
