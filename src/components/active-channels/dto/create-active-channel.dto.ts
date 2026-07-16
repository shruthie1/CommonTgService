import { ApiProperty } from '@nestjs/swagger';

export class CreateActiveChannelDto {
  @ApiProperty()
  channelId: string;

  @ApiProperty({ default: false })
  broadcast: boolean;

  @ApiProperty({ default: false })
  canSendMsgs: boolean;

  @ApiProperty({ default: 300 })
  participantsCount: number;

  @ApiProperty({ default: false })
  restricted: boolean;

  @ApiProperty({ default: false })
  sendMessages: boolean;

  @ApiProperty({ default: false })
  sendPlain?: boolean = false;

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

  // REMOVED recentUniqueUsers / lastUniqueUserCheckAt — dead activity-probe fields (see schema).

  @ApiProperty({ type: [String] })
  availableMsgs?: string[];

  @ApiProperty({ default: false })
  banned?: boolean = false;

  @ApiProperty({ type: Number, required: false, nullable: true, default: null })
  bannedAt?: number | null = null;

  @ApiProperty({ default: true, required: false })
  megagroup?: boolean;

  @ApiProperty({ default: false, required: false })
  forbidden?: boolean

  @ApiProperty({
    description: 'Whether the channel is private',
    required: false })
  private: boolean = false;

  // REMOVED starred / score — dead fields (see schema). channel starred was never set true and score
  // had no writer/reader; both were Mongoose default artifacts polluting the shared collection.
}
