import { CreatePromoteClientDto } from './create-promote-client.dto';
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
}
export {};
