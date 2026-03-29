import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class ReplaceProxyDto {
    @ApiProperty({ description: 'IP address of the proxy to replace', example: '1.2.3.4' })
    @IsString()
    ipAddress: string;

    @ApiProperty({ description: 'Port of the proxy to replace', example: 8080 })
    @IsNumber()
    port: number;

    @ApiProperty({ description: 'Preferred country code for replacement', required: false, example: 'US' })
    @IsOptional()
    @IsString()
    preferredCountry?: string;
}

export class ReplaceResultDto {
    @ApiProperty({ example: true })
    success: boolean;

    @ApiProperty({ example: 'Replacement initiated' })
    message: string;

    @ApiProperty({ required: false })
    replacementId?: string;
}
