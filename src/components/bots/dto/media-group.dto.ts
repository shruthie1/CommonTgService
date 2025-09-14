import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MediaOptionsDto } from './media.dto';

export class MediaGroupItemDto {
    @ApiProperty({
        description: 'Type of media',
        enum: ['photo', 'video', 'audio', 'document'],
        example: 'photo'
    })
    @IsEnum(['photo', 'video', 'audio', 'document'])
    type: 'photo' | 'video' | 'audio' | 'document';

    @ApiProperty({
        description: 'Media URL or file ID',
        example: 'https://example.com/media.jpg'
    })
    @IsString()
    media: string;

    @ApiProperty({
        description: 'Caption for the media',
        required: false
    })
    @IsString()
    @IsOptional()
    caption?: string;

    @ApiProperty({
        description: 'Parse mode for caption',
        enum: ['HTML', 'Markdown', 'MarkdownV2'],
        required: false
    })
    @IsString()
    @IsOptional()
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';

    @ApiProperty({
        description: 'Apply spoiler animation to media',
        required: false
    })
    @IsOptional()
    hasSpoiler?: boolean;

    @ApiProperty({
        description: 'File extension when sending as buffer',
        required: false
    })
    @IsString()
    @IsOptional()
    extension?: string;

    @ApiProperty({
        description: 'Duration for video/audio in seconds',
        required: false
    })
    @IsOptional()
    duration?: number;

    @ApiProperty({
        description: 'Width for video',
        required: false
    })
    @IsOptional()
    width?: number;

    @ApiProperty({
        description: 'Height for video',
        required: false
    })
    @IsOptional()
    height?: number;

    @ApiProperty({
        description: 'Whether video supports streaming',
        required: false
    })
    @IsOptional()
    supportsStreaming?: boolean;

    @ApiProperty({
        description: 'Performer name for audio',
        required: false
    })
    @IsString()
    @IsOptional()
    performer?: string;

    @ApiProperty({
        description: 'Title for audio',
        required: false
    })
    @IsString()
    @IsOptional()
    title?: string;
}

export class SendMediaGroupDto {
    @ApiProperty({
        description: 'Array of media items to send',
        type: [MediaGroupItemDto]
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MediaGroupItemDto)
    media: MediaGroupItemDto[];

    @ApiProperty({
        description: 'Media group sending options',
        required: false,
        type: () => MediaOptionsDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => MediaOptionsDto)
    options?: MediaOptionsDto;
}
