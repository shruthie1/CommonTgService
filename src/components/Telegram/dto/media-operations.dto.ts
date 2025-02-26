import { IsString, IsEnum, IsOptional, IsUrl, IsArray, IsNumber, ValidateNested, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum MediaType {
    PHOTO = 'photo',
    VIDEO = 'video',
    DOCUMENT = 'document',
    VOICE = 'voice',
    AUDIO = 'audio'
}

export class MediaSearchDto {
    @ApiProperty({ description: 'Chat ID to search in' })
    @IsString()
    chatId: string;

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
    limit?: number;
}

export class MediaFilterDto {
    @ApiProperty({ description: 'Chat ID to filter media from' })
    @IsString()
    chatId: string;

    @ApiProperty({ description: 'Types of media to include', enum: MediaType, isArray: true })
    @IsArray()
    @IsEnum(MediaType, { each: true })
    types: MediaType[];

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

    @ApiProperty({ description: 'Message offset for pagination', required: false })
    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => parseInt(value))
    offset?: number;

    @ApiProperty({ description: 'Number of messages to fetch', required: false })
    @IsOptional()
    @IsNumber()
    @Transform(({ value }) => parseInt(value))
    limit?: number;
}

export class SendMediaDto {
    @ApiProperty({ description: 'Chat ID to send media to' })
    @IsString()
    chatId: string;

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

export class SendMediaAlbumDto {
    @ApiProperty({ description: 'Chat ID to send media album to' })
    @IsString()
    chatId: string;

    @ApiProperty({ description: 'Array of media items', type: [MediaAlbumItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MediaAlbumItemDto)
    media: MediaAlbumItemDto[];
}

export class VoiceMessageDto {
    @ApiProperty({ description: 'Chat ID to send voice message to' })
    @IsString()
    chatId: string;

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

export class MediaDownloadDto {
    @IsNotEmpty()
    @ApiProperty({ description: 'ID of the message containing the media' })
    messageId: number;

    @IsNotEmpty()
    @ApiProperty({ description: 'ID of the chat containing the message' })
    chatId: string;
}