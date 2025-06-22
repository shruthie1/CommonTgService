import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class GetDynamicDataDto {
  @ApiProperty({
    description: 'Path to retrieve specific data using dot notation',
    example: 'profile.name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]+([\._][a-zA-Z0-9]+)*$/, {
    message: 'Invalid path format. Use dot notation (e.g., profile.name)',
  })
  readonly path?: string;
}
