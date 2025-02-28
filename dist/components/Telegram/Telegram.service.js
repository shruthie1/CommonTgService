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
var TelegramService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const buffer_client_service_1 = require("./../buffer-clients/buffer-client.service");
const users_service_1 = require("../users/users.service");
const utils_1 = require("../../utils");
const TelegramManager_1 = __importDefault(require("./TelegramManager"));
const common_1 = require("@nestjs/common");
const cloudinary_1 = require("../../cloudinary");
const active_channels_service_1 = require("../active-channels/active-channels.service");
const path = __importStar(require("path"));
const channels_service_1 = require("../channels/channels.service");
const parseError_1 = require("../../utils/parseError");
const telegram_error_1 = require("./types/telegram-error");
const connection_manager_1 = require("./utils/connection-manager");
const telegram_logger_1 = require("./utils/telegram-logger");
const client_metadata_1 = require("./utils/client-metadata");
let TelegramService = TelegramService_1 = class TelegramService {
    constructor(usersService, bufferClientService, activeChannelsService, channelsService) {
        this.usersService = usersService;
        this.bufferClientService = bufferClientService;
        this.activeChannelsService = activeChannelsService;
        this.channelsService = channelsService;
        this.connectionManager = connection_manager_1.ConnectionManager.getInstance();
        this.logger = telegram_logger_1.TelegramLogger.getInstance();
        this.metadataTracker = client_metadata_1.ClientMetadataTracker.getInstance();
        this.cleanupInterval = this.connectionManager.startCleanupInterval();
    }
    async onModuleDestroy() {
        this.logger.logOperation('system', 'Module destroy initiated');
        clearInterval(this.cleanupInterval);
        await this.disconnectAll();
    }
    getActiveClientSetup() {
        return TelegramManager_1.default.getActiveClientSetup();
    }
    setActiveClientSetup(data) {
        TelegramManager_1.default.setActiveClientSetup(data);
    }
    async executeWithConnection(mobile, operation, handler) {
        this.logger.logOperation(mobile, `Starting operation: ${operation}`);
        const client = await this.getClientOrThrow(mobile);
        this.connectionManager.updateLastUsed(mobile);
        try {
            const result = await this.connectionManager.executeWithRateLimit(mobile, () => handler(client));
            this.metadataTracker.recordOperation(mobile, operation, true);
            this.logger.logOperation(mobile, `Completed operation: ${operation}`);
            return result;
        }
        catch (error) {
            this.metadataTracker.recordOperation(mobile, operation, false);
            throw error;
        }
    }
    async getClientOrThrow(mobile) {
        const client = await this.getClient(mobile);
        if (!client) {
            throw new telegram_error_1.TelegramError('Client not found', telegram_error_1.TelegramErrorCode.CLIENT_NOT_FOUND);
        }
        return client;
    }
    async getClient(mobile) {
        const client = TelegramService_1.clientsMap.get(mobile);
        try {
            if (client && client.connected()) {
                await client.connect();
                return client;
            }
        }
        catch (error) {
            console.error('Client connection error:', (0, parseError_1.parseError)(error));
        }
        return undefined;
    }
    hasClient(number) {
        return TelegramService_1.clientsMap.has(number);
    }
    async deleteClient(number) {
        await this.connectionManager.releaseConnection(number);
        return TelegramService_1.clientsMap.delete(number);
    }
    async disconnectAll() {
        this.logger.logOperation('system', 'Disconnecting all clients');
        const clients = Array.from(TelegramService_1.clientsMap.keys());
        await Promise.all(clients.map(mobile => {
            this.logger.logOperation(mobile, 'Disconnecting client');
            return this.connectionManager.releaseConnection(mobile);
        }));
        TelegramService_1.clientsMap.clear();
        this.bufferClientService.clearJoinChannelInterval();
        this.logger.logOperation('system', 'All clients disconnected');
    }
    async createClient(mobile, autoDisconnect = true, handler = true) {
        this.logger.logOperation(mobile, 'Creating new client', { autoDisconnect, handler });
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
                    await this.connectionManager.acquireConnection(mobile, telegramManager);
                    this.metadataTracker.initializeClient(mobile);
                    this.logger.logOperation(mobile, 'Client created successfully');
                    if (autoDisconnect) {
                        this.logger.logOperation(mobile, 'Auto Disconnecting initiated');
                        setTimeout(async () => {
                            this.logger.logOperation(mobile, 'Auto-disconnecting client');
                            if (client.connected || await this.getClient(mobile)) {
                                console.log("SELF destroy client : ", mobile);
                                await telegramManager.disconnect();
                            }
                            else {
                                console.log("Client Already Disconnected : ", mobile);
                            }
                            await this.connectionManager.releaseConnection(mobile);
                            TelegramService_1.clientsMap.delete(mobile);
                            this.metadataTracker.removeClient(mobile);
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
                this.logger.logError(mobile, 'Client creation failed', error);
                console.log("Parsing Error");
                if (telegramManager) {
                    await this.connectionManager.releaseConnection(mobile);
                    telegramManager = null;
                    TelegramService_1.clientsMap.delete(mobile);
                    this.metadataTracker.removeClient(mobile);
                }
                const errorDetails = (0, parseError_1.parseError)(error);
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
    async getGrpMembers(mobile, entity) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.getGrpMembers(entity);
        }
        catch (err) {
            console.error("Error fetching group members:", err);
        }
    }
    async addContact(mobile, data, prefix) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.addContact(data, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async addContacts(mobile, phoneNumbers, prefix) {
        try {
            const telegramClient = await this.getClient(mobile);
            return await telegramClient.addContacts(phoneNumbers, prefix);
        }
        catch (err) {
            console.error("Error fetching adding Contacts:", err);
        }
    }
    async getSelfMsgsInfo(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.getSelfMSgsInfo();
    }
    async createGroup(mobile) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.createGroup();
    }
    async forwardSecrets(mobile, fromChatId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.createGroupAndForward(fromChatId);
    }
    async joinChannelAndForward(mobile, fromChatId, channel) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.joinChannelAndForward(fromChatId, channel);
    }
    async blockUser(mobile, chatId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.blockUser(chatId);
    }
    async joinChannel(mobile, channelId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.joinChannel(channelId);
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
        return this.executeWithConnection(mobile, 'Get channel info', async (client) => {
            return await client.channelInfo(sendIds);
        });
    }
    async getMe(mobile) {
        return this.executeWithConnection(mobile, 'Get profile info', async (client) => {
            return await client.getMe();
        });
    }
    async getEntity(mobile, entity) {
        return this.executeWithConnection(mobile, 'Get entity info', async (client) => {
            return await client.getEntity(entity);
        });
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
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
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
            const errorDetails = (0, parseError_1.parseError)(error);
            throw new common_1.HttpException(errorDetails.message, errorDetails.status);
        }
    }
    async updatePrivacy(mobile) {
        const telegramClient = await this.getClient(mobile);
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
        const telegramClient = await this.getClient(mobile);
        try {
            return await telegramClient.downloadProfilePic(index);
        }
        catch (error) {
            console.log("Some Error: ", (0, parseError_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async updateUsername(mobile, username) {
        const telegramClient = await this.getClient(mobile);
        try {
            return await telegramClient.updateUsername(username);
        }
        catch (error) {
            console.log("Some Error: ", (0, parseError_1.parseError)(error), error);
            throw new Error("Failed to update username");
        }
    }
    async getMediaMetadata(mobile, chatId, offset, limit = 100) {
        return this.executeWithConnection(mobile, 'Get media metadata', async (client) => {
            return await client.getMediaMetadata(chatId, offset, limit);
        });
    }
    async downloadMediaFile(mobile, messageId, chatId, res) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.downloadMediaFile(messageId, chatId, res);
    }
    async forwardMessage(mobile, toChatId, fromChatId, messageId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.forwardMessage(toChatId, fromChatId, messageId);
    }
    async leaveChannels(mobile) {
        const telegramClient = await this.getClient(mobile);
        const channelinfo = await telegramClient.channelInfo(false);
        const leaveChannelIds = channelinfo.canSendFalseChats;
        return await telegramClient.leaveChannels(leaveChannelIds);
    }
    async leaveChannel(mobile, channel) {
        await this.executeWithConnection(mobile, 'Leave channel', (client) => client.leaveChannels([channel]));
    }
    async deleteChat(mobile, chatId) {
        const telegramClient = await this.getClient(mobile);
        return await telegramClient.deleteChat(chatId);
    }
    async updateNameandBio(mobile, firstName, about) {
        await this.executeWithConnection(mobile, 'Update profile', (client) => client.updateProfile(firstName, about));
    }
    async getDialogs(mobile, query) {
        return this.executeWithConnection(mobile, 'Get dialogs', async (client) => {
            const { limit = 10, offsetId, archived = false } = query;
            const dialogs = await client.getDialogs({ limit, offsetId, archived });
            const chatData = [];
            for (const chat of dialogs) {
                const chatEntity = await chat.entity.toJSON();
                chatData.push(chatEntity);
            }
            return chatData;
        });
    }
    async getConnectionStatus() {
        const status = {
            activeConnections: this.connectionManager.getActiveConnectionCount(),
            rateLimited: 0,
            totalOperations: 0
        };
        this.logger.logOperation('system', 'Connection status retrieved', status);
        return status;
    }
    async forwardBulkMessages(mobile, fromChatId, toChatId, messageIds) {
        await this.executeWithConnection(mobile, 'Forward bulk messages', (client) => client.forwardMessages(fromChatId, toChatId, messageIds));
    }
    async getAuths(mobile) {
        return this.executeWithConnection(mobile, 'Get authorizations', async (client) => {
            const auths = await client.getAuths();
            this.logger.logOperation(mobile, 'Retrieved authorizations', {
                count: auths?.length || 0
            });
            return auths;
        });
    }
    async removeOtherAuths(mobile) {
        return this.executeWithConnection(mobile, 'Remove other authorizations', async (client) => {
            await client.removeOtherAuths();
            this.logger.logOperation(mobile, 'Removed other authorizations');
        });
    }
    async getClientMetadata(mobile) {
        return this.metadataTracker.getMetadata(mobile);
    }
    async getClientStatistics() {
        return this.metadataTracker.getStatistics();
    }
    async handleReconnect(mobile) {
        this.metadataTracker.recordReconnect(mobile);
        this.logger.logWarning(mobile, 'Client reconnection triggered');
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
        return this.executeWithConnection(mobile, 'Create group with options', async (client) => {
            const result = await client.createGroupWithOptions(options);
            this.logger.logOperation(mobile, 'Group created', { id: result.id?.toString() });
            return result;
        });
    }
    async updateGroupSettings(mobile, settings) {
        return this.executeWithConnection(mobile, 'Update group settings', (client) => client.updateGroupSettings(settings));
    }
    async scheduleMessage(mobile, options) {
        await this.executeWithConnection(mobile, 'Schedule message', async (client) => {
            await client.scheduleMessageSend({
                chatId: options.chatId,
                message: options.message,
                scheduledTime: options.scheduledTime,
                replyTo: options.replyTo,
                silent: options.silent
            });
        });
    }
    async getScheduledMessages(mobile, chatId) {
        return this.executeWithConnection(mobile, 'Get scheduled messages', (client) => client.getScheduledMessages(chatId));
    }
    async sendMediaAlbum(mobile, album) {
        return this.executeWithConnection(mobile, 'Send media album', (client) => client.sendMediaAlbum(album));
    }
    async sendVoiceMessage(mobile, voice) {
        return this.executeWithConnection(mobile, 'Send voice message', (client) => client.sendVoiceMessage(voice));
    }
    async cleanupChat(mobile, cleanup) {
        return this.executeWithConnection(mobile, 'Clean up chat', (client) => client.cleanupChat(cleanup));
    }
    async getChatStatistics(mobile, chatId, period) {
        return this.executeWithConnection(mobile, 'Get chat statistics', (client) => client.getChatStatistics(chatId, period));
    }
    async updatePrivacyBatch(mobile, settings) {
        return this.executeWithConnection(mobile, 'Update privacy settings batch', (client) => client.updatePrivacyBatch(settings));
    }
    async setContentFilters(mobile, filters) {
        return this.executeWithConnection(mobile, 'Set content filters', (client) => client.setContentFilters(filters));
    }
    async processBatchWithProgress(items, operation, batchSize = 10, delayMs = 2000) {
        const result = {
            completed: 0,
            total: items.length,
            errors: []
        };
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            await Promise.all(batch.map(async (item) => {
                try {
                    await operation(item);
                    result.completed++;
                }
                catch (error) {
                    result.errors.push(error);
                }
            }));
            if (i + batchSize < items.length) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return result;
    }
    async addGroupMembers(mobile, groupId, members) {
        await this.executeWithConnection(mobile, 'Add group members', (client) => client.addGroupMembers(groupId, members));
    }
    async removeGroupMembers(mobile, groupId, members) {
        await this.executeWithConnection(mobile, 'Remove group members', (client) => client.removeGroupMembers(groupId, members));
    }
    async promoteToAdmin(mobile, groupId, userId, permissions, rank) {
        await this.executeWithConnection(mobile, 'Promote to admin', (client) => client.promoteToAdmin(groupId, userId, permissions, rank));
    }
    async demoteAdmin(mobile, groupId, userId) {
        return this.executeWithConnection(mobile, 'Demote admin', async (client) => {
            await client.demoteAdmin(groupId, userId);
            this.logger.logOperation(mobile, 'Demoted admin to regular member', { groupId, userId });
        });
    }
    async unblockGroupUser(mobile, groupId, userId) {
        return this.executeWithConnection(mobile, 'Unblock group user', async (client) => {
            await client.unblockGroupUser(groupId, userId);
            this.logger.logOperation(mobile, 'Unblocked user in group', { groupId, userId });
        });
    }
    async getGroupAdmins(mobile, groupId) {
        return this.executeWithConnection(mobile, 'Get group admins', (client) => client.getGroupAdmins(groupId));
    }
    async getGroupBannedUsers(mobile, groupId) {
        return this.executeWithConnection(mobile, 'Get group banned users', (client) => client.getGroupBannedUsers(groupId));
    }
    async searchMessages(mobile, params) {
        return this.executeWithConnection(mobile, 'Search messages', (client) => client.searchMessages(params));
    }
    async getFilteredMedia(mobile, params) {
        return this.executeWithConnection(mobile, 'Get filtered media', (client) => client.getFilteredMedia(params));
    }
    async exportContacts(mobile, format, includeBlocked = false) {
        return this.executeWithConnection(mobile, 'Export contacts', (client) => client.exportContacts(format, includeBlocked));
    }
    async importContacts(mobile, contacts) {
        return this.executeWithConnection(mobile, 'Import contacts', (client) => client.importContacts(contacts));
    }
    async manageBlockList(mobile, userIds, block) {
        return this.executeWithConnection(mobile, block ? 'Block users' : 'Unblock users', (client) => client.manageBlockList(userIds, block));
    }
    async getContactStatistics(mobile) {
        return this.executeWithConnection(mobile, 'Get contact statistics', (client) => client.getContactStatistics());
    }
    async createChatFolder(mobile, options) {
        return this.executeWithConnection(mobile, 'Create chat folder', (client) => client.createChatFolder(options));
    }
    async getChatFolders(mobile) {
        return this.executeWithConnection(mobile, 'Get chat folders', (client) => client.getChatFolders());
    }
    async getSessionInfo(mobile) {
        return this.executeWithConnection(mobile, 'Get session info', (client) => client.getSessionInfo());
    }
    async terminateSession(mobile, options) {
        return this.executeWithConnection(mobile, 'Terminate session', (client) => client.terminateSession(options));
    }
    async editMessage(mobile, options) {
        return this.executeWithConnection(mobile, 'Edit message', (client) => client.editMessage(options));
    }
    async updateChatSettings(mobile, settings) {
        return this.executeWithConnection(mobile, 'Update chat settings', (client) => client.updateChatSettings(settings));
    }
    async sendMediaBatch(mobile, options) {
        return this.executeWithConnection(mobile, 'Send media batch', (client) => client.sendMediaBatch(options));
    }
    async hasPassword(mobile) {
        return this.executeWithConnection(mobile, 'Check password status', (client) => client.hasPassword());
    }
    async getContacts(mobile) {
        return this.executeWithConnection(mobile, 'Get contacts list', (client) => client.getContacts());
    }
    async getChats(mobile, options) {
        return this.executeWithConnection(mobile, 'Get chats', (client) => client.getChats(options));
    }
    async getFileUrl(mobile, url, filename) {
        return this.executeWithConnection(mobile, 'Get file URL', (client) => client.getFileUrl(url, filename));
    }
    async getMessageStats(mobile, options) {
        return this.executeWithConnection(mobile, 'Get message statistics', (client) => client.getMessageStats(options));
    }
    async getTopPrivateChats(mobile) {
        return this.executeWithConnection(mobile, 'Get top private chats', async (client) => {
            return client.getTopPrivateChats();
        });
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