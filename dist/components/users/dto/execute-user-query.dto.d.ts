export declare class ExecuteUserQueryDto {
    query: Record<string, unknown>;
    sort?: Record<string, 1 | -1>;
    limit?: number;
    skip?: number;
}
