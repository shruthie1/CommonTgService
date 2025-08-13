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
        this.isShuttingDown = false;
        this.DEFAULT_RETRY_CONFIG = {
            maxAttempts: 5,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
            jitter: true
        };
        this.CONNECTION_TIMEOUT = 60000;
        this.MAX_CONCURRENT_CONNECTIONS = 100;
        this.COOLDOWN_PERIOD = 600000;
        this.VALIDATION_TIMEOUT = 10000;
        this.CLEANUP_TIMEOUT = 15000;
        this.MAX_CLEANUP_ATTEMPTS = 3;
        this.clients = new Map();
        this.logger = new telegram_logger_1.TelegramLogger('Connection Manager');
        this.startCleanupInterval();
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
    async handleShutdown() {
        this.logger.info('ConnectionManager', 'Graceful shutdown initiated');
        this.isShuttingDown = true;
        await this.disconnectAll();
        this.stopCleanupInterval();
    }
    createTimeoutPromise(timeoutMs, signal) {
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
    calculateRetryDelay(attempt, config) {
        let delay = Math.min(config.baseDelay * Math.pow(config.backoffMultiplier, attempt), config.maxDelay);
        if (config.jitter) {
            delay = delay * (0.5 + Math.random() * 0.5);
        }
        return Math.floor(delay);
    }
    shouldRetry(clientInfo, error) {
        const now = Date.now();
        if (clientInfo.connectionAttempts >= clientInfo.retryConfig.maxAttempts) {
            return false;
        }
        if (clientInfo.nextRetryAt && now < clientInfo.nextRetryAt) {
            return false;
        }
        const errorMessage = error.toLowerCase();
        const nonRetryableErrors = [
            'user_deactivated_ban',
            'auth_key_unregistered',
            'session_revoked',
            'phone_number_banned',
            'user_deactivated'
        ];
        if (nonRetryableErrors.some(errType => errorMessage.includes(errType))) {
            this.logger.info(clientInfo.client?.phoneNumber || 'unknown', `Non-retryable error detected: ${error}`);
            return false;
        }
        return true;
    }
    async waitForRetry(clientInfo) {
        if (!clientInfo.nextRetryAt)
            return;
        const now = Date.now();
        const waitTime = Math.max(0, clientInfo.nextRetryAt - now);
        if (waitTime > 0) {
            this.logger.info(clientInfo.client?.phoneNumber || 'unknown', `Waiting ${waitTime}ms before retry attempt ${clientInfo.connectionAttempts + 1}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    async validateConnection(mobile, client) {
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
            }
            finally {
                clearTimeout(timeoutId);
                controller.abort();
            }
        }
        catch (error) {
            this.logger.error(mobile, 'Connection validation failed', error);
            return false;
        }
    }
    async getClient(mobile, options = {}) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        if (this.isShuttingDown) {
            throw new common_1.InternalServerErrorException('ConnectionManager is shutting down');
        }
        if (this.clients.size >= this.MAX_CONCURRENT_CONNECTIONS) {
            throw new common_1.InternalServerErrorException('Maximum connection limit reached');
        }
        const { autoDisconnect = true, handler = true, timeout = this.CONNECTION_TIMEOUT, retryConfig = {}, forceReconnect = false } = options;
        const mergedRetryConfig = {
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
            this.logger.info(mobile, `Cleaning up client - Valid: ${isValid}, Healthy: ${isHealthy}, ForceReconnect: ${forceReconnect}`);
            await this.unregisterClient(mobile);
            clientInfo = undefined;
        }
        if (clientInfo) {
            this.logger.info(mobile, 'Client info found but not valid, cleaning up');
            await this.unregisterClient(mobile);
            await (0, utils_1.sleep)(1000);
        }
        this.logger.info(mobile, 'Creating fresh client connection');
        return this.createNewClient(mobile, mergedRetryConfig, { autoDisconnect, handler, timeout });
    }
    async retryConnection(mobile, clientInfo, timeout) {
        try {
            clientInfo.state = 'connecting';
            clientInfo.connectionAttempts++;
            this.clients.set(mobile, clientInfo);
            this.logger.info(mobile, `Retry attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
            await Promise.race([
                clientInfo.client.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Reconnection timeout')), timeout))
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
        }
        catch (error) {
            return this.handleConnectionError(mobile, clientInfo, error);
        }
    }
    async handleConnectionError(mobile, clientInfo, error) {
        clientInfo.lastError = error.message;
        clientInfo.consecutiveFailures++;
        clientInfo.state = 'error';
        if (this.shouldRetry(clientInfo, error.message)) {
            const delay = this.calculateRetryDelay(clientInfo.connectionAttempts, clientInfo.retryConfig);
            clientInfo.nextRetryAt = Date.now() + delay;
            this.clients.set(mobile, clientInfo);
            this.logger.info(mobile, `Connection failed, will retry in ${delay}ms. Attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
        }
        else {
            this.logger.info(mobile, 'Connection failed with non-retryable error or max attempts reached');
            await this.unregisterClient(mobile);
        }
        const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
        throw new common_1.BadRequestException(errorDetails.message);
    }
    async createNewClient(mobile, retryConfig, options) {
        if (!this.usersService) {
            throw new common_1.InternalServerErrorException('UsersService not initialized');
        }
        const users = await this.usersService.search({ mobile });
        const user = users[0];
        if (!user) {
            throw new common_1.BadRequestException('User not found');
        }
        this.logger.info(mobile, 'Creating new client', {
            autoDisconnect: options.autoDisconnect,
            handler: options.handler,
            retryConfig
        });
        const telegramManager = new TelegramManager_1.default(user.session, user.mobile);
        const clientInfo = {
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
            const timeoutMs = 15000;
            const client = await Promise.race([
                telegramManager.createClient(options.handler),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Client creation timed out after ${timeoutMs}ms for ${mobile}`)), timeoutMs))
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
            }
            else {
                throw new Error('Client creation returned null');
            }
        }
        catch (error) {
            this.logger.error(mobile, 'New client creation failed', error);
            const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
            try {
                await TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.ACCOUNT_LOGIN_FAILURES, `${process.env.clientId}::${mobile}\n\nAttempt: ${clientInfo.connectionAttempts}\nError: ${errorDetails.message}`);
            }
            catch (notificationError) {
                this.logger.error(mobile, 'Failed to send error notification', notificationError);
            }
            if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'])) {
                this.logger.info(mobile, 'Marking user as expired due to permanent error');
                try {
                    await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
                }
                catch (updateError) {
                    this.logger.error(mobile, 'Failed to mark user as expired', updateError);
                }
            }
            return this.handleConnectionError(mobile, clientInfo, error);
        }
    }
    async cleanupInactiveConnections(maxIdleTime = 180000) {
        if (this.isShuttingDown)
            return;
        this.logger.info('ConnectionManager', 'Perfroming Regular Cleanup');
        const now = Date.now();
        const cleanupResults = new Map();
        const cleanupPromises = [];
        for (const [mobile, connection] of this.clients.entries()) {
            const shouldCleanup = ((connection.autoDisconnect && connection.lastUsed <= now - 100000) || connection.lastUsed <= now - this.COOLDOWN_PERIOD) &&
                (now - connection.lastUsed > maxIdleTime ||
                    connection.state === 'error' ||
                    connection.consecutiveFailures >= connection.retryConfig.maxAttempts ||
                    (connection.state === 'connecting' && now - connection.lastUsed > this.CONNECTION_TIMEOUT * 2) ||
                    (connection.cleanupAttempts && connection.cleanupAttempts >= this.MAX_CLEANUP_ATTEMPTS));
            if (shouldCleanup) {
                this.logger.info(mobile, `Cleaning up connection - state: ${connection.state}, failures: ${connection.consecutiveFailures}, cleanup attempts: ${connection.cleanupAttempts || 0}`);
                const cleanupPromise = this.unregisterClient(mobile)
                    .then(() => {
                    cleanupResults.set(mobile, true);
                })
                    .catch((error) => {
                    this.logger.error(mobile, 'Cleanup failed', error);
                    cleanupResults.set(mobile, false);
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
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 30000))
                ]);
            }
            catch (error) {
                this.logger.error('ConnectionManager', 'Cleanup operation timed out', error);
            }
            const failed = Array.from(cleanupResults.entries())
                .filter(([_, success]) => !success)
                .map(([mobile]) => mobile);
            if (failed.length > 0) {
                this.logger.info('ConnectionManager', `Cleanup completed. Failed cleanups: ${failed.join(', ')}`);
            }
            else {
                this.logger.info('ConnectionManager', `Cleanup completed successfully for ${cleanupResults.size} clients`);
            }
        }
    }
    updateLastUsed(mobile) {
        const connection = this.clients.get(mobile);
        if (connection) {
            connection.lastUsed = Date.now();
            this.clients.set(mobile, connection);
        }
    }
    hasClient(number) {
        const client = this.clients.get(number);
        return client !== undefined && client.state === 'connected';
    }
    async disconnectAll() {
        this.logger.info('ConnectionManager', 'Disconnecting all clients');
        const disconnectionPromises = [];
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
                new Promise((_, reject) => setTimeout(() => reject(new Error('Disconnect all timeout')), 60000))
            ]);
        }
        catch (error) {
            this.logger.error('ConnectionManager', 'Disconnect all timed out', error);
        }
        this.clients.clear();
        this.logger.info('ConnectionManager', 'All clients disconnected');
    }
    async unregisterClient(mobile, timeoutMs = this.CLEANUP_TIMEOUT) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo)
            return;
        this.logger.info(mobile, 'Unregistering client', {
            state: clientInfo.state,
            lastUsed: clientInfo.lastUsed,
            autoDisconnect: clientInfo.autoDisconnect
        });
        try {
            clientInfo.state = 'disconnecting';
            await clientInfo.client.destroy();
            this.clients.delete(mobile);
        }
        catch (error) {
            this.logger.error(mobile, 'Unregister failed', error);
        }
        try {
            await this.forceCleanupClient(mobile, clientInfo);
        }
        catch (forceError) {
            this.logger.error(mobile, 'Force cleanup also failed', forceError);
        }
    }
    async forceCleanupClient(mobile, clientInfo) {
        if (clientInfo.client?.client) {
            this.logger.info(mobile, 'Performing FORCE cleanup');
            try {
                await clientInfo.client.client.destroy();
            }
            catch (destroyError) {
                this.logger.error(mobile, 'Force destroy failed', destroyError);
            }
        }
        try {
            if (clientInfo.client) {
                if (clientInfo.client.client) {
                    clientInfo.client.client = null;
                }
                clientInfo.client = null;
            }
        }
        catch (refError) {
            this.logger.error(mobile, 'Reference cleanup in force mode failed', refError);
        }
        this.clients.delete(mobile);
        this.logger.info(mobile, 'Client removed from map');
    }
    getActiveConnectionCount() {
        return Array.from(this.clients.values())
            .filter(client => client.state === 'connected')
            .length;
    }
    getConnectionLeakReport() {
        const activeConnections = [];
        const zombieConnections = [];
        const staleConnections = [];
        const now = Date.now();
        for (const [mobile, clientInfo] of this.clients.entries()) {
            if (clientInfo.client) {
                const isClientConnected = clientInfo.client.connected();
                const stateConnected = clientInfo.state === 'connected';
                const isStale = now - clientInfo.lastUsed > this.COOLDOWN_PERIOD * 2;
                if (isClientConnected && stateConnected) {
                    activeConnections.push(mobile);
                }
                else if (!isClientConnected && stateConnected) {
                    zombieConnections.push(mobile);
                }
                else if (isStale && clientInfo.state !== 'disconnected') {
                    staleConnections.push(mobile);
                }
            }
        }
        return {
            mapSize: this.clients.size,
            activeConnections,
            zombieConnections,
            staleConnections
        };
    }
    async performHealthCheck() {
        if (this.isShuttingDown)
            return;
        const leakReport = this.getConnectionLeakReport();
        if (leakReport.zombieConnections.length > 0) {
            this.logger.info('ConnectionManager', `Health check: Detected ${leakReport.zombieConnections.length} zombie connections`);
            for (const mobile of leakReport.zombieConnections) {
                try {
                    await this.unregisterClient(mobile);
                }
                catch (error) {
                    this.logger.error(mobile, 'Health check cleanup failed', error);
                }
            }
        }
        if (leakReport.staleConnections.length > 0) {
            this.logger.info('ConnectionManager', `Health check: Detected ${leakReport.staleConnections.length} stale connections`);
            for (const mobile of leakReport.staleConnections) {
                try {
                    await this.unregisterClient(mobile);
                }
                catch (error) {
                    this.logger.error(mobile, 'Stale connection cleanup failed', error);
                }
            }
        }
        this.logger.info('ConnectionManager', `Health check completed - Active: ${leakReport.activeConnections.length}, Total: ${leakReport.mapSize}`, leakReport);
    }
    startCleanupInterval(intervalMs = 120000) {
        if (this.cleanupInterval) {
            return this.cleanupInterval;
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
        this.cleanupInactiveConnections().catch(err => {
            this.logger.error('ConnectionManager', 'Error in initial cleanup', err);
        });
        return this.cleanupInterval;
    }
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.logger.info('ConnectionManager', 'Cleanup interval stopped');
            this.cleanupInterval = null;
        }
    }
    getClientState(mobile) {
        const client = this.clients.get(mobile);
        if (client) {
            return {
                autoDisconnect: client.autoDisconnect,
                connectionAttempts: client.connectionAttempts,
                lastUsed: client.lastUsed,
                state: client.state,
                lastError: client.lastError
            };
        }
    }
    getConnectionStats() {
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
            }
            else {
                stats[client.state]++;
            }
        }
        return stats;
    }
    getClientInfo(mobile) {
        return this.clients.get(mobile);
    }
    async forceReconnect(mobile) {
        this.logger.info(mobile, 'Force reconnection requested');
        await this.unregisterClient(mobile);
        return this.getClient(mobile, { forceReconnect: true });
    }
    setRetryConfig(mobile, config) {
        const clientInfo = this.clients.get(mobile);
        if (clientInfo) {
            clientInfo.retryConfig = { ...clientInfo.retryConfig, ...config };
            this.clients.set(mobile, clientInfo);
            return true;
        }
        return false;
    }
}
ConnectionManager.instance = null;
exports.connectionManager = ConnectionManager.getInstance();
//# sourceMappingURL=connection-manager.js.map