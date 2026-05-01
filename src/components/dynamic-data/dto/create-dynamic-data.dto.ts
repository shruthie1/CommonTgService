import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDynamicDataDto {
  @ApiProperty({
    description: 'Unique identifier for the dynamic data' })
  @IsString()
  @IsNotEmpty()
  readonly configKey: string;

  @ApiProperty({
    description: 'Dynamic JSON data' })
  @IsNotEmpty()
  readonly data: any;
}
