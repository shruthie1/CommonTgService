import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum MediaType {
  PHOTO = 'photo',
  VIDEO = 'video',
  DOCUMENT = 'document',
  VOICE = 'voice'
}

export class MediaFilterDto {
  @ApiProperty({ description: 'Chat ID to filter media from' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Types of media to include', enum: MediaType, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsEnum(MediaType, { each: true })
  types?: MediaType[];

  @ApiProperty({ description: 'Start date for filtering', required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ description: 'End date for filtering', required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ description: 'Message offset for pagination', required: false })
  @IsOptional()
  @IsNumber()
  offset?: number;

  @ApiProperty({ description: 'Number of messages to fetch', required: false })
  @IsOptional()
  @IsNumber()
  limit?: number = 50;
}