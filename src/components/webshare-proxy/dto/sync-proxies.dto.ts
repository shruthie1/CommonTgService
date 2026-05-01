import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class SyncProxiesDto {
    @ApiProperty({
        description: 'Whether to remove proxies from DB that are no longer in the Webshare list',
        required: false,
        default: true })
    @IsOptional()
    @IsBoolean()
    removeStale?: boolean;
}

export class SyncResultDto {
    @ApiProperty({})
    totalFetched: number;

    @ApiProperty({})
    created: number;

    @ApiProperty({})
    updated: number;

    @ApiProperty({})
    removed: number;

    @ApiProperty({})
    errors: string[];

    @ApiProperty({})
    durationMs: number;
}
