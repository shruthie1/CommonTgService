"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeGetEntityById = safeGetEntityById;
exports.getMe = getMe;
exports.getchatId = getchatId;
exports.getEntity = getEntity;
exports.getMessages = getMessages;
exports.getDialogs = getDialogs;
exports.getAllChats = getAllChats;
exports.getMessagesNew = getMessagesNew;
exports.getSelfMSgsInfo = getSelfMSgsInfo;
exports.getCallLog = getCallLog;
exports.getCallLogsInternal = getCallLogsInternal;
exports.getChatStatistics = getChatStatistics;
exports.getMessageStats = getMessageStats;
exports.getChats = getChats;
exports.updateChatSettings = updateChatSettings;
exports.createChatFolder = createChatFolder;
exports.getChatFolders = getChatFolders;
exports.getTopPrivateChats = getTopPrivateChats;
exports.createBot = createBot;
const telegram_1 = require("telegram");
const big_integer_1 = __importDefault(require("big-integer"));
const utils_1 = require("../../../utils");
const helpers_1 = require("./helpers");
const media_operations_1 = require("./media-operations");
const uploads_1 = require("telegram/client/uploads");
async function safeGetEntityById(ctx, entityId) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    try {
        return await ctx.client.getEntity(entityId);
    }
    catch (error) {
        ctx.logger.info(ctx.phoneNumber, `Failed to get entity directly for ${entityId}, searching in dialogs...`);
        try {
            for await (const dialog of ctx.client.iterDialogs({})) {
                const entity = dialog.entity;
                const dialogId = entity.id.toString();
                if (dialogId === entityId.toString())
                    return entity;
                if (dialogId.startsWith('-100')) {
                    if (dialogId.substring(4) === entityId.toString())
                        return entity;
                }
                else {
                    if (`-100${dialogId}` === entityId.toString())
                        return entity;
                }
            }
            ctx.logger.info(ctx.phoneNumber, `Entity ${entityId} not found in dialogs either`);
            return null;
        }
        catch (dialogError) {
            ctx.logger.error(ctx.phoneNumber, 'Error while searching dialogs:', dialogError);
            return null;
        }
    }
}
async function getMe(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        return await ctx.client.getMe();
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error getting user info:', error);
        throw error;
    }
}
async function getchatId(ctx, username) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    return await ctx.client.getInputEntity(username);
}
async function getEntity(ctx, entity) {
    return await ctx.client?.getEntity(entity);
}
async function getMessages(ctx, entityLike, limit = 8) {
    return await ctx.client.getMessages(entityLike, { limit });
}
async function getDialogs(ctx, params) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const chats = [];
        let total = 0;
        for await (const dialog of ctx.client.iterDialogs(params)) {
            chats.push(dialog);
            total++;
        }
        ctx.logger.info(ctx.phoneNumber, 'TotalChats:', total);
        return Object.assign(chats, { total });
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error getting dialogs:', error);
        throw error;
    }
}
async function getAllChats(ctx) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    const chatData = [];
    let total = 0;
    for await (const chat of ctx.client.iterDialogs({ limit: 500 })) {
        const chatEntity = chat.entity.toJSON();
        chatData.push(chatEntity);
        total++;
    }
    ctx.logger.info(ctx.phoneNumber, 'TotalChats:', total);
    return chatData;
}
async function getMessagesNew(ctx, chatId, offset = 0, limit = 20) {
    const messages = await ctx.client.getMessages(chatId, { offsetId: offset, limit });
    const senderIds = new Set();
    for (const msg of messages) {
        const sid = msg.senderId?.toString();
        if (sid)
            senderIds.add(sid);
    }
    const entityCache = new Map();
    await Promise.all(Array.from(senderIds).map(async (sid) => {
        try {
            const entity = await safeGetEntityById(ctx, sid);
            entityCache.set(sid, entity);
        }
        catch {
            entityCache.set(sid, null);
        }
    }));
    return await Promise.all(messages.map(async (message) => {
        const senderId = message.senderId?.toString() || '';
        const senderEntity = entityCache.get(senderId) || null;
        let media = null;
        if (message.media && !(message.media instanceof telegram_1.Api.MessageMediaEmpty)) {
            const thumbBuffer = await (0, media_operations_1.getThumbnailBuffer)(ctx, message);
            media = (0, helpers_1.extractMediaInfo)(message, thumbBuffer);
        }
        let forwardedFrom = null;
        if (message.fwdFrom) {
            const fwdId = message.fwdFrom.fromId;
            if (fwdId instanceof telegram_1.Api.PeerUser) {
                const fwdEntity = entityCache.get(fwdId.userId.toString());
                if (fwdEntity instanceof telegram_1.Api.User) {
                    forwardedFrom = `${fwdEntity.firstName || ''} ${fwdEntity.lastName || ''}`.trim() || fwdId.userId.toString();
                }
                else {
                    forwardedFrom = fwdId.userId.toString();
                }
            }
            else if (fwdId instanceof telegram_1.Api.PeerChannel) {
                forwardedFrom = fwdId.channelId.toString();
            }
            else if (message.fwdFrom.fromName) {
                forwardedFrom = message.fwdFrom.fromName;
            }
        }
        return {
            id: message.id,
            text: message.message || '',
            date: (0, helpers_1.toISODate)(message.date),
            sender: (0, helpers_1.resolveEntityToSenderInfo)(senderEntity, senderId, message.out),
            media,
            isEdited: !!message.editDate,
            editDate: message.editDate ? (0, helpers_1.toISODate)(message.editDate) : null,
            isPinned: !!message.pinned,
            isForwarded: !!message.fwdFrom,
            forwardedFrom,
            replyToMessageId: message.replyTo?.replyToMsgId || null,
            groupedId: message.groupedId ? message.groupedId.toString() : null,
        };
    }));
}
async function getSelfMSgsInfo(ctx, limit = 500) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const maxLimit = Math.min(Math.max(limit, 1), 10000);
        const movieKeywords = ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'];
        const [photosList, videosList, photosByUsList, videosByUsList, totalBatch, movieScan] = await Promise.all([
            ctx.client.getMessages('me', { filter: new telegram_1.Api.InputMessagesFilterPhotos(), limit: 1 }).catch(() => []),
            ctx.client.getMessages('me', { filter: new telegram_1.Api.InputMessagesFilterVideo(), limit: 1 }).catch(() => []),
            ctx.client.getMessages('me', { filter: new telegram_1.Api.InputMessagesFilterPhotos(), limit: 1, fromUser: 'me' }).catch(() => []),
            ctx.client.getMessages('me', { filter: new telegram_1.Api.InputMessagesFilterVideo(), limit: 1, fromUser: 'me' }).catch(() => []),
            ctx.client.getMessages('me', { limit: 1 }).catch(() => []),
            (async () => {
                let analyzedMessages = 0;
                let movieCount = 0;
                for await (const message of ctx.client.iterMessages('me', { limit: maxLimit, reverse: false })) {
                    analyzedMessages++;
                    if (message?.text && (0, utils_1.contains)(message.text.toLowerCase(), movieKeywords))
                        movieCount++;
                }
                return { analyzedMessages, movieCount };
            })(),
        ]);
        const photoCount = photosList?.total ?? 0;
        const videoCount = videosList?.total ?? 0;
        const ownPhotoCount = photosByUsList?.total ?? 0;
        const ownVideoCount = videosByUsList?.total ?? 0;
        let totalMessages = movieScan.analyzedMessages;
        const totalFromBatch = totalBatch?.total;
        if (totalFromBatch != null)
            totalMessages = totalFromBatch;
        ctx.logger.info(ctx.phoneNumber, `getSelfMSgsInfo: Analyzed ${movieScan.analyzedMessages} messages`, {
            photoCount, videoCount, movieCount: movieScan.movieCount, total: totalMessages,
        });
        return {
            total: totalMessages, photoCount, videoCount,
            movieCount: movieScan.movieCount, ownPhotoCount,
            otherPhotoCount: Math.max(0, photoCount - ownPhotoCount),
            ownVideoCount,
            otherVideoCount: Math.max(0, videoCount - ownVideoCount),
            analyzedMessages: movieScan.analyzedMessages,
        };
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error in getSelfMSgsInfo:', error);
        throw error;
    }
}
async function getCallLog(ctx, limit = 1000) {
    if (!ctx.client)
        throw new Error('Client is not initialized');
    try {
        const maxLimit = Math.min(Math.max(limit, 1), 10000);
        const chunkSize = 100;
        const callLogs = [];
        let offsetId = 0;
        while (callLogs.length < maxLimit) {
            const result = await ctx.client.invoke(new telegram_1.Api.messages.Search({
                peer: new telegram_1.Api.InputPeerEmpty(), q: '',
                filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({ missed: false }),
                minDate: 0, maxDate: 0, offsetId, addOffset: 0,
                limit: chunkSize, maxId: 0, minId: 0, hash: (0, big_integer_1.default)(0),
            }));
            const messages = result.messages || [];
            for (const m of messages) {
                if (m instanceof telegram_1.Api.Message && m.action instanceof telegram_1.Api.MessageActionPhoneCall) {
                    callLogs.push(m);
                    if (callLogs.length >= maxLimit)
                        break;
                }
            }
            if (messages.length < chunkSize)
                break;
            offsetId = messages[messages.length - 1]?.id ?? 0;
        }
        const filteredResults = { outgoing: 0, incoming: 0, video: 0, audio: 0, totalCalls: 0 };
        const rawChatStats = {};
        for (const log of callLogs) {
            const logAction = log.action;
            filteredResults.totalCalls++;
            if (log.out)
                filteredResults.outgoing++;
            else
                filteredResults.incoming++;
            if (logAction.video)
                filteredResults.video++;
            else
                filteredResults.audio++;
            let chatId;
            let peerType = 'user';
            if (log.peerId instanceof telegram_1.Api.PeerUser) {
                chatId = log.peerId.userId.toString();
                peerType = 'user';
            }
            else if (log.peerId instanceof telegram_1.Api.PeerChat) {
                chatId = log.peerId.chatId.toString();
                peerType = 'group';
            }
            else if (log.peerId instanceof telegram_1.Api.PeerChannel) {
                chatId = log.peerId.channelId.toString();
                peerType = 'channel';
            }
            else
                continue;
            if (!rawChatStats[chatId])
                rawChatStats[chatId] = { count: 0, peerType };
            rawChatStats[chatId].count++;
        }
        const uniqueChatIds = Object.keys(rawChatStats);
        const entityCache = new Map();
        await Promise.all(uniqueChatIds.map(async (chatId) => {
            const peerType = rawChatStats[chatId].peerType;
            try {
                const entity = await safeGetEntityById(ctx, chatId);
                if (entity instanceof telegram_1.Api.User) {
                    entityCache.set(chatId, { phone: entity.phone, username: entity.username, name: `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown', peerType: 'user' });
                }
                else if (entity instanceof telegram_1.Api.Chat) {
                    entityCache.set(chatId, { name: entity.title || 'Unknown Group', peerType: 'group' });
                }
                else if (entity instanceof telegram_1.Api.Channel) {
                    entityCache.set(chatId, { username: entity.username, name: entity.title || 'Unknown Channel', peerType: 'channel' });
                }
                else {
                    entityCache.set(chatId, { name: 'Unknown', peerType });
                }
            }
            catch (e) {
                ctx.logger.warn(ctx.phoneNumber, `Failed to get entity for chatId ${chatId}:`, e);
                entityCache.set(chatId, { name: 'Unknown', peerType });
            }
        }));
        const chatCallCountsWithDetails = {};
        for (const chatId of uniqueChatIds) {
            const cached = entityCache.get(chatId);
            chatCallCountsWithDetails[chatId] = { ...cached, count: rawChatStats[chatId].count };
        }
        const filteredChatCallCounts = [];
        const chatsWithManyCalls = uniqueChatIds.filter(id => rawChatStats[id].count > 4);
        await Promise.all(chatsWithManyCalls.map(async (chatId) => {
            const details = chatCallCountsWithDetails[chatId];
            try {
                const [photosList, videosList, msgCount] = await Promise.all([
                    ctx.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterPhotos(), limit: 1 }).catch(() => []),
                    ctx.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterVideo(), limit: 1 }).catch(() => []),
                    ctx.client.getMessages(chatId, { limit: 3 }).catch(() => ({ total: 0 })),
                ]);
                filteredChatCallCounts.push({
                    chatId, ...details,
                    msgs: msgCount.total,
                    video: videosList?.total ?? 0,
                    photo: photosList?.total ?? 0,
                });
            }
            catch (msgError) {
                ctx.logger.warn(ctx.phoneNumber, `Failed to get messages for chatId ${chatId}:`, msgError);
                filteredChatCallCounts.push({ chatId, ...details });
            }
        }));
        for (const [chatId, details] of Object.entries(chatCallCountsWithDetails)) {
            if (details.count <= 4)
                filteredChatCallCounts.push({ chatId, ...details });
        }
        filteredChatCallCounts.sort((a, b) => b.count - a.count);
        ctx.logger.info(ctx.phoneNumber, 'CallLog completed:', {
            totalCalls: filteredResults.totalCalls, analyzedCalls: filteredResults.totalCalls,
            outgoing: filteredResults.outgoing, incoming: filteredResults.incoming,
            video: filteredResults.video, audio: filteredResults.audio,
            chatCount: filteredChatCallCounts.length,
        });
        return { ...filteredResults, chatCallCounts: filteredChatCallCounts, analyzedCalls: filteredResults.totalCalls };
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error in getCallLog:', error);
        throw error;
    }
}
async function getCallLogsInternal(ctx, maxCalls = 300) {
    const finalResult = {};
    const chunkSize = 100;
    let offsetId = 0;
    let totalFetched = 0;
    while (totalFetched < maxCalls) {
        const result = await ctx.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(), q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({}),
            minDate: 0, maxDate: 0, offsetId, addOffset: 0,
            limit: chunkSize, maxId: 0, minId: 0, hash: (0, big_integer_1.default)(0),
        }));
        const messages = result.messages || [];
        if (messages.length === 0)
            break;
        for (const log of messages) {
            if (!(log instanceof telegram_1.Api.Message) || !(log.action instanceof telegram_1.Api.MessageActionPhoneCall))
                continue;
            if (!log.peerId || !(log.peerId instanceof telegram_1.Api.PeerUser))
                continue;
            const chatId = log.peerId.userId.toString();
            if (!finalResult[chatId])
                finalResult[chatId] = { outgoing: 0, incoming: 0, video: 0, total: 0 };
            const stats = finalResult[chatId];
            stats.total++;
            if (log.out)
                stats.outgoing++;
            else
                stats.incoming++;
            if (log.action.video)
                stats.video++;
        }
        totalFetched += messages.length;
        if (messages.length < chunkSize)
            break;
        offsetId = messages[messages.length - 1].id ?? 0;
    }
    return finalResult;
}
async function getChatStatistics(ctx, chatId, period) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const now = Math.floor(Date.now() / 1000);
    const periodInSeconds = { day: 24 * 60 * 60, week: 7 * 24 * 60 * 60, month: 30 * 24 * 60 * 60 }[period];
    const messages = await ctx.client.getMessages(chatId, { limit: 100, offsetDate: now - periodInSeconds });
    return {
        period,
        totalMessages: messages.length,
        uniqueSenders: new Set(messages.map(m => m.fromId?.toString()).filter(Boolean)).size,
        messageTypes: {
            text: messages.filter(m => !m.media && m.message).length,
            photo: messages.filter(m => m.media && m.media.className === 'MessageMediaPhoto').length,
            video: messages.filter(m => {
                if (!m.media || m.media.className !== 'MessageMediaDocument')
                    return false;
                const doc = m.media.document;
                return doc && 'mimeType' in doc && doc.mimeType?.startsWith('video/');
            }).length,
            voice: messages.filter(m => {
                if (!m.media || m.media.className !== 'MessageMediaDocument')
                    return false;
                const doc = m.media.document;
                return doc && 'mimeType' in doc && doc.mimeType?.startsWith('audio/');
            }).length,
            other: messages.filter(m => m.media && !['MessageMediaPhoto', 'MessageMediaDocument'].includes(m.media.className)).length,
        },
        topSenders: await (async () => {
            const rawSenders = Object.entries(messages.reduce((acc, msg) => {
                const senderId = msg.fromId?.toString();
                if (senderId)
                    acc[senderId] = (acc[senderId] || 0) + 1;
                return acc;
            }, {})).sort(([, a], [, b]) => b - a).slice(0, 10);
            return Promise.all(rawSenders.map(async ([id, count]) => {
                let name = 'Unknown';
                let username = null;
                try {
                    const entity = await safeGetEntityById(ctx, id);
                    if (entity instanceof telegram_1.Api.User) {
                        name = `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown';
                        username = entity.username || null;
                    }
                    else if (entity instanceof telegram_1.Api.Channel) {
                        name = entity.title || 'Unknown';
                        username = entity.username || null;
                    }
                    else if (entity instanceof telegram_1.Api.Chat) {
                        name = entity.title || 'Unknown';
                    }
                }
                catch { }
                return { id, name, username, count };
            }));
        })(),
        mostActiveHours: Object.entries(messages.reduce((acc, msg) => {
            const hour = new Date(msg.date * 1000).getHours();
            acc[hour] = (acc[hour] || 0) + 1;
            return acc;
        }, {})).sort(([, a], [, b]) => b - a).map(([hour, count]) => ({ hour: Number(hour), count })),
    };
}
async function getMessageStats(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
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
    const messages = await ctx.client.getMessages(options.chatId, {
        limit: 100, offsetDate: Math.floor(now.getTime() / 1000),
    });
    const gmt = helpers_1.getMediaType;
    const stats = {
        total: messages.length, withMedia: 0, withLinks: 0, withForwards: 0,
        byHour: new Array(24).fill(0),
        byType: { text: 0, photo: 0, video: 0, document: 0, other: 0 },
    };
    for (const msg of messages) {
        const hour = new Date(msg.date * 1000).getHours();
        stats.byHour[hour]++;
        if (msg.media) {
            stats.withMedia++;
            const mediaType = gmt(msg.media);
            stats.byType[mediaType] = (stats.byType[mediaType] || 0) + 1;
        }
        else if (msg.message) {
            if (msg.message.match(/https?:\/\/[^\s]+/))
                stats.withLinks++;
            stats.byType.text++;
        }
        if (msg.fwdFrom)
            stats.withForwards++;
    }
    return stats;
}
async function getChats(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const dialogs = [];
    const limit = options.limit || 100;
    const includePhotos = options.includePhotos || false;
    let count = 0;
    for await (const dialog of ctx.client.iterDialogs({ ...options, limit })) {
        dialogs.push(dialog);
        count++;
        if (count >= limit)
            break;
    }
    return Promise.all(dialogs.map(async (dialog) => {
        const entity = dialog.entity;
        const type = entity instanceof telegram_1.Api.User ? 'user' :
            entity instanceof telegram_1.Api.Chat ? 'group' :
                entity instanceof telegram_1.Api.Channel ? 'channel' : 'unknown';
        let senderName = null;
        if (dialog.message?.senderId) {
            try {
                const senderEntity = await safeGetEntityById(ctx, dialog.message.senderId.toString());
                if (senderEntity instanceof telegram_1.Api.User) {
                    senderName = `${senderEntity.firstName || ''} ${senderEntity.lastName || ''}`.trim() || null;
                }
                else if (senderEntity instanceof telegram_1.Api.Channel) {
                    senderName = senderEntity.title || null;
                }
            }
            catch { }
        }
        let onlineStatus = null;
        let lastSeen = null;
        if (entity instanceof telegram_1.Api.User) {
            const status = (0, helpers_1.getUserOnlineStatus)(entity);
            onlineStatus = status.status;
            lastSeen = status.lastSeen;
        }
        const muteUntil = dialog.dialog?.notifySettings?.muteUntil;
        const isMuted = muteUntil ? muteUntil > Math.floor(Date.now() / 1000) : false;
        let participantCount = null;
        if (entity instanceof telegram_1.Api.Chat) {
            participantCount = entity.participantsCount ?? null;
        }
        else if (entity instanceof telegram_1.Api.Channel) {
            participantCount = entity.participantsCount ?? null;
        }
        let photoBase64 = null;
        if (includePhotos && 'photo' in entity && entity.photo && !(entity.photo instanceof telegram_1.Api.ChatPhotoEmpty)) {
            try {
                const photoResult = await ctx.client.downloadProfilePhoto(entity, { isBig: false });
                if (photoResult && Buffer.isBuffer(photoResult) && photoResult.length > 0) {
                    photoBase64 = (0, helpers_1.bufferToBase64DataUrl)(photoResult);
                }
            }
            catch { }
        }
        return {
            id: entity.id.toString(),
            title: 'title' in entity ? entity.title : null,
            username: 'username' in entity ? entity.username : null,
            type,
            unreadCount: dialog.unreadCount,
            lastMessage: dialog.message ? {
                id: dialog.message.id,
                text: dialog.message.message,
                date: (0, helpers_1.toISODate)(dialog.message.date),
                senderName,
            } : null,
            photoBase64,
            onlineStatus,
            lastSeen,
            isMuted,
            participantCount,
        };
    }));
}
async function updateChatSettings(ctx, settings) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const chat = await ctx.client.getEntity(settings.chatId);
    const updates = [];
    if (settings.title) {
        updates.push(ctx.client.invoke(new telegram_1.Api.channels.EditTitle({ channel: chat, title: settings.title })));
    }
    if (settings.about) {
        updates.push(ctx.client.invoke(new telegram_1.Api.messages.EditChatAbout({ peer: chat, about: settings.about })));
    }
    if (settings.photo) {
        const buffer = await (0, helpers_1.downloadFileFromUrl)(settings.photo);
        const file = await ctx.client.uploadFile({
            file: new uploads_1.CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer), workers: 1,
        });
        updates.push(ctx.client.invoke(new telegram_1.Api.channels.EditPhoto({
            channel: chat, photo: new telegram_1.Api.InputChatUploadedPhoto({ file }),
        })));
    }
    if (settings.slowMode !== undefined) {
        updates.push(ctx.client.invoke(new telegram_1.Api.channels.ToggleSlowMode({ channel: chat, seconds: settings.slowMode })));
    }
    if (settings.linkedChat) {
        const linkedChannel = await ctx.client.getEntity(settings.linkedChat);
        updates.push(ctx.client.invoke(new telegram_1.Api.channels.SetDiscussionGroup({ broadcast: chat, group: linkedChannel })));
    }
    if (settings.username) {
        updates.push(ctx.client.invoke(new telegram_1.Api.channels.UpdateUsername({ channel: chat, username: settings.username })));
    }
    await Promise.all(updates);
    return true;
}
async function createChatFolder(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const folder = new telegram_1.Api.DialogFilter({
        id: Math.floor(Math.random() * 1000),
        title: new telegram_1.Api.TextWithEntities({ text: options.name, entities: [] }),
        includePeers: await Promise.all(options.includedChats.map(id => ctx.client.getInputEntity(id))),
        excludePeers: await Promise.all((options.excludedChats || []).map(id => ctx.client.getInputEntity(id))),
        pinnedPeers: [],
        contacts: options.includeContacts ?? true,
        nonContacts: options.includeNonContacts ?? true,
        groups: options.includeGroups ?? true,
        broadcasts: options.includeBroadcasts ?? true,
        bots: options.includeBots ?? true,
        excludeMuted: options.excludeMuted ?? false,
        excludeRead: options.excludeRead ?? false,
        excludeArchived: options.excludeArchived ?? false,
    });
    await ctx.client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({ id: folder.id, filter: folder }));
    return {
        id: folder.id, name: options.name,
        options: {
            includeContacts: folder.contacts, includeNonContacts: folder.nonContacts,
            includeGroups: folder.groups, includeBroadcasts: folder.broadcasts,
            includeBots: folder.bots, excludeMuted: folder.excludeMuted,
            excludeRead: folder.excludeRead, excludeArchived: folder.excludeArchived,
        },
    };
}
async function getChatFolders(ctx) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const filters = await ctx.client.invoke(new telegram_1.Api.messages.GetDialogFilters());
    return (filters.filters || []).map((filter) => ({
        id: filter.id ?? 0,
        title: filter.title ?? '',
        includedChatsCount: Array.isArray(filter.includePeers) ? filter.includePeers.length : 0,
        excludedChatsCount: Array.isArray(filter.excludePeers) ? filter.excludePeers.length : 0,
    }));
}
async function analyzeChatEngagement(ctx, chatId, user, weights, now, dialog, callStats) {
    const lastMessage = await ctx.client.getMessages(chatId, { limit: 1 });
    if ((lastMessage?.total ?? 0) < 10)
        return null;
    const [photosList, videosList, photosByUsList, videosByUsList] = await Promise.all([
        ctx.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterPhotos(), limit: 1 }).catch(() => []),
        ctx.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterVideo(), limit: 1 }).catch(() => []),
        ctx.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterPhotos(), limit: 1, fromUser: 'me' }).catch(() => []),
        ctx.client.getMessages(chatId, { filter: new telegram_1.Api.InputMessagesFilterVideo(), limit: 1, fromUser: 'me' }).catch(() => []),
    ]);
    const totalPhotos = photosList?.total ?? 0;
    const totalVideos = videosList?.total ?? 0;
    const photosByUs = photosByUsList?.total ?? 0;
    const videosByUs = videosByUsList?.total ?? 0;
    const mediaStats = {
        photos: totalPhotos, videos: totalVideos, photosByUs,
        photosByThem: Math.max(0, totalPhotos - photosByUs),
        videosByUs, videosByThem: Math.max(0, totalVideos - videosByUs),
    };
    const lastMessageDate = dialog?.message?.date ? dialog.message.date * 1000 : now;
    const daysSinceLastActivity = (now - lastMessageDate) / (1000 * 60 * 60 * 24);
    const cCalls = callStats ?? { outgoing: 0, incoming: 0, video: 0, total: 0 };
    const baseScore = (cCalls.incoming * weights.incomingCall +
        cCalls.outgoing * weights.outgoingCall +
        cCalls.video * weights.videoCall +
        mediaStats.videos * weights.sharedVideo +
        mediaStats.photos * weights.sharedPhoto);
    const engagementLevel = baseScore > 0 ? 'active' : 'dormant';
    const totalActivity = Math.max(1, baseScore);
    const activityBreakdown = {
        videoCalls: Math.round((cCalls.video * weights.videoCall / totalActivity) * 100),
        audioCalls: Math.round(((cCalls.total - cCalls.video) * (weights.incomingCall || weights.outgoingCall) / totalActivity) * 100),
        mediaSharing: Math.round(((mediaStats.videos * weights.sharedVideo + mediaStats.photos * weights.sharedPhoto) / totalActivity) * 100),
        textMessages: lastMessage.total ?? 0,
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
            outgoing: { total: cCalls.outgoing || 0, audio: cCalls.outgoing || 0, video: 0 },
        },
        media: mediaStats,
        activityBreakdown,
    };
}
async function getTopPrivateChats(ctx, limit = 10) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const clampedLimit = Math.max(1, Math.min(50, limit || 10));
    ctx.logger.info(ctx.phoneNumber, `Starting optimized getTopPrivateChats analysis with limit=${clampedLimit}...`);
    const startTime = Date.now();
    const now = Date.now();
    const weights = {
        videoCall: 2, incomingCall: 4, outgoingCall: 1,
        sharedVideo: 12, sharedPhoto: 10, textMessage: 1, unreadMessages: 1,
    };
    const [me, callLogs, dialogs] = await Promise.all([
        getMe(ctx).catch(() => null),
        getCallLogsInternal(ctx, 300).catch(() => ({})),
        ctx.client.getDialogs({ limit: 350 }),
    ]);
    if (!me)
        throw new Error('Failed to fetch self userInfo');
    const candidateChats = Array.from(dialogs).map(dialog => dialog.isUser ? dialog : null).filter(Boolean);
    let selfChatData = null;
    try {
        const selfChatId = me.id.toString();
        selfChatData = await analyzeChatEngagement(ctx, 'me', me, weights, now, undefined, callLogs[selfChatId]);
        if (selfChatData)
            ctx.logger.info(ctx.phoneNumber, `Self chat processed - Score: ${selfChatData.interactionScore}`);
    }
    catch (e) {
        ctx.logger.warn(ctx.phoneNumber, 'Error processing self chat:', e);
    }
    const topCandidates = candidateChats.slice(0, Math.min(clampedLimit * 4, 49));
    ctx.logger.info(ctx.phoneNumber, `Analyzing top ${topCandidates.length} candidates in depth...`);
    const chatStats = [];
    const batchSize = 10;
    for (let i = 0; i < topCandidates.length; i += batchSize) {
        const batch = topCandidates.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (candidate) => {
            const user = candidate.entity;
            const chatId = user.id.toString();
            try {
                ctx.logger.info(ctx.phoneNumber, `Analyzing (${i + 1} of ${topCandidates.length}) chat ${chatId}...`);
                return await analyzeChatEngagement(ctx, chatId, user, weights, now, candidate, callLogs[chatId]);
            }
            catch (error) {
                ctx.logger.warn(ctx.phoneNumber, `Error analyzing chat ${chatId}:`, error.message);
                return null;
            }
        }));
        chatStats.push(...batchResults.filter((r) => r !== null));
    }
    let topChats = chatStats.sort((a, b) => b.interactionScore - a.interactionScore).slice(0, clampedLimit);
    if (selfChatData) {
        topChats = topChats.filter(chat => chat.chatId !== 'me' && chat.chatId !== me.id.toString());
        topChats.unshift(selfChatData);
        if (topChats.length > clampedLimit)
            topChats = topChats.slice(0, clampedLimit);
    }
    ctx.logger.info(ctx.phoneNumber, `getTopPrivateChats completed in ${Date.now() - startTime}ms. Found ${topChats.length} results.`);
    return topChats;
}
async function createBot(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const botFatherUsername = 'BotFather';
    ctx.logger.info(ctx.phoneNumber, `[BOT CREATION] Starting bot creation process for "${options.name}" (${options.username})`);
    try {
        const entity = await ctx.client.getEntity(botFatherUsername);
        ctx.logger.info(ctx.phoneNumber, '[BOT CREATION] Successfully connected to BotFather');
        await ctx.client.sendMessage(entity, { message: '/newbot' });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await ctx.client.sendMessage(entity, { message: options.name });
        await new Promise(resolve => setTimeout(resolve, 1000));
        let botUsername = options.username;
        if (!/_bot$/.test(botUsername)) {
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            let uniqueSuffix = '';
            for (let i = 0; i < 3; i++)
                uniqueSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
            botUsername = botUsername.replace(/_?bot$/, '') + `_${uniqueSuffix}_bot`;
            ctx.logger.info(ctx.phoneNumber, `[BOT CREATION] Modified username: ${botUsername}`);
        }
        await ctx.client.sendMessage(entity, { message: botUsername });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const messages = await ctx.client.getMessages(entity, { limit: 1 });
        if (!messages || messages.length === 0)
            throw new Error('No response received from BotFather');
        const lastMessage = messages[0].message;
        if (!lastMessage.toLowerCase().includes('use this token'))
            throw new Error(`Bot creation failed: ${lastMessage}`);
        const tokenMatch = lastMessage.match(/(\d+:[A-Za-z0-9_-]+)/);
        if (!tokenMatch)
            throw new Error('Could not extract bot token from BotFather response');
        const botToken = tokenMatch[0];
        if (options.description) {
            await ctx.client.sendMessage(entity, { message: '/setdescription' });
            await new Promise(resolve => setTimeout(resolve, 1000));
            await ctx.client.sendMessage(entity, { message: `@${options.username}` });
            await new Promise(resolve => setTimeout(resolve, 1000));
            await ctx.client.sendMessage(entity, { message: options.description });
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (options.aboutText) {
            await ctx.client.sendMessage(entity, { message: '/setabouttext' });
            await new Promise(resolve => setTimeout(resolve, 1000));
            await ctx.client.sendMessage(entity, { message: `@${options.username}` });
            await new Promise(resolve => setTimeout(resolve, 1000));
            await ctx.client.sendMessage(entity, { message: options.aboutText });
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (options.profilePhotoUrl) {
            try {
                const photoBuffer = await (0, helpers_1.downloadFileFromUrl)(options.profilePhotoUrl);
                await ctx.client.sendMessage(entity, { message: '/setuserpic' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                await ctx.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                await ctx.client.sendFile(entity, { file: Buffer.from(photoBuffer), caption: '', forceDocument: false });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (photoError) {
                ctx.logger.error(ctx.phoneNumber, `[BOT CREATION] Failed to set profile photo: ${photoError.message}`, {});
            }
        }
        ctx.logger.info(ctx.phoneNumber, `[BOT CREATION] Bot creation completed successfully: @${options.username}`);
        return { botToken, username: botUsername };
    }
    catch (error) {
        ctx.logger.error(ctx.phoneNumber, `[BOT CREATION] Error: ${error.message}`, error);
        throw new Error(`Failed to create bot: ${error.message}`);
    }
}
//# sourceMappingURL=chat-operations.js.map