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
  reactRestricted?: boolean = false;

  @ApiProperty()
  title: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ default: 0 })
  wordRestriction?: number = 0;

  @ApiProperty({ default: 0 })
  dMRestriction?: number = 0;

  @ApiProperty({ type: [String], default: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"] })
  availableMsgs?: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];

  @ApiProperty({
    type: [String], default: [
      '❤', '🔥', '👏', '🥰', '😁', '🤔',
      '🤯', '😱', '🤬', '😢', '🎉', '🤩',
      '🤮', '💩', '🙏', '👌', '🕊', '🤡',
      '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
      '🤣', '💔', '🏆', '😭', '😴', '👍',
      '🌚', '⚡', '🍌', '😐', '💋', '👻',
      '👀', '🙈', '🤝', '🤗', '🆒',
      '🗿', '🙉', '🙊', '🤷', '👎'
    ]
  })
  reactions?: string[] = [
    '❤', '🔥', '👏', '🥰', '😁', '🤔',
    '🤯', '😱', '🤬', '😢', '🎉', '🤩',
    '🤮', '💩', '🙏', '👌', '🕊', '🤡',
    '🥱', '🥴', '😍', '🐳', '❤‍🔥', '💯',
    '🤣', '💔', '🏆', '😭', '😴', '👍',
    '🌚', '⚡', '🍌', '😐', '💋', '👻',
    '👀', '🙈', '🤝', '🤗', '🆒',
    '🗿', '🙉', '🙊', '🤷', '👎'
  ];

  @ApiProperty({ default: false })
  banned?: boolean = false;

  @ApiProperty({ default: true, required: false })
  megagroup?: boolean;
}
