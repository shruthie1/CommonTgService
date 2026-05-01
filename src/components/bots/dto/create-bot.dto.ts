import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ChannelCategory } from '../bots.service';

export class CreateBotDto {
    @ApiProperty({
        description: 'Telegram bot token'})
    @IsString()
    token: string;

    @ApiProperty({
        description: 'Channel category the bot belongs to',
        enum: ChannelCategory })
    @IsEnum(ChannelCategory)
    category: ChannelCategory;

    @ApiProperty({
        description: 'Channel ID where bot will post messages'})
    @IsString()
    channelId: string;

    @ApiProperty({
        description: 'Optional description of the bot',
        required: false})
    @IsString()
    @IsOptional()
    description?: string;
}
