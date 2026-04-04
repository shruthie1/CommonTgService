export declare class ClientHelperUtils {
    static toDateString(dateOrTimestamp: Date | number): string;
    static getTimestamp(date: Date | string | null | undefined): number;
    static getTodayDateString(): string;
    static getDateStringDaysAgo(days: number, oneDayMs: number): string;
    static createBackfillTimestamps(now: number, oneDayMs: number): Record<string, Date>;
    static gaussianRandom(mean: number, stddev: number, min?: number, max?: number): number;
    static generateWarmupJitter(): number;
}
