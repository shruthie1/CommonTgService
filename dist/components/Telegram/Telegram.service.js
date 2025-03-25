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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const users_service_1 = require("../users/users.service");
const TelegramManager_1 = __importDefault(require("./TelegramManager"));
const common_1 = require("@nestjs/common");
const cloudinary_1 = require("../../cloudinary");
const active_channels_service_1 = require("../active-channels/active-channels.service");
const path = __importStar(require("path"));
const channels_service_1 = require("../channels/channels.service");
const parseError_1 = require("../../utils/parseError");
const connection_manager_1 = require("./utils/connection-manager");
const telegram_logger_1 = require("./utils/telegram-logger");
const fs = __importStar(require("fs"));
const Helpers_1 = require("telegram/Helpers");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
let TelegramService = class TelegramService {
    constructor(usersService, activeChannelsService, channelsService) {
        this.usersService = usersService;
        this.activeChannelsService = activeChannelsService;
        this.channelsService = channelsService;
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.cleanupInterval = connection_manager_1.connectionManager.startCleanupInterval();
        connection_manager_1.connectionManager.setUsersService(this.usersService);
    }
    async onModuleDestroy() {
        this.logger.logOperation('system', 'Module destroy initiated');
        clearInterval(this.cleanupInterval);
        await connection_manager_1.connectionManager.disconnectAll();
    }
    getActiveClientSetup() {
        return TelegramManager_1.default.getActiveClientSetup();
    }
    setActiveClientSetup(data) {
        TelegramManager_1.default.setActiveClientSetup(data);
    }
    async getMessages(mobile, username, limit = 8) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return telegramClient.getMessages(username, limit);
    }
    async getMessagesNew(mobile, username, offset, limit) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return telegramClient.getMessagesNew(username, offset, limit);
    }
    async sendInlineMessage(mobile, chatId, message, url) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return telegramClient.sendInlineMessage(chatId, message, url);
    }
    async getChatId(mobile, username) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getchatId(username);
    }
    async getLastActiveTime(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getLastActiveTime();
    }
    async tryJoiningChannel(mobile, chatEntity) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
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
    async getGrpMembers(mobile, entity) {
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
            return await telegramClient.getGrpMembers(entity);
        }
        catch (err) {
            console.error("Error fetching group members:", err);
        }
    }
    async addContact(mobile, data, prefix) {
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
            return await telegramClient.addContact(data, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async addContacts(mobile, phoneNumbers, prefix) {
        try {
            const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
            return await telegramClient.addContacts(phoneNumbers, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async getSelfMsgsInfo(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getSelfMSgsInfo();
    }
    async createGroup(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.createGroup();
    }
    async forwardMedia(mobile, channel, fromChatId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        telegramClient.forwardMedia(channel, fromChatId);
        setTimeout(async () => {
            try {
                await this.leaveChannel(mobile, "2302868706");
            }
            catch (error) {
                console.log("Error in forwardMedia: ", error);
            }
        }, 5 * 60000);
        return "Media forward initiated";
    }
    async blockUser(mobile, chatId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.blockUser(chatId);
    }
    async joinChannel(mobile, channelId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.joinChannel(channelId);
    }
    async getCallLog(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getCallLog();
    }
    async getmedia(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getMediaMessages();
    }
    async getChannelInfo(mobile, sendIds = false) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.channelInfo(sendIds);
    }
    async getMe(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getMe();
    }
    async getEntity(mobile, entity) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getEntity(entity);
    }
    async createNewSession(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.createNewSession();
    }
    async set2Fa(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            await telegramClient.set2fa();
            return '2Fa set successfully';
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
    }
    async updatePrivacyforDeletedAccount(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.updatePrivacyforDeletedAccount();
    }
    async deleteProfilePhotos(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
    }
    async setProfilePic(mobile, name) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.deleteProfilePhotos();
        try {
            await cloudinary_1.CloudinaryService.getInstance(name);
            await (0, Helpers_1.sleep)(2000);
            const rootPath = process.cwd();
            console.log("checking path", rootPath);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp1.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp2.jpg'));
            await (0, Helpers_1.sleep)(3000);
            await telegramClient.updateProfilePic(path.join(rootPath, 'dp3.jpg'));
            await (0, Helpers_1.sleep)(1000);
            return 'Profile pic set successfully';
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
        finally {
            await connection_manager_1.connectionManager.unregisterClient(mobile);
        }
    }
    async updatePrivacy(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            await telegramClient.updatePrivacy();
            return "Privacy updated successfully";
        }
        catch (error) {
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
    }
    async downloadProfilePic(mobile, index) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            return await telegramClient.downloadProfilePic(index);
        }
        catch (error) {
            console.log("Some Error: ", (0, parseError_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async updateUsername(mobile, username) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        try {
            return await telegramClient.updateUsername(username);
        }
        catch (error) {
            console.log("Some Error: ", (0, parseError_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async getMediaMetadata(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        if (params) {
            return await telegramClient.getAllMediaMetaData(params);
        }
        else {
            return await telegramClient.getMediaMetadata(params);
        }
    }
    async downloadMediaFile(mobile, messageId, chatId, res) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.downloadMediaFile(messageId, chatId, res);
    }
    async forwardMessage(mobile, toChatId, fromChatId, messageId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.forwardMessage(toChatId, fromChatId, messageId);
    }
    async leaveChannels(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const channelinfo = await telegramClient.channelInfo(false);
        const leaveChannelIds = channelinfo.canSendFalseChats;
        telegramClient.leaveChannels(leaveChannelIds);
        return "Left channels initiated";
    }
    async leaveChannel(mobile, channel) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        telegramClient.leaveChannels([channel]);
        return "Left channel initiated";
    }
    async deleteChat(mobile, chatId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.deleteChat(chatId);
    }
    async updateNameandBio(mobile, firstName, about) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.updateProfile(firstName, about);
    }
    async getDialogs(mobile, query) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const { limit = 10, offsetId, archived = false } = query;
        const dialogs = await telegramClient.getDialogs({ limit, offsetId, archived });
        const chatData = [];
        for (const chat of dialogs) {
            const chatEntity = await chat.entity.toJSON();
            chatData.push(chatEntity);
        }
        return chatData;
    }
    async getConnectionStatus() {
        const status = {
            activeConnections: connection_manager_1.connectionManager.getActiveConnectionCount(),
            rateLimited: 0,
            totalOperations: 0
        };
        this.logger.logOperation('system', 'Connection status retrieved', status);
        return status;
    }
    async forwardBulkMessages(mobile, fromChatId, toChatId, messageIds) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.forwardMessages(fromChatId, toChatId, messageIds);
    }
    async getAuths(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const auths = await telegramClient.getAuths();
        this.logger.logOperation(mobile, 'Retrieved authorizations', {
            count: auths?.length || 0
        });
        return auths;
    }
    async removeOtherAuths(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        await telegramClient.removeOtherAuths();
        this.logger.logOperation(mobile, 'Removed other authorizations');
        return "Removed other authorizations";
    }
    async processBatch(items, batchSize, processor, delayMs = 2000) {
        const errors = [];
        let processed = 0;
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            try {
                await processor(batch);
                processed += batch.length;
                if (i + batchSize < items.length) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
            catch (error) {
                errors.push(error);
                this.logger.logError('batch-process', 'Batch processing failed', error);
            }
        }
        return { processed, errors };
    }
    async createGroupWithOptions(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        const result = await telegramClient.createGroupWithOptions(options);
        this.logger.logOperation(mobile, 'Group created', { id: result.id?.toString() });
        return result;
    }
    async updateGroupSettings(mobile, settings) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.updateGroupSettings(settings);
    }
    async scheduleMessage(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.scheduleMessageSend({
            chatId: options.chatId,
            message: options.message,
            scheduledTime: options.scheduledTime,
            replyTo: options.replyTo,
            silent: options.silent
        });
    }
    async getScheduledMessages(mobile, chatId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getScheduledMessages(chatId);
    }
    async sendMediaAlbum(mobile, album) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.sendMediaAlbum(album);
    }
    async sendVoiceMessage(mobile, voice) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.sendVoiceMessage(voice);
    }
    async cleanupChat(mobile, cleanup) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.cleanupChat(cleanup);
    }
    async getChatStatistics(mobile, chatId, period) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.getChatStatistics(chatId, period);
    }
    async updatePrivacyBatch(mobile, settings) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.updatePrivacyBatch(settings);
    }
    async setContentFilters(mobile, filters) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.setContentFilters(filters);
    }
    async addGroupMembers(mobile, groupId, members) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.addGroupMembers(groupId, members);
    }
    async removeGroupMembers(mobile, groupId, members) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.removeGroupMembers(groupId, members);
    }
    async promoteToAdmin(mobile, groupId, userId, permissions, rank) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        return await telegramClient.promoteToAdmin(groupId, userId, permissions, rank);
    }
    async demoteAdmin(mobile, groupId, userId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Demoted admin to regular member', { groupId, userId });
        return await telegramClient.demoteAdmin(groupId, userId);
    }
    async unblockGroupUser(mobile, groupId, userId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Unblocked user in group', { groupId, userId });
        return await telegramClient.unblockGroupUser(groupId, userId);
    }
    async getGroupAdmins(mobile, groupId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get group admins', { groupId });
        return await telegramClient.getGroupAdmins(groupId);
    }
    async getGroupBannedUsers(mobile, groupId) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get group banned users', { groupId });
        return await telegramClient.getGroupBannedUsers(groupId);
    }
    async searchMessages(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Search messages', params);
        return await telegramClient.searchMessages(params);
    }
    async getFilteredMedia(mobile, params) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get filtered media', params);
        return await telegramClient.getFilteredMedia(params);
    }
    async exportContacts(mobile, format, includeBlocked = false) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Export contacts', { format, includeBlocked });
        return await telegramClient.exportContacts(format, includeBlocked);
    }
    async importContacts(mobile, contacts) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Import contacts', { contactCount: contacts.length });
        return await telegramClient.importContacts(contacts);
    }
    async manageBlockList(mobile, userIds, block) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, block ? 'Block users' : 'Unblock users', { userIds });
        return await telegramClient.manageBlockList(userIds, block);
    }
    async getContactStatistics(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get contact statistics');
        return await telegramClient.getContactStatistics();
    }
    async createChatFolder(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Create chat folder', { name: options.name });
        return await telegramClient.createChatFolder(options);
    }
    async getChatFolders(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get chat folders');
        return await telegramClient.getChatFolders();
    }
    async getSessionInfo(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get session info');
        return await telegramClient.getSessionInfo();
    }
    async terminateSession(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Terminate session', options);
        return await telegramClient.terminateSession(options);
    }
    async editMessage(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Edit message', { chatId: options.chatId, messageId: options.messageId });
        return await telegramClient.editMessage(options);
    }
    async updateChatSettings(mobile, settings) {
        if (!settings.chatId) {
            throw new Error('chatId is required');
        }
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Update chat settings', { chatId: settings.chatId });
        return await telegramClient.updateChatSettings(settings);
    }
    async sendMediaBatch(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Send media batch', { chatId: options.chatId, mediaCount: options.media.length });
        return await telegramClient.sendMediaBatch(options);
    }
    async hasPassword(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Check password status');
        return await telegramClient.hasPassword();
    }
    async getContacts(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get contacts list');
        return await telegramClient.getContacts();
    }
    async getChats(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get chats', options);
        return await telegramClient.getChats(options);
    }
    async getFileUrl(mobile, url, filename) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get file URL', { url, filename });
        return await telegramClient.getFileUrl(url, filename);
    }
    async getMessageStats(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get message statistics', options);
        return await telegramClient.getMessageStats(options);
    }
    async sendViewOnceMedia(mobile, options) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Send view once media', { sourceType: options.sourceType, chatId: options.chatId });
        const { sourceType, chatId, caption, filename } = options;
        try {
            if (sourceType === 'path') {
                if (!options.path)
                    throw new common_1.BadRequestException('Path is required when sourceType is url');
                try {
                    const localPath = options.path;
                    if (!fs.existsSync(localPath)) {
                        throw new common_1.BadRequestException(`File not found at path: ${localPath}`);
                    }
                    let isVideo = false;
                    const ext = path.extname(localPath).toLowerCase().substring(1);
                    if (['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                    const fileBuffer = fs.readFileSync(localPath);
                    this.logger.logOperation(mobile, 'Sending view once media from local file', {
                        path: localPath,
                        isVideo,
                        size: fileBuffer.length,
                        filename: filename || path.basename(localPath)
                    });
                    return await telegramClient.sendViewOnceMedia(chatId, fileBuffer, caption, isVideo, filename || path.basename(localPath));
                }
                catch (error) {
                    if (error instanceof common_1.BadRequestException) {
                        throw error;
                    }
                    this.logger.logError(mobile, 'Failed to read local file', error);
                    throw new common_1.BadRequestException(`Failed to read local file: ${error.message}`);
                }
            }
            else if (sourceType === 'base64') {
                if (!options.base64Data)
                    throw new common_1.BadRequestException('Base64 data is required when sourceType is base64');
                const base64String = options.base64Data;
                let isVideo = false;
                if (filename) {
                    const ext = filename.toLowerCase().split('.').pop();
                    if (ext && ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                }
                this.logger.logOperation(mobile, 'Sending view once media from base64', { isVideo, size: base64String.length });
                const mediaData = Buffer.from(base64String, 'base64');
                return await telegramClient.sendViewOnceMedia(chatId, mediaData, caption, isVideo, filename);
            }
            else if (sourceType === 'binary') {
                if (!options.binaryData)
                    throw new common_1.BadRequestException('Binary data is required when sourceType is binary');
                this.logger.logOperation(mobile, 'Sending view once media from binary', {
                    size: options.binaryData.length,
                    filename: filename || 'unknown'
                });
                let isVideo = false;
                if (filename) {
                    const ext = filename.toLowerCase().split('.').pop();
                    if (ext && ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', '3gp'].includes(ext)) {
                        isVideo = true;
                    }
                }
                return await telegramClient.sendViewOnceMedia(chatId, options.binaryData, caption, isVideo, filename);
            }
            else {
                throw new common_1.BadRequestException('Invalid source type. Must be one of: url, base64, binary');
            }
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to send view once media', error);
            throw error;
        }
    }
    async getTopPrivateChats(mobile) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Get top private chats');
        return await telegramClient.getTopPrivateChats();
    }
    async addBotsToChannel(mobile, channelIds = [process.env.accountsChannel, process.env.updatesChannel, process.env.notifChannel, "miscmessages", process.env.httpFailuresChannel]) {
        this.logger.logOperation(mobile, 'Add bots to channel', { channelIds });
        const botTokens = (process.env.BOT_TOKENS || '').split(',').filter(Boolean);
        if (botTokens.length === 0) {
            throw new Error('No bot tokens configured. Please set BOT_TOKENS environment variable');
        }
        for (const token of botTokens) {
            try {
                const botInfo = await this.getBotInfo(token);
                if (botInfo) {
                    for (const channelId of channelIds) {
                        await this.setupBotInChannel(mobile, channelId, botInfo.id, botInfo.username, {
                            changeInfo: true,
                            postMessages: true,
                            editMessages: true,
                            deleteMessages: true,
                            banUsers: true,
                            inviteUsers: true,
                            pinMessages: true,
                            addAdmins: true,
                            anonymous: false,
                            manageCall: false
                        });
                    }
                    ;
                }
            }
            catch (error) {
                this.logger.logError(mobile, 'Failed to setup bot in channel', error);
            }
        }
    }
    async getBotInfo(token) {
        try {
            const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(`https://api.telegram.org/bot${token}/getMe`);
            if (response.data?.ok) {
                return response.data.result;
            }
            throw new Error('Failed to get bot info');
        }
        catch (error) {
            throw new Error(`Failed to get bot info: ${error.message}`);
        }
    }
    async setupBotInChannel(mobile, channelId, botId, botUsername, permissions) {
        const telegramClient = await connection_manager_1.connectionManager.getClient(mobile);
        this.logger.logOperation(mobile, 'Setup bot in channel', { channelId, botId, botUsername });
        try {
            await telegramClient.joinChannel(channelId);
        }
        catch (error) {
            this.logger.logError(mobile, 'Failed to join channel', error);
        }
        try {
            await telegramClient.addGroupMembers(channelId, [botUsername]);
            this.logger.logOperation(mobile, 'Bot added to channel', { channelId, botUsername });
            await (0, Helpers_1.sleep)(2000);
            this.logger.logOperation(mobile, `Bot ${botUsername} successfully added to channel ${channelId}`);
        }
        catch (error) {
            this.logger.logError(mobile, `Failed to add bot ${botUsername} to channel ${channelId}`, error);
        }
        try {
            await telegramClient.promoteToAdmin(channelId, botUsername, permissions);
            console.log(`Bot ${botUsername} promoted as admin in channel ${channelId}`);
        }
        catch (error) {
            this.logger.logError(mobile, `Failed to setup bot ${botUsername} in channel ${channelId}`, error);
        }
    }
};
exports.TelegramService = TelegramService;
exports.TelegramService = TelegramService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => users_service_1.UsersService))),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => active_channels_service_1.ActiveChannelsService))),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => channels_service_1.ChannelsService))),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        active_channels_service_1.ActiveChannelsService,
        channels_service_1.ChannelsService])
], TelegramService);
//# sourceMappingURL=Telegram.service.js.map