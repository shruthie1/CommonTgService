import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateBufferClientDto } from './create-buffer-client.dto';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { WarmupPhase, WarmupPhaseType } from '../../shared/warmup-phases';

export class UpdateBufferClientDto extends PartialType(CreateBufferClientDto) {
    @ApiPropertyOptional({ description: 'Whether the client is currently reserved by an active workflow.'})
    inUse?: boolean;
    @ApiPropertyOptional({ description: 'Timestamp when the client was last used.'})
    lastUsed?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when privacy settings were updated.'})
    privacyUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when the final profile photo was uploaded.'})
    profilePicsUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when display name and bio were updated.'})
    nameBioUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when legacy profile photos were deleted.'})
    profilePicsDeletedAt?: Date;
    @ApiPropertyOptional({ description: 'Username set during warmup.'})
    @IsOptional()
    @IsString()
    username?: string;

    @ApiPropertyOptional({ description: 'Timestamp when username was updated.'})
    usernameUpdatedAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp of the most recent health check.'})
    lastChecked?: Date;
    @ApiPropertyOptional({ description: 'Timestamp of the most recent warmup processing attempt.'})
    lastUpdateAttempt?: Date;
    @ApiPropertyOptional({ description: 'Current consecutive warmup failure count.'})
    failedUpdateAttempts?: number;
    @ApiPropertyOptional({ description: 'Timestamp of the last failed warmup attempt.'})
    lastUpdateFailure?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when 2FA was verified or configured.'})
    twoFASetAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when other sessions were revoked.'})
    otherAuthsRemovedAt?: Date;
    // Warmup tracking
    @ApiPropertyOptional({ enum: ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated']})
    @IsOptional()
    @IsEnum(WarmupPhase)
    warmupPhase?: WarmupPhaseType;
    @ApiPropertyOptional({ description: 'Per-account warmup jitter in days.'})
    warmupJitter?: number;
    @ApiPropertyOptional({ description: 'Timestamp when the account entered warmup enrollment.'})
    enrolledAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp of the latest organic activity execution.'})
    organicActivityAt?: Date;
    @ApiPropertyOptional({ description: 'Timestamp when a backup session was created.'})
    sessionRotatedAt?: Date;

    @ApiPropertyOptional({ description: 'Assigned first name (set during setupClient)' })
    @IsOptional()
    @IsString()
    assignedFirstName?: string;

    @ApiPropertyOptional({ description: 'Assigned last name' })
    @IsOptional()
    @IsString()
    assignedLastName?: string;

    @ApiPropertyOptional({ description: 'Assigned bio' })
    @IsOptional()
    @IsString()
    assignedBio?: string;

    @ApiPropertyOptional({ description: 'Assigned profile pic URLs' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    assignedProfilePics?: string[];
}
