import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class AssignIpToMobileDto {
    @ApiProperty({ example: '916265240911', description: 'Mobile number to assign IP to' })
    @IsString()
    mobile: string;

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this mobile number' })
    @IsString()
    clientId: string;

    @ApiProperty({ example: '192.168.1.100:8080', description: 'Specific IP to assign (optional - if not provided, will auto-assign)', required: false })
    @IsOptional()
    @IsString()
    preferredIp?: string;
}

export class BulkAssignIpDto {
    @ApiProperty({ example: ['916265240911', '916265240912'], description: 'Array of mobile numbers to assign IPs to' })
    @IsArray()
    @IsString({ each: true })
    mobiles: string[];

    @ApiProperty({ example: 'client1', description: 'Client ID that owns these mobile numbers' })
    @IsString()
    clientId: string;
}

export class ReleaseIpFromMobileDto {
    @ApiProperty({ example: '916265240911', description: 'Mobile number to release IP from' })
    @IsString()
    mobile: string;
}
