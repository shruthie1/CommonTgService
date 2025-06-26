import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SessionUpdateDto {
    @ApiProperty({ 
        example: '1BQANOTEuMTA4LjUg==', 
        description: 'New session token to set as primary session'
    })
    @IsNotEmpty()
    @IsString()
    readonly newSession: string;
}
