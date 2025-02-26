import { IsString, IsOptional, IsNumber, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum MessageType {
  ALL = 'all',
  TEXT = 'text',
  PHOTO = 'photo',
  VIDEO = 'video',
  VOICE = 'voice',
  DOCUMENT = 'document'
}

export class MessageSearchDto {
  @ApiProperty({ description: 'Chat ID to search in' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'Text to search for', required: false })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({ description: 'Types of messages to include', enum: MessageType, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @IsEnum(MessageType, { each: true })
  types?: MessageType[];

  @ApiProperty({ description: 'Offset for pagination', required: false })
  @IsOptional()
  @IsNumber()
  offset?: number;

  @ApiProperty({ description: 'Limit for pagination', required: false })
  @IsOptional()
  @IsNumber()
  limit?: number = 20;
}