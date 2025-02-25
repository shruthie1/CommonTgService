"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
class RateLimiter {
    constructor(windowMs, maxRequests) {
        this.timestamps = new Map();
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
    }
    async checkRateLimit(key) {
        const now = Date.now();
        const timestamps = this.timestamps.get(key) || [];
        const validTimestamps = timestamps.filter(timestamp => now - timestamp < this.windowMs);
        if (validTimestamps.length >= this.maxRequests) {
            return false;
        }
        validTimestamps.push(now);
        this.timestamps.set(key, validTimestamps);
        return true;
    }
    async waitForRateLimit(key) {
        while (!(await this.checkRateLimit(key))) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    resetLimit(key) {
        this.timestamps.delete(key);
    }
}
exports.RateLimiter = RateLimiter;
//# sourceMappingURL=rate-limiter.js.map