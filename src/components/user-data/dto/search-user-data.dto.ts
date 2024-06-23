import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';

export class SearchDto {
  @ApiPropertyOptional({ description: 'Total count', type: Number })
  totalCount?: number;

  @ApiPropertyOptional({ description: 'Picture count', type: Number })
  picCount?: number;

  @ApiPropertyOptional({ description: 'Last message timestamp', type: Number })
  lastMsgTimeStamp?: number;

  @ApiPropertyOptional({ description: 'Limit time', type: Number })
  limitTime?: number;

  @ApiPropertyOptional({ description: 'Paid count', type: Number })
  paidCount?: number;

  @ApiPropertyOptional({ description: 'Profile count', type: Number })
  prfCount?: number;

  @ApiPropertyOptional({ description: 'Can reply', type: Number })
  canReply?: number;

  @ApiPropertyOptional({ description: 'Pay amount', type: Number })
  payAmount?: number;

  @ApiPropertyOptional({ description: 'Username' })
  username?: string;

  @ApiPropertyOptional({ description: 'Access hash' })
  accessHash?: string;

  @ApiPropertyOptional({ description: 'Paid reply status', type: Boolean })
  paidReply?: boolean;

  @ApiPropertyOptional({ description: 'Demo given status', type: Boolean })
  demoGiven?: boolean;

  @ApiPropertyOptional({ description: 'Second show status', type: Boolean })
  secondShow?: boolean;

  @ApiPropertyOptional({ description: 'Profile name' })
  @Transform(({ value }: TransformFnParams) => value?.trim().toLowerCase())
  profile?: string;

  @ApiPropertyOptional({ description: 'Chat ID' })
  chatId?: string;
}
