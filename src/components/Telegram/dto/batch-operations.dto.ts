import { IsString, IsNumber, IsArray, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum BatchOperationType {
    FORWARD = 'forward',
    DELETE = 'delete'
}

export class BatchItemDto {
    @ApiProperty({ description: 'Chat ID for the operation' })
    @IsString()
    chatId: string;

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
    @ApiProperty({ description: 'Items to process', type: [BatchItemDto] })
    @IsArray()
    items: BatchItemDto[];

    @ApiProperty({ description: 'Operation type', enum: BatchOperationType })
    @IsEnum(BatchOperationType)
    operation: BatchOperationType;

    @ApiProperty({ description: 'Number of items to process in each batch', default: 20 })
    @IsOptional()
    @IsNumber()
    batchSize?: number = 20;

    @ApiProperty({ description: 'Delay between batches in milliseconds', default: 1000 })
    @IsOptional()
    @IsNumber()
    delayMs?: number = 1000;
}

export class ForwardBatchDto extends BatchProcessDto {
    @ApiProperty({ description: 'Source chat ID for forwarding' })
    @IsString()
    fromChatId: string;

    @ApiProperty({ description: 'Target chat ID for forwarding' })
    @IsString()
    toChatId: string;

    @ApiProperty({ description: 'Message IDs to forward', type: [Number] })
    @IsArray()
    @IsNumber({}, { each: true })
    messageIds: number[];
}