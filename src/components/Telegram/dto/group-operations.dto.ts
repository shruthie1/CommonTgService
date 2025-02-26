import { IsString, IsOptional, IsNumber, IsBoolean, IsObject, ValidateNested, IsNotEmpty, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
export enum AdminPermission {
  CHANGE_INFO = 'changeInfo',
  POST_MESSAGES = 'postMessages',
  EDIT_MESSAGES = 'editMessages',
  DELETE_MESSAGES = 'deleteMessages',
  BAN_USERS = 'banUsers',
  INVITE_USERS = 'inviteUsers',
  PIN_MESSAGES = 'pinMessages',
  ADD_ADMINS = 'addAdmins',
  ANONYMOUS = 'anonymous',
  MANAGE_CALL = 'manageCall'
}

export class AdminPermissionsDto {
  @ApiProperty({ description: 'Permission to change group info', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  changeInfo?: boolean = true;

  @ApiProperty({ description: 'Permission to post messages', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  postMessages?: boolean = true;

  @ApiProperty({ description: 'Permission to edit messages', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  editMessages?: boolean = true;

  @ApiProperty({ description: 'Permission to delete messages', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  deleteMessages?: boolean = true;

  @ApiProperty({ description: 'Permission to ban users', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  banUsers?: boolean = true;

  @ApiProperty({ description: 'Permission to invite users', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  inviteUsers?: boolean = true;

  @ApiProperty({ description: 'Permission to pin messages', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  pinMessages?: boolean = true;

  @ApiProperty({ description: 'Permission to add new admins', default: false })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  addAdmins?: boolean = false;

  @ApiProperty({ description: 'Permission to remain anonymous', default: false })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  anonymous?: boolean = false;

  @ApiProperty({ description: 'Permission to manage voice chats', default: true })
  @IsOptional()
  @IsBoolean()
  @IsEnum(AdminPermission)
  manageCall?: boolean = true;
}

export class GroupSettingsDto {
  @ApiProperty({ description: 'Group ID for updates', required: true })
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({ description: 'Group title', required: true })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Group description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Address or location of the group', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Slow mode delay in seconds', required: false })
  @IsOptional()
  @IsNumber()
  slowMode?: number;

  @ApiProperty({ description: 'Whether the group is a megagroup', default: true })
  @IsOptional()
  @IsBoolean()
  megagroup?: boolean = true;

  @ApiProperty({ description: 'Whether the group is for import', default: false })
  @IsOptional()
  @IsBoolean()
  forImport?: boolean = false;

  @ApiProperty({ description: 'Member restrictions', required: false })
  @IsOptional()
  @IsObject()
  memberRestrictions?: {
    sendMessages?: boolean;
    sendMedia?: boolean;
    sendStickers?: boolean;
    sendGifs?: boolean;
    sendGames?: boolean;
    sendInline?: boolean;
    embedLinks?: boolean;
  };
}

export class GroupMemberOperationDto {
  @ApiProperty({ description: 'Group ID' })
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({ description: 'Array of user IDs', type: [String] })
  @IsString({ each: true })
  members: string[];
}

export class AdminOperationDto {
  @ApiProperty({ description: 'Group ID' })
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({ description: 'User ID to promote/demote' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Whether to promote or demote', required: true })
  @IsBoolean()
  isPromote: boolean;

  @ApiProperty({ description: 'Admin permissions', required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdminPermissionsDto)
  permissions?: AdminPermissionsDto;

  @ApiProperty({ description: 'Custom admin rank/title', required: false })
  @IsOptional()
  @IsString()
  rank?: string;
}

export class ChatCleanupDto {
  @ApiProperty({ description: 'Chat ID to clean up' })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiProperty({ description: 'Delete messages before this date', required: false })
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  beforeDate?: Date;

  @ApiProperty({ description: 'Only delete media messages', required: false })
  @IsOptional()
  @IsBoolean()
  onlyMedia?: boolean;

  @ApiProperty({ description: 'Exclude pinned messages', required: false })
  @IsOptional()
  @IsBoolean()
  excludePinned?: boolean;
}