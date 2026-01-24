import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, Min, Max, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum MediaType {
    PHOTO = 'photo',
    VIDEO = 'video',
    DOCUMENT = 'document',
    VOICE = 'voice',
    ALL = 'all' // Special value to get all types grouped
}

export class MediaItemDto {
    @ApiProperty({ description: 'Message ID', example: 12345 })
    messageId: number;

    @ApiProperty({ description: 'Chat ID', example: 'me' })
    chatId: string;

    @ApiProperty({ description: 'Media type', enum: MediaType, example: 'photo' })
    type: MediaType;

    @ApiProperty({ description: 'Message date (Unix timestamp)', example: 1704067200 })
    date: number;

    @ApiPropertyOptional({ description: 'Caption text', example: 'Beautiful sunset' })
    caption?: string;

    @ApiPropertyOptional({ description: 'File size in bytes', example: 1024000 })
    fileSize?: number;

    @ApiPropertyOptional({ description: 'MIME type', example: 'image/jpeg' })
    mimeType?: string;

    @ApiPropertyOptional({ description: 'Filename', example: 'photo.jpg' })
    filename?: string;

    @ApiPropertyOptional({ description: 'Thumbnail (base64 encoded)', example: 'data:image/jpeg;base64,...' })
    thumbnail?: string;

    @ApiPropertyOptional({ description: 'Width in pixels (for images/videos)', example: 1920 })
    width?: number;

    @ApiPropertyOptional({ description: 'Height in pixels (for images/videos)', example: 1080 })
    height?: number;

    @ApiPropertyOptional({ description: 'Duration in seconds (for video/voice)', example: 120 })
    duration?: number;

    @ApiPropertyOptional({ description: 'Additional media details' })
    mediaDetails?: Record<string, any>;
}

export class PaginationDto {
    @ApiProperty({ description: 'Current page number (1-indexed)', example: 1 })
    page: number;

    @ApiProperty({ description: 'Items per page', example: 50 })
    limit: number;

    @ApiProperty({ description: 'Total number of items in current page', example: 50 })
    total: number;

    @ApiProperty({ description: 'Total number of pages (if known, -1 for unknown)', example: 5 })
    totalPages: number;

    @ApiProperty({ description: 'Whether there are more items available', example: true })
    hasMore: boolean;

    @ApiPropertyOptional({ description: 'Message ID to use as maxId for next page (get messages with ID less than this)', example: 12345 })
    nextMaxId?: number;

    @ApiPropertyOptional({ description: 'Message ID to use as maxId for previous page', example: 12000 })
    prevMaxId?: number;

    @ApiPropertyOptional({ description: 'First message ID in current page', example: 12345 })
    firstMessageId?: number;

    @ApiPropertyOptional({ description: 'Last message ID in current page', example: 12300 })
    lastMessageId?: number;
}

export class MediaFiltersDto {
    @ApiProperty({ description: 'Chat ID', example: 'me' })
    chatId: string;

    @ApiPropertyOptional({ description: 'Media types filter', type: [String], enum: MediaType, example: ['photo', 'video'] })
    types?: MediaType[];

    @ApiPropertyOptional({ description: 'Start date filter (ISO 8601)', example: '2024-01-01' })
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date filter (ISO 8601)', example: '2024-12-31' })
    endDate?: string;
}

export class MediaGroupDto {
    @ApiProperty({ description: 'Media type', enum: MediaType, example: 'photo' })
    type: MediaType;

    @ApiProperty({ description: 'Number of items of this type', example: 25 })
    count: number;

    @ApiProperty({ description: 'Media items of this type', type: [MediaItemDto] })
    items: MediaItemDto[];

    @ApiProperty({ description: 'Pagination information for this type', type: PaginationDto })
    pagination: PaginationDto;
}

export class PaginatedMediaResponseDto {
    @ApiProperty({ description: 'Array of media items (when single type or multiple types without grouping)', type: [MediaItemDto] })
    data?: MediaItemDto[];

    @ApiProperty({ description: 'Media grouped by type (when "all" is in types)', type: [MediaGroupDto] })
    groups?: MediaGroupDto[];

    @ApiProperty({ description: 'Pagination information (for single type or overall)', type: PaginationDto })
    pagination: PaginationDto;

    @ApiProperty({ description: 'Applied filters', type: MediaFiltersDto })
    filters: MediaFiltersDto;
}

export class MediaMetadataQueryDto {
    @ApiProperty({ description: 'Chat ID or username', example: 'me' })
    @IsString()
    chatId: string;

    @ApiPropertyOptional({ description: 'Media types to filter. Use "all" to get all types grouped by type', enum: MediaType, isArray: true, example: ['photo', 'video'] })
    @IsOptional()
    @IsArray()
    @IsEnum(MediaType, { each: true })
    @Transform(({ value }) => {
        if (typeof value === 'string') {
            return value.split(',').map(v => v.trim());
        }
        return Array.isArray(value) ? value : [value];
    })
    types?: MediaType[];

    @ApiPropertyOptional({ description: 'Start date (ISO 8601)', example: '2024-01-01' })
    @IsOptional()
    @IsString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date (ISO 8601)', example: '2024-12-31' })
    @IsOptional()
    @IsString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Maximum number of items (1-1000)', example: 50, minimum: 1, maximum: 1000 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(1000)
    limit?: number;

    @ApiPropertyOptional({ description: 'Maximum message ID to include (use for pagination - get messages with ID less than this)', example: 12345 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    maxId?: number;

    @ApiPropertyOptional({ description: 'Minimum message ID to include', example: 1000 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    minId?: number;

}
