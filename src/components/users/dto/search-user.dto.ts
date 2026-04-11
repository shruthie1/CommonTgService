import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class SearchUserDto {
  @ApiPropertyOptional({ description: 'Telegram ID' })
  @IsOptional()
  @IsString()
  tgId?: string;

  @ApiPropertyOptional({ description: 'Mobile number' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: '2FA status' })
  @IsOptional()
  @IsBoolean()
  twoFA?: boolean;

  @ApiPropertyOptional({ description: 'Expiration status' })
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
