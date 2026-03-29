import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class SyncProxiesDto {
    @ApiProperty({
        description: 'Whether to remove proxies from DB that are no longer in the Webshare list',
        example: true,
        required: false,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    removeStale?: boolean;
}

export class SyncResultDto {
    @ApiProperty({ example: 100 })
    totalFetched: number;

    @ApiProperty({ example: 80 })
    created: number;

    @ApiProperty({ example: 15 })
    updated: number;

    @ApiProperty({ example: 5 })
    removed: number;

    @ApiProperty({ example: [] })
    errors: string[];

    @ApiProperty({ example: 2345 })
    durationMs: number;
}
