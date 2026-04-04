import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { SearchClientDto } from './search-client.dto';

export class EnhancedSearchClientDto extends PartialType(SearchClientDto) {
  @ApiPropertyOptional({ description: 'Promote mobile number to search assigned client mappings for.' })
  @Transform(({ value }: TransformFnParams) => value?.trim())
  @IsOptional()
  @IsString()
  promoteMobileNumber?: string;
}
