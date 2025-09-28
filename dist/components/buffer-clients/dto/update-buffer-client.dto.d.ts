import { CreateBufferClientDto } from './create-buffer-client.dto';
declare const UpdateBufferClientDto_base: import("@nestjs/common").Type<Partial<CreateBufferClientDto>>;
export declare class UpdateBufferClientDto extends UpdateBufferClientDto_base {
    inUse?: boolean;
    lastUsed?: Date;
    privacyUpdatedAt?: Date;
    profilePicsUpdatedAt?: Date;
    nameBioUpdatedAt?: Date;
    profilePicsDeletedAt?: Date;
    usernameUpdatedAt?: Date;
}
export {};
