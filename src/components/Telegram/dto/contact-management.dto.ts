import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ContactGroupDto {
  @ApiProperty({ description: 'Name of the contact group' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'User IDs to include in the group', type: [String] })
  @IsArray()
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ description: 'Optional description for the group' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ContactBlockListDto {
  @ApiProperty({ description: 'User IDs to block/unblock', type: [String] })
  @IsArray()
  @IsString({ each: true })
  userIds: string[];

  @ApiProperty({ description: 'Whether to block or unblock the users' })
  @IsBoolean()
  block: boolean;
}

export class ContactExportImportDto {
  @ApiProperty({ description: 'Format of export/import (vcard/csv)', enum: ['vcard', 'csv'] })
  @IsString()
  format: 'vcard' | 'csv';

  @ApiProperty({ description: 'Whether to include blocked contacts' })
  @IsOptional()
  @IsBoolean()
  includeBlocked?: boolean;
}