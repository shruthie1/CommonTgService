import { PartialType } from '@nestjs/swagger';
import { CreateBufferClientDto } from './create-buffer-client.dto';

export class UpdateBufferClientDto extends PartialType(CreateBufferClientDto) {
    inUse?: boolean;
    lastUsed?: Date;
    privacyUpdatedAt?: Date;
    profilePicsUpdatedAt?: Date;
    nameBioUpdatedAt?: Date;
    profilePicsDeletedAt?: Date;
    usernameUpdatedAt?: Date;
    lastUpdateAttempt?: Date;
}
