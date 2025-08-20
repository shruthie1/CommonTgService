import TelegramManager from '../TelegramManager';
import { parseError } from '../../../utils/parseError';
import { TelegramLogger } from './telegram-logger';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { UsersService } from '../../../components/users/users.service';
import { contains, sleep } from '../../../utils';
import { BotConfig, ChannelCategory } from '../../../utils/TelegramBots.config';
import { ConnectionStatusDto } from '../dto/connection-management.dto';

interface User {
    mobile: string;
    session: string;
    tgId?: string;
}

interface RetryConfig {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitter: boolean;
}

interface ClientInfo {
    client: TelegramManager;
    lastUsed: number;
    autoDisconnect: boolean;
    connectionAttempts: number;
    lastError?: string;
    state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
    retryConfig: RetryConfig;
    nextRetryAt?: number;
    consecutiveFailures: number;
    lastSuccessfulConnection?: number;
    cleanupAttempts?: number; // Track cleanup attempts
}

interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
    retryConfig?: Partial<RetryConfig>;
    forceReconnect?: boolean;
}

interface ConnectionLeakReport {
    mapSize: number;
    activeConnections: string[];
    zombieConnections: string[];
    staleConnections: string[];
}

class ConnectionManager {
    private static instance: ConnectionManager | null = null;
    private clients: Map<string, ClientInfo>;
    private readonly logger: TelegramLogger;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private usersService: UsersService | null = null;
    private isShuttingDown: boolean = false;

    private readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true
    };

    private readonly CONNECTION_TIMEOUT = 60000;
    private readonly MAX_CONCURRENT_CONNECTIONS = 100;
    private readonly COOLDOWN_PERIOD = 600000;
    private readonly VALIDATION_TIMEOUT = 10000;
    private readonly CLEANUP_TIMEOUT = 15000;
    private readonly MAX_CLEANUP_ATTEMPTS = 3;

    private constructor() {
        this.clients = new Map();
        this.logger = new TelegramLogger('Connection Manager');
        this.startCleanupInterval();
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

    public async handleShutdown(): Promise<void> {
        this.logger.info('ConnectionManager', 'Graceful shutdown initiated');
        this.isShuttingDown = true;
        await this.disconnectAll();
        this.stopCleanupInterval();
    }

    private createTimeoutPromise<T>(timeoutMs: number, signal?: AbortSignal): Promise<T> {
        return new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Operation timeout'));
            }, timeoutMs);

            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('Operation aborted'));
                }, { once: true });
            }
        });
    }

    private calculateRetryDelay(attempt: number, config: RetryConfig): number {
        let delay = Math.min(
            config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
            config.maxDelay
        );

        if (config.jitter) {
            // Add jitter to prevent thundering herd
            delay = delay * (0.5 + Math.random() * 0.5);
        }

        return Math.floor(delay);
    }

    private shouldRetry(clientInfo: ClientInfo, error: string): boolean {
        const now = Date.now();

        // Check if we've exceeded max attempts
        if (clientInfo.connectionAttempts >= clientInfo.retryConfig.maxAttempts) {
            return false;
        }

        // Check if we're in cooldown period
        if (clientInfo.nextRetryAt && now < clientInfo.nextRetryAt) {
            return false;
        }

        // Check for non-retryable errors
        const errorMessage = error.toLowerCase();
        const nonRetryableErrors = [
            'user_deactivated_ban',
            'auth_key_unregistered',
            'session_revoked',
            'phone_number_banned',
            'user_deactivated'
        ];

        if (nonRetryableErrors.some(errType => errorMessage.includes(errType))) {
            this.logger.info(clientInfo.client?.phoneNumber || 'unknown',
                `Non-retryable error detected: ${error}`);
            return false;
        }

        return true;
    }

    private async waitForRetry(clientInfo: ClientInfo): Promise<void> {
        if (!clientInfo.nextRetryAt) return;

        const now = Date.now();
        const waitTime = Math.max(0, clientInfo.nextRetryAt - now);

        if (waitTime > 0) {
            this.logger.info(clientInfo.client?.phoneNumber || 'unknown',
                `Waiting ${waitTime}ms before retry attempt ${clientInfo.connectionAttempts + 1}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    private async validateConnection(mobile: string, client: TelegramManager): Promise<boolean> {
        try {
            if (!client.connected()) {
                return false;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.VALIDATION_TIMEOUT);

            try {
                await Promise.race([
                    client.client.getMe(),
                    this.createTimeoutPromise(this.VALIDATION_TIMEOUT, controller.signal)
                ]);
                return true;
            } finally {
                clearTimeout(timeoutId);
                controller.abort();
            }
        } catch (error) {
            this.logger.error(mobile, 'Connection validation failed', error);
            return false;
        }
    }

    public async getClient(mobile: string, options: GetClientOptions = {}): Promise<TelegramManager> {
        if (!mobile) {
            throw new BadRequestException('Mobile number is required');
        }

        if (this.isShuttingDown) {
            throw new InternalServerErrorException('ConnectionManager is shutting down');
        }

        if (this.clients.size >= this.MAX_CONCURRENT_CONNECTIONS) {
            throw new InternalServerErrorException('Maximum connection limit reached');
        }

        const {
            autoDisconnect = true,
            handler = true,
            timeout = this.CONNECTION_TIMEOUT,
            retryConfig = {},
            forceReconnect = false
        } = options;

        const mergedRetryConfig: RetryConfig = {
            ...this.DEFAULT_RETRY_CONFIG,
            ...retryConfig
        };

        let clientInfo = this.clients.get(mobile);
        if (clientInfo?.client) {
            const isValid = await this.validateConnection(mobile, clientInfo.client);
            const isHealthy = clientInfo.state === 'connected' &&
                clientInfo.consecutiveFailures === 0 &&
                (Date.now() - clientInfo.lastSuccessfulConnection) < this.CONNECTION_TIMEOUT;
            if (!forceReconnect && isValid && isHealthy) {
                this.updateLastUsed(mobile);
                this.logger.info(mobile, 'Reusing validated healthy client');
                return clientInfo.client;
            }
            this.logger.info(mobile,
                `Cleaning up client - Valid: ${isValid}, Healthy: ${isHealthy}, ForceReconnect: ${forceReconnect}`);
            await this.unregisterClient(mobile);
            clientInfo = undefined;
        }
        if (clientInfo) {
            this.logger.info(mobile, 'Client info found but not valid, cleaning up');
            await this.unregisterClient(mobile);
            await sleep(1000);
        }
        this.logger.info(mobile, 'Creating fresh client connection');
        return this.createNewClient(mobile, mergedRetryConfig, { autoDisconnect, handler, timeout });
    }


    private async retryConnection(
        mobile: string,
        clientInfo: ClientInfo,
        timeout: number
    ): Promise<TelegramManager> {
        try {
            clientInfo.state = 'connecting';
            clientInfo.connectionAttempts++;
            this.clients.set(mobile, clientInfo);

            this.logger.info(mobile,
                `Retry attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);

            await Promise.race([
                clientInfo.client.connect(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Reconnection timeout')), timeout)
                )
            ]);

            if (await this.validateConnection(mobile, clientInfo.client)) {
                clientInfo.state = 'connected';
                clientInfo.consecutiveFailures = 0;
                clientInfo.lastSuccessfulConnection = Date.now();
                delete clientInfo.nextRetryAt;
                delete clientInfo.lastError;
                this.clients.set(mobile, clientInfo);

                this.logger.info(mobile, 'Retry connection successful');
                return clientInfo.client;
            }

            throw new Error('Connection validation failed after retry');
        } catch (error) {
            return this.handleConnectionError(mobile, clientInfo, error as Error);
        }
    }

    private async handleConnectionError(
        mobile: string,
        clientInfo: ClientInfo,
        error: Error
    ): Promise<never> {
        clientInfo.lastError = error.message;
        clientInfo.consecutiveFailures++;
        clientInfo.state = 'error';

        if (this.shouldRetry(clientInfo, error.message)) {
            const delay = this.calculateRetryDelay(clientInfo.connectionAttempts, clientInfo.retryConfig);
            clientInfo.nextRetryAt = Date.now() + delay;
            this.clients.set(mobile, clientInfo);

            this.logger.info(mobile,
                `Connection failed, will retry in ${delay}ms. Attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
        } else {
            this.logger.info(mobile, 'Connection failed with non-retryable error or max attempts reached');
            await this.unregisterClient(mobile);
        }

        const errorDetails = parseError(error, mobile, false);
        throw new BadRequestException(errorDetails.message);
    }

    private async createNewClient(
        mobile: string,
        retryConfig: RetryConfig,
        options: { autoDisconnect: boolean; handler: boolean; timeout: number }
    ): Promise<TelegramManager> {
        if (!this.usersService) {
            throw new InternalServerErrorException('UsersService not initialized');
        }

        const users = await this.usersService.search({ mobile });
        const user = users[0] as User;
        if (!user) {
            throw new BadRequestException('User not found');
        }

        this.logger.info(mobile, 'Creating new client', {
            autoDisconnect: options.autoDisconnect,
            handler: options.handler,
            retryConfig
        });

        const telegramManager = new TelegramManager(user.session, user.mobile);
        // Initialize client info for tracking
        const clientInfo: ClientInfo = {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            connectionAttempts: 1,
            state: 'connecting',
            retryConfig,
            consecutiveFailures: 0,
            cleanupAttempts: 0
        };
        this.clients.set(mobile, clientInfo);

        try {
            const timeoutMs = 15000; // 15 seconds timeout
            const client = await Promise.race([
                telegramManager.createClient(options.handler),
                new Promise<null>((_, reject) =>
                    setTimeout(() => reject(new Error(`Client creation timed out after ${timeoutMs}ms for ${mobile}`)), timeoutMs)
                )
            ]);

            if (client) {
                clientInfo.state = 'connected';
                clientInfo.consecutiveFailures = 0;
                clientInfo.lastSuccessfulConnection = Date.now();
                delete clientInfo.lastError;
                delete clientInfo.nextRetryAt;
                this.clients.set(mobile, clientInfo);

                this.logger.info(mobile, 'New client created successfully');
                return telegramManager;
            } else {
                throw new Error('Client creation returned null');
            }
        } catch (error) {
            this.logger.error(mobile, 'New client creation failed', error);

            const errorDetails = parseError(error, mobile, false);

            // Send notification for failures
            try {
                await BotConfig.getInstance().sendMessage(
                    ChannelCategory.ACCOUNT_LOGIN_FAILURES,
                    `${process.env.clientId}::${mobile}\n\nAttempt: ${clientInfo.connectionAttempts}\nError: ${errorDetails.message}`
                );
            } catch (notificationError) {
                this.logger.error(mobile, 'Failed to send error notification', notificationError);
            }

            // Handle permanent failures
            if (contains(errorDetails.message.toLowerCase(),
                ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'])) {
                this.logger.info(mobile, 'Marking user as expired due to permanent error');
                try {
                    await this.usersService.updateByFilter(
                        { $or: [{ tgId: user.tgId }, { mobile: mobile }] },
                        { expired: true }
                    );
                } catch (updateError) {
                    this.logger.error(mobile, 'Failed to mark user as expired', updateError);
                }
            }

            return this.handleConnectionError(mobile, clientInfo, error as Error);
        }

    }

    // Enhanced cleanup with proper resource management
    private async cleanupInactiveConnections(maxIdleTime: number = 180000): Promise<void> {
        if (this.isShuttingDown) return;
        // this.logger.info('ConnectionManager', 'Perfroming Regular Cleanup');
        const now = Date.now();
        const cleanupResults = new Map<string, boolean>();
        const cleanupPromises: Array<Promise<void>> = [];

        for (const [mobile, connection] of this.clients.entries()) {
            const shouldCleanup =
                ((connection.autoDisconnect && connection.lastUsed <= now - 100000) || connection.lastUsed <= now - this.COOLDOWN_PERIOD) &&
                (
                    now - connection.lastUsed > maxIdleTime ||
                    connection.state === 'error' ||
                    connection.consecutiveFailures >= connection.retryConfig.maxAttempts ||
                    (connection.state === 'connecting' && now - connection.lastUsed > this.CONNECTION_TIMEOUT * 2) ||
                    (connection.cleanupAttempts && connection.cleanupAttempts >= this.MAX_CLEANUP_ATTEMPTS)
                );

            if (shouldCleanup) {
                this.logger.info(mobile,
                    `Cleaning up connection - state: ${connection.state}, failures: ${connection.consecutiveFailures}, cleanup attempts: ${connection.cleanupAttempts || 0}`);

                const cleanupPromise = this.unregisterClient(mobile)
                    .then(() => {
                        cleanupResults.set(mobile, true);
                    })
                    .catch((error) => {
                        this.logger.error(mobile, 'Cleanup failed', error);
                        cleanupResults.set(mobile, false);

                        // Increment cleanup attempts
                        const clientInfo = this.clients.get(mobile);
                        if (clientInfo) {
                            clientInfo.cleanupAttempts = (clientInfo.cleanupAttempts || 0) + 1;
                            this.clients.set(mobile, clientInfo);
                        }
                    });

                cleanupPromises.push(cleanupPromise);
            }
        }

        if (cleanupPromises.length > 0) {
            try {
                await Promise.race([
                    Promise.allSettled(cleanupPromises),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Cleanup timeout')), 30000)
                    )
                ]);
            } catch (error) {
                this.logger.error('ConnectionManager', 'Cleanup operation timed out', error);
            }

            // Log cleanup summary
            const failed = Array.from(cleanupResults.entries())
                .filter(([_, success]) => !success)
                .map(([mobile]) => mobile);

            if (failed.length > 0) {
                this.logger.info('ConnectionManager',
                    `Cleanup completed. Failed cleanups: ${failed.join(', ')}`);
            } else {
                this.logger.info('ConnectionManager',
                    `Cleanup completed successfully for ${cleanupResults.size} clients`);
            }
        }
    }

    private updateLastUsed(mobile: string): void {
        const connection = this.clients.get(mobile);
        if (connection) {
            connection.lastUsed = Date.now();
            this.clients.set(mobile, connection);
        }
    }

    public hasClient(number: string): boolean {
        const client = this.clients.get(number);
        return client !== undefined && client.state === 'connected';
    }

    public async disconnectAll(): Promise<void> {
        this.logger.info('ConnectionManager', 'Disconnecting all clients');
        const disconnectionPromises: Promise<void>[] = [];

        for (const [mobile, connection] of this.clients.entries()) {
            if (connection.state !== 'disconnected') {
                connection.state = 'disconnecting';
                this.clients.set(mobile, connection);
                disconnectionPromises.push(this.unregisterClient(mobile));
            }
        }

        try {
            await Promise.race([
                Promise.allSettled(disconnectionPromises),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Disconnect all timeout')), 60000)
                )
            ]);
        } catch (error) {
            this.logger.error('ConnectionManager', 'Disconnect all timed out', error);
        }

        this.clients.clear();
        this.logger.info('ConnectionManager', 'All clients disconnected');
    }


    // Unified unregister method with timeout protection and proper cleanup sequence
    public async unregisterClient(mobile: string, timeoutMs: number = this.CLEANUP_TIMEOUT): Promise<void> {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo) return;
        // this.logger.info(mobile, 'Unregistering client', {
        //     state: clientInfo.state,
        //     lastUsed: clientInfo.lastUsed,
        //     autoDisconnect: clientInfo.autoDisconnect
        // });
        try {
            clientInfo.state = 'disconnecting';
            await clientInfo.client.destroy();
            this.clients.delete(mobile);
        } catch (error) {
            this.logger.error(mobile, 'Unregister failed', error);
        }
        try {
            await this.forceCleanupClient(mobile, clientInfo);
        } catch (forceError) {
            this.logger.error(mobile, 'Force cleanup also failed', forceError);
        }
    }
    private async forceCleanupClient(mobile: string, clientInfo: ClientInfo): Promise<void> {
        if (clientInfo.client?.client) {
            this.logger.info(mobile, 'Performing FORCE cleanup');
            try {
                await clientInfo.client.client.destroy();
            } catch (destroyError) {
                this.logger.error(mobile, 'Force destroy failed', destroyError);
            }
        }
        try {
            if (clientInfo.client) {
                if (clientInfo.client.client) {
                    clientInfo.client.client = null;
                }
                clientInfo.client = null as any;
            }
        } catch (refError) {
            this.logger.error(mobile, 'Reference cleanup in force mode failed', refError);
        }
        this.clients.delete(mobile);
        // this.logger.info(mobile, 'Client removed from map');
    }

    public getActiveConnectionCount(): number {
        return Array.from(this.clients.values())
            .filter(client => client.state === 'connected')
            .length;
    }

    public getConnectionLeakReport(): ConnectionLeakReport {
        const activeConnections: string[] = [];
        const zombieConnections: string[] = [];
        const staleConnections: string[] = [];
        const now = Date.now();

        for (const [mobile, clientInfo] of this.clients.entries()) {
            if (clientInfo.client && clientInfo.client.client) {
                const isClientConnected = clientInfo.client.connected();
                const stateConnected = clientInfo.state === 'connected';
                const isStale = now - clientInfo.lastUsed > this.COOLDOWN_PERIOD * 2;

                if (isClientConnected && stateConnected) {
                    activeConnections.push(mobile);
                } else if (!isClientConnected && stateConnected) {
                    // State says connected but client isn't - zombie connection
                    zombieConnections.push(mobile);
                } else if (isStale && clientInfo.state !== 'disconnected') {
                    // Very old connections that should have been cleaned up
                    staleConnections.push(mobile);
                }
            } else {
                this.clients.delete(mobile)
            }
        }

        return {
            mapSize: this.clients.size,
            activeConnections,
            zombieConnections,
            staleConnections
        };
    }

    private async performHealthCheck(): Promise<void> {
        if (this.isShuttingDown) return;

        const leakReport = this.getConnectionLeakReport();

        if (leakReport.zombieConnections.length > 0) {
            this.logger.info('ConnectionManager',
                `Health check: Detected ${leakReport.zombieConnections.length} zombie connections`);

            // Clean up zombie connections
            for (const mobile of leakReport.zombieConnections) {
                try {
                    await this.unregisterClient(mobile);
                } catch (error) {
                    this.logger.error(mobile, 'Health check cleanup failed', error);
                }
            }
        }

        if (leakReport.staleConnections.length > 0) {
            this.logger.info('ConnectionManager',
                `Health check: Detected ${leakReport.staleConnections.length} stale connections`);

            // Clean up stale connections
            for (const mobile of leakReport.staleConnections) {
                try {
                    await this.unregisterClient(mobile);
                } catch (error) {
                    this.logger.error(mobile, 'Stale connection cleanup failed', error);
                }
            }
        }

        // Log overall health status
        // this.logger.info('ConnectionManager',
        // `Health check completed - Active: ${leakReport.activeConnections.length}, Total: ${leakReport.mapSize}`, leakReport);
    }

    public startCleanupInterval(intervalMs: number = 120000) {
        if (this.cleanupInterval) {
            return this.cleanupInterval
        }
        this.stopCleanupInterval();
        this.cleanupInterval = setInterval(() => {
            if (!this.isShuttingDown) {
                this.cleanupInactiveConnections().catch(err => {
                    this.logger.error('ConnectionManager', 'Error in cleanup interval', err);
                });
                this.performHealthCheck().catch(err => {
                    this.logger.error('ConnectionManager', 'Error in initial health check', err);
                });
            }
        }, intervalMs);

        this.logger.info('ConnectionManager', `Cleanup interval started with ${intervalMs}ms interval`);

        // Run initial cleanup
        this.cleanupInactiveConnections().catch(err => {
            this.logger.error('ConnectionManager', 'Error in initial cleanup', err);
        });
        return this.cleanupInterval;
    }

    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.logger.info('ConnectionManager', 'Cleanup interval stopped');
            this.cleanupInterval = null;
        }
    }

    public getClientState(mobile: string): ConnectionStatusDto | undefined {
        const client = this.clients.get(mobile);
        if (client) {
            return {
                autoDisconnect: client.autoDisconnect,
                connectionAttempts: client.connectionAttempts,
                lastUsed: client.lastUsed,
                state: client.state,
                lastError: client.lastError
            }
        }
    }

    public getConnectionStats(): {
        total: number;
        connected: number;
        connecting: number;
        disconnecting: number;
        disconnected: number;
        error: number;
        retrying: number;
    } {
        const stats = {
            total: this.clients.size,
            connected: 0,
            connecting: 0,
            disconnecting: 0,
            disconnected: 0,
            error: 0,
            retrying: 0
        };

        const now = Date.now();
        for (const client of this.clients.values()) {
            if (client.state === 'error' && client.nextRetryAt && now < client.nextRetryAt) {
                stats.retrying++;
            } else {
                stats[client.state as keyof Omit<typeof stats, 'total' | 'retrying'>]++;
            }
        }

        return stats;
    }

    // Enhanced utility methods
    public getClientInfo(mobile: string): ClientInfo | undefined {
        return this.clients.get(mobile);
    }

    public async forceReconnect(mobile: string): Promise<TelegramManager> {
        this.logger.info(mobile, 'Force reconnection requested');
        await this.unregisterClient(mobile);
        return this.getClient(mobile, { forceReconnect: true });
    }

    public setRetryConfig(mobile: string, config: Partial<RetryConfig>): boolean {
        const clientInfo = this.clients.get(mobile);
        if (clientInfo) {
            clientInfo.retryConfig = { ...clientInfo.retryConfig, ...config };
            this.clients.set(mobile, clientInfo);
            return true;
        }
        return false;
    }
}

export const connectionManager = ConnectionManager.getInstance();