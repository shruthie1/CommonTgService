import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AcceptedStringResponseDto {
    @ApiProperty({
        description: 'Acknowledgement returned when a long-running background operation is started.',
        example: 'initiated Checking',
    })
    message: string;
}

export class StatusUpdateRequestDto {
    @ApiProperty({
        description: 'Lifecycle status to assign to the client record.',
        enum: ['active', 'inactive'],
        example: 'active',
    })
    status: 'active' | 'inactive';

    @ApiPropertyOptional({
        description: 'Optional operator note explaining why the status changed.',
        example: 'Re-enabled after manual review',
    })
    message?: string;
}

export class ActivationRequestDto {
    @ApiPropertyOptional({
        description: 'Optional operator note recorded when activating the client.',
        example: 'Returned to active pool',
    })
    message?: string;
}

export class DeactivationRequestDto {
    @ApiProperty({
        description: 'Reason for deactivating the client.',
        example: 'Health check failed repeatedly',
    })
    reason: string;
}

export class MarkUsedRequestDto {
    @ApiPropertyOptional({
        description: 'Optional note describing where or why the client was consumed.',
        example: 'Assigned to live campaign rotation',
    })
    message?: string;
}

export class BulkEnrollClientsRequestDto {
    @ApiProperty({
        description: 'Candidate user identifiers that passed upstream validation.',
        type: [String],
        example: ['10001', '10002'],
    })
    goodIds: string[];

    @ApiProperty({
        description: 'Candidate user identifiers that failed upstream validation and should be excluded.',
        type: [String],
        example: ['99999'],
    })
    badIds: string[];
}

export class BulkEnrollBufferClientsRequestDto extends BulkEnrollClientsRequestDto {
    @ApiPropertyOptional({
        description: 'Specific client IDs that currently need more buffer accounts.',
        type: [String],
        example: ['client-a', 'client-b'],
    })
    clientsNeedingBufferClients?: string[];
}

export class BulkEnrollPromoteClientsRequestDto extends BulkEnrollClientsRequestDto {
    @ApiPropertyOptional({
        description: 'Specific client IDs that currently need more promote accounts.',
        type: [String],
        example: ['client-a', 'client-b'],
    })
    clientsNeedingPromoteClients?: string[];
}

export class UsageStatisticsDto {
    @ApiProperty({ description: 'Total number of matching client records.', example: 48 })
    totalClients: number;

    @ApiProperty({ description: 'Matching clients that have never been used.', example: 12 })
    neverUsed: number;

    @ApiProperty({ description: 'Matching clients used within the last 24 hours.', example: 6 })
    usedInLast24Hours: number;

    @ApiProperty({ description: 'Matching clients used within the last 7 days.', example: 21 })
    usedInLastWeek: number;

    @ApiProperty({
        description: 'Average time gap between usages, in hours.',
        example: 37.5,
    })
    averageUsageGap: number;
}
