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
            const ts = new Date(date).getTime();
            return isNaN(ts) ? 0 : ts;
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

    /**
     * Generate a random number from a Gaussian (normal) distribution
     * Uses Box-Muller transform
     * @param mean - Center of the distribution
     * @param stddev - Standard deviation (spread)
     * @param min - Optional floor (result won't go below this)
     * @param max - Optional ceiling (result won't go above this)
     */
    static gaussianRandom(mean: number, stddev: number, min?: number, max?: number): number {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        let result = mean + z * stddev;
        if (min !== undefined) result = Math.max(result, min);
        if (max !== undefined) result = Math.min(result, max);
        return Math.round(result);
    }

    /**
     * Generate a random warmup jitter (0-3 days) for per-account randomization
     */
    static generateWarmupJitter(): number {
        return Math.floor(Math.random() * 4); // 0, 1, 2, or 3
    }
}
