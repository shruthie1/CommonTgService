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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sessions_1 = require("telegram/sessions");
const big_integer_1 = __importDefault(require("big-integer"));
const telegram_logger_1 = require("../utils/telegram-logger");
const clientOps = __importStar(require("./client-operations"));
const messageOps = __importStar(require("./message-operations"));
const mediaOps = __importStar(require("./media-operations"));
const channelOps = __importStar(require("./channel-operations"));
const contactOps = __importStar(require("./contact-operations"));
const profileOps = __importStar(require("./profile-operations"));
const authOps = __importStar(require("./auth-operations"));
const chatOps = __importStar(require("./chat-operations"));
class TelegramManager {
    constructor(sessionString, phoneNumber) {
        this.logger = new telegram_logger_1.TelegramLogger('TgManager');
        this.timeoutErr = null;
        this.session = new sessions_1.StringSession(sessionString);
        this.phoneNumber = phoneNumber;
        this.client = null;
    }
    get ctx() {
        return {
            client: this.client,
            phoneNumber: this.phoneNumber,
            logger: this.logger,
        };
    }
    static getActiveClientSetup() {
        return TelegramManager.activeClientSetup;
    }
    static setActiveClientSetup(data) {
        TelegramManager.activeClientSetup = data;
    }
    clearTimeoutErr() {
        if (this.timeoutErr) {
            clearTimeout(this.timeoutErr);
            this.timeoutErr = null;
        }
    }
    async errorHandler(error) {
        this.clearTimeoutErr();
        const result = clientOps.handleClientError(this.ctx, error);
        if (result)
            this.timeoutErr = result;
    }
    async createClient(handler = true, handlerFn) {
        const { getCredentialsForMobile } = require('../../../utils');
        const tgCreds = await getCredentialsForMobile(this.phoneNumber);
        this.apiHash = tgCreds.apiHash;
        this.apiId = tgCreds.apiId;
        this.client = await clientOps.createClient(this.ctx, this.session, handler, handlerFn);
        return this.client;
    }
    async destroy() {
        this.clearTimeoutErr();
        await clientOps.destroyClient(this.ctx, this.session);
        this.client = null;
    }
    connected() {
        return this.client.connected;
    }
    async connect() {
        await this.client.connect();
    }
    async getMe() {
        return chatOps.getMe(this.ctx);
    }
    async getchatId(username) {
        return chatOps.getchatId(this.ctx, username);
    }
    async getEntity(entity) {
        return chatOps.getEntity(this.ctx, entity);
    }
    async getMessages(entityLike, limit = 8) {
        return chatOps.getMessages(this.ctx, entityLike, limit);
    }
    async getAllChats() {
        return chatOps.getAllChats(this.ctx);
    }
    async getMessagesNew(chatId, offset = 0, limit = 20) {
        return chatOps.getMessagesNew(this.ctx, chatId, offset, limit);
    }
    async safeGetEntity(entityId) {
        return chatOps.safeGetEntityById(this.ctx, entityId);
    }
    async getSelfMSgsInfo(limit = 500) {
        return chatOps.getSelfMSgsInfo(this.ctx, limit);
    }
    async getCallLog(limit = 1000, options) {
        return chatOps.getCallLog(this.ctx, limit, options);
    }
    async getChatStatistics(chatId, period) {
        return chatOps.getChatStatistics(this.ctx, chatId, period);
    }
    async getMessageStats(options) {
        return chatOps.getMessageStats(this.ctx, options);
    }
    async getChats(options) {
        return chatOps.getChats(this.ctx, options);
    }
    async updateChatSettings(settings) {
        return chatOps.updateChatSettings(this.ctx, settings);
    }
    async getTopPrivateChats(limit = 10) {
        return chatOps.getTopPrivateChats(this.ctx, limit);
    }
    async createChatFolder(options) {
        return chatOps.createChatFolder(this.ctx, options);
    }
    async getChatFolders() {
        return chatOps.getChatFolders(this.ctx);
    }
    async createBot(options) {
        return chatOps.createBot(this.ctx, options);
    }
    async sendMessage(params) {
        return messageOps.sendMessageToChat(this.ctx, params);
    }
    async sendInlineMessage(chatId, message, url) {
        return messageOps.sendInlineMessage(this.ctx, chatId, message, url);
    }
    async forwardSecretMsgs(fromChatId, toChatId) {
        return messageOps.forwardSecretMsgs(this.ctx, fromChatId, toChatId);
    }
    async forwardMessages(fromChatId, toChatId, messageIds) {
        return messageOps.forwardMessages(this.ctx, fromChatId, toChatId, messageIds);
    }
    async forwardMessage(toChatId, fromChatId, messageId) {
        return messageOps.forwardMessage(this.ctx, toChatId, fromChatId, messageId);
    }
    async searchMessages(params) {
        return messageOps.searchMessages(this.ctx, params);
    }
    async scheduleMessageSend(opts) {
        return messageOps.scheduleMessageSend(this.ctx, opts);
    }
    async getScheduledMessages(chatId) {
        return messageOps.getScheduledMessages(this.ctx, chatId);
    }
    async sendMediaAlbum(album) {
        return messageOps.sendMediaAlbum(this.ctx, album);
    }
    async sendVoiceMessage(voice) {
        return messageOps.sendVoiceMessage(this.ctx, voice);
    }
    async cleanupChat(cleanup) {
        return messageOps.cleanupChat(this.ctx, cleanup);
    }
    async editMessage(options) {
        return messageOps.editMessage(this.ctx, options);
    }
    async sendMediaBatch(options) {
        return messageOps.sendMediaBatch(this.ctx, options);
    }
    async sendViewOnceMedia(chatId, buffer, caption, isVideo, filename) {
        return messageOps.sendViewOnceMedia(this.ctx, chatId, buffer, caption, isVideo, filename);
    }
    async sendPhotoChat(id, url, caption, filename) {
        return messageOps.sendPhotoChat(this.ctx, id, url, caption, filename);
    }
    async sendFileChat(id, url, caption, filename) {
        return messageOps.sendFileChat(this.ctx, id, url, caption, filename);
    }
    async deleteChat(params) {
        return messageOps.deleteChat(this.ctx, params);
    }
    async getMediaUrl(message) {
        return mediaOps.getMediaUrl(this.ctx, message);
    }
    async getMediaMessages() {
        return mediaOps.getMediaMessages(this.ctx);
    }
    async getThumbnail(messageId, chatId = 'me') {
        return mediaOps.getThumbnail(this.ctx, messageId, chatId);
    }
    async getMediaFileDownloadInfo(messageId, chatId = 'me') {
        return mediaOps.getMediaFileDownloadInfo(this.ctx, messageId, chatId);
    }
    async *streamMediaFile(fileLocation, offset = (0, big_integer_1.default)(0), limit = 5 * 1024 * 1024, requestSize = 512 * 1024) {
        yield* mediaOps.streamMediaFile(this.ctx, fileLocation, offset, limit, requestSize);
    }
    async getMediaMetadata(params) {
        return mediaOps.getMediaMetadata(this.ctx, params);
    }
    async getAllMediaMetaData(params) {
        return mediaOps.getAllMediaMetaData(this.ctx, params);
    }
    async getFilteredMedia(params) {
        return mediaOps.getFilteredMedia(this.ctx, params);
    }
    async getFileUrl(url, filename) {
        return mediaOps.getFileUrl(this.ctx, url, filename);
    }
    async createGroup() {
        return channelOps.createGroup(this.ctx);
    }
    async archiveChat(id, accessHash) {
        return channelOps.archiveChat(this.ctx, id, accessHash);
    }
    async forwardMedia(channel, fromChatId) {
        return channelOps.forwardMedia(this.ctx, channel, fromChatId);
    }
    async joinChannel(entity) {
        return channelOps.joinChannel(this.ctx, entity);
    }
    async leaveChannels(chats) {
        return channelOps.leaveChannels(this.ctx, chats);
    }
    async getGrpMembers(entity) {
        return channelOps.getGrpMembers(this.ctx, entity);
    }
    async addGroupMembers(groupId, members) {
        return channelOps.addGroupMembers(this.ctx, groupId, members);
    }
    async removeGroupMembers(groupId, members) {
        return channelOps.removeGroupMembers(this.ctx, groupId, members);
    }
    async promoteToAdmin(groupId, userId, permissions, rank) {
        return channelOps.promoteToAdmin(this.ctx, groupId, userId, permissions, rank);
    }
    async demoteAdmin(groupId, userId) {
        return channelOps.demoteAdmin(this.ctx, groupId, userId);
    }
    async unblockGroupUser(groupId, userId) {
        return channelOps.unblockGroupUser(this.ctx, groupId, userId);
    }
    async getGroupAdmins(groupId) {
        return channelOps.getGroupAdmins(this.ctx, groupId);
    }
    async getGroupBannedUsers(groupId) {
        return channelOps.getGroupBannedUsers(this.ctx, groupId);
    }
    async createGroupOrChannel(options) {
        return channelOps.createGroupOrChannel(this.ctx, options);
    }
    async createGroupWithOptions(options) {
        return channelOps.createGroupWithOptions(this.ctx, options);
    }
    async updateGroupSettings(settings) {
        return channelOps.updateGroupSettings(this.ctx, settings);
    }
    async addContact(data, namePrefix) {
        return contactOps.addContact(this.ctx, data, namePrefix);
    }
    async addContacts(mobiles, namePrefix) {
        return contactOps.addContacts(this.ctx, mobiles, namePrefix);
    }
    async getContacts() {
        return contactOps.getContacts(this.ctx);
    }
    async blockUser(chatId) {
        return contactOps.blockUser(this.ctx, chatId);
    }
    async exportContacts(format, includeBlocked = false) {
        return contactOps.exportContacts(this.ctx, format, includeBlocked);
    }
    async importContacts(data) {
        return contactOps.importContacts(this.ctx, data);
    }
    async manageBlockList(userIds, block) {
        return contactOps.manageBlockList(this.ctx, userIds, block);
    }
    async getContactStatistics() {
        return contactOps.getContactStatistics(this.ctx);
    }
    async sendContactsFile(chatId, contacts, filename) {
        return contactOps.sendContactsFile(this.ctx, chatId, contacts, filename);
    }
    async updatePrivacy() {
        return profileOps.updatePrivacy(this.ctx);
    }
    async updatePrivacyforDeletedAccount() {
        return profileOps.updatePrivacyforDeletedAccount(this.ctx);
    }
    async updatePrivacyBatch(settings) {
        return profileOps.updatePrivacyBatch(this.ctx, settings);
    }
    async updateProfile(firstName, about) {
        return profileOps.updateProfile(this.ctx, firstName, about);
    }
    async updateUsername(baseUsername) {
        return profileOps.updateUsername(this.ctx, baseUsername);
    }
    async updateProfilePic(image) {
        return profileOps.updateProfilePic(this.ctx, image);
    }
    async downloadProfilePic(photoIndex) {
        return profileOps.downloadProfilePic(this.ctx, photoIndex);
    }
    async deleteProfilePhotos() {
        return profileOps.deleteProfilePhotos(this.ctx);
    }
    async removeOtherAuths() {
        return authOps.removeOtherAuths(this.ctx);
    }
    async getAuths() {
        return authOps.getAuths(this.ctx);
    }
    async getLastActiveTime() {
        return authOps.getLastActiveTime(this.ctx);
    }
    async hasPassword() {
        return authOps.hasPassword(this.ctx);
    }
    async set2fa() {
        return authOps.set2fa(this.ctx);
    }
    async createNewSession() {
        return authOps.createNewSession(this.ctx);
    }
    async waitForOtp() {
        return authOps.waitForOtp(this.ctx);
    }
    async getSessionInfo() {
        return authOps.getSessionInfo(this.ctx);
    }
    async terminateSession(options) {
        return authOps.terminateSession(this.ctx, options);
    }
    async handleEvents(event) {
        return clientOps.handleIncomingEvent(this.ctx, event);
    }
}
exports.default = TelegramManager;
//# sourceMappingURL=TelegramManager.js.map