"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ClientRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientRegistry = void 0;
const common_1 = require("@nestjs/common");
const telegram_logger_1 = require("../Telegram/utils/telegram-logger");
let ClientRegistry = ClientRegistry_1 = class ClientRegistry {
    constructor() {
        this.clients = new Map();
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.locks = new Map();
        this.LOCK_TIMEOUT = 30000;
        this.LOCK_EXPIRY = 120000;
        this.CLIENT_TIMEOUT = 300000;
        setInterval(() => this.cleanupInactiveClients(), 60000);
        setInterval(() => this.cleanupExpiredLocks(), 30000);
    }
    static getInstance() {
        if (!ClientRegistry_1.instance) {
            ClientRegistry_1.instance = new ClientRegistry_1();
        }
        return ClientRegistry_1.instance;
    }
    async acquireLock(mobile) {
        const lockId = `${mobile}_${Date.now()}_${Math.random()}`;
        const now = new Date();
        const existingLock = this.locks.get(mobile);
        if (existingLock) {
            if (now.getTime() - existingLock.acquired.getTime() > this.LOCK_EXPIRY) {
                this.locks.delete(mobile);
                this.logger.logOperation(mobile, 'Removed expired lock');
            }
            else {
                this.logger.logOperation(mobile, 'Lock already exists, waiting...');
                return null;
            }
        }
        this.locks.set(mobile, { acquired: now, lockId });
        this.logger.logOperation(mobile, `Lock acquired: ${lockId}`);
        return lockId;
    }
    releaseLock(mobile, lockId) {
        const lock = this.locks.get(mobile);
        if (lock && lock.lockId === lockId) {
            this.locks.delete(mobile);
            this.logger.logOperation(mobile, `Lock released: ${lockId}`);
            return true;
        }
        return false;
    }
    async waitForLock(mobile) {
        const startTime = Date.now();
        while (Date.now() - startTime < this.LOCK_TIMEOUT) {
            const lockId = await this.acquireLock(mobile);
            if (lockId) {
                return lockId;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new Error(`Lock acquisition timeout for ${mobile}`);
    }
    hasClient(mobile) {
        return this.clients.has(mobile);
    }
    getClientInfo(mobile) {
        return this.clients.get(mobile) || null;
    }
    async registerClient(mobile, client, sessionString, lockId) {
        const lock = this.locks.get(mobile);
        if (!lock || lock.lockId !== lockId) {
            throw new Error(`Invalid lock for registering client: ${mobile}`);
        }
        if (this.clients.has(mobile)) {
            this.logger.logError(mobile, 'Client already exists, cannot register new one', new Error('Duplicate client'));
            return false;
        }
        const clientInfo = {
            client,
            mobile,
            sessionString,
            createdAt: new Date(),
            lastActivity: new Date(),
            isCreating: false,
            lockId
        };
        this.clients.set(mobile, clientInfo);
        this.logger.logOperation(mobile, 'Client registered successfully');
        return true;
    }
    markClientCreating(mobile, lockId) {
        const lock = this.locks.get(mobile);
        if (!lock || lock.lockId !== lockId) {
            return false;
        }
        const existing = this.clients.get(mobile);
        if (existing) {
            existing.isCreating = true;
            existing.lastActivity = new Date();
            return true;
        }
        const clientInfo = {
            client: null,
            mobile,
            sessionString: '',
            createdAt: new Date(),
            lastActivity: new Date(),
            isCreating: true,
            lockId
        };
        this.clients.set(mobile, clientInfo);
        return true;
    }
    updateActivity(mobile) {
        const clientInfo = this.clients.get(mobile);
        if (clientInfo) {
            clientInfo.lastActivity = new Date();
        }
    }
    async removeClient(mobile, lockId) {
        const clientInfo = this.clients.get(mobile);
        if (!clientInfo) {
            return false;
        }
        if (lockId) {
            const lock = this.locks.get(mobile);
            if (!lock || lock.lockId !== lockId) {
                this.logger.logError(mobile, 'Invalid lock for removing client', new Error('Invalid lock'));
                return false;
            }
        }
        if (clientInfo.client) {
            try {
                let tempClient = clientInfo.client;
                if (tempClient) {
                    try {
                        await tempClient.destroy();
                        tempClient._eventBuilders = [];
                        this.logger.logOperation(mobile, 'Temporary client cleaned up');
                    }
                    catch (cleanupError) {
                        this.logger.logError(mobile, 'Failed to cleanup temporary client', cleanupError);
                    }
                    finally {
                        if (tempClient) {
                            tempClient._destroyed = true;
                            if (tempClient._sender && typeof tempClient._sender.disconnect === 'function') {
                                await tempClient._sender.disconnect();
                            }
                            tempClient = null;
                        }
                    }
                }
                this.logger.logOperation(mobile, 'Client disconnected during removal');
            }
            catch (error) {
                this.logger.logError(mobile, 'Error disconnecting client during removal', error);
            }
        }
        this.clients.delete(mobile);
        this.logger.logOperation(mobile, 'Client removed from registry');
        return true;
    }
    getActiveClientCount() {
        return this.clients.size;
    }
    getActivemobiles() {
        return Array.from(this.clients.keys());
    }
    async cleanupInactiveClients() {
        const now = new Date();
        const inactiveClients = [];
        for (const [mobile, clientInfo] of this.clients.entries()) {
            const inactiveTime = now.getTime() - clientInfo.lastActivity.getTime();
            if (inactiveTime > this.CLIENT_TIMEOUT) {
                inactiveClients.push(mobile);
            }
        }
        for (const mobile of inactiveClients) {
            this.logger.logOperation(mobile, 'Removing inactive client');
            await this.removeClient(mobile);
        }
        if (inactiveClients.length > 0) {
            this.logger.logOperation('SYSTEM', `Cleaned up ${inactiveClients.length} inactive clients`);
        }
    }
    cleanupExpiredLocks() {
        const now = new Date();
        const expiredLocks = [];
        for (const [mobile, lock] of this.locks.entries()) {
            const lockAge = now.getTime() - lock.acquired.getTime();
            if (lockAge > this.LOCK_EXPIRY) {
                expiredLocks.push(mobile);
            }
        }
        for (const mobile of expiredLocks) {
            this.locks.delete(mobile);
            this.logger.logOperation(mobile, 'Removed expired lock');
        }
        if (expiredLocks.length > 0) {
            this.logger.logOperation('SYSTEM', `Cleaned up ${expiredLocks.length} expired locks`);
        }
    }
    async forceCleanup(mobile) {
        let cleanedCount = 0;
        if (this.locks.has(mobile)) {
            this.locks.delete(mobile);
            cleanedCount++;
        }
        if (await this.removeClient(mobile)) {
            cleanedCount++;
        }
        this.logger.logOperation(mobile, `Force cleanup completed, removed ${cleanedCount} items`);
        return cleanedCount;
    }
    getStats() {
        return {
            activeClients: this.clients.size,
            activeLocks: this.locks.size,
            mobiles: Array.from(this.clients.keys())
        };
    }
};
exports.ClientRegistry = ClientRegistry;
ClientRegistry.instance = null;
exports.ClientRegistry = ClientRegistry = ClientRegistry_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ClientRegistry);
//# sourceMappingURL=client-registry.js.map