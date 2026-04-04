import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CreateClientDto } from './create-client.dto';

export class UpdateClientDto extends PartialType(CreateClientDto) {
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

    @ApiProperty({ description: 'Computed version hash of the persona pool', required: false })
    @IsOptional()
    @IsString()
    personaPoolVersion?: string;
}
