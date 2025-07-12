import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDynamicDataDto {
  @ApiProperty({
    description: 'Unique identifier for the dynamic data',
    example: 'user123',
  })
  @IsString()
  @IsNotEmpty()
  readonly configKey: string;

  @ApiProperty({
    description: 'Dynamic JSON data',
    example: {
      profile: {
        name: 'John Doe',
        age: 30,
      },
      preferences: {
        theme: 'dark',
        notifications: true,
      },
    },
  })
  @IsNotEmpty()
  readonly data: any;
}
