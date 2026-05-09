import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { CANONICAL_MOBILE_REGEX, normalizeMobileInput } from '../../shared/mobile-utils';

export class PromoteMobileSearchQueryDto {
  @ApiProperty({ description: 'Promote mobile number to search for.'})
  @Transform(({ value }: TransformFnParams) => typeof value === 'string' ? normalizeMobileInput(value) : value)
  @IsString()
  @Matches(CANONICAL_MOBILE_REGEX, { message: 'mobile must include country code and contain 11-15 digits' })
  mobile: string;
}
