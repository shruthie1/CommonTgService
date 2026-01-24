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
const checkMe_utils_1 = require("../../utils/checkMe.utils");
const bots_1 = require("../bots");
const client_helper_utils_1 = require("../shared/client-helper.utils");
let BufferClientService = BufferClientService_1 = class BufferClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, promoteClientService, sessionService, botsService) {
        this.bufferClientModel = bufferClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.promoteClientService = promoteClientService;
        this.sessionService = sessionService;
        this.botsService = botsService;
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
        this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER = 10;
        this.MIN_TOTAL_BUFFER_CLIENTS = 10;
        this.AVAILABILITY_WINDOWS = [
            { name: 'today', days: 0, minRequired: 3 },
            { name: 'tomorrow', days: 1, minRequired: 5 },
            { name: 'oneWeek', days: 7, minRequired: 7 },
            { name: 'tenDays', days: 10, minRequired: 9 }
        ];
        this.ONE_DAY_MS = 24 * 60 * 60 * 1000;
        this.THREE_MONTHS_MS = 3 * 30 * this.ONE_DAY_MS;
        this.INACTIVE_USER_CUTOFF_DAYS = 90;
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
    async safeUnregisterClient(mobile) {
        try {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
        catch (unregisterError) {
            const errorMessage = unregisterError instanceof Error ? unregisterError.message : 'Unknown error';
            this.logger.error(`Error unregistering client ${mobile}: ${errorMessage}`);
        }
    }
    handleError(error, context, mobile) {
        const contextWithMobile = mobile ? `${context}: ${mobile}` : context;
        return (0, parseError_1.parseError)(error, contextWithMobile, false);
    }
    async create(bufferClient) {
        const result = await this.bufferClientModel.create({
            ...bufferClient,
            status: bufferClient.status || 'active',
        });
        this.logger.log(`Buffer Client Created:\n\nMobile: ${bufferClient.mobile}`);
        this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `Buffer Client Created:\n\nMobile: ${bufferClient.mobile}`);
        return result;
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
            .findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, returnDocument: 'after' })
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
            const createDto = {
                ...createorUpdateBufferClientDto,
                status: createorUpdateBufferClientDto.status || 'active',
            };
            return this.create(createDto);
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
        if (filter.tgId === "refresh") {
            this.updateAllClientSessions().catch((error) => {
                this.logger.error('Error updating all client sessions:', error);
            });
            return [];
        }
        return await this.bufferClientModel.find(filter).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        if (!query) {
            throw new common_1.BadRequestException('Query is invalid.');
        }
        try {
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
            if (error instanceof common_1.BadRequestException || error instanceof common_1.NotFoundException) {
                throw error;
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new common_1.InternalServerErrorException(`Query execution failed: ${errorMessage}`);
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
        await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `Buffer Client:\n\nStatus Updated to ${status}\nMobile: ${mobile}\nReason: ${message || ''}`);
        return await this.update(mobile, updateData);
    }
    async markAsInactive(mobile, reason) {
        try {
            this.logger.log(`Marking buffer client ${mobile} as inactive: ${reason}`);
            return await this.updateStatus(mobile, 'inactive', reason);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Failed to mark buffer client ${mobile} as inactive: ${errorMessage}`);
            return null;
        }
    }
    async updateInfo() {
        const clients = await this.bufferClientModel
            .find({
            status: 'active',
            lastChecked: { $lt: new Date(Date.now() - 7 * this.ONE_DAY_MS) }
        })
            .sort({ channels: 1 })
            .limit(25);
        this.logger.debug(`Updating info for ${clients.length} buffer clients`);
        const now = Date.now();
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client.mobile;
            this.logger.info(`Updating info for client ${i + 1}/${clients.length}: ${mobile}`);
            const lastChecked = client.lastChecked
                ? new Date(client.lastChecked).getTime()
                : 0;
            await this.performHealthCheck(mobile, lastChecked, now);
            if (i < clients.length - 1) {
                await (0, Helpers_1.sleep)(12000 + Math.random() * 8000);
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
                await this.safeUnregisterClient(mobile);
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
            this.createTimeout(() => this.processJoinChannelInterval(), 1000);
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
                if (!currentChannel) {
                    this.logger.debug(`No channel to process for ${mobile}, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    continue;
                }
                this.logger.debug(`${mobile} has ${channels.length} pending channels to join, processing:`, `@${currentChannel.username}`);
                this.joinChannelMap.set(mobile, channels);
                const activeChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                if (activeChannel && activeChannel.banned === true) {
                    this.logger.debug(`Skipping Channel ${activeChannel.channelId} as it is banned`);
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                    continue;
                }
                else {
                    await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                }
            }
            catch (error) {
                const errorDetails = this.handleError(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error`, mobile);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.error(`Error joining channel for ${mobile}: ${errorMessage}`);
                const errorObj = error;
                if (errorDetails.error === 'FloodWaitError' ||
                    errorObj.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    try {
                        await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                        if (errorObj.errorMessage === 'CHANNELS_TOO_MUCH') {
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
                await this.safeUnregisterClient(mobile);
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
            this.createTimeout(() => this.processLeaveChannelInterval(), 1000);
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
                const errorDetails = this.handleError(error, `${mobile} Leave Channel Error`, mobile);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                    this.removeFromLeaveMap(mobile);
                }
                else {
                    this.logger.warn(`Transient error for ${mobile}: ${errorDetails.message}`);
                }
            }
            finally {
                await this.safeUnregisterClient(mobile);
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
    async setAsBufferClient(mobile, clientId, availableDate = client_helper_utils_1.ClientHelperUtils.getTodayDateString()) {
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
        if (clientMobiles.includes(mobile)) {
            throw new common_1.BadRequestException('Number is an Active Client');
        }
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, {
            autoDisconnect: false
        });
        try {
            await telegramClient.set2fa();
            await (0, Helpers_1.sleep)(30000 + Math.random() * 30000);
            const channels = await this.telegramService.getChannelInfo(mobile, true);
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
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
        await this.safeUnregisterClient(mobile);
        return 'Client set as buffer successfully';
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
        const MIN_COOLDOWN_HOURS = 2;
        const MAX_UPDATES_PER_CYCLE = 5;
        const now = Date.now();
        const bufferClientsToProcess = [];
        for (const result of bufferClientCounts) {
            bufferClientsPerClient.set(result._id, result.count);
            const client = clients.find((c) => c.clientId === result._id);
            if (!client) {
                this.logger.warn(`Client with ID ${result._id} not found, skipping buffer clients`);
                continue;
            }
            for (const bufferClientMobile of result.mobiles) {
                const bufferClient = await this.findOne(bufferClientMobile, false);
                if (!bufferClient) {
                    this.logger.warn(`Buffer client ${bufferClientMobile} not found, skipping`);
                    continue;
                }
                const lastUpdateAttempt = bufferClient.lastUpdateAttempt
                    ? new Date(bufferClient.lastUpdateAttempt).getTime()
                    : 0;
                if (lastUpdateAttempt && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                    const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                    this.logger.debug(`Skipping ${bufferClientMobile} - on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                    continue;
                }
                if (bufferClient.inUse === true) {
                    this.logger.debug(`Skipping ${bufferClientMobile} - currently in use`);
                    continue;
                }
                const lastChecked = bufferClient.lastChecked
                    ? new Date(bufferClient.lastChecked).getTime()
                    : 0;
                const healthCheckPassed = await this.performHealthCheck(bufferClientMobile, lastChecked, now);
                if (!healthCheckPassed) {
                    continue;
                }
                if (bufferClient.lastUsed) {
                    const lastUsed = client_helper_utils_1.ClientHelperUtils.getTimestamp(bufferClient.lastUsed);
                    if (lastUsed > 0) {
                        await this.backfillTimestamps(bufferClientMobile, bufferClient, now);
                        this.logger.debug(`Skipping ${bufferClientMobile} - already used, timestamps backfilled`);
                        continue;
                    }
                }
                const pendingUpdates = this.getPendingUpdates(bufferClient, now);
                const accountAge = bufferClient.createdAt ? now - new Date(bufferClient.createdAt).getTime() : 0;
                const DAY = this.ONE_DAY_MS;
                const failedAttempts = bufferClient.failedUpdateAttempts || 0;
                const lastAttemptAgeHours = lastUpdateAttempt > 0
                    ? (now - lastUpdateAttempt) / (60 * 60 * 1000)
                    : 10000;
                const priority = (pendingUpdates.totalPending * 10000) +
                    lastAttemptAgeHours +
                    (accountAge / DAY) -
                    (failedAttempts * 100);
                bufferClientsToProcess.push({
                    bufferClient,
                    client,
                    clientId: result._id,
                    priority
                });
            }
        }
        bufferClientsToProcess.sort((a, b) => b.priority - a.priority);
        this.logger.debug(`Processing ${bufferClientsToProcess.length} buffer clients in priority order`);
        for (const { bufferClient, client, clientId } of bufferClientsToProcess) {
            if (totalUpdates >= MAX_UPDATES_PER_CYCLE) {
                this.logger.warn(`Reached total update limit of ${MAX_UPDATES_PER_CYCLE} for this check cycle`);
                break;
            }
            const currentUpdates = await this.processBufferClient(bufferClient, client);
            this.logger.debug(`Processed buffer client ${bufferClient.mobile} for client ${clientId}, current updates: ${currentUpdates} | total updates: ${totalUpdates + currentUpdates}`);
            if (currentUpdates > 0) {
                totalUpdates += currentUpdates;
            }
        }
        const clientNeedingBufferClients = [];
        for (const client of clients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(client.clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingBufferClients.push({
                    clientId: client.clientId,
                    ...availabilityNeeds
                });
            }
        }
        clientNeedingBufferClients.sort((a, b) => a.priority - b.priority);
        let totalSlotsNeeded = 0;
        const clientNeedsMap = new Map();
        for (const clientNeed of clientNeedingBufferClients) {
            const allocated = Math.min(clientNeed.totalNeeded, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER - totalSlotsNeeded);
            if (allocated > 0) {
                clientNeedsMap.set(clientNeed.clientId, allocated);
                totalSlotsNeeded += allocated;
            }
            if (totalSlotsNeeded >= this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER)
                break;
        }
        this.logger.debug(`Availability-based needs calculated (NO HARD LIMIT):`);
        clientNeedingBufferClients.forEach(need => {
            this.logger.debug(`Client ${need.clientId} (priority: ${need.priority}): ` +
                `${need.totalActive} total active, ${need.totalNeeded} new needed - ${need.calculationReason}`);
            need.windowNeeds.forEach(window => {
                if (window.needed > 0) {
                    this.logger.debug(`  - ${window.window} (${window.targetDate}): ` +
                        `${window.available} available, ${window.needed} needed ` +
                        `(target: ${window.minRequired} per window)`);
                }
                else {
                    this.logger.debug(`  - ${window.window} (${window.targetDate}): ` +
                        `${window.available} available ✅ (sufficient, target: ${window.minRequired})`);
                }
            });
        });
        const totalActiveBufferClients = await this.bufferClientModel.countDocuments({ status: 'active' });
        this.logger.debug(`Total active buffer clients: ${totalActiveBufferClients}`);
        this.logger.debug(`Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER} per trigger)`);
        const clientNeedsSummary = clientNeedingBufferClients
            .map(c => `${c.clientId}: ${c.totalNeeded} (${c.calculationReason})`)
            .join('\n');
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Buffer Client Check (Dynamic Availability):\n\nTotal Active Buffer Clients: ${totalActiveBufferClients}\nBuffer Clients Per Client: ${JSON.stringify(Object.fromEntries(bufferClientsPerClient))}\n\nClients Needing Buffer Clients:\n${clientNeedsSummary || 'None'}\n\nTotal Slots Needed: ${totalSlotsNeeded}`)}`);
        if (clientNeedingBufferClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoBufferClientsDynamic([], goodIds, clientNeedingBufferClients, bufferClientsPerClient);
        }
        else {
            this.logger.debug('No new buffer clients needed - all availability windows and total count satisfied');
        }
    }
    async updateUser2FAStatus(tgId, mobile) {
        try {
            await this.usersService.update(tgId, { twoFA: true });
        }
        catch (userUpdateError) {
            this.logger.warn(`Failed to update user 2FA status for ${mobile}:`, userUpdateError);
        }
    }
    async calculateAvailabilityBasedNeeds(clientId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];
        const windows = this.AVAILABILITY_WINDOWS.map(window => ({
            ...window,
            targetDate: new Date(today.getTime() + window.days * this.ONE_DAY_MS)
                .toISOString().split('T')[0]
        }));
        const totalActive = await this.bufferClientModel.countDocuments({
            clientId,
            status: 'active'
        });
        const windowNeeds = [];
        let maxNeeded = 0;
        let mostUrgentWindow = '';
        let mostUrgentPriority = 999;
        for (const window of windows) {
            const availableCount = await this.bufferClientModel.countDocuments({
                clientId,
                status: 'active',
                availableDate: { $lte: window.targetDate }
            });
            const needed = Math.max(0, window.minRequired - availableCount);
            windowNeeds.push({
                window: window.name,
                available: availableCount,
                needed,
                targetDate: window.targetDate,
                minRequired: window.minRequired
            });
            if (needed > maxNeeded) {
                maxNeeded = needed;
                mostUrgentWindow = window.name;
                mostUrgentPriority = window.days;
            }
            else if (needed > 0 && window.days < mostUrgentPriority) {
                mostUrgentWindow = window.name;
                mostUrgentPriority = window.days;
            }
        }
        const totalNeededForCount = Math.max(0, this.MIN_TOTAL_BUFFER_CLIENTS - totalActive);
        const totalNeeded = Math.max(maxNeeded, totalNeededForCount);
        let priority = 100;
        if (maxNeeded > 0) {
            priority = mostUrgentPriority;
        }
        let calculationReason = '';
        if (maxNeeded > 0 && totalNeededForCount > 0) {
            calculationReason = `Window '${mostUrgentWindow}' needs ${maxNeeded}, total count needs ${totalNeededForCount}`;
        }
        else if (maxNeeded > 0) {
            const windowConfig = this.AVAILABILITY_WINDOWS.find(w => w.name === mostUrgentWindow);
            calculationReason = `Window '${mostUrgentWindow}' needs ${maxNeeded} to meet minimum of ${windowConfig?.minRequired || 'unknown'}`;
        }
        else if (totalNeededForCount > 0) {
            calculationReason = `Total count needs ${totalNeededForCount} to reach minimum of ${this.MIN_TOTAL_BUFFER_CLIENTS}`;
        }
        else {
            calculationReason = 'All windows satisfied';
        }
        return {
            totalNeeded,
            windowNeeds,
            totalActive,
            totalNeededForCount,
            calculationReason,
            priority
        };
    }
    async backfillTimestamps(mobile, doc, now) {
        const needsBackfill = !doc.privacyUpdatedAt || !doc.profilePicsDeletedAt ||
            !doc.nameBioUpdatedAt || !doc.usernameUpdatedAt ||
            !doc.profilePicsUpdatedAt;
        if (!needsBackfill)
            return;
        this.logger.log(`Backfilling timestamp fields for ${mobile}`);
        const allTimestamps = client_helper_utils_1.ClientHelperUtils.createBackfillTimestamps(now, this.ONE_DAY_MS);
        const backfillData = {};
        if (!doc.privacyUpdatedAt)
            backfillData.privacyUpdatedAt = allTimestamps.privacyUpdatedAt;
        if (!doc.profilePicsDeletedAt)
            backfillData.profilePicsDeletedAt = allTimestamps.profilePicsDeletedAt;
        if (!doc.nameBioUpdatedAt)
            backfillData.nameBioUpdatedAt = allTimestamps.nameBioUpdatedAt;
        if (!doc.usernameUpdatedAt)
            backfillData.usernameUpdatedAt = allTimestamps.usernameUpdatedAt;
        if (!doc.profilePicsUpdatedAt)
            backfillData.profilePicsUpdatedAt = allTimestamps.profilePicsUpdatedAt;
        await this.update(mobile, backfillData);
        this.logger.log(`Backfilled ${Object.keys(backfillData).length} timestamp fields for ${mobile}`);
    }
    async performHealthCheck(mobile, lastChecked, now) {
        const needsHealthCheck = !lastChecked || (now - lastChecked > 7 * this.ONE_DAY_MS);
        if (!needsHealthCheck) {
            return true;
        }
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, {
                autoDisconnect: false,
                handler: false,
            });
            await telegramClient.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [new telegram_1.Api.InputPrivacyValueDisallowAll()],
            }));
            const channels = await (0, channelinfo_1.channelInfo)(telegramClient.client, true);
            await this.update(mobile, {
                channels: channels.ids.length,
                lastChecked: new Date()
            });
            this.logger.debug(`Health check passed for ${mobile}`);
            return true;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Health check failed', mobile);
            this.logger.warn(`Health check failed for ${mobile}: ${errorDetails.message}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(mobile, `Health check failed: ${errorDetails.message}`);
            }
            return false;
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
    }
    getPendingUpdates(doc, now) {
        const accountAge = doc.createdAt ? now - new Date(doc.createdAt).getTime() : 0;
        const DAY = this.ONE_DAY_MS;
        const MIN_DAYS_BETWEEN_UPDATES = DAY;
        const reasons = [];
        const privacyTimestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.privacyUpdatedAt);
        const needsPrivacy = accountAge >= DAY &&
            (privacyTimestamp === 0 || privacyTimestamp < now - 15 * DAY);
        if (needsPrivacy)
            reasons.push('Privacy update needed');
        const privacyDone = privacyTimestamp > 0 && (now - privacyTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const photosDeletedTimestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.profilePicsDeletedAt);
        const needsDeletePhotos = accountAge >= 2 * DAY &&
            (photosDeletedTimestamp === 0 || photosDeletedTimestamp < now - 30 * DAY) &&
            (privacyDone || privacyTimestamp === 0);
        if (needsDeletePhotos)
            reasons.push('Delete photos needed');
        const photosDone = photosDeletedTimestamp > 0 && (now - photosDeletedTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const nameBioTimestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.nameBioUpdatedAt);
        const needsNameBio = accountAge >= 3 * DAY &&
            (doc.channels || 0) > 100 &&
            (nameBioTimestamp === 0 || nameBioTimestamp < now - 30 * DAY) &&
            (photosDone || photosDeletedTimestamp === 0);
        if (needsNameBio)
            reasons.push('Name/Bio update needed');
        const nameBioDone = nameBioTimestamp > 0 && (now - nameBioTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const usernameTimestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.usernameUpdatedAt);
        const needsUsername = accountAge >= 7 * DAY &&
            (doc.channels || 0) > 150 &&
            (usernameTimestamp === 0 || usernameTimestamp < now - 30 * DAY) &&
            (nameBioDone || nameBioTimestamp === 0);
        if (needsUsername)
            reasons.push('Username update needed');
        const usernameDone = usernameTimestamp > 0 && (now - usernameTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const profilePicsTimestamp = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.profilePicsUpdatedAt);
        const needsProfilePhotos = accountAge >= 10 * DAY &&
            (doc.channels || 0) > 170 &&
            (profilePicsTimestamp === 0 || profilePicsTimestamp < now - 30 * DAY) &&
            (usernameDone || usernameTimestamp === 0);
        if (needsProfilePhotos)
            reasons.push('Profile photos update needed');
        const totalPending = [needsPrivacy, needsDeletePhotos, needsNameBio, needsUsername, needsProfilePhotos]
            .filter(Boolean).length;
        return {
            needsPrivacy,
            needsDeletePhotos,
            needsNameBio,
            needsUsername,
            needsProfilePhotos,
            totalPending,
            reasons
        };
    }
    async updatePrivacySettings(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            await telegramClient.updatePrivacyforDeletedAccount();
            await this.update(doc.mobile, {
                privacyUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            this.logger.debug(`Updated privacy settings for ${doc.mobile}`);
            await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
            return 1;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating privacy', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async deleteProfilePhotos(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            const photos = await telegramClient.client.invoke(new telegram_1.Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
            if (photos.photos.length > 0) {
                await telegramClient.deleteProfilePhotos();
                this.logger.debug(`Deleted ${photos.photos.length} profile photos for ${doc.mobile}`);
            }
            else {
                this.logger.debug(`No profile photos to delete for ${doc.mobile}`);
            }
            await this.update(doc.mobile, {
                profilePicsDeletedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
            return photos.photos.length > 0 ? 1 : 0;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error deleting photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async updateNameAndBio(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            const me = await telegramClient.getMe();
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            let updateCount = 0;
            if (!(0, checkMe_utils_1.isIncludedWithTolerance)((0, checkMe_utils_1.safeAttemptReverse)(me.firstName), client.name)) {
                this.logger.log(`Updating name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                await telegramClient.updateProfile(`${(0, utils_1.obfuscateText)(client.name, {
                    maintainFormatting: false,
                    preserveCase: true,
                    useInvisibleChars: false
                })} ${(0, utils_1.getCuteEmoji)()}`, '');
                updateCount = 1;
            }
            await this.update(doc.mobile, {
                nameBioUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            this.logger.debug(`Updated name and bio for ${doc.mobile}`);
            await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
            return updateCount;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating profile', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async updateUsername(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            const me = await telegramClient.getMe();
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            await this.telegramService.updateUsernameForAClient(doc.mobile, client.clientId, client.name, me.username);
            await this.update(doc.mobile, {
                usernameUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            this.logger.debug(`Updated username for ${doc.mobile}`);
            await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
            return 1;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating username', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async updateProfilePhotos(doc, client, failedAttempts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
        try {
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            const photos = await telegramClient.client.invoke(new telegram_1.Api.photos.GetUserPhotos({ userId: 'me', offset: 0 }));
            let updateCount = 0;
            if (photos.photos.length < 2) {
                await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                const photoPaths = ['dp1.jpg', 'dp2.jpg', 'dp3.jpg'];
                const randomPhoto = photoPaths[Math.floor(Math.random() * photoPaths.length)];
                await telegramClient.updateProfilePic(path_1.default.join(process.cwd(), randomPhoto));
                updateCount = 1;
                this.logger.debug(`Updated profile photo ${randomPhoto} for ${doc.mobile}`);
            }
            await this.update(doc.mobile, {
                profilePicsUpdatedAt: new Date(),
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: 0,
                lastUpdateFailure: null
            });
            await (0, Helpers_1.sleep)(40000 + Math.random() * 20000);
            return updateCount;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error updating profile photos', doc.mobile);
            await this.update(doc.mobile, {
                lastUpdateAttempt: new Date(),
                failedUpdateAttempts: failedAttempts + 1,
                lastUpdateFailure: new Date()
            });
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        }
        finally {
            await this.safeUnregisterClient(doc.mobile);
        }
    }
    async processBufferClient(doc, client) {
        if (doc.inUse === true) {
            this.logger.debug(`Buffer client ${doc.mobile} is marked as in use`);
            return 0;
        }
        if (!client) {
            this.logger.warn(`Client not found for buffer client ${doc.mobile}`);
            return 0;
        }
        const MIN_COOLDOWN_HOURS = 2;
        const MAX_FAILED_ATTEMPTS = 3;
        const FAILURE_RESET_DAYS = 7;
        const now = Date.now();
        let updateCount = 0;
        try {
            await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
            const failedAttempts = doc.failedUpdateAttempts || 0;
            const lastFailureTime = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.lastUpdateFailure);
            if (failedAttempts > 0 && lastFailureTime > 0 && now - lastFailureTime > FAILURE_RESET_DAYS * this.ONE_DAY_MS) {
                this.logger.log(`Resetting failure count for ${doc.mobile} (last failure was ${Math.floor((now - lastFailureTime) / this.ONE_DAY_MS)} days ago)`);
                await this.update(doc.mobile, {
                    failedUpdateAttempts: 0,
                    lastUpdateFailure: null
                });
            }
            else if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                this.logger.warn(`Skipping ${doc.mobile} - too many failed attempts (${failedAttempts}). Will retry after ${FAILURE_RESET_DAYS} days.`);
                return 0;
            }
            const lastUpdateAttempt = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.lastUpdateAttempt);
            if (lastUpdateAttempt > 0 && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                this.logger.debug(`Client ${doc.mobile} on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                return 0;
            }
            const lastUsed = client_helper_utils_1.ClientHelperUtils.getTimestamp(doc.lastUsed);
            if (lastUsed > 0 && now - lastUsed < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                this.logger.debug(`Client ${doc.mobile} recently used, skipping`);
                return 0;
            }
            if (lastUsed > 0) {
                await this.backfillTimestamps(doc.mobile, doc, now);
                this.logger.debug(`Client ${doc.mobile} has been used, assuming configured`);
                return 0;
            }
            const pendingUpdates = this.getPendingUpdates(doc, now);
            if (pendingUpdates.totalPending > 0) {
                this.logger.debug(`Client ${doc.mobile} has ${pendingUpdates.totalPending} pending updates: ${pendingUpdates.reasons.join(', ')}`);
            }
            else {
                this.logger.debug(`Client ${doc.mobile} has no pending updates - all complete!`);
            }
            if (pendingUpdates.needsPrivacy) {
                updateCount = await this.updatePrivacySettings(doc, client, failedAttempts);
                return updateCount;
            }
            if (pendingUpdates.needsDeletePhotos) {
                updateCount = await this.deleteProfilePhotos(doc, client, failedAttempts);
                return updateCount;
            }
            if (pendingUpdates.needsNameBio) {
                updateCount = await this.updateNameAndBio(doc, client, failedAttempts);
                return updateCount;
            }
            if (pendingUpdates.needsUsername) {
                updateCount = await this.updateUsername(doc, client, failedAttempts);
                return updateCount;
            }
            if (pendingUpdates.needsProfilePhotos) {
                updateCount = await this.updateProfilePhotos(doc, client, failedAttempts);
                return updateCount;
            }
            if (updateCount === 0) {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                if (pendingUpdates.totalPending > 0) {
                    this.logger.debug(`No updates performed for ${doc.mobile} despite ${pendingUpdates.totalPending} pending. Reasons: ${pendingUpdates.reasons.join(', ')}`);
                }
            }
            else {
                const remainingPending = pendingUpdates.totalPending - updateCount;
                if (remainingPending > 0) {
                    this.logger.debug(`Client ${doc.mobile} still has ${remainingPending} pending updates`);
                }
                else {
                    this.logger.log(`✅ Client ${doc.mobile} - ALL UPDATES COMPLETE!`);
                }
            }
            return updateCount;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error with client', doc.mobile);
            try {
                const failedAttempts = doc.failedUpdateAttempts || 0;
                await this.update(doc.mobile, {
                    lastUpdateAttempt: new Date(),
                    failedUpdateAttempts: failedAttempts + 1,
                    lastUpdateFailure: new Date()
                });
            }
            catch (updateError) {
                this.logger.warn(`Failed to track update attempt for ${doc.mobile}:`, updateError);
            }
            if ((0, isPermanentError_1.default)(errorDetails)) {
                await this.markAsInactive(doc.mobile, errorDetails.message);
            }
            return 0;
        }
        finally {
            await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
        }
    }
    async createBufferClientFromUser(document, targetClientId, availableDate) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(document.mobile, {
            autoDisconnect: false,
        });
        try {
            const hasPassword = await telegramClient.hasPassword();
            this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
            if (hasPassword) {
                this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                await this.updateUser2FAStatus(document.tgId, document.mobile);
                return false;
            }
            await telegramClient.removeOtherAuths();
            await (0, Helpers_1.sleep)(10000 + Math.random() * 10000);
            await telegramClient.set2fa();
            this.logger.debug('Waiting for setting 2FA');
            await (0, Helpers_1.sleep)(30000 + Math.random() * 30000);
            const channels = await this.telegramService.getChannelInfo(document.mobile, true);
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            const newSession = await this.telegramService.createNewSession(document.mobile);
            const targetAvailableDate = availableDate || client_helper_utils_1.ClientHelperUtils.getTodayDateString();
            this.logger.debug(`Inserting Document for client ${targetClientId} with availableDate ${targetAvailableDate}`);
            const bufferClient = {
                tgId: document.tgId,
                session: newSession,
                mobile: document.mobile,
                lastUsed: null,
                availableDate: targetAvailableDate,
                channels: channels.ids.length,
                clientId: targetClientId,
                status: 'active',
                message: availableDate
                    ? 'Account successfully configured as buffer client - available immediately'
                    : 'Account successfully configured as buffer client',
            };
            await this.create(bufferClient);
            await this.updateUser2FAStatus(document.tgId, document.mobile);
            this.logger.log(`Created BufferClient for ${targetClientId} with availability ${targetAvailableDate}`);
            return true;
        }
        catch (error) {
            const errorDetails = this.handleError(error, 'Error processing client', document.mobile);
            this.logger.error(`Error processing buffer client ${document.mobile}: ${errorDetails.message}`);
            if ((0, isPermanentError_1.default)(errorDetails)) {
                try {
                    await this.markAsInactive(document.mobile, errorDetails.message);
                }
                catch (markError) {
                    this.logger.error(`Failed to mark ${document.mobile} as inactive:`, markError);
                }
            }
            return false;
        }
        finally {
            await this.safeUnregisterClient(document.mobile);
            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds, clientsNeedingBufferClients = [], bufferClientsPerClient) {
        const clientNeedingBufferClientsDynamic = [];
        for (const clientId of clientsNeedingBufferClients) {
            const availabilityNeeds = await this.calculateAvailabilityBasedNeeds(clientId);
            if (availabilityNeeds.totalNeeded > 0) {
                clientNeedingBufferClientsDynamic.push({
                    clientId,
                    ...availabilityNeeds
                });
            }
        }
        clientNeedingBufferClientsDynamic.sort((a, b) => a.priority - b.priority);
        await this.addNewUserstoBufferClientsDynamic(badIds, goodIds, clientNeedingBufferClientsDynamic, bufferClientsPerClient);
    }
    async addNewUserstoBufferClientsDynamic(badIds, goodIds, clientsNeedingBufferClients, bufferClientsPerClient) {
        const threeMonthsAgo = client_helper_utils_1.ClientHelperUtils.getDateStringDaysAgo(this.INACTIVE_USER_CUTOFF_DAYS, this.ONE_DAY_MS);
        let totalNeeded = 0;
        for (const clientNeed of clientsNeedingBufferClients) {
            totalNeeded += clientNeed.totalNeeded;
        }
        totalNeeded = Math.min(totalNeeded, this.MAX_NEW_BUFFER_CLIENTS_PER_TRIGGER);
        if (totalNeeded === 0) {
            this.logger.debug('No buffer clients needed - all availability windows and total count satisfied');
            return;
        }
        this.logger.debug(`Creating ${totalNeeded} new buffer clients (all with availableDate = today) ` +
            `to satisfy availability windows and total count requirements`);
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: threeMonthsAgo },
            totalChats: { $gt: 150 },
        }, { tgId: 1 }, totalNeeded + 5);
        const today = new Date().toISOString().split('T')[0];
        const assignmentQueue = [];
        for (const clientNeed of clientsNeedingBufferClients) {
            for (let i = 0; i < clientNeed.totalNeeded; i++) {
                assignmentQueue.push({
                    clientId: clientNeed.clientId,
                    priority: clientNeed.priority
                });
            }
        }
        let processedCount = 0;
        let assignmentIndex = 0;
        while (processedCount < totalNeeded &&
            documents.length > 0 &&
            assignmentIndex < assignmentQueue.length) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }
            const assignment = assignmentQueue[assignmentIndex];
            if (!assignment) {
                this.logger.debug('No more assignments needed');
                break;
            }
            try {
                const created = await this.createBufferClientFromUser(document, assignment.clientId, today);
                if (created) {
                    assignmentIndex++;
                    processedCount++;
                    this.logger.debug(`Created buffer client ${document.mobile} for ${assignment.clientId} ` +
                        `with availableDate = ${today} (available immediately, priority: ${assignment.priority})`);
                }
                else {
                    processedCount++;
                }
            }
            catch (error) {
                const errorDetails = this.handleError(error, 'Error creating client connection', document.mobile);
                this.logger.error(`Error creating connection for ${document.mobile}:`, errorDetails);
                await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                processedCount++;
            }
        }
        this.logger.log(`✅ Dynamic batch completed: Created ${processedCount} new buffer clients ` +
            `(all with availableDate = ${today}, available immediately). ` +
            `System maintains availability windows and total count requirements.`);
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
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                    const newSession = await this.telegramService.createNewSession(bufferClient.mobile);
                    await this.update(bufferClient.mobile, {
                        session: newSession,
                        lastUsed: null,
                        message: 'Session updated successfully',
                    });
                }
                catch (error) {
                    const errorDetails = this.handleError(error, 'Failed to create new session', bufferClient.mobile);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.update(bufferClient.mobile, {
                            status: 'inactive',
                            message: `Session update failed: ${errorDetails.message}`,
                        });
                    }
                }
                finally {
                    await this.safeUnregisterClient(bufferClient.mobile);
                    if (i < bufferClients.length - 1) {
                        await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
                    }
                }
            }
            catch (error) {
                const errorDetails = this.handleError(error, 'Error creating client connection', bufferClient.mobile);
                this.logger.error(`Error creating client connection for ${bufferClient.mobile}: ${errorDetails.message}`);
                if (i < bufferClients.length - 1) {
                    await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
                }
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
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);
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
            const needed = Math.max(0, this.MIN_TOTAL_BUFFER_CLIENTS - activeCount);
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
            .find({
            clientId,
            status: 'active',
            inUse: { $ne: true }
        })
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
            inUse: { $ne: true },
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
        const last24Hours = new Date(now.getTime() - this.ONE_DAY_MS);
        const lastWeek = new Date(now.getTime() - 7 * this.ONE_DAY_MS);
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
        session_manager_1.SessionService,
        bots_1.BotsService])
], BufferClientService);
//# sourceMappingURL=buffer-client.service.js.map