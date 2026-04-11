import { CreateBufferClientDto } from './create-buffer-client.dto';
import { WarmupPhaseType } from '../../shared/warmup-phases';
declare const UpdateBufferClientDto_base: import("@nestjs/common").Type<Partial<CreateBufferClientDto>>;
export declare class UpdateBufferClientDto extends UpdateBufferClientDto_base {
    inUse?: boolean;
    lastUsed?: Date;
    privacyUpdatedAt?: Date;
    profilePicsUpdatedAt?: Date;
    nameBioUpdatedAt?: Date;
    profilePicsDeletedAt?: Date;
    username?: string;
    usernameUpdatedAt?: Date;
    lastChecked?: Date;
    lastUpdateAttempt?: Date;
    failedUpdateAttempts?: number;
    lastUpdateFailure?: Date;
    twoFASetAt?: Date;
    otherAuthsRemovedAt?: Date;
    warmupPhase?: WarmupPhaseType;
    warmupJitter?: number;
    enrolledAt?: Date;
    organicActivityAt?: Date;
    sessionRotatedAt?: Date;
    assignedFirstName?: string;
    assignedLastName?: string;
    assignedBio?: string;
    assignedProfilePics?: string[];
}
export {};
