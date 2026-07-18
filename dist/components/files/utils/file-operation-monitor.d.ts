export interface FileOperationMetrics {
    operation: string;
    success: boolean;
    duration: number;
    timestamp: number;
    path?: string;
    error?: string;
}
export declare class FileOperationMonitor {
    private static metrics;
    private static readonly MAX_METRICS;
    static recordOperation(metric: FileOperationMetrics): void;
    static getMetrics(limit?: number): FileOperationMetrics[];
    static getFailureRate(timeWindow?: number): number;
    static clearMetrics(): void;
}
