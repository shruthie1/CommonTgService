import TelegramManager from '../TelegramManager';
import { parseError } from '../../../utils/parseError';
import { TelegramLogger } from './telegram-logger';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { UsersService } from '../../../components/users/users.service';
import { TelegramClient } from 'telegram';
import { contains } from '../../../utils';
import { BotConfig, ChannelCategory } from '../../../utils/TelegramBots.config';

interface User {
    mobile: string;
    session: string;
    tgId?: string;
}

interface ClientInfo {
    client: TelegramManager;
    lastUsed: number;
    autoDisconnect: boolean;
    connectionAttempts: number;
    lastError?: Error;
    state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
}

interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
}

class ConnectionManager {
    private static instance: ConnectionManager;
    private clients: Map<string, ClientInfo>;
    private readonly logger: TelegramLogger;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private usersService: UsersService | null = null;
    
    private readonly MAX_RETRY_ATTEMPTS = 3;
    private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds
    private readonly MAX_CONCURRENT_CONNECTIONS = 100;
    private readonly COOLDOWN_PERIOD = 600000; // 10 minutes

    private constructor() {
        this.clients = new Map();
        this.logger = TelegramLogger.getInstance();
        process.on('SIGTERM', () => this.handleShutdown());
        process.on('SIGINT', () => this.handleShutdown());
        this.startCleanupInterval();
    }

    private async handleShutdown(): Promise<void> {
        this.logger.logOperation('ConnectionManager', 'Graceful shutdown initiated');
        this.stopCleanupInterval();
        await this.disconnectAll();
        process.exit(0);
    }

    public setUsersService(usersService: UsersService): void {
        this.usersService = usersService;
    }

    public static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    private async cleanupInactiveConnections(maxIdleTime: number = 180000): Promise<void> {
        const now = Date.now();
        const disconnectionPromises: Promise<void>[] = [];

        for (const [mobile, connection] of this.clients.entries()) {
            if (!connection.autoDisconnect && connection.lastUsed > now - this.COOLDOWN_PERIOD) {
                this.logger.logOperation(mobile, 'Skipping cleanup for client with autoDisconnect disabled');
                continue;
            }

            if (now - connection.lastUsed > maxIdleTime || 
                connection.state === 'error' || 
                connection.connectionAttempts >= this.MAX_RETRY_ATTEMPTS) {
                this.logger.logOperation(mobile, `Cleaning up connection in state: ${connection.state}`);
                disconnectionPromises.push(this.unregisterClient(mobile));
            }
        }

        await Promise.all(disconnectionPromises);
    }

    private updateLastUsed(mobile: string): void {
        const connection = this.clients.get(mobile);
        if (connection) {
            connection.lastUsed = Date.now();
            this.clients.set(mobile, connection);
        }
    }

    private async validateConnection(mobile: string, client: TelegramManager): Promise<boolean> {
        try {
            const isConnected = client.connected();
            if (!isConnected) {
                throw new Error('Connection validation failed');
            }

            // Try to fetch basic account info as a connection test
            await Promise.race([
                client.client.getMe(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection validation timeout')), 5000)
                )
            ]);

            return true;
        } catch (error) {
            this.logger.logError(mobile, 'Connection validation failed', error);
            return false;
        }
    }

    public async getClient(mobile: string, options: GetClientOptions = {}): Promise<TelegramManager> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }

        if (this.clients.size >= this.MAX_CONCURRENT_CONNECTIONS) {
            throw new InternalServerErrorException('Maximum connection limit reached');
        }

        const { 
            autoDisconnect = true, 
            handler = true,
            timeout = this.CONNECTION_TIMEOUT 
        } = options;
        
        const clientInfo = this.clients.get(mobile);
        if (clientInfo?.client) {
            this.updateLastUsed(mobile);
            
            if (clientInfo.state === 'connected' && await this.validateConnection(mobile, clientInfo.client)) {
                this.logger.logOperation(mobile, 'Reusing existing connected client');
                return clientInfo.client;
            }

            if (clientInfo.connectionAttempts < this.MAX_RETRY_ATTEMPTS) {
                try {
                    this.logger.logOperation(mobile, 'Reconnecting existing client');
                    clientInfo.state = 'connecting';
                    this.clients.set(mobile, clientInfo);

                    await Promise.race([
                        clientInfo.client.connect(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Connection timeout')), timeout)
                        )
                    ]);

                    if (await this.validateConnection(mobile, clientInfo.client)) {
                        clientInfo.state = 'connected';
                        clientInfo.connectionAttempts = 0;
                        this.clients.set(mobile, clientInfo);
                        return clientInfo.client;
                    }
                } catch (error) {
                    clientInfo.connectionAttempts++;
                    clientInfo.lastError = error as Error;
                    clientInfo.state = 'error';
                    this.clients.set(mobile, clientInfo);
                    this.logger.logError(mobile, 'Failed to reconnect client', error);
                }
            }

            await this.unregisterClient(mobile);
        }

        if (!this.usersService) {
            throw new Error('UsersService not initialized');
        }

        const users = await this.usersService.search({ mobile });
        const user = users[0] as User;
        if (!user) {
            throw new BadRequestException('User not found');
        }
        this.logger.logOperation(mobile, 'Creating New client', { autoDisconnect, handler });

        const telegramManager = new TelegramManager(user.session, user.mobile);
        let client: TelegramClient;

        try {
            client = await Promise.race([
                telegramManager.createClient(handler),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Client creation timeout')), timeout)
                )
            ]);

            await client.getMe();

            if (client) {
                await this.registerClient(
                    mobile,
                    telegramManager,
                    { autoDisconnect }
                );
                this.logger.logOperation(mobile, 'Client created successfully');
                return telegramManager;
            } else {
                throw new BadRequestException('Client creation failed');
            }
        } catch (error) {
            this.logger.logError(mobile, 'Client creation failed', error);
            this.logger.logDebug(mobile, 'Parsing error details...');
            await this.unregisterClient(mobile);

            const errorDetails = parseError(error, mobile, false);
            await BotConfig.getInstance().sendMessage(
                ChannelCategory.ACCOUNT_LOGIN_FAILURES, 
                `${process.env.clientId}::${mobile}\n\n${errorDetails.message}`
            );

            if (contains(errorDetails.message.toLowerCase(), 
                ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'])) {
                this.logger.logOperation(mobile, 'Marking user as expired');
                await this.usersService.updateByFilter(
                    { $or: [{ tgId: user.tgId }, { mobile: mobile }] }, 
                    { expired: true }
                );
            }

            throw new BadRequestException(errorDetails.message);
        }
    }

    public hasClient(number: string): boolean {
        const client = this.clients.get(number);
        return client !== undefined && client.state === 'connected';
    }

    public async disconnectAll(): Promise<void> {
        this.logger.logOperation('ConnectionManager', 'Disconnecting all clients');
        const disconnectionPromises: Promise<void>[] = [];

        for (const [mobile, connection] of this.clients.entries()) {
            if (connection.state !== 'disconnecting' && connection.state !== 'disconnected') {
                connection.state = 'disconnecting';
                this.clients.set(mobile, connection);
                this.logger.logOperation(mobile, 'Disconnecting client');
                disconnectionPromises.push(this.unregisterClient(mobile));
            }
        }

        await Promise.all(disconnectionPromises);
        this.clients.clear();
        this.logger.logOperation('ConnectionManager', 'All clients disconnected');
    }

    private async registerClient(
        mobile: string,
        telegramManager: TelegramManager,
        options: { autoDisconnect: boolean } = { autoDisconnect: true }
    ): Promise<void> {
        this.clients.set(mobile, {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            connectionAttempts: 0,
            state: 'connected'
        });
        
        this.logger.logOperation(
            mobile, 
            `Client registered successfully${!options.autoDisconnect ? ' (excluded from auto-cleanup)' : ''}`
        );
    }

    public async unregisterClient(mobile: string): Promise<void> {
        try {
            const clientInfo = this.clients.get(mobile);
            if (clientInfo) {
                clientInfo.state = 'disconnecting';
                this.clients.set(mobile, clientInfo);
                
                await Promise.race([
                    clientInfo.client?.disconnect(),
                    new Promise((resolve) => setTimeout(resolve, 5000))
                ]);

                this.logger.logOperation(mobile, 'Client unregistered successfully');
            }
        } catch (error) {
            this.logger.logError(mobile, 'Error in unregisterClient', error);
        } finally {
            this.clients.delete(mobile);
        }
    }

    public getActiveConnectionCount(): number {
        return Array.from(this.clients.values())
            .filter(client => client.state === 'connected')
            .length;
    }

    public startCleanupInterval(intervalMs: number = 120000): NodeJS.Timeout {
        if (this.cleanupInterval) {
            // If interval is already running with the same timing, don't restart
            return this.cleanupInterval;
        }
        
        this.stopCleanupInterval();
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveConnections().catch(err => {
                this.logger.logError('ConnectionManager', 'Error in cleanup interval', err);
            });
        }, intervalMs);
        this.logger.logOperation('ConnectionManager', `Cleanup interval started with ${intervalMs}ms interval`);
        
        // Run initial cleanup immediately
        this.cleanupInactiveConnections().catch(err => {
            this.logger.logError('ConnectionManager', 'Error in initial cleanup', err);
        });
        
        return this.cleanupInterval;
    }

    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.logger.logOperation('ConnectionManager', 'Cleanup interval stopped');
            this.cleanupInterval = null;
        }
    }

    public getClientState(mobile: string): string | undefined {
        return this.clients.get(mobile)?.state;
    }

    public getConnectionStats(): { 
        total: number;
        connected: number;
        connecting: number;
        disconnecting: number;
        error: number;
    } {
        const stats = {
            total: this.clients.size,
            connected: 0,
            connecting: 0,
            disconnecting: 0,
            error: 0
        };

        for (const client of this.clients.values()) {
            stats[client.state as keyof typeof stats]++;
        }

        return stats;
    }
}

export const connectionManager = ConnectionManager.getInstance();