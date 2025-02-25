export declare class RateLimiter {
    private timestamps;
    private readonly windowMs;
    private readonly maxRequests;
    constructor(windowMs: number, maxRequests: number);
    checkRateLimit(key: string): Promise<boolean>;
    waitForRateLimit(key: string): Promise<void>;
    resetLimit(key: string): void;
}
