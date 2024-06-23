import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsOptional, IsBoolean, IsNumber, IsString } from 'class-validator';

export class SearchUserDto {
  @ApiPropertyOptional({ description: 'Filter by Telegram ID' })
  @IsOptional()
  @IsString()
  tgId?: string;

  @ApiPropertyOptional({ description: 'Filter by mobile number' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'Filter by twoFA status', type: Boolean })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  twoFA?: boolean;

  @ApiPropertyOptional({ description: 'Filter by session' })
  @IsOptional()
  @IsString()
  session?: string;

  @ApiPropertyOptional({ description: 'Filter by first name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Filter by last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Filter by username' })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ description: 'Filter by channels count' })
  @IsOptional()
  @IsNumber()
  channels?: number;

  @ApiPropertyOptional({ description: 'Filter by personal chats count' })
  @IsOptional()
  @IsNumber()
  personalChats?: number;

  @ApiPropertyOptional({ description: 'Filter by demo given status', type: Boolean })
  @Transform(({ value }) => value === 'true' || value === '1' || value === true)
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  demoGiven?: boolean;

  @ApiPropertyOptional({ description: 'Filter by messages count' })
  @IsOptional()
  @IsNumber()
  msgs?: number;

  @ApiPropertyOptional({ description: 'Filter by total chats count' })
  @IsOptional()
  @IsNumber()
  totalChats?: number;

  @ApiPropertyOptional({ description: 'Filter by last active timestamp' })
  @IsOptional()
  @IsNumber()
  lastActive?: number;

  @ApiPropertyOptional({ description: 'Filter by date' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: 'Filter by last updated timestamp' })
  @IsOptional()
  @IsString()
  lastUpdated?: string;

  @ApiPropertyOptional({ description: 'Filter by movie count' })
  @IsOptional()
  @IsNumber()
  movieCount?: number;

  @ApiPropertyOptional({ description: 'Filter by photo count' })
  @IsOptional()
  @IsNumber()
  photoCount?: number;

  @ApiPropertyOptional({ description: 'Filter by video count' })
  @IsOptional()
  @IsNumber()
  videoCount?: number;

  @ApiPropertyOptional({ description: 'Filter by gender' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Filter by username' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Filter by other photo count' })
  @IsOptional()
  @IsNumber()
  otherPhotoCount?: number;

  @ApiPropertyOptional({ description: 'Filter by other video count' })
  @IsOptional()
  @IsNumber()
  otherVideoCount?: number;

  @ApiPropertyOptional({ description: 'Filter by own photo count' })
  @IsOptional()
  @IsNumber()
  ownPhotoCount?: number;

  @ApiPropertyOptional({ description: 'Filter by own video count' })
  @IsOptional()
  @IsNumber()
  ownVideoCount?: number;
}
