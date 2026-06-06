import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class BatchChannelIntelligenceRequestDto {
  @ApiProperty({ type: [String], description: 'Channel IDs to load from channelIntelligence.' })
  @IsArray()
  @IsString({ each: true })
  channelIds: string[];
}

export class RecordPromotionSendRequestDto {
  @ApiProperty({ description: 'Telegram channel ID that received the promotion.' })
  @IsString()
  channelId: string;

  @ApiProperty({ description: 'Promote mobile that sent the message.' })
  @IsString()
  mobile: string;

  @ApiProperty({ description: 'Owning client ID for the promote mobile.' })
  @IsString()
  clientId: string;
}

export class AttributeConversionRequestDto {
  @ApiProperty({ type: [String], description: 'Common channel IDs returned by messages.GetCommonChats.' })
  @IsArray()
  @IsString({ each: true })
  commonChatIds: string[];

  @ApiPropertyOptional({ description: 'User chat ID to stamp attribution fields on userData.' })
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional({ description: 'User profile/dbcoll to scope attribution writes on userData.' })
  @IsOptional()
  @IsString()
  profile?: string;

  @ApiPropertyOptional({ description: 'Whether this conversion became paid revenue.', default: false })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}

export class RecordChannelConversionRequestDto {
  @ApiPropertyOptional({ description: 'Fractional conversion weight to add.', default: 1 })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ description: 'Also increment paid conversion weight.', default: false })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}
