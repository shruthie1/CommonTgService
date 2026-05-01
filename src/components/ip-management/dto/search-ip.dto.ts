import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean } from 'class-validator';

export class SearchProxyIpDto {
    @ApiProperty({ description: 'IP address to search for', required: false })
    @IsOptional()
    @IsString()
    ipAddress?: string;

    @ApiProperty({ description: 'Port number to search for', required: false })
    @IsOptional()
    @IsNumber()
    port?: number;

    @ApiProperty({ description: 'Protocol type to search for', enum: ['http', 'https', 'socks5'], required: false })
    @IsOptional()
    @IsEnum(['http', 'https', 'socks5'])
    protocol?: string;

    @ApiProperty({ description: 'Country code to search for', required: false })
    @IsOptional()
    @IsString()
    country?: string;

    @ApiProperty({ description: 'Status to search for', enum: ['active', 'inactive', 'blocked', 'maintenance'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive', 'blocked', 'maintenance'])
    status?: string;

    @ApiProperty({ description: 'Whether to search for assigned or unassigned IPs', required: false })
    @IsOptional()
    @IsBoolean()
    isAssigned?: boolean;

    @ApiProperty({ description: 'Client ID to search for', required: false })
    @IsOptional()
    @IsString()
    assignedToClient?: string;

    @ApiProperty({ description: 'Provider to search for', required: false })
    @IsOptional()
    @IsString()
    provider?: string;
}

export class SearchIpMobileMappingDto {
    @ApiProperty({ description: 'Mobile number to search for', required: false })
    @IsOptional()
    @IsString()
    mobile?: string;

    @ApiProperty({ description: 'IP address to search for', required: false })
    @IsOptional()
    @IsString()
    ipAddress?: string;

    @ApiProperty({ description: 'Client ID to search for', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ description: 'Status to search for', enum: ['active', 'inactive'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;
}
