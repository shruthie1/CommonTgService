import { IsString, IsOptional, IsArray, IsBoolean, IsEnum } from 'class-validator';
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

export type ExportFormat = 'vcard' | 'csv';

export class ContactExportImportDto {
  @ApiProperty({ enum: ['vcard', 'csv'], description: 'Export format type' })
  @IsEnum(['vcard', 'csv'] as const)
  format: ExportFormat;

  @ApiProperty({ description: 'Whether to include blocked contacts', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeBlocked = false;
}

interface ContactData {
  firstName: string;
  lastName?: string;
  phone: string;
}

export class ContactImportDto {
  @ApiProperty({ description: 'Contacts to import', type: [Object] })
  @IsArray()
  contacts: ContactData[];
}