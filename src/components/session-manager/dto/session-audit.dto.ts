import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDate, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { SessionStatus, SessionCreationMethod } from '../schemas/sessions.schema';

export class CreateSessionAuditDto {
    @ApiProperty({ description: 'Phone number associated with the session' })
    @IsString()
    mobile: string;

    @ApiProperty({ description: 'Session string', required: false })
    @IsOptional()
    @IsString()
    sessionString?: string;

    @ApiProperty({ description: 'Method used to create the session', enum: SessionCreationMethod })
    @IsEnum(SessionCreationMethod)
    creationMethod: SessionCreationMethod;

    @ApiProperty({ description: 'Creation message', required: false })
    @IsOptional()
    @IsString()
    creationMessage?: string;

    @ApiProperty({ description: 'Previous session string', required: false })
    @IsOptional()
    @IsString()
    previousSessionString?: string;

    @ApiProperty({ description: 'Client ID', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ description: 'Username', required: false })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ description: 'Number of retry attempts', required: false })
    @IsOptional()
    @IsNumber()
    retryAttempts?: number;

    @ApiProperty({ description: 'Additional metadata', required: false })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;
}

export class UpdateSessionAuditDto {
    @ApiProperty({ description: 'Session string to update', required: false })
    @IsOptional()
    @IsString()
    sessionString?: string;

    @ApiProperty({ description: 'Session status', enum: SessionStatus, required: false })
    @IsOptional()
    @IsEnum(SessionStatus)
    status?: SessionStatus;

    @ApiProperty({ description: 'Client ID', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ description: 'Username', required: false })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ description: 'Error message', required: false })
    @IsOptional()
    @IsString()
    errorMessage?: string;

    @ApiProperty({ description: 'Revocation reason', required: false })
    @IsOptional()
    @IsString()
    revocationReason?: string;

    @ApiProperty({ description: 'Whether session is active', required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiProperty({ description: 'Usage count', required: false })
    @IsOptional()
    @IsNumber()
    usageCount?: number;

    @ApiProperty({ description: 'Last error', required: false })
    @IsOptional()
    @IsString()
    lastError?: string;

    @ApiProperty({ description: 'When the session was revoked', required: false })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    revokedAt?: Date;
}

export class SessionAuditQueryDto {
    @ApiProperty({ description: 'Phone number to filter by', required: false })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiProperty({ description: 'Status to filter by', enum: SessionStatus, required: false })
    @IsOptional()
    @IsEnum(SessionStatus)
    status?: SessionStatus;

    @ApiProperty({ description: 'Creation method to filter by', enum: SessionCreationMethod, required: false })
    @IsOptional()
    @IsEnum(SessionCreationMethod)
    creationMethod?: SessionCreationMethod;

    @ApiProperty({ description: 'Filter by active sessions only', required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiProperty({ description: 'Number of records to return', required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @ApiProperty({ description: 'Number of records to skip', required: false })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    offset?: number;

    @ApiProperty({ description: 'Filter sessions created after this date', required: false })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    startDate?: Date;

    @ApiProperty({ description: 'Filter sessions created before this date', required: false })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    endDate?: Date;
}

export class SessionAuditStatsDto {
    @ApiProperty({ description: 'Total number of sessions' })
    totalSessions: number;

    @ApiProperty({ description: 'Number of active sessions' })
    activeSessions: number;

    @ApiProperty({ description: 'Number of expired sessions' })
    expiredSessions: number;

    @ApiProperty({ description: 'Number of revoked sessions' })
    revokedSessions: number;

    @ApiProperty({ description: 'Number of failed sessions' })
    failedSessions: number;

    @ApiProperty({ 
        description: 'Breakdown by creation method' 
    })
    creationMethodBreakdown: Record<string, number>;

    @ApiProperty({ description: 'Date range start' })
    dateRange: {
        start: Date;
        end: Date;
    };
}
