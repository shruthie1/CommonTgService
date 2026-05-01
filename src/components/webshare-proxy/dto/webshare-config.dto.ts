import { ApiProperty } from '@nestjs/swagger';

export class WebshareStatusDto {
    @ApiProperty({})
    configured: boolean;

    @ApiProperty({})
    apiKeyValid: boolean;

    @ApiProperty({})
    totalProxiesInWebshare: number;

    @ApiProperty({})
    totalProxiesInDb: number;

    @ApiProperty({ required: false })
    lastSyncAt?: string;

    @ApiProperty({ required: false })
    lastSyncError?: string;
}
