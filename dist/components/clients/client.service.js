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
const cloudinary_1 = require("../../cloudinary");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const promote_client_schema_1 = require("../promote-clients/schemas/promote-client.schema");
const path_1 = __importDefault(require("path"));
const tl_1 = require("telegram/tl");
const isPermanentError_1 = __importDefault(require("../../utils/isPermanentError"));
const Telegram_service_1 = require("../Telegram/Telegram.service");
const CONFIG = {
    REFRESH_INTERVAL: 5 * 60 * 1000,
    CACHE_TTL: 10 * 60 * 1000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    CACHE_WARMUP_THRESHOLD: 20,
    COOLDOWN_PERIOD: 240000,
    UPDATE_CLIENT_COOLDOWN: 30000,
    PHOTO_PATHS: ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'],
};
let ClientService = ClientService_1 = class ClientService {
    constructor(clientModel, promoteClientModel, telegramService, bufferClientService, usersService) {
        this.clientModel = clientModel;
        this.promoteClientModel = promoteClientModel;
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
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.refreshPromise = null;
    }
    async onModuleInit() {
        await this.handleErrors('initialize service', async () => {
            await this.refreshCacheFromDatabase();
            this.startPeriodicTasks();
            this.isInitialized = true;
        });
    }
    async onModuleDestroy() {
        this.isShuttingDown = true;
        await this.handleErrors('shutdown service', async () => {
            if (this.checkInterval)
                clearInterval(this.checkInterval);
            if (this.refreshInterval)
                clearInterval(this.refreshInterval);
            if (this.refreshPromise)
                await this.refreshPromise;
            await connection_manager_1.connectionManager.shutdown();
            this.clientsMap.clear();
        });
    }
    startPeriodicTasks() {
        this.checkInterval = setInterval(async () => {
            if (this.isShuttingDown)
                return;
            await this.performPeriodicRefresh();
        }, CONFIG.REFRESH_INTERVAL);
        this.refreshInterval = setInterval(() => {
            if (this.isShuttingDown)
                return;
            this.updateCacheMetadata();
        }, 60000);
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
        await this.handleErrors('refresh cache', async () => {
            const documents = await this.executeWithRetry(() => this.clientModel.find({}, { _id: 0, updatedAt: 0 }).lean().exec());
            const newClientsMap = new Map();
            documents.forEach((client) => newClientsMap.set(client.clientId, client));
            this.clientsMap = newClientsMap;
            this.cacheMetadata = { lastUpdated: Date.now(), isStale: false };
        });
    }
    async create(createClientDto) {
        return this.handleErrors('create client', async () => {
            const createdClient = await this.executeWithRetry(() => {
                const client = new this.clientModel(createClientDto);
                return client.save();
            });
            this.clientsMap.set(createdClient.clientId, createdClient.toObject());
            this.logger.log(`Client created: ${createdClient.clientId}`);
            return createdClient;
        });
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
        const filteredClients = query ? (await this.enhancedSearch(query)).clients : await this.findAll();
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
        return this.handleErrors(`update client ${clientId}`, async () => {
            const cleanUpdateDto = this.cleanUpdateObject(updateClientDto);
            await this.notifyClientUpdate(clientId);
            const updatedClient = await this.executeWithRetry(() => this.clientModel
                .findOneAndUpdate({ clientId }, { $set: cleanUpdateDto }, { new: true, upsert: true, runValidators: true })
                .lean()
                .exec());
            if (!updatedClient) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            this.clientsMap.set(clientId, updatedClient);
            this.performPostUpdateTasks(updatedClient);
            this.logger.log(`Client updated: ${clientId}`);
            return updatedClient;
        });
    }
    async remove(clientId) {
        this.ensureInitialized();
        return this.handleErrors(`remove client ${clientId}`, async () => {
            const deletedClient = await this.executeWithRetry(() => this.clientModel.findOneAndDelete({ clientId }).lean().exec());
            if (!deletedClient) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            this.clientsMap.delete(clientId);
            this.logger.log(`Client removed: ${clientId}`);
            return deletedClient;
        });
    }
    async search(filter) {
        return this.handleErrors('search clients', async () => {
            if (filter.hasPromoteMobiles !== undefined) {
                filter = await this.processPromoteMobileFilter(filter);
            }
            filter = this.processTextSearchFields(filter);
            return this.executeWithRetry(() => this.clientModel.find(filter).lean().exec());
        });
    }
    async searchClientsByPromoteMobile(mobileNumbers) {
        if (!Array.isArray(mobileNumbers) || mobileNumbers.length === 0)
            return [];
        const promoteClients = await this.executeWithRetry(() => this.promoteClientModel
            .find({ mobile: { $in: mobileNumbers }, clientId: { $exists: true } })
            .lean()
            .exec());
        const clientIds = [...new Set(promoteClients.map((pc) => pc.clientId))];
        return this.executeWithRetry(() => this.clientModel.find({ clientId: { $in: clientIds } }).lean().exec());
    }
    async enhancedSearch(filter) {
        return this.handleErrors('enhanced search', async () => {
            let searchType = 'direct';
            let promoteMobileMatches = [];
            if (filter.promoteMobileNumber) {
                searchType = 'promoteMobile';
                const mobileNumber = filter.promoteMobileNumber;
                delete filter.promoteMobileNumber;
                const promoteClients = await this.executeWithRetry(() => this.promoteClientModel
                    .find({
                    mobile: { $regex: new RegExp(this.escapeRegex(mobileNumber), 'i') },
                    clientId: { $exists: true },
                })
                    .lean()
                    .exec());
                promoteMobileMatches = promoteClients.map((pc) => ({
                    clientId: pc.clientId,
                    mobile: pc.mobile,
                }));
                filter.clientId = { $in: promoteClients.map((pc) => pc.clientId) };
            }
            const clients = await this.search(filter);
            return {
                clients,
                searchType,
                promoteMobileMatches: promoteMobileMatches.length > 0 ? promoteMobileMatches : undefined,
            };
        });
    }
    async handleErrors(operation, fn) {
        try {
            return await fn();
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Error in ${operation}`, true);
            this.logger.error(`Error in ${operation}`, error.stack);
            throw error;
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
        if (cleaned._doc) {
            delete cleaned._doc._id;
            delete cleaned._doc;
        }
        return cleaned;
    }
    async notifyClientUpdate(clientId) {
        await this.notify(`Updating the Existing client: ${clientId}`);
    }
    async notify(message) {
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(message)}`, {
                timeout: 5000,
            });
        }
        catch (error) {
            this.logger.warn('Failed to send notification', error.message);
        }
    }
    performPostUpdateTasks(updatedClient) {
        setImmediate(async () => {
            await this.handleErrors('post-update tasks', () => this.refreshExternalMaps());
        });
    }
    async refreshExternalMaps() {
        await Promise.allSettled([
            (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`, { timeout: 5000 }),
            (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimebot}/refreshmap`, { timeout: 5000 }),
        ]);
        this.logger.debug('External maps refreshed');
    }
    async processPromoteMobileFilter(filter) {
        const hasPromoteMobiles = filter.hasPromoteMobiles.toLowerCase() === 'true';
        delete filter.hasPromoteMobiles;
        const clientsWithPromoteMobiles = await this.executeWithRetry(() => this.promoteClientModel.find({ clientId: { $exists: true } }).distinct('clientId').lean());
        filter.clientId = hasPromoteMobiles
            ? { $in: clientsWithPromoteMobiles }
            : { $nin: clientsWithPromoteMobiles };
        return filter;
    }
    processTextSearchFields(filter) {
        const textFields = ['firstName', 'name'];
        textFields.forEach((field) => {
            if (filter[field]) {
                filter[field] = { $regex: new RegExp(this.escapeRegex(filter[field]), 'i') };
            }
        });
        return filter;
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
                this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, error.message);
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
        const today = new Date().toISOString().split('T')[0];
        const query = {
            clientId,
            mobile: { $ne: existingClientMobile },
            createdAt: { $lte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
            availableDate: { $lte: today },
            channels: { $gt: 200 },
            status: "active"
        };
        const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
        if (!newBufferClient) {
            await this.notify(`Buffer Clients not available, Requested by ${clientId}`);
            this.logger.log('Buffer Clients not available');
            return;
        }
        await this.handleErrors('setup client', async () => {
            await this.notify(`Received New Client Request for - ${clientId}\nOldNumber: ${existingClient.mobile}\nOldUsername: ${existingClient.username}`);
            this.telegramService.setActiveClientSetup({
                ...setupClientQueryDto,
                clientId,
                existingMobile: existingClientMobile,
                newMobile: newBufferClient.mobile,
            });
            await connection_manager_1.connectionManager.getClient(newBufferClient.mobile);
            await this.updateClientSession(newBufferClient.session);
        }).catch(async (error) => {
            const availableDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
            this.telegramService.setActiveClientSetup(undefined);
        }).finally(async () => {
            await connection_manager_1.connectionManager.unregisterClient(newBufferClient.mobile);
        });
    }
    async updateClientSession(newSession) {
        const setup = this.telegramService.getActiveClientSetup();
        const { days, archiveOld, clientId, existingMobile, formalities, newMobile } = setup;
        this.logger.log('Updating Client Session');
        await (0, Helpers_1.sleep)(2000);
        const existingClient = await this.findOne(clientId);
        if (!existingClient)
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        const newTelegramClient = await connection_manager_1.connectionManager.getClient(newMobile, {
            handler: true,
            autoDisconnect: false,
        });
        try {
            const me = await newTelegramClient.getMe();
            const updatedUsername = await this.telegramService.updateUsernameForAClient(newMobile, clientId, existingClient.name, me.username);
            await this.notify(`Updated username for NewNumber: ${newMobile}\noldUsername: ${me.username}\nNewUsername: ${updatedUsername}`);
            await this.update(clientId, { mobile: newMobile, username: updatedUsername, session: newSession });
            await (0, fetchWithTimeout_1.fetchWithTimeout)(existingClient.deployKey, {}, 1);
            setTimeout(() => this.updateClient(clientId, 'Delayed update after buffer removal'), 15000);
            await this.handleClientArchival(existingClient, existingMobile, formalities, archiveOld, days);
            await this.bufferClientService.update(newMobile, { inUse: true, lastUsed: new Date() });
            await this.notify('Update finished');
        }
        catch (error) {
            (0, parseError_1.parseError)(error, `[New: ${newMobile}] Error in updating client session`, true);
            throw error;
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(newMobile);
            this.telegramService.setActiveClientSetup(undefined);
        }
    }
    async handleClientArchival(existingClient, existingMobile, formalities, archiveOld, days) {
        try {
            const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
            if (!existingClientUser)
                return;
            if ((0, utils_1.toBoolean)(formalities)) {
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
                });
                this.logger.log('Client Archive Skipped');
                await this.notify('Skipped Old Client Archival');
            }
        }
        catch (e) {
            await this.notify(`Failed to Archive old Client: ${existingMobile}\nError: ${e.errorMessage || e.message}`);
        }
    }
    async handleFormalities(mobile) {
        const client = await connection_manager_1.connectionManager.getClient(mobile, { handler: true, autoDisconnect: false });
        await this.telegramService.updatePrivacyforDeletedAccount(mobile);
        this.logger.log('Formalities finished');
        await connection_manager_1.connectionManager.unregisterClient(mobile);
        await this.notify('Formalities finished');
    }
    async archiveOldClient(existingClient, existingClientUser, existingMobile, days) {
        try {
            const availableDate = new Date(Date.now() + (days + 1) * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
            const bufferClientDto = {
                clientId: existingClient.clientId,
                mobile: existingMobile,
                availableDate,
                session: existingClient.session,
                tgId: existingClientUser.tgId,
                channels: 170,
                status: days > 35 ? 'inactive' : 'active',
                inUse: false,
            };
            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingMobile, bufferClientDto);
            this.logger.log('client Archived: ', updatedBufferClient['_doc']);
            await this.notify('old Client Archived');
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Error in Archiving Old Client: ${existingMobile}`, true);
            await this.notify(errorDetails.message);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                this.logger.log('Deleting User: ', existingClientUser.mobile);
                await this.bufferClientService.remove(existingClientUser.mobile, 'Deactivated user');
            }
            else {
                this.logger.log('Not Deleting user');
            }
        }
    }
    async updateClient(clientId, message = '') {
        this.logger.log(`Updating Client: ${clientId} - ${message}`);
        if (!this.canUpdateClient(clientId))
            return;
        const client = await this.findOne(clientId);
        if (!client) {
            this.logger.error(`Client not found: ${clientId}`);
            return;
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
            await this.updateClientUsername(client, me);
            await this.updateClientName(client, telegramClient, me);
            await this.updateClientPrivacy(client, telegramClient);
            await this.updateClientPhotos(client, telegramClient);
            await this.notify(`Updated Client: ${clientId} - ${message}`);
            if (client.deployKey)
                await (0, fetchWithTimeout_1.fetchWithTimeout)(client.deployKey);
        }
        catch (error) {
            this.lastUpdateMap.delete(clientId);
            (0, parseError_1.parseError)(error, `[${clientId}] [${client.mobile}] updateClient failed`);
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
    async updateClientUsername(client, me) {
        const normalize = (str) => (str || '').toLowerCase().trim().replace(/\s+/g, ' ').normalize('NFC');
        const actualUsername = normalize(me.username || '');
        const expectedUsername = normalize(client.username || '');
        if (!actualUsername || actualUsername !== expectedUsername) {
            this.logger.log(`[${client.clientId}] Username mismatch. Actual: ${me.username}, Expected: ${client.username}`);
            const updatedUsername = await this.telegramService.updateUsernameForAClient(client.mobile, client.clientId, client.name, me.username);
            if (updatedUsername) {
                await this.update(client.clientId, { username: updatedUsername });
                this.logger.log(`[${client.clientId}] Username updated to: ${updatedUsername}`);
                await (0, Helpers_1.sleep)(10000);
            }
            else {
                this.logger.warn(`[${client.clientId}] Failed to update username`);
            }
        }
        else {
            this.logger.log(`[${client.clientId}] Username already correct`);
        }
    }
    async updateClientName(client, tgManager, me) {
        const normalize = (str) => (str || '').toLowerCase().trim().replace(/\s+/g, ' ').normalize('NFC');
        const safeAttemptReverse = (val) => {
            try {
                return (0, utils_1.attemptReverseFuzzy)(val ?? '') || '';
            }
            catch {
                return '';
            }
        };
        const actualName = normalize(safeAttemptReverse(me.firstName || ''));
        const expectedName = normalize(client.name || '');
        if (actualName !== expectedName) {
            this.logger.log(`[${client.clientId}] Name mismatch. Actual: ${me.firstName}, Expected: ${client.name}`);
            await tgManager.updateProfile((0, utils_1.obfuscateText)(client.name, { maintainFormatting: false, preserveCase: true }), (0, utils_1.obfuscateText)(`Genuine Paid Girl${(0, utils_1.getRandomEmoji)()}, Best Services${(0, utils_1.getRandomEmoji)()}`, {
                maintainFormatting: false,
                preserveCase: true,
            }));
            await (0, Helpers_1.sleep)(5000);
        }
        else {
            this.logger.log(`[${client.clientId}] Name already correct`);
        }
    }
    async updateClientPrivacy(client, tgManager) {
        await tgManager.updatePrivacy();
        this.logger.log(`[${client.clientId}] Privacy settings updated`);
        await (0, Helpers_1.sleep)(5000);
    }
    async updateClientPhotos(client, telegramClient) {
        const photos = await telegramClient.client.invoke(new tl_1.Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
        const photoCount = photos?.photos?.length || 0;
        if (photoCount < 1) {
            this.logger.warn(`[${client.clientId}] No profile photos found. Uploading new ones...`);
            await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
            await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
            for (const photo of CONFIG.PHOTO_PATHS) {
                await telegramClient.updateProfilePic(path_1.default.join(process.cwd(), photo));
                this.logger.debug(`[${client.clientId}] Uploaded profile photo: ${photo}`);
                await (0, Helpers_1.sleep)(20000 + Math.random() * 15000);
            }
        }
        else {
            this.logger.log(`[${client.clientId}] Profile photos already exist (${photoCount})`);
        }
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
    async getPromoteMobiles(clientId) {
        if (!clientId)
            throw new common_1.BadRequestException('ClientId is required');
        const promoteClients = await this.promoteClientModel.find({ clientId }).lean();
        return promoteClients.map((pc) => pc.mobile).filter((mobile) => mobile);
    }
    async getAllPromoteMobiles() {
        const allPromoteClients = await this.promoteClientModel
            .find({ clientId: { $exists: true } })
            .lean();
        return allPromoteClients.map((pc) => pc.mobile);
    }
    async isPromoteMobile(mobile) {
        const promoteClient = await this.promoteClientModel.findOne({ mobile }).lean();
        return {
            isPromote: !!promoteClient && !!promoteClient.clientId,
            clientId: promoteClient?.clientId,
        };
    }
    async addPromoteMobile(clientId, mobileNumber) {
        const client = await this.clientModel.findOne({ clientId }).lean();
        if (!client)
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        const existingPromoteClient = await this.promoteClientModel.findOne({ mobile: mobileNumber }).lean();
        if (existingPromoteClient) {
            if (existingPromoteClient.clientId === clientId) {
                throw new common_1.BadRequestException(`Mobile ${mobileNumber} is already a promote mobile for client ${clientId}`);
            }
            else if (existingPromoteClient.clientId) {
                throw new common_1.BadRequestException(`Mobile ${mobileNumber} is already assigned to client ${existingPromoteClient.clientId}`);
            }
            else {
                await this.promoteClientModel.updateOne({ mobile: mobileNumber }, { $set: { clientId } });
            }
        }
        else {
            throw new common_1.NotFoundException(`Mobile ${mobileNumber} not found in PromoteClient collection. Please add it first.`);
        }
        return client;
    }
    async removePromoteMobile(clientId, mobileNumber) {
        const client = await this.clientModel.findOne({ clientId }).lean();
        if (!client)
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        const result = await this.promoteClientModel.updateOne({ mobile: mobileNumber, clientId }, { $unset: { clientId: 1 } });
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Mobile ${mobileNumber} is not a promote mobile for client ${clientId}`);
        }
        return client;
    }
};
exports.ClientService = ClientService;
exports.ClientService = ClientService = ClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(client_schema_1.Client.name)),
    __param(1, (0, mongoose_1.InjectModel)(promote_client_schema_1.PromoteClient.name)),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        Telegram_service_1.TelegramService,
        buffer_client_service_1.BufferClientService,
        users_service_1.UsersService])
], ClientService);
//# sourceMappingURL=client.service.js.map