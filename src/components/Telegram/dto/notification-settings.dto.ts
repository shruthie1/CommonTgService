import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum NotificationSound {
  DEFAULT = 'default',
  NONE = 'none',
  CUSTOM = 'custom'
}

export class NotificationSettingsDto {
  @ApiProperty({ description: 'Show message previews in notifications', default: true })
  @IsBoolean()
  @IsOptional()
  showPreviews?: boolean;

  @ApiProperty({ description: 'Silent notifications', default: false })
  @IsBoolean()
  @IsOptional()
  silent?: boolean;

  @ApiProperty({ description: 'Notification sound', enum: NotificationSound, default: NotificationSound.DEFAULT })
  @IsEnum(NotificationSound)
  @IsOptional()
  sound?: NotificationSound;

  @ApiProperty({ description: 'Mute until specific timestamp', required: false })
  @IsNumber()
  @IsOptional()
  muteUntil?: number;
}

export class ChatNotificationSettingsDto {
  @ApiProperty({ description: 'Chat ID to update settings for' })
  @IsString()
  chatId: string;

  @ApiProperty({ type: NotificationSettingsDto })
  settings: NotificationSettingsDto;
}