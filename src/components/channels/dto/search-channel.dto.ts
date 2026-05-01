import { ApiPropertyOptional } from '@nestjs/swagger';

export class SearchChannelDto {
  @ApiPropertyOptional({
    description: 'Unique identifier for the channel' })
  channelId?: string;

  @ApiPropertyOptional({
    description: 'Title of the channel' })
  title?: string;

  @ApiPropertyOptional({
    description: 'privacy of the channel' })
  private?: string;

  @ApiPropertyOptional({
    description: 'Username of the channel' })
  username?: string;

  @ApiPropertyOptional({
    description: 'Indicates if the channel can send messages' })
  canSendMsgs?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum number of participants in the channel' })
  minParticipantsCount?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of participants in the channel' })
  maxParticipantsCount?: number;
}
