import { ApiProperty } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: '123456789' })
  chatId: string;

  @ApiProperty({ example: 1700000000000 })
  time: number;

  @ApiProperty({ enum: ['call', 'message'] })
  type: 'call' | 'message';

  @ApiProperty({ example: 'shruthi1' })
  profile: string;

  @ApiProperty({ example: { message: 'Hello' }, required: false })
  payload?: any;
}
