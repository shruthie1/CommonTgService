import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PrivacyLevel, PrivacyLevelEnum } from '../../../interfaces/telegram';

export class UpdateProfileDto {
  @ApiProperty({ description: 'First name' })
  @IsString()
  firstName: string;

  @ApiProperty({ description: 'About/bio information', required: false })
  @IsOptional()
  @IsString()
  about?: string;
}

export class PrivacySettingsDto {
  @ApiProperty({ description: 'Phone number visibility', enum: PrivacyLevelEnum, required: false })
  @IsOptional()
  @IsEnum(PrivacyLevelEnum)
  phoneNumber?: PrivacyLevel;

  @ApiProperty({ description: 'Last seen visibility', enum: PrivacyLevelEnum, required: false })
  @IsOptional()
  @IsEnum(PrivacyLevelEnum)
  lastSeen?: PrivacyLevel;

  @ApiProperty({ description: 'Profile photos visibility', enum: PrivacyLevelEnum, required: false })
  @IsOptional()
  @IsEnum(PrivacyLevelEnum)
  profilePhotos?: PrivacyLevel;

  @ApiProperty({ description: 'Message forwards visibility', enum: PrivacyLevelEnum, required: false })
  @IsOptional()
  @IsEnum(PrivacyLevelEnum)
  forwards?: PrivacyLevel;

  @ApiProperty({ description: 'Calls privacy', enum: PrivacyLevelEnum, required: false })
  @IsOptional()
  @IsEnum(PrivacyLevelEnum)
  calls?: PrivacyLevel;

  @ApiProperty({ description: 'Group chats privacy', enum: PrivacyLevelEnum, required: false })
  @IsOptional()
  @IsEnum(PrivacyLevelEnum)
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