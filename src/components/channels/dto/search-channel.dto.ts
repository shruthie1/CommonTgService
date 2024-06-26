import { ApiPropertyOptional } from '@nestjs/swagger';

export class SearchChannelDto {
  @ApiPropertyOptional({
    description: 'Unique identifier for the channel',
    example: '803387987',
  })
  channelId?: string;

  @ApiPropertyOptional({
    description: 'Title of the channel',
    example: 'Earn money with Ayesha',
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'privacy of the channel',
    example: false,
  })
  private?: string;

  @ApiPropertyOptional({
    description: 'Username of the channel',
    example: 'ayesha_channel',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Indicates if the channel can send messages',
    example: true,
  })
  canSendMsgs?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum number of participants in the channel',
    example: 10,
  })
  minParticipantsCount?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of participants in the channel',
    example: 100,
  })
  maxParticipantsCount?: number;
}
