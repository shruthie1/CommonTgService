export declare class CollectionQueryDto {
    filter?: Record<string, unknown> | string;
    projection?: Record<string, unknown> | string;
    sort?: Record<string, 1 | -1> | string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number | string;
    skip?: number | string;
}
export declare class CollectionAnalyticsQueryDto {
    sampleSize?: number | string;
}
