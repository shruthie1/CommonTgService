import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class ReplaceProxyDto {
    @ApiProperty({ description: 'IP address of the proxy to replace'})
    @IsString()
    ipAddress: string;

    @ApiProperty({ description: 'Port of the proxy to replace'})
    @IsNumber()
    port: number;

    @ApiProperty({ description: 'Preferred country code for replacement', required: false})
    @IsOptional()
    @IsString()
    preferredCountry?: string;
}

export class ReplaceResultDto {
    @ApiProperty({})
    success: boolean;

    @ApiProperty({})
    message: string;

    @ApiProperty({ required: false })
    replacementId?: string;
}
