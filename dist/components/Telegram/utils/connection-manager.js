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
        this.clients = new Map();
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.boundShutdownHandler = this.handleShutdown.bind(this);
        process.on('SIGTERM', this.boundShutdownHandler);
        process.on('SIGINT', this.boundShutdownHandler);
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
    dispose() {
        this.stopCleanupInterval();
        process.off('SIGTERM', this.boundShutdownHandler);
        process.off('SIGINT', this.boundShutdownHandler);
        this.clients.clear();
    }
    async handleShutdown() {
        this.logger.logOperation('ConnectionManager', 'Graceful shutdown initiated');
        this.dispose();
        await this.disconnectAll();
        process.exit(0);
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
        const errorMessage = error.message.toLowerCase();
        const nonRetryableErrors = [
            'user_deactivated_ban',
            'auth_key_unregistered',
            'session_revoked',
            'phone_number_banned',
            'user_deactivated'
        ];
        if (nonRetryableErrors.some(errType => errorMessage.includes(errType))) {
            this.logger.logOperation(clientInfo.client?.phoneNumber || 'unknown', `Non-retryable error detected: ${error.message}`);
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
            this.logger.logOperation(clientInfo.client?.phoneNumber || 'unknown', `Waiting ${waitTime}ms before retry attempt ${clientInfo.connectionAttempts + 1}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    async validateConnection(mobile, client) {
        try {
            if (!client.connected()) {
                return false;
            }
            const controller = new AbortController();
            try {
                await Promise.race([
                    client.client.getMe(),
                    this.createTimeoutPromise(this.VALIDATION_TIMEOUT, controller.signal)
                ]);
                return true;
            }
            finally {
                controller.abort();
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'Connection validation failed', error);
            return false;
        }
    }
    async attemptConnection(mobile, telegramManager, timeout) {
        const controller = new AbortController();
        try {
            const client = await Promise.race([
                telegramManager.createClient(true),
                this.createTimeoutPromise(timeout, controller.signal)
            ]);
            const verificationController = new AbortController();
            try {
                await Promise.race([
                    client.getMe(),
                    this.createTimeoutPromise(5000, verificationController.signal)
                ]);
                return client;
            }
            finally {
                verificationController.abort();
            }
        }
        finally {
            controller.abort();
        }
    }
    async getClient(mobile, options = {}) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
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
        if (clientInfo?.client && !forceReconnect) {
            this.updateLastUsed(mobile);
            if (clientInfo.state === 'connected' &&
                await this.validateConnection(mobile, clientInfo.client)) {
                this.logger.logOperation(mobile, 'Reusing existing connected client');
                clientInfo.consecutiveFailures = 0;
                clientInfo.lastSuccessfulConnection = Date.now();
                return clientInfo.client;
            }
            if (clientInfo.state === 'error' && this.shouldRetry(clientInfo, clientInfo.lastError)) {
                await this.waitForRetry(clientInfo);
                return this.retryConnection(mobile, clientInfo, timeout);
            }
            if (clientInfo.connectionAttempts >= clientInfo.retryConfig.maxAttempts) {
                this.logger.logOperation(mobile, 'Max retry attempts reached, cleaning up client');
                await this.unregisterClient(mobile);
                clientInfo = undefined;
            }
        }
        return this.createNewClient(mobile, mergedRetryConfig, { autoDisconnect, handler, timeout });
    }
    async retryConnection(mobile, clientInfo, timeout) {
        try {
            clientInfo.state = 'connecting';
            clientInfo.connectionAttempts++;
            this.clients.set(mobile, clientInfo);
            this.logger.logOperation(mobile, `Retry attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
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
                this.logger.logOperation(mobile, 'Retry connection successful');
                return clientInfo.client;
            }
            throw new Error('Connection validation failed after retry');
        }
        catch (error) {
            return this.handleConnectionError(mobile, clientInfo, error);
        }
    }
    async handleConnectionError(mobile, clientInfo, error) {
        clientInfo.lastError = error;
        clientInfo.consecutiveFailures++;
        clientInfo.state = 'error';
        if (this.shouldRetry(clientInfo, error)) {
            const delay = this.calculateRetryDelay(clientInfo.connectionAttempts, clientInfo.retryConfig);
            clientInfo.nextRetryAt = Date.now() + delay;
            this.clients.set(mobile, clientInfo);
            this.logger.logOperation(mobile, `Connection failed, will retry in ${delay}ms. Attempt ${clientInfo.connectionAttempts}/${clientInfo.retryConfig.maxAttempts}`);
        }
        else {
            this.logger.logOperation(mobile, 'Connection failed with non-retryable error or max attempts reached');
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
        this.logger.logOperation(mobile, 'Creating new client', {
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
            }
            else {
                throw new Error('Client creation returned null');
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'New client creation failed', error);
            const errorDetails = (0, parseError_1.parseError)(error, mobile, false);
            try {
                await TelegramBots_config_1.BotConfig.getInstance().sendMessage(TelegramBots_config_1.ChannelCategory.ACCOUNT_LOGIN_FAILURES, `${process.env.clientId}::${mobile}\n\nAttempt: ${clientInfo.connectionAttempts}\nError: ${errorDetails.message}`);
            }
            catch (notificationError) {
                this.logger.logError(mobile, 'Failed to send error notification', notificationError);
            }
            if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', 'revoked', 'user_deactivated_ban'])) {
                this.logger.logOperation(mobile, 'Marking user as expired due to permanent error');
                try {
                    await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
                }
                catch (updateError) {
                    this.logger.logError(mobile, 'Failed to mark user as expired', updateError);
                }
            }
            return this.handleConnectionError(mobile, clientInfo, error);
        }
    }
    async cleanupInactiveConnections(maxIdleTime = 180000) {
        const now = Date.now();
        const disconnectionPromises = [];
        for (const [mobile, connection] of this.clients.entries()) {
            const shouldCleanup = (connection.autoDisconnect || connection.lastUsed <= now - this.COOLDOWN_PERIOD) &&
                (now - connection.lastUsed > maxIdleTime ||
                    connection.state === 'error' ||
                    connection.consecutiveFailures >= connection.retryConfig.maxAttempts ||
                    (connection.state === 'connecting' && now - connection.lastUsed > this.CONNECTION_TIMEOUT * 2));
            if (shouldCleanup) {
                this.logger.logOperation(mobile, `Cleaning up connection - state: ${connection.state}, failures: ${connection.consecutiveFailures}`);
                try {
                    disconnectionPromises.push(Promise.race([
                        this.unregisterClient(mobile),
                        new Promise((resolve) => setTimeout(resolve, 10000))
                    ]));
                }
                catch (error) {
                    this.logger.logError(mobile, 'Error during cleanup', error);
                    this.clients.delete(mobile);
                }
            }
        }
        try {
            await Promise.race([
                Promise.all(disconnectionPromises),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 30000))
            ]);
        }
        catch (error) {
            this.logger.logError('ConnectionManager', 'Cleanup operation timed out', error);
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
        this.logger.logOperation('ConnectionManager', 'Disconnecting all clients');
        const disconnectionPromises = [];
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
    async unregisterClient(mobile) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo)
            return;
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
            }
            catch (error) {
                this.logger.logError(mobile, 'Error during client disconnect', error);
            }
            finally {
                controller.abort();
                if (clientInfo.client) {
                    clientInfo.client.client = null;
                    clientInfo.client = null;
                }
            }
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
        this.logger.logOperation(mobile, 'Force reconnection requested');
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