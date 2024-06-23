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
    async getMessages(mobile, username, limit = 8) {
        await this.connectToTelegram(mobile);
        return this.telegramService.getMessages(mobile, username, limit);
    }
    async getChatId(mobile, username) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChatId(mobile, username);
    }
    async joinChannels(mobile, channels) {
        await this.connectToTelegram(mobile);
        this.telegramService.joinChannels(mobile, channels);
        return 'Channels joined successfully';
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
    async getChannelInfo(mobile, sendIds = false) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.getChannelInfo(mobile, sendIds);
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
    async updateName(mobile, firstName, about) {
        await this.connectToTelegram(mobile);
        return await this.telegramService.updateNameandBio(mobile, firstName, about);
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
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('telegram'),
    (0, swagger_1.ApiTags)('Telegram'),
    __metadata("design:paramtypes", [Telegram_service_1.TelegramService])
], TelegramController);
//# sourceMappingURL=Telegram.controller.js.map