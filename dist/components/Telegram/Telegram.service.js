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
const active_channels_service_1 = require("../active-channels/active-channels.service");
const path = require("path");
const channels_service_1 = require("../channels/channels.service");
let TelegramService = TelegramService_1 = class TelegramService {
    constructor(usersService, bufferClientService, activeChannelsService, channelsService) {
        this.usersService = usersService;
        this.bufferClientService = bufferClientService;
        this.activeChannelsService = activeChannelsService;
        this.channelsService = channelsService;
    }
    async onModuleDestroy() {
        await this.disconnectAll();
    }
    getActiveClientSetup() {
        return TelegramManager_1.default.getActiveClientSetup();
    }
    setActiveClientSetup(data) {
        TelegramManager_1.default.setActiveClientSetup(data);
    }
    async getClient(number) {
        const client = TelegramService_1.clientsMap.get(number);
        try {
            if (client && client.connected()) {
                await client.connect();
                return client;
            }
        }
        catch (error) {
            console.log(error);
        }
        return undefined;
    }
    hasClient(number) {
        return TelegramService_1.clientsMap.has(number);
    }
    async deleteClient(number) {
        const cli = await this.getClient(number);
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
        TelegramService_1.clientsMap.clear();
        this.bufferClientService.clearJoinChannelInterval();
    }
    async createClient(mobile, autoDisconnect = true, handler = true) {
        const user = (await this.usersService.search({ mobile }))[0];
        if (!user) {
            throw new common_1.BadRequestException('user not found');
        }
        if (!this.hasClient(mobile)) {
            let telegramManager = new TelegramManager_1.default(user.session, user.mobile);
            let client;
            try {
                client = await telegramManager.createClient(handler);
                await client.getMe();
                if (client) {
                    TelegramService_1.clientsMap.set(mobile, telegramManager);
                    if (autoDisconnect) {
                        setTimeout(async () => {
                            if (client.connected || await this.getClient(mobile)) {
                                console.log("SELF destroy client : ", mobile);
                                await telegramManager.disconnect();
                            }
                            else {
                                console.log("Client Already Disconnected : ", mobile);
                            }
                            TelegramService_1.clientsMap.delete(mobile);
                        }, 180000);
                    }
                    else {
                        setInterval(async () => {
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
                if (telegramManager) {
                    await telegramManager.disconnect();
                    telegramManager = null;
                    TelegramService_1.clientsMap.delete(mobile);
                }
                const errorDetails = (0, utils_1.parseError)(error);
                if ((0, utils_1.contains)(errorDetails.message.toLowerCase(), ['expired', 'unregistered', 'deactivated', "session_revoked", "user_deactivated_ban"])) {
                    console.log("Deleting User: ", user.mobile);
                    await this.usersService.updateByFilter({ $or: [{ tgId: user.tgId }, { mobile: mobile }] }, { expired: true });
                }
                else {
                    console.log('Not Deleting user');
                }
                throw new common_1.BadRequestException(errorDetails.message);
            }
        }
        else {
            console.log("Client Already exists");
            return await this.getClient(mobile);
        }
    }
    async getMessages(mobile, username, limit = 8) {
        const telegramClient = await this.getClient(mobile);
        return telegramClient.getMessages(username, limit);
    }
    async getMessagesNew(mobile, username, offset, limit) {
        const telegramClient = await this.getClient(mobile);
        return telegramClient.getMessagesNew(username, offset, limit);
    }
    async sendInlineMessage(mobile, chatId, message, url) {
        const telegramClient = await this.getClient(mobile);
        return telegramClient.sendInlineMessage(chatId, message, url);
    }
    async getChatId(mobile, username) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getchatId(username);
    }
    async getLastActiveTime(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getLastActiveTime();
    }
    async tryJoiningChannel(mobile, chatEntity) {
        const telegramClient = await this.getClient(mobile);
        try {
            await telegramClient.joinChannel(chatEntity.username);
            console.log(telegramClient.phoneNumber, " - Joined channel Success - ", chatEntity.username);
            if (chatEntity.canSendMsgs) {
            }
            else {
                await this.channelsService.remove(chatEntity.channelId);
                await this.activeChannelsService.remove(chatEntity.channelId);
                console.log("Removed Channel- ", chatEntity.username);
            }
        }
        catch (error) {
            console.log(telegramClient.phoneNumber, " - Failed to join - ", chatEntity.username);
            this.removeChannels(error, chatEntity.channelId, chatEntity.username);
            throw error;
        }
    }
    ;
    async removeChannels(error, channelId, username) {
        if (error.errorMessage == "USERNAME_INVALID" || error.errorMessage == 'CHAT_INVALID' || error.errorMessage == 'USERS_TOO_MUCH' || error.toString().includes("No user has")) {
            try {
                if (channelId) {
                    await this.channelsService.remove(channelId);
                    await this.activeChannelsService.remove(channelId);
                    console.log("Removed Channel- ", channelId);
                }
                else {
                    const channelDetails = (await this.channelsService.search({ username: username }))[0];
                    await this.channelsService.remove(channelDetails.channelId);
                    await this.activeChannelsService.remove(channelDetails.channelId);
                    console.log("Removed Channel - ", channelDetails.channelId);
                }
            }
            catch (searchError) {
                console.log("Failed to search/remove channel: ", searchError);
            }
        }
        else if (error.errorMessage === "CHANNEL_PRIVATE") {
            await this.channelsService.update(channelId, { private: true });
            await this.activeChannelsService.update(channelId, { private: true });
        }
    }
    async removeOtherAuths(mobile) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.removeOtherAuths();
        return 'Authorizations removed successfully';
    }
    async getSelfMsgsInfo(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getSelfMSgsInfo();
    }
    async getCallLog(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getCallLog();
    }
    async getmedia(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getMediaMessages();
    }
    async getChannelInfo(mobile, sendIds = false) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.channelInfo(sendIds);
    }
    async getAuths(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getAuths();
    }
    async getMe(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getMe();
    }
    async createNewSession(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.createNewSession();
    }
    async set2Fa(mobile) {
        const telegramClient = await this.getClient(mobile);
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
        const telegramClient = await this.getClient(mobile);
        await telegramClient.updatePrivacyforDeletedAccount();
    }
    async deleteProfilePhotos(mobile) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
    }
    async setProfilePic(mobile, name) {
        const telegramClient = await this.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
        try {
            await cloudinary_1.CloudinaryService.getInstance(name);
            await (0, utils_1.sleep)(2000);
            const rootPath = process.cwd();
            console.log("checking path", rootPath);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, utils_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, utils_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
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
        const telegramClient = await this.getClient(mobile);
        try {
            await telegramClient.updatePrivacy();
            return "Privacy updated successfully";
        }
        catch (error) {
            const errorDetails = (0, utils_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, parseInt(errorDetails.status));
        }
    }
    async downloadProfilePic(mobile, index) {
        const telegramClient = await this.getClient(mobile);
        try {
            return await telegramClient.downloadProfilePic(index);
        }
        catch (error) {
            console.log("Some Error: ", (0, utils_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async updateUsername(mobile, username) {
        const telegramClient = await this.getClient(mobile);
        try {
            return await telegramClient.updateUsername(username);
        }
        catch (error) {
            console.log("Some Error: ", (0, utils_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async getMediaMetadata(mobile, chatId, offset, limit) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getMediaMetadata(chatId, offset, limit);
    }
    async downloadMediaFile(mobile, messageId, chatId, res) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.downloadMediaFile(messageId, chatId, res);
    }
    async forwardMessage(mobile, chatId, messageId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.forwardMessage(chatId, messageId);
    }
    async leaveChannels(mobile) {
        const telegramClient = await this.getClient(mobile);
        const channelinfo = await telegramClient.channelInfo(false);
        const leaveChannelIds = channelinfo.canSendFalseChats;
        return await telegramClient.leaveChannels(leaveChannelIds);
    }
    async deleteChat(mobile, chatId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.deleteChat(chatId);
    }
    async updateNameandBio(mobile, firstName, about) {
        const telegramClient = await this.getClient(mobile);
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
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        buffer_client_service_1.BufferClientService,
        active_channels_service_1.ActiveChannelsService,
        channels_service_1.ChannelsService])
], TelegramService);
//# sourceMappingURL=Telegram.service.js.map