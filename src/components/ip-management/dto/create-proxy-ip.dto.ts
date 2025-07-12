import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, IsDateString } from 'class-validator';

export class CreateProxyIpDto {
    @ApiProperty({ example: '192.168.1.100', description: 'IP address of the proxy' })
    @IsString()
    ipAddress: string;

    @ApiProperty({ example: 8080, description: 'Port number of the proxy' })
    @IsNumber()
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

    @ApiProperty({ example: 'client1', description: 'Client ID that owns this IP', required: false })
    @IsOptional()
    @IsString()
    assignedToClient?: string;
}
