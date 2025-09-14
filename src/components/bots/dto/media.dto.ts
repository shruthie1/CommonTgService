import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Base class for shared media options
export class MediaOptionsDto {
    @ApiProperty({
        description: 'Parse mode for the caption',
        enum: ['HTML', 'MarkdownV2', 'Markdown'],
        required: false
    })
    @IsString()
    @IsOptional()
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';

    @ApiProperty({
        description: 'Caption text',
        required: false
    })
    @IsString()
    @IsOptional()
    caption?: string;

    @ApiProperty({
        description: 'Disable notification',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    disableNotification?: boolean;

    @ApiProperty({
        description: 'Message ID to reply to',
        required: false
    })
    @IsNumber()
    @IsOptional()
    replyToMessageId?: number;

    @ApiProperty({
        description: 'Allow sending without reply',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    allowSendingWithoutReply?: boolean;

    @ApiProperty({
        description: 'Protect content',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    protectContent?: boolean;

    @ApiProperty({
        description: 'Apply spoiler animation',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    hasSpoiler?: boolean;
}

// Video options, extends MediaOptionsDto
export class VideoOptionsDto extends MediaOptionsDto {
    @ApiProperty({
        description: 'Duration of the video in seconds',
        required: false
    })
    @IsNumber()
    @IsOptional()
    duration?: number;

    @ApiProperty({
        description: 'Video width',
        required: false
    })
    @IsNumber()
    @IsOptional()
    width?: number;

    @ApiProperty({
        description: 'Video height',
        required: false
    })
    @IsNumber()
    @IsOptional()
    height?: number;

    @ApiProperty({
        description: 'Pass True if the uploaded video is suitable for streaming',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    supportsStreaming?: boolean;
}

// Audio options, extends MediaOptionsDto
export class AudioOptionsDto extends MediaOptionsDto {
    @ApiProperty({
        description: 'Duration of the audio in seconds',
        required: false
    })
    @IsNumber()
    @IsOptional()
    duration?: number;

    @ApiProperty({
        description: 'Performer name',
        required: false
    })
    @IsString()
    @IsOptional()
    performer?: string;

    @ApiProperty({
        description: 'Track title',
        required: false
    })
    @IsString()
    @IsOptional()
    title?: string;
}

// Document options, extends MediaOptionsDto
export class DocumentOptionsDto extends MediaOptionsDto {
    @ApiProperty({
        description: 'Disables automatic content type detection',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    disableContentTypeDetection?: boolean;
}

// DTO for sending photos
export class SendPhotoDto {
    @ApiProperty({
        description: 'Photo URL or file ID',
        example: 'https://example.com/photo.jpg'
    })
    @IsString()
    photo: string;

    @ApiProperty({
        description: 'Photo sending options',
        required: false,
        type: () => MediaOptionsDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => MediaOptionsDto)
    options?: MediaOptionsDto;
}

// DTO for sending videos
export class SendVideoDto {
    @ApiProperty({
        description: 'Video URL or file ID',
        example: 'https://example.com/video.mp4'
    })
    @IsString()
    video: string;

    @ApiProperty({
        description: 'Video sending options',
        required: false,
        type: () => VideoOptionsDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => VideoOptionsDto)
    options?: VideoOptionsDto;
}

// DTO for sending audio
export class SendAudioDto {
    @ApiProperty({
        description: 'Audio URL or file ID',
        example: 'https://example.com/audio.mp3'
    })
    @IsString()
    audio: string;

    @ApiProperty({
        description: 'Audio sending options',
        required: false,
        type: () => AudioOptionsDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AudioOptionsDto)
    options?: AudioOptionsDto;
}

// DTO for sending documents
export class SendDocumentDto {
    @ApiProperty({
        description: 'Document URL or file ID',
        example: 'https://example.com/document.pdf'
    })
    @IsString()
    document: string;

    @ApiProperty({
        description: 'Document sending options',
        required: false,
        type: () => DocumentOptionsDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DocumentOptionsDto)
    options?: DocumentOptionsDto;
}