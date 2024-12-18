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
exports.TelegramController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const Telegram_service_1 = require("./Telegram.service");
const fs = require("fs");
let TelegramController = class TelegramController {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }
    async connectToTelegram(mobile) {
        return await this.telegramService.createClient(mobile);
    }
    async connectClient(mobile) {
        await this.connectToTelegram(mobile);
        return 'Client connected successfully';
    }
    async disconnect(mobile) {
        return await this.telegramService.deleteClient(mobile);
    }
    async disconnectAll() {
        await this.telegramService.disconnectAll();
        return 'Clients disconnected successfully';
    }
    async getMessages(mobile, username, limit = 8) {
        await this.connectToTelegram(mobile);
        return this.telegramService.getMessages(mobile, username, limit);
    }
    async getMessagesNew(mobile, chatId, offset, limit = 20) {
        await this.telegramService.createClient(mobile, false, false);
        const messages = await this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
        return messages;
    }
    async getChatId(mobile, username) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChatId(mobile, username);
    }
    async sendInlineMessage(mobile, chatId, message, url) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.sendInlineMessage(mobile, chatId, message, url);
    }
    async lastActiveTime(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getLastActiveTime(mobile);
    }
    async joinChannels(mobile, channels) {
        await this.connectToTelegram(mobile);
        return 'Joining Channels';
    }
    async removeOtherAuths(mobile) {
        await this.connectToTelegram(mobile);
        await this.telegramService.removeOtherAuths(mobile);
        return 'Authorizations removed successfully';
    }
    async getSelfMsgsInfo(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getSelfMsgsInfo(mobile);
    }
    async getCallLog(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getCallLog(mobile);
    }
    async getMe(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getMe(mobile);
    }
    async getMedia(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getmedia(mobile);
    }
    async getChannelInfo(mobile, sendIds = false) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChannelInfo(mobile, sendIds);
    }
    async leaveChannels(mobile) {
        await this.connectToTelegram(mobile);
        this.telegramService.leaveChannels(mobile);
        return "Started Leaving Channels";
    }
    async getAuths(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getAuths(mobile);
    }
    async set2Fa(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.set2Fa(mobile);
    }
    async setProfilePic(mobile, name) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.setProfilePic(mobile, name);
    }
    async updatePrivacy(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updatePrivacy(mobile);
    }
    async updateUsername(mobile, username) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updateUsername(mobile, username);
    }
    async newSession(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.createNewSession(mobile);
    }
    async updateName(mobile, firstName, about) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updateNameandBio(mobile, firstName, about);
    }
    async getMediaMetadata(mobile, chatId, offset, limit) {
        await this.telegramService.createClient(mobile, false, false);
        return this.telegramService.getMediaMetadata(mobile, chatId, offset, limit);
    }
    async downloadMediaFile(mobile, messageId, chatId, res) {
        await this.connectToTelegram(mobile);
        await this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
    }
    async downloadProfilePic(mobile, index, res) {
        await this.connectToTelegram(mobile);
        try {
            const filePath = await this.telegramService.downloadProfilePic(mobile, index);
            if (!filePath) {
                return res.status(404).send('Profile photo not found.');
            }
            res.download(filePath, 'profile_pic.jpg', (err) => {
                if (err) {
                    console.error('Error sending the file:', err);
                    res.status(500).send('Error downloading the file.');
                }
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error deleting the file:', err);
                    }
                });
            });
        }
        catch (error) {
            console.error('Error in endpoint:', error);
            res.status(500).send('An error occurred.');
        }
    }
    async forrward(mobile, chatId, messageId) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.forwardMessage(mobile, chatId, messageId);
    }
    async deleteChat(mobile, chatId) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.deleteChat(mobile, chatId);
    }
    async deleteProfilePics(mobile) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.deleteProfilePhotos(mobile);
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Get)('connect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create and connect a new Telegram client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "connectClient", null);
__decorate([
    (0, common_1.Get)('disconnect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create and connect a new Telegram client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Get)('disconnectAll'),
    (0, swagger_1.ApiOperation)({ summary: 'Create and connect a new Telegram client' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnectAll", null);
__decorate([
    (0, common_1.Get)('messages/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get messages from Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'Username to fetch messages from', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Limit the number of messages', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('username')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Get)('messagesNew/:mobile'),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Username to fetch messages from', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Limit the number of messages', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'offset', description: 'offset the number of messages', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessagesNew", null);
__decorate([
    (0, common_1.Get)('chatid/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat ID for a username' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'Username to fetch chat ID for', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('username')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatId", null);
__decorate([
    (0, common_1.Get)('sendInlineMessage/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat ID for a username' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'chat ID of user', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'message', description: 'message ID of user', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'url', description: 'url ID of user', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('message')),
    __param(3, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendInlineMessage", null);
__decorate([
    (0, common_1.Get)('lastActiveTime/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get Last Active time of a user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "lastActiveTime", null);
__decorate([
    (0, common_1.Post)('joinchannels/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Join channels' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ description: 'Channels string', schema: { type: 'object', properties: { channels: { type: 'string' } } } }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)('channels')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "joinChannels", null);
__decorate([
    (0, common_1.Get)('removeauths/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove other authorizations' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "removeOtherAuths", null);
__decorate([
    (0, common_1.Get)('selfmsgsinfo/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get self messages info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getSelfMsgsInfo", null);
__decorate([
    (0, common_1.Get)('getCallLog/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get CallLog  info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getCallLog", null);
__decorate([
    (0, common_1.Get)('getMe/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get me  info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMe", null);
__decorate([
    (0, common_1.Get)('getMedia/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get me  info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMedia", null);
__decorate([
    (0, common_1.Get)('channelinfo/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'sendIds', description: 'Whether to send IDs or not', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('sendIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChannelInfo", null);
__decorate([
    (0, common_1.Get)('leaveChannels/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "leaveChannels", null);
__decorate([
    (0, common_1.Get)('auths/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get authorizations' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getAuths", null);
__decorate([
    (0, common_1.Get)('set2Fa/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set 2Fa' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "set2Fa", null);
__decorate([
    (0, common_1.Get)('setprofilepic/:mobile/:name'),
    (0, swagger_1.ApiOperation)({ summary: 'Set Profile Picture' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiParam)({ name: 'name', description: 'Profile name', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "setProfilePic", null);
__decorate([
    (0, common_1.Get)('updatePrivacy/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update Privacy Settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updatePrivacy", null);
__decorate([
    (0, common_1.Get)('UpdateUsername/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update Username' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'username', description: 'New username', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('username')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateUsername", null);
__decorate([
    (0, common_1.Get)('newSession/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "newSession", null);
__decorate([
    (0, common_1.Get)('updateNameandBio/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update Name' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'firstName', description: 'First Name', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'about', description: 'About', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('firstName')),
    __param(2, (0, common_1.Query)('about')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateName", null);
__decorate([
    (0, common_1.Get)('metadata'),
    __param(0, (0, common_1.Query)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaMetadata", null);
__decorate([
    (0, common_1.Get)('download'),
    __param(0, (0, common_1.Query)('mobile')),
    __param(1, (0, common_1.Query)('messageId')),
    __param(2, (0, common_1.Query)('chatId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadMediaFile", null);
__decorate([
    (0, common_1.Get)('downloadProfilePic'),
    __param(0, (0, common_1.Query)('mobile')),
    __param(1, (0, common_1.Query)('index')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadProfilePic", null);
__decorate([
    (0, common_1.Get)('forward/:mobile/:chatId/:messageId'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'chatId of user', type: String }),
    (0, swagger_1.ApiParam)({ name: 'messageId', description: 'messageId of message', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('chatId')),
    __param(2, (0, common_1.Param)('messageId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forrward", null);
__decorate([
    (0, common_1.Get)('deleteChat/:mobile/:chatId'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    (0, swagger_1.ApiParam)({ name: 'chatId', description: 'chatId of user', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteChat", null);
__decorate([
    (0, common_1.Get)('deleteProfilePics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'User mobile number', type: String }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteProfilePics", null);
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('telegram'),
    (0, swagger_1.ApiTags)('Telegram'),
    __metadata("design:paramtypes", [Telegram_service_1.TelegramService])
], TelegramController);
//# sourceMappingURL=Telegram.controller.js.map