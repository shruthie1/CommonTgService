"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientHelperUtils = void 0;
class ClientHelperUtils {
    static getTimestamp(date) {
        if (!date)
            return 0;
        try {
            return new Date(date).getTime();
        }
        catch {
            return 0;
        }
    }
    static getTodayDateString() {
        return new Date().toISOString().split('T')[0];
    }
    static getDateStringDaysAgo(days, oneDayMs) {
        return new Date(Date.now() - days * oneDayMs).toISOString().split('T')[0];
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
}
exports.ClientHelperUtils = ClientHelperUtils;
//# sourceMappingURL=client-helper.utils.js.map