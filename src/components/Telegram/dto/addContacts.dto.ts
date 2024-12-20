import { ApiProperty } from "@nestjs/swagger";

export class AddContactsDto {
    @ApiProperty({
        description: 'The mobile number of the user for authentication',
        example: '+1234567890',
    })
    mobile: string;

    @ApiProperty({
        description: 'List of phone numbers to add as contacts',
        type: Object,
        example: [
            "919892184284", "919967837841", "919972600626",
        ],
    })
    phoneNumbers: string[];

    @ApiProperty({
        description: 'Prefix for automated contact names',
        example: 'Contact',
    })
    prefix: string;
}