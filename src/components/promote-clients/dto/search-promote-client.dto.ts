import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class SearchPromoteClientDto {
  @ApiPropertyOptional({
    description: 'Telegram account identifier.',
    example: '123456789',
  })
  @IsOptional()
  @IsString()
  readonly tgId?: string;

  @ApiPropertyOptional({
    description: 'Mobile number of the promote client.',
    example: '+1234567890',
  })
  @IsOptional()
  @IsString()
  readonly mobile?: string;

  @ApiPropertyOptional({
    description: 'Availability date filter.',
    example: '2026-04-03',
  })
  @IsOptional()
  @IsString()
  readonly availableDate?: string;

  @ApiPropertyOptional({
    description: 'Exact channel count filter.',
    example: 23,
    type: Number
  })
  @IsOptional()
  @Transform(({ value }) => value === undefined ? value : Number(value))
  @IsNumber()
  readonly channels?: number;
}
