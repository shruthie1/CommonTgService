"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientHelperUtils = void 0;
class ClientHelperUtils {
    static toDateString(dateOrTimestamp) {
        return new Date(dateOrTimestamp).toISOString().split('T')[0];
    }
    static getTimestamp(date) {
        if (!date)
            return 0;
        try {
            const ts = new Date(date).getTime();
            return isNaN(ts) ? 0 : ts;
        }
        catch {
            return 0;
        }
    }
    static getTodayDateString() {
        return this.toDateString(new Date());
    }
    static getDateStringDaysAgo(days, oneDayMs) {
        return this.toDateString(Date.now() - days * oneDayMs);
    }
    static createBackfillTimestamps(now, oneDayMs) {
        return {
            privacyUpdatedAt: new Date(now - (25 * oneDayMs)),
            profilePicsDeletedAt: new Date(now - (20 * oneDayMs)),
            nameBioUpdatedAt: new Date(now - (14 * oneDayMs)),
            usernameUpdatedAt: new Date(now - (10 * oneDayMs)),
            profilePicsUpdatedAt: new Date(now - (7 * oneDayMs)),
        };
    }
    static gaussianRandom(mean, stddev, min, max) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        let result = mean + z * stddev;
        if (min !== undefined)
            result = Math.max(result, min);
        if (max !== undefined)
            result = Math.min(result, max);
        return Math.round(result);
    }
    static generateWarmupJitter() {
        return Math.round(ClientHelperUtils.gaussianRandom(3.5, 2, 0, 7));
    }
}
exports.ClientHelperUtils = ClientHelperUtils;
//# sourceMappingURL=client-helper.utils.js.map