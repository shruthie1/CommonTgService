"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionManager = void 0;
exports.unregisterClient = unregisterClient;
const TelegramManager_1 = __importDefault(require("../TelegramManager"));
const parseError_1 = require("../../../utils/parseError");
const telegram_logger_1 = require("./telegram-logger");
const common_1 = require("@nestjs/common");
const TelegramBots_config_1 = require("../../../utils/TelegramBots.config");
const withTimeout_1 = require("../../../utils/withTimeout");
const Helpers_1 = require("telegram/Helpers");
const utils_1 = require("../../../utils");
class ConnectionManager {
    constructor() {
        this.clients = new Map();
        this.logger = new telegram_logger_1.TelegramLogger('ConnectionManager');
        this.cleanupTimer = null;
        this.usersService = null;
        this.isShuttingDown = false;
        this.MAX_CONNECTIONS = 50;
        this.IDLE_TIMEOUT = 300000;
        this.CLEANUP_INTERVAL = 60000;
        this.MAX_RETRY_ATTEMPTS = 3;
        this.startCleanup();
        this.logger.info('ConnectionManager', 'Initialized');
    }
    static getInstance() {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }
    setUsersService(usersService) {
        this.usersService = usersService;
        this.logger.info('ConnectionManager', 'UsersService attached');
    }
    async getClient(mobile, options = {}) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number required');
        }
        if (this.isShuttingDown) {
            throw new common_1.InternalServerErrorException('Manager is shutting down');
        }
        if (this.clients.size >= this.MAX_CONNECTIONS) {
            await this.forceCleanup();
            if (this.clients.size >= this.MAX_CONNECTIONS) {
                throw new common_1.InternalServerErrorException('Connection limit reached');
            }
        }
        const { autoDisconnect = true, handler = true, forceReconnect = false } = options;
        const existingClient = this.clients.get(mobile);
        if (existingClient && !forceReconnect) {
            if (existingClient.state === 'connected' && this.isClientHealthy(existingClient)) {
                this.updateLastUsed(mobile);
                this.logger.info(mobile, 'Reusing healthy client');
                return existingClient.client;
            }
        }
        if (existingClient) {
            this.logger.info(mobile, 'Cleaning up old client');
            await this.unregisterClient(mobile);
            await (0, Helpers_1.sleep)(3000);
        }
        return await this.createNewClient(mobile, { autoDisconnect, handler });
    }
    async createNewClient(mobile, options) {
        if (!this.usersService) {
            throw new common_1.InternalServerErrorException('UsersService not initialized');
        }
        this.logger.info(mobile, 'Creating new client', options);
        const users = await this.usersService.search({ mobile });
        const user = users[0];
        if (!user) {
            throw new common_1.NotFoundException(`[Connection Manager]\nUser not found : ${mobile}`);
        }
        const telegramManager = new TelegramManager_1.default(user.session, user.mobile);
        const clientInfo = {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect,
            state: 'connecting',
            connectionAttempts: 1
        };
        this.clients.set(mobile, clientInfo);
        try {
            await telegramManager.createClient(options.handler);
            await this.validateConnection(mobile, telegramManager);
            clientInfo.state = 'connected';
            clientInfo.connectionAttempts = 1;
            delete clientInfo.lastError;
            this.clients.set(mobile, clientInfo);
            return telegramManager;
        }
        catch (error) {
            this.logger.error(mobile, 'Client creation failed', error);
            await this.handleConnectionError(mobile, clientInfo, error);
            await this.unregisterClient(mobile);
            throw error;
        }
    }
    async validateConnection(mobile, client) {
        await (0, withTimeout_1.withTimeout)(() => client.client.getMe(), {
            errorMessage: `getMe TimeOut for ${mobile}\napiId: ${client.apiId}\napiHash:${client.apiHash}`,
            maxRetries: 3,
            throwErr: true
        });
    }
    isClientHealthy(clientInfo) {
        const now = Date.now();
        const isConnected = clientInfo.client?.connected() === true;
        const isNotStale = (now - clientInfo.lastUsed) < this.IDLE_TIMEOUT;
        const hasNoErrors = clientInfo.state === 'connected' && !clientInfo.lastError;
        return isConnected && isNotStale && hasNoErrors;
    }
    async handleConnectionError(mobile, clientInfo, error) {
        clientInfo.lastError = error.message;
        clientInfo.state = 'error';
        this.clients.set(mobile, clientInfo);
        const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
        let markedAsExpired = false;
        const permanentErrors = ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'];
        if ((0, utils_1.contains)(errorDetails.message, permanentErrors)) {
            this.logger.info(mobile, 'Marking user as expired due to permanent error');
            try {
                const users = await this.usersService.search({ mobile });
                const user = users[0];
                if (user) {
                    await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
                    markedAsExpired = true;
                }
            }
            catch (updateError) {
                this.logger.error(mobile, 'Failed to mark user as expired', updateError);
            }
        }
        try {
            await TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.ACCOUNT_LOGIN_FAILURES, `${errorDetails.message}\n\nMarkedAsExpired: ${markedAsExpired}`);
        }
        catch (notificationError) {
            this.logger.error(mobile, 'Failed to send error notification', notificationError);
        }
    }
    async unregisterClient(mobile) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo)
            return;
        try {
            clientInfo.state = 'disconnected';
            await (0, withTimeout_1.withTimeout)(() => clientInfo.client.destroy(), {
                timeout: 30000,
                errorMessage: "Client destroy timeout"
            });
        }
        catch (error) {
            this.logger.error(mobile, 'Error destroying client', error);
        }
        finally {
            this.clients.delete(mobile);
        }
    }
    updateLastUsed(mobile) {
        const clientInfo = this.clients.get(mobile);
        if (clientInfo) {
            clientInfo.lastUsed = Date.now();
            this.clients.set(mobile, clientInfo);
        }
    }
    hasClient(mobile) {
        const clientInfo = this.clients.get(mobile);
        return clientInfo !== undefined && clientInfo.state === 'connected';
    }
    getClientState(mobile) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo)
            return undefined;
        return {
            autoDisconnect: clientInfo.autoDisconnect,
            connectionAttempts: clientInfo.connectionAttempts,
            lastUsed: clientInfo.lastUsed,
            state: clientInfo.state,
            lastError: clientInfo.lastError
        };
    }
    getConnectionStats() {
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
    async cleanup() {
        if (this.isShuttingDown)
            return;
        const now = Date.now();
        const toRemove = [];
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
        const removePromises = toRemove.slice(0, 10).map(mobile => this.unregisterClient(mobile).catch(error => this.logger.error(mobile, 'Cleanup removal failed', error)));
        if (removePromises.length > 0) {
            await Promise.allSettled(removePromises);
            this.logger.info('ConnectionManager', `Cleanup completed - removed ${removePromises.length} clients`);
        }
    }
    async forceCleanup() {
        this.logger.info('ConnectionManager', 'Force cleanup triggered');
        const oldestClients = Array.from(this.clients.entries())
            .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
            .slice(0, Math.ceil(this.MAX_CONNECTIONS * 0.2))
            .map(([mobile]) => mobile);
        for (const mobile of oldestClients) {
            await this.unregisterClient(mobile);
        }
        this.logger.info('ConnectionManager', `Force cleanup completed - removed ${oldestClients.length} clients`);
    }
    async forceReconnect(mobile) {
        this.logger.info(mobile, 'Force reconnect requested');
        await this.unregisterClient(mobile);
        return this.getClient(mobile, { forceReconnect: true });
    }
    startCleanup() {
        if (this.cleanupTimer)
            return;
        this.cleanupTimer = setInterval(() => {
            this.cleanup().catch(error => this.logger.error('ConnectionManager', 'Cleanup error', error));
        }, this.CLEANUP_INTERVAL);
        this.logger.info('ConnectionManager', `Cleanup started - ${this.CLEANUP_INTERVAL}ms interval`);
    }
    stopCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            this.logger.info('ConnectionManager', 'Cleanup stopped');
        }
    }
    async shutdown() {
        this.logger.info('ConnectionManager', 'Shutdown initiated');
        this.isShuttingDown = true;
        this.stopCleanup();
        await this.disconnectAll();
        this.clients.clear();
        this.logger.info('ConnectionManager', 'Shutdown completed');
    }
    async disconnectAll() {
        const disconnectPromises = Array.from(this.clients.keys()).map(mobile => this.unregisterClient(mobile).catch(error => this.logger.error(mobile, 'Shutdown disconnect failed', error)));
        await Promise.allSettled(disconnectPromises);
    }
    getActiveConnectionCount() {
        return Array.from(this.clients.values())
            .filter(client => client.state === 'connected').length;
    }
    getClientList() {
        return Array.from(this.clients.keys());
    }
    getHealthReport() {
        const unhealthyClients = [];
        let healthyCount = 0;
        for (const [mobile, clientInfo] of this.clients.entries()) {
            if (this.isClientHealthy(clientInfo)) {
                healthyCount++;
            }
            else {
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
ConnectionManager.instance = null;
exports.connectionManager = ConnectionManager.getInstance();
async function unregisterClient(mobile) {
    await exports.connectionManager.unregisterClient(mobile);
}
//# sourceMappingURL=connection-manager.js.map