import { IsString, IsOptional, IsNumber, IsArray, IsDateString, ValidateNested, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

export class ScheduleMessageDto {
  @ApiProperty({ description: 'Chat ID to send message to' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  message: string;

  @ApiProperty({ description: 'Date to schedule the message' })
  @IsDateString()
  @Transform(({ value }) => new Date(value))
  scheduledTime: string;

  @ApiProperty({ description: 'Message to reply to', required: false })
  @IsOptional()
  @IsNumber()
  replyTo?: number;

  @ApiProperty({ description: 'Silent notification', required: false })
  @IsOptional()
  @IsBoolean()
  silent?: boolean;
}

export class GetScheduledMessagesDto {
  @ApiProperty({ description: 'Chat ID to get scheduled messages from' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Maximum number of messages to return', required: false, default: 50 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 50;
}

export class DeleteScheduledMessageDto {
  @ApiProperty({ description: 'Chat ID containing the scheduled message' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'ID of the scheduled message to delete' })
  @IsNumber()
  messageId: number;
}

export class RescheduleMessageDto {
  @ApiProperty({ description: 'Chat ID containing the message' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Message ID to reschedule' })
  @IsNumber()
  messageId: number;

  @ApiProperty({ description: 'New schedule date (ISO string)' })
  @IsDateString()
  newScheduleDate: string;
}

export class BatchProcessItemDto {
  @ApiProperty({ description: 'Chat ID or message ID depending on operation' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Message ID for operations that require it', required: false })
  @IsOptional()
  @IsNumber()
  messageId?: number;
}
