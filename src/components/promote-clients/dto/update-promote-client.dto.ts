import { PartialType } from '@nestjs/swagger';
import { CreatePromoteClientDto } from './create-promote-client.dto';

export class UpdatePromoteClientDto extends PartialType(CreatePromoteClientDto) {
    privacyUpdatedAt?: Date;
    profilePicsUpdatedAt?: Date;
    nameBioUpdatedAt?: Date;
    profilePicsDeletedAt?: Date;
    usernameUpdatedAt?: Date;
}
