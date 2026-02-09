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

  @ApiProperty({
    description: 'Whether the channel is private',
    example: false,
    required: false,
  })
  private: boolean = false;

  @ApiProperty({
    default: false, example: false,
    required: false,
  })
  forbidden: boolean = false;

  @ApiProperty({
    description: 'Whether the channel is a megagroup',
    default: true,
    required: false,
  })
  megagroup?: boolean;

  @ApiProperty({
    description: 'Whether react is restricted',
    default: false,
    required: false,
  })
  reactRestricted?: boolean = false;

  @ApiProperty({ description: 'Word restriction count', default: 0, required: false })
  wordRestriction?: number = 0;

  @ApiProperty({ description: 'DM restriction count', default: 0, required: false })
  dMRestriction?: number = 0;

  @ApiProperty({ description: 'Available messages', type: [String], required: false })
  availableMsgs?: string[];

  @ApiProperty({ description: 'Whether the channel is banned', default: false, required: false })
  banned?: boolean = false;

  @ApiProperty({ description: 'Starred status', default: false, required: false })
  starred?: boolean = false;

  @ApiProperty({ description: 'Channel score', default: 0, required: false })
  score?: number = 0;
}
