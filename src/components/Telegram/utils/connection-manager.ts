import TelegramManager from '../TelegramManager';
import { parseError } from '../../../utils/parseError';
import { TelegramLogger } from './telegram-logger';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from '../../../components/users/users.service';
import { TelegramClient } from 'telegram';
import { contains } from '../../../utils';
import { botConfig, ChannelCategory } from '../../../utils/TelegramBots.config';

interface ClientInfo {
    client: TelegramManager;
    lastUsed: number;
    autoDisconnect: boolean;
}

interface GetClientOptions {
    autoDisconnect?: boolean;
    handler?: boolean;
}

class ConnectionManager {
    private static instance: ConnectionManager;
    private clients: Map<string, ClientInfo>;
    private readonly logger: TelegramLogger;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private usersService: UsersService;

    private constructor() {
        this.clients = new Map();
        this.logger = TelegramLogger.getInstance();
    }

    public setUsersService(usersService: UsersService) {
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
        for (const [mobile, connection] of this.clients.entries()) {
            // Skip clients that are configured to be excluded from cleanup
            if (!connection.autoDisconnect) {
                continue;
            }
            if (now - connection.lastUsed > maxIdleTime) {
                this.logger.logOperation(mobile, 'Releasing inactive connection');
                await this.unregisterClient(mobile);
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

    public async getClient(mobile: string, options: GetClientOptions = {}): Promise<TelegramManager | undefined> {
        if (!mobile) {
            this.logger.logDebug('system', 'getClient called with empty mobile number');
            return undefined;
        }

        const { autoDisconnect = true, handler = true, } = options;

        this.logger.logOperation(mobile, 'Getting/Creating client', { autoDisconnect, handler });
        const clientInfo = this.clients.get(mobile);
        if (clientInfo?.client) {
            this.updateLastUsed(mobile);
            if (clientInfo.client.connected()) {
                this.logger.logOperation(mobile, 'Reusing existing connected client');
                return clientInfo.client;
            } else {
                try {
                    this.logger.logOperation(mobile, 'Reconnecting existing client');
                    await clientInfo.client.connect();
                    return clientInfo.client;
                } catch (error) {
                    this.logger.logError(mobile, 'Failed to reconnect client', error);
                    await this.unregisterClient(mobile); // Clean up failed connection
                }
            }
        }

        if (!this.usersService) {
            throw new Error('UsersService not initialized');
        }

        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new BadRequestException('user not found');
        }

        const telegramManager = new TelegramManager(user.session, user.mobile);
        let client: TelegramClient;

        try {
            client = await telegramManager.createClient(handler);
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
                throw new BadRequestException('Client Expired');
            }
        } catch (error) {
            this.logger.logError(mobile, 'Client creation failed', error);
            this.logger.logDebug(mobile, 'Parsing error details...');
            await this.unregisterClient(mobile);
            const errorDetails = parseError(error, mobile, false);
            await botConfig.sendMessage(ChannelCategory.LOGIN_FAILURES, `Login failure: ${errorDetails.message}`);
            if (contains(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "revoked", "user_deactivated_ban"])) {
                this.logger.logOperation(mobile, 'Marking user as expired');
                await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
            }
            throw new BadRequestException(errorDetails.message);
        }
    }

    public hasClient(number: string): boolean {
        return this.clients.has(number);
    }

    public async disconnectAll(): Promise<void> {
        this.logger.logOperation('system', 'Disconnecting all clients');
        const clientMobiles = Array.from(this.clients.keys());
        await Promise.all(
            clientMobiles.map(mobile => {
                this.logger.logOperation(mobile, 'Disconnecting client');
                return this.unregisterClient(mobile);
            })
        );
        this.clients.clear();
        this.logger.logOperation('system', 'All clients disconnected');
    }

    private async registerClient(
        mobile: string,
        telegramManager: TelegramManager,
        options: { autoDisconnect: boolean } = { autoDisconnect: true }
    ): Promise<void> {
        this.clients.set(mobile, {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect
        });
        this.logger.logOperation(mobile, `Client registered successfully${!options.autoDisconnect ? ' (excluded from auto-cleanup)' : ''}`);
    }

    public async unregisterClient(
        mobile: string,
    ): Promise<void> {
        try {
            const clientInfo = this.clients.get(mobile);
            if (clientInfo) {
                await clientInfo.client?.disconnect();
                this.logger.logOperation(mobile, 'Client unregistered successfully');
            } else {
                this.logger.logError(mobile, 'Client not found for unregistration', new Error('Client not found'));
            }
        } catch (error) {
            this.logger.logError(mobile, 'Error in unregisterClient', error);
        } finally {
            this.clients.delete(mobile);
        }
    }

    public getActiveConnectionCount(): number {
        return this.clients.size;
    }

    public startCleanupInterval(intervalMs: number = 300000): NodeJS.Timeout {
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveConnections().catch(err => {
                this.logger.logError('system', 'Error in cleanup interval', err);
            });
        }, intervalMs);
        return this.cleanupInterval;
    }

    public stopCleanupInterval(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

export const connectionManager = ConnectionManager.getInstance();
