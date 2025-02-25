import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MediaMetadataDto {
    @ApiProperty({ description: 'Chat ID' })
    @IsString()
    chatId: string;

    @ApiProperty({ description: 'Message offset', required: false })
    @IsOptional()
    @IsNumber()
    offset?: number;

    @ApiProperty({ description: 'Number of messages to fetch', required: false })
    @IsOptional()
    @IsNumber()
    limit?: number;
}