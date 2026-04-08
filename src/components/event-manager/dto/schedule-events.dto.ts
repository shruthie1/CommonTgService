import { ApiProperty } from '@nestjs/swagger';

export class ScheduleEventsDto {
  @ApiProperty({ example: '123456789' })
  chatId: string;

  @ApiProperty({ example: 'shruthi1' })
  profile: string;

  @ApiProperty({ example: '1', enum: ['1', '2', '3'], required: false })
  type?: string;
}
