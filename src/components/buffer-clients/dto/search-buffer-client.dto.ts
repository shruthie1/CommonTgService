import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';
import { CANONICAL_MOBILE_REGEX, normalizeMobileInput } from '../../shared/mobile-utils';

export class SearchBufferClientDto {
  @ApiPropertyOptional({ description: 'Mobile number to search for.'})
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => typeof value === 'string' ? normalizeMobileInput(value) : value)
  @IsString()
  @Matches(CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' })
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
