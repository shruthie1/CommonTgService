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
const forward_message_dto_1 = require("./dto/forward-message.dto");
const update_profile_dto_1 = require("./dto/update-profile.dto");
const channel_operation_dto_1 = require("./dto/channel-operation.dto");
const metadata_operations_dto_1 = require("./dto/metadata-operations.dto");
const contact_operation_dto_1 = require("./dto/contact-operation.dto");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
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
    async getMe(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMe(mobile);
        });
    }
    async updateProfile(mobile, updateProfileDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updateNameandBio(mobile, updateProfileDto.firstName, updateProfileDto.about);
        });
    }
    async setProfilePhoto(mobile, name) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.setProfilePic(mobile, name);
        });
    }
    async deleteProfilePhotos(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.deleteProfilePhotos(mobile);
        });
    }
    async getMessages(mobile, chatId, limit = 20) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMessages(mobile, chatId, limit);
        });
    }
    async forwardMessage(forwardMessageDto) {
        return this.handleTelegramOperation(async () => {
            const { mobile, chatId, messageId } = forwardMessageDto;
            await this.telegramService.createClient(mobile);
            return this.telegramService.forwardMessage(mobile, chatId, messageId);
        });
    }
    async forwardBulkMessages(mobile, bulkOp) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.forwardBulkMessages(mobile, bulkOp.fromChatId, bulkOp.toChatId, bulkOp.messageIds);
        });
    }
    async getChannelInfo(mobile, includeIds = false) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChannelInfo(mobile, includeIds);
        });
    }
    async joinChannel(mobile, channelOp) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            if (channelOp.forward) {
                return this.telegramService.joinChannelAndForward(mobile, channelOp.fromChatId, channelOp.channel);
            }
            return this.telegramService.joinChannel(mobile, channelOp.channel);
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
    async getMediaStats(mobile) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getSelfMSgsInfo();
        });
    }
    async getCallLogStats(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getCallLog(mobile);
        });
    }
    async addContactsBulk(contactsDto) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(contactsDto.mobile);
            return this.telegramService.addContacts(contactsDto.mobile, contactsDto.phoneNumbers, contactsDto.prefix);
        });
    }
    async getMediaInfo(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getmedia(mobile);
        });
    }
    async sendMedia(mobile, chatId, url, caption = '', filename, type) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            if (type === 'photo') {
                return client.sendPhotoChat(chatId, url, caption, filename);
            }
            else {
                return client.sendFileChat(chatId, url, caption, filename);
            }
        });
    }
    async downloadMedia(mobile, messageId, chatId, res) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.downloadMediaFile(mobile, messageId, chatId, res);
        });
    }
    async getMediaMetadata(mobile, chatId = 'me', offset, limit = 100) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getMediaMetadata(mobile, chatId, offset, limit);
        });
    }
    async getAllChats(mobile) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getAllChats();
        });
    }
    async getGroupMembers(mobile, entityId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getGrpMembers(mobile, entityId);
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
    async getAllDialogs(mobile, limit = 500, archived = false) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getDialogs(mobile, { limit, archived });
        });
    }
    async getContacts(mobile) {
        return this.handleTelegramOperation(async () => {
            const client = await this.telegramService.createClient(mobile);
            return client.getContacts();
        });
    }
    async getLastActiveTime(mobile) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getLastActiveTime(mobile);
        });
    }
    async disconnectAllClients() {
        return this.handleTelegramOperation(() => this.telegramService.disconnectAll());
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
    async scheduleMessage(mobile, schedule) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.scheduleMessage(mobile, schedule);
        });
    }
    async getScheduledMessages(mobile, chatId) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getScheduledMessages(mobile, chatId);
        });
    }
    async sendMediaAlbum(mobile, album) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendMediaAlbum(mobile, album);
        });
    }
    async sendVoiceMessage(mobile, voice) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.sendVoiceMessage(mobile, voice);
        });
    }
    async cleanupChat(mobile, cleanup) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.cleanupChat(mobile, cleanup);
        });
    }
    async getChatStatistics(mobile, chatId, period = 'week') {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChatStatistics(mobile, chatId, period);
        });
    }
    async updatePrivacyBatch(mobile, settings) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.updatePrivacyBatch(mobile, settings);
        });
    }
    async createBackup(mobile, options) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.createBackup(mobile, options);
        });
    }
    async downloadBackup(mobile, backupId, res) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            const result = await this.telegramService.createBackup(mobile, {
                chatIds: [backupId],
                includeMedia: true,
                exportFormat: 'json'
            });
            return res.download(result.path);
        });
    }
    async downloadExistingBackup(mobile, backupId, options) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            const fullOptions = {
                ...options,
                backupId
            };
            return this.telegramService.downloadBackup(mobile, fullOptions);
        });
    }
    async getChatBackupStats(mobile, chatId, period = 'week') {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.getChatStatistics(mobile, chatId, period);
        });
    }
    async listBackups(mobile) {
        return this.handleTelegramOperation(async () => {
            const backupsPath = path.join(process.cwd(), 'backups');
            if (!fs.existsSync(backupsPath)) {
                return [];
            }
            const backups = fs.readdirSync(backupsPath)
                .filter(dir => fs.statSync(path.join(backupsPath, dir)).isDirectory())
                .map(dir => {
                const backupJsonPath = path.join(backupsPath, dir, 'backup.json');
                if (fs.existsSync(backupJsonPath)) {
                    const backupData = JSON.parse(fs.readFileSync(backupJsonPath, 'utf-8'));
                    return {
                        backupId: dir,
                        timestamp: backupData.timestamp,
                        account: backupData.account,
                        chats: backupData.chats.length,
                        totalMessages: backupData.chats.reduce((sum, chat) => sum + chat.messages.length, 0)
                    };
                }
                return null;
            })
                .filter(backup => backup !== null && backup.account === mobile);
            return backups;
        });
    }
    async deleteBackup(mobile, backupId) {
        return this.handleTelegramOperation(async () => {
            const backupPath = path.join(process.cwd(), 'backups', backupId);
            if (!fs.existsSync(backupPath)) {
                throw new common_1.BadRequestException('Backup not found');
            }
            const backupJsonPath = path.join(backupPath, 'backup.json');
            if (fs.existsSync(backupJsonPath)) {
                const backupData = JSON.parse(fs.readFileSync(backupJsonPath, 'utf-8'));
                if (backupData.account !== mobile) {
                    throw new common_1.BadRequestException('Unauthorized to delete this backup');
                }
            }
            fs.rmSync(backupPath, { recursive: true, force: true });
            return { success: true, message: 'Backup deleted successfully' };
        });
    }
    async processBatchMessages(mobile, batchOptions) {
        return this.handleTelegramOperation(async () => {
            await this.telegramService.createClient(mobile);
            return this.telegramService.processBatch(batchOptions.items, batchOptions.batchSize, async (batch) => {
                switch (batchOptions.operation) {
                    case 'forward':
                        for (const item of batch) {
                            await this.telegramService.forwardMessage(mobile, item.chatId, item.messageId);
                        }
                        break;
                    case 'delete':
                        for (const item of batch) {
                            await this.telegramService.deleteChat(mobile, item.chatId);
                        }
                        break;
                    default:
                        throw new common_1.BadRequestException('Unsupported batch operation');
                }
            }, batchOptions.delayMs);
        });
    }
    async getChatHistory(mobile, chatId, offset = 0, limit = 20) {
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
    (0, common_1.Post)('profile/update/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update profile information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Profile updated successfully' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_profile_dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('profile/photo/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Set profile photo' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiParam)({ name: 'name', description: 'Profile photo name', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
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
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID or username', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of messages', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)('messages/forward'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward messages' }),
    (0, swagger_1.ApiBody)({ type: forward_message_dto_1.ForwardMessageDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [forward_message_dto_1.ForwardMessageDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardMessage", null);
__decorate([
    (0, common_1.Post)('messages/bulk-forward/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward multiple messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: metadata_operations_dto_1.BulkMessageOperationDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, metadata_operations_dto_1.BulkMessageOperationDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "forwardBulkMessages", null);
__decorate([
    (0, common_1.Get)('channels/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get channel information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'includeIds', description: 'Include channel IDs', required: false }),
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
    (0, swagger_1.ApiBody)({ type: channel_operation_dto_1.ChannelOperationDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, channel_operation_dto_1.ChannelOperationDto]),
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
    (0, common_1.Get)('sessions/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get active sessions' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getActiveSessions", null);
__decorate([
    (0, common_1.Delete)('sessions/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminate other sessions' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "terminateOtherSessions", null);
__decorate([
    (0, common_1.Post)('sessions/new/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createNewSession", null);
__decorate([
    (0, common_1.Get)('monitoring/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get connection status' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Connection status retrieved successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getConnectionStatus", null);
__decorate([
    (0, common_1.Get)('monitoring/client/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get client metadata' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
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
    (0, common_1.Get)('monitoring/media-statistics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get media message statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaStats", null);
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
    (0, common_1.Post)('contacts/add-bulk'),
    (0, swagger_1.ApiOperation)({ summary: 'Add multiple contacts in bulk' }),
    (0, swagger_1.ApiBody)({ type: contact_operation_dto_1.AddContactsDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Contacts added successfully' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [contact_operation_dto_1.AddContactsDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "addContactsBulk", null);
__decorate([
    (0, common_1.Get)('media/info/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get media messages info' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaInfo", null);
__decorate([
    (0, common_1.Post)('media/send/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send media message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID to send to', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'url', description: 'Media URL', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'caption', description: 'Media caption', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'filename', description: 'Filename for the media', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'type', description: 'Media type (photo/file)', required: true, enum: ['photo', 'file'] }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('url')),
    __param(3, (0, common_1.Query)('caption')),
    __param(4, (0, common_1.Query)('filename')),
    __param(5, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMedia", null);
__decorate([
    (0, common_1.Post)('media/download/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Download media from a message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'messageId', description: 'Message ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('messageId')),
    __param(2, (0, common_1.Query)('chatId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadMedia", null);
__decorate([
    (0, common_1.Get)('media/metadata/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get media metadata from a chat' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'offset', description: 'Message offset', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of messages', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaMetadata", null);
__decorate([
    (0, common_1.Get)('chats/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all chats' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getAllChats", null);
__decorate([
    (0, common_1.Get)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get group members' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'entityId', description: 'Group/Channel ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('entityId')),
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
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'message', description: 'Message text', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'url', description: 'Button URL', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('message')),
    __param(3, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMessageWithInlineButton", null);
__decorate([
    (0, common_1.Get)('dialogs/all/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all dialogs' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of dialogs to fetch', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'archived', description: 'Include archived chats', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('archived')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getAllDialogs", null);
__decorate([
    (0, common_1.Get)('contacts/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all contacts' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getContacts", null);
__decorate([
    (0, common_1.Get)('last-active/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get last active time' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getLastActiveTime", null);
__decorate([
    (0, common_1.Post)('disconnect-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect all clients' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'All clients disconnected successfully' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnectAllClients", null);
__decorate([
    (0, common_1.Post)('group/create/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new group with advanced options' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ description: 'Group creation options', type: 'object' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createGroupWithOptions", null);
__decorate([
    (0, common_1.Post)('group/settings/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update group settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ description: 'Group settings' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updateGroupSettings", null);
__decorate([
    (0, common_1.Post)('messages/schedule/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Schedule a message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "scheduleMessage", null);
__decorate([
    (0, common_1.Get)('messages/scheduled/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get scheduled messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getScheduledMessages", null);
__decorate([
    (0, common_1.Post)('media/album/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Send media album (multiple photos/videos)' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMediaAlbum", null);
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
    (0, common_1.Post)('chat/cleanup/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Clean up chat history' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "cleanupChat", null);
__decorate([
    (0, common_1.Get)('chat/statistics/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat statistics' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatStatistics", null);
__decorate([
    (0, common_1.Post)('privacy/batch/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update multiple privacy settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "updatePrivacyBatch", null);
__decorate([
    (0, common_1.Post)('backup/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create chat backup' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createBackup", null);
__decorate([
    (0, common_1.Get)('backup/:mobile/download'),
    (0, swagger_1.ApiOperation)({ summary: 'Download chat backup' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'backupId', description: 'Backup ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('backupId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadBackup", null);
__decorate([
    (0, common_1.Get)('backup/download/:mobile/:backupId'),
    (0, swagger_1.ApiOperation)({ summary: 'Download backup using backupId' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiParam)({ name: 'backupId', description: 'Backup ID', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Param)('backupId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadExistingBackup", null);
__decorate([
    (0, common_1.Get)('backup/stats/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat statistics for backup' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'period', enum: ['day', 'week', 'month'], description: 'Statistics period', required: false }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('period')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatBackupStats", null);
__decorate([
    (0, common_1.Get)('backup/list/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'List available backups' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "listBackups", null);
__decorate([
    (0, common_1.Delete)('backup/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a backup' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'backupId', description: 'Backup ID to delete', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('backupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "deleteBackup", null);
__decorate([
    (0, common_1.Post)('batch-process/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Process messages in batches' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "processBatchMessages", null);
__decorate([
    (0, common_1.Get)('chat/history/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get chat history with metadata' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'chatId', description: 'Chat ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'offset', description: 'Message offset', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: 'Number of messages', required: false }),
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
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "validateSession", null);
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