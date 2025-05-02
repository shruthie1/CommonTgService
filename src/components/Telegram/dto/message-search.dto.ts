import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { 
  IsString, 
  IsOptional, 
  IsArray, 
  IsNumber, 
  IsEnum, 
  IsDate, 
  Min,
  Max,
  IsInt,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize
} from 'class-validator';

/**
 * Enum for message media types that can be searched
 */
export enum MessageMediaType {
  ALL = 'all',
  TEXT = 'text',
  PHOTO = 'photo',
  VIDEO = 'video',
  VOICE = 'voice',
  DOCUMENT = 'document',
  ROUND_VIDEO = 'roundVideo'
}

/**
 * Enum for search scope
 */
export enum SearchScope {
  CHAT = 'chat',
  GLOBAL = 'global'
}

/**
 * DTO for search messages request
 */
export class SearchMessagesDto {
  @ApiPropertyOptional({
    description: 'Chat ID to search in (required for chat-specific search)',
  })
  @IsString()
  @IsOptional()
  chatId?: string;

  @ApiPropertyOptional({
    description: 'Search query string',
  })
  @IsString()
  @IsOptional()
  query?: string;

  @ApiPropertyOptional({
    description: 'Types of messages to search for',
    enum: MessageMediaType,
    isArray: true,
    required: false,
  })
  @IsArray()
  @IsEnum(MessageMediaType, { each: true })
  @IsOptional()
  types?: MessageMediaType[];

  @ApiPropertyOptional({
    description: 'Minimum message ID for filtering',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  minId?: number;

  @ApiPropertyOptional({
    description: 'Maximum message ID for filtering',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  maxId?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of messages to retrieve',
    minimum: 1,
    maximum: 500,
  })
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Offset ID for pagination',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  offsetId?: number;

  @ApiPropertyOptional({
    description: 'Offset date as Unix timestamp',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  offsetDate?: number;

  @ApiPropertyOptional({
    description: 'Start date for filtering messages by date range',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'End date for filtering messages by date range',
  })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  endDate?: Date;
}

/**
 * Interface for message search results by type
 */
export class MessageTypeResult {
  @ApiProperty({
    description: 'Array of message IDs matching the search criteria',
    type: [Number],
    example: [1001, 1005, 1010]
  })
  @IsArray()
  @IsInt({ each: true })
  messages: number[];

  @ApiProperty({
    description: 'Total count of messages matching the search criteria',
    example: 3
  })
  @IsInt()
  @Min(0)
  total: number;

  data?: any
}

/**
 * DTO for search messages response
 */
export class SearchMessagesResponseDto {
  @ApiPropertyOptional({
    description: 'All message results',
    type: MessageTypeResult
  })
  @ValidateNested()
  @Type(() => MessageTypeResult)
  @IsOptional()
  all?: MessageTypeResult;

  @ApiPropertyOptional({
    description: 'Text message results',
    type: MessageTypeResult
  })
  @ValidateNested()
  @Type(() => MessageTypeResult)
  @IsOptional()
  text?: MessageTypeResult;

  @ApiPropertyOptional({
    description: 'Photo message results',
    type: MessageTypeResult
  })
  @ValidateNested()
  @Type(() => MessageTypeResult)
  @IsOptional()
  photo?: MessageTypeResult;

  @ApiPropertyOptional({
    description: 'Video message results',
    type: MessageTypeResult
  })
  @ValidateNested()
  @Type(() => MessageTypeResult)
  @IsOptional()
  video?: MessageTypeResult;

  @ApiPropertyOptional({
    description: 'Voice message results',
    type: MessageTypeResult
  })
  @ValidateNested()
  @Type(() => MessageTypeResult)
  @IsOptional()
  voice?: MessageTypeResult;

  @ApiPropertyOptional({
    description: 'Document message results',
    type: MessageTypeResult
  })
  @ValidateNested()
  @Type(() => MessageTypeResult)
  @IsOptional()
  document?: MessageTypeResult;

  @ApiPropertyOptional({
    description: 'Round video message results',
    type: MessageTypeResult
  })
  @ValidateNested()
  @Type(() => MessageTypeResult)
  @IsOptional()
  roundVideo?: MessageTypeResult;
}