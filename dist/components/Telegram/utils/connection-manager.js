"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionManager = void 0;
const TelegramManager_1 = __importDefault(require("../TelegramManager"));
const parseError_1 = require("../../../utils/parseError");
const telegram_logger_1 = require("./telegram-logger");
const common_1 = require("@nestjs/common");
const utils_1 = require("../../../utils");
const TelegramBots_config_1 = require("../../../utils/TelegramBots.config");
class ConnectionManager {
    constructor() {
        this.cleanupInterval = null;
        this.usersService = null;
        this.MAX_RETRY_ATTEMPTS = 3;
        this.CONNECTION_TIMEOUT = 30000;
        this.MAX_CONCURRENT_CONNECTIONS = 100;
        this.COOLDOWN_PERIOD = 600000;
        this.clients = new Map();
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        process.on('SIGTERM', () => this.handleShutdown());
        process.on('SIGINT', () => this.handleShutdown());
        this.startCleanupInterval();
    }
    async handleShutdown() {
        this.logger.logOperation('ConnectionManager', 'Graceful shutdown initiated');
        this.stopCleanupInterval();
        await this.disconnectAll();
        process.exit(0);
    }
    setUsersService(usersService) {
        this.usersService = usersService;
    }
    static getInstance() {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }
    async cleanupInactiveConnections(maxIdleTime = 180000) {
        const now = Date.now();
        const disconnectionPromises = [];
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
    updateLastUsed(mobile) {
        const connection = this.clients.get(mobile);
        if (connection) {
            connection.lastUsed = Date.now();
            this.clients.set(mobile, connection);
        }
    }
    async validateConnection(mobile, client) {
        try {
            const isConnected = client.connected();
            if (!isConnected) {
                throw new Error('Connection validation failed');
            }
            await Promise.race([
                client.client.getMe(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection validation timeout')), 5000))
            ]);
            return true;
        }
        catch (error) {
            this.logger.logError(mobile, 'Connection validation failed', error);
            return false;
        }
    }
    async getClient(mobile, options = {}) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        if (this.clients.size >= this.MAX_CONCURRENT_CONNECTIONS) {
            throw new common_1.InternalServerErrorException('Maximum connection limit reached');
        }
        const { autoDisconnect = true, handler = true, timeout = this.CONNECTION_TIMEOUT } = options;
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
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeout))
                    ]);
                    if (await this.validateConnection(mobile, clientInfo.client)) {
                        clientInfo.state = 'connected';
                        clientInfo.connectionAttempts = 0;
                        this.clients.set(mobile, clientInfo);
                        return clientInfo.client;
                    }
                }
                catch (error) {
                    clientInfo.connectionAttempts++;
                    clientInfo.lastError = error;
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
        const user = users[0];
        if (!user) {
            throw new common_1.BadRequestException('User not found');
        }
        this.logger.logOperation(mobile, 'Creating New client', { autoDisconnect, handler });
        const telegramManager = new TelegramManager_1.default(user.session, user.mobile);
        let client;
        try {
            client = await Promise.race([
                telegramManager.createClient(handler),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Client creation timeout')), timeout))
            ]);
            await client.getMe();
            if (client) {
                await this.registerClient(mobile, telegramManager, { autoDisconnect });
                this.logger.logOperation(mobile, 'Client created successfully');
                return telegramManager;
            }
            else {
                throw new common_1.BadRequestException('Client creation failed');
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'Client creation failed', error);
            this.logger.logDebug(mobile, 'Parsing error details...');
            await this.unregisterClient(mobile);
            const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
            await TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.ACCOUNT_LOGIN_FAILURES, `${process.env.clientId}::${mobile}\n\n${errorDetails.message}`);
            if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'])) {
                this.logger.logOperation(mobile, 'Marking user as expired');
                await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
            }
            throw new common_1.BadRequestException(errorDetails.message);
        }
    }
    hasClient(number) {
        const client = this.clients.get(number);
        return client !== undefined && client.state === 'connected';
    }
    async disconnectAll() {
        this.logger.logOperation('ConnectionManager', 'Disconnecting all clients');
        const disconnectionPromises = [];
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
    async registerClient(mobile, telegramManager, options = { autoDisconnect: true }) {
        this.clients.set(mobile, {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            connectionAttempts: 0,
            state: 'connected'
        });
        this.logger.logOperation(mobile, `Client registered successfully${!options.autoDisconnect ? ' (excluded from auto-cleanup)' : ''}`);
    }
    async unregisterClient(mobile) {
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
        }
        catch (error) {
            this.logger.logError(mobile, 'Error in unregisterClient', error);
        }
        finally {
            this.clients.delete(mobile);
        }
    }
    getActiveConnectionCount() {
        return Array.from(this.clients.values())
            .filter(client => client.state === 'connected')
            .length;
    }
    startCleanupInterval(intervalMs = 120000) {
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
        this.cleanupInactiveConnections().catch(err => {
            this.logger.logError('ConnectionManager', 'Error in initial cleanup', err);
        });
        return this.cleanupInterval;
    }
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.logger.logOperation('ConnectionManager', 'Cleanup interval stopped');
            this.cleanupInterval = null;
        }
    }
    getClientState(mobile) {
        return this.clients.get(mobile)?.state;
    }
    getConnectionStats() {
        const stats = {
            total: this.clients.size,
            connected: 0,
            connecting: 0,
            disconnecting: 0,
            error: 0
        };
        for (const client of this.clients.values()) {
            stats[client.state]++;
        }
        return stats;
    }
}
exports.connectionManager = ConnectionManager.getInstance();
//# sourceMappingURL=connection-manager.js.map