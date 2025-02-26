import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

type PrivacyLevel = 'everybody' | 'contacts' | 'nobody';

export class UpdateProfileDto {
  @ApiProperty({ description: 'First name to set' })
  @IsString()
  firstName: string;

  @ApiProperty({ description: 'Last name', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ description: 'About/bio text', required: false })
  @IsOptional()
  @IsString()
  about?: string;
}

export class PrivacySettingsDto {
  @ApiProperty({ description: 'Phone number visibility', enum: ['everybody', 'contacts', 'nobody'], required: false })
  @IsOptional()
  @IsEnum(['everybody', 'contacts', 'nobody'])
  phoneNumber?: PrivacyLevel;

  @ApiProperty({ description: 'Last seen visibility', enum: ['everybody', 'contacts', 'nobody'], required: false })
  @IsOptional()
  @IsEnum(['everybody', 'contacts', 'nobody'])
  lastSeen?: PrivacyLevel;

  @ApiProperty({ description: 'Profile photos visibility', enum: ['everybody', 'contacts', 'nobody'], required: false })
  @IsOptional()
  @IsEnum(['everybody', 'contacts', 'nobody'])
  profilePhotos?: PrivacyLevel;

  @ApiProperty({ description: 'Message forwards visibility', enum: ['everybody', 'contacts', 'nobody'], required: false })
  @IsOptional()
  @IsEnum(['everybody', 'contacts', 'nobody'])
  forwards?: PrivacyLevel;

  @ApiProperty({ description: 'Calls privacy', enum: ['everybody', 'contacts', 'nobody'], required: false })
  @IsOptional()
  @IsEnum(['everybody', 'contacts', 'nobody'])
  calls?: PrivacyLevel;

  @ApiProperty({ description: 'Group chats privacy', enum: ['everybody', 'contacts', 'nobody'], required: false })
  @IsOptional()
  @IsEnum(['everybody', 'contacts', 'nobody'])
  groups?: PrivacyLevel;
}

export class SecuritySettingsDto {
  @ApiProperty({ description: 'Enable/disable two-factor authentication' })
  @IsBoolean()
  twoFactorAuth: boolean;

  @ApiProperty({ description: 'Active sessions limit', required: false })
  @IsOptional()
  @IsEnum([1, 2, 3, 4, 5])
  activeSessionsLimit?: number;
}

export class ProfilePhotoDto {
  @ApiProperty({ description: 'Name/identifier of the photo to set' })
  @IsString()
  name: string;
}