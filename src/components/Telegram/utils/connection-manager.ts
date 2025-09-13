import TelegramManager from '../TelegramManager';
import { parseError } from '../../../utils/parseError';
import { TelegramLogger } from './telegram-logger';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../../../components/users/users.service';
import { BotConfig, ChannelCategory } from '../../../utils/TelegramBots.config';
import { ConnectionStatusDto } from '../dto/connection-management.dto';
import { withTimeout } from '../../../utils/withTimeout';
import { sleep } from 'telegram/Helpers';
import { contains } from '../../../utils';

interface User {
    mobile: string;
    session: string;
    tgId?: string;
}

interface ClientInfo {
    client: TelegramManager;
    lastUsed: number;
    autoDisconnect: boolean;
    state: 'connecting' | 'connected' | 'disconnected' | 'error';
    connectionAttempts: number;
    lastError?: string;
}

interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
    forceReconnect?: boolean;
}

class ConnectionManager {
    private static instance: ConnectionManager | null = null;
    private clients = new Map<string, ClientInfo>();
    private logger = new TelegramLogger('ConnectionManager');
    private cleanupTimer: NodeJS.Timeout | null = null;
    private usersService: UsersService | null = null;
    private isShuttingDown = false;

    // Configuration
    private readonly MAX_CONNECTIONS = 50;
    private readonly IDLE_TIMEOUT = 300000; // 5 minutes
    private readonly CLEANUP_INTERVAL = 60000; // 1 minute
    private readonly MAX_RETRY_ATTEMPTS = 3;

    private constructor() {
        this.startCleanup();
    }

    public static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    public setUsersService(usersService: UsersService): void {
        this.usersService = usersService;
    }

    public async getClient(mobile: string, options: GetClientOptions = {}): Promise<TelegramManager> {
        if (!mobile) {
            throw new BadRequestException('Mobile number required');
        }

        if (this.isShuttingDown) {
            throw new InternalServerErrorException('Manager is shutting down');
        }

        if (this.clients.size >= this.MAX_CONNECTIONS) {
            await this.forceCleanup();
            if (this.clients.size >= this.MAX_CONNECTIONS) {
                throw new InternalServerErrorException('Connection limit reached');
            }
        }

        const { autoDisconnect = true, handler = true, forceReconnect = false } = options;

        // Check existing client
        const existingClient = this.clients.get(mobile);
        if (existingClient && !forceReconnect) {
            if (existingClient.state === 'connected' && this.isClientHealthy(existingClient)) {
                this.updateLastUsed(mobile);
                this.logger.info(mobile, 'Reusing healthy client');
                return existingClient.client;
            }
        }

        // Clean up old client if exists
        if (existingClient) {
            this.logger.info(mobile, 'Cleaning up old client');
            await this.unregisterClient(mobile);
            await sleep(3000)
        }

        return await this.createNewClient(mobile, { autoDisconnect, handler });
    }

    private async createNewClient(mobile: string, options: { autoDisconnect: boolean; handler: boolean }): Promise<TelegramManager> {
        if (!this.usersService) {
            throw new InternalServerErrorException('UsersService not initialized');
        }

        this.logger.info(mobile, 'Creating new client', options);

        // Get user data
        const users = await this.usersService.search({ mobile });
        const user = users[0] as User;
        if (!user) {
            throw new NotFoundException(`[Connection Manager]\nUser not found : ${mobile}`);
        }

        const telegramManager = new TelegramManager(user.session, user.mobile);

        // Initialize client info
        const clientInfo: ClientInfo = {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            state: 'connecting',
            connectionAttempts: 1
        };

        this.clients.set(mobile, clientInfo);

        try {
            // Create client with timeout
            await telegramManager.createClient(options.handler)

            // Validate connection
            await this.validateConnection(mobile, telegramManager)

            // Update client state
            clientInfo.state = 'connected';
            clientInfo.connectionAttempts = 1;
            delete clientInfo.lastError;
            this.clients.set(mobile, clientInfo);

            // this.logger.info(mobile, 'Client created successfully');
            return telegramManager;

        } catch (error) {
            this.logger.error(mobile, 'Client creation failed', error);
            await this.handleConnectionError(mobile, clientInfo, error as Error);
            await this.unregisterClient(mobile);
            throw error;
        }
    }

    private async validateConnection(mobile: string, client: TelegramManager): Promise<void> {
        await withTimeout(() => client.client.getMe(), {
            errorMessage: `getMe TimeOut for ${mobile}\napiId: ${client.apiId}\napiHash:${client.apiHash}`,
            maxRetries: 3,
            throwErr: true
        })
    }

    private isClientHealthy(clientInfo: ClientInfo): boolean {
        const now = Date.now();
        const isConnected = clientInfo.client?.connected() === true;
        const isNotStale = (now - clientInfo.lastUsed) < this.IDLE_TIMEOUT;
        const hasNoErrors = clientInfo.state === 'connected' && !clientInfo.lastError;

        return isConnected && isNotStale && hasNoErrors;
    }

    private async handleConnectionError(mobile: string, clientInfo: ClientInfo, error: Error): Promise<void> {
        clientInfo.lastError = error.message;
        clientInfo.state = 'error';
        this.clients.set(mobile, clientInfo);

        const errorDetails = parseError(error, mobile, false);
        let markedAsExpired: boolean = false
        // Handle permanent failures
        const permanentErrors = ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'];
        if (contains(errorDetails.message, permanentErrors)) {
            this.logger.info(mobile, 'Marking user as expired due to permanent error');
            try {
                const users = await this.usersService!.search({ mobile });
                const user = users[0] as User;
                if (user) {
                    await this.usersService!.updateByFilter(
                        { $or: [{ tgId: user.tgId }, { mobile: mobile }] },
                        { expired: true }
                    );
                    markedAsExpired = true
                }
            } catch (updateError) {
                this.logger.error(mobile, 'Failed to mark user as expired', updateError);
            }
        }

        try {
            await BotConfig.getInstance().sendMessage(
                ChannelCategory.ACCOUNT_LOGIN_FAILURES,
                `${errorDetails.message}\n\nMarkedAsExpired: ${markedAsExpired}`
            );
        } catch (notificationError) {
            this.logger.error(mobile, 'Failed to send error notification', notificationError);
        }
    }

    public async unregisterClient(mobile: string): Promise<void> {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo) return;

        // this.logger.info(mobile, 'Removing client', { state: clientInfo.state });

        try {
            clientInfo.state = 'disconnected';

            await withTimeout(() => clientInfo.client.destroy(), {
                timeout: 30000,
                errorMessage: "Client destroy timeout"
            })
        } catch (error) {
            this.logger.error(mobile, 'Error destroying client', error);
        } finally {
            this.clients.delete(mobile);
            // this.logger.info(mobile, 'Client removed from registry');
        }
    }

    private updateLastUsed(mobile: string): void {
        const clientInfo = this.clients.get(mobile);
        if (clientInfo) {
            clientInfo.lastUsed = Date.now();
            this.clients.set(mobile, clientInfo);
        }
    }

    public hasClient(mobile: string): boolean {
        const clientInfo = this.clients.get(mobile);
        return clientInfo !== undefined && clientInfo.state === 'connected';
    }

    public getClientState(mobile: string): ConnectionStatusDto | undefined {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo) return undefined;

        return {
            autoDisconnect: clientInfo.autoDisconnect,
            connectionAttempts: clientInfo.connectionAttempts,
            lastUsed: clientInfo.lastUsed,
            state: clientInfo.state,
            lastError: clientInfo.lastError
        };
    }

    public getConnectionStats(): {
        total: number;
        connected: number;
        connecting: number;
        disconnected: number;
        error: number;
    } {
        const stats = {
            total: this.clients.size,
            connected: 0,
            connecting: 0,
            disconnected: 0,
            error: 0
        };

        for (const client of this.clients.values()) {
            stats[client.state]++;
        }

        return stats;
    }

    private async cleanup(): Promise<void> {
        if (this.isShuttingDown) return;

        const now = Date.now();
        const toRemove: string[] = [];

        // this.logger.info('ConnectionManager', `Starting cleanup - ${this.clients.size} clients`);

        for (const [mobile, clientInfo] of this.clients.entries()) {
            const isIdle = (now - clientInfo.lastUsed) > this.IDLE_TIMEOUT;
            const shouldAutoDisconnect = clientInfo.autoDisconnect && isIdle;
            const isStale = (now - clientInfo.lastUsed) > (this.IDLE_TIMEOUT * 2);
            const isErrored = clientInfo.state === 'error';
            const tooManyAttempts = clientInfo.connectionAttempts >= this.MAX_RETRY_ATTEMPTS;

            if (shouldAutoDisconnect || isStale || isErrored || tooManyAttempts) {
                this.logger.info(mobile, 'Marking for cleanup', {
                    shouldAutoDisconnect,
                    isStale,
                    isErrored,
                    tooManyAttempts,
                    idleTime: now - clientInfo.lastUsed
                });
                toRemove.push(mobile);
            }
        }

        // Remove clients in parallel with limit
        const removePromises = toRemove.slice(0, 10).map(mobile =>
            this.unregisterClient(mobile).catch(error =>
                this.logger.error(mobile, 'Cleanup removal failed', error)
            )
        );

        if (removePromises.length > 0) {
            await Promise.allSettled(removePromises);
            this.logger.info('ConnectionManager', `Cleanup completed - removed ${removePromises.length} clients`);
        }
    }

    private async forceCleanup(): Promise<void> {
        this.logger.info('ConnectionManager', 'Force cleanup triggered');

        const oldestClients = Array.from(this.clients.entries())
            .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
            .slice(0, Math.ceil(this.MAX_CONNECTIONS * 0.2)) // Remove 20% of oldest
            .map(([mobile]) => mobile);

        for (const mobile of oldestClients) {
            await this.unregisterClient(mobile);
        }

        this.logger.info('ConnectionManager', `Force cleanup completed - removed ${oldestClients.length} clients`);
    }

    public async forceReconnect(mobile: string): Promise<TelegramManager> {
        this.logger.info(mobile, 'Force reconnect requested');
        await this.unregisterClient(mobile);
        return this.getClient(mobile, { forceReconnect: true });
    }

    private startCleanup(): void {
        if (this.cleanupTimer) return;

        this.cleanupTimer = setInterval(() => {
            this.cleanup().catch(error =>
                this.logger.error('ConnectionManager', 'Cleanup error', error)
            );
        }, this.CLEANUP_INTERVAL);

        this.logger.info('ConnectionManager', `Cleanup started - ${this.CLEANUP_INTERVAL}ms interval`);
    }

    private stopCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            this.logger.info('ConnectionManager', 'Cleanup stopped');
        }
    }

    public async shutdown(): Promise<void> {
        this.logger.info('ConnectionManager', 'Shutdown initiated');
        this.isShuttingDown = true;
        this.stopCleanup();

        // Disconnect all clients
        await this.disconnectAll();
        this.clients.clear();
        this.logger.info('ConnectionManager', 'Shutdown completed');
    }

    public async disconnectAll() {
        const disconnectPromises = Array.from(this.clients.keys()).map(mobile =>
            this.unregisterClient(mobile).catch(error =>
                this.logger.error(mobile, 'Shutdown disconnect failed', error)
            )
        );

        await Promise.allSettled(disconnectPromises);
    }

    // Utility methods for monitoring
    public getActiveConnectionCount(): number {
        return Array.from(this.clients.values())
            .filter(client => client.state === 'connected').length;
    }

    public getClientList(): string[] {
        return Array.from(this.clients.keys());
    }

    public getHealthReport(): {
        totalClients: number;
        healthyClients: number;
        unhealthyClients: string[];
        memoryUsage: number;
    } {
        const unhealthyClients: string[] = [];
        let healthyCount = 0;

        for (const [mobile, clientInfo] of this.clients.entries()) {
            if (this.isClientHealthy(clientInfo)) {
                healthyCount++;
            } else {
                unhealthyClients.push(mobile);
            }
        }

        return {
            totalClients: this.clients.size,
            healthyClients: healthyCount,
            unhealthyClients,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }
}

export const connectionManager = ConnectionManager.getInstance();

export async function unregisterClient(mobile: string) {
    await connectionManager.unregisterClient(mobile)
}