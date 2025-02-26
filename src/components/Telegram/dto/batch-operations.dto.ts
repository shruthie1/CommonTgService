import { IsString, IsOptional, IsNumber, IsArray, IsEnum, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum BatchOperationType {
  FORWARD = 'forward',
  DELETE = 'delete',
  EDIT = 'edit'
}

// Base class for batch operations
export class BaseBatchItemDto {
  @ApiProperty({ description: 'Chat ID for the operation' })
  @IsString()
  chatId: string;
}

export class BatchItemDto extends BaseBatchItemDto {
  @ApiProperty({ description: 'Message ID for message operations', required: false })
  @IsOptional()
  @IsNumber()
  messageId?: number;

  @ApiProperty({ description: 'Source chat ID for forward operations', required: false })
  @IsOptional()
  @IsString()
  fromChatId?: string;

  @ApiProperty({ description: 'Target chat ID for forward operations', required: false })
  @IsOptional()
  @IsString()
  toChatId?: string;
}

export class BatchProcessDto {
  @ApiProperty({ description: 'Operation type', enum: BatchOperationType })
  @IsEnum(BatchOperationType)
  operation: BatchOperationType;

  @ApiProperty({ description: 'Items to process', type: [BatchItemDto] })
  @IsArray()
  items: BatchItemDto[];

  @ApiProperty({ description: 'Number of items to process in each batch', required: false })
  @IsOptional()
  @IsNumber()
  batchSize?: number = 20;
  @ApiProperty({ description: 'Delay between batches in milliseconds', default: 1000 })
  @IsOptional()
  @IsNumber()
  delayMs?: number = 1000;
}

export class ForwardBatchDto {
  @ApiProperty({ description: 'Source chat ID for forwarding' })
  @IsString()
  fromChatId: string;

  @ApiProperty({ description: 'Target chat ID for forwarding' })
  @IsString()
  toChatId: string;

  @ApiProperty({ description: 'Message IDs to forward', type: [Number] })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one message ID is required' })
  @ArrayMaxSize(100, { message: 'Cannot forward more than 100 messages at once' })
  @IsNumber({}, { each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map(Number) : value)
  messageIds: number[];
}