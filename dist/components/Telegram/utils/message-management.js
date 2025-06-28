"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
exports.forwardMessages = forwardMessages;
exports.forwardSecretMessages = forwardSecretMessages;
exports.scheduleMessageSend = scheduleMessageSend;
exports.getScheduledMessages = getScheduledMessages;
exports.sendVoiceMessage = sendVoiceMessage;
exports.sendPhotoChat = sendPhotoChat;
exports.sendFileChat = sendFileChat;
exports.sendMediaAlbum = sendMediaAlbum;
exports.editMessage = editMessage;
exports.searchMessages = searchMessages;
exports.cleanupChat = cleanupChat;
exports.downloadFileFromUrl = downloadFileFromUrl;
exports.getMediaExtension = getMediaExtension;
exports.getMimeType = getMimeType;
exports.getMediaAttributes = getMediaAttributes;
exports.getSearchFilter = getSearchFilter;
exports.getMediaType = getMediaType;
exports.getMediaDetails = getMediaDetails;
const telegram_1 = require("telegram");
const uploads_1 = require("telegram/client/uploads");
const message_search_dto_1 = require("../dto/message-search.dto");
const fetchWithTimeout_1 = require("../../../utils/fetchWithTimeout");
const big_integer_1 = __importDefault(require("big-integer"));
async function sendMessage(client, params) {
    return await client.sendMessage(params.peer, {
        message: params.message,
        parseMode: params.parseMode
    });
}
async function forwardMessages(client, fromChatId, toChatId, messageIds) {
    console.log(`Forwarding ${messageIds.length} messages from ${fromChatId} to ${toChatId}`);
    const fromEntity = await client.getEntity(fromChatId);
    const toEntity = await client.getEntity(toChatId);
    const result = await client.invoke(new telegram_1.Api.messages.ForwardMessages({
        fromPeer: fromEntity,
        toPeer: toEntity,
        id: messageIds,
        randomId: messageIds.map(() => (0, big_integer_1.default)(Math.floor(Math.random() * 0xffffffff))),
        silent: false,
        dropAuthor: false,
        dropMediaCaptions: false,
        noforwards: false
    }));
    console.log(`Successfully forwarded ${messageIds.length} messages`);
    return result;
}
async function forwardSecretMessages(client, fromChatId, toChatId, sleep) {
    let offset = 0;
    const limit = 100;
    let totalMessages = 0;
    let forwardedCount = 0;
    let messages = [];
    do {
        messages = await client.getMessages(fromChatId, { offsetId: offset, limit });
        totalMessages = messages.total;
        const messageIds = messages.map((message) => {
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
                await sleep(5000);
            }
            catch (error) {
                console.error("Error occurred while forwarding messages:", error);
            }
            await sleep(5000);
        }
    } while (messages.length > 0);
    console.log("Left the channel with ID:", toChatId);
}
async function scheduleMessageSend(client, opts) {
    const scheduleTimestamp = Math.floor(opts.scheduledTime.getTime() / 1000);
    if (opts.media) {
        const buffer = await downloadFileFromUrl(opts.media.url);
        const file = new uploads_1.CustomFile(`media.${getMediaExtension(opts.media.type)}`, buffer.length, 'media', buffer);
        const uploadedFile = await client.uploadFile({
            file,
            workers: 1
        });
        const inputMedia = opts.media.type === 'photo' ?
            new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
            new telegram_1.Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: getMimeType(opts.media.type),
                attributes: []
            });
        return client.invoke(new telegram_1.Api.messages.SendMedia({
            peer: opts.chatId,
            media: inputMedia,
            message: opts.message,
            scheduleDate: scheduleTimestamp,
            silent: opts.silent,
            replyTo: opts.replyTo ? new telegram_1.Api.InputReplyToMessage({ replyToMsgId: opts.replyTo }) : undefined
        }));
    }
    return client.invoke(new telegram_1.Api.messages.SendMessage({
        peer: opts.chatId,
        message: opts.message,
        scheduleDate: scheduleTimestamp,
        silent: opts.silent,
        replyTo: opts.replyTo ? new telegram_1.Api.InputReplyToMessage({ replyToMsgId: opts.replyTo }) : undefined
    }));
}
async function getScheduledMessages(client, chatId) {
    const result = await client.invoke(new telegram_1.Api.messages.GetScheduledMessages({
        peer: chatId,
        id: []
    }));
    return result.messages;
}
async function sendVoiceMessage(client, voice) {
    const buffer = await downloadFileFromUrl(voice.url);
    const file = new uploads_1.CustomFile('voice.ogg', buffer.length, 'voice.ogg', buffer);
    const uploadedFile = await client.uploadFile({
        file,
        workers: 1
    });
    const inputMedia = new telegram_1.Api.InputMediaUploadedDocument({
        file: uploadedFile,
        mimeType: 'audio/ogg',
        attributes: [
            new telegram_1.Api.DocumentAttributeAudio({
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
async function sendPhotoChat(client, id, url, caption, filename) {
    try {
        const buffer = await downloadFileFromUrl(url);
        const file = new uploads_1.CustomFile(filename, buffer.length, filename, buffer);
        await client.sendFile(id, {
            file,
            caption,
            forceDocument: false
        });
    }
    catch (error) {
        console.error('Error sending photo:', error);
        throw error;
    }
}
async function sendFileChat(client, id, url, caption, filename) {
    try {
        const buffer = await downloadFileFromUrl(url);
        const file = new uploads_1.CustomFile(filename, buffer.length, filename, buffer);
        await client.sendFile(id, {
            file,
            caption,
            forceDocument: true
        });
    }
    catch (error) {
        console.error('Error sending file:', error);
        throw error;
    }
}
async function sendMediaAlbum(client, album) {
    const mediaFiles = await Promise.all(album.media.map(async (item) => {
        const buffer = await downloadFileFromUrl(item.url);
        const file = new uploads_1.CustomFile(item.fileName || `media.${getMediaExtension(item.type)}`, buffer.length, 'media', buffer);
        const uploadedFile = await client.uploadFile({
            file,
            workers: 1
        });
        const inputMedia = item.type === 'photo' ?
            new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
            new telegram_1.Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: getMimeType(item.type),
                attributes: getMediaAttributes(item)
            });
        return new telegram_1.Api.InputSingleMedia({
            media: inputMedia,
            message: item.caption || '',
            entities: []
        });
    }));
    return client.invoke(new telegram_1.Api.messages.SendMultiMedia({
        peer: album.chatId,
        multiMedia: mediaFiles,
        silent: album.silent,
        scheduleDate: album.scheduleDate
    }));
}
async function editMessage(client, options) {
    if (options.media) {
        const buffer = await downloadFileFromUrl(options.media.url);
        const file = new uploads_1.CustomFile(`media.${getMediaExtension(options.media.type)}`, buffer.length, 'media', buffer);
        const uploadedFile = await client.uploadFile({
            file,
            workers: 1
        });
        const inputMedia = options.media.type === 'photo' ?
            new telegram_1.Api.InputMediaUploadedPhoto({ file: uploadedFile }) :
            new telegram_1.Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: getMimeType(options.media.type),
                attributes: getMediaAttributes(options.media)
            });
        return client.invoke(new telegram_1.Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            media: inputMedia,
            message: options.text || ''
        }));
    }
    if (options.text) {
        return client.invoke(new telegram_1.Api.messages.EditMessage({
            peer: options.chatId,
            id: options.messageId,
            message: options.text
        }));
    }
    throw new Error('Either text or media must be provided');
}
async function searchMessages(client, params) {
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
            hash: (0, big_integer_1.default)(0),
        };
        let messages = [];
        let count = 0;
        console.log("Search Query: ", searchQuery);
        if (chatId) {
            const result = await client.invoke(new telegram_1.Api.messages.Search({
                peer: chatId,
                ...searchQuery
            }));
            messages = result.messages;
            count = result.count;
        }
        else {
            const result = await client.invoke(new telegram_1.Api.messages.SearchGlobal(searchQuery));
            messages = result.messages;
            count = result.count;
        }
        if (types.includes(message_search_dto_1.MessageMediaType.TEXT) && types.length === 1) {
            messages = messages.filter((msg) => !msg.media);
        }
        const processedMessages = await Promise.all(messages.map(async (message) => {
            try {
                if (!message.media)
                    return {
                        messageId: message.id,
                        type: 'text',
                        text: message.message,
                        date: message.date
                    };
                const mediaDetails = await getMediaDetails(client, message.media);
                return {
                    messageId: message.id,
                    type: getMediaType(message.media),
                    caption: message.message || '',
                    date: message.date,
                    mediaDetails,
                };
            }
            catch (error) {
                console.error('Error processing message:', error);
                return null;
            }
        }));
        const filteredMessages = processedMessages.filter(id => id !== null);
        const localResult = {
            messages: filteredMessages,
            total: count ? count : filteredMessages.length
        };
        finalResult[`${type}`] = localResult;
    }
    return finalResult;
}
async function cleanupChat(client, cleanup) {
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
        await client.invoke(new telegram_1.Api.messages.DeleteMessages({
            id: messageIds,
            revoke: cleanup.revoke || false
        }));
    }
}
async function downloadFileFromUrl(url) {
    const response = await (0, fetchWithTimeout_1.fetchWithTimeout)(url, { timeout: 30000 });
    if (response.status !== 200) {
        throw new Error(`Failed to download file: ${response.statusText}`);
    }
    return Buffer.from(response.data);
}
function getMediaExtension(type) {
    switch (type) {
        case 'photo': return 'jpg';
        case 'video': return 'mp4';
        case 'document': return 'pdf';
        default: return 'bin';
    }
}
function getMimeType(type) {
    switch (type) {
        case 'photo': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'document': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}
function getMediaAttributes(item) {
    const attributes = [];
    if (item.fileName) {
        attributes.push(new telegram_1.Api.DocumentAttributeFilename({
            fileName: item.fileName
        }));
    }
    if (item.type === 'video') {
        attributes.push(new telegram_1.Api.DocumentAttributeVideo({
            duration: 0,
            w: 1280,
            h: 720,
            supportsStreaming: true
        }));
    }
    return attributes;
}
function getSearchFilter(filter) {
    switch (filter) {
        case message_search_dto_1.MessageMediaType.PHOTO:
            return new telegram_1.Api.InputMessagesFilterPhotos();
        case message_search_dto_1.MessageMediaType.VIDEO:
            return new telegram_1.Api.InputMessagesFilterVideo();
        case message_search_dto_1.MessageMediaType.DOCUMENT:
            return new telegram_1.Api.InputMessagesFilterDocument();
        case message_search_dto_1.MessageMediaType.VOICE:
            return new telegram_1.Api.InputMessagesFilterVoice();
        case message_search_dto_1.MessageMediaType.ROUND_VIDEO:
            return new telegram_1.Api.InputMessagesFilterRoundVideo();
        case message_search_dto_1.MessageMediaType.ROUND_VOICE:
            return new telegram_1.Api.InputMessagesFilterRoundVoice();
        case message_search_dto_1.MessageMediaType.TEXT:
            return new telegram_1.Api.InputMessagesFilterEmpty();
        default:
            return new telegram_1.Api.InputMessagesFilterEmpty();
    }
}
function getMediaType(media) {
    if (media instanceof telegram_1.Api.MessageMediaPhoto) {
        return 'photo';
    }
    else if (media instanceof telegram_1.Api.MessageMediaDocument) {
        return 'video';
    }
    return 'document';
}
async function getMediaDetails(client, media) {
    if (!media || !media.document)
        return null;
    const doc = media.document;
    return {
        id: doc.id.toString(),
        size: doc.size.toString(),
        mimeType: doc.mimeType,
        fileName: doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename)?.fileName || 'unknown'
    };
}
//# sourceMappingURL=message-management.js.map