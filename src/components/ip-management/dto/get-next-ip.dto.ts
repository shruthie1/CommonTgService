import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class GetNextIpDto {
    @ApiProperty({ description: 'Optional client ID to filter IPs by assignment', required: false })
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiProperty({ description: 'Optional country code filter', required: false })
    @IsOptional()
    @IsString()
    countryCode?: string;

    @ApiProperty({ description: 'Optional protocol filter', enum: ['http', 'https', 'socks5'], required: false })
    @IsOptional()
    @IsEnum(['http', 'https', 'socks5'])
    protocol?: string;
}
