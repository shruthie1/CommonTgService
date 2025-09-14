import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ChannelCategory } from '../bots.service';

export class CreateBotDto {
    @ApiProperty({
        description: 'Telegram bot token',
        example: '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz'
    })
    @IsString()
    token: string;

    @ApiProperty({
        description: 'Channel category the bot belongs to',
        enum: ChannelCategory,
        example: ChannelCategory.CLIENT_UPDATES
    })
    @IsEnum(ChannelCategory)
    category: ChannelCategory;

    @ApiProperty({
        description: 'Channel ID where bot will post messages',
        example: '-1001234567890'
    })
    @IsString()
    channelId: string;

    @ApiProperty({
        description: 'Optional description of the bot',
        required: false,
        example: 'Bot for sending client updates'
    })
    @IsString()
    @IsOptional()
    description?: string;
}
