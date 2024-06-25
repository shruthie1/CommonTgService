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
var TelegramService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const buffer_client_service_1 = require("./../buffer-clients/buffer-client.service");
const users_service_1 = require("../users/users.service");
const utils_1 = require("../../utils");
const TelegramManager_1 = require("./TelegramManager");
const common_1 = require("@nestjs/common");
const cloudinary_1 = require("../../cloudinary");
const activechannels_service_1 = require("../activechannels/activechannels.service");
let TelegramService = TelegramService_1 = class TelegramService {
    constructor(usersService, bufferClientService, activeChannelsService) {
        this.usersService = usersService;
        this.bufferClientService = bufferClientService;
        this.activeChannelsService = activeChannelsService;
    }
    getActiveClientSetup() {
        return TelegramManager_1.default.getActiveClientSetup();
    }
    setActiveClientSetup(data) {
        TelegramManager_1.default.setActiveClientSetup(data);
    }
    getClient(number) {
        return TelegramService_1.clientsMap.get(number);
    }
    hasClient(number) {
        return TelegramService_1.clientsMap.has(number);
    }
    async deleteClient(number) {
        const cli = this.getClient(number);
        await cli?.disconnect();
        console.log("Disconnected : ", number);
        return TelegramService_1.clientsMap.delete(number);
    }
    async disconnectAll() {
        const data = TelegramService_1.clientsMap.entries();
        console.log("Disconnecting All Clients");
        for (const [phoneNumber, client] of data) {
            try {
                await client?.disconnect();
                TelegramService_1.clientsMap.delete(phoneNumber);
                console.log(`Client disconnected: ${phoneNumber}`);
            }
            catch (error) {
                console.log((0, utils_1.parseError)(error));
                console.log(`Failed to Disconnect : ${phoneNumber}`);
            }
        }
    }
    async createClient(mobile, autoDisconnect = true, handler = true) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        if (!TelegramService_1.clientsMap.has(mobile)) {
            const telegramManager = new TelegramManager_1.default(user.session, user.mobile);
            try {
                const client = await telegramManager.createClient(handler);
                if (client) {
                    TelegramService_1.clientsMap.set(mobile, telegramManager);
                    if (autoDisconnect) {
                        setTimeout(async () => {
                            if (client.connected || TelegramService_1.clientsMap.get(mobile)) {
                                console.log("SELF destroy client");
                                await telegramManager.disconnect();
                            }
                            else {
                                console.log("Client Already Disconnected");
                            }
                            TelegramService_1.clientsMap.delete(mobile);
                        }, 180000);
                    }
                    else {
                        setInterval(async () => {
                            await client.connect();
                        }, 20000);
                    }
                    return telegramManager;
                }
                else {
                    throw new common_1.BadRequestException('Client Expired');
                }
            }
            catch (error) {
                console.log("Parsing Error");
                const errorDetails = (0, utils_1.parseError)(error);
                if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated'])) {
                    console.log("Deleting User: ", user.mobile);
                    await this.usersService.delete(user.tgId);
                }
                else {
                    console.log('Not Deleting user');
                }
                throw new common_1.BadRequestException(errorDetails.message);
            }
        }
        else {
            return TelegramService_1.clientsMap.get(mobile);
        }
    }
    async getMessages(mobile, username, limit = 8) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        return telegramClient.getMessages(username, limit);
    }
    async getChatId(mobile, username) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        return await telegramClient.getchatId(username);
    }
    async joinChannels(mobile, str) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        const channels = str.split('|');
        console.log("Started Joining- ", mobile, " - channelsLen - ", channels.length);
        for (let i = 0; i < channels.length; i++) {
            if (telegramClient.connected()) {
                const channel = channels[i].trim();
                console.log(mobile, "Trying: ", channel);
                try {
                    const chatEntity = await telegramClient.getEntity(channel);
                    const joinResult = await telegramClient.joinChannel(chatEntity);
                    console.log(mobile, " - Joined channel Success - ", channel);
                    try {
                        const { title, id, broadcast, defaultBannedRights, participantsCount, megagroup, username } = chatEntity;
                        const entity = {
                            title,
                            id: id.toString(),
                            username,
                            megagroup,
                            participantsCount,
                            broadcast
                        };
                        if (!chatEntity.broadcast && !defaultBannedRights?.sendMessages) {
                            entity['canSendMsgs'] = true;
                            try {
                                await this.activeChannelsService.update(entity.id.toString(), entity);
                                console.log("updated ActiveChannels");
                            }
                            catch (error) {
                                console.log((0, utils_1.parseError)(error));
                                console.log("Failed to update ActiveChannels");
                            }
                        }
                        else {
                            await this.activeChannelsService.remove(entity.id.toString());
                            console.log("Removed Channel- ", channel);
                        }
                    }
                    catch (error) {
                        console.log(mobile, " - Failed!");
                        (0, utils_1.parseError)(error);
                    }
                }
                catch (error) {
                    console.log("Channels ERR: ", error.errorMessage);
                    if (error.toString().includes("No user has") || error.toString().includes("USERNAME_INVALID")) {
                        const activeChannel = await this.activeChannelsService.search({ username: channel.replace('@', '') });
                        await this.activeChannelsService.remove(activeChannel[0]?.channelId);
                        console.log("Removed Channel- ", channel);
                    }
                }
                console.log(mobile, " - On waiting period");
                await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000));
                console.log(mobile, " - Will Try next now");
            }
            else {
                await this.deleteClient(mobile);
                break;
            }
        }
        console.log(mobile, " - finished joining channels");
        if (telegramClient) {
            await telegramClient.disconnect();
        }
        console.log("Join channel stopped : ", mobile);
        return 'Channels joined successfully';
    }
    async removeOtherAuths(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        await telegramClient.removeOtherAuths();
        return 'Authorizations removed successfully';
    }
    async getSelfMsgsInfo(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        return await telegramClient.getSelfMSgsInfo();
    }
    async getChannelInfo(mobile, sendIds = false) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        return await telegramClient.channelInfo(sendIds);
    }
    async getAuths(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        return await telegramClient.getAuths();
    }
    async getMe(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        return await telegramClient.getMe();
    }
    async set2Fa(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        try {
            await telegramClient.set2fa();
            await telegramClient.disconnect();
            return '2Fa set successfully';
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
        }
    }
    async updatePrivacyforDeletedAccount(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        await telegramClient.updatePrivacyforDeletedAccount();
    }
    async deleteProfilePhotos(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        await telegramClient.deleteProfilePhotos();
    }
    async setProfilePic(mobile, name) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        try {
            await cloudinary_1.CloudinaryService.getInstance(name);
            await (0, utils_1.sleep)(2000);
            await telegramClient.updateProfilePic('./dp1.jpg');
            await (0, utils_1.sleep)(1000);
            await telegramClient.updateProfilePic('./dp2.jpg');
            await (0, utils_1.sleep)(1000);
            await telegramClient.updateProfilePic('./dp3.jpg');
            await (0, utils_1.sleep)(1000);
            await telegramClient.disconnect();
            return 'Profile pic set successfully';
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
        }
    }
    async updatePrivacy(mobile) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        try {
            await telegramClient.updatePrivacy();
            return "Privacy updated successfully";
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
        }
    }
    async updateUsername(mobile, username) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        try {
            return await telegramClient.updateUsername(username);
        }
        catch (error) {
            console.log("Some Error: ", (0, utils_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async updateNameandBio(mobile, firstName, about) {
        const telegramClient = TelegramService_1.clientsMap.get(mobile);
        try {
            await telegramClient.updateProfile(firstName, about);
            return "Username updated successfully";
        }
        catch (error) {
            console.log("Some Error: ", (0, utils_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
};
exports.TelegramService = TelegramService;
TelegramService.clientsMap = new Map();
exports.TelegramService = TelegramService = TelegramService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => activechannels_service_1.ActiveChannelsService))),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        buffer_client_service_1.BufferClientService,
        activechannels_service_1.ActiveChannelsService])
], TelegramService);
//# sourceMappingURL=Telegram.service.js.map