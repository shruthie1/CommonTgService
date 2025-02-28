"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManager = void 0;
const telegram_error_1 = require("../types/telegram-error");
const rate_limiter_1 = require("./rate-limiter");
class ConnectionManager {
    constructor() {
        this.clientRateLimiter = new rate_limiter_1.RateLimiter(60000, 5);
        this.operationRateLimiter = new rate_limiter_1.RateLimiter(60000, 30);
        this.activeConnections = new Map();
    }
    static getInstance() {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }
    async acquireConnection(mobile, client) {
        await this.clientRateLimiter.waitForRateLimit(mobile);
        this.activeConnections.set(mobile, {
            client,
            lastUsed: Date.now()
        });
    }
    async releaseConnection(mobile) {
        const connection = this.activeConnections.get(mobile);
        if (connection) {
            try {
                await connection.client.disconnect();
            }
            catch (error) {
                console.error(`Error disconnecting client ${mobile}:`, error);
            }
            finally {
                this.activeConnections.delete(mobile);
            }
        }
    }
    async cleanupInactiveConnections(maxIdleTime = 180000) {
        const now = Date.now();
        for (const [mobile, connection] of this.activeConnections.entries()) {
            if (now - connection.lastUsed > maxIdleTime) {
                console.log(`Releasing inactive connection for ${mobile}`);
                await this.releaseConnection(mobile);
            }
        }
    }
    async executeWithRateLimit(mobile, operation) {
        await this.operationRateLimiter.waitForRateLimit(mobile);
        try {
            return await operation();
        }
        catch (error) {
            if (error.message?.includes('FLOOD_WAIT')) {
                throw new telegram_error_1.TelegramError('Rate limit exceeded', telegram_error_1.TelegramErrorCode.FLOOD_WAIT, { waitTime: parseInt(error.message.match(/\d+/)?.[0] || '0') });
            }
            throw error;
        }
    }
    updateLastUsed(mobile) {
        const connection = this.activeConnections.get(mobile);
        if (connection) {
            connection.lastUsed = Date.now();
            this.activeConnections.set(mobile, connection);
        }
    }
    getActiveConnectionCount() {
        return this.activeConnections.size;
    }
    startCleanupInterval(interval = 60000) {
        return setInterval(() => this.cleanupInactiveConnections(), interval);
    }
}
exports.ConnectionManager = ConnectionManager;
//# sourceMappingURL=connection-manager.js.map