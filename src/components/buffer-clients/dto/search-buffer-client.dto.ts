import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SearchBufferClientDto {
  @ApiPropertyOptional({ description: 'Mobile number to search for.'})
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'Owning client ID to filter by.'})
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Telegram account ID.'})
  @IsOptional()
  @IsString()
  tgId?: string;

  @ApiPropertyOptional({ description: 'Operational status filter.', enum: ['active', 'inactive'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Username to search for.'})
  @IsOptional()
  @IsString()
  username?: string;
}
