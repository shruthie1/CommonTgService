import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CollectionQueryDto {
    @ApiPropertyOptional({ description: 'Mongo filter object. Query-string callers may pass JSON.' })
    @IsOptional()
    filter?: Record<string, unknown> | string;

    @ApiPropertyOptional({ description: 'Mongo projection object. Query-string callers may pass JSON.' })
    @IsOptional()
    projection?: Record<string, unknown> | string;

    @ApiPropertyOptional({ description: 'Mongo sort object. Query-string callers may pass JSON.' })
    @IsOptional()
    sort?: Record<string, 1 | -1> | string;

    @ApiPropertyOptional({ description: 'Single field to sort by when sort is not provided.' })
    @IsOptional()
    @IsString()
    sortBy?: string;

    @ApiPropertyOptional({ description: 'Sort direction for sortBy.', enum: ['asc', 'desc'] })
    @IsOptional()
    @IsIn(['asc', 'desc'])
    sortOrder?: 'asc' | 'desc';

    @ApiPropertyOptional({ description: 'Maximum documents to return. Capped server-side.' })
    @IsOptional()
    limit?: number | string;

    @ApiPropertyOptional({ description: 'Documents to skip.' })
    @IsOptional()
    skip?: number | string;
}

export class CollectionAnalyticsQueryDto {
    @ApiPropertyOptional({ description: 'Sample size for field analytics. Capped server-side.' })
    @IsOptional()
    sampleSize?: number | string;
}
