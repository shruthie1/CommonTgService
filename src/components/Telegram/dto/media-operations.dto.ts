import { IsString, IsOptional, IsNumber, IsArray, IsEnum, IsUrl, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum MediaType {
  PHOTO = 'photo',
  VIDEO = 'video',
  DOCUMENT = 'document',
  VOICE = 'voice',
  AUDIO = 'audio'
}

// Base class for media operations
export class BaseMediaOperationDto {
  @ApiProperty({ description: 'Chat ID for media operation' })
  @IsString()
  chatId: string;
}

export class MediaSearchDto extends BaseMediaOperationDto {
  @ApiProperty({ description: 'Media types to include', enum: MediaType, isArray: true })
  @IsArray()
  @IsEnum(MediaType, { each: true })
  types: MediaType[];

  @ApiProperty({ description: 'Message offset', required: false })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  offset?: number;

  @ApiProperty({ description: 'Items per page', required: false })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 50;
}

export class MediaFilterDto extends MediaSearchDto {
  @ApiProperty({ description: 'Start date for filtering', required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  startDate?: string;

  @ApiProperty({ description: 'End date for filtering', required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  endDate?: string;
}

export class SendMediaDto extends BaseMediaOperationDto {
  @ApiProperty({ description: 'URL of the media file' })
  @IsString()
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Caption for the media', required: false })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiProperty({ description: 'Filename for the media' })
  @IsString()
  filename: string;

  @ApiProperty({ description: 'Type of media', enum: MediaType })
  @IsEnum(MediaType)
  type: MediaType;
}

export class MediaAlbumItemDto {
  @ApiProperty({ description: 'URL of the media file' })
  @IsString()
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Type of media', enum: MediaType })
  @IsEnum(MediaType)
  type: MediaType;

  @ApiProperty({ description: 'Caption for the media item', required: false })
  @IsOptional()
  @IsString()
  caption?: string;
}

export class SendMediaAlbumDto extends BaseMediaOperationDto {
  @ApiProperty({ description: 'Array of media items', type: [MediaAlbumItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaAlbumItemDto)
  media: MediaAlbumItemDto[];
}

export class VoiceMessageDto extends BaseMediaOperationDto {
  @ApiProperty({ description: 'URL of the voice message file' })
  @IsString()
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Duration of voice message in seconds', required: false })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiProperty({ description: 'Caption for the voice message', required: false })
  @IsOptional()
  @IsString()
  caption?: string;
}

export class MediaDownloadDto extends BaseMediaOperationDto {
  @ApiProperty({ description: 'ID of the message containing the media' })
  @IsNumber()
  messageId: number;
}