import { ApiProperty } from '@nestjs/swagger';

export class ScheduleEventsDto {
  @ApiProperty({})
  chatId: string;

  @ApiProperty({})
  profile: string;

  @ApiProperty({ enum: ['1', '2', '3'], required: false })
  type?: string;
}
