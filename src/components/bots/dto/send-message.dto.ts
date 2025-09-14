import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsNumber, IsOptional, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class LinkPreviewOptionsDto {
    @ApiProperty({
        description: 'Disables link preview',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    isDisabled?: boolean;

    @ApiProperty({
        description: 'URL to use for the link preview',
        required: false
    })
    @IsString()
    @IsOptional()
    url?: string;

    @ApiProperty({
        description: 'Prefer small media',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    preferSmallMedia?: boolean;

    @ApiProperty({
        description: 'Prefer large media',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    preferLargeMedia?: boolean;

    @ApiProperty({
        description: 'Show preview above text',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    showAboveText?: boolean;
}


export class SendMessageOptionsDto {
    @ApiProperty({
        description: 'Parse mode for the message',
        enum: ['HTML', 'MarkdownV2', 'Markdown'],
        required: false
    })
    @IsString()
    @IsOptional()
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';

    @ApiProperty({
        description: 'Disable web page preview',
        required: false
    })
    @IsBoolean()
    @IsOptional()
    disableWebPagePreview?: boolean;

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
        description: 'Link preview options',
        required: false,
        type: () => LinkPreviewOptionsDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LinkPreviewOptionsDto)
    linkPreviewOptions?: LinkPreviewOptionsDto;
}

export class SendMessageDto {
    @ApiProperty({
        description: 'Message text to send',
        example: 'Hello, this is a test message!'
    })
    @IsString()
    message: string;

    @ApiProperty({
        description: 'Message sending options',
        required: false,
        type: () => SendMessageOptionsDto
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => SendMessageOptionsDto)
    options?: SendMessageOptionsDto;
}

