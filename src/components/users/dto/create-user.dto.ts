import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UserCallsDto {
  @ApiPropertyOptional({ description: 'Total calls', default: 0 })
  @IsOptional()
  @IsNumber()
  totalCalls: number = 0;

  @ApiPropertyOptional({ description: 'Outgoing calls', default: 0 })
  @IsOptional()
  @IsNumber()
  outgoing: number = 0;

  @ApiPropertyOptional({ description: 'Incoming calls', default: 0 })
  @IsOptional()
  @IsNumber()
  incoming: number = 0;

  @ApiPropertyOptional({ description: 'Video calls', default: 0 })
  @IsOptional()
  @IsNumber()
  video: number = 0;

  @ApiPropertyOptional({ description: 'Audio calls', default: 0 })
  @IsOptional()
  @IsNumber()
  audio: number = 0;
}

export class CreateUserDto {
  @ApiProperty({ description: 'Mobile number' })
  @IsString()
  mobile: string;

  @ApiProperty({ description: 'Telegram session string' })
  @IsString()
  session: string;

  @ApiProperty({ description: 'First name' })
  @IsString()
  firstName: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  lastName?: string | null;

  @ApiPropertyOptional({ description: 'Telegram username' })
  @IsOptional()
  @IsString()
  username?: string | null;

  @ApiProperty({ description: 'Telegram user ID' })
  @IsString()
  tgId: string;

  @ApiPropertyOptional({ description: 'Gender' })
  @IsOptional()
  @IsString()
  gender?: string | null;

  @ApiPropertyOptional({ description: '2FA enabled', default: false })
  @IsOptional()
  @IsBoolean()
  twoFA: boolean = false;

  @ApiPropertyOptional({ description: 'Account expired', default: false })
  @IsOptional()
  @IsBoolean()
  expired: boolean = false;

  @ApiPropertyOptional({ description: '2FA password' })
  @IsOptional()
  @IsString()
  password: string = null;

  @ApiPropertyOptional({ description: 'Channel count', default: 0 })
  @IsOptional()
  @IsNumber()
  channels: number = 0;

  @ApiPropertyOptional({ description: 'Personal chat count', default: 0 })
  @IsOptional()
  @IsNumber()
  personalChats: number = 0;

  @ApiPropertyOptional({ description: 'Total chat count', default: 0 })
  @IsOptional()
  @IsNumber()
  totalChats: number = 0;

  @ApiPropertyOptional({ description: 'Contact count', default: 0 })
  @IsOptional()
  @IsNumber()
  contacts: number = 0;

  @ApiPropertyOptional({ description: 'Message count', default: 0 })
  @IsOptional()
  @IsNumber()
  msgs: number = 0;

  @ApiPropertyOptional({ description: 'Total photo count', default: 0 })
  @IsOptional()
  @IsNumber()
  photoCount: number = 0;

  @ApiPropertyOptional({ description: 'Total video count', default: 0 })
  @IsOptional()
  @IsNumber()
  videoCount: number = 0;

  @ApiPropertyOptional({ description: 'Movie file count', default: 0 })
  @IsOptional()
  @IsNumber()
  movieCount: number = 0;

  @ApiPropertyOptional({ description: 'Sent photo count', default: 0 })
  @IsOptional()
  @IsNumber()
  ownPhotoCount: number = 0;

  @ApiPropertyOptional({ description: 'Received photo count', default: 0 })
  @IsOptional()
  @IsNumber()
  otherPhotoCount: number = 0;

  @ApiPropertyOptional({ description: 'Sent video count', default: 0 })
  @IsOptional()
  @IsNumber()
  ownVideoCount: number = 0;

  @ApiPropertyOptional({ description: 'Received video count', default: 0 })
  @IsOptional()
  @IsNumber()
  otherVideoCount: number = 0;

  @ApiPropertyOptional({ description: 'Last active timestamp' })
  @IsOptional()
  @IsString()
  lastActive: string | null = null;

  @ApiPropertyOptional({ description: 'Call statistics' })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserCallsDto)
  calls?: UserCallsDto = new UserCallsDto();
}
