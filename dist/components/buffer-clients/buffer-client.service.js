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
        this.logger = new common_1.Logger(BufferClientService_1.name);
        this.joinChannelMap = new Map();
        this.joinChannelIntervalId = null;
        this.leaveChannelMap = new Map();
        this.leaveChannelIntervalId = null;
        this.isJoinChannelProcessing = false;
        this.isLeaveChannelProcessing = false;
        this.activeTimeouts = new Set();
        this.JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000;
        this.LEAVE_CHANNEL_INTERVAL = 60 * 1000;
        this.LEAVE_CHANNEL_BATCH_SIZE = 10;
        this.CLIENT_PROCESSING_DELAY = 5000;
        this.CHANNEL_PROCESSING_DELAY = 10000;
        this.MAX_MAP_SIZE = 100;
        this.CLEANUP_INTERVAL = 10 * 60 * 1000;
        this.MAX_NEEDED = 160;
        this.cleanupIntervalId = null;
    }
    async onModuleDestroy() {
        this.logger.log('Cleaning up BufferClientService resources');
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
            this.logger.log('BufferClientService cleanup completed');
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
    checkMemoryHealth() {
        const memoryStats = {
            joinMapSize: this.joinChannelMap.size,
            leaveMapSize: this.leaveChannelMap.size,
            activeTimeouts: this.activeTimeouts.size,
            isJoinProcessing: this.isJoinChannelProcessing,
            isLeaveProcessing: this.isLeaveChannelProcessing,
        };
        this.logger.debug('Memory health check:', memoryStats);
        if (memoryStats.joinMapSize > this.MAX_MAP_SIZE * 0.9) {
            this.logger.warn('Join map approaching memory limit, performing emergency cleanup');
            this.performMemoryCleanup();
        }
        if (memoryStats.leaveMapSize > this.MAX_MAP_SIZE * 0.9) {
            this.logger.warn('Leave map approaching memory limit, performing emergency cleanup');
            this.performMemoryCleanup();
        }
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
            this.logger.log('Updating');
            return this.update(existingBufferClient.mobile, createorUpdateBufferClientDto);
        }
        else {
            this.logger.log('creating');
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
            const errorDetails = (0, parseError_1.parseError)(error);
            this.logger.error(`Error removing BufferClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`BufferClient with mobile ${mobile} removed successfully`);
    }
    async search(filter) {
        if (filter.firstName == "refresh") {
            this.updateAllClientSessions();
            return [];
        }
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        if (filter.status) {
            filter.status = filter.status;
        }
        return this.bufferClientModel.find(filter).exec();
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
                this.logger.debug(`Updating info for client ${i + 1}/${clients.length}: ${mobile}`);
                await (0, Helpers_1.sleep)(2000);
                const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false,
                });
                await (0, Helpers_1.sleep)(1500);
                const channels = await telegramClient.channelInfo(true);
                this.logger.debug(`${mobile}: Found ${channels.ids.length} existing channels`);
                await (0, Helpers_1.sleep)(1000);
                await this.update(mobile, { channels: channels.ids.length });
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                try {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
                catch (markError) {
                    this.logger.error(`Error marking client ${mobile} as inactive:`, markError);
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
                    await (0, Helpers_1.sleep)(4000);
                }
            }
        }
        this.logger.debug('Completed updating info for all buffer clients');
    }
    async joinchannelForBufferClients(skipExisting = true) {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return 'Active client setup exists, skipping buffer promotion';
        }
        this.logger.log('Starting join channel process for buffer clients');
        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();
        await (0, Helpers_1.sleep)(3000);
        const existingKeys = skipExisting
            ? []
            : Array.from(this.joinChannelMap.keys());
        const clients = await this.bufferClientModel
            .find({
            channels: { $lt: 350 },
            mobile: { $nin: existingKeys },
        })
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
                await (0, Helpers_1.sleep)(2000);
                const channels = await client.channelInfo(true);
                this.logger.debug(`Client ${mobile} has ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length });
                if (channels.canSendFalseCount < 10) {
                    const excludedIds = channels.ids;
                    const result = channels.ids.length < 220
                        ? await this.channelsService.getActiveChannels(150, 0, excludedIds)
                        : await this.activeChannelsService.getActiveChannels(150, 0, excludedIds);
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
                const errorDetails = (0, parseError_1.parseError)(error);
                const errorMsg = errorDetails?.message || error?.errorMessage || 'Unknown error';
                if ((0, utils_1.contains)(errorMsg, [
                    'SESSION_REVOKED',
                    'AUTH_KEY_UNREGISTERED',
                    'USER_DEACTIVATED',
                    'USER_DEACTIVATED_BAN',
                    'FROZEN_METHOD_INVALID',
                ])) {
                    this.logger.error(`Session invalid for ${mobile} due to ${errorMsg}, removing client`);
                    try {
                        await this.remove(mobile, `JoinChannelError: ${errorDetails.message}`);
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (removeErr) {
                        this.logger.error(`Failed to remove client ${mobile}:`, removeErr);
                    }
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
                    await (0, Helpers_1.sleep)(this.CLIENT_PROCESSING_DELAY);
                }
            }
        }
        await (0, Helpers_1.sleep)(3000);
        if (joinSet.size > 0) {
            this.startMemoryCleanup();
            this.logger.debug(`Starting join queue for ${joinSet.size} buffer clients`);
            this.createTimeout(() => this.joinChannelQueue(), 2000);
        }
        if (leaveSet.size > 0) {
            this.logger.debug(`Starting leave queue for ${leaveSet.size} buffer clients`);
            this.createTimeout(() => this.leaveChannelQueue(), 5000);
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
        this.checkMemoryHealth();
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
                this.logger.debug(`${mobile} has ${channels.length} pending channels to join, processing: @${currentChannel.username}`);
                this.joinChannelMap.set(mobile, channels);
                await this.telegramService.tryJoiningChannel(mobile, currentChannel);
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error: `, false);
                this.logger.error(`Error joining channel for ${mobile}: ${error.message}`);
                if (errorDetails.error === 'FloodWaitError' ||
                    error.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                    this.removeFromBufferMap(mobile);
                    try {
                        await (0, Helpers_1.sleep)(2000);
                        const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    }
                    catch (updateError) {
                        this.logger.error(`Error updating channel count for ${mobile}:`, updateError);
                    }
                }
                if ((0, utils_1.contains)(errorDetails.message, [
                    'SESSION_REVOKED',
                    'AUTH_KEY_UNREGISTERED',
                    'USER_DEACTIVATED',
                    'USER_DEACTIVATED_BAN',
                    'FROZEN_METHOD_INVALID',
                ])) {
                    this.logger.error(`Session invalid for ${mobile}, removing client`);
                    this.removeFromBufferMap(mobile);
                    try {
                        await this.remove(mobile, `Process JoinChannelError: ${errorDetails.message}`);
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (removeError) {
                        this.logger.error(`Error removing client ${mobile}:`, removeError);
                    }
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
                    this.joinChannelMap.get(mobile)?.length > 0) {
                    this.logger.log(`Sleeping for ${this.CHANNEL_PROCESSING_DELAY} before continuing with next Mobile`);
                    await (0, Helpers_1.sleep)(this.CHANNEL_PROCESSING_DELAY);
                }
                else {
                    this.logger.log(`Not Sleeping before continuing with next Mobile`);
                }
            }
        }
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(`Clearing join channel interval: ${this.joinChannelIntervalId}`);
            clearInterval(this.joinChannelIntervalId);
            this.activeTimeouts.delete(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
        }
        this.isJoinChannelProcessing = false;
        this.logger.debug('Join channel processing cleared and flag reset');
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
        this.checkMemoryHealth();
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
                if ((0, utils_1.contains)(errorDetails.message, [
                    'SESSION_REVOKED',
                    'AUTH_KEY_UNREGISTERED',
                    'USER_DEACTIVATED',
                    'USER_DEACTIVATED_BAN',
                    'FROZEN_METHOD_INVALID',
                ])) {
                    this.logger.error(`Session invalid for ${mobile}, removing client`);
                    try {
                        await this.remove(mobile, `Process LeaveChannel: ${errorDetails.message}`);
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (removeError) {
                        this.logger.error(`Error removing client ${mobile}:`, removeError);
                    }
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
                    this.logger.error(`Error unregistering client ${mobile}: ${unregisterError.message}`);
                }
                if (i < keys.length - 1 ||
                    this.leaveChannelMap.get(mobile)?.length > 0) {
                    await (0, Helpers_1.sleep)(this.LEAVE_CHANNEL_INTERVAL / 2);
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
    async setAsBufferClient(mobile, availableDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new common_1.ConflictException('BufferClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        const allPromoteMobiles = [];
        for (const client of clients) {
            const clientPromoteMobiles = await this.clientService.getPromoteMobiles(client.clientId);
            allPromoteMobiles.push(...clientPromoteMobiles);
        }
        if (!allPromoteMobiles.includes(mobile) &&
            !clientMobiles.includes(mobile)) {
            try {
                const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                });
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(10000);
                await telegramClient.updateUsername('');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updateProfile('Deleted Account', 'Deleted Account');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.deleteProfilePhotos();
                const channels = await this.telegramService.getChannelInfo(mobile, true);
                const newSession = await this.telegramService.createNewSession(user.mobile);
                const bufferClient = {
                    tgId: user.tgId,
                    session: newSession,
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                    status: 'active',
                };
                await this.bufferClientModel
                    .findOneAndUpdate({ tgId: user.tgId }, { $set: bufferClient }, { new: true, upsert: true })
                    .exec();
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, errorDetails.status);
            }
            await connection_manager_1.connectionManager.unregisterClient(mobile);
            return 'Client set as buffer successfully';
        }
        else {
            throw new common_1.BadRequestException('Number is a Active Client');
        }
    }
    async checkBufferClients() {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
            return;
        }
        await (0, Helpers_1.sleep)(3000);
        const bufferclients = await this.findAll('active');
        const badIds = [];
        let goodIds = [];
        if (bufferclients.length < 80) {
            for (let i = 0; i < 80 - bufferclients.length; i++) {
                badIds.push(i.toString());
            }
        }
        const clients = await this.clientService.findAll();
        const promoteclients = await this.promoteClientService.findAll();
        const clientMainMobiles = clients.map((c) => c.mobile);
        const allPromoteMobiles = [];
        for (const client of clients) {
            const clientPromoteMobiles = await this.clientService.getPromoteMobiles(client.clientId);
            allPromoteMobiles.push(...clientPromoteMobiles);
        }
        const clientIds = [...clientMainMobiles, ...allPromoteMobiles].filter(Boolean);
        const promoteclientIds = promoteclients.map((c) => c.mobile);
        const toProcess = bufferclients.filter((doc) => !clientIds.includes(doc.mobile) &&
            !promoteclientIds.includes(doc.mobile));
        this.logger.debug(`Processing ${toProcess.length} buffer clients sequentially`);
        for (let i = 0; i < toProcess.length; i++) {
            const doc = toProcess[i];
            this.logger.debug(`Processing buffer client ${i + 1}/${toProcess.length}: ${doc.mobile}`);
            try {
                await this.processBufferClient(doc, badIds, goodIds);
            }
            catch (error) {
                this.logger.error(`Error processing buffer client ${doc.mobile}:`, error);
                badIds.push(doc.mobile);
            }
            if (i < toProcess.length - 1) {
                await (0, Helpers_1.sleep)(5000);
            }
        }
        for (let i = 0; i < bufferclients.length; i++) {
            const doc = bufferclients[i];
            if (clientIds.includes(doc.mobile) ||
                promoteclientIds.includes(doc.mobile)) {
                this.logger.warn(`Number ${doc.mobile} is an Active Client`);
                goodIds.push(doc.mobile);
                try {
                    await this.remove(doc.mobile, `CheckPoint: Already ActiveClient`);
                    await (0, Helpers_1.sleep)(1000);
                }
                catch (removeError) {
                    this.logger.error(`Error removing active client ${doc.mobile}:`, removeError);
                }
            }
        }
        goodIds = [...new Set([...goodIds, ...clientIds, ...promoteclientIds])];
        this.logger.debug(`GoodIds: ${goodIds.length}, BadIds: ${badIds.length}`);
        await (0, Helpers_1.sleep)(2000);
        await this.addNewUserstoBufferClients(badIds, goodIds);
    }
    async processBufferClient(doc, badIds, goodIds) {
        try {
            const cli = await connection_manager_1.connectionManager.getClient(doc.mobile, {
                autoDisconnect: true,
                handler: false,
            });
            try {
                const me = await cli.getMe();
                if (me.username) {
                    await this.telegramService.updateUsername(doc.mobile, '');
                    await (0, Helpers_1.sleep)(2000);
                }
                if (me.firstName !== 'Deleted Account') {
                    await this.telegramService.updateNameandBio(doc.mobile, 'Deleted Account', '');
                    await (0, Helpers_1.sleep)(2000);
                }
                await this.telegramService.deleteProfilePhotos(doc.mobile);
                const hasPassword = await cli.hasPassword();
                if (!hasPassword) {
                    this.logger.warn(`Client ${doc.mobile} does not have password`);
                    badIds.push(doc.mobile);
                }
                else {
                    this.logger.debug(`${doc.mobile}: ALL Good`);
                    goodIds.push(doc.mobile);
                }
            }
            catch (innerError) {
                this.logger.error(`Error processing client ${doc.mobile}: ${innerError.message}`);
                badIds.push(doc.mobile);
                try {
                    await this.remove(doc.mobile, `Process BufferClienrError: ${innerError.message}`);
                    await (0, Helpers_1.sleep)(1500);
                }
                catch (removeError) {
                    this.logger.error(`Error removing client ${doc.mobile}:`, removeError);
                }
            }
            finally {
                try {
                    await connection_manager_1.connectionManager.unregisterClient(doc.mobile);
                }
                catch (unregisterError) {
                    this.logger.error(`Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
                }
            }
            await (0, Helpers_1.sleep)(3000);
        }
        catch (error) {
            this.logger.error(`Error with client ${doc.mobile}: ${error.message}`);
            (0, parseError_1.parseError)(error);
            badIds.push(doc.mobile);
            try {
                await this.remove(doc.mobile, `Process BufferClient 2: ${error.message}`);
                await (0, Helpers_1.sleep)(1500);
            }
            catch (removeError) {
                this.logger.error(`Error removing client ${doc.mobile}:`, removeError);
            }
            try {
                await connection_manager_1.connectionManager.unregisterClient(doc.mobile);
            }
            catch (unregisterError) {
                this.logger.error(`Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds) {
        const sixMonthsAgo = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0];
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: sixMonthsAgo },
            totalChats: { $gt: 150 },
        }, { tgId: 1 }, badIds.length + 3);
        this.logger.debug(`New buffer documents to be added: ${documents.length}`);
        let processedCount = 0;
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            processedCount++;
            if (!document ||
                !document.mobile ||
                !document.tgId ||
                !document.session) {
                this.logger.warn('Invalid document found, skipping');
                continue;
            }
            this.logger.debug(`Processing new buffer client ${processedCount}: ${document.mobile}`);
            try {
                const client = await connection_manager_1.connectionManager.getClient(document.mobile, {
                    autoDisconnect: false,
                });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        this.logger.debug('Waiting for setting 2FA');
                        await (0, Helpers_1.sleep)(30000);
                        await client.updateUsername('');
                        await (0, Helpers_1.sleep)(3000);
                        await client.updatePrivacyforDeletedAccount();
                        await (0, Helpers_1.sleep)(3000);
                        await client.updateProfile('Deleted Account', 'Deleted Account');
                        await (0, Helpers_1.sleep)(3000);
                        await client.deleteProfilePhotos();
                        await (0, Helpers_1.sleep)(2000);
                        await this.telegramService.removeOtherAuths(document.mobile);
                        const channels = await client.channelInfo(true);
                        this.logger.debug(`Creating buffer client document for ${document.mobile}`);
                        const newSession = await this.telegramService.createNewSession(document.mobile);
                        const bufferClient = {
                            tgId: document.tgId,
                            session: newSession,
                            mobile: document.mobile,
                            availableDate: new Date(Date.now() - 24 * 60 * 60 * 1000)
                                .toISOString()
                                .split('T')[0],
                            channels: channels.ids.length,
                            status: 'active',
                        };
                        await (0, Helpers_1.sleep)(1000);
                        await this.create(bufferClient);
                        await (0, Helpers_1.sleep)(1000);
                        await this.usersService.update(document.tgId, { twoFA: true });
                        this.logger.debug(`Created BufferClient for ${document.mobile}`);
                        badIds.pop();
                    }
                    else {
                        this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
                        await (0, Helpers_1.sleep)(1000);
                        await this.usersService.update(document.tgId, { twoFA: true });
                    }
                }
                catch (error) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`);
                    (0, parseError_1.parseError)(error);
                }
                finally {
                    try {
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        await (0, Helpers_1.sleep)(1500);
                    }
                    catch (unregisterError) {
                        this.logger.error(`Error unregistering client ${document.mobile}: ${unregisterError.message}`);
                    }
                }
            }
            catch (error) {
                this.logger.error(`Error creating client connection for ${document.mobile}: ${error.message}`);
                (0, parseError_1.parseError)(error);
            }
            if (badIds.length > 0 && documents.length > 0) {
                await (0, Helpers_1.sleep)(8000);
            }
        }
        this.createTimeout(() => {
            this.logger.log('Starting next join channel process after adding new users');
            this.joinchannelForBufferClients();
        }, 5 * 60 * 1000);
    }
    async updateAllClientSessions() {
        const bufferClients = await this.findAll('active');
        for (let i = 0; i < bufferClients.length; i++) {
            const bufferClient = bufferClients[i];
            try {
                this.logger.log(`Creating new session for mobile : ${bufferClient.mobile} (${i}/${bufferClients.length})`);
                await connection_manager_1.connectionManager.getClient(bufferClient.mobile, {
                    autoDisconnect: true,
                    handler: true
                });
                await (0, Helpers_1.sleep)(3000);
                const newSession = await this.telegramService.createNewSession(bufferClient.mobile);
                await this.update(bufferClient.mobile, {
                    session: newSession
                });
            }
            catch (e) {
                this.logger.error("Failed to Create new session", e);
            }
            finally {
                await connection_manager_1.connectionManager.unregisterClient(bufferClient.mobile);
                await (0, Helpers_1.sleep)(5000);
            }
        }
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