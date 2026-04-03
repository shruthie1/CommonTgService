import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class SearchBufferClientDto {
  @ApiPropertyOptional({ description: 'Mobile number to search for.', example: '+15551234567' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'Owning client ID to filter by.', example: 'client-a' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Username to search for.', example: 'sample_user' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Display name to search for.', example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Channel link to search for.', example: 'https://t.me/example' })
  @IsOptional()
  @IsString()
  channelLink?: string;

  @ApiPropertyOptional({ description: 'Repl link to search for.', example: 'https://replit.com/@team/demo' })
  @IsOptional()
  @IsString()
  repl?: string;

  @ApiPropertyOptional({ description: 'Filter by active status.', example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by Telegram account ID.', example: '123456789' })
  @IsOptional()
  @IsString()
  tgId?: string;
}
