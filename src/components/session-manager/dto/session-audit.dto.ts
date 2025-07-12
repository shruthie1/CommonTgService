import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDate, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { SessionStatus, SessionCreationMethod } from '../schemas/sessions.schema';

export class CreateSessionAuditDto {
    @ApiProperty({ example: '916265240911', description: 'Phone number associated with the session' })
    @IsString()
    mobile: string;

    @ApiProperty({ example: '1BQANOTEuM==...', description: 'Session string', required: false })
    @IsOptional()
    @IsString()
    sessionString?: string;

    @ApiProperty({ example: 'old_session', description: 'Method used to create the session', enum: SessionCreationMethod })
    @IsEnum(SessionCreationMethod)
    creationMethod: SessionCreationMethod;

    @ApiProperty({ example: 'Session created successfully', description: 'Creation message', required: false })
    @IsOptional()
    @IsString()
    creationMessage?: string;

    @ApiProperty({ example: '1BQANOTEuM==...', description: 'Previous session string', required: false })
    @IsOptional()
    @IsString()
    previousSessionString?: string;

    @ApiProperty({ example: 'shruthi1', description: 'Client ID', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ example: 'ShruthiRedd2', description: 'Username', required: false })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ example: 3, description: 'Number of retry attempts', required: false })
    @IsOptional()
    @IsNumber()
    retryAttempts?: number;

    @ApiProperty({ example: {}, description: 'Additional metadata', required: false })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;
}

export class UpdateSessionAuditDto {
    @ApiProperty({ example: '1BQANOTEuM==...', description: 'Session string to update', required: false })
    @IsOptional()
    @IsString()
    sessionString?: string;

    @ApiProperty({ example: 'active', description: 'Session status', enum: SessionStatus, required: false })
    @IsOptional()
    @IsEnum(SessionStatus)
    status?: SessionStatus;

    @ApiProperty({ example: 'shruthi1', description: 'Client ID', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ example: 'ShruthiRedd2', description: 'Username', required: false })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ example: 'Session validation failed', description: 'Error message', required: false })
    @IsOptional()
    @IsString()
    errorMessage?: string;

    @ApiProperty({ example: 'manual_revocation', description: 'Revocation reason', required: false })
    @IsOptional()
    @IsString()
    revocationReason?: string;

    @ApiProperty({ example: false, description: 'Whether session is active', required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiProperty({ example: 5, description: 'Usage count', required: false })
    @IsOptional()
    @IsNumber()
    usageCount?: number;

    @ApiProperty({ example: 'session_validation_failed', description: 'Last error', required: false })
    @IsOptional()
    @IsString()
    lastError?: string;

    @ApiProperty({ example: '2023-12-01T16:00:00Z', description: 'When the session was revoked', required: false })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    revokedAt?: Date;
}

export class SessionAuditQueryDto {
    @ApiProperty({ example: '916265240911', description: 'Phone number to filter by', required: false })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiProperty({ example: 'active', description: 'Status to filter by', enum: SessionStatus, required: false })
    @IsOptional()
    @IsEnum(SessionStatus)
    status?: SessionStatus;

    @ApiProperty({ example: 'old_session', description: 'Creation method to filter by', enum: SessionCreationMethod, required: false })
    @IsOptional()
    @IsEnum(SessionCreationMethod)
    creationMethod?: SessionCreationMethod;

    @ApiProperty({ example: true, description: 'Filter by active sessions only', required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiProperty({ example: 10, description: 'Number of records to return', required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @ApiProperty({ example: 0, description: 'Number of records to skip', required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    offset?: number;

    @ApiProperty({ example: '2023-12-01', description: 'Filter sessions created after this date', required: false })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    startDate?: Date;

    @ApiProperty({ example: '2023-12-31', description: 'Filter sessions created before this date', required: false })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    endDate?: Date;
}

export class SessionAuditStatsDto {
    @ApiProperty({ example: 150, description: 'Total number of sessions' })
    totalSessions: number;

    @ApiProperty({ example: 45, description: 'Number of active sessions' })
    activeSessions: number;

    @ApiProperty({ example: 30, description: 'Number of expired sessions' })
    expiredSessions: number;

    @ApiProperty({ example: 20, description: 'Number of revoked sessions' })
    revokedSessions: number;

    @ApiProperty({ example: 55, description: 'Number of failed sessions' })
    failedSessions: number;

    @ApiProperty({ 
        example: { old_session: 80, existing_method: 50, fallback: 20 }, 
        description: 'Breakdown by creation method' 
    })
    creationMethodBreakdown: Record<string, number>;

    @ApiProperty({ example: '2023-12-01T10:00:00Z', description: 'Date range start' })
    dateRange: {
        start: Date;
        end: Date;
    };
}
