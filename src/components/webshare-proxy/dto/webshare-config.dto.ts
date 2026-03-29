import { ApiProperty } from '@nestjs/swagger';

export class WebshareStatusDto {
    @ApiProperty({ example: true })
    configured: boolean;

    @ApiProperty({ example: true })
    apiKeyValid: boolean;

    @ApiProperty({ example: 100 })
    totalProxiesInWebshare: number;

    @ApiProperty({ example: 95 })
    totalProxiesInDb: number;

    @ApiProperty({ example: '2026-03-29T10:00:00Z', required: false })
    lastSyncAt?: string;

    @ApiProperty({ example: null, required: false })
    lastSyncError?: string;
}
