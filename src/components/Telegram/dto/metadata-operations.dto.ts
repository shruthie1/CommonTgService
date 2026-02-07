import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, Min, Max, Length, ArrayMinSize, ArrayMaxSize, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export enum MetadataType {
    PHOTO = 'photo',
    VIDEO = 'video',
    DOCUMENT = 'document'
}

export class MediaMetadataDto {
    @ApiProperty({ description: 'Chat ID to get metadata from' })
    @IsString()
    chatId: string;

    @ApiProperty({ description: 'Message offset', required: false })
    @IsOptional()
    @IsNumber()
    offset?: number;

    @ApiProperty({ description: 'Maximum number of items', required: false })
    @IsOptional()
    @IsNumber()
    limit?: number = 50;
}

export enum DialogsPeerType {
    ALL = 'all',
    USER = 'user',
    GROUP = 'group',
    CHANNEL = 'channel',
}

export class BulkMessageOperationDto {
    @ApiProperty({ description: 'Source chat ID', type: String, minLength: 1, maxLength: 255 })
    @IsString()
    fromChatId!: string;

    @ApiProperty({ description: 'Target chat ID', type: String, minLength: 1, maxLength: 255 })
    @IsString()
    toChatId!: string;

    @ApiProperty({ description: 'Message IDs to operate on', type: [Number], minItems: 1, maxItems: 100 })
    @Transform(({ value }) => Array.isArray(value) ? value.map(Number) : value)
    messageIds!: number[];
}