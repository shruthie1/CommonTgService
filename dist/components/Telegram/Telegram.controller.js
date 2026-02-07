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
exports.TelegramController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const Telegram_service_1 = require("./Telegram.service");
const dto_1 = require("./dto");
const create_chat_folder_dto_1 = require("./dto/create-chat-folder.dto");
const connection_management_dto_1 = require("./dto/connection-management.dto");
const platform_express_1 = require("@nestjs/platform-express");
const multer = __importStar(require("multer"));
const axios_1 = __importDefault(require("axios"));
const connection_manager_1 = require("./utils/connection-manager");
const message_search_dto_1 = require("./dto/message-search.dto");
const delete_chat_dto_1 = require("./dto/delete-chat.dto");
const update_username_dto_1 = require("./dto/update-username.dto");
const send_message_dto_1 = require("./dto/send-message.dto");
const update_profile_dto_1 = require("./dto/update-profile.dto");
const big_integer_1 = __importDefault(require("big-integer"));
let TelegramController = class TelegramController {
    constructor(telegramService) {
        this.telegramService = telegramService;
    }
    async connect(mobile, autoDisconnect, handler) {
        const options = { autoDisconnect, handler };
        await this.telegramService.connect(mobile, options);
        return { message: 'Connected successfully' };
    }
    async disconnect(mobile) {
        await this.telegramService.disconnect(mobile);
        return { message: 'Disconnected successfully' };
    }
    async disconnectAll() {
        await this.telegramService.disconnectAll();
        return { message: 'All clients disconnected successfully' };
    }
    getConnectionStats() {
        return this.telegramService.getConnectionStats();
    }
    getClientState(mobile) {
        return this.telegramService.getClientState(mobile);
    }
    getActiveConnectionCount() {
        return this.telegramService.getActiveConnectionCount();
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
        return { status: await this.telegramService.getConnectionStatus() };
    }
    async getCallLogStats(mobile, limit, includeCallLog) {
        if (limit !== undefined && (limit < 1 || limit > 10000)) {
            throw new common_1.BadRequestException('Limit must be between 1 and 10000.');
        }
        const includeCallLogBool = includeCallLog === 'true' || includeCallLog === '1';
        return this.telegramService.getCallLog(mobile, limit, includeCallLogBool);
    }
    async addContactsBulk(mobile, contactsDto) {
        return this.telegramService.addContacts(mobile, contactsDto.phoneNumbers, contactsDto.prefix);
    }
    async getContacts(mobile) {
        return this.telegramService.getContacts(mobile);
    }
    async sendMedia(mobile, sendMediaDto) {
        if (sendMediaDto.url) {
            try {
                const headResponse = await axios_1.default.head(sendMediaDto.url, { timeout: 10000 });
                const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);
                const maxSize = 100 * 1024 * 1024;
                if (contentLength > maxSize) {
                    const fileSizeMB = (contentLength / (1024 * 1024)).toFixed(2);
                    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
                    throw new common_1.BadRequestException(`File size (${fileSizeMB} MB) exceeds maximum allowed size of ${maxSizeMB} MB. Please use a smaller file.`);
                }
            }
            catch (error) {
                if (error instanceof common_1.BadRequestException) {
                    throw error;
                }
            }
        }
        try {
            const client = await connection_manager_1.connectionManager.getClient(mobile);
            if (sendMediaDto.type === dto_1.MediaType.PHOTO) {
                return await client.sendPhotoChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
            }
            return await client.sendFileChat(sendMediaDto.chatId, sendMediaDto.url, sendMediaDto.caption, sendMediaDto.filename);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to send media: ${error.message || 'Unknown error'}`);
        }
    }
    async downloadMedia(mobile, chatId, messageId, res) {
        if (!messageId || messageId <= 0 || !Number.isInteger(messageId)) {
            throw new common_1.BadRequestException('Message ID must be a positive integer');
        }
        if (!chatId || chatId.trim().length === 0) {
            throw new common_1.BadRequestException('Chat ID is required and cannot be empty');
        }
        try {
            const fileInfo = await this.telegramService.getMediaFileDownloadInfo(mobile, messageId, chatId);
            if (res.req.headers['if-none-match'] === fileInfo.etag) {
                return res.status(304).end();
            }
            const range = res.req.headers.range;
            const chunkSize = 512 * 1024;
            if (range && fileInfo.fileSize > 0) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileInfo.fileSize - 1;
                const chunksize = (end - start) + 1;
                if (start >= fileInfo.fileSize || end >= fileInfo.fileSize || start > end) {
                    res.status(416).setHeader('Content-Range', `bytes */${fileInfo.fileSize}`);
                    return res.end();
                }
                res.status(206);
                res.setHeader('Content-Range', `bytes ${start}-${end}/${fileInfo.fileSize}`);
                res.setHeader('Accept-Ranges', 'bytes');
                res.setHeader('Content-Length', chunksize);
                res.setHeader('Content-Type', fileInfo.contentType);
                res.setHeader('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('ETag', fileInfo.etag);
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
                for await (const chunk of this.telegramService.streamMediaFile(mobile, fileInfo.fileLocation, (0, big_integer_1.default)(start), chunksize, chunkSize)) {
                    res.write(chunk);
                }
            }
            else {
                res.setHeader('Content-Type', fileInfo.contentType);
                res.setHeader('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                res.setHeader('ETag', fileInfo.etag);
                res.setHeader('Accept-Ranges', 'bytes');
                res.setHeader('X-Content-Type-Options', 'nosniff');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Accept-Ranges');
                if (fileInfo.fileSize > 0) {
                    res.setHeader('Content-Length', fileInfo.fileSize);
                }
                for await (const chunk of this.telegramService.streamMediaFile(mobile, fileInfo.fileLocation, (0, big_integer_1.default)(0), 5 * 1024 * 1024, chunkSize)) {
                    res.write(chunk);
                }
            }
            res.end();
        }
        catch (error) {
            if (error.message?.includes('FILE_REFERENCE_EXPIRED') || error.message?.includes('not found')) {
                return res.status(404).send(error.message || 'File reference expired');
            }
            if (!res.headersSent) {
                res.status(500).send('Error downloading media');
            }
        }
    }
    async getThumbnail(mobile, chatId, messageId, res) {
        if (!messageId || messageId <= 0 || !Number.isInteger(messageId)) {
            throw new common_1.BadRequestException('Message ID must be a positive integer');
        }
        if (!chatId || chatId.trim().length === 0) {
            throw new common_1.BadRequestException('Chat ID is required and cannot be empty');
        }
        try {
            const thumbnail = await this.telegramService.getThumbnail(mobile, messageId, chatId);
            if (res.req.headers['if-none-match'] === thumbnail.etag) {
                return res.status(304).end();
            }
            res.setHeader('Content-Type', thumbnail.contentType);
            res.setHeader('Content-Disposition', `inline; filename="${thumbnail.filename}"`);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('ETag', thumbnail.etag);
            res.setHeader('Content-Length', thumbnail.buffer.length);
            return res.send(thumbnail.buffer);
        }
        catch (error) {
            if (error.message?.includes('FILE_REFERENCE_EXPIRED') || error.message?.includes('not found') || error.message?.includes('not available')) {
                return res.status(404).send(error.message || 'Thumbnail not available');
            }
            if (!res.headersSent) {
                res.status(500).send('Error getting thumbnail');
            }
        }
    }
    async sendMediaAlbum(mobile, albumDto) {
        if (!albumDto.media || albumDto.media.length === 0) {
            throw new common_1.BadRequestException('Album must contain at least one media item');
        }
        if (albumDto.media.length > 10) {
            throw new common_1.BadRequestException(`Album cannot contain more than 10 items. You provided ${albumDto.media.length} items.`);
        }
        return this.telegramService.sendMediaAlbum(mobile, albumDto);
    }
    async getMediaMetadata(mobile, chatId, types, startDate, endDate, limit, maxId, minId) {
        if (!chatId || chatId.trim().length === 0) {
            throw new common_1.BadRequestException('Chat ID is required and cannot be empty');
        }
        if (limit !== undefined && (limit <= 0 || limit > 1000)) {
            throw new common_1.BadRequestException('Limit must be between 1 and 1000');
        }
        let parsedTypes;
        if (types) {
            const typesArray = Array.isArray(types) ? types : [types];
            const validTypes = ['photo', 'video', 'document', 'voice', 'all'];
            parsedTypes = typesArray
                .filter(t => validTypes.includes(t.toLowerCase()))
                .map(t => t.toLowerCase());
            if (parsedTypes.length === 0) {
                throw new common_1.BadRequestException(`Invalid types. Must be one or more of: ${validTypes.join(', ')}`);
            }
        }
        let parsedStartDate;
        let parsedEndDate;
        if (startDate && startDate.trim()) {
            parsedStartDate = new Date(startDate);
            if (isNaN(parsedStartDate.getTime())) {
                throw new common_1.BadRequestException(`Invalid startDate format. Use ISO 8601 format (e.g., "2024-01-01" or "2024-01-01T10:00:00")`);
            }
        }
        if (endDate && endDate.trim()) {
            parsedEndDate = new Date(endDate);
            if (isNaN(parsedEndDate.getTime())) {
                throw new common_1.BadRequestException(`Invalid endDate format. Use ISO 8601 format (e.g., "2024-12-31" or "2024-12-31T23:59:59")`);
            }
        }
        if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
            throw new common_1.BadRequestException('startDate must be before or equal to endDate');
        }
        return this.telegramService.getMediaMetadata(mobile, {
            chatId,
            types: parsedTypes,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            limit,
            maxId,
            minId
        });
    }
    async getFilteredMedia(mobile, chatId, types, startDate, endDate, limit, maxId, minId) {
        if (!chatId || chatId.trim().length === 0) {
            throw new common_1.BadRequestException('Chat ID is required and cannot be empty');
        }
        if (limit !== undefined && (limit <= 0 || limit > 1000)) {
            throw new common_1.BadRequestException('Limit must be between 1 and 1000');
        }
        let parsedTypes;
        if (types) {
            const typesArray = Array.isArray(types) ? types : [types];
            const validTypes = ['photo', 'video', 'document', 'voice', 'all'];
            parsedTypes = typesArray
                .filter(t => validTypes.includes(t.toLowerCase()))
                .map(t => t.toLowerCase());
            if (parsedTypes.length === 0) {
                throw new common_1.BadRequestException(`Invalid types. Must be one or more of: ${validTypes.join(', ')}`);
            }
        }
        let parsedStartDate;
        let parsedEndDate;
        if (startDate && startDate.trim()) {
            parsedStartDate = new Date(startDate);
            if (isNaN(parsedStartDate.getTime())) {
                throw new common_1.BadRequestException(`Invalid startDate format. Use ISO 8601 format (e.g., "2024-01-01" or "2024-01-01T10:00:00")`);
            }
        }
        if (endDate && endDate.trim()) {
            parsedEndDate = new Date(endDate);
            if (isNaN(parsedEndDate.getTime())) {
                throw new common_1.BadRequestException(`Invalid endDate format. Use ISO 8601 format (e.g., "2024-12-31" or "2024-12-31T23:59:59")`);
            }
        }
        if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
            throw new common_1.BadRequestException('startDate must be before or equal to endDate');
        }
        return this.telegramService.getFilteredMedia(mobile, {
            chatId,
            types: parsedTypes,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            limit,
            maxId,
            minId
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
    async getDialogs(mobile, limit, offsetDate, folderId, archived, peerType, ignorePinned, includePhotos) {
        return this.telegramService.getDialogs(mobile, {
            limit,
            offsetDate,
            folderId,
            archived: archived === true,
            peerType: peerType,
            ignorePinned: ignorePinned === true,
            includePhotos,
        });
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
        if (!voice.chatId || voice.chatId.trim().length === 0) {
            throw new common_1.BadRequestException('Chat ID is required and cannot be empty');
        }
        if (!voice.url || voice.url.trim().length === 0) {
            throw new common_1.BadRequestException('URL is required and cannot be empty');
        }
        try {
            new URL(voice.url);
        }
        catch {
            throw new common_1.BadRequestException('Invalid URL format. Please provide a valid HTTP/HTTPS URL.');
        }
        if (voice.duration !== undefined && (voice.duration < 0 || !Number.isInteger(voice.duration))) {
            throw new common_1.BadRequestException('Duration must be a non-negative integer (in seconds)');
        }
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
    async getFileUrl(mobile, url, filename) {
        return this.telegramService.getFileUrl(mobile, url, filename);
    }
    async getMessageStats(mobile, options) {
        return this.telegramService.getMessageStats(mobile, options);
    }
    async getTopPrivateChats(mobile, limit) {
        return this.telegramService.getTopPrivateChats(mobile, limit);
    }
    async getSelfMsgsInfo(mobile, limit) {
        if (limit !== undefined && (limit < 1 || limit > 10000)) {
            throw new common_1.BadRequestException('Limit must be between 1 and 10000.');
        }
        return this.telegramService.getSelfMsgsInfo(mobile, limit);
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
    (0, swagger_1.ApiQuery)({ name: 'autoDisconnect', description: 'Whether to auto disconnect the client after period of inactivity', required: false, type: Boolean, default: true }),
    (0, swagger_1.ApiQuery)({ name: 'handler', description: 'Whether to use event handler', required: false, type: Boolean, default: true }),
    (0, swagger_1.ApiResponse)({ type: Object, schema: { properties: { message: { type: 'string' } } } }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('autoDisconnect')),
    __param(2, (0, common_1.Query)('handler')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Boolean, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "connect", null);
__decorate([
    (0, common_1.Get)('disconnect/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect from Telegram' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object, schema: { properties: { message: { type: 'string' } } } }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Get)('disconnect-all'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect all clients' }),
    (0, swagger_1.ApiResponse)({ type: Object, schema: { properties: { message: { type: 'string' } } } }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "disconnectAll", null);
__decorate([
    (0, common_1.Get)('connection/stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get connection statistics' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], TelegramController.prototype, "getConnectionStats", null);
__decorate([
    (0, common_1.Get)('connection/state/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get connection state for a client' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: connection_management_dto_1.ConnectionStatusDto }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", connection_management_dto_1.ConnectionStatusDto)
], TelegramController.prototype, "getClientState", null);
__decorate([
    (0, common_1.Get)('connection/count'),
    (0, swagger_1.ApiOperation)({ summary: 'Get active connection count' }),
    (0, swagger_1.ApiResponse)({ type: Number }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Number)
], TelegramController.prototype, "getActiveConnectionCount", null);
__decorate([
    (0, common_1.Get)('me/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user profile' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiBody)({ type: update_profile_dto_1.UpdateProfileDto }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiBody)({ type: dto_1.ProfilePhotoDto }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the user account to send the message from', required: true }),
    (0, swagger_1.ApiBody)({ type: send_message_dto_1.SendTgMessageDto }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_message_dto_1.SendTgMessageDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Post)('messages/forward/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Forward messages' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.ForwardBatchDto }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.BatchProcessDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "processBatchMessages", null);
__decorate([
    (0, common_1.Get)('messages/search/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Search messages in Telegram', description: 'Search for messages in a specific chat or globally across all chats' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ type: message_search_dto_1.SearchMessagesDto }),
    (0, swagger_1.ApiResponse)({ type: message_search_dto_1.SearchMessagesResponseDto }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('channel')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "leaveChannel", null);
__decorate([
    (0, common_1.Patch)('username/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update the Telegram username of a user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the user whose username should be updated', required: true }),
    (0, swagger_1.ApiBody)({ type: update_username_dto_1.UpdateUsernameDto }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "setup2FA", null);
__decorate([
    (0, common_1.Post)('privacy/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update privacy settings' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getActiveSessions", null);
__decorate([
    (0, common_1.Delete)('sessions/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminate other sessions' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "terminateOtherSessions", null);
__decorate([
    (0, common_1.Post)('sessions/new/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Create new session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createNewSession", null);
__decorate([
    (0, common_1.Get)('session/info/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get session information' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getSessionInfo", null);
__decorate([
    (0, common_1.Post)('session/terminate/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Terminate specific session' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { hash: { type: 'string' }, type: { type: 'string', enum: ['app', 'web'] }, exceptCurrent: { type: 'boolean' } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "terminateSession", null);
__decorate([
    (0, common_1.Get)('monitoring/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get service health and connection status' }),
    (0, swagger_1.ApiResponse)({ type: connection_management_dto_1.ConnectionStatusDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getConnectionStatus", null);
__decorate([
    (0, common_1.Get)('monitoring/calllog/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get call log statistics with enhanced filtering',
        description: 'Retrieves comprehensive call statistics including incoming/outgoing calls, video/audio breakdown, ' +
            'and per-chat call counts. Uses server-side filtering for optimal performance. ' +
            'Supports pagination via limit parameter (default: 1000, max: 10000).'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Maximum number of calls to analyze (default: 1000, max: 10000)',
        example: 1000,
        minimum: 1,
        maximum: 10000
    }),
    (0, swagger_1.ApiQuery)({
        name: 'includeCallLog',
        required: false,
        type: Boolean,
        description: 'If true, each chat in the response includes a callLog array with per-call details (messageId, date, duration, video, outgoing). Default: false.',
        example: false
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Call log statistics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                totalCalls: { type: 'number', description: 'Total number of calls' },
                outgoing: { type: 'number', description: 'Total outgoing calls' },
                incoming: { type: 'number', description: 'Total incoming calls' },
                video: { type: 'number', description: 'Total video calls' },
                audio: { type: 'number', description: 'Total audio calls' },
                chats: {
                    type: 'array',
                    description: 'Per-chat call summary with identity, call stats, media counts, and call log',
                    items: {
                        type: 'object',
                        properties: {
                            chatId: { type: 'string' },
                            phone: { type: 'string' },
                            username: { type: 'string' },
                            name: { type: 'string' },
                            peerType: { type: 'string', enum: ['user', 'group', 'channel'] },
                            calls: {
                                type: 'object',
                                properties: {
                                    total: { type: 'number' },
                                    outgoing: { type: 'number' },
                                    incoming: { type: 'number' },
                                    video: { type: 'number' },
                                    audio: { type: 'number' }
                                }
                            },
                            totalMessages: { type: 'number' },
                            photoCount: { type: 'number' },
                            videoCount: { type: 'number' },
                            callLog: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        messageId: { type: 'number' },
                                        date: { type: 'number' },
                                        durationSeconds: { type: 'number' },
                                        video: { type: 'boolean' },
                                        outgoing: { type: 'boolean' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request - invalid limit parameter' }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal Server Error' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('includeCallLog')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getCallLogStats", null);
__decorate([
    (0, common_1.Post)('contacts/add-bulk/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add multiple contacts in bulk' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ type: dto_1.AddContactsDto }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getContacts", null);
__decorate([
    (0, common_1.Post)('media/send/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send media message',
        description: 'Send a photo or file to a chat. Maximum file size is 100MB. Supports images, videos, and documents.'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' }),
    (0, swagger_1.ApiBody)({ type: dto_1.SendMediaDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Media sent successfully',
        type: Object
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid request - file too large, invalid URL, or missing required fields'
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: 'Failed to send media - check Telegram connection or file accessibility'
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.SendMediaDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMedia", null);
__decorate([
    (0, common_1.Get)('media/download/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Preview or download media from a message',
        description: 'Download or preview media from a Telegram message. Images and videos preview in browser, other files download. Supports HTTP Range requests for video streaming.'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' }),
    (0, swagger_1.ApiQuery)({
        name: 'chatId',
        required: true,
        description: 'Chat ID or username. Use "me" for saved messages, channel username (e.g., "channelname"), or numeric ID',
        example: 'me'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'messageId',
        required: true,
        description: 'Message ID containing the media (must be a positive number)',
        type: Number,
        example: 12345
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Media file (preview in browser for images/videos, download for other types)',
        content: {
            'image/*': { schema: { type: 'string', format: 'binary' } },
            'video/*': { schema: { type: 'string', format: 'binary' } },
            'application/*': { schema: { type: 'string', format: 'binary' } }
        }
    }),
    (0, swagger_1.ApiResponse)({
        status: 206,
        description: 'Partial content (when using Range header for video streaming)'
    }),
    (0, swagger_1.ApiResponse)({
        status: 304,
        description: 'Not modified (when using If-None-Match header for caching)'
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Media not found - message ID does not exist or message has no media'
    }),
    (0, swagger_1.ApiResponse)({
        status: 416,
        description: 'Range not satisfiable - invalid Range header'
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('messageId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "downloadMedia", null);
__decorate([
    (0, common_1.Get)('media/thumbnail/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get thumbnail for a media message',
        description: 'Get thumbnail image for a Telegram message containing media (photo or video). Returns JPEG image. Supports caching with ETag headers.'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' }),
    (0, swagger_1.ApiQuery)({
        name: 'chatId',
        required: true,
        description: 'Chat ID or username. Use "me" for saved messages, channel username (e.g., "channelname"), or numeric ID',
        example: 'me'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'messageId',
        required: true,
        description: 'Message ID containing the media (must be a positive number)',
        type: Number,
        example: 12345
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Thumbnail image (JPEG format)',
        content: {
            'image/jpeg': { schema: { type: 'string', format: 'binary' } }
        }
    }),
    (0, swagger_1.ApiResponse)({
        status: 304,
        description: 'Not modified (when using If-None-Match header for caching)'
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Thumbnail not found - message ID does not exist, message has no media, or thumbnail is not available'
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: 'Error getting thumbnail'
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('messageId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getThumbnail", null);
__decorate([
    (0, common_1.Post)('media/album/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send media album (multiple photos/videos)',
        description: 'Send multiple media files as an album. If some items fail, the operation continues and returns a summary of successful and failed items.'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' }),
    (0, swagger_1.ApiBody)({ type: dto_1.SendMediaAlbumDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Album sent with summary of results',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'number', description: 'Number of successfully sent items' },
                failed: { type: 'number', description: 'Number of failed items' },
                errors: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            index: { type: 'number', description: 'Index of failed item' },
                            error: { type: 'string', description: 'Error message' }
                        }
                    },
                    description: 'Details of failed items (only present if failed > 0)'
                }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid request - empty album, invalid URLs, or file size exceeds limit'
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: 'Failed to send album - all items failed or Telegram connection error'
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "sendMediaAlbum", null);
__decorate([
    (0, common_1.Get)('media/metadata/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get media metadata from a chat',
        description: 'Retrieve metadata for media messages in a chat. Supports filtering by type, date range, and message ID range. Use maxId for pagination (get messages with ID less than maxId).'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' }),
    (0, swagger_1.ApiQuery)({
        name: 'chatId',
        required: true,
        description: 'Chat ID or username. Use "me" for saved messages, channel username, or numeric ID',
        example: 'me'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'types',
        enum: ['photo', 'video', 'document', 'voice', 'all'],
        required: false,
        isArray: true,
        description: 'Filter by media types. Use "all" to get all types grouped by type. If not specified, returns all media types.',
        example: ['photo', 'video']
    }),
    (0, swagger_1.ApiQuery)({
        name: 'startDate',
        required: false,
        description: 'Start date for filtering (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-01-01'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'endDate',
        required: false,
        description: 'End date for filtering (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-12-31'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: 'Maximum number of messages to fetch (default: 50, max: 1000)',
        required: false,
        type: Number,
        example: 50
    }),
    (0, swagger_1.ApiQuery)({
        name: 'maxId',
        required: false,
        type: Number,
        description: 'Maximum message ID to include (use for pagination - get messages with ID less than this. Use nextMaxId from previous response for next page)',
        example: 12345
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minId',
        required: false,
        type: Number,
        description: 'Minimum message ID to include',
        example: 1000
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Media metadata retrieved successfully',
        type: Object
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid request - invalid date format, chat ID, or limit value'
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('types', new common_1.ParseArrayPipe({ items: String, separator: ',', optional: true }))),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __param(5, (0, common_1.Query)('limit')),
    __param(6, (0, common_1.Query)('maxId')),
    __param(7, (0, common_1.Query)('minId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, String, Number, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMediaMetadata", null);
__decorate([
    (0, common_1.Get)('media/filter/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get filtered media messages from a chat',
        description: 'Get filtered list of media messages with detailed metadata including thumbnails. Returns standardized paginated response. Use maxId for pagination (get messages with ID less than maxId).'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' }),
    (0, swagger_1.ApiQuery)({
        name: 'chatId',
        required: true,
        description: 'Chat ID or username. Use "me" for saved messages, channel username, or numeric ID',
        example: 'me'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'types',
        required: false,
        enum: ['photo', 'video', 'document', 'voice', 'all'],
        isArray: true,
        description: 'Filter by media types. Use "all" to get all types grouped by type. If not specified, returns all media types.',
        example: ['photo', 'video']
    }),
    (0, swagger_1.ApiQuery)({
        name: 'startDate',
        required: false,
        description: 'Filter media after this date (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-01-01'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'endDate',
        required: false,
        description: 'Filter media before this date (ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        example: '2024-12-31'
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Maximum number of media items to fetch (default: 50, max: 1000)',
        example: 50
    }),
    (0, swagger_1.ApiQuery)({
        name: 'maxId',
        required: false,
        type: Number,
        description: 'Maximum message ID to include (use for pagination - get messages with ID less than this. Use nextMaxId from previous response for next page)',
        example: 12345
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minId',
        required: false,
        type: Number,
        description: 'Minimum message ID to include',
        example: 1000
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Paginated media response with standardized format',
        type: Object
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid request - invalid date format, chat ID, or limit value'
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __param(2, (0, common_1.Query)('types', new common_1.ParseArrayPipe({ items: String, separator: ',', optional: true }))),
    __param(3, (0, common_1.Query)('startDate')),
    __param(4, (0, common_1.Query)('endDate')),
    __param(5, (0, common_1.Query)('limit')),
    __param(6, (0, common_1.Query)('maxId')),
    __param(7, (0, common_1.Query)('minId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, String, Number, Number, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getFilteredMedia", null);
__decorate([
    (0, common_1.Get)('group/members/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get group members' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', description: 'Group ID', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "blockChat", null);
__decorate([
    (0, common_1.Delete)('chat/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete or clear a chat history for a user' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the user whose chat should be deleted', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'peer', description: 'Username or Peer ID of the chat to delete', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'maxId', required: false, description: 'Delete messages with ID ≤ maxId' }),
    (0, swagger_1.ApiQuery)({ name: 'justClear', required: false, description: 'Only clear history for this user', type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'revoke', required: false, description: 'Delete for everyone if possible', type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'minDate', required: false, description: 'Minimum date (UNIX timestamp)' }),
    (0, swagger_1.ApiQuery)({ name: 'maxDate', required: false, description: 'Maximum date (UNIX timestamp)' }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiOperation)({
        summary: 'Get dialogs (paginated dialog list)',
        description: 'Paginated dialog list with optional filters. Use nextOffsetDate from response as offsetDate for next page (time-based cursor). Single endpoint for dialog list.',
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Items per page (default 100)' }),
    (0, swagger_1.ApiQuery)({ name: 'offsetDate', required: false, type: Number, description: 'Cursor: Unix seconds from previous nextOffsetDate' }),
    (0, swagger_1.ApiQuery)({ name: 'folderId', required: false, type: Number, enum: [0, 1], description: '0 = main, 1 = archived (overrides archived)' }),
    (0, swagger_1.ApiQuery)({ name: 'archived', required: false, type: Boolean, description: 'Include archived folder (folder=1)' }),
    (0, swagger_1.ApiQuery)({ name: 'peerType', required: false, enum: ['all', 'user', 'group', 'channel'], description: 'Filter by type' }),
    (0, swagger_1.ApiQuery)({ name: 'ignorePinned', required: false, type: Boolean, description: 'Exclude pinned dialogs' }),
    (0, swagger_1.ApiQuery)({ name: 'includePhotos', required: false, type: Boolean, description: 'Include base64 chat photos (default: false)' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        schema: {
            type: 'object',
            properties: {
                items: { type: 'array', description: 'Chat list (id, title, username, type, unreadCount, lastMessage, etc.)' },
                hasMore: { type: 'boolean' },
                nextOffsetDate: { type: 'number', description: 'Use as offsetDate for next page (Unix s)' },
            },
        },
    }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offsetDate')),
    __param(3, (0, common_1.Query)('folderId')),
    __param(4, (0, common_1.Query)('archived')),
    __param(5, (0, common_1.Query)('peerType')),
    __param(6, (0, common_1.Query)('ignorePinned')),
    __param(7, (0, common_1.Query)('includePhotos')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number, Number, Boolean, String, Boolean, Boolean]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getDialogs", null);
__decorate([
    (0, common_1.Get)('last-active/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get last active time' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('chatId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getScheduledMessages", null);
__decorate([
    (0, common_1.Post)('media/voice/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Send voice message',
        description: 'Send a voice message (audio file) to a chat. Maximum file size is 100MB. Duration is optional but recommended for better playback.'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number of the Telegram account', required: true, example: '1234567890' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                chatId: { type: 'string', description: 'Chat ID or username', example: 'me' },
                url: { type: 'string', description: 'URL of the voice file (must be accessible)', example: 'https://example.com/voice.ogg' },
                duration: { type: 'number', description: 'Duration in seconds (optional but recommended)', example: 30 },
                caption: { type: 'string', description: 'Optional caption for the voice message' }
            },
            required: ['chatId', 'url']
        }
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Voice message sent successfully',
        type: Object
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid request - missing chatId/url, file too large, or invalid URL'
    }),
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
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('binaryData', { storage: multer.memoryStorage() })),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { groupId: { type: 'string' }, userId: { type: 'string' } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiBody)({ schema: { type: 'array', items: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' } } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getChatFolders", null);
__decorate([
    (0, common_1.Put)('messages/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Edit message' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { chatId: { type: 'string' }, messageId: { type: 'number' }, text: { type: 'string' }, media: { type: 'object', properties: { type: { type: 'string', enum: ['photo', 'video', 'document'] }, url: { type: 'string' } } } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { chatId: { type: 'string' }, title: { type: 'string' }, about: { type: 'string' }, photo: { type: 'string' }, slowMode: { type: 'number' }, linkedChat: { type: 'string' }, defaultSendAs: { type: 'string' }, username: { type: 'string' } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { chatId: { type: 'string' }, media: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['photo', 'video', 'document'] }, url: { type: 'string' }, caption: { type: 'string' }, fileName: { type: 'string' } } } }, silent: { type: 'boolean' }, scheduleDate: { type: 'number' } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "hasPassword", null);
__decorate([
    (0, common_1.Get)('file/url/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get downloadable URL for a file' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'url', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'filename', required: true }),
    (0, swagger_1.ApiResponse)({ type: String }),
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
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { chatId: { type: 'string' }, period: { type: 'string', enum: ['day', 'week', 'month'] }, fromDate: { type: 'string', format: 'date-time' } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getMessageStats", null);
__decorate([
    (0, common_1.Get)('chats/top-private/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get top private chats with smart activity-based filtering',
        description: 'Retrieves top private chats ranked by engagement score using advanced filtering. ' +
            'Uses time-decay scoring, conversation patterns, and dialog metadata for accurate results. ' +
            'Considers recency, mutual engagement, reply chains, and call history. ' +
            'Supports configurable limit (default: 10, max: 50).'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Maximum number of top chats to return (default: 10, min: 1, max: 50)',
        example: 10
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Top private chats retrieved successfully',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    chatId: { type: 'string', description: 'Chat/user ID' },
                    username: { type: 'string', description: 'Username (if available)' },
                    firstName: { type: 'string', description: 'First name' },
                    lastName: { type: 'string', description: 'Last name' },
                    totalMessages: { type: 'number', description: 'Total messages in conversation' },
                    interactionScore: {
                        type: 'number',
                        description: 'Calculated engagement score (higher = more active)'
                    },
                    engagementLevel: {
                        type: 'string',
                        enum: ['active', 'dormant'],
                        description: 'Active if engagement score > 0, else dormant'
                    },
                    calls: {
                        type: 'object',
                        properties: {
                            total: { type: 'number' },
                            incoming: {
                                type: 'object',
                                properties: {
                                    total: { type: 'number' },
                                    audio: { type: 'number' },
                                    video: { type: 'number' }
                                }
                            },
                            outgoing: {
                                type: 'object',
                                properties: {
                                    total: { type: 'number' },
                                    audio: { type: 'number' },
                                    video: { type: 'number' }
                                }
                            }
                        }
                    },
                    media: {
                        type: 'object',
                        properties: {
                            photos: { type: 'number', description: 'Total photos shared' },
                            videos: { type: 'number', description: 'Total videos shared' }
                        }
                    },
                    activityBreakdown: {
                        type: 'object',
                        description: 'Percentage breakdown of interaction types',
                        properties: {
                            videoCalls: { type: 'number', description: 'Percentage from video calls' },
                            audioCalls: { type: 'number', description: 'Percentage from audio calls' },
                            mediaSharing: { type: 'number', description: 'Percentage from media sharing' },
                            textMessages: { type: 'number', description: 'Percentage from text messages' }
                        }
                    }
                }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal Server Error' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getTopPrivateChats", null);
__decorate([
    (0, common_1.Get)('messages/self-msg-info/:mobile'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get statistics about media messages in saved messages',
        description: 'Retrieves comprehensive statistics about photos, videos, and movies in saved messages (self chat). ' +
            'Uses memory-efficient iterMessages for processing large message histories. ' +
            'Supports configurable limit for analysis scope (default: 500, max: 10000).'
    }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Maximum number of messages to analyze (default: 500, max: 10000)',
        example: 500,
        minimum: 1,
        maximum: 10000
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Self messages statistics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                total: { type: 'number', description: 'Total messages in saved messages' },
                photoCount: { type: 'number', description: 'Total photos' },
                videoCount: { type: 'number', description: 'Total videos' },
                movieCount: {
                    type: 'number',
                    description: 'Messages containing movie-related keywords (links, shared content)'
                },
                ownPhotoCount: { type: 'number', description: 'Photos sent by user' },
                otherPhotoCount: { type: 'number', description: 'Photos received from others' },
                ownVideoCount: { type: 'number', description: 'Videos sent by user' },
                otherVideoCount: { type: 'number', description: 'Videos received from others' },
                analyzedMessages: {
                    type: 'number',
                    description: 'Number of messages actually analyzed'
                }
            }
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request - invalid limit parameter' }),
    (0, swagger_1.ApiResponse)({ status: 500, description: 'Internal Server Error' }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "getSelfMsgsInfo", null);
__decorate([
    (0, common_1.Post)('bots/add-to-channel/:mobile'),
    (0, swagger_1.ApiOperation)({ summary: 'Add bots to channel with admin privileges' }),
    (0, swagger_1.ApiParam)({ name: 'mobile', description: 'Mobile number', required: true }),
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { channelIds: { type: 'array', items: { type: 'string' }, description: 'Array of channel IDs to add bots to. If not provided, will use default channels from environment variables.' } } } }),
    (0, swagger_1.ApiResponse)({ type: Object }),
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
    (0, swagger_1.ApiBody)({ type: dto_1.CreateTgBotDto }),
    (0, swagger_1.ApiResponse)({ type: Object, schema: { properties: { botToken: { type: 'string', description: 'The token to access HTTP Bot API' }, username: { type: 'string', description: 'The username of the created bot' } } } }),
    __param(0, (0, common_1.Param)('mobile')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CreateTgBotDto]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "createBot", null);
exports.TelegramController = TelegramController = __decorate([
    (0, common_1.Controller)('telegram'),
    (0, swagger_1.ApiTags)('Telegram'),
    __metadata("design:paramtypes", [Telegram_service_1.TelegramService])
], TelegramController);
//# sourceMappingURL=Telegram.controller.js.map