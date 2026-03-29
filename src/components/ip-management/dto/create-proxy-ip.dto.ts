import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsDate, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProxyIpDto {
    @ApiProperty({ example: '192.168.1.100', description: 'IP address of the proxy' })
    @IsString()
    ipAddress: string;

    @ApiProperty({ example: 8080, description: 'Port number of the proxy' })
    @IsNumber()
    @Min(1)
    @Max(65535)
    port: number;

    @ApiProperty({ example: 'http', description: 'Protocol type', enum: ['http', 'https', 'socks5'] })
    @IsEnum(['http', 'https', 'socks5'])
    protocol: string;

    @ApiProperty({ example: 'username', description: 'Username for proxy authentication', required: false })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ example: 'password', description: 'Password for proxy authentication', required: false })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiProperty({ example: 'active', description: 'Status of the proxy IP', enum: ['active', 'inactive'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;

    @ApiProperty({ example: false, description: 'Whether this IP is currently assigned', required: false })
    @IsOptional()
    @IsBoolean()
    isAssigned?: boolean;

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this IP', required: false })
    @IsOptional()
    @IsString()
    assignedToClient?: string;

    @ApiProperty({ example: 'manual', description: 'Source of the proxy', enum: ['manual', 'webshare'], required: false })
    @IsOptional()
    @IsEnum(['manual', 'webshare'])
    source?: string;

    @ApiProperty({ example: 'abc123', description: 'Webshare proxy ID', required: false })
    @IsOptional()
    @IsString()
    webshareId?: string;

    @ApiProperty({ example: 'US', description: 'Country code', required: false })
    @IsOptional()
    @IsString()
    countryCode?: string;

    @ApiProperty({ example: 'New York', description: 'City name', required: false })
    @IsOptional()
    @IsString()
    cityName?: string;
}
