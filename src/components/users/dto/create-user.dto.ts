import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserStatsDto {
  @ApiProperty({ description: 'Channel count' })
  channels: number = 0;

  @ApiProperty({ description: 'Personal chat count' })
  personalChats: number = 0;

  @ApiProperty({ description: 'Total chat count' })
  totalChats: number = 0;

  @ApiProperty({ description: 'Contact count' })
  contacts: number = 0;

  @ApiProperty({ description: 'Message count' })
  msgs: number = 0;

  @ApiProperty({ description: 'Total photo count' })
  photoCount: number = 0;

  @ApiProperty({ description: 'Total video count' })
  videoCount: number = 0;

  @ApiProperty({ description: 'Movie file count' })
  movieCount: number = 0;

  @ApiProperty({ description: 'Sent photo count' })
  ownPhotoCount: number = 0;

  @ApiProperty({ description: 'Received photo count' })
  otherPhotoCount: number = 0;

  @ApiProperty({ description: 'Sent video count' })
  ownVideoCount: number = 0;

  @ApiProperty({ description: 'Received video count' })
  otherVideoCount: number = 0;

  @ApiPropertyOptional({ description: 'Last active timestamp' })
  lastActive: string | null = null;
}

export class UserCallsDto {
  @ApiProperty({ description: 'Total calls' })
  totalCalls: number = 0;

  @ApiProperty({ description: 'Outgoing calls' })
  outgoing: number = 0;

  @ApiProperty({ description: 'Incoming calls' })
  incoming: number = 0;

  @ApiProperty({ description: 'Video calls' })
  video: number = 0;

  @ApiProperty({ description: 'Audio calls' })
  audio: number = 0;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Mobile number' })
  mobile: string;

  @ApiProperty({ description: 'Telegram session string' })
  session: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name' })
  lastName?: string | null;

  @ApiPropertyOptional({ description: 'Telegram username' })
  username?: string | null;

  @ApiProperty({ description: 'Telegram user ID' })
  tgId: string;

  @ApiPropertyOptional({ description: 'Gender' })
  gender?: string | null;

  @ApiProperty({ description: '2FA enabled' })
  twoFA: boolean = false;

  @ApiProperty({ description: 'Account expired' })
  expired: boolean = false;

  @ApiProperty({ description: '2FA password' })
  password: string = null;

  @ApiPropertyOptional({ description: 'Account statistics' })
  stats?: UserStatsDto = new UserStatsDto();

  @ApiPropertyOptional({ description: 'Call statistics' })
  calls?: UserCallsDto = new UserCallsDto();
}
