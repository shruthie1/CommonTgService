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
var BufferClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BufferClientService = void 0;
const channels_service_1 = require("./../channels/channels.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const Telegram_service_1 = require("../Telegram/Telegram.service");
const Helpers_1 = require("telegram/Helpers");
const users_service_1 = require("../users/users.service");
const active_channels_service_1 = require("../active-channels/active-channels.service");
const client_service_1 = require("../clients/client.service");
const promote_client_service_1 = require("../promote-clients/promote-client.service");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const session_manager_1 = require("../session-manager");
const utils_1 = require("../../utils");
const channelinfo_1 = require("../../utils/telegram-utils/channelinfo");
const path_1 = __importDefault(require("path"));
const cloudinary_1 = require("../../cloudinary");
const telegram_1 = require("telegram");
const isPermanentError_1 = __importDefault(require("../../utils/isPermanentError"));
let BufferClientService = BufferClientService_1 = class BufferClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, promoteClientService, sessionService) {
        this.bufferClientModel = bufferClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.promoteClientService = promoteClientService;
        this.sessionService = sessionService;
        this.logger = new utils_1.Logger(BufferClientService_1.name);
        this.joinChannelMap = new Map();
        this.joinChannelIntervalId = null;
        this.leaveChannelMap = new Map();
        this.leaveChannelIntervalId = null;
        this.isJoinChannelProcessing = false;
        this.isLeaveChannelProcessing = false;
        this.activeTimeouts = new Set();
        this.JOIN_CHANNEL_INTERVAL = 6 * 60 * 1000;
        this.LEAVE_CHANNEL_INTERVAL = 120 * 1000;
        this.LEAVE_CHANNEL_BATCH_SIZE = 10;
        this.CLIENT_PROCESSING_DELAY = 10000;
        this.CHANNEL_PROCESSING_DELAY = 20000;
        this.MAX_MAP_SIZE = 100;
        this.CLEANUP_INTERVAL = 15 * 60 * 1000;
        this.MAX_NEEDED = 160;
        this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER = 10;
        this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT = 10;
        this.cleanupIntervalId = null;
    }
    async onModuleDestroy() {
        await this.cleanup();
    }
    async cleanup() {
        try {
            this.clearAllTimeouts();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            this.clearMemoryCleanup();
            this.clearBufferMap();
            this.clearLeaveMap();
            this.isJoinChannelProcessing = false;
            this.isLeaveChannelProcessing = false;
        }
        catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
    startMemoryCleanup() {
        this.cleanupIntervalId = setInterval(() => {
            this.performMemoryCleanup();
        }, this.CLEANUP_INTERVAL);
        this.activeTimeouts.add(this.cleanupIntervalId);
    }
    clearMemoryCleanup() {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.activeTimeouts.delete(this.cleanupIntervalId);
            this.cleanupIntervalId = null;
        }
    }
    performMemoryCleanup() {
        try {
            for (const [mobile, channels] of this.joinChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    this.logger.log(`Cleaning up joinChannelMap entry for mobile: ${mobile} as channels : ${channels}`);
                    this.joinChannelMap.delete(mobile);
                }
            }
            for (const [mobile, channels] of this.leaveChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    this.logger.log(`Cleaning up leaveChannelMap entry for mobile: ${mobile} as channels : ${channels}`);
                    this.leaveChannelMap.delete(mobile);
                }
            }
            if (this.joinChannelMap.size > this.MAX_MAP_SIZE) {
                const keysToRemove = Array.from(this.joinChannelMap.keys()).slice(this.MAX_MAP_SIZE);
                keysToRemove.forEach((key) => this.joinChannelMap.delete(key));
                this.logger.warn(`Cleaned up ${keysToRemove.length} entries from joinChannelMap to prevent memory leak`);
            }
            if (this.leaveChannelMap.size > this.MAX_MAP_SIZE) {
                const keysToRemove = Array.from(this.leaveChannelMap.keys()).slice(this.MAX_MAP_SIZE);
                keysToRemove.forEach((key) => this.leaveChannelMap.delete(key));
                this.logger.warn(`Cleaned up ${keysToRemove.length} entries from leaveChannelMap to prevent memory leak`);
            }
            this.logger.debug(`Map Memory Check completed. Maps sizes - Join: ${this.joinChannelMap.size}, Leave: ${this.leaveChannelMap.size}, Active timeouts: ${this.activeTimeouts.size}`);
        }
        catch (error) {
            this.logger.error('Error during memory cleanup:', error);
        }
    }
    createTimeout(callback, delay) {
        const timeout = setTimeout(() => {
            this.activeTimeouts.delete(timeout);
            callback();
        }, delay);
        this.activeTimeouts.add(timeout);
        return timeout;
    }
    clearAllTimeouts() {
        this.activeTimeouts.forEach((timeout) => {
            clearTimeout(timeout);
        });
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }
    async create(bufferClient) {
        return await this.bufferClientModel.create({
            ...bufferClient,
            status: bufferClient.status || 'active',
        });
    }
    async findAll(status) {
        const filter = status ? { status } : {};
        return this.bufferClientModel.find(filter).exec();
    }
    async findOne(mobile, throwErr = true) {
        const bufferClient = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!bufferClient && throwErr) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return bufferClient;
    }
    async update(mobile, updateClientDto) {
        const updatedBufferClient = await this.bufferClientModel
            .findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true, returnDocument: 'after' })
            .exec();
        if (!updatedBufferClient) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return updatedBufferClient;
    }
    async createOrUpdate(mobile, createorUpdateBufferClientDto) {
        const existingBufferClient = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingBufferClient) {
            this.logger.log('Updating existing Client');
            return this.update(existingBufferClient.mobile, createorUpdateBufferClientDto);
        }
        else {
            this.logger.log('creating new Client');
            return this.create({
                ...createorUpdateBufferClientDto,
                status: createorUpdateBufferClientDto.status || 'active',
            });
        }
    }
    async remove(mobile, message) {
        try {
            const bufferClient = await this.findOne(mobile, false);
            if (!bufferClient) {
                throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
            }
            this.logger.log(`Removing BufferClient with mobile: ${mobile}`);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}\n${message}`)}`);
            await this.bufferClientModel.deleteOne({ mobile }).exec();
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `failed to delete BufferClient: ${mobile}`);
            this.logger.error(`Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }
    async search(filter) {
        if (filter.tgId == "refresh") {
            this.updateAllClientSessions();
            return [];
        }
        return await this.bufferClientModel.find(filter).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            const queryExec = this.bufferClientModel.find(query);
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
    removeFromBufferMap(key) {
        this.joinChannelMap.delete(key);
    }
    safeSetJoinChannelMap(mobile, channels) {
        if (this.joinChannelMap.size >= this.MAX_MAP_SIZE &&
            !this.joinChannelMap.has(mobile)) {
            this.logger.warn(`Join channel map size limit reached (${this.MAX_MAP_SIZE}), cannot add ${mobile}`);
            return false;
        }
        this.joinChannelMap.set(mobile, channels);
        return true;
    }
    safeSetLeaveChannelMap(mobile, channels) {
        if (this.leaveChannelMap.size >= this.MAX_MAP_SIZE &&
            !this.leaveChannelMap.has(mobile)) {
            this.logger.warn(`Leave channel map size limit reached (${this.MAX_MAP_SIZE}), cannot add ${mobile}`);
            return false;
        }
        this.leaveChannelMap.set(mobile, channels);
        return true;
    }
    clearBufferMap() {
        const mapSize = this.joinChannelMap.size;
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
        this.logger.debug(`BufferMap cleared, removed ${mapSize} entries`);
    }
    async updateStatus(mobile, status, message) {
        const updateData = { status };
        if (message) {
            updateData.message = message;
        }
        return this.update(mobile, updateData);
    }
    async markAsInactive(mobile, reason) {
        return this.updateStatus(mobile, 'inactive', reason);
    }
    async updateInfo() {
        const clients = await this.bufferClientModel
            .find({
            status: 'active',
        })
            .sort({ channels: 1 });
        this.logger.debug(`Updating info for ${clients.length} buffer clients`);
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client.mobile;
            try {
                this.logger.info(`Updating info for client ${i + 1}/${clients.length}: ${mobile}`);
                const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });
                await telegramClient.client.invoke(new telegram_1.Api.account.SetPrivacy({
                    key: new telegram_1.Api.InputPrivacyKeyPhoneCall(),
                    rules: [
                        new telegram_1.Api.InputPrivacyValueDisallowAll()
                    ],
                }));
                const channels = await (0, channelinfo_1.channelInfo)(telegramClient.client, true);
                this.logger.debug(`${mobile}: Found ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length });
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `Failed to UpdatedClient: ${mobile}`);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    try {
                        await this.markAsInactive(mobile, `${errorDetails.message}`);
                    }
                    catch (markError) {
                        this.logger.error(`Error marking client ${mobile} as inactive:`, markError);
                    }
                }
                this.logger.error(`Error updating info for client ${mobile}:`, errorDetails);
            }
            finally {
                try {
                    await connection_manager_1.connectionManager.unregisterClient(mobile);
                }
                catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }
                if (i < clients.length - 1) {
                    await (0, Helpers_1.sleep)(8000 + Math.random() * 4000);
                }
            }
        }
        this.logger.debug('Completed updating info for all buffer clients');
    }
    async joinchannelForBufferClients(skipExisting = true, clientId) {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return 'Active client setup exists, skipping buffer promotion';
        }
        this.logger.log('Starting join channel process for buffer clients');
        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();
        await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
        const existingKeys = skipExisting
            ? []
            : Array.from(this.joinChannelMap.keys());
        const query = {
            channels: { $lt: 350 },
            mobile: { $nin: existingKeys },
            status: 'active',
        };
        if (clientId) {
            query.clientId = clientId;
        }
        const clients = await this.bufferClientModel
            .find(query)
            .sort({ channels: 1 })
            .limit(8);
        this.logger.debug(`Found ${clients.length} buffer clients to process`);
        const joinSet = new Set();
        const leaveSet = new Set();
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < clients.length; i++) {
            const document = clients[i];
            const mobile = document.mobile;
            this.logger.debug(`Processing buffer client ${i + 1}/${clients.length}: ${mobile}`);
            try {
                const client = await connection_manager_1.connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });
                const channels = await (0, channelinfo_1.channelInfo)(client.client, true);
                this.logger.debug(`Client ${mobile} has ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length });
                if (channels.canSendFalseCount < 10) {
                    const excludedIds = channels.ids;
                    const result = channels.ids.length < 220
                        ? await this.activeChannelsService.getActiveChannels(150, 0, excludedIds)
                        : await this.channelsService.getActiveChannels(150, 0, excludedIds);
                    if (!this.joinChannelMap.has(mobile)) {
                        if (this.safeSetJoinChannelMap(mobile, result)) {
                            joinSet.add(mobile);
                            this.logger.debug(`Added ${result.length} channels to join queue for ${mobile}`);
                        }
                        else {
                            this.logger.warn(`Failed to add ${mobile} to join queue due to memory limits`);
                        }
                    }
                    else {
                        this.logger.debug(`${mobile}: Already present in join map, skipping`);
                    }
                    await this.sessionService.getOldestSessionOrCreate({
                        mobile: document.mobile
                    });
                }
                else {
                    if (!this.leaveChannelMap.has(mobile)) {
                        if (this.safeSetLeaveChannelMap(mobile, channels.canSendFalseChats)) {
                            leaveSet.add(mobile);
                            this.logger.warn(`Client ${mobile} has ${channels.canSendFalseChats.length} restricted channels, added to leave queue`);
                        }
                        else {
                            this.logger.warn(`Failed to add ${mobile} to leave queue due to memory limits`);
                        }
                    }
                    else {
                        this.logger.debug(`${mobile}: Already present in leave map, skipping`);
                    }
                }
                successCount++;
            }
            catch (error) {
                failCount++;
                const errorDetails = (0, parseError_1.parseError)(error, `JoinChannelErr: ${mobile}`);
                const errorMsg = errorDetails?.message || error?.errorMessage || 'Unknown error';
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
                else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorMsg}`);
                }
            }
            finally {
                try {
                    await connection_manager_1.connectionManager.unregisterClient(mobile);
                }
                catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }
                if (i < clients.length - 1) {
                    await (0, Helpers_1.sleep)(this.CLIENT_PROCESSING_DELAY + Math.random() * 5000);
                }
            }
        }
        await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
        if (joinSet.size > 0) {
            this.startMemoryCleanup();
            this.logger.debug(`Starting join queue for ${joinSet.size} buffer clients`);
            this.createTimeout(() => this.joinChannelQueue(), 4000 + Math.random() * 2000);
        }
        if (leaveSet.size > 0) {
            this.logger.debug(`Starting leave queue for ${leaveSet.size} buffer clients`);
            this.createTimeout(() => this.leaveChannelQueue(), 10000 + Math.random() * 5000);
        }
        this.logger.log(`Join process complete — Success: ${successCount}, Fail: ${failCount}`);
        return `Buffer Join queued for: ${joinSet.size}, Leave queued for: ${leaveSet.size}`;
    }
    async joinChannelQueue() {
        this.logger.debug('Attempting to start join channel queue');
        if (this.isJoinChannelProcessing) {
            this.logger.warn('Join channel process is already running');
            return;
        }
        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }
        if (!this.joinChannelIntervalId) {
            this.logger.debug('Starting join channel interval');
            this.joinChannelIntervalId = setInterval(async () => {
                await this.processJoinChannelInterval();
            }, this.JOIN_CHANNEL_INTERVAL);
            this.activeTimeouts.add(this.joinChannelIntervalId);
            await this.processJoinChannelInterval();
        }
        else {
            this.logger.warn('Join channel interval is already running');
        }
    }
    async processJoinChannelInterval() {
        if (this.isJoinChannelProcessing) {
            this.logger.debug('Join channel process already running, skipping interval');
            return;
        }
        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, clearing interval');
            this.clearJoinChannelInterval();
            return;
        }
        this.isJoinChannelProcessing = true;
        try {
            await this.processJoinChannelSequentially();
        }
        catch (error) {
            this.logger.error('Error in join channel queue', error);
        }
        finally {
            this.isJoinChannelProcessing = false;
            if (this.joinChannelMap.size === 0) {
                this.logger.debug('No more channels to join, clearing interval');
                this.clearJoinChannelInterval();
            }
        }
    }
    async processJoinChannelSequentially() {
        const keys = Array.from(this.joinChannelMap.keys());
        this.logger.debug(`Processing join channel queue sequentially for ${keys.length} clients`);
        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let currentChannel = null;
            try {
                const channels = this.joinChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.logger.debug(`No more channels to join for ${mobile}, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    continue;
                }
                currentChannel = channels.shift();
                this.logger.debug(`${mobile} has ${channels.length} pending channels to join, processing:`, `@${currentChannel.username}`);
                this.joinChannelMap.set(mobile, channels);
                const activeChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                if (activeChannel && activeChannel.banned == true) {
                    this.logger.debug(`Skipping Channel ${activeChannel.channelId} as it is banned`);
                }
                else {
                    await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                }
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error: `, false);
                this.logger.error(`Error joining channel for ${mobile}: ${error.message}`);
                if (errorDetails.error === 'FloodWaitError' ||
                    error.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    try {
                        await (0, Helpers_1.sleep)(4000 + Math.random() * 2000);
                        if (error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            await this.update(mobile, { channels: 400 });
                        }
                        else {
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                    }
                    catch (updateError) {
                        this.logger.error(`Error updating channel count for ${mobile}:`, updateError);
                    }
                }
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    this.removeFromBufferMap(mobile);
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
            }
            finally {
                try {
                    await connection_manager_1.connectionManager.unregisterClient(mobile);
                }
                catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }
                if (i < keys.length - 1 || this.joinChannelMap.get(mobile)?.length > 0) {
                    await (0, Helpers_1.sleep)(this.CHANNEL_PROCESSING_DELAY + Math.random() * 10000);
                }
                else {
                    this.logger.log(`Not Sleeping before continuing with next Mobile`);
                }
            }
        }
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.activeTimeouts.delete(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
        this.isJoinChannelProcessing = false;
    }
    removeFromLeaveMap(key) {
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
        }
    }
    clearLeaveMap() {
        const mapSize = this.leaveChannelMap.size;
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
        this.logger.debug(`LeaveMap cleared, removed ${mapSize} entries`);
    }
    async leaveChannelQueue() {
        this.logger.debug('Attempting to start leave channel queue');
        if (this.isLeaveChannelProcessing) {
            this.logger.warn('Leave channel process is already running');
            return;
        }
        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }
        if (!this.leaveChannelIntervalId) {
            this.logger.debug('Starting leave channel interval');
            this.leaveChannelIntervalId = setInterval(async () => {
                await this.processLeaveChannelInterval();
            }, this.LEAVE_CHANNEL_INTERVAL);
            this.activeTimeouts.add(this.leaveChannelIntervalId);
            await this.processLeaveChannelInterval();
        }
        else {
            this.logger.debug('Leave channel interval is already running');
        }
    }
    async processLeaveChannelInterval() {
        if (this.isLeaveChannelProcessing) {
            this.logger.debug('Leave channel process already running, skipping interval');
            return;
        }
        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, clearing interval');
            this.clearLeaveChannelInterval();
            return;
        }
        this.isLeaveChannelProcessing = true;
        try {
            await this.processLeaveChannelSequentially();
        }
        catch (error) {
            this.logger.error('Error in leave channel queue', error);
        }
        finally {
            this.isLeaveChannelProcessing = false;
            if (this.leaveChannelMap.size === 0) {
                this.logger.debug('No more channels to leave, clearing interval');
                this.clearLeaveChannelInterval();
            }
        }
    }
    async processLeaveChannelSequentially() {
        const keys = Array.from(this.leaveChannelMap.keys());
        this.logger.debug(`Processing leave channel queue sequentially for ${keys.length} clients`);
        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            try {
                const channels = this.leaveChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.logger.debug(`No more channels to leave for ${mobile}, removing from queue`);
                    this.removeFromLeaveMap(mobile);
                    continue;
                }
                const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);
                this.logger.debug(`${mobile} has ${channels.length} pending channels to leave, processing ${channelsToProcess.length} channels`);
                if (channels.length > 0) {
                    this.leaveChannelMap.set(mobile, channels);
                }
                else {
                    this.removeFromLeaveMap(mobile);
                }
                const client = await connection_manager_1.connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });
                this.logger.debug(`${mobile} attempting to leave ${channelsToProcess.length} channels`);
                await client.leaveChannels(channelsToProcess);
                this.logger.debug(`${mobile} left ${channelsToProcess.length} channels successfully`);
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `${mobile} Leave Channel ERR: `, false);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                    this.removeFromLeaveMap(mobile);
                }
                else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorDetails.message}`);
                }
            }
            finally {
                try {
                    await connection_manager_1.connectionManager.unregisterClient(mobile);
                }
                catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${mobile}:`, unregisterError);
                }
                if (i < keys.length - 1 ||
                    this.leaveChannelMap.get(mobile)?.length > 0) {
                    await (0, Helpers_1.sleep)((this.LEAVE_CHANNEL_INTERVAL / 2) + Math.random() * 60000);
                }
            }
        }
    }
    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval: ${this.leaveChannelIntervalId}`);
            clearInterval(this.leaveChannelIntervalId);
            this.activeTimeouts.delete(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
        this.logger.debug('Leave channel interval cleared and processing flag reset');
    }
    async setAsBufferClient(mobile, clientId, availableDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new common_1.ConflictException('BufferClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        const existingAssignment = await this.bufferClientModel.findOne({ mobile, clientId: { $exists: true } });
        if (!clientMobiles.includes(mobile) && !existingAssignment) {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, {
                autoDisconnect: false
            });
            try {
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(30000 + Math.random() * 15000);
                const channels = await this.telegramService.getChannelInfo(mobile, true);
                const newSession = await this.telegramService.createNewSession(user.mobile);
                const bufferClient = {
                    tgId: user.tgId,
                    session: newSession,
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                    clientId,
                    status: 'active',
                    message: 'Manually configured as buffer client',
                    lastUsed: null,
                };
                await this.bufferClientModel
                    .findOneAndUpdate({ mobile: user.mobile }, { $set: bufferClient }, { new: true, upsert: true })
                    .exec();
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `Failed to set as Buffer Client ${mobile}`);
                throw new common_1.HttpException(errorDetails.message, errorDetails.status);
            }
            await connection_manager_1.connectionManager.unregisterClient(mobile);
            return 'Client set as buffer successfully';
        }
        else {
            throw new common_1.BadRequestException('Number is an Active Client');
        }
    }
    async checkBufferClients() {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return;
        }
        const clients = await this.clientService.findAll();
        const promoteClients = await this.promoteClientService.findAll();
        const clientMainMobiles = clients.map((c) => c.mobile);
        const assignedBufferMobiles = await this.bufferClientModel
            .find({ clientId: { $exists: true }, status: 'active' })
            .distinct('mobile');
        const goodIds = [
            ...clientMainMobiles,
            ...promoteClients.map((c) => c.mobile),
            ...assignedBufferMobiles,
        ].filter(Boolean);
        const bufferClientsPerClient = new Map();
        const clientNeedingBufferClients = [];
        const bufferClientCounts = await this.bufferClientModel.aggregate([
            {
                $match: {
                    clientId: { $exists: true, $ne: null },
                    status: 'active',
                },
            },
            {
                $group: {
                    _id: '$clientId',
                    count: { $sum: 1 },
                    mobiles: { $push: '$mobile' },
                },
            },
        ]);
        let totalUpdates = 0;
        for (const result of bufferClientCounts) {
            bufferClientsPerClient.set(result._id, result.count);
            if (totalUpdates < 5) {
                for (const bufferClientMobile of result.mobiles) {
                    const bufferClient = await this.findOne(bufferClientMobile);
                    const client = clients.find((c) => c.clientId === result._id);
                    totalUpdates += await this.processBufferClient(bufferClient, client);
                }
            }
            else {
                this.logger.warn(`Skipping buffer client ${result.mobiles.join(', ')} as total updates reached 5`);
            }
        }
        for (const client of clients) {
            const assignedCount = bufferClientsPerClient.get(client.clientId) || 0;
            bufferClientsPerClient.set(client.clientId, assignedCount);
            const needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - assignedCount);
            if (needed > 0) {
                clientNeedingBufferClients.push(client.clientId);
            }
        }
        let totalSlotsNeeded = 0;
        for (const clientId of clientNeedingBufferClients) {
            if (totalSlotsNeeded >= this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER)
                break;
            const assignedCount = bufferClientsPerClient.get(clientId) || 0;
            const needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - assignedCount);
            const allocatedForThisClient = Math.min(needed, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER - totalSlotsNeeded);
            totalSlotsNeeded += allocatedForThisClient;
        }
        this.logger.debug(`Buffer clients per client: ${JSON.stringify(Object.fromEntries(bufferClientsPerClient))}`);
        this.logger.debug(`Clients needing buffer clients: ${clientNeedingBufferClients.join(', ')}`);
        this.logger.debug(`Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER} per trigger)`);
        const totalActiveBufferClients = await this.bufferClientModel.countDocuments({ status: 'active' });
        this.logger.debug(`Total active buffer clients: ${totalActiveBufferClients}`);
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Buffer Client Check:\n\nTotal Active Buffer Clients: ${totalActiveBufferClients}\nBuffer Clients Per Client: ${JSON.stringify(Object.fromEntries(bufferClientsPerClient))}\nClients Needing Buffer Clients: ${clientNeedingBufferClients.join(', ')}\nTotal Slots Needed: ${totalSlotsNeeded}`)}`);
        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoBufferClients([], goodIds, clientNeedingBufferClients, bufferClientsPerClient);
        }
        else {
            this.logger.debug('No new buffer clients needed - all clients have sufficient buffer clients');
        }
    }
    async processBufferClient(doc, client) {
        if (doc.inUse && doc.lastUsed !== null) {
            this.logger.debug(`[BufferClientService] Buffer client ${doc.mobile} is already in use`);
            return 0;
        }
        let cli;
        let updateCount = 0;
        const MAX_UPDATES_PER_RUN = 2;
        try {
            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
            cli = await connection_manager_1.connectionManager.getClient(doc.mobile, {
                autoDisconnect: true,
                handler: false,
            });
            const lastUsed = doc.lastUsed ? new Date(doc.lastUsed).getTime() : 0;
            const now = Date.now();
            if (lastUsed && now - lastUsed < 30 * 60 * 1000) {
                this.logger.warn(`[BufferClientService] Client ${doc.mobile} recently used, skipping to avoid rate limits`);
                return 0;
            }
            const me = await cli.getMe();
            await (0, Helpers_1.sleep)(5000 + Math.random() * 10000);
            if (doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) &&
                doc.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
                (!doc.privacyUpdatedAt || doc.privacyUpdatedAt < new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN) {
                try {
                    await cli.updatePrivacyforDeletedAccount();
                    await this.update(doc.mobile, { privacyUpdatedAt: new Date() });
                    updateCount++;
                    this.logger.debug(`[BufferClientService] Updated privacy settings for ${doc.mobile}`);
                    await (0, Helpers_1.sleep)(20000 + Math.random() * 15000);
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error in Updating Privacy: ${doc.mobile}`, true);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                }
            }
            if (doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) &&
                doc.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
                (!doc.profilePicsDeletedAt || doc.profilePicsDeletedAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN) {
                try {
                    const photos = await cli.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                        userId: 'me',
                        offset: 0,
                    }));
                    if (photos.photos.length > 0) {
                        await cli.deleteProfilePhotos();
                        await this.update(doc.mobile, { profilePicsDeletedAt: new Date() });
                        updateCount++;
                        this.logger.debug(`[BufferClientService] Deleted profile photos for ${doc.mobile}`);
                        await (0, Helpers_1.sleep)(20000 + Math.random() * 15000);
                    }
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error in Deleting Photos: ${doc.mobile}`, true);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                }
            }
            if (doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) &&
                doc.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
                doc.channels > 100 &&
                (!doc.nameBioUpdatedAt || doc.nameBioUpdatedAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN) {
                const normalizeString = (str) => {
                    return (str || '').toString().toLowerCase().trim().replace(/\s+/g, ' ').normalize('NFC');
                };
                const safeAttemptReverse = (val) => {
                    try {
                        return (0, utils_1.attemptReverseFuzzy)(val ?? '') || '';
                    }
                    catch {
                        return '';
                    }
                };
                const actualName = normalizeString(safeAttemptReverse(me?.firstName || ''));
                const expectedName = normalizeString(client.name || '');
                if (actualName !== expectedName) {
                    try {
                        this.logger.log(`[BufferClientService] Updating first name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                        await cli.updateProfile((0, utils_1.obfuscateText)(client.name, {
                            maintainFormatting: false,
                            preserveCase: true,
                            useInvisibleChars: false
                        }), (0, utils_1.obfuscateText)(`Genuine Paid Girl${(0, utils_1.getRandomEmoji)()}, Best Services${(0, utils_1.getRandomEmoji)()}`, {
                            maintainFormatting: false,
                            preserveCase: true,
                        }));
                        await this.update(doc.mobile, { nameBioUpdatedAt: new Date() });
                        updateCount++;
                        this.logger.debug(`[BufferClientService] Updated name and bio for ${doc.mobile}`);
                        await (0, Helpers_1.sleep)(20000 + Math.random() * 15000);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `Error in Updating Profile: ${doc.mobile}`, true);
                        if ((0, isPermanentError_1.default)(errorDetails)) {
                            await this.markAsInactive(doc.mobile, errorDetails.message);
                            return updateCount;
                        }
                    }
                }
            }
            if (doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) &&
                doc.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
                doc.channels > 150 &&
                (!doc.usernameUpdatedAt || doc.usernameUpdatedAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN) {
                try {
                    await this.telegramService.updateUsernameForAClient(doc.mobile, client.clientId, client.name, me.username);
                    await this.update(doc.mobile, { usernameUpdatedAt: new Date() });
                    updateCount++;
                    this.logger.debug(`[BufferClientService] Updated username for ${doc.mobile}`);
                    await (0, Helpers_1.sleep)(20000 + Math.random() * 15000);
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error in Updating Username: ${doc.mobile}`, true);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                }
            }
            if (doc.createdAt &&
                doc.createdAt < new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) &&
                doc.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) &&
                doc.channels > 170 &&
                (!doc.profilePicsUpdatedAt || doc.profilePicsUpdatedAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) &&
                updateCount < MAX_UPDATES_PER_RUN) {
                try {
                    const rootPath = process.cwd();
                    const photos = await cli.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                        userId: 'me',
                        offset: 0,
                    }));
                    if (photos.photos.length < 1) {
                        await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                        await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
                        const photoPaths = ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'];
                        for (const photo of photoPaths) {
                            if (updateCount >= MAX_UPDATES_PER_RUN)
                                break;
                            await cli.updateProfilePic(path_1.default.join(rootPath, photo));
                            updateCount++;
                            this.logger.debug(`[BufferClientService] Updated profile photo ${photo} for ${doc.mobile}`);
                            await (0, Helpers_1.sleep)(20000 + Math.random() * 15000);
                        }
                        await this.update(doc.mobile, { profilePicsUpdatedAt: new Date() });
                    }
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error in Updating Profile Photos: ${doc.mobile}`, true);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                }
            }
            return updateCount;
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Error with client ${doc.mobile}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(doc.mobile, `${errorDetails.message}`);
            }
            return 0;
        }
        finally {
            try {
                if (cli)
                    await connection_manager_1.connectionManager.unregisterClient(doc.mobile);
            }
            catch (unregisterError) {
                this.logger.error(`[BufferClientService] Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds, clientsNeedingBufferClients = [], bufferClientsPerClient) {
        const sixMonthsAgo = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
        let totalNeededFromClients = 0;
        for (const clientId of clientsNeedingBufferClients) {
            let needed = 0;
            if (bufferClientsPerClient) {
                const currentCount = bufferClientsPerClient.get(clientId) || 0;
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            }
            else {
                const currentCount = await this.bufferClientModel.countDocuments({
                    clientId,
                    status: 'active',
                });
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            }
            totalNeededFromClients += needed;
        }
        const totalNeeded = Math.min(totalNeededFromClients, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER);
        if (totalNeeded === 0) {
            this.logger.debug('No buffer clients needed - all clients have sufficient buffer clients or limit reached');
            return;
        }
        this.logger.debug(`Limited to creating ${totalNeeded} new buffer clients (max ${this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER} per trigger)`);
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: sixMonthsAgo },
            totalChats: { $gt: 150 },
        }, { tgId: 1 }, totalNeeded + 5);
        this.logger.debug(`New buffer documents to be added: ${documents.length} for ${clientsNeedingBufferClients.length} clients needing buffer clients (limited to ${totalNeeded})`);
        let processedCount = 0;
        const clientAssignmentTracker = new Map();
        for (const clientId of clientsNeedingBufferClients) {
            let needed = 0;
            if (bufferClientsPerClient) {
                const currentCount = bufferClientsPerClient.get(clientId) || 0;
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            }
            else {
                const currentCount = await this.bufferClientModel.countDocuments({
                    clientId,
                    status: 'active',
                });
                needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - currentCount);
            }
            clientAssignmentTracker.set(clientId, needed);
        }
        while (processedCount < Math.min(totalNeeded, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER) &&
            documents.length > 0 &&
            clientsNeedingBufferClients.length > 0) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }
            let targetClientId = null;
            for (const clientId of clientsNeedingBufferClients) {
                const needed = clientAssignmentTracker.get(clientId) || 0;
                if (needed > 0) {
                    targetClientId = clientId;
                    break;
                }
            }
            if (!targetClientId) {
                this.logger.debug('All clients have sufficient buffer clients assigned');
                break;
            }
            try {
                const client = await connection_manager_1.connectionManager.getClient(document.mobile, {
                    autoDisconnect: false,
                });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await (0, Helpers_1.sleep)(10000 + Math.random() * 10000);
                        await client.set2fa();
                        this.logger.debug('Waiting for setting 2FA');
                        await (0, Helpers_1.sleep)(20000 + Math.random() * 20000);
                        const channels = await this.telegramService.getChannelInfo(document.mobile, true);
                        const newSession = await this.telegramService.createNewSession(document.mobile);
                        this.logger.debug(`Inserting Document for client ${targetClientId}`);
                        const bufferClient = {
                            tgId: document.tgId,
                            session: newSession,
                            mobile: document.mobile,
                            lastUsed: null,
                            availableDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            clientId: targetClientId,
                            status: 'active',
                            message: 'Account successfully configured as buffer client',
                        };
                        await this.create(bufferClient);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        }
                        catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA status for ${document.mobile}:`, userUpdateError);
                        }
                        this.logger.log(`=============Created BufferClient for ${targetClientId}==============`);
                    }
                    else {
                        this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        }
                        catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA status for ${document.mobile}:`, userUpdateError);
                        }
                    }
                    const currentNeeded = clientAssignmentTracker.get(targetClientId) || 0;
                    const newNeeded = Math.max(0, currentNeeded - 1);
                    clientAssignmentTracker.set(targetClientId, newNeeded);
                    if (newNeeded === 0) {
                        const index = clientsNeedingBufferClients.indexOf(targetClientId);
                        if (index > -1) {
                            clientsNeedingBufferClients.splice(index, 1);
                        }
                    }
                    this.logger.debug(`Client ${targetClientId}: ${newNeeded} more needed, ${totalNeeded - processedCount - 1} remaining in this batch`);
                    processedCount++;
                }
                catch (error) {
                    (0, parseError_1.parseError)(error, `Error processing client ${document.mobile}`);
                    processedCount++;
                }
                finally {
                    try {
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                    }
                    catch (unregisterError) {
                        this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                    }
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error, `Error creating client connection for ${document.mobile}`);
            }
        }
        this.logger.log(`✅ Batch completed: Created ${processedCount} new buffer clients (max ${totalNeeded} per trigger)`);
        if (clientsNeedingBufferClients.length > 0) {
            const stillNeeded = clientsNeedingBufferClients
                .map((clientId) => {
                const needed = clientAssignmentTracker.get(clientId) || 0;
                return `${clientId}:${needed}`;
            })
                .join(', ');
            this.logger.log(`⏳ Still needed in future triggers: ${stillNeeded}`);
        }
        else {
            this.logger.log(`🎉 All clients now have sufficient buffer clients!`);
        }
    }
    async updateAllClientSessions() {
        const bufferClients = await this.findAll('active');
        for (let i = 0; i < bufferClients.length; i++) {
            const bufferClient = bufferClients[i];
            try {
                this.logger.log(`Creating new session for mobile: ${bufferClient.mobile} (${i + 1}/${bufferClients.length})`);
                const client = await connection_manager_1.connectionManager.getClient(bufferClient.mobile, {
                    autoDisconnect: false,
                    handler: true,
                });
                try {
                    const hasPassword = await client.hasPassword();
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await (0, Helpers_1.sleep)(20000 + Math.random() * 10000);
                        await client.set2fa();
                        await (0, Helpers_1.sleep)(60000 + Math.random() * 30000);
                    }
                    const newSession = await this.telegramService.createNewSession(bufferClient.mobile);
                    await this.update(bufferClient.mobile, {
                        session: newSession,
                        lastUsed: null,
                        message: 'Session updated successfully',
                    });
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Failed to create new session for ${bufferClient.mobile}`);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.update(bufferClient.mobile, {
                            status: 'inactive',
                            message: `Session update failed: ${errorDetails.message}`,
                        });
                    }
                }
                finally {
                    await connection_manager_1.connectionManager.unregisterClient(bufferClient.mobile);
                    await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                }
            }
            catch (error) {
                this.logger.error(`Error creating client connection for ${bufferClient.mobile}: ${error.message}`);
                (0, parseError_1.parseError)(error);
            }
        }
    }
    async getBufferClientsByClientId(clientId, status) {
        const filter = { clientId };
        if (status) {
            filter.status = status;
        }
        return this.bufferClientModel.find(filter).exec();
    }
    async getBufferClientDistribution() {
        const clients = await this.clientService.findAll();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const [totalBufferClients, unassignedBufferClients, activeBufferClients, inactiveBufferClients, assignedCounts, activeCounts, inactiveCounts, neverUsedCounts, recentlyUsedCounts,] = await Promise.all([
            this.bufferClientModel.countDocuments(),
            this.bufferClientModel.countDocuments({ clientId: { $exists: false } }),
            this.bufferClientModel.countDocuments({ status: 'active' }),
            this.bufferClientModel.countDocuments({ status: 'inactive' }),
            this.bufferClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null } } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'inactive' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
                    },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.bufferClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        lastUsed: { $gte: last24Hours },
                    },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
        ]);
        const assignedCountMap = new Map(assignedCounts.map((item) => [item._id, item.count]));
        const activeCountMap = new Map(activeCounts.map((item) => [item._id, item.count]));
        const inactiveCountMap = new Map(inactiveCounts.map((item) => [item._id, item.count]));
        const neverUsedCountMap = new Map(neverUsedCounts.map((item) => [item._id, item.count]));
        const recentlyUsedCountMap = new Map(recentlyUsedCounts.map((item) => [item._id, item.count]));
        const distributionPerClient = [];
        let clientsWithSufficient = 0;
        let clientsNeedingMore = 0;
        let totalNeeded = 0;
        for (const client of clients) {
            const assignedCount = assignedCountMap.get(client.clientId) || 0;
            const activeCount = activeCountMap.get(client.clientId) || 0;
            const inactiveCount = inactiveCountMap.get(client.clientId) || 0;
            const neverUsed = neverUsedCountMap.get(client.clientId) || 0;
            const usedInLast24Hours = recentlyUsedCountMap.get(client.clientId) || 0;
            const needed = Math.max(0, this.MAX_NEEDED_BUFFER_CLIENTS_PER_CLIENT - activeCount);
            const status = needed === 0 ? 'sufficient' : 'needs_more';
            distributionPerClient.push({
                clientId: client.clientId,
                assignedCount,
                activeCount,
                inactiveCount,
                needed,
                status,
                neverUsed,
                usedInLast24Hours,
            });
            if (status === 'sufficient') {
                clientsWithSufficient++;
            }
            else {
                clientsNeedingMore++;
                totalNeeded += needed;
            }
        }
        const maxPerTrigger = this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER;
        const triggersNeeded = Math.ceil(totalNeeded / maxPerTrigger);
        return {
            totalBufferClients,
            unassignedBufferClients,
            activeBufferClients,
            inactiveBufferClients,
            distributionPerClient,
            summary: {
                clientsWithSufficientBufferClients: clientsWithSufficient,
                clientsNeedingBufferClients: clientsNeedingMore,
                totalBufferClientsNeeded: totalNeeded,
                maxBufferClientsPerTrigger: maxPerTrigger,
                triggersNeededToSatisfyAll: triggersNeeded,
            },
        };
    }
    async getBufferClientsByStatus(status) {
        return this.bufferClientModel.find({ status }).exec();
    }
    async getBufferClientsWithMessages() {
        return this.bufferClientModel
            .find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 })
            .exec();
    }
    async getLeastRecentlyUsedBufferClients(clientId, limit = 1) {
        return this.bufferClientModel
            .find({ clientId, status: 'active' })
            .sort({ lastUsed: 1, _id: 1 })
            .limit(limit)
            .exec();
    }
    async getNextAvailableBufferClient(clientId) {
        const clients = await this.getLeastRecentlyUsedBufferClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }
    async getUnusedBufferClients(hoursAgo = 24, clientId) {
        const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const filter = {
            status: 'active',
            $or: [
                { lastUsed: { $lt: cutoffDate } },
                { lastUsed: { $exists: false } },
                { lastUsed: null },
            ],
        };
        if (clientId) {
            filter.clientId = clientId;
        }
        return this.bufferClientModel.find(filter).exec();
    }
    async getUsageStatistics(clientId) {
        const filter = { status: 'active' };
        if (clientId) {
            filter.clientId = clientId;
        }
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const [totalClients, neverUsed, usedInLast24Hours, usedInLastWeek, allClients,] = await Promise.all([
            this.bufferClientModel.countDocuments(filter),
            this.bufferClientModel.countDocuments({
                ...filter,
                $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
            }),
            this.bufferClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: last24Hours },
            }),
            this.bufferClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: lastWeek },
            }),
            this.bufferClientModel.find(filter, { lastUsed: 1, createdAt: 1 }).exec(),
        ]);
        let totalGap = 0;
        let gapCount = 0;
        for (const client of allClients) {
            if (client.lastUsed) {
                const gap = now.getTime() - new Date(client.lastUsed).getTime();
                totalGap += gap;
                gapCount++;
            }
        }
        const averageUsageGap = gapCount > 0 ? totalGap / gapCount / (60 * 60 * 1000) : 0;
        return {
            totalClients,
            neverUsed,
            usedInLast24Hours,
            usedInLastWeek,
            averageUsageGap,
        };
    }
    async markAsUsed(mobile, message) {
        const updateData = { lastUsed: new Date() };
        if (message) {
            updateData.message = message;
        }
        return this.update(mobile, updateData);
    }
};
exports.BufferClientService = BufferClientService;
exports.BufferClientService = BufferClientService = BufferClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('bufferClientModule')),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => promote_client_service_1.PromoteClientService))),
    __param(7, (0, common_1.Inject)((0, common_1.forwardRef)(() => session_manager_1.SessionService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        client_service_1.ClientService,
        channels_service_1.ChannelsService,
        promote_client_service_1.PromoteClientService,
        session_manager_1.SessionService])
], BufferClientService);
//# sourceMappingURL=buffer-client.service.js.map