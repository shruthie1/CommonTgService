import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class ExecuteClientQueryDto {
  @ApiProperty({ type: 'object', additionalProperties: true, example: { clientId: 'client-a' } })
  @IsObject()
  query: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, example: { clientId: 1 } })
  @IsOptional()
  @IsObject()
  sort?: Record<string, 1 | -1 | 'asc' | 'desc'>;

  @ApiPropertyOptional({ example: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
