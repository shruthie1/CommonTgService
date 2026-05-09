import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsBoolean, IsString, Matches } from 'class-validator';
import { CANONICAL_MOBILE_REGEX, normalizeMobileInput } from '../../shared/mobile-utils';

export class SearchUserDto {
  @ApiPropertyOptional({ description: 'Telegram ID' })
  @IsOptional()
  @IsString()
  tgId?: string;

  @ApiPropertyOptional({ description: 'Mobile number' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => typeof value === 'string' ? normalizeMobileInput(value) : value)
  @IsString()
  @Matches(CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' })
  mobile?: string;

  @ApiPropertyOptional({ description: '2FA status' })
  @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  twoFA?: boolean;

  @ApiPropertyOptional({ description: 'Expiration status' })
  @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  expired?: boolean;

  @ApiPropertyOptional({ description: 'Session string' })
  @IsOptional()
  @IsString()
  session?: string;

  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Telegram username' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Gender' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Demo given status' })
  @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  demoGiven?: boolean;

  @ApiPropertyOptional({ description: 'Starred status' })
  @Transform(({ value }: TransformFnParams) => value === 'true' || value === true)
  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}
