import { CreateClientDto } from './create-client.dto';
declare const UpdateClientDto_base: import("@nestjs/common").Type<Partial<CreateClientDto>>;
export declare class UpdateClientDto extends UpdateClientDto_base {
    assignedFirstName?: string;
    assignedLastName?: string;
    assignedBio?: string;
    assignedPhotoFilenames?: string[];
    assignedPersonaPoolVersion?: string;
    personaPoolVersion?: string;
}
export {};
