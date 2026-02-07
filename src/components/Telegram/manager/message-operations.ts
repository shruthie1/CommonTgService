import { Api } from 'telegram';
import { sleep } from 'telegram/Helpers';
import bigInt from 'big-integer';
import { CustomFile } from 'telegram/client/uploads';
import { TgContext, MessageScheduleOptions, EditMessageOptions, MediaBatchOptions, VoiceMessageOptions, AlbumSendResult, ForwardResult, ScheduledMessageItem, SearchMessageItem } from './types';
import { SearchMessagesDto, SearchMessagesResponseDto, MessageMediaType } from '../dto/message-search.dto';
import { SendTgMessageDto } from '../dto/send-message.dto';
import { MediaAlbumOptions } from '../types/telegram-types';
import { contains } from '../../../utils';
import { getSearchFilter, downloadFileFromUrl, detectContentType, getMimeType, getMediaExtension, getMediaAttributes, toISODate, getMediaType, extractMediaMetaFromMessage } from './helpers';
import { safeGetEntityById } from './chat-operations';

export async function sendMessageToChat(ctx: TgContext, params: SendTgMessageDto): Promise<Api.Message> {
    if (!ctx.client) throw new Error('Client not initialized');
    const { peer, parseMode, message } = params;
    return await ctx.client.sendMessage(peer, { message, parseMode });
}

export async function sendInlineMessage(ctx: TgContext, chatId: string, message: string, url: string): Promise<Api.Message> {
    const button = { text: 'Open URL', url };
    const result = await ctx.client.sendMessage(chatId, {
        message,
        buttons: [new Api.KeyboardButtonUrl(button)],
    });
    return result;
}

export async function forwardSecretMsgs(ctx: TgContext, fromChatId: string, toChatId: string): Promise<ForwardResult> {
    let offset = 0;
    const limit = 100;
    let forwardedCount = 0;
    let messages: Api.Message[] = [];
    do {
        const messages = await ctx.client.getMessages(fromChatId, { offsetId: offset, limit });
        const messageIds = messages.map((message: Api.Message) => {
            offset = message.id;
            if (message.id && message.media) {
                return message.id;
            }
            return undefined;
        }).filter((id): id is number => id !== undefined);
        ctx.logger.info(ctx.phoneNumber, `Message IDs: ${messageIds.join(', ')}`);
        if (messageIds.length > 0) {
            try {
                await ctx.client.forwardMessages(toChatId, {
                    messages: messageIds,
                    fromPeer: fromChatId,
                });
                forwardedCount += messageIds.length;
                ctx.logger.info(ctx.phoneNumber, `Forwarded ${forwardedCount} messages`);
                await sleep(5000);
            } catch (error) {
                ctx.logger.error(ctx.phoneNumber, 'Error occurred while forwarding messages:', error);
            }
            await sleep(5000);
        }
    } while (messages.length > 0);
    ctx.logger.info(ctx.phoneNumber, 'Left the channel with ID:', toChatId);
    return { forwardedCount };
}

export async function forwardMessages(ctx: TgContext, fromChatId: string, toChatId: string, messageIds: number[]): Promise<number> {
    const chunkSize = 30;
    const totalMessages = messageIds.length;
    let forwardedCount = 0;

    for (let i = 0; i < totalMessages; i += chunkSize) {
        const chunk = messageIds.slice(i, i + chunkSize);
        try {
            await ctx.client.forwardMessages(toChatId, {
                messages: chunk,
                fromPeer: fromChatId,
            });
            forwardedCount += chunk.length;
            ctx.logger.info(ctx.phoneNumber, `Forwarded ${forwardedCount} / ${totalMessages} messages`);
            await sleep(5000);
        } catch (error) {
            ctx.logger.error(ctx.phoneNumber, 'Error occurred while forwarding messages:', error);
        }
    }

    return forwardedCount;
}

export async function forwardMessage(ctx: TgContext, toChatId: string, fromChatId: string, messageId: number): Promise<void> {
    try {
        await ctx.client.forwardMessages(toChatId, { fromPeer: fromChatId, messages: messageId });
    } catch (error) {
        ctx.logger.info(ctx.phoneNumber, 'Failed to Forward Message : ', error.errorMessage);
    }
}

export async function searchMessages(ctx: TgContext, params: SearchMessagesDto): Promise<SearchMessagesResponseDto> {
    if (!ctx.client) throw new Error('Client not initialized');
    const finalResult: SearchMessagesResponseDto = {
        video: { messages: [], total: 0 },
        photo: { messages: [], total: 0 },
        document: { messages: [], total: 0 },
        voice: { messages: [], total: 0 },
        text: { messages: [], total: 0 },
        all: { messages: [], total: 0 },
        roundVideo: { messages: [], total: 0 },
        roundVoice: { messages: [], total: 0 },
    };
    const { chatId, query = '', types = [MessageMediaType.ALL, MessageMediaType.TEXT, MessageMediaType.PHOTO, MessageMediaType.VIDEO, MessageMediaType.VOICE, MessageMediaType.DOCUMENT, MessageMediaType.ROUND_VIDEO, MessageMediaType.ROUND_VOICE], maxId, minId, limit } = params;
    ctx.logger.info(ctx.phoneNumber, 'Types: ', types);

    // Pre-compute unwanted texts Set for O(1) lookup
    const unwantedTexts = new Set([
        'movie', 'series', 'tv show', 'anime', 'x264', 'aac', '720p', '1080p', 'dvd',
        'paidgirl', 'join', 'game', 'free', 'download', 'torrent', 'link', 'invite',
        'invite link', 'invitation', 'invitation link', 'customers', 'confirmation', 'earn', 'book', 'paper', 'pay',
        'qr', 'invest', 'tera', 'disk', 'insta', 'mkv', 'sub', '480p', 'hevc', 'x265', 'bluray',
        'mdisk', 'diskwala', 'online', 'watch', 'click', 'episode', 'season', 'part', 'action',
        'adventure', 'comedy', 'drama', 'fantasy', 'horror', 'mystery', 'romance', 'sci-fi', 'thriller',
        'demo', 'dress', 'netlify', 'service', 'follow', 'like', 'comment', 'share', 'subscribe',
        'premium', 'unlock', 'access', 'exclusive', 'limited', 'offer', 'deal',
        'discount', 'sale', 'free trial', 'free access', 'free download', 'free gift', 'freebie',
        'crypto', 'currency', 'coin', 'blockchain', 'wallet', 'exchange', 'trading', 'investment',
    ]);

    function containsUnwanted(text: string): boolean {
        const lower = text.toLowerCase();
        for (const term of unwantedTexts) {
            if (lower.includes(term)) return true;
        }
        return false;
    }

    for (const type of types) {
        const filter = getSearchFilter(type);
        const queryFilter = {
            limit: limit || 500,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
        };

        ctx.logger.info(ctx.phoneNumber, type, queryFilter);
        let messages: Api.Message[] = [];
        let count = 0;

        if (chatId) {
            const peer = await safeGetEntityById(ctx, chatId);
            ctx.logger.info(ctx.phoneNumber, 'Performing search in chat: ', chatId);
            const result = await ctx.client.invoke(new Api.messages.Search({
                peer,
                q: query,
                filter,
                ...queryFilter,
                hash: bigInt(0),
                minDate: 0,
                maxDate: 0,
                addOffset: 0,
                offsetId: 0,
            }));
            if (!('messages' in result)) return finalResult;
            ctx.logger.info(ctx.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${(result as Api.messages.ChannelMessages).count}`);
            count = (result as Api.messages.ChannelMessages).count || 0;
            messages = result.messages as Api.Message[];
        } else {
            ctx.logger.info(ctx.phoneNumber, 'Performing global search');
            const result = await ctx.client.invoke(new Api.messages.SearchGlobal({
                q: query,
                filter,
                ...queryFilter,
                offsetRate: 0,
                offsetPeer: new Api.InputPeerEmpty(),
                offsetId: 0,
            }));
            if (!('messages' in result)) return finalResult;
            ctx.logger.info(ctx.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${(result as Api.messages.ChannelMessages).count}`);
            count = (result as Api.messages.ChannelMessages).count || 0;
            messages = result.messages as Api.Message[];
        }

        if (types.includes(MessageMediaType.TEXT) && types.length === 1) {
            ctx.logger.info(ctx.phoneNumber, 'Text Filter');
            messages = messages.filter((msg: Api.Message) => !('media' in msg) || !msg.media);
        }

        const processedMessages = await Promise.all(messages.map(async (message: Api.Message) => {
            if (message.media && message.media instanceof Api.MessageMediaDocument) {
                const document = message.media.document as Api.Document;
                const fileNameAttr = document.attributes.find(attr => attr instanceof Api.DocumentAttributeFilename);
                const fileName = fileNameAttr && fileNameAttr instanceof Api.DocumentAttributeFilename ? fileNameAttr.fileName : '';
                const isWantedFile = !containsUnwanted(fileName);
                return isWantedFile ? message : null;
            } else {
                const messageText = (message.text || '').toLowerCase();
                return !containsUnwanted(messageText) ? message : null;
            }
        }));

        const filteredMsgs = processedMessages.filter((msg): msg is Api.Message => msg !== null);
        const filteredIds = filteredMsgs.map(m => m.id);

        // Build enriched data items
        const enrichedData: SearchMessageItem[] = filteredMsgs.map((msg) => {
            let senderName: string | null = null;
            if (msg.fromId instanceof Api.PeerUser) {
                senderName = msg.fromId.userId.toString();
            }
            let mediaType: string | null = null;
            if (msg.media && !(msg.media instanceof Api.MessageMediaEmpty)) {
                mediaType = getMediaType(msg.media);
            }
            let msgChatId = chatId || '';
            if (!msgChatId && msg.peerId) {
                if (msg.peerId instanceof Api.PeerUser) msgChatId = msg.peerId.userId.toString();
                else if (msg.peerId instanceof Api.PeerChat) msgChatId = msg.peerId.chatId.toString();
                else if (msg.peerId instanceof Api.PeerChannel) msgChatId = msg.peerId.channelId.toString();
            }
            return {
                id: msg.id,
                text: msg.message || '',
                date: toISODate(msg.date),
                chatId: msgChatId,
                senderName,
                mediaType,
            };
        });

        finalResult[`${type}`] = {
            messages: filteredIds,
            total: count ? count : filteredIds.length,
            data: enrichedData,
        };
    }
    return finalResult;
}

export async function scheduleMessageSend(ctx: TgContext, opts: MessageScheduleOptions): Promise<Api.Message | Api.TypeUpdates> {
    if (!ctx.client) throw new Error('Client not initialized');

    const scheduleDate = Math.floor(opts.scheduledTime.getTime() / 1000);

    if (opts.media) {
        const buffer = await downloadFileFromUrl(opts.media.url);
        const uploadedFile = await ctx.client.uploadFile({
            file: new CustomFile('media', buffer.length, 'media', buffer),
            workers: 1,
        });

        return ctx.client.sendFile(opts.chatId, {
            file: uploadedFile,
            caption: opts.message,
            forceDocument: opts.media.type === 'document',
            scheduleDate,
        });
    }

    return ctx.client.sendMessage(opts.chatId, {
        message: opts.message,
        schedule: Math.floor(opts.scheduledTime.getTime() / 1000),
    });
}

export async function getScheduledMessages(ctx: TgContext, chatId: string): Promise<ScheduledMessageItem[]> {
    if (!ctx.client) throw new Error('Client not initialized');

    const result = await ctx.client.invoke(new Api.messages.GetScheduledHistory({
        peer: chatId,
        hash: bigInt(0),
    }));

    const messages = 'messages' in result && Array.isArray(result.messages)
        ? result.messages.filter((msg): msg is Api.Message => msg instanceof Api.Message)
        : [];

    return messages.map((msg) => {
        let media = null;
        if (msg.media && !(msg.media instanceof Api.MessageMediaEmpty)) {
            const mediaType = getMediaType(msg.media);
            const meta = extractMediaMetaFromMessage(msg, chatId, mediaType);
            media = {
                type: mediaType,
                thumbnail: null,
                mimeType: meta.mimeType || null,
                fileName: meta.filename || null,
                fileSize: meta.fileSize || null,
                width: meta.width || null,
                height: meta.height || null,
                duration: meta.duration || null,
            };
        }

        return {
            id: msg.id,
            text: msg.message || '',
            scheduledDate: toISODate(msg.date),
            media,
            chatId,
        };
    });
}

export async function sendMediaAlbum(ctx: TgContext, album: MediaAlbumOptions): Promise<AlbumSendResult> {
    if (!ctx.client) throw new Error('Client not initialized');

    const results: Api.InputSingleMedia[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < album.media.length; i++) {
        const item = album.media[i];
        try {
            const buffer = await downloadFileFromUrl(item.url);
            const uploadedFile = await ctx.client.uploadFile({
                file: new CustomFile(
                    item.filename || `media_${i}`,
                    buffer.length,
                    item.filename || `media_${i}`,
                    buffer
                ),
                workers: 1,
            });

            const media = new Api.InputSingleMedia({
                media: item.type === 'photo'
                    ? new Api.InputMediaUploadedPhoto({ file: uploadedFile })
                    : new Api.InputMediaUploadedDocument({
                        file: uploadedFile,
                        mimeType: item.type === 'video' ? 'video/mp4' : detectContentType(item.filename || `media_${i}`),
                        attributes: item.type === 'video' ? [
                            new Api.DocumentAttributeVideo({
                                supportsStreaming: true,
                                duration: 0,
                                w: 0,
                                h: 0,
                            }),
                        ] : [],
                    }),
                message: item.caption || '',
                entities: [],
            });
            results.push(media);
        } catch (error) {
            ctx.logger.error(ctx.phoneNumber, `Error processing album item ${i}:`, error);
            errors.push({ index: i, error: error.message || 'Unknown error' });
        }
    }

    if (results.length === 0) {
        throw new Error('No media items could be processed. All items failed.');
    }

    await ctx.client.invoke(new Api.messages.SendMultiMedia({
        peer: album.chatId,
        multiMedia: results,
    }));

    return {
        success: results.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
    };
}

export async function sendVoiceMessage(ctx: TgContext, voice: VoiceMessageOptions): Promise<Api.TypeUpdates> {
    if (!ctx.client) throw new Error('Client not initialized');

    try {
        const buffer = await downloadFileFromUrl(voice.url);

        return await ctx.client.invoke(new Api.messages.SendMedia({
            peer: voice.chatId,
            media: new Api.InputMediaUploadedDocument({
                file: await ctx.client.uploadFile({
                    file: new CustomFile('voice.ogg', buffer.length, 'voice.ogg', buffer),
                    workers: 1,
                }),
                mimeType: 'audio/ogg',
                attributes: [
                    new Api.DocumentAttributeAudio({
                        voice: true,
                        duration: voice.duration || 0,
                    }),
                ],
            }),
            message: voice.caption || '',
            randomId: bigInt(Math.floor(Math.random() * 1000000000)),
        }));
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending voice message:', error);
        throw error;
    }
}

export async function cleanupChat(ctx: TgContext, cleanup: {
    chatId: string;
    beforeDate?: Date;
    onlyMedia?: boolean;
    excludePinned?: boolean;
    revoke?: boolean;
}): Promise<{ deletedCount: number }> {
    if (!ctx.client) throw new Error('Client not initialized');
    cleanup.revoke = cleanup.revoke !== undefined ? cleanup.revoke : true;

    const messages = await ctx.client.getMessages(cleanup.chatId, {
        limit: 1000,
        ...(cleanup.beforeDate && {
            offsetDate: Math.floor(cleanup.beforeDate.getTime() / 1000),
        }),
    });

    const toDelete = messages.filter(msg => {
        if (cleanup.excludePinned && msg.pinned) return false;
        if (cleanup.onlyMedia && !msg.media) return false;
        return true;
    });

    if (toDelete.length > 0) {
        await ctx.client.deleteMessages(cleanup.chatId, toDelete.map(m => m.id), {
            revoke: cleanup.revoke,
        });
    }

    return { deletedCount: toDelete.length };
}

export async function editMessage(ctx: TgContext, options: EditMessageOptions): Promise<Api.TypeUpdates> {
    if (!ctx.client) throw new Error('Client not initialized');

    if (options.media) {
        const buffer = await downloadFileFromUrl(options.media.url);
        const file = new CustomFile(
            `media.${getMediaExtension(options.media.type)}`,
            buffer.length,
            'media',
            buffer
        );

        const uploadedFile = await ctx.client.uploadFile({ file, workers: 1 });

        const inputMedia = options.media.type === 'photo'
            ? new Api.InputMediaUploadedPhoto({ file: uploadedFile })
            : new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: getMimeType(options.media.type),
                attributes: getMediaAttributes(options.media),
            });

        return ctx.client.invoke(new Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            media: inputMedia,
            message: options.text || '',
        }));
    }

    if (options.text) {
        return ctx.client.invoke(new Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            message: options.text,
        }));
    }

    throw new Error('Either text or media must be provided');
}

export async function sendMediaBatch(ctx: TgContext, options: MediaBatchOptions): Promise<Api.TypeUpdates> {
    if (!ctx.client) throw new Error('Client not initialized');

    const mediaFiles = await Promise.all(
        options.media.map(async (item) => {
            const buffer = await downloadFileFromUrl(item.url);
            const file = new CustomFile(
                item.fileName || `media.${getMediaExtension(item.type)}`,
                buffer.length,
                'media',
                buffer
            );

            const uploadedFile = await ctx.client.uploadFile({ file, workers: 1 });

            const inputMedia = item.type === 'photo'
                ? new Api.InputMediaUploadedPhoto({ file: uploadedFile })
                : new Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: getMimeType(item.type),
                    attributes: getMediaAttributes(item),
                });

            return new Api.InputSingleMedia({
                media: inputMedia,
                message: item.caption || '',
                entities: [],
            });
        })
    );

    return ctx.client.invoke(new Api.messages.SendMultiMedia({
        peer: options.chatId,
        multiMedia: mediaFiles,
        silent: options.silent,
        scheduleDate: options.scheduleDate,
    }));
}

export async function sendViewOnceMedia(
    ctx: TgContext,
    chatId: string,
    buffer: Buffer,
    caption: string = '',
    isVideo?: boolean,
    filename?: string
): Promise<Api.TypeUpdates> {
    if (!ctx.client) throw new Error('Client is not initialized');

    try {
        const actualFilename = filename || `viewonce_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
        const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
        const inputFile = await ctx.client.uploadFile({
            file: new CustomFile(actualFilename, buffer.length, actualFilename, buffer),
            workers: 1,
        });
        const result = await ctx.client.invoke(new Api.messages.SendMedia({
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
                            h: 0,
                        }),
                    ],
                    ttlSeconds: 10,
                })
                : new Api.InputMediaUploadedPhoto({
                    file: inputFile,
                    ttlSeconds: 10,
                }),
            message: caption,
            randomId: bigInt(Math.floor(Math.random() * 1000000000)),
        }));

        ctx.logger.info(ctx.phoneNumber, `Sent view-once ${isVideo ? 'video' : 'photo'} to chat ${chatId}`);
        return result;
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending view-once media:', error);
        throw error;
    }
}

export async function sendPhotoChat(ctx: TgContext, id: string, url: string, caption: string, filename: string): Promise<void> {
    if (!ctx.client) throw new Error('Client is not initialized');

    try {
        const buffer = await downloadFileFromUrl(url);
        const file = new CustomFile(filename, buffer.length, filename, buffer);
        await ctx.client.sendFile(id, { file, caption });
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending photo:', error);
        throw error;
    }
}

export async function sendFileChat(ctx: TgContext, id: string, url: string, caption: string, filename: string): Promise<void> {
    if (!ctx.client) throw new Error('Client is not initialized');

    try {
        const buffer = await downloadFileFromUrl(url);
        const file = new CustomFile(filename, buffer.length, filename, buffer);
        await ctx.client.sendFile(id, { file, caption });
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending file:', error);
        throw error;
    }
}

export async function deleteChat(ctx: TgContext, params: {
    peer: string | Api.TypeInputPeer;
    maxId?: number;
    justClear?: boolean;
    revoke?: boolean;
    minDate?: number;
    maxDate?: number;
}): Promise<void> {
    try {
        await ctx.client.invoke(new Api.messages.DeleteHistory(params));
        ctx.logger.info(ctx.phoneNumber, `Dialog with ID ${params.peer} has been deleted.`);
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Failed to delete dialog:', error);
    }
}
