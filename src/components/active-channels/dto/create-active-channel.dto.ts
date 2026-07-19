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
  reactRestricted?: boolean = false;

  @ApiProperty()
  title: string;

  @ApiProperty()
  username: string;

  // REMOVED recentUniqueUsers / lastUniqueUserCheckAt — dead activity-probe fields (see schema).

  @ApiProperty({ type: [String] })
  availableMsgs?: string[];

  @ApiProperty({ default: false })
  banned?: boolean = false;

  @ApiProperty({ type: Number, required: false, nullable: true, default: null })
  bannedAt?: number | null = null;

  @ApiProperty({ default: true, required: false })
  megagroup?: boolean;

  @ApiProperty({ required: false, default: null })
  accessHash?: string | null;

  @ApiProperty({ default: false, required: false })
  forbidden?: boolean

  @ApiProperty({
    description: 'Whether the channel is private',
    required: false })
  private: boolean = false;

  @ApiProperty({ required: false, default: null })
  lastHydrationReason?: string | null;

  @ApiProperty({ required: false, default: null })
  lastHydrationStatus?: string | null;

  @ApiProperty({ required: false, type: Number, default: null })
  lastHydratedAt?: number | null;

  @ApiProperty({ required: false, type: Number, default: null })
  lastLiveCheckedAt?: number | null;

  @ApiProperty({ required: false, type: Number, default: 0 })
  successMsgCount?: number;

  @ApiProperty({ required: false, type: Number, default: 0 })
  failureMsgCount?: number;

  @ApiProperty({ required: false, type: Number, default: 0 })
  followupMsgSuccessCount?: number;

  @ApiProperty({ required: false, type: Number, default: 0 })
  followupMsgFailureCount?: number;

  @ApiProperty({ required: false, type: Number, default: 0 })
  deletedCount?: number;

  @ApiProperty({ required: false, type: Number })
  freeformDeletedCount?: number;

  @ApiProperty({ required: false, type: Number })
  followUpDeletedCount?: number;

  @ApiProperty({ required: false, type: Number, default: null })
  lastMessageTime?: number | null;

  @ApiProperty({ required: false, type: String, default: null })
  messageIndex?: string | null;

  @ApiProperty({ required: false, type: Number, default: null })
  messageId?: number | null;

  @ApiProperty({ required: false, type: String })
  message?: string;

  // REMOVED starred / score — dead fields (see schema). channel starred was never set true and score
  // had no writer/reader; both were Mongoose default artifacts polluting the shared collection.
}
