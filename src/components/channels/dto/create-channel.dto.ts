import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({
    description: 'Unique identifier for the channel' })
  channelId: string;

  @ApiProperty({
    description: 'Whether the channel is a broadcast channel',
    required: false })
  broadcast?: boolean;

  @ApiProperty({
    description: 'Indicates if the channel can send messages',
    default: false,
    required: false })
  canSendMsgs?: boolean;

  @ApiProperty({
    description: 'Number of participants in the channel' })
  participantsCount: number;

  @ApiProperty({
    description: 'Title of the channel' })
  title: string;

  @ApiProperty({
    description: 'Username of the channel',
    required: false })
  username?: string;

  @ApiProperty({
    description: 'Whether the channel is private',
    required: false })
  private: boolean = false;

  @ApiProperty({
    default: false,
    required: false })
  forbidden: boolean = false;

  @ApiProperty({
    description: 'Whether the channel is a megagroup',
    default: true,
    required: false })
  megagroup?: boolean;

  @ApiProperty({
    description: 'Whether react is restricted',
    default: false,
    required: false })
  reactRestricted?: boolean = false;

  @ApiProperty({ description: 'Available messages', type: [String], required: false })
  availableMsgs?: string[];

  @ApiProperty({ description: 'Whether the channel is banned', default: false, required: false })
  banned?: boolean = false;

  @ApiProperty({ description: 'Timestamp when the channel was marked banned', type: Number, required: false, nullable: true, default: null })
  bannedAt?: number | null = null;

  @ApiProperty({ description: 'Starred status', default: false, required: false })
  starred?: boolean = false;

  @ApiProperty({ description: 'Channel score', default: 0, required: false })
  score?: number = 0;
}
