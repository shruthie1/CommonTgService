import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateIpMobileMappingDto {
    @ApiProperty({ example: '916265240911', description: 'Mobile number' })
    @IsString()
    mobile: string;

    @ApiProperty({ example: '192.168.1.100:8080', description: 'IP address and port combination' })
    @IsString()
    ipAddress: string;

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this mobile number' })
    @IsString()
    clientId: string;

    @ApiProperty({ example: 'active', description: 'Status of this mapping', enum: ['active', 'inactive'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;
}
