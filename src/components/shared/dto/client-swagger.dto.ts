import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AcceptedStringResponseDto {
    @ApiProperty({
        description: 'Acknowledgement returned when a long-running background operation is started.' })
    message: string;
}

export class StatusUpdateRequestDto {
    @ApiProperty({
        description: 'Lifecycle status to assign to the client record.',
        enum: ['active', 'inactive'] })
    status: 'active' | 'inactive';

    @ApiPropertyOptional({
        description: 'Optional operator note explaining why the status changed.' })
    message?: string;
}

export class ActivationRequestDto {
    @ApiPropertyOptional({
        description: 'Optional operator note recorded when activating the client.' })
    message?: string;
}

export class DeactivationRequestDto {
    @ApiProperty({
        description: 'Reason for deactivating the client.' })
    reason: string;
}

export class MarkUsedRequestDto {
    @ApiPropertyOptional({
        description: 'Optional note describing where or why the client was consumed.' })
    message?: string;
}

export class BulkEnrollClientsRequestDto {
    @ApiProperty({
        description: 'Candidate user identifiers that passed upstream validation.',
        type: [String] })
    goodIds: string[];

    @ApiProperty({
        description: 'Candidate user identifiers that failed upstream validation and should be excluded.',
        type: [String] })
    badIds: string[];
}

export class BulkEnrollBufferClientsRequestDto extends BulkEnrollClientsRequestDto {
    @ApiPropertyOptional({
        description: 'Specific client IDs that currently need more buffer accounts.',
        type: [String] })
    clientsNeedingBufferClients?: string[];
}

export class BulkEnrollPromoteClientsRequestDto extends BulkEnrollClientsRequestDto {
    @ApiPropertyOptional({
        description: 'Specific client IDs that currently need more promote accounts.',
        type: [String] })
    clientsNeedingPromoteClients?: string[];
}

export class UsageStatisticsDto {
    @ApiProperty({ description: 'Total number of matching client records.'})
    totalClients: number;

    @ApiProperty({ description: 'Matching clients that have never been used.'})
    neverUsed: number;

    @ApiProperty({ description: 'Matching clients used within the last 24 hours.'})
    usedInLast24Hours: number;

    @ApiProperty({ description: 'Matching clients used within the last 7 days.'})
    usedInLastWeek: number;

    @ApiProperty({
        description: 'Average time gap between usages, in hours.' })
    averageUsageGap: number;
}
