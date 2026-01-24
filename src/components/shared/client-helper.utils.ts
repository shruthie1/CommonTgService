/**
 * Shared utility methods for client services (buffer-client and promote-client)
 * Contains identical helper methods used by both services
 */
export class ClientHelperUtils {
    /**
     * Get timestamp from date string or Date object
     * Returns 0 if date is null, undefined, or invalid
     */
    static getTimestamp(date: Date | string | null | undefined): number {
        if (!date) return 0;
        try {
            return new Date(date).getTime();
        } catch {
            return 0;
        }
    }

    /**
     * Get today's date string in 'YYYY-MM-DD' format
     */
    static getTodayDateString(): string {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Get date string N days ago in 'YYYY-MM-DD' format
     * @param days - Number of days ago
     * @param oneDayMs - Milliseconds in one day (24 * 60 * 60 * 1000)
     */
    static getDateStringDaysAgo(days: number, oneDayMs: number): string {
        return new Date(Date.now() - days * oneDayMs).toISOString().split('T')[0];
    }

    /**
     * Create backfill timestamps for old documents
     * Creates timestamps in the past (7-25 days ago) for backfilling missing timestamp fields
     * @param now - Current timestamp in milliseconds
     * @param oneDayMs - Milliseconds in one day (24 * 60 * 60 * 1000)
     */
    static createBackfillTimestamps(now: number, oneDayMs: number): Record<string, Date> {
        return {
            privacyUpdatedAt: new Date(now - (25 * oneDayMs)),
            profilePicsDeletedAt: new Date(now - (20 * oneDayMs)),
            nameBioUpdatedAt: new Date(now - (14 * oneDayMs)),
            usernameUpdatedAt: new Date(now - (10 * oneDayMs)),
            profilePicsUpdatedAt: new Date(now - (7 * oneDayMs)),
        };
    }
}
