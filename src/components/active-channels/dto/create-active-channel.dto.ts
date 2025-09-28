import { ApiProperty } from '@nestjs/swagger';

export class CreateActiveChannelDto {
  @ApiProperty()
  channelId: string;

  @ApiProperty({ default: false })
  broadcast: boolean;

  @ApiProperty({ default: true })
  canSendMsgs: boolean;

  @ApiProperty({ default: 300 })
  participantsCount: number;

  @ApiProperty({ default: false })
  restricted: boolean;

  @ApiProperty({ default: true })
  sendMessages: boolean;

  @ApiProperty({ default: false })
  reactRestricted?: boolean = false;

  @ApiProperty()
  title: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ default: 0 })
  wordRestriction?: number = 0;

  @ApiProperty({ default: 0 })
  dMRestriction?: number = 0;

  @ApiProperty({ type: [String] })
  availableMsgs?: string[];

  @ApiProperty({ default: false })
  banned?: boolean = false;

  @ApiProperty({ default: true, required: false })
  megagroup?: boolean;

  @ApiProperty({ default: false, required: false })
  forbidden?: boolean

  @ApiProperty({
    description: 'Whether the channel is private',
    example: false,
    required: false,
  })
  private: boolean = false;
}
