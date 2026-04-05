export declare class ExecuteClientQueryDto {
    query: Record<string, unknown>;
    sort?: Record<string, 1 | -1 | 'asc' | 'desc'>;
    limit?: number;
    skip?: number;
}
