import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiProperty({ description: 'First name' })
    @IsString()
    firstName: string;

    @ApiProperty({ description: 'About information', required: false })
    @IsOptional()
    @IsString()
    about?: string;
}