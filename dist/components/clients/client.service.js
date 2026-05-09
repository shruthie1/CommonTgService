"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const client_schema_1 = require("./schemas/client.schema");
const buffer_client_service_1 = require("../buffer-clients/buffer-client.service");
const Helpers_1 = require("telegram/Helpers");
const users_service_1 = require("../users/users.service");
const utils_1 = require("../../utils");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const path_1 = __importDefault(require("path"));
const fs = __importStar(require("fs"));
const tl_1 = require("telegram/tl");
const isPermanentError_1 = __importDefault(require("../../utils/isPermanentError"));
const Telegram_service_1 = require("../Telegram/Telegram.service");
const homoglyph_normalizer_1 = require("../../utils/homoglyph-normalizer");
const warmup_phases_1 = require("../shared/warmup-phases");
const client_helper_utils_1 = require("../shared/client-helper.utils");
const helpers_1 = require("../Telegram/manager/helpers");
const mobile_utils_1 = require("../shared/mobile-utils");
const CONFIG = {
    REFRESH_INTERVAL: 5 * 60 * 1000,
    CACHE_TTL: 10 * 60 * 1000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    CACHE_WARMUP_THRESHOLD: 20,
    COOLDOWN_PERIOD: 240000,
    UPDATE_CLIENT_COOLDOWN: 30000,
    MAP_CLEANUP_INTERVAL: 10 * 60 * 1000,
};
let ClientService = ClientService_1 = class ClientService {
    constructor(clientModel, telegramService, bufferClientService, usersService) {
        this.clientModel = clientModel;
        this.telegramService = telegramService;
        this.bufferClientService = bufferClientService;
        this.usersService = usersService;
        this.logger = new utils_1.Logger(ClientService_1.name);
        this.lastUpdateMap = new Map();
        this.setupCooldownMap = new Map();
        this.clientsMap = new Map();
        this.cacheMetadata = { lastUpdated: 0, isStale: true };
        this.checkInterval = null;
        this.refreshInterval = null;
        this.cleanupInterval = null;
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.refreshPromise = null;
    }
    async onModuleInit() {
        try {
            await this.refreshCacheFromDatabase();
            this.startPeriodicTasks();
            this.isInitialized = true;
        }
        catch (e) {
            (0, parseError_1.parseError)(e, 'Failed to initialize Client Service');
        }
    }
    async onModuleDestroy() {
        this.isShuttingDown = true;
        try {
            if (this.checkInterval)
                clearInterval(this.checkInterval);
            if (this.refreshInterval)
                clearInterval(this.refreshInterval);
            if (this.cleanupInterval)
                clearInterval(this.cleanupInterval);
            if (this.refreshPromise)
                await this.refreshPromise;
            await connection_manager_1.connectionManager.shutdown();
            this.clientsMap.clear();
            this.lastUpdateMap.clear();
            this.setupCooldownMap.clear();
        }
        catch (e) {
            (0, parseError_1.parseError)(e, 'Error during Client Service shutdown');
        }
    }
    startPeriodicTasks() {
        this.checkInterval = setInterval(async () => {
            if (this.isShuttingDown)
                return;
            await this.performPeriodicRefresh();
        }, CONFIG.REFRESH_INTERVAL);
        this.checkInterval.unref();
        this.refreshInterval = setInterval(() => {
            if (this.isShuttingDown)
                return;
            this.updateCacheMetadata();
        }, 60000);
        this.refreshInterval.unref();
        this.cleanupInterval = setInterval(() => {
            if (this.isShuttingDown)
                return;
            this.purgeExpiredCooldowns();
        }, CONFIG.MAP_CLEANUP_INTERVAL);
        this.cleanupInterval.unref();
    }
    purgeExpiredCooldowns() {
        const now = Date.now();
        for (const [clientId, timestamp] of this.setupCooldownMap) {
            if (now > timestamp + CONFIG.COOLDOWN_PERIOD) {
                this.setupCooldownMap.delete(clientId);
            }
        }
        for (const [clientId, timestamp] of this.lastUpdateMap) {
            if (now - timestamp > CONFIG.UPDATE_CLIENT_COOLDOWN) {
                this.lastUpdateMap.delete(clientId);
            }
        }
    }
    async performPeriodicRefresh() {
        if (this.refreshPromise) {
            this.logger.debug('Refresh already in progress, skipping...');
            return;
        }
        this.refreshPromise = this.refreshCacheFromDatabase();
        try {
            await this.refreshPromise;
        }
        finally {
            this.refreshPromise = null;
        }
    }
    updateCacheMetadata() {
        this.cacheMetadata.isStale = Date.now() - this.cacheMetadata.lastUpdated > CONFIG.CACHE_TTL;
    }
    async refreshCacheFromDatabase() {
        try {
            const documents = await this.executeWithRetry(() => this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec());
            const newClientsMap = new Map();
            documents.forEach((client) => newClientsMap.set(client.clientId, client));
            this.clientsMap = newClientsMap;
            this.cacheMetadata = { lastUpdated: Date.now(), isStale: false };
        }
        catch (e) {
            (0, parseError_1.parseError)(e, 'Failed to refresh clients cache from database', true);
        }
    }
    async create(createClientDto) {
        const createData = {
            ...createClientDto,
            mobile: this.canonicalMobile(createClientDto.mobile),
        };
        try {
            const createdClient = await this.executeWithRetry(() => {
                const client = new this.clientModel(createData);
                return client.save();
            });
            this.clientsMap.set(createdClient.clientId, createdClient.toObject());
            this.logger.log(`Client created: ${createdClient.clientId}`);
            return createdClient;
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Failed to create client | mobile: ${createData.mobile}`);
            throw new common_1.BadRequestException(errorDetails.message);
        }
    }
    async findAll() {
        this.ensureInitialized();
        if (this.clientsMap.size >= CONFIG.CACHE_WARMUP_THRESHOLD &&
            !this.cacheMetadata.isStale) {
            this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
            return Array.from(this.clientsMap.values());
        }
        await this.refreshCacheFromDatabase();
        return Array.from(this.clientsMap.values());
    }
    async findAllMasked() {
        const clients = await this.findAll();
        return clients.map(({ session, mobile, password, ...maskedClient }) => maskedClient);
    }
    async findOneMasked(clientId) {
        const client = await this.findOne(clientId, true);
        const { session, mobile, password, ...maskedClient } = client;
        return maskedClient;
    }
    async findAllObject() {
        const clients = await this.findAll();
        return clients.reduce((acc, client) => {
            acc[client.clientId] = client;
            return acc;
        }, {});
    }
    async findAllMaskedObject(query) {
        const filteredClients = query ? await this.search(query) : await this.findAll();
        return filteredClients.reduce((acc, client) => {
            const { session, mobile, password, ...maskedClient } = client;
            acc[client.clientId] = { clientId: client.clientId, ...maskedClient };
            return acc;
        }, {});
    }
    async refreshMap() {
        this.logger.log('Manual cache refresh requested');
        await this.refreshCacheFromDatabase();
    }
    async findOne(clientId, throwErr = true) {
        this.ensureInitialized();
        const cachedClient = this.clientsMap.get(clientId);
        if (cachedClient)
            return cachedClient;
        const client = await this.executeWithRetry(() => this.clientModel.findOne({ clientId }, { _id: 0, updatedAt: 0 }).lean().exec());
        if (!client && throwErr) {
            throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
        }
        if (client)
            this.clientsMap.set(clientId, client);
        return client;
    }
    async update(clientId, updateClientDto) {
        this.ensureInitialized();
        try {
            const cleanUpdateDto = this.cleanUpdateObject(updateClientDto);
            if (cleanUpdateDto.mobile !== undefined) {
                cleanUpdateDto.mobile = this.canonicalMobile(cleanUpdateDto.mobile);
            }
            await this.notifyClientUpdate(clientId);
            const updatedClient = await this.executeWithRetry(() => this.clientModel
                .findOneAndUpdate({ clientId }, { $set: cleanUpdateDto }, { new: true, runValidators: true })
                .lean()
                .exec());
            if (!updatedClient) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            this.clientsMap.set(clientId, updatedClient);
            this.performPostUpdateTasks(updatedClient);
            this.logger.log(`Client updated: ${clientId}`);
            return updatedClient;
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Failed to update client ${clientId} | mobile: ${updateClientDto.mobile || 'N/A'}`);
            throw new common_1.BadRequestException(errorDetails.message);
        }
    }
    async remove(clientId) {
        this.ensureInitialized();
        try {
            const deletedClient = await this.executeWithRetry(() => this.clientModel.findOneAndDelete({ clientId }).lean().exec());
            if (!deletedClient) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            this.clientsMap.delete(clientId);
            this.logger.log(`Client removed: ${clientId}`);
            return deletedClient;
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Failed to remove client ${clientId}`);
            throw new common_1.InternalServerErrorException(errorDetails.message);
        }
        ;
    }
    async search(filter) {
        try {
            const workingFilter = this.processTextSearchFields({ ...filter });
            return this.executeWithRetry(() => this.clientModel.find(workingFilter).lean().exec());
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Failed to search clients with filter ${JSON.stringify(filter)}`);
            throw new common_1.InternalServerErrorException(errorDetails.message);
        }
    }
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Service not initialized. Please wait for initialization to complete.');
        }
    }
    cleanUpdateObject(updateDto) {
        const cleaned = { ...updateDto };
        delete cleaned._id;
        return cleaned;
    }
    canonicalMobile(mobile) {
        try {
            return (0, mobile_utils_1.canonicalizeMobile)(mobile);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new common_1.BadRequestException(message);
        }
    }
    async notifyClientUpdate(clientId) {
        await this.notify(`Client Update\n\nClient: ${clientId}\nStatus: Updating existing client`);
    }
    async notify(message) {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(message)}`, {
                timeout: 5000,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn('Failed to send notification', errorMessage);
        }
    }
    performPostUpdateTasks(updatedClient) {
        setImmediate(async () => {
            try {
                await this.refreshExternalMaps();
            }
            catch (error) {
                (0, parseError_1.parseError)(error, 'Failed to refresh external maps after client update');
            }
        });
    }
    async refreshExternalMaps() {
        await Promise.allSettled([
            (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`, { timeout: 5000 }),
            (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimebot}/refreshmap`, { timeout: 5000 }),
        ]);
        this.logger.debug('External maps refreshed');
    }
    processTextSearchFields(filter) {
        const nextFilter = { ...filter };
        if (typeof nextFilter.mobile === 'string' && nextFilter.mobile) {
            nextFilter.mobile = this.canonicalMobile(nextFilter.mobile);
        }
        const textFields = ['name', 'clientId', 'username'];
        textFields.forEach((field) => {
            const value = nextFilter[field];
            if (typeof value === 'string' && value) {
                nextFilter[field] = { $regex: new RegExp(this.escapeRegex(value), 'i') };
            }
        });
        return nextFilter;
    }
    escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    async executeWithRetry(operation, retries = CONFIG.MAX_RETRIES) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, errorMessage);
                if (attempt === retries)
                    throw error;
                const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }
        throw new Error('All retry attempts failed');
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    getServiceStatus() {
        return {
            isInitialized: this.isInitialized,
            cacheSize: this.clientsMap.size,
            lastCacheUpdate: new Date(this.cacheMetadata.lastUpdated),
            isCacheStale: this.cacheMetadata.isStale,
            isShuttingDown: this.isShuttingDown,
        };
    }
    async getCacheStatistics() {
        const totalClients = await this.clientModel.countDocuments().exec();
        return {
            totalClients,
            cacheHitRate: this.clientsMap.size > 0 ? (this.clientsMap.size / totalClients) * 100 : 0,
            lastRefresh: new Date(this.cacheMetadata.lastUpdated),
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
        };
    }
    async setupClient(clientId, setupClientQueryDto) {
        this.logger.log(`Received New Client Request for - ${clientId}`);
        if (!(0, utils_1.toBoolean)(process.env.AUTO_CLIENT_SETUP)) {
            this.logger.log('Auto client setup disabled');
            return;
        }
        if (!this.canSetupClient(clientId)) {
            this.logger.log(`Profile Setup Recently tried for ${clientId}, wait ::`, (0, utils_1.getReadableTimeDifference)(this.setupCooldownMap.get(clientId)));
            return;
        }
        await this.handleSetupClient(clientId, setupClientQueryDto);
    }
    canSetupClient(clientId) {
        const lastSetup = this.setupCooldownMap.get(clientId) || 0;
        return Date.now() > lastSetup + CONFIG.COOLDOWN_PERIOD;
    }
    async handleSetupClient(clientId, setupClientQueryDto) {
        this.setupCooldownMap.set(clientId, Date.now());
        const existingClient = await this.findOne(clientId);
        if (!existingClient) {
            this.logger.error(`Client not found: ${clientId}`);
            return;
        }
        const existingClientMobile = existingClient.mobile;
        this.logger.log('setupClientQueryDto:', setupClientQueryDto);
        const today = client_helper_utils_1.ClientHelperUtils.getTodayDateString();
        const query = {
            clientId,
            mobile: { $ne: existingClientMobile },
            createdAt: { $lte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
            availableDate: { $lte: today },
            channels: { $gt: 200 },
            status: 'active',
            inUse: { $ne: true },
            warmupPhase: warmup_phases_1.WarmupPhase.SESSION_ROTATED,
        };
        const candidateBufferClients = await this.bufferClientService.executeQuery(query, { availableDate: 1, createdAt: 1 }, 10);
        this.logger.info(`[${clientId}] Setup candidate scan completed`, { existingMobile: existingClientMobile, candidateCount: candidateBufferClients.length, query });
        const newBufferClient = await this.findSafeSetupBufferCandidate(candidateBufferClients, existingClient.session);
        if (!newBufferClient) {
            await this.notify(`Buffer Not Available\n\nClient: ${clientId}\nStatus: No safe buffer clients available for swap`);
            this.logger.log('Buffer Clients not safely available');
            return;
        }
        try {
            this.logger.info(`[${clientId}] Selected replacement buffer client`, { existingMobile: existingClientMobile, newMobile: newBufferClient.mobile });
            await this.notify(`Client Swap Started\n\nClient: ${clientId}\nOld Mobile: ${existingClient.mobile}\nOld Username: @${existingClient.username}\nNew Mobile: ${newBufferClient.mobile}`);
            this.telegramService.setActiveClientSetup({
                ...setupClientQueryDto,
                clientId,
                existingMobile: existingClientMobile,
                newMobile: newBufferClient.mobile,
            });
            this.logger.debug(`[${clientId}] Active client setup registered`, {
                existingMobile: existingClientMobile,
                newMobile: newBufferClient.mobile,
                archiveOld: setupClientQueryDto.archiveOld,
                formalities: setupClientQueryDto.formalities,
            });
            await connection_manager_1.connectionManager.getClient(newBufferClient.mobile);
            await this.updateClientSession(newBufferClient.session, newBufferClient.mobile);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.notify(`Client Swap Failed\n\nClient: ${clientId}\nOld Mobile: ${existingClient.mobile}\nNew Mobile: ${newBufferClient.mobile}\nError: ${errorMessage.substring(0, 200)}`);
            const errorDetails = (0, parseError_1.parseError)(error, `setupClient failed for ${newBufferClient.mobile}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.bufferClientService.markAsInactive(newBufferClient.mobile, `Setup failed permanently: ${errorDetails.message}`);
                await this.notify(`Buffer Marked Inactive\n\nMobile: ${newBufferClient.mobile}\nClient: ${clientId}\nReason: Permanent error during setup`);
            }
            else {
                const availableDate = client_helper_utils_1.ClientHelperUtils.toDateString(Date.now() + 3 * 24 * 60 * 60 * 1000);
                await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
            }
            this.telegramService.clearActiveClientSetup(newBufferClient.mobile);
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(newBufferClient.mobile);
        }
    }
    async updateClientSession(newSession, setupMobile) {
        const setup = this.telegramService.getActiveClientSetup(setupMobile);
        if (!setup) {
            const scope = setupMobile ? ` for ${setupMobile}` : '';
            throw new common_1.BadRequestException(`No active client setup found${scope}`);
        }
        const { archiveOld, clientId, existingMobile, formalities, newMobile, reason } = setup;
        const days = setup.days ?? 0;
        this.logger.info(`[${clientId}] Starting client session cutover`, {
            existingMobile,
            newMobile,
            archiveOld,
            formalities,
            days,
            setupMobile: setupMobile || newMobile,
        });
        await (0, Helpers_1.sleep)(2000);
        const existingClient = await this.findOne(clientId);
        if (!existingClient)
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        let newTelegramClient;
        let cutoverCommitted = false;
        try {
            newTelegramClient = await connection_manager_1.connectionManager.getClient(newMobile, {
                handler: true,
                autoDisconnect: false,
            });
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Failed to get Telegram client for NewMobile: ${newMobile}`, true);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.bufferClientService.markAsInactive(newMobile, errorDetails.message);
            }
            throw error;
        }
        if (!newTelegramClient)
            throw new Error(`Failed to get Telegram client for NewMobile: ${newMobile}`);
        try {
            const me = await newTelegramClient.getMe();
            const bufferDoc = await this.bufferClientService.findOne(newMobile);
            this.logger.debug(`[${clientId}] Loaded buffer persona assignment for cutover`, {
                newMobile,
                hasAssignedFirstName: !!bufferDoc?.assignedFirstName,
                assignedPhotoCount: bufferDoc?.assignedProfilePics?.length || 0,
            });
            const updatedUsername = bufferDoc?.username || me.username;
            this.logger.info(`[${clientId}] Using pre-set buffer username: @${updatedUsername} (current TG: @${me.username})`);
            await this.notify(`Cutover Username\n\nClient: ${clientId}\nNew Mobile: ${newMobile}\nUsername: @${updatedUsername}`);
            if (!newSession?.trim()) {
                throw new common_1.BadRequestException(`Invalid replacement session for ${newMobile}`);
            }
            const mirroredActiveName = this.buildMirroredActiveName(bufferDoc, existingClient.name);
            await this.update(clientId, {
                mobile: newMobile,
                username: updatedUsername,
                session: newSession,
                name: mirroredActiveName,
            });
            cutoverCommitted = true;
            this.logger.info(`[${clientId}] Cutover committed`, {
                existingMobile,
                newMobile,
                updatedUsername,
                mirroredActiveName,
            });
            try {
                await this.bufferClientService.setPrimaryInUse(clientId, newMobile);
                this.logger.debug(`[${clientId}] Marked replacement buffer doc as the sole active/in-use primary`, { newMobile });
            }
            catch (bufferUpdateError) {
                (0, parseError_1.parseError)(bufferUpdateError, `[${clientId}] Failed to mark ${newMobile} as in-use after cutover`);
                this.logger.error(`[${clientId}] Failed to stamp replacement buffer usage after cutover`, { newMobile }, bufferUpdateError instanceof Error ? bufferUpdateError.stack : undefined);
            }
            this.logger.debug(`[${clientId}] Skipping delayed profile refresh — tg-aut handles on startup`);
            try {
                if (existingClient.deployKey) {
                    this.logger.info(`[${clientId}] Triggering deploy restart after cutover`, { deployKeyPresent: true });
                    await (0, fetchWithTimeout_1.fetchWithTimeout)(existingClient.deployKey, {}, 1);
                    this.logger.debug(`[${clientId}] Deploy restart request completed`, { newMobile });
                }
            }
            catch (deployError) {
                const deployMessage = deployError instanceof Error ? deployError.message : String(deployError);
                (0, parseError_1.parseError)(deployError, `[${clientId}] deployKey restart failed after cutover`);
                await this.notify(`Deploy Restart Failed\n\nClient: ${clientId}\nNew Mobile: ${newMobile}\nStatus: Cutover completed but deploy restart failed\nError: ${deployMessage?.substring(0, 200)}`);
            }
            this.logger.info(`[${clientId}] Starting old-client archival handling`, {
                existingMobile,
                archiveOld,
                formalities,
                days,
            });
            await this.handleClientArchival(existingClient, existingMobile, formalities, archiveOld, days, reason);
            this.logger.info(`[${clientId}] Client session cutover finished`, { existingMobile, newMobile });
            await this.notify(`Client Swap Complete\n\nClient: ${clientId}\nOld Mobile: ${existingMobile}\nNew Mobile: ${newMobile}\nStatus: Cutover finished successfully`);
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `[New: ${newMobile}] Error in updating client session`, true);
            if (!cutoverCommitted && (0, isPermanentError_1.default)(errorDetails)) {
                try {
                    await this.bufferClientService.markAsInactive(newMobile, `Session update failed: ${errorDetails.message}`);
                }
                catch { }
            }
            this.logger.error(`[${clientId}] Client session cutover failed`, { existingMobile, newMobile, cutoverCommitted, error: errorDetails.message }, error instanceof Error ? error.stack : undefined);
            throw error;
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(newMobile);
            this.telegramService.clearActiveClientSetup(newMobile);
            this.logger.debug(`[${clientId}] Cleared active setup state`, { newMobile });
        }
    }
    async handleClientArchival(existingClient, existingMobile, formalities, archiveOld, days, reason) {
        try {
            if (this.isPermanentArchivalReason(reason)) {
                this.logger.warn(`[${existingClient.clientId}] Permanent archival reason received; marking old buffer inactive`, {
                    existingMobile,
                    reason,
                    archiveOld,
                    formalities,
                });
                await this.markBufferInactiveForArchival(existingMobile, reason);
                return;
            }
            const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
            if (!existingClientUser) {
                const reasonMessage = `Archival failed: user document missing for old mobile ${existingMobile}`;
                this.logger.warn(reasonMessage);
                await this.markBufferInactiveForArchival(existingMobile, reasonMessage);
                await this.notify(`Archival User Missing\n\nOld Mobile: ${existingMobile}\nStatus: Buffer marked inactive`);
                return;
            }
            if (formalities) {
                await this.handleFormalities(existingMobile);
            }
            else {
                this.logger.log('Formalities skipped');
            }
            if (archiveOld) {
                await this.archiveOldClient(existingClient, existingClientUser, existingMobile, days);
            }
            else {
                await this.bufferClientService.update(existingMobile, {
                    inUse: false,
                    lastUsed: new Date(),
                    status: 'inactive',
                    message: reason || 'Deactivated during client swap (archival skipped)',
                });
                this.logger.log('Client Archive Skipped');
                await this.notify(`Archival Skipped\n\nOld Mobile: ${existingMobile}\nStatus: Old client marked inactive without archival`);
            }
        }
        catch (e) {
            const errorDetails = (0, parseError_1.parseError)(e, `Error in Archiving Old Client: ${existingMobile}`, false);
            const errorMessage = e instanceof Error ? e.message : String(e);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markBufferInactiveForArchival(existingMobile, errorMessage);
            }
            await this.notify(`Archival Failed\n\nOld Mobile: ${existingMobile}\nError: ${errorMessage?.substring(0, 200)}`);
        }
    }
    isPermanentArchivalReason(reason) {
        return !!reason && (0, isPermanentError_1.default)({ message: reason });
    }
    async markBufferInactiveForArchival(mobile, reason) {
        try {
            const updated = await this.bufferClientService.updateStatus(mobile, 'inactive', reason);
            this.logger.warn(`Archived buffer client marked inactive`, {
                mobile,
                status: updated?.status,
                message: updated?.message,
            });
            await this.notify(`Buffer Marked Inactive\n\nMobile: ${mobile}\nReason: ${reason.substring(0, 200)}`);
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Failed to mark archived buffer inactive: ${mobile}`, false);
            this.logger.error(`Failed to mark archived buffer inactive for ${mobile}: ${errorDetails.message}`);
            await this.notify(`Buffer Inactive Update Failed\n\nMobile: ${mobile}\nReason: ${reason.substring(0, 160)}\nError: ${errorDetails.message.substring(0, 200)}`);
        }
    }
    async handleFormalities(mobile) {
        try {
            await this.telegramService.updatePrivacyforDeletedAccount(mobile);
            this.logger.log('Formalities finished');
            await this.notify(`Formalities Complete\n\nMobile: ${mobile}\nStatus: Privacy updated for old account`);
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
    }
    async archiveOldClient(existingClient, existingClientUser, existingMobile, days) {
        try {
            await this.assertDistinctUserBackupSession(existingMobile, existingClient.session);
            const availableDate = client_helper_utils_1.ClientHelperUtils.toDateString(Date.now() + (days + 1) * 24 * 60 * 60 * 1000);
            const bufferClientDto = {
                clientId: existingClient.clientId,
                mobile: existingMobile,
                availableDate,
                session: existingClient.session,
                tgId: existingClientUser.tgId,
                channels: 170,
                status: days > 35 ? 'inactive' : 'active',
                inUse: false,
                warmupPhase: warmup_phases_1.WarmupPhase.SESSION_ROTATED,
                sessionRotatedAt: new Date(),
            };
            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingMobile, bufferClientDto);
            this.logger.log('client Archived:', updatedBufferClient);
            await this.notify(`Client Archived\n\nOld Mobile: ${existingMobile}\nNew Available Date: ${availableDate}\nStatus: Returned to buffer pool`);
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Error in Archiving Old Client: ${existingMobile}`, true);
            await this.notify(`Archival Error\n\nOld Mobile: ${existingMobile}\nError: ${errorDetails.message?.substring(0, 200)}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                this.logger.log('Marking archived buffer inactive:', existingMobile);
                await this.markBufferInactiveForArchival(existingMobile, errorDetails.message);
            }
            else {
                this.logger.log('Not Deleting user');
            }
        }
    }
    async findSafeSetupBufferCandidate(candidates, existingClientSession) {
        for (const candidate of candidates) {
            if (!candidate?.mobile || !candidate?.session)
                continue;
            if (candidate.session === existingClientSession) {
                this.logger.warn(`Skipping setup candidate ${candidate.mobile}: session matches current main client`);
                continue;
            }
            try {
                const backupUser = await this.assertDistinctUserBackupSession(candidate.mobile, candidate.session);
                if (!backupUser.session?.trim() || backupUser.session.trim() === candidate.session.trim()) {
                    this.logger.warn(`Skipping setup candidate ${candidate.mobile}: backup session is still duplicated`);
                    continue;
                }
                return { mobile: candidate.mobile, session: candidate.session, backupUser };
            }
            catch (error) {
                this.logger.warn(`Skipping setup candidate ${candidate.mobile}: failed to ensure distinct backup session`);
                continue;
            }
        }
        return null;
    }
    async assertDistinctUserBackupSession(mobile, activeSession) {
        let user;
        try {
            user = await this.bufferClientService.getOrEnsureDistinctUsersBackupSession(mobile, activeSession);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            throw error;
        }
        if (!user) {
            throw new common_1.BadRequestException(`Failed to create distinct backup session for ${mobile}`);
        }
        if (user.session?.trim() && user.session.trim() !== activeSession.trim()) {
            return user;
        }
        throw new common_1.BadRequestException(`Distinct backup session was not persisted for ${mobile}`);
    }
    async updateClient(clientId, message = '', skipDeploy = false, throwOnFailure = false, skipUsername = false) {
        this.logger.log(`Updating Client: ${clientId} - ${message}`);
        if (!this.canUpdateClient(clientId))
            return false;
        const client = await this.findOne(clientId);
        if (!client) {
            const notFoundError = new common_1.NotFoundException(`Client not found: ${clientId}`);
            this.logger.error(notFoundError.message);
            if (throwOnFailure)
                throw notFoundError;
            return false;
        }
        try {
            this.lastUpdateMap.set(clientId, Date.now());
            const telegramClient = await connection_manager_1.connectionManager.getClient(client.mobile, { handler: false });
            if (!telegramClient)
                throw new Error(`Unable to fetch Telegram client for ${client.mobile}`);
            await (0, Helpers_1.sleep)(2000);
            const me = await telegramClient.getMe();
            if (!me)
                throw new Error(`Unable to fetch 'me' for ${clientId}`);
            const activeAssignment = await this.getActiveClientAssignment(client);
            const mirroredActiveName = this.buildMirroredActiveName(activeAssignment, '');
            if (mirroredActiveName && client.name !== mirroredActiveName) {
                await this.update(clientId, { name: mirroredActiveName });
                client.name = mirroredActiveName;
                this.logger.debug(`[${clientId}] Mirrored active buffer name onto client document`, {
                    mirroredActiveName,
                });
            }
            if (!skipUsername) {
                await this.updateClientUsername(client, me, activeAssignment);
            }
            else {
                this.logger.debug(`[${clientId}] Skipping username update — already set from buffer`);
            }
            const nameBioReady = await this.updateClientIdentity(client, telegramClient, me, activeAssignment);
            const privacyReady = await this.updateClientPrivacy(client, telegramClient);
            const photosReady = await this.updateClientPhotos(client, telegramClient, activeAssignment);
            await this.stampActiveBufferLifecycle(client.mobile, {
                ...(nameBioReady ? { nameBioUpdatedAt: new Date() } : {}),
                ...(privacyReady ? { privacyUpdatedAt: new Date() } : {}),
                ...(photosReady ? { profilePicsUpdatedAt: new Date() } : {}),
            });
            await this.notify(`Client Updated\n\nClient: ${clientId}\nMobile: ${client.mobile}\nTrigger: ${message}`);
            if (!skipDeploy && client.deployKey)
                await (0, fetchWithTimeout_1.fetchWithTimeout)(client.deployKey);
            return true;
        }
        catch (error) {
            this.lastUpdateMap.delete(clientId);
            const errorDetails = (0, parseError_1.parseError)(error, `[${clientId}] [${client.mobile}] updateClient failed`);
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.notify(`Client Update Failed\n\nClient: ${clientId}\nMobile: ${client.mobile}\nTrigger: ${message}\nError: ${errorMessage?.substring(0, 200)}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                this.logger.warn(`Permanent error while updating active client ${clientId}; manual review required for ${client.mobile}`);
            }
            if (throwOnFailure)
                throw error;
            return false;
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(client.mobile);
        }
    }
    canUpdateClient(clientId) {
        const lastUpdate = this.lastUpdateMap.get(clientId) || 0;
        if (Date.now() - lastUpdate < CONFIG.UPDATE_CLIENT_COOLDOWN) {
            const waitTime = Math.ceil((CONFIG.UPDATE_CLIENT_COOLDOWN - (Date.now() - lastUpdate)) / 1000);
            this.logger.log(`Skipping update for ${clientId} - cooldown not elapsed. Try again in ${waitTime} seconds`);
            return false;
        }
        return true;
    }
    buildMirroredActiveName(assignment, fallback) {
        const mirroredName = [
            assignment?.assignedFirstName?.trim(),
            assignment?.assignedLastName?.trim(),
        ]
            .filter((part) => !!part)
            .join(' ')
            .trim();
        return mirroredName || fallback;
    }
    getExpectedClientName(client, activeAssignment) {
        return this.buildMirroredActiveName(activeAssignment, client.name);
    }
    async stampActiveBufferLifecycle(mobile, update) {
        if (!mobile || Object.keys(update).length === 0) {
            return;
        }
        try {
            await this.bufferClientService.update(mobile, update);
            this.logger.debug(`Stamped active buffer lifecycle state for ${mobile}`, update);
        }
        catch (error) {
            this.logger.warn(`Failed to stamp active buffer lifecycle state for ${mobile}`);
            (0, parseError_1.parseError)(error, `[${mobile}] Failed to stamp active buffer lifecycle state`);
        }
    }
    async updateClientUsername(client, me, activeAssignment) {
        if (client.username && me.username === client.username) {
            this.logger.debug(`[${client.clientId}] Username @${me.username} matches stored value, skipping update`);
            return;
        }
        const updatedUsername = await this.telegramService.updateUsernameForAClient(client.mobile, client.clientId, this.getExpectedClientName(client, activeAssignment), me.username);
        if (updatedUsername) {
            await this.update(client.clientId, { username: updatedUsername });
            this.logger.log(`[${client.clientId}] Username updated to: ${updatedUsername}`);
            await (0, Helpers_1.sleep)(10000);
        }
        else {
            this.logger.warn(`[${client.clientId}] Failed to update username`);
        }
    }
    async updateClientIdentity(client, tgManager, me, activeAssignment) {
        const hasIdentityAssignment = !!(activeAssignment?.assignedFirstName?.trim() ||
            activeAssignment?.assignedLastName?.trim() ||
            activeAssignment?.assignedBio != null);
        if (!hasIdentityAssignment) {
            this.logger.debug(`[${client.clientId}] Skipping active identity update: no active buffer assignment present`);
            return false;
        }
        const expectedFirstName = activeAssignment?.assignedFirstName?.trim() || '';
        const expectedLastName = activeAssignment?.assignedLastName?.trim() || '';
        const expectedBio = activeAssignment?.assignedBio ?? null;
        const fullUser = await tgManager.client.invoke(new tl_1.Api.users.GetFullUser({ id: new tl_1.Api.InputUserSelf() }));
        const currentLastName = fullUser?.users?.[0]?.lastName || '';
        const currentBio = fullUser?.fullUser?.about || null;
        const firstNameWrong = !!expectedFirstName && !(0, homoglyph_normalizer_1.nameMatchesAssignment)(me?.firstName || '', expectedFirstName);
        const lastNameWrong = activeAssignment?.assignedLastName != null && !(0, homoglyph_normalizer_1.lastNameMatches)(currentLastName, expectedLastName);
        const bioWrong = expectedBio != null && !(0, homoglyph_normalizer_1.bioMatches)(currentBio, expectedBio);
        if (firstNameWrong || lastNameWrong || bioWrong) {
            const expectedDisplayName = [expectedFirstName, expectedLastName].filter(Boolean).join(' ');
            this.logger.log(`[${client.clientId}] Active identity mismatch. Actual: ${[me.firstName, currentLastName].filter(Boolean).join(' ')}, Expected: ${expectedDisplayName || '(none)'}, BioExpected: ${expectedBio ?? '(skip)'}`);
            await tgManager.client.invoke(new tl_1.Api.account.UpdateProfile({
                ...(expectedFirstName ? { firstName: expectedFirstName } : {}),
                ...(activeAssignment?.assignedLastName != null ? { lastName: expectedLastName } : {}),
                ...(expectedBio != null ? { about: expectedBio } : {}),
            }));
            await (0, Helpers_1.sleep)(5000);
        }
        else {
            this.logger.log(`[${client.clientId}] Active identity already correct`);
        }
        return true;
    }
    async updateClientPrivacy(client, tgManager) {
        await tgManager.updatePrivacy();
        this.logger.log(`[${client.clientId}] Privacy settings updated`);
        await (0, Helpers_1.sleep)(5000);
        return true;
    }
    async updateClientPhotos(client, telegramClient, activeAssignment) {
        const photos = await telegramClient.client.invoke(new tl_1.Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
        const photoCount = photos?.photos?.length || 0;
        const profilePicUrls = (activeAssignment?.assignedProfilePics || [])
            .filter((url) => typeof url === 'string' && url.trim().length > 0)
            .slice(0, 3);
        const canManagePhotos = profilePicUrls.length >= 2;
        if (!canManagePhotos) {
            this.logger.warn(`[${client.clientId}] Skipping profile photo update: active buffer assignment does not have at least 2 profile pic URLs`);
            return false;
        }
        if (photoCount < 2) {
            this.logger.warn(`[${client.clientId}] No profile photos found. Uploading new ones...`);
            if (photoCount > 0)
                await telegramClient.deleteProfilePhotos();
            await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
            for (let index = 0; index < profilePicUrls.length; index++) {
                const url = profilePicUrls[index];
                const tempPath = path_1.default.join('/tmp', `client-profile-${client.clientId}-${Date.now()}-${index}.jpg`);
                try {
                    const buffer = await (0, helpers_1.downloadFileFromUrl)(url);
                    fs.writeFileSync(tempPath, buffer);
                    await telegramClient.updateProfilePic(tempPath);
                    this.logger.debug(`[${client.clientId}] Uploaded profile photo from URL`, { url });
                    await (0, Helpers_1.sleep)(20000 + Math.random() * 15000);
                }
                finally {
                    if (fs.existsSync(tempPath))
                        fs.unlinkSync(tempPath);
                }
            }
        }
        else {
            this.logger.log(`[${client.clientId}] Profile photos already exist (${photoCount})`);
        }
        return true;
    }
    async updateClients() {
        const clients = await this.findAll();
        for (const client of clients) {
            await this.updateClient(client.clientId, `Force Updating Client: ${client.clientId}`);
        }
    }
    async executeQuery(query, sort, limit, skip) {
        if (!query)
            throw new common_1.BadRequestException('Query is invalid.');
        const queryExec = this.clientModel.find(query);
        if (sort)
            queryExec.sort(sort);
        if (limit)
            queryExec.limit(limit);
        if (skip)
            queryExec.skip(skip);
        return queryExec.exec();
    }
    async getPersonaPool(clientId) {
        const client = await this.findOne(clientId, false);
        if (!client)
            return null;
        return {
            firstNames: client.firstNames || [],
            bufferLastNames: client.bufferLastNames || [],
            promoteLastNames: client.promoteLastNames || [],
            bios: client.bios || [],
            profilePics: client.profilePics || [],
            dbcoll: (client.dbcoll || '').toLowerCase(),
        };
    }
    buildPersonaAssignmentFilter(clientId) {
        return {
            clientId,
            status: 'active',
            $or: [
                { assignedFirstName: { $ne: null } },
                { assignedLastName: { $ne: null } },
                { assignedBio: { $ne: null } },
                { 'assignedProfilePics.0': { $exists: true } },
            ],
        };
    }
    hasPersonaAssignment(doc) {
        return !!doc && !!(doc.assignedFirstName ||
            doc.assignedLastName ||
            doc.assignedBio ||
            doc.assignedProfilePics?.length);
    }
    async getActiveClientAssignment(client) {
        if (!client?.clientId || !client.mobile) {
            return null;
        }
        let bufferDoc = null;
        try {
            bufferDoc = await this.bufferClientService.model
                .findOne({ clientId: client.clientId, mobile: client.mobile }, {
                mobile: 1,
                assignedFirstName: 1,
                assignedLastName: 1,
                assignedBio: 1,
                assignedProfilePics: 1,
            })
                .lean();
        }
        catch (error) {
            this.logger.warn(`[${client.clientId}] Failed to load active buffer assignment for ${client.mobile}`);
            return null;
        }
        if (!this.hasPersonaAssignment(bufferDoc)) {
            return null;
        }
        return {
            mobile: bufferDoc?.mobile || '',
            assignedFirstName: bufferDoc?.assignedFirstName || null,
            assignedLastName: bufferDoc?.assignedLastName || null,
            assignedBio: bufferDoc?.assignedBio || null,
            assignedProfilePics: bufferDoc?.assignedProfilePics || [],
            source: 'activeClient',
        };
    }
    async getExistingAssignments(clientId, scope) {
        const assignments = [];
        const projection = {
            mobile: 1, assignedFirstName: 1, assignedLastName: 1,
            assignedBio: 1, assignedProfilePics: 1,
        };
        const filter = this.buildPersonaAssignmentFilter(clientId);
        if (scope === 'all' || scope === 'buffer') {
            const buffers = await this.bufferClientService.model
                .find(filter, projection).lean();
            assignments.push(...buffers.map(b => ({
                mobile: b.mobile,
                assignedFirstName: b.assignedFirstName,
                assignedLastName: b.assignedLastName || null,
                assignedBio: b.assignedBio || null,
                assignedProfilePics: b.assignedProfilePics || [],
                source: 'buffer',
            })));
        }
        if (scope === 'all' || scope === 'activeClient') {
            const client = await this.findOne(clientId, false);
            const activeClientAssignment = await this.getActiveClientAssignment(client);
            const alreadyIncluded = activeClientAssignment
                ? assignments.some((assignment) => assignment.mobile === activeClientAssignment.mobile)
                : false;
            if (activeClientAssignment && !alreadyIncluded) {
                assignments.push(activeClientAssignment);
            }
        }
        this.logger.debug(`[${clientId}] Existing persona assignments fetched`, {
            scope,
            assignmentCount: assignments.length,
            sources: assignments.map((assignment) => assignment.source),
        });
        return { assignments };
    }
};
exports.ClientService = ClientService;
exports.ClientService = ClientService = ClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(client_schema_1.Client.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        buffer_client_service_1.BufferClientService,
        users_service_1.UsersService])
], ClientService);
//# sourceMappingURL=client.service.js.map