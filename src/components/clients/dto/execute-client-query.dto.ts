import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class ExecuteClientQueryDto {
  @ApiProperty({ description: 'MongoDB filter object', type: 'object', additionalProperties: true })
  @IsObject()
  query: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Sort specification', type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  sort?: Record<string, 1 | -1 | 'asc' | 'desc'>;

  @ApiPropertyOptional({ description: 'Max results to return', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Results to skip', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
