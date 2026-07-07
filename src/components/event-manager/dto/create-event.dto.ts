import { ApiProperty } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({})
  chatId: string;

  @ApiProperty({})
  time: number;

  @ApiProperty({ enum: ['call', 'message'] })
  type: 'call' | 'message';

  @ApiProperty({})
  clientId: string;

  @ApiProperty({ required: false })
  payload?: any;
}
