import { IsString, IsArray, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export interface ContactData {
    mobile: string;
    tgId: string;
}

export class AddContactDto {
    @ApiProperty({ description: 'Contact data', type: [Object] })
    @IsArray()
    data: ContactData[];

    @ApiProperty({ description: 'Name prefix for contacts' })
    @IsString()
    prefix: string;
}

export class AddContactsDto {
    @ApiProperty({ description: 'Array of phone numbers to add', type: [String] })
    @IsArray()
    @IsString({ each: true })
    phoneNumbers: string[];

    @ApiProperty({ description: 'Optional prefix for phone numbers', required: false })
    @IsOptional()
    @IsString()
    prefix?: string;
}
