import { ApiProperty } from '@nestjs/swagger';

export class SessionHealthMetricsDto {
    @ApiProperty({ 
        example: 2, 
        description: 'Number of active old sessions available as backup'
    })
    activeOldSessions: number;

    @ApiProperty({ 
        example: '2024-01-15T08:30:00.000Z', 
        description: 'Timestamp when the session was last updated'
    })
    lastUpdated: string;

    @ApiProperty({ 
        example: '2 hours ago', 
        description: 'Human-readable session age'
    })
    sessionAge: string;

    @ApiProperty({ 
        example: 'high', 
        description: 'Session reliability rating based on availability',
        enum: ['high', 'medium', 'low']
    })
    reliability: 'high' | 'medium' | 'low';
}

export class SessionStatusDto {
    @ApiProperty({ 
        example: '916265240911', 
        description: 'Mobile number of the archived client'
    })
    mobile: string;

    @ApiProperty({ 
        example: true, 
        description: 'Whether the main session is currently active'
    })
    isMainSessionActive: boolean;

    @ApiProperty({ 
        example: 3, 
        description: 'Total number of old sessions stored'
    })
    totalOldSessions: number;

    @ApiProperty({ 
        example: '2024-01-15T10:30:00.000Z', 
        description: 'Timestamp when the status was last checked'
    })
    lastChecked: string;

    @ApiProperty({ 
        description: 'Detailed health metrics for the session',
        type: SessionHealthMetricsDto
    })
    healthMetrics: SessionHealthMetricsDto;
}
