import TelegramManager from '../TelegramManager';
import { parseError } from '../../../utils/parseError';
import { TelegramLogger } from './telegram-logger';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { UsersService } from '../../../components/users/users.service';
import { TelegramClient } from 'telegram';
import { contains } from '../../../utils';
import { BotConfig, ChannelCategory } from '../../../utils/TelegramBots.config';

interface ClientInfo {
    client: TelegramManager;
    lastUsed: number;
    autoDisconnect: boolean;
    connectionAttempts: number;
    isConnecting: boolean;
}

interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    maxRetries?: number;
}

interface ConnectionStats {
    activeConnections: number;
    totalConnections: number;
    failedConnections: number;
    cleanupCount: number;
}

class ConnectionManagerError extends Error {
    constructor(
        message: string,
        public readonly mobile: string,
        public readonly operation: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'ConnectionManagerError';
    }
}

class ConnectionManager {
    private static instance: ConnectionManager;
    private clients: Map<string, ClientInfo> = new Map();
    private readonly logger: TelegramLogger;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private usersService: UsersService | null = null;
    private readonly maxRetries: number = 3;
    private readonly connectionTimeout: number = 30000; // 30 seconds
    private stats: ConnectionStats = {
        activeConnections: 0,
        totalConnections: 0,
        failedConnections: 0,
        cleanupCount: 0
    };

    private constructor() {
        this.logger = TelegramLogger.getInstance();
        this.logger.logOperation('system', 'ConnectionManager initialized');
    }

    public setUsersService(usersService: UsersService): void {
        if (!usersService) {
            throw new Error('UsersService cannot be null or undefined');
        }
        this.usersService = usersService;
        this.logger.logOperation('system', 'UsersService registered successfully');
    }

    public static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    private async cleanupInactiveConnections(maxIdleTime: number = 180000): Promise<number> {
        const startTime = Date.now();
        let cleanedCount = 0;
        
        try {
            this.logger.logOperation('system', 'Starting cleanup of inactive connections', { maxIdleTime });
            
            const now = Date.now();
            const clientsToCleanup: string[] = [];
            
            // Identify clients to cleanup
            for (const [mobile, connection] of this.clients.entries()) {
                if (!connection.autoDisconnect) {
                    continue;
                }
                
                if (now - connection.lastUsed > maxIdleTime) {
                    clientsToCleanup.push(mobile);
                }
            }
            
            // Cleanup identified clients
            for (const mobile of clientsToCleanup) {
                try {
                    this.logger.logOperation(mobile, 'Cleaning up inactive connection');
                    await this.unregisterClient(mobile);
                    cleanedCount++;
                } catch (error) {
                    this.logger.logError(mobile, 'Failed to cleanup inactive connection', error);
                }
            }
            
            this.stats.cleanupCount += cleanedCount;
            const duration = Date.now() - startTime;
            
            this.logger.logOperation('system', 'Cleanup completed', {
                cleanedCount,
                totalChecked: this.clients.size + cleanedCount,
                duration: `${duration}ms`
            });
            
            return cleanedCount;
        } catch (error) {
            this.logger.logError('system', 'Error during cleanup operation', error);
            throw new ConnectionManagerError(
                'Cleanup operation failed',
                'system',
                'cleanupInactiveConnections',
                error as Error
            );
        }
    }

    private updateLastUsed(mobile: string): boolean {
        try {
            const connection = this.clients.get(mobile);
            if (connection) {
                connection.lastUsed = Date.now();
                this.clients.set(mobile, connection);
                return true;
            }
            return false;
        } catch (error) {
            this.logger.logError(mobile, 'Failed to update last used timestamp', error);
            return false;
        }
    }

    private async validateMobile(mobile: string): Promise<void> {
        if (!mobile || typeof mobile !== 'string' || mobile.trim().length === 0) {
            throw new BadRequestException('Mobile number is required and must be a non-empty string');
        }
        
        // // Basic mobile number validation (adjust regex as needed)
        // const mobileRegex = /^\+?[1-9]\d{1,14}$/;
        // if (!mobileRegex.test(mobile.trim())) {
        //     throw new BadRequestException('Invalid mobile number format');
        // }
    }

    private async getUserByMobile(mobile: string): Promise<any> {
        if (!this.usersService) {
            throw new InternalServerErrorException('UsersService not initialized');
        }

        try {
            const users = await this.usersService.search({ mobile });
            if (!users || users.length === 0) {
                throw new BadRequestException(`User not found for mobile: ${mobile}`);
            }
            
            const user = users[0];
            if (!user.session) {
                throw new BadRequestException(`User session not found for mobile: ${mobile}`);
            }
            
            return user;
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.logError(mobile, 'Failed to fetch user from database', error);
            throw new InternalServerErrorException('Failed to retrieve user information');
        }
    }

    public async getClient(mobile: string, options: GetClientOptions = {}): Promise<TelegramManager> {
        const startTime = Date.now();
        const { autoDisconnect = true, handler = true, maxRetries = this.maxRetries } = options;
        
        try {
            // Validate input
            await this.validateMobile(mobile);
            
            this.logger.logOperation(mobile, 'Getting/Creating client', { 
                autoDisconnect, 
                handler, 
                maxRetries 
            });

            // Check for existing client
            const existingClient = await this.tryGetExistingClient(mobile);
            if (existingClient) {
                const duration = Date.now() - startTime;
                this.logger.logOperation(mobile, 'Client retrieved successfully', { 
                    source: 'existing',
                    duration: `${duration}ms`
                });
                return existingClient;
            }

            // Create new client with retries
            const newClient = await this.createNewClientWithRetries(mobile, { autoDisconnect, handler }, maxRetries);
            
            const duration = Date.now() - startTime;
            this.logger.logOperation(mobile, 'Client created successfully', { 
                source: 'new',
                duration: `${duration}ms`
            });
            
            return newClient;
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.stats.failedConnections++;
            
            this.logger.logError(mobile, 'Failed to get client', error);
            
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            
            throw new InternalServerErrorException('Failed to establish Telegram connection');
        }
    }

    private async tryGetExistingClient(mobile: string): Promise<TelegramManager | null> {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo?.client) {
            return null;
        }

        // Check if another process is already connecting
        if (clientInfo.isConnecting) {
            this.logger.logOperation(mobile, 'Another connection attempt in progress, waiting...');
            await this.waitForConnection(mobile);
            return this.clients.get(mobile)?.client || null;
        }

        this.updateLastUsed(mobile);

        if (clientInfo.client.connected()) {
            this.logger.logOperation(mobile, 'Reusing existing connected client');
            return clientInfo.client;
        }

        // Try to reconnect existing client
        try {
            clientInfo.isConnecting = true;
            this.logger.logOperation(mobile, 'Reconnecting existing client');
            
            await Promise.race([
                clientInfo.client.connect(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout)
                )
            ]);
            
            clientInfo.isConnecting = false;
            return clientInfo.client;
        } catch (error) {
            clientInfo.isConnecting = false;
            this.logger.logError(mobile, 'Failed to reconnect existing client', error);
            await this.unregisterClient(mobile);
            return null;
        }
    }

    private async waitForConnection(mobile: string, maxWaitTime: number = 60000): Promise<void> {
        const startTime = Date.now();
        const checkInterval = 1000; // Check every 1 second
        
        while (Date.now() - startTime < maxWaitTime) {
            const clientInfo = this.clients.get(mobile);
            if (!clientInfo?.isConnecting) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        
        throw new Error('Timeout waiting for connection to complete');
    }

    private async createNewClientWithRetries(
        mobile: string, 
        options: { autoDisconnect: boolean; handler: boolean }, 
        maxRetries: number
    ): Promise<TelegramManager> {
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.logOperation(mobile, `Creating client (attempt ${attempt}/${maxRetries})`);
                
                const client = await this.createNewClient(mobile, options);
                this.stats.totalConnections++;
                return client;
                
            } catch (error) {
                lastError = error as Error;
                this.logger.logError(mobile, `Client creation attempt ${attempt} failed`, error);
                
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
                    this.logger.logOperation(mobile, `Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    // Handle specific error types for final attempt
                    await this.handleFinalError(mobile, error as Error);
                }
            }
        }
        
        throw lastError || new Error('All retry attempts failed');
    }

    private async createNewClient(
        mobile: string, 
        options: { autoDisconnect: boolean; handler: boolean }
    ): Promise<TelegramManager> {
        // Mark as connecting
        const tempClientInfo: ClientInfo = {
            client: null as any,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            connectionAttempts: 0,
            isConnecting: true
        };
        this.clients.set(mobile, tempClientInfo);

        try {
            const user = await this.getUserByMobile(mobile);
            const telegramManager = new TelegramManager(user.session, user.mobile);
            
            const client: TelegramClient = await Promise.race([
                telegramManager.createClient(options.handler),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Client creation timeout')), this.connectionTimeout)
                )
            ]);

            // Verify client is working
            await Promise.race([
                client.getMe(),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Client verification timeout')), this.connectionTimeout)
                )
            ]);

            // Register the successful client
            await this.registerClient(mobile, telegramManager, { autoDisconnect: options.autoDisconnect });
            
            return telegramManager;
            
        } catch (error) {
            // Clean up failed attempt
            this.clients.delete(mobile);
            throw error;
        }
    }

    private async handleFinalError(mobile: string, error: Error): Promise<void> {
        try {
            this.logger.logDebug(mobile, 'Parsing final error details...');
            const errorDetails = parseError(error, mobile, false);
            
            // Send notification about the failure
            try {
                await BotConfig.getInstance().sendMessage(
                    ChannelCategory.ACCOUNT_LOGIN_FAILURES, 
                    `${process.env.clientId}::${mobile}\n\n${errorDetails.message}`
                );
            } catch (notificationError) {
                this.logger.logError(mobile, 'Failed to send error notification', notificationError);
            }
            
            // Handle account status updates
            const lowerCaseMessage = errorDetails.message.toLowerCase();
            const expiredKeywords = ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'];
            
            if (contains(lowerCaseMessage, expiredKeywords)) {
                await this.markUserAsExpired(mobile);
            }
            
            throw new BadRequestException(errorDetails.message);
            
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.logError(mobile, 'Error handling final error', error);
            throw new InternalServerErrorException('Client creation failed with unhandled error');
        }
    }

    private async markUserAsExpired(mobile: string): Promise<void> {
        try {
            if (!this.usersService) {
                throw new Error('UsersService not available');
            }
            
            this.logger.logOperation(mobile, 'Marking user as expired');
            
            // Try to get user info first to get tgId
            const users = await this.usersService.search({ mobile });
            const user = users?.[0];
            
            const filter = user?.tgId 
                ? { $or: [{ tgId: user.tgId }, { mobile: mobile }] }
                : { mobile: mobile };
                
            await this.usersService.updateByFilter(filter, { expired: true });
            
            this.logger.logOperation(mobile, 'User marked as expired successfully');
            
        } catch (error) {
            this.logger.logError(mobile, 'Failed to mark user as expired', error);
            // Don't throw here as this is a secondary operation
        }
    }

    public hasClient(mobile: string): boolean {
        try {
            if (!mobile) return false;
            return this.clients.has(mobile);
        } catch (error) {
            this.logger.logError(mobile || 'unknown', 'Error checking client existence', error);
            return false;
        }
    }

    public async disconnectAll(): Promise<number> {
        const startTime = Date.now();
        let disconnectedCount = 0;
        
        try {
            this.logger.logOperation('system', 'Starting disconnection of all clients');
            
            const clientMobiles = Array.from(this.clients.keys());
            const results = await Promise.allSettled(
                clientMobiles.map(async (mobile) => {
                    this.logger.logOperation(mobile, 'Disconnecting client');
                    await this.unregisterClient(mobile);
                    return mobile;
                })
            );
            
            // Count successful disconnections
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    disconnectedCount++;
                } else {
                    this.logger.logError(clientMobiles[index], 'Failed to disconnect client', result.reason);
                }
            });
            
            this.clients.clear();
            
            const duration = Date.now() - startTime;
            this.logger.logOperation('system', 'All clients disconnection completed', {
                totalClients: clientMobiles.length,
                successfulDisconnections: disconnectedCount,
                failedDisconnections: clientMobiles.length - disconnectedCount,
                duration: `${duration}ms`
            });
            
            return disconnectedCount;
            
        } catch (error) {
            this.logger.logError('system', 'Error during disconnectAll operation', error);
            throw new ConnectionManagerError(
                'Failed to disconnect all clients',
                'system',
                'disconnectAll',
                error as Error
            );
        }
    }

    private async registerClient(
        mobile: string,
        telegramManager: TelegramManager,
        options: { autoDisconnect: boolean } = { autoDisconnect: true }
    ): Promise<void> {
        try {
            this.clients.set(mobile, {
                client: telegramManager,
                lastUsed: Date.now(),
                autoDisconnect: options.autoDisconnect,
                connectionAttempts: 0,
                isConnecting: false
            });
            
            this.stats.activeConnections = this.clients.size;
            
            this.logger.logOperation(mobile, `Client registered successfully${!options.autoDisconnect ? ' (excluded from auto-cleanup)' : ''}`, {
                activeConnections: this.stats.activeConnections
            });
            
        } catch (error) {
            this.logger.logError(mobile, 'Failed to register client', error);
            throw new ConnectionManagerError(
                'Client registration failed',
                mobile,
                'registerClient',
                error as Error
            );
        }
    }

    public async unregisterClient(mobile: string): Promise<boolean> {
        try {
            const clientInfo = this.clients.get(mobile);
            if (clientInfo) {
                // Prevent new operations during disconnection
                clientInfo.isConnecting = false;
                
                if (clientInfo.client) {
                    await Promise.race([
                        clientInfo.client.disconnect(),
                        new Promise<void>((resolve) => 
                            setTimeout(() => {
                                this.logger.logError(mobile, 'Client disconnect timeout, forcing cleanup', {});
                                resolve();
                            }, 10000)
                        )
                    ]);
                }
                
                this.clients.delete(mobile);
                this.stats.activeConnections = this.clients.size;
                
                this.logger.logOperation(mobile, 'Client unregistered successfully', {
                    activeConnections: this.stats.activeConnections
                });
                
                return true;
            } else {
                this.logger.logDebug(mobile, 'Client not found for unregistration');
                return false;
            }
        } catch (error) {
            this.logger.logError(mobile, 'Error in unregisterClient', error);
            // Force cleanup even if disconnect failed
            this.clients.delete(mobile);
            this.stats.activeConnections = this.clients.size;
            return false;
        }
    }

    public getActiveConnectionCount(): number {
        return this.clients.size;
    }

    public getConnectionStats(): ConnectionStats {
        return {
            ...this.stats,
            activeConnections: this.clients.size
        };
    }

    public getClientInfo(mobile: string): Omit<ClientInfo, 'client'> | null {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo) return null;
        
        return {
            lastUsed: clientInfo.lastUsed,
            autoDisconnect: clientInfo.autoDisconnect,
            connectionAttempts: clientInfo.connectionAttempts,
            isConnecting: clientInfo.isConnecting
        };
    }

    public startCleanupInterval(intervalMs: number = 300000): NodeJS.Timeout {
        if (this.cleanupInterval) {
            this.stopCleanupInterval();
        }
        
        this.logger.logOperation('system', 'Starting cleanup interval', { intervalMs });
        
        this.cleanupInterval = setInterval(async () => {
            try {
                const cleanedCount = await this.cleanupInactiveConnections();
                this.logger.logDebug('system', `Cleanup interval completed: ${cleanedCount} clients cleaned`);
            } catch (error) {
                this.logger.logError('system', 'Error in cleanup interval', error);
            }
        }, intervalMs);
        
        return this.cleanupInterval;
    }

    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.logger.logOperation('system', 'Cleanup interval stopped');
        }
    }

    public async healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        activeConnections: number;
        stats: ConnectionStats;
        issues: string[];
    }> {
        const issues: string[] = [];
        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        
        try {
            // Check if UsersService is available
            if (!this.usersService) {
                issues.push('UsersService not initialized');
                status = 'unhealthy';
            }
            
            // Check connection count
            const activeCount = this.getActiveConnectionCount();
            if (activeCount > 100) { // Adjust threshold as needed
                issues.push(`High connection count: ${activeCount}`);
                status = status === 'healthy' ? 'degraded' : status;
            }
            
            // Check for stuck connections
            let stuckConnections = 0;
            for (const [mobile, info] of this.clients.entries()) {
                if (info.isConnecting && (Date.now() - info.lastUsed) > 60000) {
                    stuckConnections++;
                }
            }
            
            if (stuckConnections > 0) {
                issues.push(`${stuckConnections} stuck connections detected`);
                status = status === 'healthy' ? 'degraded' : status;
            }
            
            return {
                status,
                activeConnections: activeCount,
                stats: this.getConnectionStats(),
                issues
            };
            
        } catch (error) {
            this.logger.logError('system', 'Health check failed', error);
            return {
                status: 'unhealthy',
                activeConnections: 0,
                stats: this.stats,
                issues: ['Health check failed']
            };
        }
    }
}

export const connectionManager = ConnectionManager.getInstance();
export { ConnectionManager, ConnectionManagerError };