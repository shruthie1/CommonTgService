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
    description: 'Indicates if the channel can send messages' })
  canSendMsgs: boolean;

  @ApiProperty({
    description: 'Number of participants in the channel' })
  participantsCount: number;

  @ApiProperty({
    description: 'Whether the channel is restricted',
    required: false })
  restricted?: boolean;

  @ApiProperty({
    description: 'Whether the channel can send messages',
    required: false })
  sendMessages?: boolean;

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
