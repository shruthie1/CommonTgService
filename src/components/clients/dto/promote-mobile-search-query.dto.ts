import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class PromoteMobileSearchQueryDto {
  @ApiProperty({ description: 'Promote mobile number to search for.', example: '916265240911' })
  @Transform(({ value }: TransformFnParams) => value?.trim())
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
  mobile: string;
}
