import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export enum MediaSourceType {
    PATH = 'path',
    BASE64 = 'base64',
    BINARY = 'binary'
}

export class ViewOnceMediaDto {
    @ApiProperty({
        description: 'Chat ID to send the view once media to'})
    @IsString()
    @IsNotEmpty()
    chatId: string;

    @ApiProperty({
        description: 'Source type of the media: url, base64, or binary',
        enum: MediaSourceType})
    @IsEnum(MediaSourceType)
    @IsNotEmpty()
    sourceType: MediaSourceType;

    @ApiProperty({
        description: 'URL of the media file (when sourceType is url)',
        required: false})
    @ValidateIf(o => o.sourceType === MediaSourceType.PATH)
    @IsString()
    @IsNotEmpty()
    path?: string;

    @ApiProperty({
        description: 'Base64 encoded media data (when sourceType is base64)',
        required: false})
    @ValidateIf(o => o.sourceType === MediaSourceType.BASE64)
    @IsString()
    @IsNotEmpty()
    base64Data?: string;

    @ApiProperty({
        description: 'Binary media data (when sourceType is binary)',
        required: false,
        type: 'string',
        format: 'binary'
    })
    @ValidateIf(o => o.sourceType === MediaSourceType.BINARY)
    binaryData?: any;

    @ApiProperty({
        description: 'Optional caption for the media',
        required: false})
    @IsString()
    @IsOptional()
    caption?: string;

    @ApiProperty({
        description: 'Optional filename for the media',
        required: false})
    @IsString()
    @IsOptional()
    filename?: string;
}