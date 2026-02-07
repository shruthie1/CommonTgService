"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageToChat = sendMessageToChat;
exports.sendInlineMessage = sendInlineMessage;
exports.forwardSecretMsgs = forwardSecretMsgs;
exports.forwardMessages = forwardMessages;
exports.forwardMessage = forwardMessage;
exports.searchMessages = searchMessages;
exports.scheduleMessageSend = scheduleMessageSend;
exports.getScheduledMessages = getScheduledMessages;
exports.sendMediaAlbum = sendMediaAlbum;
exports.sendVoiceMessage = sendVoiceMessage;
exports.cleanupChat = cleanupChat;
exports.editMessage = editMessage;
exports.sendMediaBatch = sendMediaBatch;
exports.sendViewOnceMedia = sendViewOnceMedia;
exports.sendPhotoChat = sendPhotoChat;
exports.sendFileChat = sendFileChat;
exports.deleteChat = deleteChat;
const telegram_1 = require("telegram");
const Helpers_1 = require("telegram/Helpers");
const big_integer_1 = __importDefault(require("big-integer"));
const uploads_1 = require("telegram/client/uploads");
const message_search_dto_1 = require("../dto/message-search.dto");
const helpers_1 = require("./helpers");
const chat_operations_1 = require("./chat-operations");
async function sendMessageToChat(ctx, params) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const { peer, parseMode, message } = params;
    return await ctx.client.sendMessage(peer, { message, parseMode });
}
async function sendInlineMessage(ctx, chatId, message, url) {
    const button = { text: 'Open URL', url };
    const result = await ctx.client.sendMessage(chatId, {
        message,
        buttons: [new telegram_1.Api.KeyboardButtonUrl(button)],
    });
    return result;
}
async function forwardSecretMsgs(ctx, fromChatId, toChatId) {
    let offset = 0;
    const limit = 100;
    let forwardedCount = 0;
    let messages = [];
    do {
        const messages = await ctx.client.getMessages(fromChatId, { offsetId: offset, limit });
        const messageIds = messages.map((message) => {
            offset = message.id;
            if (message.id && message.media) {
                return message.id;
            }
            return undefined;
        }).filter((id) => id !== undefined);
        ctx.logger.info(ctx.phoneNumber, `Message IDs: ${messageIds.join(', ')}`);
        if (messageIds.length > 0) {
            try {
                await ctx.client.forwardMessages(toChatId, {
                    messages: messageIds,
                    fromPeer: fromChatId,
                });
                forwardedCount += messageIds.length;
                ctx.logger.info(ctx.phoneNumber, `Forwarded ${forwardedCount} messages`);
                await (0, Helpers_1.sleep)(5000);
            }
            catch (error) {
                ctx.logger.error(ctx.phoneNumber, 'Error occurred while forwarding messages:', error);
            }
            await (0, Helpers_1.sleep)(5000);
        }
    } while (messages.length > 0);
    ctx.logger.info(ctx.phoneNumber, 'Left the channel with ID:', toChatId);
    return { forwardedCount };
}
async function forwardMessages(ctx, fromChatId, toChatId, messageIds) {
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
            await (0, Helpers_1.sleep)(5000);
        }
        catch (error) {
            ctx.logger.error(ctx.phoneNumber, 'Error occurred while forwarding messages:', error);
        }
    }
    return forwardedCount;
}
async function forwardMessage(ctx, toChatId, fromChatId, messageId) {
    try {
        await ctx.client.forwardMessages(toChatId, { fromPeer: fromChatId, messages: messageId });
    }
    catch (error) {
        ctx.logger.info(ctx.phoneNumber, 'Failed to Forward Message : ', error.errorMessage);
    }
}
async function searchMessages(ctx, params) {
    if (!ctx.client)
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
    const { chatId, query = '', types = [message_search_dto_1.MessageMediaType.ALL, message_search_dto_1.MessageMediaType.TEXT, message_search_dto_1.MessageMediaType.PHOTO, message_search_dto_1.MessageMediaType.VIDEO, message_search_dto_1.MessageMediaType.VOICE, message_search_dto_1.MessageMediaType.DOCUMENT, message_search_dto_1.MessageMediaType.ROUND_VIDEO, message_search_dto_1.MessageMediaType.ROUND_VOICE], maxId, minId, limit } = params;
    ctx.logger.info(ctx.phoneNumber, 'Types: ', types);
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
    function containsUnwanted(text) {
        const lower = text.toLowerCase();
        for (const term of unwantedTexts) {
            if (lower.includes(term))
                return true;
        }
        return false;
    }
    for (const type of types) {
        const filter = (0, helpers_1.getSearchFilter)(type);
        const queryFilter = {
            limit: limit || 500,
            ...(maxId ? { maxId } : {}),
            ...(minId ? { minId } : {}),
        };
        ctx.logger.info(ctx.phoneNumber, type, queryFilter);
        let messages = [];
        let count = 0;
        if (chatId) {
            const peer = await (0, chat_operations_1.safeGetEntityById)(ctx, chatId);
            ctx.logger.info(ctx.phoneNumber, 'Performing search in chat: ', chatId);
            const result = await ctx.client.invoke(new telegram_1.Api.messages.Search({
                peer,
                q: query,
                filter,
                ...queryFilter,
                hash: (0, big_integer_1.default)(0),
                minDate: 0,
                maxDate: 0,
                addOffset: 0,
                offsetId: 0,
            }));
            if (!('messages' in result))
                return finalResult;
            ctx.logger.info(ctx.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${result.count}`);
            count = result.count || 0;
            messages = result.messages;
        }
        else {
            ctx.logger.info(ctx.phoneNumber, 'Performing global search');
            const result = await ctx.client.invoke(new telegram_1.Api.messages.SearchGlobal({
                q: query,
                filter,
                ...queryFilter,
                offsetRate: 0,
                offsetPeer: new telegram_1.Api.InputPeerEmpty(),
                offsetId: 0,
            }));
            if (!('messages' in result))
                return finalResult;
            ctx.logger.info(ctx.phoneNumber, `Type: ${type}, Length: ${result?.messages?.length}, count: ${result.count}`);
            count = result.count || 0;
            messages = result.messages;
        }
        if (types.includes(message_search_dto_1.MessageMediaType.TEXT) && types.length === 1) {
            ctx.logger.info(ctx.phoneNumber, 'Text Filter');
            messages = messages.filter((msg) => !('media' in msg) || !msg.media);
        }
        const processedMessages = await Promise.all(messages.map(async (message) => {
            if (message.media && message.media instanceof telegram_1.Api.MessageMediaDocument) {
                const document = message.media.document;
                const fileNameAttr = document.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
                const fileName = fileNameAttr && fileNameAttr instanceof telegram_1.Api.DocumentAttributeFilename ? fileNameAttr.fileName : '';
                const isWantedFile = !containsUnwanted(fileName);
                return isWantedFile ? message : null;
            }
            else {
                const messageText = (message.text || '').toLowerCase();
                return !containsUnwanted(messageText) ? message : null;
            }
        }));
        const filteredMsgs = processedMessages.filter((msg) => msg !== null);
        const filteredIds = filteredMsgs.map(m => m.id);
        const enrichedData = filteredMsgs.map((msg) => {
            let senderName = null;
            if (msg.fromId instanceof telegram_1.Api.PeerUser) {
                senderName = msg.fromId.userId.toString();
            }
            let mediaType = null;
            if (msg.media && !(msg.media instanceof telegram_1.Api.MessageMediaEmpty)) {
                mediaType = (0, helpers_1.getMediaType)(msg.media);
            }
            let msgChatId = chatId || '';
            if (!msgChatId && msg.peerId) {
                if (msg.peerId instanceof telegram_1.Api.PeerUser)
                    msgChatId = msg.peerId.userId.toString();
                else if (msg.peerId instanceof telegram_1.Api.PeerChat)
                    msgChatId = msg.peerId.chatId.toString();
                else if (msg.peerId instanceof telegram_1.Api.PeerChannel)
                    msgChatId = msg.peerId.channelId.toString();
            }
            return {
                id: msg.id,
                text: msg.message || '',
                date: (0, helpers_1.toISODate)(msg.date),
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
async function scheduleMessageSend(ctx, opts) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const scheduleDate = Math.floor(opts.scheduledTime.getTime() / 1000);
    if (opts.media) {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(opts.media.url);
        const uploadedFile = await ctx.client.uploadFile({
            file: new uploads_1.CustomFile('media', buffer.length, 'media', buffer),
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
async function getScheduledMessages(ctx, chatId) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const result = await ctx.client.invoke(new telegram_1.Api.messages.GetScheduledHistory({
        peer: chatId,
        hash: (0, big_integer_1.default)(0),
    }));
    const messages = 'messages' in result && Array.isArray(result.messages)
        ? result.messages.filter((msg) => msg instanceof telegram_1.Api.Message)
        : [];
    return messages.map((msg) => {
        let media = null;
        if (msg.media && !(msg.media instanceof telegram_1.Api.MessageMediaEmpty)) {
            const mediaType = (0, helpers_1.getMediaType)(msg.media);
            const meta = (0, helpers_1.extractMediaMetaFromMessage)(msg, chatId, mediaType);
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
            scheduledDate: (0, helpers_1.toISODate)(msg.date),
            media,
            chatId,
        };
    });
}
async function sendMediaAlbum(ctx, album) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const results = [];
    const errors = [];
    for (let i = 0; i < album.media.length; i++) {
        const item = album.media[i];
        try {
            const buffer = await (0, helpers_1.downloadFileFromUrl)(item.url);
            const uploadedFile = await ctx.client.uploadFile({
                file: new uploads_1.CustomFile(item.filename || `media_${i}`, buffer.length, item.filename || `media_${i}`, buffer),
                workers: 1,
            });
            const media = new telegram_1.Api.InputSingleMedia({
                media: item.type === 'photo'
                    ? new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile })
                    : new telegram_1.Api.InputMediaUploadedDocument({
                        file: uploadedFile,
                        mimeType: item.type === 'video' ? 'video/mp4' : (0, helpers_1.detectContentType)(item.filename || `media_${i}`),
                        attributes: item.type === 'video' ? [
                            new telegram_1.Api.DocumentAttributeVideo({
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
        }
        catch (error) {
            ctx.logger.error(ctx.phoneNumber, `Error processing album item ${i}:`, error);
            errors.push({ index: i, error: error.message || 'Unknown error' });
        }
    }
    if (results.length === 0) {
        throw new Error('No media items could be processed. All items failed.');
    }
    await ctx.client.invoke(new telegram_1.Api.messages.SendMultiMedia({
        peer: album.chatId,
        multiMedia: results,
    }));
    return {
        success: results.length,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
    };
}
async function sendVoiceMessage(ctx, voice) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    try {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(voice.url);
        return await ctx.client.invoke(new telegram_1.Api.messages.SendMedia({
            peer: voice.chatId,
            media: new telegram_1.Api.InputMediaUploadedDocument({
                file: await ctx.client.uploadFile({
                    file: new uploads_1.CustomFile('voice.ogg', buffer.length, 'voice.ogg', buffer),
                    workers: 1,
                }),
                mimeType: 'audio/ogg',
                attributes: [
                    new telegram_1.Api.DocumentAttributeAudio({
                        voice: true,
                        duration: voice.duration || 0,
                    }),
                ],
            }),
            message: voice.caption || '',
            randomId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000000)),
        }));
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending voice message:', error);
        throw error;
    }
}
async function cleanupChat(ctx, cleanup) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    cleanup.revoke = cleanup.revoke !== undefined ? cleanup.revoke : true;
    const messages = await ctx.client.getMessages(cleanup.chatId, {
        limit: 1000,
        ...(cleanup.beforeDate && {
            offsetDate: Math.floor(cleanup.beforeDate.getTime() / 1000),
        }),
    });
    const toDelete = messages.filter(msg => {
        if (cleanup.excludePinned && msg.pinned)
            return false;
        if (cleanup.onlyMedia && !msg.media)
            return false;
        return true;
    });
    if (toDelete.length > 0) {
        await ctx.client.deleteMessages(cleanup.chatId, toDelete.map(m => m.id), {
            revoke: cleanup.revoke,
        });
    }
    return { deletedCount: toDelete.length };
}
async function editMessage(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    if (options.media) {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(options.media.url);
        const file = new uploads_1.CustomFile(`media.${(0, helpers_1.getMediaExtension)(options.media.type)}`, buffer.length, 'media', buffer);
        const uploadedFile = await ctx.client.uploadFile({ file, workers: 1 });
        const inputMedia = options.media.type === 'photo'
            ? new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile })
            : new telegram_1.Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: (0, helpers_1.getMimeType)(options.media.type),
                attributes: (0, helpers_1.getMediaAttributes)(options.media),
            });
        return ctx.client.invoke(new telegram_1.Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            media: inputMedia,
            message: options.text || '',
        }));
    }
    if (options.text) {
        return ctx.client.invoke(new telegram_1.Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            message: options.text,
        }));
    }
    throw new Error('Either text or media must be provided');
}
async function sendMediaBatch(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const mediaFiles = await Promise.all(options.media.map(async (item) => {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(item.url);
        const file = new uploads_1.CustomFile(item.fileName || `media.${(0, helpers_1.getMediaExtension)(item.type)}`, buffer.length, 'media', buffer);
        const uploadedFile = await ctx.client.uploadFile({ file, workers: 1 });
        const inputMedia = item.type === 'photo'
            ? new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile })
            : new telegram_1.Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: (0, helpers_1.getMimeType)(item.type),
                attributes: (0, helpers_1.getMediaAttributes)(item),
            });
        return new telegram_1.Api.InputSingleMedia({
            media: inputMedia,
            message: item.caption || '',
            entities: [],
        });
    }));
    return ctx.client.invoke(new telegram_1.Api.messages.SendMultiMedia({
        peer: options.chatId,
        multiMedia: mediaFiles,
        silent: options.silent,
        scheduleDate: options.scheduleDate,
    }));
}
async function sendViewOnceMedia(ctx, chatId, buffer, caption = '', isVideo, filename) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const actualFilename = filename || `viewonce_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`;
        const mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
        const inputFile = await ctx.client.uploadFile({
            file: new uploads_1.CustomFile(actualFilename, buffer.length, actualFilename, buffer),
            workers: 1,
        });
        const result = await ctx.client.invoke(new telegram_1.Api.messages.SendMedia({
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
                            h: 0,
                        }),
                    ],
                    ttlSeconds: 10,
                })
                : new telegram_1.Api.InputMediaUploadedPhoto({
                    file: inputFile,
                    ttlSeconds: 10,
                }),
            message: caption,
            randomId: (0, big_integer_1.default)(Math.floor(Math.random() * 1000000000)),
        }));
        ctx.logger.info(ctx.phoneNumber, `Sent view-once ${isVideo ? 'video' : 'photo'} to chat ${chatId}`);
        return result;
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending view-once media:', error);
        throw error;
    }
}
async function sendPhotoChat(ctx, id, url, caption, filename) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(url);
        const file = new uploads_1.CustomFile(filename, buffer.length, filename, buffer);
        await ctx.client.sendFile(id, { file, caption });
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending photo:', error);
        throw error;
    }
}
async function sendFileChat(ctx, id, url, caption, filename) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(url);
        const file = new uploads_1.CustomFile(filename, buffer.length, filename, buffer);
        await ctx.client.sendFile(id, { file, caption });
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error sending file:', error);
        throw error;
    }
}
async function deleteChat(ctx, params) {
    try {
        await ctx.client.invoke(new telegram_1.Api.messages.DeleteHistory(params));
        ctx.logger.info(ctx.phoneNumber, `Dialog with ID ${params.peer} has been deleted.`);
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Failed to delete dialog:', error);
    }
}
//# sourceMappingURL=message-operations.js.map