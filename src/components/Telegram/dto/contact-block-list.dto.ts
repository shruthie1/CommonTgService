import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean } from 'class-validator';

export class ContactBlockListDto {
    @ApiProperty({ description: 'List of user IDs to block/unblock' })
    @IsArray()
    userIds: string[];

    @ApiProperty({ description: 'Whether to block (true) or unblock (false) the users' })
    @IsBoolean()
    block: boolean;
}