import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsNumber, IsString, IsBoolean } from 'class-validator';

export class SearchBufferClientDto {
  @ApiPropertyOptional({ description: 'Mobile number to search for' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'Client ID to search for' })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Username to search for' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Name to search for' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Channel link to search for' })
  @IsOptional()
  @IsString()
  channelLink?: string;

  @ApiPropertyOptional({ description: 'Repl link to search for' })
  @IsOptional()
  @IsString()
  repl?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by tgId' })
  @IsOptional()
  @IsString()
  tgId?: string;
}
