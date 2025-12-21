import { PartialType } from '@nestjs/swagger';
import { CreatePromoteClientDto } from './create-promote-client.dto';

export class UpdatePromoteClientDto extends PartialType(CreatePromoteClientDto) {
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
}
