// src/activechannels/dto/create-activechannel.dto.ts
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
  reactRestricted?: boolean;

  @ApiProperty()
  title: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ default: 0 })
  wordRestriction?: number;

  @ApiProperty({ default: 0 })
  dMRestriction?: number;

  @ApiProperty({ type: [String], default: [] })
  availableMsgs?: string[];

  @ApiProperty({ type: [String], default: [] })
  reactions?: string[];

  @ApiProperty({ default: false })
  banned?: boolean;

  @ApiProperty({ default: true , required: false})
  megagroup?: boolean;
}
