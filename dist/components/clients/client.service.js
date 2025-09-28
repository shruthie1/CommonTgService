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
var ClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientService = void 0;
const Telegram_service_1 = require("./../Telegram/Telegram.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const client_schema_1 = require("./schemas/client.schema");
const buffer_client_service_1 = require("../buffer-clients/buffer-client.service");
const Helpers_1 = require("telegram/Helpers");
const users_service_1 = require("../users/users.service");
const utils_1 = require("../../utils");
const cloudinary_1 = require("../../cloudinary");
const npoint_service_1 = require("../n-point/npoint.service");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const ip_management_service_1 = require("../ip-management/ip-management.service");
const promote_client_schema_1 = require("../promote-clients/schemas/promote-client.schema");
let settingupClient = Date.now() - 250000;
let ClientService = ClientService_1 = class ClientService {
    constructor(clientModel, promoteClientModel, telegramService, bufferClientService, usersService, ipManagementService, npointService) {
        this.clientModel = clientModel;
        this.promoteClientModel = promoteClientModel;
        this.telegramService = telegramService;
        this.bufferClientService = bufferClientService;
        this.usersService = usersService;
        this.ipManagementService = ipManagementService;
        this.npointService = npointService;
        this.logger = new utils_1.Logger(ClientService_1.name);
        this.lastUpdateMap = new Map();
        this.clientsMap = new Map();
        this.cacheMetadata = {
            lastUpdated: 0,
            isStale: true
        };
        this.checkInterval = null;
        this.refreshInterval = null;
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.REFRESH_INTERVAL = 5 * 60 * 1000;
        this.CACHE_TTL = 10 * 60 * 1000;
        this.MAX_RETRIES = 3;
        this.RETRY_DELAY = 1000;
        this.CACHE_WARMUP_THRESHOLD = 20;
        this.refreshPromise = null;
    }
    async onModuleInit() {
        try {
            await this.initializeService();
        }
        catch (error) {
            this.logger.error('Failed to initialize Client Service', error.stack);
            throw error;
        }
    }
    async onModuleDestroy() {
        this.isShuttingDown = true;
        try {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
            if (this.refreshPromise) {
                await this.refreshPromise;
            }
            await connection_manager_1.connectionManager.shutdown();
            this.clientsMap.clear();
        }
        catch (error) {
            this.logger.error('Error during service shutdown', error.stack);
        }
    }
    async initializeService() {
        try {
            await this.warmupCache();
            this.startPeriodicTasks();
            this.isInitialized = true;
        }
        catch (error) {
            this.logger.error('Service initialization failed', error.stack);
            throw new Error('Client Service initialization failed');
        }
    }
    async warmupCache() {
        try {
            await this.refreshCacheFromDatabase();
        }
        catch (error) {
            this.logger.error('Cache warmup failed', error.stack);
            throw error;
        }
    }
    startPeriodicTasks() {
        this.checkInterval = setInterval(async () => {
            if (this.isShuttingDown)
                return;
            try {
                await Promise.allSettled([
                    this.performPeriodicRefresh(),
                ]);
            }
            catch (error) {
                this.logger.error('Error during periodic tasks', error.stack);
            }
        }, this.REFRESH_INTERVAL);
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
        const now = Date.now();
        this.cacheMetadata.isStale = (now - this.cacheMetadata.lastUpdated) > this.CACHE_TTL;
    }
    async refreshCacheFromDatabase() {
        try {
            const documents = await this.executeWithRetry(async () => {
                return await this.clientModel
                    .find({}, { _id: 0, updatedAt: 0 })
                    .lean()
                    .exec();
            });
            const newClientsMap = new Map();
            documents.forEach((client) => {
                newClientsMap.set(client.clientId, client);
            });
            this.clientsMap = newClientsMap;
            this.cacheMetadata = {
                lastUpdated: Date.now(),
                isStale: false
            };
        }
        catch (error) {
            this.logger.error('Failed to refresh cache from database', error.stack);
            throw error;
        }
    }
    async create(createClientDto) {
        try {
            const createdUser = await this.executeWithRetry(async () => {
                const client = new this.clientModel(createClientDto);
                return await client.save();
            });
            if (createdUser) {
                this.clientsMap.set(createdUser.clientId, createdUser.toObject());
                this.logger.log(`Client created: ${createdUser.clientId}`);
            }
            return createdUser;
        }
        catch (error) {
            this.logger.error('Error creating client', error.stack);
            throw error;
        }
    }
    async findAll() {
        this.ensureInitialized();
        try {
            if (this.clientsMap.size >= this.CACHE_WARMUP_THRESHOLD && !this.cacheMetadata.isStale) {
                this.logger.debug(`Retrieved ${this.clientsMap.size} clients from cache`);
                return Array.from(this.clientsMap.values());
            }
            if (this.cacheMetadata.isStale || this.clientsMap.size === 0) {
                await this.refreshCacheFromDatabase();
            }
            return Array.from(this.clientsMap.values());
        }
        catch (error) {
            this.logger.error('Failed to retrieve all clients', error.stack);
            (0, parseError_1.parseError)(error, 'Failed to retrieve all clients: ', true);
            throw error;
        }
    }
    async findAllMasked() {
        const clients = await this.findAll();
        return clients.map((client) => {
            const { session, mobile, password, ...maskedClient } = client;
            return { ...maskedClient };
        });
    }
    async findOneMasked(clientId) {
        const client = await this.findOne(clientId, true);
        const { session, mobile, password, ...maskedClient } = client;
        return { ...maskedClient };
    }
    async findAllObject() {
        const clients = await this.findAll();
        return clients.reduce((acc, client) => {
            acc[client.clientId] = client;
            return acc;
        }, {});
    }
    async findAllMaskedObject(query) {
        let filteredClients;
        if (query) {
            const searchResult = await this.enhancedSearch(query);
            filteredClients = searchResult.clients;
        }
        else {
            filteredClients = await this.findAll();
        }
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
        try {
            const cachedClient = this.clientsMap.get(clientId);
            if (cachedClient) {
                return cachedClient;
            }
            const user = await this.executeWithRetry(async () => {
                return await this.clientModel
                    .findOne({ clientId }, { _id: 0, updatedAt: 0 })
                    .lean()
                    .exec();
            });
            if (!user && throwErr) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            if (user) {
                this.clientsMap.set(clientId, user);
            }
            return user;
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            this.logger.error(`Error finding client ${clientId}`, error.stack);
            throw error;
        }
    }
    async update(clientId, updateClientDto) {
        this.ensureInitialized();
        try {
            const cleanUpdateDto = this.cleanUpdateObject(updateClientDto);
            await this.notifyClientUpdate(clientId);
            const updatedUser = await this.executeWithRetry(async () => {
                return await this.clientModel
                    .findOneAndUpdate({ clientId }, { $set: cleanUpdateDto }, { new: true, upsert: true, runValidators: true })
                    .lean()
                    .exec();
            });
            if (!updatedUser) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            this.clientsMap.set(clientId, updatedUser);
            this.performPostUpdateTasks(updatedUser);
            this.logger.log(`Client updated: ${clientId}`);
            return updatedUser;
        }
        catch (error) {
            this.logger.error(`Error updating client ${clientId}`, error.stack);
            throw error;
        }
    }
    async remove(clientId) {
        this.ensureInitialized();
        try {
            const deletedUser = await this.executeWithRetry(async () => {
                return await this.clientModel
                    .findOneAndDelete({ clientId })
                    .lean()
                    .exec();
            });
            if (!deletedUser) {
                throw new common_1.NotFoundException(`Client with ID "${clientId}" not found`);
            }
            this.clientsMap.delete(clientId);
            this.logger.log(`Client removed: ${clientId}`);
            return deletedUser;
        }
        catch (error) {
            this.logger.error(`Error removing client ${clientId}`, error.stack);
            throw error;
        }
    }
    async search(filter) {
        try {
            this.logger.debug('Search filter:', JSON.stringify(filter, null, 2));
            if (filter.hasPromoteMobiles !== undefined) {
                filter = await this.processPromoteMobileFilter(filter);
            }
            filter = this.processTextSearchFields(filter);
            this.logger.debug('Processed filter:', JSON.stringify(filter, null, 2));
            return await this.executeWithRetry(async () => {
                return await this.clientModel.find(filter).lean().exec();
            });
        }
        catch (error) {
            this.logger.error('Error in search', error.stack);
            throw error;
        }
    }
    async searchClientsByPromoteMobile(mobileNumbers) {
        try {
            if (!Array.isArray(mobileNumbers) || mobileNumbers.length === 0) {
                return [];
            }
            const promoteClients = await this.executeWithRetry(async () => {
                return await this.promoteClientModel
                    .find({
                    mobile: { $in: mobileNumbers },
                    clientId: { $exists: true },
                })
                    .lean()
                    .exec();
            });
            const clientIds = [...new Set(promoteClients.map((pc) => pc.clientId))];
            return await this.executeWithRetry(async () => {
                return await this.clientModel
                    .find({ clientId: { $in: clientIds } })
                    .lean()
                    .exec();
            });
        }
        catch (error) {
            this.logger.error('Error searching by promote mobile', error.stack);
            throw error;
        }
    }
    async enhancedSearch(filter) {
        try {
            let searchType = 'direct';
            let promoteMobileMatches = [];
            if (filter.promoteMobileNumber) {
                searchType = 'promoteMobile';
                const mobileNumber = filter.promoteMobileNumber;
                delete filter.promoteMobileNumber;
                const promoteClients = await this.executeWithRetry(async () => {
                    return await this.promoteClientModel
                        .find({
                        mobile: {
                            $regex: new RegExp(this.escapeRegex(mobileNumber), 'i'),
                        },
                        clientId: { $exists: true },
                    })
                        .lean()
                        .exec();
                });
                promoteMobileMatches = promoteClients.map((pc) => ({
                    clientId: pc.clientId,
                    mobile: pc.mobile,
                }));
                const clientIds = promoteClients.map((pc) => pc.clientId);
                filter.clientId = { $in: clientIds };
            }
            const clients = await this.search(filter);
            return {
                clients,
                searchType,
                promoteMobileMatches: promoteMobileMatches.length > 0 ? promoteMobileMatches : undefined,
            };
        }
        catch (error) {
            this.logger.error('Error in enhanced search', error.stack);
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
        try {
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updating the Existing client: ${clientId}`, { timeout: 5000 });
        }
        catch (error) {
            this.logger.warn('Failed to send update notification', error.message);
        }
    }
    performPostUpdateTasks(updatedUser) {
        setImmediate(async () => {
            try {
                await Promise.allSettled([
                    this.refreshExternalMaps()
                ]);
            }
            catch (error) {
                this.logger.error('Error in post-update tasks', error.stack);
            }
        });
    }
    async refreshExternalMaps() {
        try {
            await Promise.allSettled([
                (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimeChecker}/refreshmap`, { timeout: 5000 }),
                (0, fetchWithTimeout_1.fetchWithTimeout)(`${process.env.uptimebot}/refreshmap`, { timeout: 5000 })
            ]);
            this.logger.debug('External maps refreshed');
        }
        catch (error) {
            this.logger.warn('Failed to refresh external maps', error.message);
        }
    }
    async processPromoteMobileFilter(filter) {
        const hasPromoteMobiles = filter.hasPromoteMobiles.toLowerCase() === 'true';
        delete filter.hasPromoteMobiles;
        const clientsWithPromoteMobiles = await this.executeWithRetry(async () => {
            return await this.promoteClientModel
                .find({ clientId: { $exists: true } })
                .distinct('clientId')
                .lean();
        });
        if (hasPromoteMobiles) {
            filter.clientId = { $in: clientsWithPromoteMobiles };
        }
        else {
            filter.clientId = { $nin: clientsWithPromoteMobiles };
        }
        return filter;
    }
    processTextSearchFields(filter) {
        const textFields = ['firstName', 'name'];
        textFields.forEach(field => {
            if (filter[field]) {
                filter[field] = {
                    $regex: new RegExp(this.escapeRegex(filter[field]), 'i')
                };
            }
        });
        return filter;
    }
    escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    async executeWithRetry(operation, retries = this.MAX_RETRIES) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                this.logger.warn(`Operation failed on attempt ${attempt}/${retries}`, error.message);
                if (attempt === retries) {
                    throw error;
                }
                const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
                await this.sleep(delay);
            }
        }
        throw new Error('All retry attempts failed');
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
        this.logger.log(`Received New Client Request for - ${clientId}`, settingupClient);
        if ((0, utils_1.toBoolean)(process.env.AUTO_CLIENT_SETUP) && Date.now() > settingupClient + 240000) {
            settingupClient = Date.now();
            const existingClient = await this.findOne(clientId);
            const existingClientMobile = existingClient.mobile;
            this.logger.log('setupClientQueryDto:', setupClientQueryDto);
            const today = new Date(Date.now()).toISOString().split('T')[0];
            const query = { clientId: clientId, createdAt: { $lte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) }, availableDate: { $lte: today }, channels: { $gt: 200 } };
            const newBufferClient = (await this.bufferClientService.executeQuery(query, { tgId: 1 }))[0];
            if (newBufferClient) {
                try {
                    await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Received New Client Request for - ${clientId} - OldNumber: ${existingClient.mobile} || ${existingClient.username}`);
                    this.telegramService.setActiveClientSetup({
                        ...setupClientQueryDto,
                        clientId,
                        existingMobile: existingClientMobile,
                        newMobile: newBufferClient.mobile,
                    });
                    await connection_manager_1.connectionManager.getClient(newBufferClient.mobile);
                    await this.updateClientSession(newBufferClient.session);
                }
                catch (error) {
                    (0, parseError_1.parseError)(error);
                    this.logger.log('Removing buffer as error');
                    const availableDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    await this.bufferClientService.createOrUpdate(newBufferClient.mobile, { availableDate });
                    this.telegramService.setActiveClientSetup(undefined);
                }
                finally {
                    await connection_manager_1.connectionManager.unregisterClient(newBufferClient.mobile);
                }
            }
            else {
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Buffer Clients not available, Requested by ${clientId}`);
                this.logger.log('Buffer Clients not available');
            }
        }
        else {
            this.logger.log('Profile Setup Recently tried, wait ::', settingupClient - Date.now());
        }
    }
    async updateClientSession(newSession) {
        try {
            this.logger.log('Updating Client Session');
            const setup = this.telegramService.getActiveClientSetup();
            const { days, archiveOld, clientId, existingMobile, formalities, newMobile } = setup;
            await (0, Helpers_1.sleep)(2000);
            const existingClient = await this.findOne(clientId);
            const newTelegramClient = await connection_manager_1.connectionManager.getClient(newMobile, {
                handler: true,
                autoDisconnect: false,
            });
            const me = await newTelegramClient.getMe();
            const updatedUsername = await this.telegramService.updateUsernameForAClient(newMobile, clientId, existingClient.name, me.username);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updated username for NewNumber:${newMobile} || ${updatedUsername}`);
            await connection_manager_1.connectionManager.unregisterClient(newMobile);
            const existingClientUser = (await this.usersService.search({ mobile: existingMobile }))[0];
            await this.update(clientId, {
                mobile: newMobile,
                username: updatedUsername,
                session: newSession,
            });
            await (0, fetchWithTimeout_1.fetchWithTimeout)(existingClient.deployKey, {}, 1);
            await this.bufferClientService.update(existingMobile, { inUse: false, lastUsed: new Date() });
            this.logger.log('Updating buffer client to in use');
            await this.bufferClientService.update(newMobile, { inUse: true, lastUsed: new Date() });
            setTimeout(async () => {
                await this.updateClient(clientId, 'Delayed update after buffer removal');
            }, 15000);
            try {
                if (existingClientUser) {
                    try {
                        if ((0, utils_1.toBoolean)(formalities)) {
                            await connection_manager_1.connectionManager.getClient(existingMobile, {
                                handler: true,
                                autoDisconnect: false,
                            });
                            await this.telegramService.updatePrivacyforDeletedAccount(existingMobile);
                            this.logger.log('Formalities finished');
                            await connection_manager_1.connectionManager.unregisterClient(existingMobile);
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Formalities finished`);
                        }
                        else {
                            this.logger.log('Formalities skipped');
                        }
                        if (archiveOld) {
                            const availableDate = new Date(Date.now() + (days + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                            const bufferClientDto = {
                                mobile: existingMobile,
                                availableDate,
                                session: existingClient.session,
                                tgId: existingClientUser.tgId,
                                channels: 170,
                                status: days > 35 ? 'inactive' : 'active',
                            };
                            const updatedBufferClient = await this.bufferClientService.createOrUpdate(existingMobile, bufferClientDto);
                            this.logger.log('client Archived: ', updatedBufferClient["_doc"]);
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Client Archived`);
                        }
                        else {
                            this.logger.log('Client Archive Skipped');
                            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Client Archive Skipped`);
                        }
                    }
                    catch (error) {
                        this.logger.log('Cannot Archive Old Client');
                        const errorDetails = (0, parseError_1.parseError)(error, 'Error in Archiving Old Client', true);
                        if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', 'session_revoked', 'user_deactivated_ban'])) {
                            this.logger.log('Deleting User: ', existingClientUser.mobile);
                            await this.bufferClientService.remove(existingClientUser.mobile, 'Deactivated user');
                        }
                        else {
                            this.logger.log('Not Deleting user');
                        }
                    }
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error, 'Error in Archiving Old Client outer', true);
                this.logger.log('Error in Archiving Old Client');
            }
            this.telegramService.setActiveClientSetup(undefined);
            this.logger.log('Update finished Exitting Exiiting TG Service');
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Update finished`);
        }
        catch (e) {
            (0, parseError_1.parseError)(e, 'Error in updating client session', true);
            this.telegramService.setActiveClientSetup(undefined);
        }
    }
    async updateClient(clientId, message = '') {
        this.logger.log(`Updating Client: ${clientId} - ${message}`);
        const now = Date.now();
        const lastUpdate = this.lastUpdateMap.get(clientId) || 0;
        const cooldownPeriod = 30000;
        if (now - lastUpdate < cooldownPeriod) {
            this.logger.log(`Skipping update for ${clientId} - cooldown period not elapsed. Try again in ${Math.ceil((cooldownPeriod - (now - lastUpdate)) / 1000)} seconds`);
            return;
        }
        const client = await this.findOne(clientId);
        try {
            this.lastUpdateMap.set(clientId, now);
            await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
            const telegramClient = await connection_manager_1.connectionManager.getClient(client.mobile, {
                handler: false,
            });
            await (0, Helpers_1.sleep)(2000);
            const me = await telegramClient.getMe();
            if (!me.username ||
                me.username !== client.username ||
                !me.username?.toLowerCase().startsWith(me.firstName.split(' ')[0].toLowerCase())) {
                const client = await this.findOne(clientId);
                const updatedUsername = await this.telegramService.updateUsernameForAClient(client.mobile, client.clientId, client.name, me.username);
                await (0, Helpers_1.sleep)(1000);
                await this.update(client.clientId, { username: updatedUsername });
            }
            await (0, Helpers_1.sleep)(1000);
            if (me.firstName !== client.name) {
                this.logger.log(`Updating first name for ${clientId} from ${me.firstName} to ${client.name}`);
                await telegramClient.updateProfile(client.name, (0, utils_1.obfuscateText)(`Genuine Paid Girl${(0, utils_1.getRandomEmoji)()}, Best Services${(0, utils_1.getRandomEmoji)()}`, { maintainFormatting: false, preserveCase: true }));
            }
            else {
                this.logger.log(`First name for ${clientId} is already up to date`);
            }
            await (0, Helpers_1.sleep)(1000);
            await telegramClient.updatePrivacy();
            await (0, Helpers_1.sleep)(1000);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=Updated Client: ${clientId} - ${message}`);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(client.deployKey);
        }
        catch (error) {
            this.lastUpdateMap.delete(clientId);
            (0, parseError_1.parseError)(error);
        }
        finally {
            connection_manager_1.connectionManager.unregisterClient(client.mobile);
        }
    }
    async updateClients() {
        const clients = await this.findAll();
        for (const client of Object.values(clients)) {
            await this.updateClient(client.clientId, `Force Updating Client: ${client.clientId}`);
        }
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.clientModel.find(query);
            if (sort) {
                queryExec.sort(sort);
            }
            if (limit) {
                queryExec.limit(limit);
            }
            if (skip) {
                queryExec.skip(skip);
            }
            return await queryExec.exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async getPromoteMobiles(clientId) {
        if (!clientId) {
            throw new common_1.BadRequestException('ClientId is required');
        }
        const promoteClients = await this.promoteClientModel
            .find({ clientId })
            .lean();
        return promoteClients.map((pc) => pc.mobile).filter((mobile) => mobile);
    }
    async getAllPromoteMobiles() {
        const allPromoteClients = await this.promoteClientModel
            .find({ clientId: { $exists: true } })
            .lean();
        return allPromoteClients.map((pc) => pc.mobile);
    }
    async isPromoteMobile(mobile) {
        const promoteClient = await this.promoteClientModel
            .findOne({ mobile })
            .lean();
        return {
            isPromote: !!promoteClient && !!promoteClient.clientId,
            clientId: promoteClient?.clientId,
        };
    }
    async addPromoteMobile(clientId, mobileNumber) {
        const client = await this.clientModel.findOne({ clientId }).lean();
        if (!client) {
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        }
        const existingPromoteClient = await this.promoteClientModel
            .findOne({ mobile: mobileNumber })
            .lean();
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
        if (!client) {
            throw new common_1.NotFoundException(`Client ${clientId} not found`);
        }
        const result = await this.promoteClientModel.updateOne({ mobile: mobileNumber, clientId }, { $unset: { clientId: 1 } });
        if (result.matchedCount === 0) {
            throw new common_1.NotFoundException(`Mobile ${mobileNumber} is not a promote mobile for client ${clientId}`);
        }
        return client;
    }
    async getIpForMobile(mobile, clientId) {
        if (!mobile) {
            throw new common_1.BadRequestException('Mobile number is required');
        }
        this.logger.debug(`Getting IP for mobile: ${mobile}${clientId ? ` (client: ${clientId})` : ''}`);
        try {
            const ipAddress = await this.ipManagementService.getIpForMobile(mobile);
            if (ipAddress) {
                this.logger.debug(`Found IP for mobile ${mobile}: ${ipAddress}`);
                return ipAddress;
            }
            this.logger.debug(`No IP found for mobile ${mobile}`);
            return null;
        }
        catch (error) {
            this.logger.error(`Failed to get IP for mobile ${mobile}: ${error.message}`, error.stack);
            return null;
        }
    }
    async hasMobileAssignedIp(mobile) {
        const ip = await this.getIpForMobile(mobile);
        return ip !== null;
    }
    async getMobilesNeedingIpAssignment(clientId) {
        this.logger.debug(`Getting mobiles needing IP assignment for client: ${clientId}`);
        const client = await this.findOne(clientId);
        const result = {
            mainMobile: undefined,
            promoteMobiles: [],
        };
        if (client.mobile && !(await this.hasMobileAssignedIp(client.mobile))) {
            result.mainMobile = client.mobile;
        }
        const promoteMobiles = await this.getPromoteMobiles(clientId);
        for (const mobile of promoteMobiles) {
            if (!(await this.hasMobileAssignedIp(mobile))) {
                result.promoteMobiles.push(mobile);
            }
        }
        this.logger.debug(`Mobiles needing IP assignment for client ${clientId}:`, result);
        return result;
    }
    async autoAssignIpsToClient(clientId) {
        this.logger.debug(`Auto-assigning IPs to all mobiles for client: ${clientId}`);
        const client = await this.findOne(clientId);
        const errors = [];
        let assigned = 0;
        let failed = 0;
        let mainMobileResult;
        try {
            const mainMapping = await this.ipManagementService.assignIpToMobile({
                mobile: client.mobile,
                clientId: client.clientId,
            });
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: mainMapping.ipAddress,
                status: 'assigned',
            };
            assigned++;
        }
        catch (error) {
            mainMobileResult = {
                mobile: client.mobile,
                ipAddress: null,
                status: 'failed',
            };
            errors.push(`Main mobile ${client.mobile}: ${error.message}`);
            failed++;
        }
        const promoteMobileResults = [];
        const promoteMobiles = await this.getPromoteMobiles(clientId);
        for (const promoteMobile of promoteMobiles) {
            try {
                const promoteMapping = await this.ipManagementService.assignIpToMobile({
                    mobile: promoteMobile,
                    clientId: client.clientId,
                });
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: promoteMapping.ipAddress,
                    status: 'assigned',
                });
                assigned++;
            }
            catch (error) {
                promoteMobileResults.push({
                    mobile: promoteMobile,
                    ipAddress: null,
                    status: 'failed',
                });
                errors.push(`Promote mobile ${promoteMobile}: ${error.message}`);
                failed++;
            }
        }
        const totalMobiles = 1 + promoteMobiles.length;
        this.logger.log(`Auto-assignment completed for ${clientId}: ${assigned}/${totalMobiles} assigned`);
        return {
            clientId,
            mainMobile: mainMobileResult,
            promoteMobiles: promoteMobileResults,
            summary: {
                totalMobiles,
                assigned,
                failed,
                errors,
            },
        };
    }
    async getClientIpInfo(clientId) {
        this.logger.debug(`Getting IP info for client: ${clientId}`);
        const client = await this.findOne(clientId);
        const mainMobileIp = await this.getIpForMobile(client.mobile, clientId);
        const mainMobile = {
            mobile: client.mobile,
            ipAddress: mainMobileIp,
            hasIp: mainMobileIp !== null,
        };
        const promoteMobiles = [];
        let mobilesWithIp = mainMobile.hasIp ? 1 : 0;
        const clientPromoteMobiles = await this.getPromoteMobiles(clientId);
        for (const mobile of clientPromoteMobiles) {
            const ip = await this.getIpForMobile(mobile, clientId);
            const hasIp = ip !== null;
            promoteMobiles.push({
                mobile,
                ipAddress: ip,
                hasIp,
            });
            if (hasIp)
                mobilesWithIp++;
        }
        const totalMobiles = 1 + clientPromoteMobiles.length;
        const mobilesWithoutIp = totalMobiles - mobilesWithIp;
        return {
            clientId,
            clientName: client.name,
            mainMobile,
            promoteMobiles,
            dedicatedIps: client.dedicatedIps || [],
            summary: {
                totalMobiles,
                mobilesWithIp,
                mobilesWithoutIp,
            },
        };
    }
    async releaseIpFromMobile(mobile) {
        this.logger.debug(`Releasing IP from mobile: ${mobile}`);
        try {
            await this.ipManagementService.releaseIpFromMobile({ mobile });
            this.logger.log(`Successfully released IP from mobile: ${mobile}`);
            return {
                success: true,
                message: `IP released from mobile ${mobile}`,
            };
        }
        catch (error) {
            this.logger.error(`Failed to release IP from mobile ${mobile}: ${error.message}`, error.stack);
            return {
                success: false,
                message: `Failed to release IP: ${error.message}`,
            };
        }
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
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => ip_management_service_1.IpManagementService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        Telegram_service_1.TelegramService,
        buffer_client_service_1.BufferClientService,
        users_service_1.UsersService,
        ip_management_service_1.IpManagementService,
        npoint_service_1.NpointService])
], ClientService);
//# sourceMappingURL=client.service.js.map