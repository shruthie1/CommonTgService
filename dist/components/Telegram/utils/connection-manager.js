"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TelegramManager_1 = __importDefault(require("../TelegramManager"));
const parseError_1 = require("../../../utils/parseError");
const telegram_logger_1 = require("./telegram-logger");
const common_1 = require("@nestjs/common");
const utils_1 = require("../../../utils");
class ConnectionManager {
    constructor() {
        this.cleanupInterval = null;
        this.clients = new Map();
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
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
        for (const [mobile, connection] of this.clients.entries()) {
            if (!connection.autoDisconnect) {
                continue;
            }
            if (now - connection.lastUsed > maxIdleTime) {
                this.logger.logOperation(mobile, 'Releasing inactive connection');
                await this.unregisterClient(mobile);
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
    async getClient(mobile, options = {}) {
        if (!mobile) {
            this.logger.logDebug('system', 'getClient called with empty mobile number');
            return undefined;
        }
        const { autoDisconnect = true, handler = true } = options;
        this.logger.logOperation(mobile, 'Getting/Creating client', { autoDisconnect, handler });
        const clientInfo = this.clients.get(mobile);
        if (clientInfo?.client) {
            this.updateLastUsed(mobile);
            if (clientInfo.client.connected()) {
                this.logger.logOperation(mobile, 'Reusing existing connected client');
                return clientInfo.client;
            }
            else {
                try {
                    this.logger.logOperation(mobile, 'Reconnecting existing client');
                    await clientInfo.client.connect();
                    return clientInfo.client;
                }
                catch (error) {
                    this.logger.logError(mobile, 'Failed to reconnect client', error);
                }
            }
        }
        if (!this.usersService) {
            throw new Error('UsersService not initialized');
        }
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const telegramManager = new TelegramManager_1.default(user.session, user.mobile);
        let client;
        try {
            client = await telegramManager.createClient(handler);
            await client.getMe();
            if (client) {
                await this.registerClient(mobile, telegramManager, { autoDisconnect: autoDisconnect });
                this.logger.logOperation(mobile, 'Client created successfully');
                return telegramManager;
            }
            else {
                throw new common_1.BadRequestException('Client Expired');
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'Client creation failed', error);
            this.logger.logDebug(mobile, 'Parsing error details...');
            await this.unregisterClient(mobile);
            const errorDetails = (0, parseError_1.parseError)(error, mobile);
            if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "revoked", "user_deactivated_ban"])) {
                this.logger.logOperation(mobile, 'Marking user as expired');
                await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
            }
            throw new common_1.BadRequestException(errorDetails.message);
        }
    }
    hasClient(number) {
        return this.clients.has(number);
    }
    async disconnectAll() {
        this.logger.logOperation('system', 'Disconnecting all clients');
        const clientMobiles = Array.from(this.clients.keys());
        await Promise.all(clientMobiles.map(mobile => {
            this.logger.logOperation(mobile, 'Disconnecting client');
            return this.unregisterClient(mobile);
        }));
        this.clients.clear();
        this.logger.logOperation('system', 'All clients disconnected');
    }
    async registerClient(mobile, telegramManager, options = { autoDisconnect: true }) {
        this.clients.set(mobile, {
            client: telegramManager,
            lastUsed: Date.now(),
            autoDisconnect: options.autoDisconnect
        });
        this.logger.logOperation(mobile, `Client registered successfully${!options.autoDisconnect ? ' (excluded from auto-cleanup)' : ''}`);
    }
    async unregisterClient(mobile) {
        try {
            const clientInfo = this.clients.get(mobile);
            if (clientInfo) {
                await clientInfo.client?.disconnect();
                this.logger.logOperation(mobile, 'Client unregistered successfully');
            }
            else {
                this.logger.logDebug(mobile, 'Client not found for unregistration');
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
        return this.clients.size;
    }
    startCleanupInterval(intervalMs = 300000) {
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveConnections().catch(err => {
                this.logger.logError('system', 'Error in cleanup interval', err);
            });
        }, intervalMs);
        return this.cleanupInterval;
    }
    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}
const connectionManager = ConnectionManager.getInstance();
exports.default = connectionManager;
//# sourceMappingURL=connection-manager.js.map