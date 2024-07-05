import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsNumber } from 'class-validator';

export class SearchBufferClientDto {
  @ApiPropertyOptional({
    description: 'Telegram ID of the client',
    example: '123456789',
  })
  @IsOptional()
  @IsString()
  readonly tgId?: string;

  @ApiPropertyOptional({
    description: 'Mobile number of the client',
    example: '+1234567890',
  })
  @IsOptional()
  @IsString()
  readonly mobile?: string;

  @ApiPropertyOptional({
    description: 'availableDate of the bufferClient',
    example: '2023-06-22',
  })
  @IsOptional()
  @IsString()
  readonly availableDate?: string;

  @ApiPropertyOptional({
    description: 'Session identifier',
    example: 'session123',
  })
  @IsOptional()
  @IsString()
  readonly session?: string;

  @ApiPropertyOptional({
    description: 'Channel Count',
    example: 23,
    type: Number
  })
  @IsNumber()
  readonly channels?: number;
}
