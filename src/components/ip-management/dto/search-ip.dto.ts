import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';

export class SearchProxyIpDto {
    @ApiProperty({ example: '192.168.1.100', description: 'IP address to search for', required: false })
    @IsOptional()
    @IsString()
    ipAddress?: string;

    @ApiProperty({ example: 8080, description: 'Port number to search for', required: false })
    @IsOptional()
    @IsNumber()
    port?: number;

    @ApiProperty({ example: 'http', description: 'Protocol type to search for', enum: ['http', 'https', 'socks5'], required: false })
    @IsOptional()
    @IsEnum(['http', 'https', 'socks5'])
    protocol?: string;

    @ApiProperty({ example: 'US', description: 'Country code to search for', required: false })
    @IsOptional()
    @IsString()
    country?: string;

    @ApiProperty({ example: 'active', description: 'Status to search for', enum: ['active', 'inactive', 'blocked', 'maintenance'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive', 'blocked', 'maintenance'])
    status?: string;

    @ApiProperty({ example: true, description: 'Whether to search for assigned or unassigned IPs', required: false })
    @IsOptional()
    @IsBoolean()
    isAssigned?: boolean;

    @ApiProperty({ example: 'client1', description: 'Client ID to search for', required: false })
    @IsOptional()
    @IsString()
    assignedToClient?: string;

    @ApiProperty({ example: 'DataCenter', description: 'Provider to search for', required: false })
    @IsOptional()
    @IsString()
    provider?: string;
}

export class SearchIpMobileMappingDto {
    @ApiProperty({ example: '916265240911', description: 'Mobile number to search for', required: false })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiProperty({ example: '192.168.1.100:8080', description: 'IP address to search for', required: false })
    @IsOptional()
    @IsString()
    ipAddress?: string;

    @ApiProperty({ example: 'client1', description: 'Client ID to search for', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ example: 'active', description: 'Status to search for', enum: ['active', 'inactive'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;
}
