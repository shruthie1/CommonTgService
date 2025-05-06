import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateUsernameDto {
  @ApiProperty({
    description: 'New username to set for the Telegram user',
    example: 'new_username123',
  })
  @IsString()
  newUsername: string;
}
