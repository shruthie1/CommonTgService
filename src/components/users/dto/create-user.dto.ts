import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'Mobile number of the user', example: '917330803480' })
  mobile: string;

  @ApiProperty({ description: 'Session information of the user', example: 'string' })
  session: string;

  @ApiProperty({ description: 'First name of the user', example: 'Praveen' })
  firstName: string;

  @ApiProperty({ description: 'Last name of the user', example: null })
  lastName?: string | null;

  @ApiProperty({ description: 'Username of the user', example: null })
  userName?: string | null;

  @ApiProperty({ description: 'Number of channels', example: 56 })
  channels: number;

  @ApiProperty({ description: 'Number of personal chats', example: 74 })
  personalChats: number;

  @ApiProperty({ description: 'Boolean flag indicating if demo was given', example: false })
  demoGiven: boolean;

  @ApiProperty({ description: 'Number of messages', example: 0 })
  msgs: number;

  @ApiProperty({ description: 'Total number of chats', example: 195 })
  totalChats: number;

  @ApiProperty({ description: 'Timestamp of last active', example: 1718260523 })
  lastActive: number;

  @ApiProperty({ description: 'Date of creation in YYYY-MM-DD format', example: '2024-06-03' })
  date: string;

  @ApiProperty({ description: 'Telegram ID of the user', example: '2022068676' })
  tgId: string;

  @ApiProperty({ description: 'Timestamp of last update', example: '2024-06-13' })
  lastUpdated: string;

  @ApiProperty({ description: 'Number of movies', example: 0 })
  movieCount: number;

  @ApiProperty({ description: 'Number of photos', example: 0 })
  photoCount: number;

  @ApiProperty({ description: 'Number of videos', example: 0 })
  videoCount: number;

  @ApiProperty({ description: 'Gender of the user', example: null })
  gender?: string | null;

  @ApiProperty({ description: 'Username of the user', example: null })
  username?: string | null;

  @ApiProperty({ description: 'Number of other photos', example: 0 })
  otherPhotoCount: number;

  @ApiProperty({ description: 'Number of other videos', example: 0 })
  otherVideoCount: number;

  @ApiProperty({ description: 'Number of own photos', example: 0 })
  ownPhotoCount: number;

  @ApiProperty({ description: 'Number of own videos', example: 0 })
  ownVideoCount: number;

  @ApiProperty({ description: 'Number of contacts', example: 105 })
  contacts: number;

  @ApiProperty({
    description: 'Call details of the user',
    example: {
      outgoing: 1,
      incoming: 0,
      video: 1,
      chatCallCounts: [],
      totalCalls: 1,
    },
  })
  calls: {
    outgoing: number;
    incoming: number;
    video: number;
    chatCallCounts: any[];
    totalCalls: number;
  };
}
