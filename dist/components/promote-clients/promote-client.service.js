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
var PromoteClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromoteClientService = void 0;
const channels_service_1 = require("../channels/channels.service");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const promote_client_schema_1 = require("./schemas/promote-client.schema");
const Telegram_service_1 = require("../Telegram/Telegram.service");
const Helpers_1 = require("telegram/Helpers");
const users_service_1 = require("../users/users.service");
const active_channels_service_1 = require("../active-channels/active-channels.service");
const client_service_1 = require("../clients/client.service");
const buffer_client_service_1 = require("../buffer-clients/buffer-client.service");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("../Telegram/utils/connection-manager");
const session_manager_1 = require("../session-manager");
const utils_1 = require("../../utils");
const channelinfo_1 = require("../../utils/telegram-utils/channelinfo");
const getProfilePics_1 = require("../Telegram/utils/getProfilePics");
const deleteProfilePics_1 = require("../Telegram/utils/deleteProfilePics");
const isPermanentError_1 = __importDefault(require("../../utils/isPermanentError"));
const telegram_1 = require("telegram");
const cloudinary_1 = require("../../cloudinary");
const path_1 = __importDefault(require("path"));
const checkMe_utils_1 = require("../../utils/checkMe.utils");
const bots_1 = require("../bots");
let PromoteClientService = PromoteClientService_1 = class PromoteClientService {
    constructor(promoteClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, bufferClientService, sessionService, botsService) {
        this.promoteClientModel = promoteClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.bufferClientService = bufferClientService;
        this.sessionService = sessionService;
        this.botsService = botsService;
        this.logger = new utils_1.Logger(PromoteClientService_1.name);
        this.joinChannelMap = new Map();
        this.leaveChannelMap = new Map();
        this.joinChannelIntervalId = null;
        this.leaveChannelIntervalId = null;
        this.isLeaveChannelProcessing = false;
        this.isJoinChannelProcessing = false;
        this.activeTimeouts = new Set();
        this.JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000;
        this.LEAVE_CHANNEL_INTERVAL = 60 * 1000;
        this.LEAVE_CHANNEL_BATCH_SIZE = 10;
        this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER = 10;
        this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT = 12;
        this.MAX_MAP_SIZE = 100;
        this.CHANNEL_PROCESSING_DELAY = 10000;
        this.CLEANUP_INTERVAL = 10 * 60 * 1000;
        this.cleanupIntervalId = null;
    }
    startMemoryCleanup() {
        if (this.cleanupIntervalId)
            return;
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
                    this.logger.debug(`Cleaning up empty joinChannelMap entry for mobile: ${mobile}`);
                    this.joinChannelMap.delete(mobile);
                }
            }
            for (const [mobile, channels] of this.leaveChannelMap.entries()) {
                if (!channels || channels.length === 0) {
                    this.logger.debug(`Cleaning up empty leaveChannelMap entry for mobile: ${mobile}`);
                    this.leaveChannelMap.delete(mobile);
                }
            }
            this.trimMapIfNeeded(this.joinChannelMap, 'joinChannelMap');
            this.trimMapIfNeeded(this.leaveChannelMap, 'leaveChannelMap');
            this.logger.debug(`Memory cleanup completed. Maps sizes - Join: ${this.joinChannelMap.size}, Leave: ${this.leaveChannelMap.size}`);
        }
        catch (error) {
            this.logger.error('Error during memory cleanup:', error);
        }
    }
    trimMapIfNeeded(map, mapName) {
        if (map.size > this.MAX_MAP_SIZE) {
            const keysToRemove = Array.from(map.keys()).slice(this.MAX_MAP_SIZE);
            keysToRemove.forEach(key => map.delete(key));
            this.logger.warn(`Trimmed ${keysToRemove.length} entries from ${mapName}`);
        }
    }
    async create(promoteClient) {
        const promoteClientData = {
            ...promoteClient,
            status: promoteClient.status || 'active',
            message: promoteClient.message || 'Account is functioning properly',
        };
        const newUser = new this.promoteClientModel(promoteClientData);
        const result = await newUser.save();
        this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `Promote Client Created:\n\nMobile: ${promoteClient.mobile}`);
        return result;
    }
    async findAll(statusFilter) {
        const filter = statusFilter ? { status: statusFilter } : {};
        return this.promoteClientModel.find(filter).exec();
    }
    async findOne(mobile, throwErr = true) {
        const user = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return user;
    }
    async update(mobile, updateClientDto) {
        const updatedUser = await this.promoteClientModel
            .findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, returnDocument: 'after' })
            .exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
        }
        return updatedUser;
    }
    async updateStatus(mobile, status, message) {
        const updateData = { status };
        if (message) {
            updateData.message = message;
        }
        await this.botsService.sendMessageByCategory(bots_1.ChannelCategory.ACCOUNT_NOTIFICATIONS, `Promote Client:\n\nStatus Updated to ${status}\nMobile: ${mobile}\nReason: ${message || ''}`);
        return this.update(mobile, updateData);
    }
    async updateLastUsed(mobile) {
        return this.update(mobile, { lastUsed: new Date() });
    }
    async markAsUsed(mobile, message) {
        const updateData = { lastUsed: new Date() };
        if (message) {
            updateData.message = message;
        }
        return this.update(mobile, updateData);
    }
    async markAsInactive(mobile, reason) {
        this.logger.log(`Marking promote client ${mobile} as inactive: ${reason}`);
        try {
            return await this.updateStatus(mobile, 'inactive', reason);
        }
        catch (error) {
            this.logger.error(`Failed to mark promote client ${mobile} as inactive: ${error.message}`);
        }
    }
    async markAsActive(mobile, message = 'Account is functioning properly') {
        return this.updateStatus(mobile, 'active', message);
    }
    async createOrUpdate(mobile, createOrUpdateUserDto) {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            this.logger.debug(`Updating existing promote client: ${mobile}`);
            return this.update(existingUser.mobile, createOrUpdateUserDto);
        }
        else {
            this.logger.debug(`Creating new promote client: ${mobile}`);
            return this.create(createOrUpdateUserDto);
        }
    }
    async remove(mobile, message) {
        try {
            this.logger.log(`Removing PromoteClient with mobile: ${mobile}`);
            const deleteResult = await this.promoteClientModel.deleteOne({ mobile }).exec();
            if (deleteResult.deletedCount === 0) {
                throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
            }
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`${process.env.serviceName || process.env.clientId} Deleting Promote Client : ${mobile}\n${message}`)}`);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            const errorDetails = (0, parseError_1.parseError)(error);
            this.logger.error(`[${mobile}] Error removing PromoteClient: ${errorDetails.message}`, errorDetails);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`[${mobile}] PromoteClient removed successfully`);
    }
    async search(filter) {
        this.logger.debug(`Modified filter:`, filter);
        return this.promoteClientModel.find(filter).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        if (!query) {
            throw new common_1.BadRequestException('Query is invalid.');
        }
        try {
            const queryExec = this.promoteClientModel.find(query);
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
    removeFromPromoteMap(key) {
        const deleted = this.joinChannelMap.delete(key);
        if (deleted) {
            this.logger.debug(`Removed ${key} from join channel map`);
        }
    }
    clearPromoteMap() {
        this.logger.debug('PromoteMap cleared');
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
    }
    async updateInfo() {
        const clients = await this.promoteClientModel
            .find({ status: 'active', lastChecked: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
            .sort({ channels: 1 })
            .limit(25);
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            const mobile = client?.mobile;
            this.logger.info(`Processing PromoteClient (${i + 1}/${clients.length}): ${mobile}`);
            try {
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
                this.logger.debug(`[${mobile}]: Found ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length, lastChecked: new Date() });
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `[PromoteClientService] Error Updating Info for ${mobile}: `);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
                this.logger.error(`[${mobile}] Error updating info for client`, errorDetails);
            }
            finally {
                await connection_manager_1.connectionManager.unregisterClient(mobile);
                if (i < clients.length - 1) {
                    await (0, Helpers_1.sleep)(12000 + Math.random() * 8000);
                }
            }
        }
    }
    async joinchannelForPromoteClients(skipExisting = true) {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Active client setup exists, skipping promotion process');
            return 'Active client setup exists, skipping promotion';
        }
        this.logger.log('Starting join channel process');
        this.clearAllMapsAndIntervals();
        await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
        try {
            const existingKeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
            const clients = await this.promoteClientModel
                .find({
                channels: { $lt: 350 },
                mobile: { $nin: existingKeys },
                status: 'active',
            })
                .sort({ channels: 1 })
                .limit(16);
            this.logger.debug(`Found ${clients.length} clients to process for joining channels`);
            const joinSet = new Set();
            const leaveSet = new Set();
            let successCount = 0;
            let failCount = 0;
            for (const document of clients) {
                const mobile = document.mobile;
                this.logger.debug(`Processing client: ${mobile}`);
                try {
                    const client = await connection_manager_1.connectionManager.getClient(mobile, {
                        autoDisconnect: false,
                        handler: false,
                    });
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                    const channels = await (0, channelinfo_1.channelInfo)(client.client, true);
                    this.logger.debug(`[${mobile}]: Found ${channels.ids.length} existing channels`);
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                    await this.update(mobile, { channels: channels.ids.length });
                    if (channels.ids.length > 100) {
                        await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                        const profilePics = await (0, getProfilePics_1.getProfilePics)(client.client);
                        if (profilePics.length > 0) {
                            await (0, deleteProfilePics_1.deleteProfilePhotos)(client.client, profilePics);
                            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                        }
                    }
                    if (channels.canSendFalseCount < 10) {
                        const excludedIds = channels.ids;
                        const channelLimit = 150;
                        await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                        const isBelowThreshold = channels.ids.length < 220;
                        const result = isBelowThreshold
                            ? await this.activeChannelsService.getActiveChannels(channelLimit, 0, excludedIds)
                            : await this.channelsService.getActiveChannels(channelLimit, 0, excludedIds);
                        if (!this.joinChannelMap.has(mobile)) {
                            this.joinChannelMap.set(mobile, result);
                            this.trimMapIfNeeded(this.joinChannelMap, 'joinChannelMap');
                            joinSet.add(mobile);
                        }
                        else {
                            this.logger.debug(`[${mobile}]: Already in join queue, skipping re-add`);
                        }
                        await this.sessionService.getOldestSessionOrCreate({ mobile: document.mobile });
                    }
                    else {
                        this.logger.debug(`[${mobile}]: Too many blocked channels (${channels.canSendFalseCount}), preparing for leave`);
                        if (!this.leaveChannelMap.has(mobile)) {
                            this.leaveChannelMap.set(mobile, channels.canSendFalseChats);
                            this.trimMapIfNeeded(this.leaveChannelMap, 'leaveChannelMap');
                            leaveSet.add(mobile);
                        }
                        else {
                            this.logger.debug(`[${mobile}]: Already in leave queue, skipping re-add`);
                        }
                    }
                    successCount++;
                }
                catch (error) {
                    failCount++;
                    const errorDetails = (0, parseError_1.parseError)(error);
                    this.logger.error(`[${mobile}] Error processing client:`, errorDetails);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await (0, Helpers_1.sleep)(1000);
                        await this.markAsInactive(mobile, `${errorDetails.message}`);
                    }
                    else {
                        this.logger.warn(`[${mobile}]: Non-fatal error encountered, will retry later`);
                    }
                }
                finally {
                    await this.safeUnregisterClient(mobile);
                    await (0, Helpers_1.sleep)(8000 + Math.random() * 5000);
                }
            }
            await (0, Helpers_1.sleep)(6000 + Math.random() * 3000);
            if (joinSet.size > 0) {
                this.startMemoryCleanup();
                this.logger.debug(`Starting join queue for ${joinSet.size} clients`);
                this.createTimeout(() => this.joinChannelQueue(), 2000);
            }
            if (leaveSet.size > 0) {
                this.logger.debug(`Starting leave queue for ${leaveSet.size} clients`);
                this.createTimeout(() => this.leaveChannelQueue(), 5000);
            }
            this.logger.log(`Join channel process completed for ${clients.length} clients (Success: ${successCount}, Failed: ${failCount})`);
            return `Initiated Joining channels for ${joinSet.size} | Queued for leave: ${leaveSet.size}`;
        }
        catch (error) {
            this.logger.error('Unexpected error during joinchannelForPromoteClients:', error);
            this.clearAllMapsAndIntervals();
            throw new Error('Failed to initiate channel joining process');
        }
    }
    clearAllMapsAndIntervals() {
        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();
    }
    async joinChannelQueue() {
        if (this.isJoinChannelProcessing) {
            this.logger.warn('Join channel process is already running');
            return;
        }
        if (this.joinChannelMap.size === 0) {
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
        if (this.joinChannelMap.size === 0) {
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
                    this.removeFromPromoteMap(mobile);
                    continue;
                }
                currentChannel = channels.shift();
                if (!currentChannel) {
                    this.logger.debug(`No channel to process for ${mobile}, removing from queue`);
                    this.removeFromPromoteMap(mobile);
                    continue;
                }
                this.logger.debug(`[${mobile}] Processing channel: @${currentChannel.username} (${channels.length} remaining)`);
                this.joinChannelMap.set(mobile, channels);
                let activeChannel = null;
                try {
                    activeChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                }
                catch (findError) {
                    this.logger.warn(`Error fetching active channel ${currentChannel.channelId}:`, findError);
                }
                if (!activeChannel || activeChannel.banned || (activeChannel.deletedCount && activeChannel.deletedCount > 0)) {
                    this.logger.debug(`Skipping invalid/banned/deleted channel ${currentChannel.channelId}`);
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                    continue;
                }
                await this.telegramService.tryJoiningChannel(mobile, currentChannel);
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `[${mobile}] ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error: `, false);
                if (errorDetails.error === 'FloodWaitError' ||
                    error.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`[${mobile}] FloodWaitError or too many channels, removing from queue`);
                    this.removeFromPromoteMap(mobile);
                    await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                    if (error.errorMessage === 'CHANNELS_TOO_MUCH') {
                        await this.update(mobile, { channels: 400 });
                    }
                    else {
                        const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    }
                }
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    this.removeFromPromoteMap(mobile);
                    await this.markAsInactive(mobile, `${errorDetails.message}`);
                }
            }
            finally {
                await this.safeUnregisterClient(mobile);
                if (i < keys.length - 1 ||
                    this.joinChannelMap.get(mobile)?.length > 0) {
                    await (0, Helpers_1.sleep)(this.CHANNEL_PROCESSING_DELAY);
                }
            }
        }
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(`Clearing join channel interval`);
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
        if (this.isLeaveChannelProcessing) {
            this.logger.warn('Leave channel process is already running');
            return;
        }
        if (this.leaveChannelMap.size === 0) {
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
            this.logger.warn('Leave channel interval is already running');
        }
    }
    async processLeaveChannelInterval() {
        if (this.isLeaveChannelProcessing) {
            this.logger.debug('Leave channel process already running, skipping interval');
            return;
        }
        if (this.leaveChannelMap.size === 0) {
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
                this.logger.debug(`[${mobile}] Processing ${channelsToProcess.length} channels to leave (${channels.length} remaining)`);
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
                await (0, Helpers_1.sleep)(5000 + Math.random() * 3000);
                await client.leaveChannels(channelsToProcess);
                this.logger.debug(`[${mobile}] Successfully left ${channelsToProcess.length} channels`);
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `[${mobile}] Leave Channel ERR: `, false);
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
                    await (0, Helpers_1.sleep)((this.LEAVE_CHANNEL_INTERVAL / 2) + Math.random() * 30000);
                }
            }
        }
    }
    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval`);
            clearInterval(this.leaveChannelIntervalId);
            this.activeTimeouts.delete(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
    }
    async safeUnregisterClient(mobile) {
        try {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
        catch (unregisterError) {
            this.logger.warn(`Error during client cleanup for ${mobile}:`, unregisterError);
        }
    }
    async setAsPromoteClient(mobile, availableDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) {
            throw new common_1.BadRequestException('User not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new common_1.ConflictException('PromoteClient already exists');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map((client) => client?.mobile);
        if (clientMobiles.includes(mobile)) {
            throw new common_1.BadRequestException('Number is an Active Client');
        }
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false });
        try {
            await telegramClient.set2fa();
            await (0, Helpers_1.sleep)(30000 + Math.random() * 30000);
            await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
            await telegramClient.updateUsername('');
            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
            await telegramClient.updatePrivacyforDeletedAccount();
            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
            await telegramClient.updateProfile('Deleted Account', 'Deleted Account');
            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
            await telegramClient.deleteProfilePhotos();
            await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
            const channels = await this.telegramService.getChannelInfo(mobile, true);
            const promoteClient = {
                tgId: user.tgId,
                lastActive: 'default',
                mobile: user.mobile,
                availableDate,
                channels: channels.ids.length,
                status: 'active',
                message: 'Manually configured as promote client',
                lastUsed: null,
            };
            await this.promoteClientModel
                .findOneAndUpdate({ mobile: user.mobile }, { $set: promoteClient }, { new: true, upsert: true })
                .exec();
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        finally {
            await this.safeUnregisterClient(mobile);
        }
        return 'Client set as promote successfully';
    }
    getTimestamp(date) {
        if (!date)
            return 0;
        try {
            return new Date(date).getTime();
        }
        catch {
            return 0;
        }
    }
    createBackfillTimestamps(now) {
        return {
            privacyUpdatedAt: new Date(now - (25 * 24 * 60 * 60 * 1000)),
            profilePicsDeletedAt: new Date(now - (20 * 24 * 60 * 60 * 1000)),
            nameBioUpdatedAt: new Date(now - (14 * 24 * 60 * 60 * 1000)),
            usernameUpdatedAt: new Date(now - (10 * 24 * 60 * 60 * 1000)),
            profilePicsUpdatedAt: new Date(now - (7 * 24 * 60 * 60 * 1000)),
        };
    }
    async backfillTimestamps(mobile, doc, now) {
        const needsBackfill = !doc.privacyUpdatedAt || !doc.profilePicsDeletedAt ||
            !doc.nameBioUpdatedAt || !doc.usernameUpdatedAt ||
            !doc.profilePicsUpdatedAt;
        if (!needsBackfill)
            return;
        this.logger.log(`Backfilling timestamp fields for ${mobile}`);
        const allTimestamps = this.createBackfillTimestamps(now);
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
    getPendingUpdates(doc, now) {
        const accountAge = doc.createdAt ? now - new Date(doc.createdAt).getTime() : 0;
        const DAY = 24 * 60 * 60 * 1000;
        const MIN_DAYS_BETWEEN_UPDATES = DAY;
        const reasons = [];
        const privacyTimestamp = this.getTimestamp(doc.privacyUpdatedAt);
        const needsPrivacy = accountAge >= DAY && accountAge <= 30 * DAY &&
            (privacyTimestamp === 0 || privacyTimestamp < now - 15 * DAY);
        if (needsPrivacy)
            reasons.push('Privacy update needed');
        const privacyDone = privacyTimestamp > 0 && (now - privacyTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const photosDeletedTimestamp = this.getTimestamp(doc.profilePicsDeletedAt);
        const needsDeletePhotos = accountAge >= 2 * DAY && accountAge <= 30 * DAY &&
            (photosDeletedTimestamp === 0 || photosDeletedTimestamp < now - 30 * DAY) &&
            (privacyDone || privacyTimestamp === 0);
        if (needsDeletePhotos)
            reasons.push('Delete photos needed');
        const photosDone = photosDeletedTimestamp > 0 && (now - photosDeletedTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const nameBioTimestamp = this.getTimestamp(doc.nameBioUpdatedAt);
        const needsNameBio = accountAge >= 3 * DAY && accountAge <= 30 * DAY &&
            (doc.channels || 0) > 100 &&
            (nameBioTimestamp === 0 || nameBioTimestamp < now - 30 * DAY) &&
            (photosDone || photosDeletedTimestamp === 0);
        if (needsNameBio)
            reasons.push('Name/Bio update needed');
        const nameBioDone = nameBioTimestamp > 0 && (now - nameBioTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const usernameTimestamp = this.getTimestamp(doc.usernameUpdatedAt);
        const needsUsername = accountAge >= 7 * DAY && accountAge <= 30 * DAY &&
            (doc.channels || 0) > 150 &&
            (usernameTimestamp === 0 || usernameTimestamp < now - 30 * DAY) &&
            (nameBioDone || nameBioTimestamp === 0);
        if (needsUsername)
            reasons.push('Username update needed');
        const usernameDone = usernameTimestamp > 0 && (now - usernameTimestamp >= MIN_DAYS_BETWEEN_UPDATES);
        const profilePicsTimestamp = this.getTimestamp(doc.profilePicsUpdatedAt);
        const needsProfilePhotos = accountAge >= 10 * DAY && accountAge <= 30 * DAY &&
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
    async processPromoteClient(doc, client) {
        if (!client) {
            this.logger.warn(`Client not found for promote client ${doc.mobile}`);
            return 0;
        }
        let cli;
        const MIN_COOLDOWN_HOURS = 2;
        const MAX_FAILED_ATTEMPTS = 3;
        const FAILURE_RESET_DAYS = 7;
        const now = Date.now();
        let updateCount = 0;
        try {
            await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
            const failedAttempts = doc.failedUpdateAttempts || 0;
            const lastFailureTime = this.getTimestamp(doc.lastUpdateFailure);
            if (failedAttempts > 0 && lastFailureTime > 0 && now - lastFailureTime > FAILURE_RESET_DAYS * 24 * 60 * 60 * 1000) {
                this.logger.log(`Resetting failure count for ${doc.mobile} (last failure was ${Math.floor((now - lastFailureTime) / (24 * 60 * 60 * 1000))} days ago)`);
                await this.update(doc.mobile, {
                    failedUpdateAttempts: 0,
                    lastUpdateFailure: null
                });
            }
            else if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                this.logger.warn(`Skipping ${doc.mobile} - too many failed attempts (${failedAttempts}). Will retry after ${FAILURE_RESET_DAYS} days.`);
                return 0;
            }
            const lastUpdateAttempt = this.getTimestamp(doc.lastUpdateAttempt);
            if (lastUpdateAttempt > 0 && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                this.logger.debug(`Client ${doc.mobile} on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                return 0;
            }
            const lastUsed = this.getTimestamp(doc.lastUsed);
            const hasAnyUpdate = !!(doc.privacyUpdatedAt || doc.profilePicsDeletedAt || doc.nameBioUpdatedAt ||
                doc.usernameUpdatedAt || doc.profilePicsUpdatedAt);
            if (hasAnyUpdate && lastUsed > 0 && now - lastUsed < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                this.logger.debug(`Client ${doc.mobile} recently used, skipping`);
                return 0;
            }
            const accountAge = doc.createdAt ? now - new Date(doc.createdAt).getTime() : 0;
            if (accountAge > 30 * 24 * 60 * 60 * 1000) {
                this.logger.debug(`Client ${doc.mobile} is older than 30 days, skipping`);
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
                try {
                    cli = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                    await cli.updatePrivacyforDeletedAccount();
                    await this.update(doc.mobile, {
                        privacyUpdatedAt: new Date(),
                        lastUpdateAttempt: new Date(),
                        failedUpdateAttempts: 0,
                        lastUpdateFailure: null
                    });
                    updateCount++;
                    this.logger.debug(`Updated privacy settings for ${doc.mobile}`);
                    await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
                    return updateCount;
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error updating privacy: ${doc.mobile}`, true);
                    await this.update(doc.mobile, {
                        lastUpdateAttempt: new Date(),
                        failedUpdateAttempts: failedAttempts + 1,
                        lastUpdateFailure: new Date()
                    });
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                    }
                    return updateCount;
                }
            }
            if (pendingUpdates.needsDeletePhotos) {
                try {
                    cli = await connection_manager_1.connectionManager.getClient(doc.mobile, {
                        autoDisconnect: true,
                        handler: false,
                    });
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                    const photos = await cli.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                        userId: 'me',
                        offset: 0,
                    }));
                    if (photos.photos.length > 0) {
                        await cli.deleteProfilePhotos();
                        await this.update(doc.mobile, {
                            profilePicsDeletedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        });
                        updateCount++;
                        this.logger.debug(`[PromoteClientService] Deleted ${photos.photos.length} profile photos for ${doc.mobile}`);
                        await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
                        return updateCount;
                    }
                    else {
                        await this.update(doc.mobile, {
                            profilePicsDeletedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        });
                        this.logger.debug(`[PromoteClientService] No profile photos to delete for ${doc.mobile}, marked as complete`);
                    }
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error in Deleting Photos: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                    return updateCount;
                }
            }
            if (pendingUpdates.needsNameBio) {
                cli = await connection_manager_1.connectionManager.getClient(doc.mobile, {
                    autoDisconnect: true,
                    handler: false,
                });
                await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                const me = await cli.getMe();
                await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                const expectedName = client?.name.split(' ')[0];
                if (!(0, checkMe_utils_1.isIncludedWithTolerance)((0, checkMe_utils_1.safeAttemptReverse)(me?.firstName), expectedName, 2)) {
                    try {
                        this.logger.log(`[PromoteClientService] Updating first name for ${doc.mobile} from ${me.firstName} to ${client.name}`);
                        await cli.updateProfile(`${(0, utils_1.obfuscateText)(`${expectedName} ${(0, utils_1.getRandomPetName)()}`, {
                            maintainFormatting: false,
                            preserveCase: true,
                            useInvisibleChars: false
                        })} ${(0, utils_1.getCuteEmoji)()}`, '');
                        await this.update(doc.mobile, {
                            nameBioUpdatedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        });
                        updateCount++;
                        this.logger.debug(`[PromoteClientService] Updated name and bio for ${doc.mobile}`);
                        await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
                        return updateCount;
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `Error in Updating Profile: ${doc.mobile}`, true);
                        await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                        if ((0, isPermanentError_1.default)(errorDetails)) {
                            await this.markAsInactive(doc.mobile, errorDetails.message);
                            return updateCount;
                        }
                        return updateCount;
                    }
                }
            }
            if (pendingUpdates.needsUsername) {
                try {
                    cli = await connection_manager_1.connectionManager.getClient(doc.mobile, {
                        autoDisconnect: true,
                        handler: false,
                    });
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                    await this.telegramService.updateUsername(doc.mobile, '');
                    await this.update(doc.mobile, {
                        usernameUpdatedAt: new Date(),
                        lastUpdateAttempt: new Date()
                    });
                    updateCount++;
                    this.logger.debug(`[PromoteClientService] Updated username for ${doc.mobile}`);
                    await (0, Helpers_1.sleep)(30000 + Math.random() * 20000);
                    return updateCount;
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error in Updating Username: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                    return updateCount;
                }
            }
            if (pendingUpdates.needsProfilePhotos) {
                try {
                    cli = await connection_manager_1.connectionManager.getClient(doc.mobile, {
                        autoDisconnect: true,
                        handler: false,
                    });
                    await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                    const rootPath = process.cwd();
                    const photos = await cli.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                        userId: 'me',
                        offset: 0,
                    }));
                    if (photos.photos.length < 2) {
                        await cloudinary_1.CloudinaryService.getInstance(client?.dbcoll?.toLowerCase());
                        await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                        const shuffle = (arr) => {
                            const a = arr.slice();
                            for (let i = a.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [a[i], a[j]] = [a[j], a[i]];
                            }
                            return a;
                        };
                        const photoPaths = shuffle(['dp1.jpg', 'dp2.jpg', 'dp3.jpg']);
                        const randomPhoto = photoPaths[0];
                        await cli.updateProfilePic(path_1.default.join(rootPath, randomPhoto));
                        await this.update(doc.mobile, {
                            profilePicsUpdatedAt: new Date(),
                            lastUpdateAttempt: new Date()
                        });
                        updateCount++;
                        this.logger.debug(`[PromoteClientService] Updated profile photo ${randomPhoto} for ${doc.mobile} (1 of ${photoPaths.length} photos)`);
                        await (0, Helpers_1.sleep)(40000 + Math.random() * 20000);
                        return updateCount;
                    }
                }
                catch (error) {
                    const errorDetails = (0, parseError_1.parseError)(error, `Error in Updating Profile Photos: ${doc.mobile}`, true);
                    await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        await this.markAsInactive(doc.mobile, errorDetails.message);
                        return updateCount;
                    }
                    return updateCount;
                }
            }
            if (updateCount === 0) {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
                if (pendingUpdates.totalPending > 0) {
                    this.logger.debug(`[PromoteClientService] No updates performed for ${doc.mobile} despite ${pendingUpdates.totalPending} pending updates. Reasons: ${pendingUpdates.reasons.join(', ')}`);
                }
            }
            else {
                const remainingPending = pendingUpdates.totalPending - updateCount;
                if (remainingPending > 0) {
                    this.logger.debug(`[PromoteClientService] Client ${doc.mobile} still has ${remainingPending} pending updates remaining`);
                }
                else {
                    this.logger.log(`[PromoteClientService] ✅ Client ${doc.mobile} - ALL UPDATES COMPLETE! Ready for use.`);
                }
            }
            return updateCount;
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error, `Error with client ${doc.mobile}`);
            try {
                await this.update(doc.mobile, { lastUpdateAttempt: new Date() });
            }
            catch (updateError) {
                this.logger.warn(`Failed to track update attempt for ${doc.mobile}:`, updateError);
            }
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
                this.logger.error(`[PromoteClientService] Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
            await (0, Helpers_1.sleep)(15000 + Math.random() * 10000);
        }
    }
    async checkPromoteClients() {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Ignored active check promote channels as active client setup exists');
            return;
        }
        this.logger.log('Starting promote client check process');
        const clients = await this.clientService.findAll();
        const bufferClients = await this.bufferClientService.findAll();
        const clientMainMobiles = clients.map((c) => c.mobile);
        const bufferClientIds = bufferClients.map((c) => c.mobile);
        const assignedPromoteMobiles = await this.promoteClientModel
            .find({ clientId: { $exists: true }, status: 'active' })
            .distinct('mobile');
        const goodIds = [...clientMainMobiles, ...bufferClientIds, ...assignedPromoteMobiles].filter(Boolean);
        const promoteClientCounts = await this.promoteClientModel.aggregate([
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
        const promoteClientsPerClient = new Map(promoteClientCounts.map((result) => [result._id, result.count]));
        const clientNeedingPromoteClients = [];
        let totalSlotsNeeded = 0;
        let totalUpdates = 0;
        const MIN_COOLDOWN_HOURS = 4;
        const now = Date.now();
        for (const result of promoteClientCounts) {
            if (totalUpdates < 5) {
                for (const promoteClientMobile of result.mobiles) {
                    const promoteClient = await this.findOne(promoteClientMobile, false);
                    if (!promoteClient) {
                        this.logger.warn(`Promote client ${promoteClientMobile} not found, skipping`);
                        continue;
                    }
                    let lastUpdateAttempt = 0;
                    try {
                        lastUpdateAttempt = promoteClient.lastUpdateAttempt
                            ? new Date(promoteClient.lastUpdateAttempt).getTime()
                            : 0;
                    }
                    catch (error) {
                        lastUpdateAttempt = 0;
                    }
                    if (lastUpdateAttempt > 0 && now - lastUpdateAttempt < MIN_COOLDOWN_HOURS * 60 * 60 * 1000) {
                        const hoursRemaining = ((MIN_COOLDOWN_HOURS * 60 * 60 * 1000) - (now - lastUpdateAttempt)) / (60 * 60 * 1000);
                        this.logger.debug(`Skipping ${promoteClientMobile} - on cooldown, ${hoursRemaining.toFixed(1)} hours remaining`);
                        continue;
                    }
                    const pendingUpdates = this.getPendingUpdates(promoteClient, now);
                    const hasBeenUsed = promoteClient.lastUsed && new Date(promoteClient.lastUsed).getTime() > 0;
                    if (hasBeenUsed) {
                        const needsBackfill = !promoteClient.privacyUpdatedAt || !promoteClient.profilePicsDeletedAt ||
                            !promoteClient.nameBioUpdatedAt || !promoteClient.usernameUpdatedAt ||
                            !promoteClient.profilePicsUpdatedAt;
                        if (needsBackfill) {
                            this.logger.log(`Backfilling timestamp fields for used client ${promoteClientMobile}`);
                            const sevenDaysAgo = new Date(now - (7 * 24 * 60 * 60 * 1000));
                            const tenDaysAgo = new Date(now - (10 * 24 * 60 * 60 * 1000));
                            const fourteenDaysAgo = new Date(now - (14 * 24 * 60 * 60 * 1000));
                            const twentyDaysAgo = new Date(now - (20 * 24 * 60 * 60 * 1000));
                            const twentyFiveDaysAgo = new Date(now - (25 * 24 * 60 * 60 * 1000));
                            const backfillData = {};
                            if (!promoteClient.privacyUpdatedAt) {
                                backfillData.privacyUpdatedAt = twentyFiveDaysAgo;
                            }
                            if (!promoteClient.profilePicsDeletedAt) {
                                backfillData.profilePicsDeletedAt = twentyDaysAgo;
                            }
                            if (!promoteClient.nameBioUpdatedAt) {
                                backfillData.nameBioUpdatedAt = fourteenDaysAgo;
                            }
                            if (!promoteClient.usernameUpdatedAt) {
                                backfillData.usernameUpdatedAt = tenDaysAgo;
                            }
                            if (!promoteClient.profilePicsUpdatedAt) {
                                backfillData.profilePicsUpdatedAt = sevenDaysAgo;
                            }
                            await this.update(promoteClientMobile, backfillData);
                            this.logger.log(`Backfilled ${Object.keys(backfillData).length} fields for ${promoteClientMobile}`);
                        }
                        if (pendingUpdates.totalPending === 0) {
                            this.logger.debug(`Skipping ${promoteClientMobile} - already used and no pending updates`);
                            continue;
                        }
                    }
                    if (pendingUpdates.totalPending > 0) {
                        const client = clients.find((c) => c.clientId === result._id);
                        if (!client) {
                            this.logger.warn(`Client with ID ${result._id} not found, skipping promote client ${promoteClientMobile}`);
                            continue;
                        }
                        const currentUpdates = await this.processPromoteClient(promoteClient, client);
                        this.logger.debug(`Processed promote client ${promoteClientMobile}, updates made: ${currentUpdates} | total updates so far: ${totalUpdates}`);
                        if (currentUpdates > 0) {
                            totalUpdates += currentUpdates;
                        }
                        this.logger.log(`Processed promote client ${promoteClientMobile}, updates made: ${currentUpdates} | total updates so far: ${totalUpdates}`);
                        if (totalUpdates >= 5) {
                            this.logger.warn('Reached total update limit of 5 for this check cycle');
                            break;
                        }
                    }
                }
            }
            else {
                this.logger.warn(`Skipping promote client ${result.mobiles.join(', ')} as total updates reached 5`);
            }
        }
        for (const client of clients) {
            const assignedCount = promoteClientsPerClient.get(client.clientId) || 0;
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - assignedCount);
            if (needed > 0) {
                clientNeedingPromoteClients.push(client.clientId);
            }
        }
        clientNeedingPromoteClients.sort();
        for (const clientId of clientNeedingPromoteClients) {
            if (totalSlotsNeeded >= this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER)
                break;
            const assignedCount = promoteClientsPerClient.get(clientId) || 0;
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - assignedCount);
            const allocatedForThisClient = Math.min(needed, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER - totalSlotsNeeded);
            totalSlotsNeeded += allocatedForThisClient;
        }
        this.logger.debug(`Promote clients per client: ${JSON.stringify(Object.fromEntries(promoteClientsPerClient))}`);
        this.logger.debug(`Clients needing promote clients: ${clientNeedingPromoteClients.join(', ')}`);
        this.logger.debug(`Total slots needed: ${totalSlotsNeeded} (limited to max ${this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER} per trigger)`);
        const totalActivePromoteClients = await this.promoteClientModel.countDocuments({ status: 'active' });
        this.logger.debug(`Total active promote clients: ${totalActivePromoteClients}`);
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Promote Client Check:\n\nTotal Active Promote Clients: ${totalActivePromoteClients}\nPromote Clients Per Client: ${JSON.stringify(Object.fromEntries(promoteClientsPerClient))}\nClients Needing Promote Clients: ${clientNeedingPromoteClients.join(', ')}\nTotal Slots Needed: ${totalSlotsNeeded}`)}`);
        if (clientNeedingPromoteClients.length > 0 && totalSlotsNeeded > 0) {
            await this.addNewUserstoPromoteClients([], goodIds, clientNeedingPromoteClients, promoteClientsPerClient);
        }
        else {
            this.logger.debug('No new promote clients needed');
        }
    }
    async addNewUserstoPromoteClients(badIds, goodIds, clientsNeedingPromoteClients = [], promoteClientsPerClient) {
        const sixMonthsAgo = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        let totalNeededFromClients = 0;
        for (const clientId of clientsNeedingPromoteClients) {
            let currentCount = promoteClientsPerClient?.get(clientId) || 0;
            if (!promoteClientsPerClient) {
                currentCount = await this.promoteClientModel.countDocuments({ clientId, status: 'active' });
            }
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            totalNeededFromClients += needed;
        }
        const totalNeeded = Math.min(totalNeededFromClients, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER);
        if (totalNeeded === 0) {
            this.logger.debug('No promote clients needed');
            return;
        }
        this.logger.debug(`Creating ${totalNeeded} new promote clients (max ${this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER} per trigger)`);
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: sixMonthsAgo },
            totalChats: { $gt: 150 },
        }, { tgId: 1 }, totalNeeded + 5);
        this.logger.debug(`Found ${documents.length} candidate documents`);
        let processedCount = 0;
        const clientAssignmentTracker = new Map();
        for (const clientId of clientsNeedingPromoteClients) {
            let currentCount = promoteClientsPerClient?.get(clientId) || 0;
            if (!promoteClientsPerClient) {
                currentCount = await this.promoteClientModel.countDocuments({ clientId, status: 'active' });
            }
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            clientAssignmentTracker.set(clientId, needed);
        }
        while (processedCount < Math.min(totalNeeded, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER) &&
            documents.length > 0 &&
            clientsNeedingPromoteClients.length > 0) {
            const document = documents.shift();
            if (!document?.mobile || !document.tgId) {
                this.logger.warn('Invalid document, skipping');
                continue;
            }
            const existingPromote = await this.findOne(document.mobile, false);
            if (existingPromote) {
                this.logger.debug(`Skipping ${document.mobile}: already a promote client`);
                continue;
            }
            let targetClientId = null;
            for (const clientId of clientsNeedingPromoteClients) {
                const needed = clientAssignmentTracker.get(clientId) || 0;
                if (needed > 0) {
                    targetClientId = clientId;
                    break;
                }
            }
            if (!targetClientId) {
                this.logger.debug('All clients satisfied');
                break;
            }
            try {
                const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await (0, Helpers_1.sleep)(10000 + Math.random() * 10000);
                        await client.set2fa();
                        await (0, Helpers_1.sleep)(30000 + Math.random() * 30000);
                        const channels = await (0, channelinfo_1.channelInfo)(client.client, true);
                        await (0, Helpers_1.sleep)(5000 + Math.random() * 5000);
                        const promoteClient = {
                            tgId: document.tgId,
                            lastActive: 'today',
                            mobile: document.mobile,
                            availableDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            clientId: targetClientId,
                            status: 'active',
                            message: 'Account successfully configured as promote client',
                            lastUsed: null,
                        };
                        await this.create(promoteClient);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        }
                        catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA for ${document.mobile}:`, userUpdateError);
                        }
                        this.logger.log(`Created PromoteClient for ${targetClientId}: ${document.mobile}`);
                        const currentNeeded = clientAssignmentTracker.get(targetClientId) || 0;
                        const newNeeded = Math.max(0, currentNeeded - 1);
                        clientAssignmentTracker.set(targetClientId, newNeeded);
                        if (newNeeded === 0) {
                            const index = clientsNeedingPromoteClients.indexOf(targetClientId);
                            if (index > -1) {
                                clientsNeedingPromoteClients.splice(index, 1);
                            }
                        }
                        this.logger.debug(`Client ${targetClientId}: ${newNeeded} more needed`);
                        processedCount++;
                    }
                    else {
                        this.logger.debug(`${document.mobile} already has password`);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        }
                        catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA for ${document.mobile}:`, userUpdateError);
                        }
                    }
                }
                catch (error) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`, error);
                    const errorDetails = (0, parseError_1.parseError)(error);
                    if ((0, isPermanentError_1.default)(errorDetails)) {
                        try {
                            await this.markAsInactive(document.mobile, errorDetails.message);
                        }
                        catch (markError) {
                            this.logger.error(`Failed to mark ${document.mobile} as inactive:`, markError);
                        }
                    }
                    processedCount++;
                }
                finally {
                    await this.safeUnregisterClient(document.mobile);
                    await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
                }
            }
            catch (error) {
                this.logger.error(`Error creating connection for ${document.mobile}: ${error.message}`, error);
                const errorDetails = (0, parseError_1.parseError)(error);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    try {
                        await this.markAsInactive(document.mobile, errorDetails.message);
                    }
                    catch (markError) {
                        this.logger.error(`Failed to mark ${document.mobile} as inactive:`, markError);
                    }
                }
                await (0, Helpers_1.sleep)(10000 + Math.random() * 5000);
            }
        }
        this.logger.log(`Batch completed: Created ${processedCount} new promote clients`);
        if (clientsNeedingPromoteClients.length > 0) {
            const stillNeeded = clientsNeedingPromoteClients
                .map((clientId) => `${clientId}:${clientAssignmentTracker.get(clientId) || 0}`)
                .join(', ');
            this.logger.log(`Still needed: ${stillNeeded}`);
        }
        else {
            this.logger.log('All clients have sufficient promote clients!');
        }
    }
    clearAllTimeouts() {
        this.activeTimeouts.forEach((timeout) => clearTimeout(timeout));
        this.activeTimeouts.clear();
        this.logger.debug('Cleared all active timeouts');
    }
    async cleanup() {
        try {
            this.clearAllTimeouts();
            this.clearMemoryCleanup();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            this.clearPromoteMap();
            this.clearLeaveMap();
            this.isJoinChannelProcessing = false;
            this.isLeaveChannelProcessing = false;
        }
        catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
    async onModuleDestroy() {
        await this.cleanup();
    }
    async getPromoteClientDistribution() {
        const clients = await this.clientService.findAll();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const [totalPromoteClients, unassignedPromoteClients, activePromoteClients, inactivePromoteClients, assignedCounts, activeCounts, inactiveCounts, neverUsedCounts, recentlyUsedCounts,] = await Promise.all([
            this.promoteClientModel.countDocuments({}),
            this.promoteClientModel.countDocuments({ clientId: { $exists: false } }),
            this.promoteClientModel.countDocuments({ status: 'active' }),
            this.promoteClientModel.countDocuments({ status: 'inactive' }),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null } } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'inactive' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
                    },
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } },
            ]),
            this.promoteClientModel.aggregate([
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
            const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - activeCount);
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
        const maxPerTrigger = this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER;
        const triggersNeeded = Math.ceil(totalNeeded / maxPerTrigger);
        return {
            totalPromoteClients,
            unassignedPromoteClients,
            activePromoteClients,
            inactivePromoteClients,
            distributionPerClient,
            summary: {
                clientsWithSufficientPromoteClients: clientsWithSufficient,
                clientsNeedingPromoteClients: clientsNeedingMore,
                totalPromoteClientsNeeded: totalNeeded,
                maxPromoteClientsPerTrigger: maxPerTrigger,
                triggersNeededToSatisfyAll: triggersNeeded,
            },
        };
    }
    async getPromoteClientsByStatus(status) {
        return this.promoteClientModel.find({ status }).exec();
    }
    async getPromoteClientsWithMessages() {
        return this.promoteClientModel
            .find({}, { mobile: 1, status: 1, message: 1, clientId: 1, lastUsed: 1 })
            .exec();
    }
    async getLeastRecentlyUsedPromoteClients(clientId, limit = 1) {
        return this.promoteClientModel
            .find({ clientId, status: 'active' })
            .sort({ lastUsed: 1, _id: 1 })
            .limit(limit)
            .exec();
    }
    async getNextAvailablePromoteClient(clientId) {
        const clients = await this.getLeastRecentlyUsedPromoteClients(clientId, 1);
        return clients.length > 0 ? clients[0] : null;
    }
    async getUnusedPromoteClients(hoursAgo = 24, clientId) {
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
        return this.promoteClientModel.find(filter).exec();
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
            this.promoteClientModel.countDocuments(filter),
            this.promoteClientModel.countDocuments({
                ...filter,
                $or: [{ lastUsed: { $exists: false } }, { lastUsed: null }],
            }),
            this.promoteClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: last24Hours },
            }),
            this.promoteClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: lastWeek },
            }),
            this.promoteClientModel.find(filter, { lastUsed: 1, createdAt: 1 }).exec(),
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
    createTimeout(callback, delay) {
        const timeout = setTimeout(() => {
            this.activeTimeouts.delete(timeout);
            callback();
        }, delay);
        this.activeTimeouts.add(timeout);
        return timeout;
    }
};
exports.PromoteClientService = PromoteClientService;
exports.PromoteClientService = PromoteClientService = PromoteClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(promote_client_schema_1.PromoteClient.name)),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => Telegram_service_1.TelegramService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => buffer_client_service_1.BufferClientService))),
    __param(7, (0, common_1.Inject)((0, common_1.forwardRef)(() => session_manager_1.SessionService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        client_service_1.ClientService,
        channels_service_1.ChannelsService,
        buffer_client_service_1.BufferClientService,
        session_manager_1.SessionService,
        bots_1.BotsService])
], PromoteClientService);
//# sourceMappingURL=promote-client.service.js.map