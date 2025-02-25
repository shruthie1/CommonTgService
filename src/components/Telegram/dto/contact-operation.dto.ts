import { IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export interface ContactData {
    mobile: string;
    tgId: string;
}

export class AddContactDto {
    @ApiProperty({ description: 'Mobile number' })
    @IsString()
    mobile: string;

    @ApiProperty({ description: 'Contact data', type: [Object] })
    @IsArray()
    data: ContactData[];

    @ApiProperty({ description: 'Name prefix for contacts' })
    @IsString()
    prefix: string;
}

export class AddContactsDto {
    @ApiProperty({ description: 'Mobile number' })
    @IsString()
    mobile: string;

    @ApiProperty({ description: 'Phone numbers to add', type: [String] })
    @IsArray()
    phoneNumbers: string[];

    @ApiProperty({ description: 'Name prefix for contacts' })
    @IsString()
    prefix: string;
}