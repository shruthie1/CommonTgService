import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, Min, Max, Length, ArrayMinSize, ArrayMaxSize, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

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