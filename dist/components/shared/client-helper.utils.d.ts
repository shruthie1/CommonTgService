export declare class ClientHelperUtils {
    static getTimestamp(date: Date | string | null | undefined): number;
    static getTodayDateString(): string;
    static getDateStringDaysAgo(days: number, oneDayMs: number): string;
    static createBackfillTimestamps(now: number, oneDayMs: number): Record<string, Date>;
}
