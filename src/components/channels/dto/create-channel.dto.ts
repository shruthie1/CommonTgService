import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({
    description: 'Unique identifier for the channel',
    example: '803387987',
  })
  channelId: string;

  @ApiProperty({
    description: 'Whether the channel is a broadcast channel',
    example: null,
    required: false,
  })
  broadcast?: boolean;

  @ApiProperty({
    description: 'Indicates if the channel can send messages',
    example: true,
  })
  canSendMsgs: boolean;

  @ApiProperty({
    description: 'Whether the channel is a megagroup',
    example: null,
    required: false,
  })
  megagroup?: boolean;

  @ApiProperty({
    description: 'Number of participants in the channel',
    example: 0,
  })
  participantsCount: number;

  @ApiProperty({
    description: 'Whether the channel is restricted',
    example: null,
    required: false,
  })
  restricted?: boolean;

  @ApiProperty({
    description: 'Whether the channel can send messages',
    example: null,
    required: false,
  })
  sendMessages?: boolean;

  @ApiProperty({
    description: 'Title of the channel',
    example: 'Earn money with Ayesha',
  })
  title: string;

  @ApiProperty({
    description: 'Username of the channel',
    example: null,
    required: false,
  })
  username?: string;
}
