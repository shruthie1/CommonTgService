import { Api, TelegramClient } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import { MessageMediaType, SearchMessagesDto, SearchMessagesResponseDto } from '../dto/message-search.dto';
import { MediaAlbumOptions } from '../types/telegram-types';
import { IterMessagesParams } from 'telegram/client/messages';
import { sleep } from 'telegram/Helpers';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import bigInt from 'big-integer';

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

/**
 * Send a message
 */
export async function sendMessage(client: TelegramClient, params: { peer: string, parseMode?: string, message: string }): Promise<any> {
    return await client.sendMessage(params.peer, {
        message: params.message,
        parseMode: params.parseMode as any
    });
}

/**
 * Forward messages
 */
export async function forwardMessages(client: TelegramClient, fromChatId: string, toChatId: string, messageIds: number[]): Promise<any> {
    console.log(`Forwarding ${messageIds.length} messages from ${fromChatId} to ${toChatId}`);
    
    const fromEntity = await client.getEntity(fromChatId);
    const toEntity = await client.getEntity(toChatId);

    const result = await client.invoke(new Api.messages.ForwardMessages({
        fromPeer: fromEntity,
        toPeer: toEntity,
        id: messageIds,
        randomId: messageIds.map(() => bigInt(Math.floor(Math.random() * 0xffffffff))),
        silent: false,
        dropAuthor: false,
        dropMediaCaptions: false,
        noforwards: false
    }));

    console.log(`Successfully forwarded ${messageIds.length} messages`);
    return result;
}

/**
 * Forward secret messages (messages with media) from one chat to another
 */
export async function forwardSecretMessages(
    client: TelegramClient,
    fromChatId: string,
    toChatId: string,
    sleep: (ms: number) => Promise<void>
): Promise<void> {
    let offset = 0;
    const limit = 100;
    let totalMessages = 0;
    let forwardedCount = 0;
    let messages: any = [];
    
    do {
        messages = await client.getMessages(fromChatId, { offsetId: offset, limit });
        totalMessages = messages.total;
        
        const messageIds = messages.map((message: Api.Message) => {
            offset = message.id;
            if (message.id && message.media) {
                return message.id;
            }
            return undefined;
        }).filter(id => id !== undefined);
        
        console.log(messageIds);
        
        if (messageIds.length > 0) {
            try {
                const result = await client.forwardMessages(toChatId, {
                    messages: messageIds,
                    fromPeer: fromChatId,
                });

                forwardedCount += messageIds.length;
                console.log(`Forwarded ${forwardedCount} / ${totalMessages} messages`);
                await sleep(5000); // Sleep to avoid rate limits
            } catch (error) {
                console.error("Error occurred while forwarding messages:", error);
            }
            await sleep(5000); // Sleep to avoid rate limits
        }
    } while (messages.length > 0);
    
    console.log("Left the channel with ID:", toChatId);
}

/**
 * Schedule a message
 */
export async function scheduleMessageSend(client: TelegramClient, opts: MessageScheduleOptions): Promise<any> {
    const scheduleTimestamp = Math.floor(opts.scheduledTime.getTime() / 1000);
    
    if (opts.media) {
        const buffer = await downloadFileFromUrl(opts.media.url);
        const file = new CustomFile(
            `media.${getMediaExtension(opts.media.type)}`,
            buffer.length,
            'media',
            buffer
        );

        const uploadedFile = await client.uploadFile({
            file,
            workers: 1
        });

        const inputMedia = opts.media.type === 'photo' ?
            new Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
            new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: getMimeType(opts.media.type),
                attributes: []
            });

        return client.invoke(new Api.messages.SendMedia({
            peer: opts.chatId,
            media: inputMedia,
            message: opts.message,
            scheduleDate: scheduleTimestamp,
            silent: opts.silent,
            replyTo: opts.replyTo ? new Api.InputReplyToMessage({ replyToMsgId: opts.replyTo }) : undefined
        }));
    }

    return client.invoke(new Api.messages.SendMessage({
        peer: opts.chatId,
        message: opts.message,
        scheduleDate: scheduleTimestamp,
        silent: opts.silent,
        replyTo: opts.replyTo ? new Api.InputReplyToMessage({ replyToMsgId: opts.replyTo }) : undefined
    }));
}

/**
 * Get scheduled messages
 */
export async function getScheduledMessages(client: TelegramClient, chatId: string): Promise<Api.TypeMessage[]> {
    const result: any = await client.invoke(new Api.messages.GetScheduledMessages({
        peer: chatId,
        id: []
    }));
    
    return result.messages;
}

/**
 * Send voice message
 */
export async function sendVoiceMessage(client: TelegramClient, voice: {
    chatId: string;
    url: string;
    duration?: number;
    caption?: string;
}): Promise<any> {
    const buffer = await downloadFileFromUrl(voice.url);
    const file = new CustomFile('voice.ogg', buffer.length, 'voice.ogg', buffer);
    
    const uploadedFile = await client.uploadFile({
        file,
        workers: 1
    });

    const inputMedia = new Api.InputMediaUploadedDocument({
        file: uploadedFile,
        mimeType: 'audio/ogg',
        attributes: [
            new Api.DocumentAttributeAudio({
                duration: voice.duration || 0,
                voice: true
            })
        ]
    });

    return client.sendFile(voice.chatId, {
        file: inputMedia,
        caption: voice.caption || ''
    });
}

/**
 * Send photo to chat
 */
export async function sendPhotoChat(client: TelegramClient, id: string, url: string, caption: string, filename: string): Promise<void> {
    try {
        const buffer = await downloadFileFromUrl(url);
        const file = new CustomFile(filename, buffer.length, filename, buffer);
        
        await client.sendFile(id, {
            file,
            caption,
            forceDocument: false
        });
    } catch (error) {
        console.error('Error sending photo:', error);
        throw error;
    }
}

/**
 * Send file to chat
 */
export async function sendFileChat(client: TelegramClient, id: string, url: string, caption: string, filename: string): Promise<void> {
    try {
        const buffer = await downloadFileFromUrl(url);
        const file = new CustomFile(filename, buffer.length, filename, buffer);

        await client.sendFile(id, {
            file,
            caption,
            forceDocument: true
        });
    } catch (error) {
        console.error('Error sending file:', error);
        throw error;
    }
}

/**
 * Send media album
 */
export async function sendMediaAlbum(client: TelegramClient, album: MediaAlbumOptions): Promise<any> {
    const mediaFiles = await Promise.all(
        album.media.map(async (item: any) => {
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
        peer: album.chatId,
        multiMedia: mediaFiles,
        silent: (album as any).silent,
        scheduleDate: (album as any).scheduleDate
    }));
}

/**
 * Edit message
 */
export async function editMessage(client: TelegramClient, options: {
    chatId: string;
    messageId: number;
    text?: string;
    media?: {
        type: 'photo' | 'video' | 'document';
        url: string;
    };
}): Promise<any> {
    if (options.media) {
        const buffer = await downloadFileFromUrl(options.media.url);
        const file = new CustomFile(
            `media.${getMediaExtension(options.media.type)}`,
            buffer.length,
            'media',
            buffer
        );

        const uploadedFile = await client.uploadFile({
            file,
            workers: 1
        });

        const inputMedia = options.media.type === 'photo' ?
            new Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
            new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: getMimeType(options.media.type),
                attributes: getMediaAttributes(options.media)
            });

        return client.invoke(new Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            media: inputMedia,
            message: options.text || ''
        }));
    }

    if (options.text) {
        return client.invoke(new Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            message: options.text
        }));
    }

    throw new Error('Either text or media must be provided');
}

/**
 * Search messages
 */
export async function searchMessages(client: TelegramClient, params: SearchMessagesDto): Promise<SearchMessagesResponseDto> {
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
    console.log("Types: ", types);
    for (const type of types) {
        const filter = getSearchFilter(type);
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
            hash: bigInt(0),
        }
        let messages = [];
        let count = 0;
        console.log("Search Query: ", searchQuery);
        if (chatId) {
            const result: any = await client.invoke(new Api.messages.Search({
                peer: chatId,
                ...searchQuery
            }));
            messages = result.messages;
            count = result.count;
        } else {
            const result: any = await client.invoke(new Api.messages.SearchGlobal(searchQuery));
            messages = result.messages;
            count = result.count;
        }
        if (types.includes(MessageMediaType.TEXT) && types.length === 1) {
            messages = messages.filter((msg: Api.Message) => !msg.media);
        }
        const processedMessages = await Promise.all(messages.map(async (message: Api.Message) => {
            try {
                if (!message.media) return {
                    messageId: message.id,
                    type: 'text',
                    text: message.message,
                    date: message.date
                };

                const mediaDetails = await getMediaDetails(client, message.media as Api.MessageMediaDocument);
                return {
                    messageId: message.id,
                    type: getMediaType(message.media),
                    caption: message.message || '',
                    date: message.date,
                    mediaDetails,
                };
            } catch (error) {
                console.error('Error processing message:', error);
                return null;
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

/**
 * Clean up chat messages
 */
export async function cleanupChat(client: TelegramClient, cleanup: {
    chatId: string;
    beforeDate?: Date;
    onlyMedia?: boolean;
    excludePinned?: boolean;
    revoke?: boolean;
}): Promise<void> {
    const messages = await client.getMessages(cleanup.chatId, {
        limit: 100,
        ...(cleanup.beforeDate && { 
            offsetDate: Math.floor(cleanup.beforeDate.getTime() / 1000) 
        })
    });

    let messagesToDelete = messages;

    if (cleanup.onlyMedia) {
        messagesToDelete = messages.filter(msg => msg.media);
    }

    if (cleanup.excludePinned) {
        messagesToDelete = messagesToDelete.filter(msg => !msg.pinned);
    }

    const messageIds = messagesToDelete.map(msg => msg.id);

    if (messageIds.length > 0) {
        await client.invoke(new Api.messages.DeleteMessages({
            id: messageIds,
            revoke: cleanup.revoke || false
        }));
    }
}

// Helper functions
export async function downloadFileFromUrl(url: string): Promise<Buffer> {
    const response = await fetchWithTimeout(url, { timeout: 30000 });
    if (response.status !== 200) {
        throw new Error(`Failed to download file: ${response.statusText}`);
    }
    return Buffer.from(response.data);
}

export function getMediaExtension(type: string): string {
    switch (type) {
        case 'photo': return 'jpg';
        case 'video': return 'mp4';
        case 'document': return 'pdf';
        default: return 'bin';
    }
}

export function getMimeType(type: string): string {
    switch (type) {
        case 'photo': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'document': return 'application/octet-stream';
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

    return attributes;
}

export function getSearchFilter(filter: string): Api.TypeMessagesFilter {
    switch (filter) {
        case MessageMediaType.PHOTO:
            return new Api.InputMessagesFilterPhotos();
        case MessageMediaType.VIDEO:
            return new Api.InputMessagesFilterVideo();
        case MessageMediaType.DOCUMENT:
            return new Api.InputMessagesFilterDocument();
        case MessageMediaType.VOICE:
            return new Api.InputMessagesFilterVoice();
        case MessageMediaType.ROUND_VIDEO:
            return new Api.InputMessagesFilterRoundVideo();
        case MessageMediaType.ROUND_VOICE:
            return new Api.InputMessagesFilterRoundVoice();
        case MessageMediaType.TEXT:
            return new Api.InputMessagesFilterEmpty();
        default:
            return new Api.InputMessagesFilterEmpty();
    }
}

export function getMediaType(media: Api.TypeMessageMedia): 'photo' | 'video' | 'document' {
    if (media instanceof Api.MessageMediaPhoto) {
        return 'photo';
    } else if (media instanceof Api.MessageMediaDocument) {
        return 'video';
    }
    return 'document';
}

export async function getMediaDetails(client: TelegramClient, media: Api.MessageMediaDocument): Promise<any> {
    if (!media || !media.document) return null;
    
    const doc = media.document as Api.Document;
    return {
        id: doc.id.toString(),
        size: doc.size.toString(),
        mimeType: doc.mimeType,
        fileName: doc.attributes?.find(attr => attr instanceof Api.DocumentAttributeFilename)?.fileName || 'unknown'
    };
}
