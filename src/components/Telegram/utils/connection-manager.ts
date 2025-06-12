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
    lastError?: Error;
    state: 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error';
    retryConfig: RetryConfig;
    nextRetryAt?: number;
    consecutiveFailures: number;
    lastSuccessfulConnection?: number;
}

interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
    timeout?: number;
    retryConfig?: Partial<RetryConfig>;
    forceReconnect?: boolean;
}

class ConnectionManager {
    private static instance: ConnectionManager | null = null;
    private clients: Map<string, ClientInfo>;
    private readonly logger: TelegramLogger;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private usersService: UsersService | null = null;
    private boundShutdownHandler: () => Promise<void>;

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

    private constructor() {
        this.clients = new Map();
        this.logger = TelegramLogger.getInstance();
        this.boundShutdownHandler = this.handleShutdown.bind(this);
        process.on('SIGTERM', this.boundShutdownHandler);
        process.on('SIGINT', this.boundShutdownHandler);
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

    public dispose(): void {
        this.stopCleanupInterval();
        process.off('SIGTERM', this.boundShutdownHandler);
        process.off('SIGINT', this.boundShutdownHandler);
        this.clients.clear();
    }

    private async handleShutdown(): Promise<void> {
        this.logger.logOperation('ConnectionManager', 'Graceful shutdown initiated');
        this.dispose();
        await this.disconnectAll();
        process.exit(0);
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

    private shouldRetry(clientInfo: ClientInfo, error: Error): boolean {
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
        const errorMessage = error.message.toLowerCase();
        const nonRetryableErrors = [
            'user_deactivated_ban',
            'auth_key_unregistered',
            'session_revoked',
            'phone_number_banned',
            'user_deactivated'
        ];

        if (nonRetryableErrors.some(errType => errorMessage.includes(errType))) {
            this.logger.logOperation(clientInfo.client?.phoneNumber || 'unknown',
                `Non-retryable error detected: ${error.message}`);
            return false;
        }

        return true;
    }

    private async waitForRetry(clientInfo: ClientInfo): Promise<void> {
        if (!clientInfo.nextRetryAt) return;

        const now = Date.now();
        const waitTime = Math.max(0, clientInfo.nextRetryAt - now);

        if (waitTime > 0) {
            this.logger.logOperation(clientInfo.client?.phoneNumber || 'unknown',
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
            try {
                // Enhanced validation with timeout
                await Promise.race([
                    client.client.getMe(),
                    this.createTimeoutPromise(this.VALIDATION_TIMEOUT, controller.signal)
                ]);
                return true;
            } finally {
                controller.abort(); // Cleanup the losing promise
            }
        } catch (error) {
            this.logger.logError(mobile, 'Connection validation failed', error);
            return false;
        }
    }

    private async attemptConnection(
        mobile: string,
        telegramManager: TelegramManager,
        timeout: number
    ): Promise<TelegramClient> {
        const controller = new AbortController();
        try {
            const client = await Promise.race([
                telegramManager.createClient(true),
                this.createTimeoutPromise<never>(timeout, controller.signal)
            ]);

             // Verify the client is actually usable
            const verificationController = new AbortController();
            try {
                await Promise.race([
                    client.getMe(),
                    this.createTimeoutPromise<never>(5000, verificationController.signal)
                ]);
                return client;
            } finally {
                verificationController.abort(); // Cleanup verification timeout
            }
        } finally {
            controller.abort(); // Cleanup connection timeout
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
            timeout = this.CONNECTION_TIMEOUT,
            retryConfig = {},
            forceReconnect = false
        } = options;

        const mergedRetryConfig: RetryConfig = {
            ...this.DEFAULT_RETRY_CONFIG,
            ...retryConfig
        };

        let clientInfo = this.clients.get(mobile);

        // Handle existing client
        if (clientInfo?.client && !forceReconnect) {
            this.updateLastUsed(mobile);

            // If client is connected and valid, return it
            if (clientInfo.state === 'connected' &&
                await this.validateConnection(mobile, clientInfo.client)) {
                this.logger.logOperation(mobile, 'Reusing existing connected client');
                clientInfo.consecutiveFailures = 0;
                clientInfo.lastSuccessfulConnection = Date.now();
                return clientInfo.client;
            }

            // If client is in error state but can retry
            if (clientInfo.state === 'error' && this.shouldRetry(clientInfo, clientInfo.lastError!)) {
                await this.waitForRetry(clientInfo);
                return this.retryConnection(mobile, clientInfo, timeout);
            }

            // Clean up failed client
            if (clientInfo.connectionAttempts >= clientInfo.retryConfig.maxAttempts) {
                this.logger.logOperation(mobile, 'Max retry attempts reached, cleaning up client');
                await this.unregisterClient(mobile);
                clientInfo = undefined;
            }
        }

        // Create new client if none exists or previous one failed
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

            this.logger.logOperation(mobile,
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

                this.logger.logOperation(mobile, 'Retry connection successful');
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
        clientInfo.lastError = error;
        clientInfo.consecutiveFailures++;
        clientInfo.state = 'error';

        if (this.shouldRetry(clientInfo, error)) {
            const delay = this.calculateRetryDelay(clientInfo.connectionAttempts, clientInfo.retryConfig);
            clientInfo.nextRetryAt = Date.now() + delay;
            this.clients.set(mobile, clientInfo);

            this.logger.logOperation(mobile,
                `Connection failed, will retry in ${delay}ms. Attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
        } else {
            this.logger.logOperation(mobile, 'Connection failed with non-retryable error or max attempts reached');
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

        this.logger.logOperation(mobile, 'Creating new client', {
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
            consecutiveFailures: 0
        };

        this.clients.set(mobile, clientInfo);

        try {
            const client = await this.attemptConnection(mobile, telegramManager, options.timeout);

            if (client) {
                clientInfo.state = 'connected';
                clientInfo.consecutiveFailures = 0;
                clientInfo.lastSuccessfulConnection = Date.now();
                delete clientInfo.lastError;
                delete clientInfo.nextRetryAt;
                this.clients.set(mobile, clientInfo);

                this.logger.logOperation(mobile, 'New client created successfully');
                return telegramManager;
            } else {
                throw new Error('Client creation returned null');
            }
        } catch (error) {
            this.logger.logError(mobile, 'New client creation failed', error);

            const errorDetails = parseError(error, mobile, false);

            // Send notification for failures
            try {
                await BotConfig.getInstance().sendMessage(
                    ChannelCategory.ACCOUNT_LOGIN_FAILURES,
                    `${process.env.clientId}::${mobile}\n\nAttempt: ${clientInfo.connectionAttempts}\nError: ${errorDetails.message}`
                );
            } catch (notificationError) {
                this.logger.logError(mobile, 'Failed to send error notification', notificationError);
            }

            // Handle permanent failures
            if (contains(errorDetails.message.toLowerCase(),
                ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'])) {
                this.logger.logOperation(mobile, 'Marking user as expired due to permanent error');
                try {
                    await this.usersService.updateByFilter(
                        { $or: [{ tgId: user.tgId }, { mobile: mobile }] },
                        { expired: true }
                    );
                } catch (updateError) {
                    this.logger.logError(mobile, 'Failed to mark user as expired', updateError);
                }
            }

            return this.handleConnectionError(mobile, clientInfo, error as Error);
        }
    }

    private async cleanupInactiveConnections(maxIdleTime: number = 180000): Promise<void> {
        const now = Date.now();
        const disconnectionPromises: Promise<void>[] = [];

        for (const [mobile, connection] of this.clients.entries()) {
            const shouldCleanup =
                // Respect autoDisconnect setting and cooldown
                (connection.autoDisconnect || connection.lastUsed <= now - this.COOLDOWN_PERIOD) &&
                (
                    // Idle timeout
                    now - connection.lastUsed > maxIdleTime ||
                    // Error state cleanup
                    connection.state === 'error' ||
                    // Too many consecutive failures
                    connection.consecutiveFailures >= connection.retryConfig.maxAttempts ||
                    // Stuck in connecting state
                    (connection.state === 'connecting' && now - connection.lastUsed > this.CONNECTION_TIMEOUT * 2)
                );

            if (shouldCleanup) {
                this.logger.logOperation(mobile,
                    `Cleaning up connection - state: ${connection.state}, failures: ${connection.consecutiveFailures}`);
                try {
                    // Use Promise.race to ensure cleanup doesn't hang
                    disconnectionPromises.push(
                        Promise.race([
                            this.unregisterClient(mobile),
                            new Promise<void>((resolve) => setTimeout(resolve, 10000))
                        ])
                    );
                } catch (error) {
                    this.logger.logError(mobile, 'Error during cleanup', error);
                    // Force removal if cleanup fails
                    this.clients.delete(mobile);
                }
            }
        }

        // Wait for all disconnections with a timeout
        try {
            await Promise.race([
                Promise.all(disconnectionPromises),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Cleanup timeout')), 30000)
                )
            ]);
        } catch (error) {
            this.logger.logError('ConnectionManager', 'Cleanup operation timed out', error);
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
        this.logger.logOperation('ConnectionManager', 'Disconnecting all clients');
        const disconnectionPromises: Promise<void>[] = [];

        for (const [mobile, connection] of this.clients.entries()) {
            if (connection.state !== 'disconnected') {
                connection.state = 'disconnecting';
                this.clients.set(mobile, connection);
                disconnectionPromises.push(this.unregisterClient(mobile));
            }
        }

        await Promise.all(disconnectionPromises);
        this.clients.clear();
        this.logger.logOperation('ConnectionManager', 'All clients disconnected');
    }

    public async unregisterClient(mobile: string): Promise<void> {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo) return;

        try {
            clientInfo.state = 'disconnecting';
            this.clients.set(mobile, clientInfo);

            const controller = new AbortController();
            try {
                await Promise.race([
                    clientInfo.client?.disconnect(),
                    this.createTimeoutPromise(5000, controller.signal)
                ]);
                this.logger.logOperation(mobile, 'Client disconnected successfully');
            } catch (error) {
                this.logger.logError(mobile, 'Error during client disconnect', error);
            } finally {
                controller.abort();
                if (clientInfo.client) {
                    clientInfo.client.client = null;
                    clientInfo.client = null as any;
                }
            }
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
            return this.cleanupInterval;
        }

        this.stopCleanupInterval();
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveConnections().catch(err => {
                this.logger.logError('ConnectionManager', 'Error in cleanup interval', err);
            });
        }, intervalMs);

        this.logger.logOperation('ConnectionManager', `Cleanup interval started with ${intervalMs}ms interval`);

        // Run initial cleanup
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
        retrying: number;
    } {
        const stats = {
            total: this.clients.size,
            connected: 0,
            connecting: 0,
            disconnecting: 0,
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

    // New utility methods for better management
    public getClientInfo(mobile: string): ClientInfo | undefined {
        return this.clients.get(mobile);
    }

    public async forceReconnect(mobile: string): Promise<TelegramManager> {
        this.logger.logOperation(mobile, 'Force reconnection requested');
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