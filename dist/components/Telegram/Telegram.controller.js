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
const dto_1 = require("./dto");
const message_search_dto_1 = require("./dto/message-search.dto");
const metadata_operations_dto_1 = require("./dto/metadata-operations.dto");
const create_chat_folder_dto_1 = require("./dto/create-chat-folder.dto");
const common_responses_dto_1 = require("./dto/common-responses.dto");
let TelegramController = class TelegramController {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }
    async handleTelegramOperation(operation) {
        try {
            return await operation();
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(error.message || 'Telegram operation failed');
        }
    }
    async connect(mobile) {
        return this.handleTelegramOperation(() => this.telegramService.createClient(mobile));
    }
    async disconnect(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.deleteClient(mobile);
        });
    }
    async disconnectAllClients() {
        return this.handleTelegramOperation(() => this.telegramService.disconnectAll());
    }
    async getMe(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMe(mobile);
        });
    }
    async getEntity(mobile, entity) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getEntity(mobile, entity);
        });
    }
    async updateProfile(mobile, updateProfileDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updateNameandBio(mobile, updateProfileDto.firstName, updateProfileDto.about);
        });
    }
    async setProfilePhoto(mobile, photoDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.setProfilePic(mobile, photoDto.name);
        });
    }
    async deleteProfilePhotos(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.deleteProfilePhotos(mobile);
        });
    }
    async getMessages(mobile, chatId, limit) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessages(mobile, chatId, limit);
        });
    }
    async forwardMessage(mobile, forwardDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.forwardBulkMessages(mobile, forwardDto.fromChatId, forwardDto.toChatId, forwardDto.messageIds);
        });
    }
    async processBatchMessages(mobile, batchOp) {
        await this.telegramService.createClient(mobile);
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
                        await this.telegramService.deleteChat(mobile, item.chatId);
                    }
                    break;
                default:
                    throw new common_1.BadRequestException('Unsupported batch operation');
            }
        }, batchOp.delayMs);
    }
    async forwardBulkMessages(mobile, bulkOp) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.forwardBulkMessages(mobile, bulkOp.fromChatId, bulkOp.toChatId, bulkOp.messageIds);
        });
    }
    async searchMessages(mobile, chatId, query, types, offset, limit = 20) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.searchMessages(mobile, { chatId, query, types, offset, limit });
        });
    }
    async getChannelInfo(mobile, includeIds) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChannelInfo(mobile, includeIds);
        });
    }
    async joinChannel(mobile, channel, forward, fromChatId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            if (forward && fromChatId) {
                return this.telegramService.joinChannelAndForward(mobile, fromChatId, channel);
            }
            return this.telegramService.joinChannel(mobile, channel);
        });
    }
    async leaveChannel(mobile, channel) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.leaveChannel(mobile, channel);
        });
    }
    async setup2FA(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.set2Fa(mobile);
        });
    }
    async updatePrivacy(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updatePrivacy(mobile);
        });
    }
    async updatePrivacyBatch(mobile, settings) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updatePrivacyBatch(mobile, settings);
        });
    }
    async getActiveSessions(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getAuths(mobile);
        });
    }
    async terminateOtherSessions(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.removeOtherAuths(mobile);
        });
    }
    async createNewSession(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createNewSession(mobile);
        });
    }
    async getSessionInfo(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getSessionInfo(mobile);
        });
    }
    async terminateSession(mobile, data) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.terminateSession(mobile, data);
        });
    }
    async getConnectionStatus() {
        return {
            status: await this.telegramService.getConnectionStatus()
        };
    }
    async getClientMetadata(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getClientMetadata(mobile);
        });
    }
    async getClientStatistics() {
        return await this.telegramService.getClientStatistics();
    }
    async getHealthStatus() {
        return {
            connections: await this.telegramService.getConnectionStatus(),
            statistics: await this.telegramService.getClientStatistics()
        };
    }
    async getCallLogStats(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getCallLog(mobile);
        });
    }
    async addContactsBulk(mobile, contactsDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.addContacts(mobile, contactsDto.phoneNumbers, contactsDto.prefix);
        });
    }
    async getContacts(mobile) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getContacts();
        });
    }
    async getMediaInfo(mobile, chatId, types, offset, limit) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMediaMetadata(mobile, chatId, offset, limit);
        });
    }
    async sendMedia(mobile, sendMediaDto) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            if (sendMediaDto.type === dto_1.MediaType.PHOTO) {
                return client.sendPhotoChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
            }
            return client.sendFileChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
        });
    }
    async downloadMedia(mobile, chatId, messageId, res) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
        });
    }
    async sendMediaAlbum(mobile, albumDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendMediaAlbum(mobile, albumDto);
        });
    }
    async getMediaMetadata(mobile, searchDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMediaMetadata(mobile, searchDto.chatId, searchDto.offset, searchDto.limit);
        });
    }
    async getFilteredMedia(mobile, chatId, types, startDate, endDate, limit, minId, maxId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getFilteredMedia(mobile, {
                chatId,
                types,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit,
                minId,
                maxId
            });
        });
    }
    async getGroupMembers(mobile, groupId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGrpMembers(mobile, groupId);
        });
    }
    async blockChat(mobile, chatId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.blockUser(mobile, chatId);
        });
    }
    async deleteChatHistory(mobile, chatId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.deleteChat(mobile, chatId);
        });
    }
    async sendMessageWithInlineButton(mobile, chatId, message, url) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendInlineMessage(mobile, chatId, message, url);
        });
    }
    async getAllDialogs(mobile, limit = 500, offsetId = 0, archived = false) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getDialogs(mobile, { limit, archived, offsetId });
        });
    }
    async getLastActiveTime(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getLastActiveTime(mobile);
        });
    }
    async createGroupWithOptions(mobile, options) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createGroupWithOptions(mobile, options);
        });
    }
    async updateGroupSettings(mobile, settings) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updateGroupSettings(mobile, settings);
        });
    }
    async addGroupMembers(memberOp, mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.addGroupMembers(mobile, memberOp.groupId, memberOp.members);
        });
    }
    async removeGroupMembers(memberOp, mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.removeGroupMembers(mobile, memberOp.groupId, memberOp.members);
        });
    }
    async handleAdminOperation(adminOp, mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            if (adminOp.isPromote) {
                return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
            }
            else {
                return this.telegramService.demoteAdmin(mobile, adminOp.groupId, adminOp.userId);
            }
        });
    }
    async cleanupChat(mobile, cleanup) {
        await this.telegramService.createClient(mobile);
        return this.telegramService.cleanupChat(mobile, {
            chatId: cleanup.chatId,
            beforeDate: cleanup.beforeDate ? new Date(cleanup.beforeDate) : undefined,
            onlyMedia: cleanup.onlyMedia,
            excludePinned: cleanup.excludePinned
        });
    }
    async getChatStatistics(mobile, chatId, period = 'week') {
        await this.telegramService.createClient(mobile);
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
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getScheduledMessages(mobile, chatId);
        });
    }
    async sendVoiceMessage(mobile, voice) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendVoiceMessage(mobile, voice);
        });
    }
    async getChatHistory(mobile, chatId, offset, limit) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessagesNew(mobile, chatId, offset, limit);
        });
    }
    async validateSession(mobile) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            const isConnected = await client.connected();
            if (!isConnected) {
                await client.connect();
            }
            return {
                isValid: true,
                isConnected,
                phoneNumber: client.phoneNumber
            };
        });
    }
    async promoteToAdmin(mobile, adminOp) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.promoteToAdmin(mobile, adminOp.groupId, adminOp.userId, adminOp.permissions, adminOp.rank);
        });
    }
    async demoteAdmin(mobile, memberOp) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.demoteAdmin(mobile, memberOp.groupId, memberOp.members[0]);
        });
    }
    async unblockGroupUser(mobile, data) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.unblockGroupUser(mobile, data.groupId, data.userId);
        });
    }
    async getGroupAdmins(mobile, groupId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGroupAdmins(mobile, groupId);
        });
    }
    async getGroupBannedUsers(mobile, groupId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGroupBannedUsers(mobile, groupId);
        });
    }
    async exportContacts(mobile, exportDto, res) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            const data = await this.telegramService.exportContacts(mobile, exportDto.format, exportDto.includeBlocked);
            const filename = `contacts_${mobile}_${new Date().toISOString()}.${exportDto.format}`;
            res.setHeader('Content-Type', exportDto.format === 'vcard' ? 'text/vcard' : 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(data);
        });
    }
    async importContacts(mobile, contacts) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.importContacts(mobile, contacts);
        });
    }
    async manageBlockList(mobile, blockList) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.manageBlockList(mobile, blockList.userIds, blockList.block);
        });
    }
    async getContactStatistics(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getContactStatistics(mobile);
        });
    }
    async createChatFolder(mobile, folder) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createChatFolder(mobile, folder);
        });
    }
    async getChatFolders(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChatFolders(mobile);
        });
    }
    async editMessage(mobile, options) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.editMessage(mobile, options);
        });
    }
    async updateChatSettings(mobile, settings) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updateChatSettings(mobile, settings);
        });
    }
    async sendMediaBatch(mobile, options) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendMediaBatch(mobile, options);
        });
    }
    async hasPassword(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.hasPassword(mobile);
        });
    }
    async getChats(mobile, limit, offsetDate, offsetId, offsetPeer, folderId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChats(mobile, {
                limit,
                offsetDate,
                offsetId,
                offsetPeer,
                folderId
            });
        });
    }
    async getFileUrl(mobile, url, filename) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getFileUrl(mobile, url, filename);
        });
    }
    async getMessageStats(mobile, options) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessageStats(mobile, options);
        });
    }
    async getTopPrivateChats(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getTopPrivateChats(mobile);
        });
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Post)('connect/:mobile'),
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
    (0, common_1.Post)('messages/bulk-forward/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward multiple messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ForwardBatchDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ForwardBatchDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardBulkMessages", null);
__decorate([
    (0, common_1.Get)('messages/search/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Search messages in a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'query', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'types', required: false, enum: message_search_dto_1.MessageType, isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('query')),
    __param(3, (0, common_1.Query)('types')),
    __param(4, (0, common_1.Query)('offset')),
    __param(5, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Array, Number, Number]),
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
    (0, common_1.Post)('channels/join/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Join channel' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiParam)({ name: 'channel', description: 'Channel username or ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'forward', description: 'Whether to forward messages after joining', required: false, type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'fromChatId', description: 'Source chat ID to forward messages from', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('channel')),
    __param(2, (0, common_1.Query)('forward')),
    __param(3, (0, common_1.Query)('fromChatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Boolean, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "joinChannel", null);
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
    (0, common_1.Get)('monitoring/client/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get client metadata' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Client metadata retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getClientMetadata", null);
__decorate([
    (0, common_1.Get)('monitoring/statistics'),
    (0, swagger_1.ApiOperation)({ summary: 'Get client statistics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Statistics retrieved successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getClientStatistics", null);
__decorate([
    (0, common_1.Get)('monitoring/health'),
    (0, swagger_1.ApiOperation)({ summary: 'Get service health' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Health status retrieved successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getHealthStatus", null);
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
    (0, common_1.Get)('media/info/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get media messages info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'types', required: false, enum: dto_1.MediaType, isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'offset', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('types')),
    __param(3, (0, common_1.Query)('offset')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Array, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaInfo", null);
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
    (0, swagger_1.ApiQuery)({ type: dto_1.MediaSearchDto }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [metadata_operations_dto_1.MediaMetadataDto] }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.MediaSearchDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaMetadata", null);
__decorate([
    (0, common_1.Get)('media/filter/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get filtered media messages from a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'types', enum: ['photo', 'video', 'document'], required: false, isArray: true }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of messages to fetch', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'minId', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, type: Number }),
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
    (0, swagger_1.ApiOperation)({ summary: 'Delete a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID to delete', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
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
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of dialogs to fetch', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'offsetId', description: 'Number of dialogs to fetch', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'archived', description: 'Include archived chats', required: false, type: Boolean }),
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
    (0, swagger_1.ApiBody)({ type: dto_1.GroupSettingsDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.GroupSettingsDto]),
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
    (0, common_1.Get)('session/validate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Validate session status' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Session status retrieved successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "validateSession", null);
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
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('telegram'),
    (0, swagger_1.ApiTags)('Telegram'),
    (0, common_1.UsePipes)(new common_1.ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true
    })),
    __metadata("design:paramtypes", [Telegram_service_1.TelegramService])
], TelegramController);
//# sourceMappingURL=Telegram.controller.js.map