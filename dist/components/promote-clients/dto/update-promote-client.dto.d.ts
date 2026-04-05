import { CreatePromoteClientDto } from './create-promote-client.dto';
import { WarmupPhaseType } from '../../shared/warmup-phases';
declare const UpdatePromoteClientDto_base: import("@nestjs/common").Type<Partial<CreatePromoteClientDto>>;
export declare class UpdatePromoteClientDto extends UpdatePromoteClientDto_base {
    inUse?: boolean;
    lastUsed?: Date;
    privacyUpdatedAt?: Date;
    profilePicsUpdatedAt?: Date;
    nameBioUpdatedAt?: Date;
    profilePicsDeletedAt?: Date;
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
