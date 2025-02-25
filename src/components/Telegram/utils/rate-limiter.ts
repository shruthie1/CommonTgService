export class RateLimiter {
    private timestamps: Map<string, number[]> = new Map();
    private readonly windowMs: number;
    private readonly maxRequests: number;

    constructor(windowMs: number, maxRequests: number) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
    }

    async checkRateLimit(key: string): Promise<boolean> {
        const now = Date.now();
        const timestamps = this.timestamps.get(key) || [];
        
        // Remove timestamps outside the window
        const validTimestamps = timestamps.filter(
            timestamp => now - timestamp < this.windowMs
        );

        if (validTimestamps.length >= this.maxRequests) {
            return false;
        }

        validTimestamps.push(now);
        this.timestamps.set(key, validTimestamps);
        return true;
    }

    async waitForRateLimit(key: string): Promise<void> {
        while (!(await this.checkRateLimit(key))) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    resetLimit(key: string): void {
        this.timestamps.delete(key);
    }
}