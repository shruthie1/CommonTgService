export declare class SyncProxiesDto {
    removeStale?: boolean;
}
export declare class SyncResultDto {
    totalFetched: number;
    created: number;
    updated: number;
    removed: number;
    errors: string[];
    durationMs: number;
}
