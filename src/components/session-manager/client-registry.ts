import { Injectable } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { TelegramLogger } from '../Telegram/utils/telegram-logger';

interface ClientInfo {
    client: TelegramClient;
    mobile: string;
    sessionString: string;
    createdAt: Date;
    lastActivity: Date;
    isCreating: boolean;
    lockId?: string;
}

@Injectable()
export class ClientRegistry {
    private static instance: ClientRegistry | null = null;
    private readonly clients = new Map<string, ClientInfo>();
    private readonly logger = TelegramLogger.getInstance();
    private readonly locks = new Map<string, { acquired: Date; lockId: string }>();

    // Maximum time to wait for a lock (in ms)
    private readonly LOCK_TIMEOUT = 30000; // 30 seconds

    // Maximum time a lock can be held (in ms)
    private readonly LOCK_EXPIRY = 120000; // 2 minutes

    // Client inactivity timeout (in ms)
    private readonly CLIENT_TIMEOUT = 300000; // 5 minutes

    private constructor() {
        // Start cleanup interval
        setInterval(() => this.cleanupInactiveClients(), 60000); // Run every minute
        setInterval(() => this.cleanupExpiredLocks(), 30000); // Run every 30 seconds
    }

    public static getInstance(): ClientRegistry {
        if (!ClientRegistry.instance) {
            ClientRegistry.instance = new ClientRegistry();
        }
        return ClientRegistry.instance;
    }

    /**
     * Acquire a lock for a phone number to prevent concurrent operations
     */
    async acquireLock(mobile: string): Promise<string | null> {
        const lockId = `${mobile}_${Date.now()}_${Math.random()}`;
        const now = new Date();

        // Check if lock already exists
        const existingLock = this.locks.get(mobile);
        if (existingLock) {
            // Check if lock is expired
            if (now.getTime() - existingLock.acquired.getTime() > this.LOCK_EXPIRY) {
                this.locks.delete(mobile);
                this.logger.info(mobile, 'Removed expired lock');
            } else {
                this.logger.info(mobile, 'Lock already exists, waiting...');
                return null;
            }
        }

        // Acquire lock
        this.locks.set(mobile, { acquired: now, lockId });
        this.logger.info(mobile, `Lock acquired: ${lockId}`);
        return lockId;
    }

    /**
     * Release a lock for a phone number
     */
    releaseLock(mobile: string, lockId: string): boolean {
        const lock = this.locks.get(mobile);
        if (lock && lock.lockId === lockId) {
            this.locks.delete(mobile);
            this.logger.info(mobile, `Lock released: ${lockId}`);
            return true;
        }
        return false;
    }

    /**
     * Wait for lock acquisition with timeout
     */
    async waitForLock(mobile: string): Promise<string | null> {
        const startTime = Date.now();

        while (Date.now() - startTime < this.LOCK_TIMEOUT) {
            const lockId = await this.acquireLock(mobile);
            if (lockId) {
                return lockId;
            }

            // Wait 1 second before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        throw new Error(`Lock acquisition timeout for ${mobile}`);
    }

    /**
     * Check if a client exists for the phone number
     */
    hasClient(mobile: string): boolean {
        return this.clients.has(mobile);
    }

    /**
     * Get client info if it exists
     */
    getClientInfo(mobile: string): ClientInfo | null {
        return this.clients.get(mobile) || null;
    }

    /**
     * Register a new client (only if none exists or after acquiring lock)
     */
    async registerClient(
        mobile: string,
        client: TelegramClient,
        sessionString: string,
        lockId: string
    ): Promise<boolean> {
        // Verify lock ownership
        const lock = this.locks.get(mobile);
        if (!lock || lock.lockId !== lockId) {
            throw new Error(`Invalid lock for registering client: ${mobile}`);
        }

        // Check if client already exists
        if (this.clients.has(mobile)) {
            this.logger.error(mobile, 'Client already exists, cannot register new one', new Error('Duplicate client'));
            return false;
        }

        const clientInfo: ClientInfo = {
            client,
            mobile,
            sessionString,
            createdAt: new Date(),
            lastActivity: new Date(),
            isCreating: false,
            lockId
        };

        this.clients.set(mobile, clientInfo);
        this.logger.info(mobile, 'Client registered successfully');
        return true;
    }

    /**
     * Mark a client as currently being created
     */
    markClientCreating(mobile: string, lockId: string): boolean {
        const lock = this.locks.get(mobile);
        if (!lock || lock.lockId !== lockId) {
            return false;
        }

        const existing = this.clients.get(mobile);
        if (existing) {
            existing.isCreating = true;
            existing.lastActivity = new Date();
            return true;
        }

        // Create placeholder for client being created
        const clientInfo: ClientInfo = {
            client: null as any, // Will be set later
            mobile,
            sessionString: '',
            createdAt: new Date(),
            lastActivity: new Date(),
            isCreating: true,
            lockId
        };

        this.clients.set(mobile, clientInfo);
        return true;
    }

    /**
     * Update activity timestamp
     */
    updateActivity(mobile: string): void {
        const clientInfo = this.clients.get(mobile);
        if (clientInfo) {
            clientInfo.lastActivity = new Date();
        }
    }

    /**
     * Remove a client
     */
    async removeClient(mobile: string, lockId?: string): Promise<boolean> {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo) {
            return false;
        }

        // If lockId is provided, verify ownership
        if (lockId) {
            const lock = this.locks.get(mobile);
            if (!lock || lock.lockId !== lockId) {
                this.logger.error(mobile, 'Invalid lock for removing client', new Error('Invalid lock'));
                return false;
            }
        }

        // Disconnect client if it exists
        if (clientInfo.client) {
            try {
                let tempClient = clientInfo.client;
                if (tempClient) {
                    try {
                        await tempClient.destroy();
                        tempClient._eventBuilders = [];
                        this.logger.info(mobile, 'Temporary client cleaned up');
                    } catch (cleanupError) {
                        this.logger.error(mobile, 'Failed to cleanup temporary client', cleanupError);
                    } finally {
                        if (tempClient) {
                            tempClient._destroyed = true;
                            if (tempClient._sender && typeof tempClient._sender.disconnect === 'function') {
                                await tempClient._sender.disconnect();
                            }
                            tempClient = null;
                        }
                    }
                } this.logger.info(mobile, 'Client disconnected during removal');
            } catch (error) {
                this.logger.error(mobile, 'Error disconnecting client during removal', error);
            }
        }

        this.clients.delete(mobile);
        this.logger.info(mobile, 'Client removed from registry');
        return true;
    }

    /**
     * Get active client count
     */
    getActiveClientCount(): number {
        return this.clients.size;
    }

    /**
     * Get all phone numbers with active clients
     */
    getActivemobiles(): string[] {
        return Array.from(this.clients.keys());
    }

    /**
     * Cleanup inactive clients
     */
    private async cleanupInactiveClients(): Promise<void> {
        const now = new Date();
        const inactiveClients: string[] = [];

        for (const [mobile, clientInfo] of this.clients.entries()) {
            const inactiveTime = now.getTime() - clientInfo.lastActivity.getTime();

            if (inactiveTime > this.CLIENT_TIMEOUT) {
                inactiveClients.push(mobile);
            }
        }

        for (const mobile of inactiveClients) {
            this.logger.info(mobile, 'Removing inactive client');
            await this.removeClient(mobile);
        }

        if (inactiveClients.length > 0) {
            this.logger.info('SYSTEM', `Cleaned up ${inactiveClients.length} inactive clients`);
        }
    }

    /**
     * Cleanup expired locks
     */
    private cleanupExpiredLocks(): void {
        const now = new Date();
        const expiredLocks: string[] = [];

        for (const [mobile, lock] of this.locks.entries()) {
            const lockAge = now.getTime() - lock.acquired.getTime();

            if (lockAge > this.LOCK_EXPIRY) {
                expiredLocks.push(mobile);
            }
        }

        for (const mobile of expiredLocks) {
            this.locks.delete(mobile);
            this.logger.info(mobile, 'Removed expired lock');
        }

        if (expiredLocks.length > 0) {
            this.logger.info('SYSTEM', `Cleaned up ${expiredLocks.length} expired locks`);
        }
    }

    /**
     * Force cleanup all clients and locks for a phone number
     */
    async forceCleanup(mobile: string): Promise<number> {
        let cleanedCount = 0;

        // Remove lock
        if (this.locks.has(mobile)) {
            this.locks.delete(mobile);
            cleanedCount++;
        }

        // Remove client
        if (await this.removeClient(mobile)) {
            cleanedCount++;
        }

        this.logger.info(mobile, `Force cleanup completed, removed ${cleanedCount} items`);
        return cleanedCount;
    }

    /**
     * Get registry statistics
     */
    getStats(): {
        activeClients: number;
        activeLocks: number;
        mobiles: string[];
    } {
        return {
            activeClients: this.clients.size,
            activeLocks: this.locks.size,
            mobiles: Array.from(this.clients.keys())
        };
    }
}
