import { ApiProperty } from "@nestjs/swagger";

export class AddContactDto {
    @ApiProperty({
        description: 'The mobile number of the user for authentication',
        example: '+1234567890',
    })
    mobile: string;

    @ApiProperty({
        description: 'List of phone numbers to add as contacts',
        type: Object,
        example: [
            {
                mobile: '+1234567890',
                tgId: "1234567890"
            }
        ],
    })
    data: { mobile: string, tgId: string }[];

    @ApiProperty({
        description: 'Prefix for automated contact names',
        example: 'Contact',
    })
    prefix: string;
}