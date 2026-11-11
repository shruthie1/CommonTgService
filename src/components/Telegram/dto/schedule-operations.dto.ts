import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { BaseBatchItemDto } from './batch-operations.dto';

export class ScheduleMessageDto extends BaseBatchItemDto {
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
