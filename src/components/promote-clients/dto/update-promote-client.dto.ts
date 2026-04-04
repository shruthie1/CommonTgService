import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreatePromoteClientDto } from './create-promote-client.dto';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { WarmupPhase, WarmupPhaseType } from '../../shared/warmup-phases';

export class UpdatePromoteClientDto extends PartialType(CreatePromoteClientDto) {
    @ApiPropertyOptional({ description: 'Whether the client is currently reserved by an active workflow.', example: false })
    inUse?: boolean;
    @ApiPropertyOptional({ description: 'Timestamp when the client was last used.', example: '2026-04-01T10:30:00.000Z' })
    lastUsed?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when privacy settings were updated.', example: '2026-03-10T08:00:00.000Z' })
    privacyUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when the final profile photo was uploaded.', example: '2026-03-28T08:00:00.000Z' })
    profilePicsUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when display name and bio were updated.', example: '2026-03-18T08:00:00.000Z' })
    nameBioUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when legacy profile photos were deleted.', example: '2026-03-14T08:00:00.000Z' })
    profilePicsDeletedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when username was updated or cleared.', example: '2026-03-20T08:00:00.000Z' })
    usernameUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp of the most recent health check.', example: '2026-04-02T09:15:00.000Z' })
    lastChecked?: Date;
    @ApiPropertyOptional({ description: 'Timestamp of the most recent warmup processing attempt.', example: '2026-04-03T10:30:00.000Z' })
    lastUpdateAttempt?: Date;
    @ApiPropertyOptional({ description: 'Current consecutive warmup failure count.', example: 1 })
    failedUpdateAttempts?: number;
    @ApiPropertyOptional({ description: 'Timestamp of the last failed warmup attempt.', example: '2026-04-01T08:00:00.000Z' })
    lastUpdateFailure?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when 2FA was verified or configured.', example: '2026-03-12T08:00:00.000Z' })
    twoFASetAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when other sessions were revoked.', example: '2026-03-15T08:00:00.000Z' })
    otherAuthsRemovedAt?: Date;
    // Warmup tracking
    @ApiPropertyOptional({ enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'], example: 'growing' })
    @IsEnum(WarmupPhase)
    warmupPhase?: WarmupPhaseType;
    @ApiPropertyOptional({ description: 'Per-account warmup jitter in days.', example: 2 })
    warmupJitter?: number;
    @ApiPropertyOptional({ description: 'Timestamp when the account entered warmup enrollment.', example: '2026-03-03T08:00:00.000Z' })
    enrolledAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp of the latest organic activity execution.', example: '2026-04-03T09:45:00.000Z' })
    organicActivityAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when a backup session was created.', example: '2026-04-02T07:00:00.000Z' })
    sessionRotatedAt?: Date;

    @ApiProperty({ description: 'Assigned first name (set during setupClient)', required: false })
    @IsOptional()
    @IsString()
    assignedFirstName?: string;

    @ApiProperty({ description: 'Assigned last name', required: false })
    @IsOptional()
    @IsString()
    assignedLastName?: string;

    @ApiProperty({ description: 'Assigned bio', required: false })
    @IsOptional()
    @IsString()
    assignedBio?: string;

    @ApiProperty({ description: 'Assigned photo filenames', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    assignedPhotoFilenames?: string[];

    @ApiProperty({ description: 'Pool version at assignment time', required: false })
    @IsOptional()
    @IsString()
    assignedPersonaPoolVersion?: string;
}
