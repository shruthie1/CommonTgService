import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChannelOperationDto {
    @ApiProperty({ description: 'Channel username or ID' })
    @IsString()
    channel: string;

    @ApiProperty({ description: 'Whether to forward messages after joining', required: false })
    @IsOptional()
    @IsBoolean()
    forward?: boolean;

    @ApiProperty({ description: 'Source chat ID to forward messages from', required: false })
    @IsOptional()
    @IsString()
    fromChatId?: string;
}