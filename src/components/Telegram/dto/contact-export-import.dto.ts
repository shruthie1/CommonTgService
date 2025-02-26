import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class ContactExportImportDto {
    @ApiProperty({ enum: ['vcard', 'csv'], description: 'Export format type' })
    @IsEnum(['vcard', 'csv'])
    format: 'vcard' | 'csv';

    @ApiProperty({ description: 'Whether to include blocked contacts', required: false, default: false })
    @IsBoolean()
    @IsOptional()
    includeBlocked?: boolean;
}