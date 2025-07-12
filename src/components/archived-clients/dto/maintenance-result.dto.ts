import { ApiProperty } from '@nestjs/swagger';

export class MaintenanceResultDto {
    @ApiProperty({
        example: 150,
        description: 'Total number of archived clients processed'
    })
    total: number;

    @ApiProperty({
        example: 150,
        description: 'Number of clients successfully processed'
    })
    processed: number;

    @ApiProperty({
        example: 23,
        description: 'Number of clients that had their sessions updated'
    })
    updated: number;

    @ApiProperty({
        example: 5,
        description: 'Number of clients that were deleted due to inactive sessions'
    })
    deleted: number;

    @ApiProperty({
        example: 2,
        description: 'Number of errors encountered during processing'
    })
    errors: number;
}
