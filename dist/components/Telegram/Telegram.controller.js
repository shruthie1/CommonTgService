"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
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
const dto_1 = require("./dto");
const metadata_operations_dto_1 = require("./dto/metadata-operations.dto");
const create_chat_folder_dto_1 = require("./dto/create-chat-folder.dto");
const common_responses_dto_1 = require("./dto/common-responses.dto");
const platform_express_1 = require("@nestjs/platform-express");
const multer = __importStar(require("multer"));
const connection_manager_1 = require("./utils/connection-manager");
const message_search_dto_1 = require("./dto/message-search.dto");
const delete_chat_dto_1 = require("./dto/delete-chat.dto");
const update_username_dto_1 = require("./dto/update-username.dto");
const send_message_dto_1 = require("./dto/send-message.dto");
let TelegramController = class TelegramController {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }
    async connect(mobile) {
        await connection_manager_1.connectionManager.getClient(mobile);
        return { message: 'Connected successfully' };
    }
    async disconnect(mobile) {
        await connection_manager_1.connectionManager.unregisterClient(mobile);
        return { message: 'Disconnected successfully' };
    }
    async disconnectAllClients() {
        await connection_manager_1.connectionManager.disconnectAll();
        return { message: 'All clients disconnected successfully' };
    }
    async getMe(mobile) {
        return this.telegramService.getMe(mobile);
    }
    async getEntity(mobile, entity) {
        return this.telegramService.getEntity(mobile, entity);
    }
    async updateProfile(mobile, updateProfileDto) {
        return this.telegramService.updateNameandBio(mobile, updateProfileDto.firstName, updateProfileDto.about);
    }
    async setProfilePhoto(mobile, photoDto) {
        return this.telegramService.setProfilePic(mobile, photoDto.name);
    }
    async deleteProfilePhotos(mobile) {
        return this.telegramService.deleteProfilePhotos(mobile);
    }
    async getMessages(mobile, chatId, limit) {
        return this.telegramService.getMessages(mobile, chatId, limit);
    }
    async sendMessage(mobile, dto) {
        return this.telegramService.sendMessage(mobile, dto);
    }
    async forwardMessage(mobile, forwardDto) {
        return this.telegramService.forwardBulkMessages(mobile, forwardDto.fromChatId, forwardDto.toChatId, forwardDto.messageIds);
    }
    async processBatchMessages(mobile, batchOp) {
        return this.telegramService.processBatch(batchOp.items, batchOp.batchSize || 20, async (batch) => {
            switch (batchOp.operation) {
                case dto_1.BatchOperationType.FORWARD:
                    for (const item of batch) {
                        if ('messageId' in item && item.fromChatId && item.toChatId) {
                            await this.telegramService.forwardMessage(mobile, item.toChatId, item.fromChatId, item.messageId);
                        }
                    }
                    break;
                case dto_1.BatchOperationType.DELETE:
                    for (const item of batch) {
                        await this.telegramService.deleteChat(mobile, { peer: item.chatId, justClear: true });
                    }
                    break;
                default:
                    throw new common_1.BadRequestException('Unsupported batch operation');
            }
        }, batchOp.delayMs);
    }
    async searchMessages(mobile, queryParams) {
        return this.telegramService.searchMessages(mobile, queryParams);
    }
    async getChannelInfo(mobile, includeIds) {
        return this.telegramService.getChannelInfo(mobile, includeIds);
    }
    async forwardMedia(mobile, channel, fromChatId) {
        await connection_manager_1.connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
        return this.telegramService.forwardMedia(mobile, channel, fromChatId);
    }
    async leaveChannel(mobile, channel) {
        return this.telegramService.leaveChannel(mobile, channel);
    }
    async updateUsername(mobile, updateUsernameDto) {
        return this.telegramService.updateUsername(mobile, updateUsernameDto.newUsername);
    }
    async setup2FA(mobile) {
        return this.telegramService.set2Fa(mobile);
    }
    async updatePrivacy(mobile) {
        return this.telegramService.updatePrivacy(mobile);
    }
    async updatePrivacyBatch(mobile, settings) {
        return this.telegramService.updatePrivacyBatch(mobile, settings);
    }
    async getActiveSessions(mobile) {
        return this.telegramService.getAuths(mobile);
    }
    async terminateOtherSessions(mobile) {
        return this.telegramService.removeOtherAuths(mobile);
    }
    async createNewSession(mobile) {
        return this.telegramService.createNewSession(mobile);
    }
    async getSessionInfo(mobile) {
        return this.telegramService.getSessionInfo(mobile);
    }
    async terminateSession(mobile, data) {
        return this.telegramService.terminateSession(mobile, data);
    }
    async getConnectionStatus() {
        return {
            status: await this.telegramService.getConnectionStatus()
        };
    }
    async getCallLogStats(mobile) {
        return this.telegramService.getCallLog(mobile);
    }
    async addContactsBulk(mobile, contactsDto) {
        return this.telegramService.addContacts(mobile, contactsDto.phoneNumbers, contactsDto.prefix);
    }
    async getContacts(mobile) {
        return await this.telegramService.getContacts(mobile);
    }
    async sendMedia(mobile, sendMediaDto) {
        const client = await connection_manager_1.connectionManager.getClient(mobile);
        if (sendMediaDto.type === dto_1.MediaType.PHOTO) {
            return client.sendPhotoChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
        }
        return client.sendFileChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
    }
    async downloadMedia(mobile, chatId, messageId, res) {
        return this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
    }
    async sendMediaAlbum(mobile, albumDto) {
        return this.telegramService.sendMediaAlbum(mobile, albumDto);
    }
    async getMediaMetadata(mobile, chatId, types, startDate, endDate, limit, minId, maxId, all) {
        return this.telegramService.getMediaMetadata(mobile, {
            chatId,
            types,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit,
            minId,
            maxId,
            all
        });
    }
    async getFilteredMedia(mobile, chatId, types, startDate, endDate, limit, minId, maxId) {
        return this.telegramService.getFilteredMedia(mobile, {
            chatId,
            types,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            limit,
            minId,
            maxId
        });
    }
    async getGroupMembers(mobile, groupId) {
        return this.telegramService.getGrpMembers(mobile, groupId);
    }
    async blockChat(mobile, chatId) {
        return this.telegramService.blockUser(mobile, chatId);
    }
    async deleteChatHistory(mobile, deleteHistoryDto) {
        return this.telegramService.deleteChat(mobile, deleteHistoryDto);
    }
    async sendMessageWithInlineButton(mobile, chatId, message, url) {
        return this.telegramService.sendInlineMessage(mobile, chatId, message, url);
    }
    async getAllDialogs(mobile, limit = 500, offsetId = 0, archived = false) {
        return this.telegramService.getDialogs(mobile, { limit, archived, offsetId });
    }
    async getLastActiveTime(mobile) {
        return this.telegramService.getLastActiveTime(mobile);
    }
    async createGroupWithOptions(mobile, options) {
        return this.telegramService.createGroupWithOptions(mobile, options);
    }
    async updateGroupSettings(mobile, settings) {
        return this.telegramService.updateGroupSettings(mobile, settings);
    }
    async addGroupMembers(memberOp, mobile) {
        return this.telegramService.addGroupMembers(mobile, memberOp.groupId, memberOp.members);
    }
    async removeGroupMembers(memberOp, mobile) {
        return this.telegramService.removeGroupMembers(mobile, memberOp.groupId, memberOp.members);
    }
    async handleAdminOperation(adminOp, mobile) {
        if (adminOp.isPromote) {
            return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
        }
        else {
            return this.telegramService.demoteAdmin(mobile, adminOp.groupId, adminOp.userId);
        }
    }
    async cleanupChat(mobile, cleanup) {
        return this.telegramService.cleanupChat(mobile, {
            chatId: cleanup.chatId,
            beforeDate: cleanup.beforeDate ? new Date(cleanup.beforeDate) : undefined,
            onlyMedia: cleanup.onlyMedia,
            excludePinned: cleanup.excludePinned
        });
    }
    async getChatStatistics(mobile, chatId, period = 'week') {
        return this.telegramService.getChatStatistics(mobile, chatId, period);
    }
    async scheduleMessage(mobile, schedule) {
        return this.telegramService.scheduleMessage(mobile, {
            chatId: schedule.chatId,
            message: schedule.message,
            scheduledTime: new Date(schedule.scheduledTime),
            replyTo: schedule.replyTo,
            silent: schedule.silent
        });
    }
    async getScheduledMessages(mobile, chatId) {
        return this.telegramService.getScheduledMessages(mobile, chatId);
    }
    async sendVoiceMessage(mobile, voice) {
        return this.telegramService.sendVoiceMessage(mobile, voice);
    }
    async sendViewOnceMedia(mobile, file, viewOnceDto) {
        if (viewOnceDto.sourceType === dto_1.MediaSourceType.BINARY && file) {
            return this.telegramService.sendViewOnceMedia(mobile, {
                chatId: viewOnceDto.chatId,
                sourceType: viewOnceDto.sourceType,
                binaryData: file.buffer,
                caption: viewOnceDto.caption,
                filename: viewOnceDto.filename || file.originalname
            });
        }
        return this.telegramService.sendViewOnceMedia(mobile, {
            chatId: viewOnceDto.chatId,
            sourceType: viewOnceDto.sourceType,
            path: viewOnceDto.path,
            base64Data: viewOnceDto.base64Data,
            caption: viewOnceDto.caption,
            filename: viewOnceDto.filename
        });
    }
    async getChatHistory(mobile, chatId, offset, limit) {
        return this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
    }
    async promoteToAdmin(mobile, adminOp) {
        return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
    }
    async demoteAdmin(mobile, memberOp) {
        return this.telegramService.demoteAdmin(mobile, memberOp.groupId, memberOp.members[0]);
    }
    async unblockGroupUser(mobile, data) {
        return this.telegramService.unblockGroupUser(mobile, data.groupId, data.userId);
    }
    async getGroupAdmins(mobile, groupId) {
        return this.telegramService.getGroupAdmins(mobile, groupId);
    }
    async getGroupBannedUsers(mobile, groupId) {
        return this.telegramService.getGroupBannedUsers(mobile, groupId);
    }
    async exportContacts(mobile, exportDto, res) {
        const data = await this.telegramService.exportContacts(mobile, exportDto.format, exportDto.includeBlocked);
        const filename = `contacts_${mobile}_${new Date().toISOString()}.${exportDto.format}`;
        res.setHeader('Content-Type', exportDto.format === 'vcard' ? 'text/vcard' : 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(data);
    }
    async importContacts(mobile, contacts) {
        return this.telegramService.importContacts(mobile, contacts);
    }
    async manageBlockList(mobile, blockList) {
        return this.telegramService.manageBlockList(mobile, blockList.userIds, blockList.block);
    }
    async getContactStatistics(mobile) {
        return this.telegramService.getContactStatistics(mobile);
    }
    async createChatFolder(mobile, folder) {
        return this.telegramService.createChatFolder(mobile, folder);
    }
    async getChatFolders(mobile) {
        return this.telegramService.getChatFolders(mobile);
    }
    async editMessage(mobile, options) {
        return this.telegramService.editMessage(mobile, options);
    }
    async updateChatSettings(mobile, settings) {
        return this.telegramService.updateChatSettings(mobile, settings);
    }
    async sendMediaBatch(mobile, options) {
        return this.telegramService.sendMediaBatch(mobile, options);
    }
    async hasPassword(mobile) {
        return this.telegramService.hasPassword(mobile);
    }
    async getChats(mobile, limit, offsetDate, offsetId, offsetPeer, folderId) {
        return this.telegramService.getChats(mobile, {
            limit,
            offsetDate,
            offsetId,
            offsetPeer,
            folderId
        });
    }
    async getFileUrl(mobile, url, filename) {
        return this.telegramService.getFileUrl(mobile, url, filename);
    }
    async getMessageStats(mobile, options) {
        return this.telegramService.getMessageStats(mobile, options);
    }
    async getTopPrivateChats(mobile) {
        return this.telegramService.getTopPrivateChats(mobile);
    }
    async addBotsToChannel(mobile, body) {
        return this.telegramService.addBotsToChannel(mobile, body.channelIds);
    }
    async createBot(mobile, createBotDto) {
        return this.telegramService.createBot(mobile, createBotDto);
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Get)('connect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Connect to Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Successfully connected' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Connection failed' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "connect", null);
__decorate([
    (0, common_1.Get)('disconnect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect from Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Successfully disconnected' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Post)('disconnect-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect all clients' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'All clients disconnected successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnectAllClients", null);
__decorate([
    (0, common_1.Get)('me/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user profile' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Profile retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMe", null);
__decorate([
    (0, common_1.Get)('entity/:mobile/:entity'),
    (0, swagger_1.ApiOperation)({ summary: 'Get Entity profile' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiParam)({ name: 'entity', description: 'Entity identifier', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Entity retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('entity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getEntity", null);
__decorate([
    (0, common_1.Post)('profile/update/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update profile information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.UpdateProfileDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('profile/photo/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set profile photo' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ProfilePhotoDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ProfilePhotoDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "setProfilePhoto", null);
__decorate([
    (0, common_1.Delete)('profile/photos/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete all profile photos' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteProfilePhotos", null);
__decorate([
    (0, common_1.Get)('messages/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)('message/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a Telegram message as a user' }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the user account to send the message from',
        required: true,
        example: '1234567890',
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_message_dto_1.SendMessageDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)('messages/forward/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ForwardBatchDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ForwardBatchDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardMessage", null);
__decorate([
    (0, common_1.Post)('batch-process/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Process operations in batches' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.BatchProcessDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.BatchProcessDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "processBatchMessages", null);
__decorate([
    (0, common_1.Get)('messages/search/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Search messages in Telegram',
        description: 'Search for messages in a specific chat or globally across all chats'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: 'Messages successfully found',
        type: message_search_dto_1.SearchMessagesResponseDto
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: 'Invalid request parameters' }),
    (0, swagger_1.ApiNotFoundResponse)({ description: 'Mobile number not registered' }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: 'Unauthorized access' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, message_search_dto_1.SearchMessagesDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "searchMessages", null);
__decorate([
    (0, common_1.Get)('channels/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'includeIds', required: false, type: Boolean }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('includeIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChannelInfo", null);
__decorate([
    (0, common_1.Post)('forwardMediatoMe/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward media messages to me' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'channel', description: 'Channel username or ID', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'fromChatId', description: 'Source chat ID to forward messages from', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('channel')),
    __param(2, (0, common_1.Query)('fromChatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardMedia", null);
__decorate([
    (0, common_1.Post)('channels/leave/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Leave channel' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'channel', description: 'Channel ID/username', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "leaveChannel", null);
__decorate([
    (0, common_1.Patch)('username/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update the Telegram username of a user' }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the user whose username should be updated',
        required: true,
        example: '1234567890',
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_username_dto_1.UpdateUsernameDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateUsername", null);
__decorate([
    (0, common_1.Post)('2fa/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Setup two-factor authentication' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "setup2FA", null);
__decorate([
    (0, common_1.Post)('privacy/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update privacy settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updatePrivacy", null);
__decorate([
    (0, common_1.Post)('privacy/batch/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update multiple privacy settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.PrivacySettingsDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.PrivacySettingsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updatePrivacyBatch", null);
__decorate([
    (0, common_1.Get)('sessions/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get active sessions' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Active sessions retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getActiveSessions", null);
__decorate([
    (0, common_1.Delete)('sessions/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminate other sessions' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Other sessions terminated successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "terminateOtherSessions", null);
__decorate([
    (0, common_1.Post)('sessions/new/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'New session created successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createNewSession", null);
__decorate([
    (0, common_1.Get)('session/info/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get session information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getSessionInfo", null);
__decorate([
    (0, common_1.Post)('session/terminate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminate specific session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "terminateSession", null);
__decorate([
    (0, common_1.Get)('monitoring/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get service health and connection status' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: common_responses_dto_1.ConnectionStatusDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getConnectionStatus", null);
__decorate([
    (0, common_1.Get)('monitoring/calllog/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get call log statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getCallLogStats", null);
__decorate([
    (0, common_1.Post)('contacts/add-bulk/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add multiple contacts in bulk' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.AddContactsDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Contacts added successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.AddContactsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addContactsBulk", null);
__decorate([
    (0, common_1.Get)('contacts/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all contacts' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Contacts retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getContacts", null);
__decorate([
    (0, common_1.Post)('media/send/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send media message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.SendMediaDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.SendMediaDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMedia", null);
__decorate([
    (0, common_1.Get)('media/download/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Download media from a message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'messageId', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('messageId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadMedia", null);
__decorate([
    (0, common_1.Post)('media/album/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send media album (multiple photos/videos)' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.SendMediaAlbumDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMediaAlbum", null);
__decorate([
    (0, common_1.Get)('media/metadata/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get media metadata from a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'types', enum: ['photo', 'video', 'document'], required: false, isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of messages to fetch', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minId', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('types')),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __param(5, (0, common_1.Query)('limit')),
    __param(6, (0, common_1.Query)('minId')),
    __param(7, (0, common_1.Query)('maxId')),
    __param(8, (0, common_1.Query)('all')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Array, String, String, Number, Number, Number, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaMetadata", null);
__decorate([
    (0, common_1.Get)('media/filter/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get filtered media messages from a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true, description: 'Chat ID to get media from' }),
    (0, swagger_1.ApiQuery)({ name: 'types', required: false, enum: ['photo', 'video', 'document', 'voice'], isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, description: 'Filter media after this date' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, description: 'Filter media before this date' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Number of media items to fetch' }),
    (0, swagger_1.ApiQuery)({ name: 'minId', required: false, type: Number, description: 'Minimum message ID' }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, type: Number, description: 'Maximum message ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [metadata_operations_dto_1.MediaMetadataDto] }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('types')),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __param(5, (0, common_1.Query)('limit')),
    __param(6, (0, common_1.Query)('minId')),
    __param(7, (0, common_1.Query)('maxId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Array, String, String, Number, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getFilteredMedia", null);
__decorate([
    (0, common_1.Get)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get group members' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', description: 'Group ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getGroupMembers", null);
__decorate([
    (0, common_1.Post)('chat/block/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Block a chat/user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat/User ID to block', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "blockChat", null);
__decorate([
    (0, common_1.Delete)('chat/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete or clear a chat history for a user' }),
    (0, swagger_1.ApiParam)({
        name: 'mobile',
        description: 'Mobile number of the user whose chat should be deleted',
        required: true,
        example: '1234567890',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'peer',
        description: 'Username or Peer ID of the chat to delete',
        required: true,
        example: 'someusername',
    }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, description: 'Delete messages with ID ≤ maxId', example: 100000 }),
    (0, swagger_1.ApiQuery)({ name: 'justClear', required: false, description: 'Only clear history for this user', example: false }),
    (0, swagger_1.ApiQuery)({ name: 'revoke', required: false, description: 'Delete for everyone if possible', example: true }),
    (0, swagger_1.ApiQuery)({ name: 'minDate', required: false, description: 'Minimum date (UNIX timestamp)', example: 1609459200 }),
    (0, swagger_1.ApiQuery)({ name: 'maxDate', required: false, description: 'Maximum date (UNIX timestamp)', example: 1612137600 }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, delete_chat_dto_1.DeleteHistoryDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteChatHistory", null);
__decorate([
    (0, common_1.Get)('messages/inline/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send message with inline button' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'message', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'url', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('message')),
    __param(3, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMessageWithInlineButton", null);
__decorate([
    (0, common_1.Get)('dialogs/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all dialogs' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Number of dialogs to fetch', default: 500 }),
    (0, swagger_1.ApiQuery)({ name: 'offsetId', required: false, type: Number, description: 'Offset ID for pagination', default: 0 }),
    (0, swagger_1.ApiQuery)({ name: 'archived', required: false, type: Boolean, description: 'Include archived chats', default: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offsetId')),
    __param(3, (0, common_1.Query)('archived')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getAllDialogs", null);
__decorate([
    (0, common_1.Get)('last-active/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get last active time' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Last active time retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getLastActiveTime", null);
__decorate([
    (0, common_1.Post)('group/create/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new group with advanced options' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.createGroupDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.createGroupDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createGroupWithOptions", null);
__decorate([
    (0, common_1.Post)('group/settings/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update group settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupSettingsDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.GroupSettingsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateGroupSettings", null);
__decorate([
    (0, common_1.Post)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add members to a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupMemberOperationDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.GroupMemberOperationDto, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addGroupMembers", null);
__decorate([
    (0, common_1.Delete)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove members from a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupMemberOperationDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.GroupMemberOperationDto, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "removeGroupMembers", null);
__decorate([
    (0, common_1.Post)('group/admin/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Promote or demote group admins' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.AdminOperationDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.AdminOperationDto, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "handleAdminOperation", null);
__decorate([
    (0, common_1.Post)('chat/cleanup/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Clean up chat history' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ChatCleanupDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ChatCleanupDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "cleanupChat", null);
__decorate([
    (0, common_1.Get)('chat/statistics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'period', enum: ['day', 'week', 'month'], description: 'Statistics period', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatStatistics", null);
__decorate([
    (0, common_1.Post)('messages/schedule/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Schedule a message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ScheduleMessageDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ScheduleMessageDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "scheduleMessage", null);
__decorate([
    (0, common_1.Get)('messages/scheduled/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get scheduled messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getScheduledMessages", null);
__decorate([
    (0, common_1.Post)('media/voice/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send voice message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendVoiceMessage", null);
__decorate([
    (0, common_1.Post)('media/view-once/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a view once (disappearing) media message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiConsumes)('multipart/form-data', 'application/json'),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                chatId: { type: 'string', description: 'Chat ID to send the media to' },
                sourceType: { type: 'string', enum: ['path', 'base64', 'binary'], description: 'Source type of media' },
                path: { type: 'string', description: 'path of the media file (when sourceType is Path)' },
                base64Data: { type: 'string', description: 'Base64 data (when sourceType is base64)' },
                binaryData: { type: 'string', format: 'binary', description: 'Binary file (when sourceType is binary)' },
                caption: { type: 'string', description: 'Optional caption for the media' },
                filename: { type: 'string', description: 'Optional filename for the media' }
            },
            required: ['chatId', 'sourceType']
        }
    }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('binaryData', {
        storage: multer.memoryStorage()
    })),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'View once media sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Failed to send view once media' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, dto_1.ViewOnceMediaDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendViewOnceMedia", null);
__decorate([
    (0, common_1.Get)('chat/history/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat history with metadata' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatHistory", null);
__decorate([
    (0, common_1.Post)('group/admin/promote/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Promote members to admin' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.AdminOperationDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.AdminOperationDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "promoteToAdmin", null);
__decorate([
    (0, common_1.Post)('group/admin/demote/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Demote admin to regular member' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.GroupMemberOperationDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.GroupMemberOperationDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "demoteAdmin", null);
__decorate([
    (0, common_1.Post)('group/unblock/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Unblock a user in a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "unblockGroupUser", null);
__decorate([
    (0, common_1.Get)('group/admins/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get list of group admins' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', description: 'Group ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getGroupAdmins", null);
__decorate([
    (0, common_1.Get)('group/banned/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get list of banned users in a group' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', description: 'Group ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getGroupBannedUsers", null);
__decorate([
    (0, common_1.Post)('contacts/export/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Export contacts in vCard or CSV format' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ContactExportImportDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ContactExportImportDto, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "exportContacts", null);
__decorate([
    (0, common_1.Post)('contacts/import/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Import contacts from a list' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "importContacts", null);
__decorate([
    (0, common_1.Post)('contacts/block/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Manage blocked contacts' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ContactBlockListDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ContactBlockListDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "manageBlockList", null);
__decorate([
    (0, common_1.Get)('contacts/statistics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get contact activity statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Contact statistics retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getContactStatistics", null);
__decorate([
    (0, common_1.Post)('folders/create/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new chat folder' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: create_chat_folder_dto_1.CreateChatFolderDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_chat_folder_dto_1.CreateChatFolderDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createChatFolder", null);
__decorate([
    (0, common_1.Get)('folders/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all chat folders' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatFolders", null);
__decorate([
    (0, common_1.Put)('messages/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Edit message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "editMessage", null);
__decorate([
    (0, common_1.Post)('chat/settings/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update chat settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateChatSettings", null);
__decorate([
    (0, common_1.Post)('media/batch/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send multiple media files in batch' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMediaBatch", null);
__decorate([
    (0, common_1.Get)('security/2fa-status/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Check if 2FA password is set' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "hasPassword", null);
__decorate([
    (0, common_1.Get)('chats/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chats with advanced filtering' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offsetDate')),
    __param(3, (0, common_1.Query)('offsetId')),
    __param(4, (0, common_1.Query)('offsetPeer')),
    __param(5, (0, common_1.Query)('folderId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, Number, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChats", null);
__decorate([
    (0, common_1.Get)('file/url/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get downloadable URL for a file' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('url')),
    __param(2, (0, common_1.Query)('filename')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getFileUrl", null);
__decorate([
    (0, common_1.Get)('messages/stats/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get message statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessageStats", null);
__decorate([
    (0, common_1.Get)('chats/top-private/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get top 5 private chats with detailed statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getTopPrivateChats", null);
__decorate([
    (0, common_1.Post)('bots/add-to-channel/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add bots to channel with admin privileges' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                channelIds: {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    description: 'Array of channel IDs to add bots to. If not provided, will use default channels from environment variables.'
                }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Bots added to channels successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addBotsToChannel", null);
__decorate([
    (0, common_1.Post)('bot/create/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new bot using BotFather' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.CreateBotDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Bot created successfully',
        schema: {
            type: 'object',
            properties: {
                botToken: { type: 'string', description: 'The token to access HTTP Bot API' },
                username: { type: 'string', description: 'The username of the created bot' }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request - Invalid bot details' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized - Client not connected' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CreateBotDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createBot", null);
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('telegram'),
    (0, swagger_1.ApiTags)('Telegram'),
    __metadata("design:paramtypes", [Telegram_service_1.TelegramService])
], TelegramController);
//# sourceMappingURL=Telegram.controller.js.map