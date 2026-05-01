import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsDate, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProxyIpDto {
    @ApiProperty({ description: 'IP address of the proxy' })
    @IsString()
    ipAddress: string;

    @ApiProperty({ description: 'Port number of the proxy' })
    @IsNumber()
    @Min(1)
    @Max(65535)
    port: number;

    @ApiProperty({ description: 'Protocol type', enum: ['http', 'https', 'socks5'] })
    @IsEnum(['http', 'https', 'socks5'])
    protocol: string;

    @ApiProperty({ description: 'Username for proxy authentication', required: false })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiProperty({ description: 'Password for proxy authentication', required: false })
    @IsOptional()
    @IsString()
    password?: string;

    @ApiProperty({ description: 'Status of the proxy IP', enum: ['active', 'inactive'], required: false })
    @IsOptional()
    @IsEnum(['active', 'inactive'])
    status?: string;

    @ApiProperty({ description: 'Whether this IP is currently assigned', required: false })
    @IsOptional()
    @IsBoolean()
    isAssigned?: boolean;

    @ApiProperty({ description: 'Client ID that owns this IP', required: false })
    @IsOptional()
    @IsString()
    assignedToClient?: string;

    @ApiProperty({ description: 'Source of the proxy', enum: ['manual', 'webshare'], required: false })
    @IsOptional()
    @IsEnum(['manual', 'webshare'])
    source?: string;

    @ApiProperty({ description: 'Webshare proxy ID', required: false })
    @IsOptional()
    @IsString()
    webshareId?: string;

    @ApiProperty({ description: 'Country code', required: false })
    @IsOptional()
    @IsString()
    countryCode?: string;

    @ApiProperty({ description: 'City name', required: false })
    @IsOptional()
    @IsString()
    cityName?: string;
}
