import { ApiProperty } from '@nestjs/swagger';

export class CreateArchivedClientDto {
    @ApiProperty({ example: '+916265240911', description: 'Phone number of the user' })
    readonly mobile: string;

    @ApiProperty({ example: '1BQANOTEuMTA4LjUg==', description: 'Current session token' })
    readonly session: string;

    @ApiProperty({ example: ['1BQANOTEuM==', '2CRANOTEuN=='], description: 'Array of old session tokens', required: false, type: [String] })
    readonly oldSessions?: string[];
}
