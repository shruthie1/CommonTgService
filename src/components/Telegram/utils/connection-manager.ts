import { TelegramError, TelegramErrorCode } from '../types/telegram-error';
import { RateLimiter } from './rate-limiter';
import TelegramManager from '../TelegramManager';

export class ConnectionManager {
    private static instance: ConnectionManager;
    private clientRateLimiter: RateLimiter;
    private operationRateLimiter: RateLimiter;
    private activeConnections: Map<string, { client: TelegramManager; lastUsed: number }>;

    private constructor() {
        // Rate limit: 5 new connections per minute per mobile
        this.clientRateLimiter = new RateLimiter(60000, 5);
        // Rate limit: 30 operations per minute per client
        this.operationRateLimiter = new RateLimiter(60000, 30);
        this.activeConnections = new Map();
    }

    static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    async acquireConnection(mobile: string, client: TelegramManager): Promise<void> {
        await this.clientRateLimiter.waitForRateLimit(mobile);
        this.activeConnections.set(mobile, {
            client,
            lastUsed: Date.now()
        });
    }

    async releaseConnection(mobile: string): Promise<void> {
        const connection = this.activeConnections.get(mobile);
        if (connection) {
            try {
                await connection.client.disconnect();
            } catch (error) {
                console.error(`Error disconnecting client ${mobile}:`, error);
            } finally {
                this.activeConnections.delete(mobile);
            }
        }
    }

    async cleanupInactiveConnections(maxIdleTime: number = 180000): Promise<void> {
        const now = Date.now();
        for (const [mobile, connection] of this.activeConnections.entries()) {
            if (now - connection.lastUsed > maxIdleTime) {
                console.log(`Releasing inactive connection for ${mobile}`);
                await this.releaseConnection(mobile);
            }
        }
    }

    async executeWithRateLimit<T>(mobile: string, operation: () => Promise<T>): Promise<T> {
        await this.operationRateLimiter.waitForRateLimit(mobile);
        try {
            return await operation();
        } catch (error) {
            if (error.message?.includes('FLOOD_WAIT')) {
                throw new TelegramError(
                    'Rate limit exceeded',
                    TelegramErrorCode.FLOOD_WAIT,
                    { waitTime: parseInt(error.message.match(/\d+/)?.[0] || '0') }
                );
            }
            throw error;
        }
    }

    updateLastUsed(mobile: string): void {
        const connection = this.activeConnections.get(mobile);
        if (connection) {
            connection.lastUsed = Date.now();
            this.activeConnections.set(mobile, connection);
        }
    }

    getActiveConnectionCount(): number {
        return this.activeConnections.size;
    }

    startCleanupInterval(interval: number = 60000): NodeJS.Timer {
        return setInterval(() => this.cleanupInactiveConnections(), interval);
    }
}