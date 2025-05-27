"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionManagerError = exports.ConnectionManager = exports.connectionManager = void 0;
const TelegramManager_1 = __importDefault(require("../TelegramManager"));
const parseError_1 = require("../../../utils/parseError");
const telegram_logger_1 = require("./telegram-logger");
const common_1 = require("@nestjs/common");
const utils_1 = require("../../../utils");
const TelegramBots_config_1 = require("../../../utils/TelegramBots.config");
class ConnectionManagerError extends Error {
    constructor(message, mobile, operation, originalError) {
        super(message);
        this.mobile = mobile;
        this.operation = operation;
        this.originalError = originalError;
        this.name = 'ConnectionManagerError';
    }
}
exports.ConnectionManagerError = ConnectionManagerError;
class ConnectionManager {
    constructor() {
        this.clients = new Map();
        this.cleanupInterval = null;
        this.usersService = null;
        this.maxRetries = 3;
        this.connectionTimeout = 30000;
        this.stats = {
            activeConnections: 0,
            totalConnections: 0,
            failedConnections: 0,
            cleanupCount: 0
        };
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.logger.logOperation('system', 'ConnectionManager initialized');
    }
    setUsersService(usersService) {
        if (!usersService) {
            throw new Error('UsersService cannot be null or undefined');
        }
        this.usersService = usersService;
        this.logger.logOperation('system', 'UsersService registered successfully');
    }
    static getInstance() {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }
    async cleanupInactiveConnections(maxIdleTime = 180000) {
        const startTime = Date.now();
        let cleanedCount = 0;
        try {
            this.logger.logOperation('system', 'Starting cleanup of inactive connections', { maxIdleTime });
            const now = Date.now();
            const clientsToCleanup = [];
            for (const [mobile, connection] of this.clients.entries()) {
                if (!connection.autoDisconnect) {
                    continue;
                }
                if (now - connection.lastUsed > maxIdleTime) {
                    clientsToCleanup.push(mobile);
                }
            }
            for (const mobile of clientsToCleanup) {
                try {
                    this.logger.logOperation(mobile, 'Cleaning up inactive connection');
                    await this.unregisterClient(mobile);
                    cleanedCount++;
                }
                catch (error) {
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
        }
        catch (error) {
            this.logger.logError('system', 'Error during cleanup operation', error);
            throw new ConnectionManagerError('Cleanup operation failed', 'system', 'cleanupInactiveConnections', error);
        }
    }
    updateLastUsed(mobile) {
        try {
            const connection = this.clients.get(mobile);
            if (connection) {
                connection.lastUsed = Date.now();
                this.clients.set(mobile, connection);
                return true;
            }
            return false;
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to update last used timestamp', error);
            return false;
        }
    }
    async validateMobile(mobile) {
        if (!mobile || typeof mobile !== 'string' || mobile.trim().length === 0) {
            throw new common_1.BadRequestException('Mobile number is required and must be a non-empty string');
        }
    }
    async getUserByMobile(mobile) {
        if (!this.usersService) {
            throw new common_1.InternalServerErrorException('UsersService not initialized');
        }
        try {
            const users = await this.usersService.search({ mobile });
            if (!users || users.length === 0) {
                throw new common_1.BadRequestException(`User not found for mobile: ${mobile}`);
            }
            const user = users[0];
            if (!user.session) {
                throw new common_1.BadRequestException(`User session not found for mobile: ${mobile}`);
            }
            return user;
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            this.logger.logError(mobile, 'Failed to fetch user from database', error);
            throw new common_1.InternalServerErrorException('Failed to retrieve user information');
        }
    }
    async getClient(mobile, options = {}) {
        const startTime = Date.now();
        const { autoDisconnect = true, handler = true, maxRetries = this.maxRetries } = options;
        try {
            await this.validateMobile(mobile);
            this.logger.logOperation(mobile, 'Getting/Creating client', {
                autoDisconnect,
                handler,
                maxRetries
            });
            const existingClient = await this.tryGetExistingClient(mobile);
            if (existingClient) {
                const duration = Date.now() - startTime;
                this.logger.logOperation(mobile, 'Client retrieved successfully', {
                    source: 'existing',
                    duration: `${duration}ms`
                });
                return existingClient;
            }
            const newClient = await this.createNewClientWithRetries(mobile, { autoDisconnect, handler }, maxRetries);
            const duration = Date.now() - startTime;
            this.logger.logOperation(mobile, 'Client created successfully', {
                source: 'new',
                duration: `${duration}ms`
            });
            return newClient;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.stats.failedConnections++;
            this.logger.logError(mobile, 'Failed to get client', error);
            if (error instanceof common_1.BadRequestException || error instanceof common_1.InternalServerErrorException) {
                throw error;
            }
            throw new common_1.InternalServerErrorException('Failed to establish Telegram connection');
        }
    }
    async tryGetExistingClient(mobile) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo?.client) {
            return null;
        }
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
        try {
            clientInfo.isConnecting = true;
            this.logger.logOperation(mobile, 'Reconnecting existing client');
            await Promise.race([
                clientInfo.client.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout))
            ]);
            clientInfo.isConnecting = false;
            return clientInfo.client;
        }
        catch (error) {
            clientInfo.isConnecting = false;
            this.logger.logError(mobile, 'Failed to reconnect existing client', error);
            await this.unregisterClient(mobile);
            return null;
        }
    }
    async waitForConnection(mobile, maxWaitTime = 60000) {
        const startTime = Date.now();
        const checkInterval = 1000;
        while (Date.now() - startTime < maxWaitTime) {
            const clientInfo = this.clients.get(mobile);
            if (!clientInfo?.isConnecting) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        throw new Error('Timeout waiting for connection to complete');
    }
    async createNewClientWithRetries(mobile, options, maxRetries) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.logger.logOperation(mobile, `Creating client (attempt ${attempt}/${maxRetries})`);
                const client = await this.createNewClient(mobile, options);
                this.stats.totalConnections++;
                return client;
            }
            catch (error) {
                lastError = error;
                this.logger.logError(mobile, `Client creation attempt ${attempt} failed`, error);
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    this.logger.logOperation(mobile, `Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                else {
                    await this.handleFinalError(mobile, error);
                }
            }
        }
        throw lastError || new Error('All retry attempts failed');
    }
    async createNewClient(mobile, options) {
        const tempClientInfo = {
            client: null,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            connectionAttempts: 0,
            isConnecting: true
        };
        this.clients.set(mobile, tempClientInfo);
        try {
            const user = await this.getUserByMobile(mobile);
            const telegramManager = new TelegramManager_1.default(user.session, user.mobile);
            const client = await Promise.race([
                telegramManager.createClient(options.handler),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Client creation timeout')), this.connectionTimeout))
            ]);
            await Promise.race([
                client.getMe(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Client verification timeout')), this.connectionTimeout))
            ]);
            await this.registerClient(mobile, telegramManager, { autoDisconnect: options.autoDisconnect });
            return telegramManager;
        }
        catch (error) {
            this.clients.delete(mobile);
            throw error;
        }
    }
    async handleFinalError(mobile, error) {
        try {
            this.logger.logDebug(mobile, 'Parsing final error details...');
            const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
            try {
                await TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.ACCOUNT_LOGIN_FAILURES, `${process.env.clientId}::${mobile}\n\n${errorDetails.message}`);
            }
            catch (notificationError) {
                this.logger.logError(mobile, 'Failed to send error notification', notificationError);
            }
            const lowerCaseMessage = errorDetails.message.toLowerCase();
            const expiredKeywords = ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'];
            if ((0, utils_1.contains)(lowerCaseMessage, expiredKeywords)) {
                await this.markUserAsExpired(mobile);
            }
            throw new common_1.BadRequestException(errorDetails.message);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            this.logger.logError(mobile, 'Error handling final error', error);
            throw new common_1.InternalServerErrorException('Client creation failed with unhandled error');
        }
    }
    async markUserAsExpired(mobile) {
        try {
            if (!this.usersService) {
                throw new Error('UsersService not available');
            }
            this.logger.logOperation(mobile, 'Marking user as expired');
            const users = await this.usersService.search({ mobile });
            const user = users?.[0];
            const filter = user?.tgId
                ? { $or: [{ tgId: user.tgId }, { mobile: mobile }] }
                : { mobile: mobile };
            await this.usersService.updateByFilter(filter, { expired: true });
            this.logger.logOperation(mobile, 'User marked as expired successfully');
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to mark user as expired', error);
        }
    }
    hasClient(mobile) {
        try {
            if (!mobile)
                return false;
            return this.clients.has(mobile);
        }
        catch (error) {
            this.logger.logError(mobile || 'unknown', 'Error checking client existence', error);
            return false;
        }
    }
    async disconnectAll() {
        const startTime = Date.now();
        let disconnectedCount = 0;
        try {
            this.logger.logOperation('system', 'Starting disconnection of all clients');
            const clientMobiles = Array.from(this.clients.keys());
            const results = await Promise.allSettled(clientMobiles.map(async (mobile) => {
                this.logger.logOperation(mobile, 'Disconnecting client');
                await this.unregisterClient(mobile);
                return mobile;
            }));
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    disconnectedCount++;
                }
                else {
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
        }
        catch (error) {
            this.logger.logError('system', 'Error during disconnectAll operation', error);
            throw new ConnectionManagerError('Failed to disconnect all clients', 'system', 'disconnectAll', error);
        }
    }
    async registerClient(mobile, telegramManager, options = { autoDisconnect: true }) {
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
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to register client', error);
            throw new ConnectionManagerError('Client registration failed', mobile, 'registerClient', error);
        }
    }
    async unregisterClient(mobile) {
        try {
            const clientInfo = this.clients.get(mobile);
            if (clientInfo) {
                clientInfo.isConnecting = false;
                if (clientInfo.client) {
                    await Promise.race([
                        clientInfo.client.disconnect(),
                        new Promise((resolve) => setTimeout(() => {
                            this.logger.logError(mobile, 'Client disconnect timeout, forcing cleanup', {});
                            resolve();
                        }, 10000))
                    ]);
                }
                this.clients.delete(mobile);
                this.stats.activeConnections = this.clients.size;
                this.logger.logOperation(mobile, 'Client unregistered successfully', {
                    activeConnections: this.stats.activeConnections
                });
                return true;
            }
            else {
                this.logger.logDebug(mobile, 'Client not found for unregistration');
                return false;
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'Error in unregisterClient', error);
            this.clients.delete(mobile);
            this.stats.activeConnections = this.clients.size;
            return false;
        }
    }
    getActiveConnectionCount() {
        return this.clients.size;
    }
    getConnectionStats() {
        return {
            ...this.stats,
            activeConnections: this.clients.size
        };
    }
    getClientInfo(mobile) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo)
            return null;
        return {
            lastUsed: clientInfo.lastUsed,
            autoDisconnect: clientInfo.autoDisconnect,
            connectionAttempts: clientInfo.connectionAttempts,
            isConnecting: clientInfo.isConnecting
        };
    }
    startCleanupInterval(intervalMs = 300000) {
        if (this.cleanupInterval) {
            this.stopCleanupInterval();
        }
        this.logger.logOperation('system', 'Starting cleanup interval', { intervalMs });
        this.cleanupInterval = setInterval(async () => {
            try {
                const cleanedCount = await this.cleanupInactiveConnections();
                this.logger.logDebug('system', `Cleanup interval completed: ${cleanedCount} clients cleaned`);
            }
            catch (error) {
                this.logger.logError('system', 'Error in cleanup interval', error);
            }
        }, intervalMs);
        return this.cleanupInterval;
    }
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.logger.logOperation('system', 'Cleanup interval stopped');
        }
    }
    async healthCheck() {
        const issues = [];
        let status = 'healthy';
        try {
            if (!this.usersService) {
                issues.push('UsersService not initialized');
                status = 'unhealthy';
            }
            const activeCount = this.getActiveConnectionCount();
            if (activeCount > 100) {
                issues.push(`High connection count: ${activeCount}`);
                status = status === 'healthy' ? 'degraded' : status;
            }
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
        }
        catch (error) {
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
exports.ConnectionManager = ConnectionManager;
exports.connectionManager = ConnectionManager.getInstance();
//# sourceMappingURL=connection-manager.js.map