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
exports.getAllChats = getAllChats;
exports.getMessagesNew = getMessagesNew;
exports.getSelfMSgsInfo = getSelfMSgsInfo;
exports.getChatStatistics = getChatStatistics;
exports.getMessageStats = getMessageStats;
exports.getChatMediaCounts = getChatMediaCounts;
exports.getCallLogStats = getCallLogStats;
exports.getCallLog = getCallLog;
exports.getChatCallHistory = getChatCallHistory;
exports.getChats = getChats;
exports.updateChatSettings = updateChatSettings;
exports.createChatFolder = createChatFolder;
exports.getChatFolders = getChatFolders;
exports.getTopPrivateChats = getTopPrivateChats;
exports.createBot = createBot;
const telegram_1 = require("telegram");
const Helpers_1 = require("telegram/Helpers");
const utils_1 = require("../../../utils");
const helpers_1 = require("./helpers");
const media_operations_1 = require("./media-operations");
const uploads_1 = require("telegram/client/uploads");
const big_integer_1 = __importDefault(require("big-integer"));
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
async function getMessages(ctx, entityLike, limit = 8, offsetId = 0) {
    const fetchLimit = limit + 1;
    const messages = await ctx.client.getMessages(entityLike, { limit: fetchLimit, offsetId });
    const hasMore = messages.length > limit;
    const slicedMessages = hasMore ? messages.slice(0, limit) : messages;
    const senderIds = new Set();
    for (const msg of slicedMessages) {
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
    const messageList = await Promise.all(slicedMessages.map(async (message) => {
        const senderId = message.senderId?.toString() || '';
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
        const msgDate = message.date ?? 0;
        return {
            id: message.id,
            text: message.message || '',
            date: (0, helpers_1.toISODate)(msgDate),
            time: (0, helpers_1.toTimeString)(msgDate),
            dateUnix: msgDate,
            senderId,
            media,
            isEdited: !!message.editDate,
            editDate: message.editDate ? (0, helpers_1.toISODate)(message.editDate) : null,
            isPinned: !!message.pinned,
            isForwarded: !!message.fwdFrom,
            forwardedFrom,
            replyToMessageId: message.replyTo?.replyToMsgId ?? null,
            groupedId: message.groupedId ? message.groupedId.toString() : null,
            views: message.views ?? null,
            forwards: message.forwards ?? null,
            reactions: message.reactions ? formatReactions(message.reactions) : null,
        };
    }));
    const lastMessage = slicedMessages[slicedMessages.length - 1];
    const nextOffsetId = lastMessage ? lastMessage.id : 0;
    return {
        messages: messageList,
        pagination: {
            hasMore,
            nextOffsetId,
            total: messageList.length,
        },
    };
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
function formatReactions(reactions) {
    if (!reactions?.results?.length)
        return [];
    return reactions.results.map((r) => {
        let reaction = '';
        if (r.reaction instanceof telegram_1.Api.ReactionEmoji)
            reaction = r.reaction.emoticon ?? '';
        else if (r.reaction instanceof telegram_1.Api.ReactionCustomEmoji)
            reaction = `documentId:${r.reaction.documentId}`;
        else if (r.reaction && typeof r.reaction.emoticon === 'string')
            reaction = r.reaction.emoticon;
        return { reaction, count: r.count ?? 0 };
    }).filter(x => (x.count ?? 0) > 0);
}
async function getMessagesNew(ctx, chatId, offset = 0, limit = 20) {
    const fetchLimit = limit + 1;
    const messages = await ctx.client.getMessages(chatId, { offsetId: offset, limit: fetchLimit });
    const hasMore = messages.length > limit;
    const slicedMessages = hasMore ? messages.slice(0, limit) : messages;
    const senderIds = new Set();
    for (const msg of slicedMessages) {
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
    const messageList = await Promise.all(slicedMessages.map(async (message) => {
        const senderId = message.senderId?.toString() || '';
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
        const msgDate = message.date ?? 0;
        return {
            id: message.id,
            text: message.message || '',
            date: (0, helpers_1.toISODate)(msgDate),
            time: (0, helpers_1.toTimeString)(msgDate),
            dateUnix: msgDate,
            senderId,
            media,
            isEdited: !!message.editDate,
            editDate: message.editDate ? (0, helpers_1.toISODate)(message.editDate) : null,
            isPinned: !!message.pinned,
            isForwarded: !!message.fwdFrom,
            forwardedFrom,
            replyToMessageId: message.replyTo?.replyToMsgId ?? null,
            groupedId: message.groupedId ? message.groupedId.toString() : null,
            views: message.views ?? null,
            forwards: message.forwards ?? null,
            reactions: message.reactions ? formatReactions(message.reactions) : null,
        };
    }));
    const lastMessage = slicedMessages[slicedMessages.length - 1];
    const nextOffsetId = lastMessage ? lastMessage.id : 0;
    return {
        messages: messageList,
        pagination: {
            hasMore,
            nextOffsetId,
            total: messageList.length,
        },
    };
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
async function getChatMediaCounts(ctx, chatId) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    let inputPeer;
    try {
        inputPeer = await ctx.client.getInputEntity(chatId);
    }
    catch {
        const entity = await safeGetEntityById(ctx, chatId);
        if (!entity)
            throw new Error(`Could not resolve entity for chatId: ${chatId}`);
        if (entity instanceof telegram_1.Api.User) {
            inputPeer = new telegram_1.Api.InputPeerUser({ userId: entity.id, accessHash: entity.accessHash ?? (0, big_integer_1.default)(0) });
        }
        else if (entity instanceof telegram_1.Api.Channel) {
            inputPeer = new telegram_1.Api.InputPeerChannel({ channelId: entity.id, accessHash: entity.accessHash ?? (0, big_integer_1.default)(0) });
        }
        else if (entity instanceof telegram_1.Api.Chat) {
            inputPeer = new telegram_1.Api.InputPeerChat({ chatId: entity.id });
        }
        else {
            throw new Error(`Unsupported entity type for chatId: ${chatId}`);
        }
    }
    const searchCount = (filter) => ctx.client.invoke(new telegram_1.Api.messages.Search({
        peer: inputPeer,
        q: '',
        filter,
        minDate: 0,
        maxDate: 0,
        offsetId: 0,
        addOffset: 0,
        limit: 1,
        maxId: 0,
        minId: 0,
        hash: (0, big_integer_1.default)(0),
    })).then(r => r.count ?? 0).catch(() => 0);
    const [photo, video, roundVideo, document, voice, gif, audio, link, totalMessages] = await Promise.all([
        searchCount(new telegram_1.Api.InputMessagesFilterPhotos()),
        searchCount(new telegram_1.Api.InputMessagesFilterVideo()),
        searchCount(new telegram_1.Api.InputMessagesFilterRoundVideo()),
        searchCount(new telegram_1.Api.InputMessagesFilterDocument()),
        searchCount(new telegram_1.Api.InputMessagesFilterVoice()),
        searchCount(new telegram_1.Api.InputMessagesFilterGif()),
        searchCount(new telegram_1.Api.InputMessagesFilterMusic()),
        searchCount(new telegram_1.Api.InputMessagesFilterUrl()),
        ctx.client.invoke(new telegram_1.Api.messages.GetHistory({
            peer: inputPeer,
            offsetId: 0,
            offsetDate: 0,
            addOffset: 0,
            limit: 1,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        })).then(r => r.count ?? 0).catch(() => 0),
    ]);
    return {
        totalMessages,
        photo, video, roundVideo, document, voice, gif, audio, link,
        totalMedia: photo + video + roundVideo + document + voice + gif + audio,
    };
}
async function getCallLogStats(ctx, maxCalls = 10) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const maxLimit = Math.min(Math.max(maxCalls, 1), 500);
    const allCallsByChat = await getCallLog(ctx, 2000);
    const callStats = [];
    for (const chatId in allCallsByChat) {
        callStats.push({ ...buildCallSummary(allCallsByChat[chatId]), chatId: chatId });
    }
    callStats.sort((a, b) => b.totalCalls - a.totalCalls);
    return { totalCalls: callStats.reduce((acc, curr) => acc + curr.totalCalls, 0), outgoing: callStats.reduce((acc, curr) => acc + curr.outgoing, 0), incoming: callStats.reduce((acc, curr) => acc + curr.incoming, 0), video: callStats.reduce((acc, curr) => acc + curr.videoCalls, 0), audio: callStats.reduce((acc, curr) => acc + curr.audioCalls, 0), chats: callStats.slice(0, maxLimit) };
}
async function getCallLog(ctx, maxCalls = 1000) {
    const callsByChat = {};
    const chunkSize = 200;
    let offsetId = 0;
    let fetched = 0;
    while (fetched < maxCalls) {
        const result = await ctx.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({ missed: false }),
            minDate: 0,
            maxDate: 0,
            offsetId,
            addOffset: 0,
            limit: chunkSize,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const messages = result.messages || [];
        if (messages.length === 0)
            break;
        for (const m of messages) {
            if (!((m instanceof telegram_1.Api.Message || m instanceof telegram_1.Api.MessageService) && m.action instanceof telegram_1.Api.MessageActionPhoneCall))
                continue;
            const action = m.action;
            let peerId = null;
            if (m.peerId instanceof telegram_1.Api.PeerUser)
                peerId = m.peerId.userId.toString();
            else if (m.peerId instanceof telegram_1.Api.PeerChat)
                peerId = m.peerId.chatId.toString();
            else if (m.peerId instanceof telegram_1.Api.PeerChannel)
                peerId = m.peerId.channelId.toString();
            if (!peerId)
                continue;
            let reason = 'unknown';
            if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonMissed)
                reason = 'missed';
            else if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonBusy)
                reason = 'busy';
            else if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonHangup)
                reason = 'hangup';
            else if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonDisconnect)
                reason = 'disconnect';
            else if (action.duration && action.duration > 0)
                reason = 'hangup';
            if (!callsByChat[peerId])
                callsByChat[peerId] = [];
            callsByChat[peerId].push({
                messageId: m.id,
                date: (0, helpers_1.toISODate)(m.date ?? 0),
                durationSeconds: action.duration ?? 0,
                video: !!action.video,
                outgoing: !!m.out,
                reason,
            });
        }
        fetched += messages.length;
        if (messages.length < chunkSize)
            break;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage)
            offsetId = lastMessage.id;
        await (0, Helpers_1.sleep)(200);
    }
    for (const arr of Object.values(callsByChat)) {
        arr.sort((a, b) => b.messageId - a.messageId);
    }
    return callsByChat;
}
function buildCallSummary(calls) {
    let incoming = 0, outgoing = 0, missed = 0, videoCalls = 0, audioCalls = 0;
    let totalDuration = 0, longestCall = 0;
    for (const call of calls) {
        if (call.outgoing)
            outgoing++;
        else
            incoming++;
        if (call.reason === 'missed' || call.reason === 'busy')
            missed++;
        if (call.video)
            videoCalls++;
        else
            audioCalls++;
        totalDuration += call.durationSeconds;
        if (call.durationSeconds > longestCall)
            longestCall = call.durationSeconds;
    }
    const lastCallDate = calls.length > 0 ? calls[0].date : null;
    return {
        totalCalls: calls.length,
        incoming,
        outgoing,
        missed,
        videoCalls,
        audioCalls,
        totalDuration,
        averageDuration: calls.length > 0 ? Math.round(totalDuration / calls.length) : 0,
        longestCall,
        lastCallDate,
    };
}
async function getChatCallHistory(ctx, chatId, limit = 100, includeCalls = false) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const maxLimit = Math.min(Math.max(limit, 1), 500);
    const allCallsByChat = await getCallLog(ctx, 2000);
    const chatCalls = (allCallsByChat[chatId] ?? []).slice(0, maxLimit);
    return {
        ...buildCallSummary(chatCalls),
        ...(includeCalls && { calls: chatCalls }),
    };
}
async function getChats(ctx, options) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const dialogs = [];
    const limit = options.limit || 100;
    const includePhotos = options.includePhotos || false;
    const peerType = options.peerType ?? 'all';
    const folder = options.folderId !== undefined ? options.folderId : (options.archived ? 1 : 0);
    const requestLimit = peerType === 'all' ? limit : Math.min(limit * 3, 100);
    const params = { limit: requestLimit, folder, ignorePinned: options.ignorePinned ?? false };
    if (options.offsetDate != null && options.offsetDate > 0)
        params.offsetDate = options.offsetDate;
    const me = await ctx.client.getMe();
    for await (const dialog of ctx.client.iterDialogs(params)) {
        const entity = dialog.entity;
        const match = peerType === 'all' ||
            (peerType === 'user' && entity instanceof telegram_1.Api.User) ||
            (peerType === 'group' && entity instanceof telegram_1.Api.Chat) ||
            (peerType === 'channel' && entity instanceof telegram_1.Api.Channel);
        if (match)
            dialogs.push(dialog);
        if (dialogs.length >= limit)
            break;
    }
    const last = dialogs[dialogs.length - 1];
    const hasMore = dialogs.length === limit;
    const nextOffsetDate = hasMore && last?.message?.date != null ? last.message.date : undefined;
    const items = await Promise.all(dialogs.map(async (dialog) => {
        const entity = dialog.entity;
        const type = entity instanceof telegram_1.Api.User ? 'user' :
            entity instanceof telegram_1.Api.Chat ? 'group' :
                entity instanceof telegram_1.Api.Channel ? 'channel' : 'unknown';
        let senderName = null;
        if (dialog.message?.senderId) {
            try {
                if (dialog.message.senderId.toString() === me.id.toString()) {
                    senderName = `${me.firstName || ''} ${me.lastName || ''} (Self)`.trim();
                }
                else {
                    if (type === 'user') {
                        const senderEntity = await safeGetEntityById(ctx, dialog.message.senderId.toString());
                        if (senderEntity instanceof telegram_1.Api.User) {
                            senderName = `${senderEntity.firstName || ''} ${senderEntity.lastName || ''}`.trim() || senderEntity.username || null;
                        }
                        else {
                            senderName = "Unknown";
                        }
                    }
                    else {
                        senderName = dialog.title || "Unknown Channel User";
                    }
                }
            }
            catch {
                senderName = "Unknown";
            }
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
            title: entity.id.toString() === me.id.toString() ? `${dialog.title} (Self)` : dialog.title ? dialog.title : 'title' in entity ? entity.title : null,
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
    return { items, hasMore, ...(nextOffsetDate != null && { nextOffsetDate }) };
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
async function fetchMessageMediaForChats(ctx, chatIds, skipMediaCount = false, callData) {
    const result = {};
    let skipped = 0;
    ctx.logger.info(ctx.phoneNumber, `Processing ${chatIds.length} chats, skipMediaCount=${skipMediaCount}`);
    for (let i = 0; i < chatIds.length; i++) {
        const chatId = chatIds[i];
        try {
            const startTime = Date.now();
            const msgResult = await ctx.client.getMessages(chatId, { limit: 1 });
            const totalMessages = msgResult?.total ?? 0;
            ctx.logger.info(ctx.phoneNumber, `(${i}/${chatIds.length}) Messages fetched for ${chatId}, Duration=${Date.now() - startTime}ms`);
            if (totalMessages < 10 && callData.callCountsByChat[chatId]?.totalCalls < 1) {
                ctx.logger.info(ctx.phoneNumber, `Skipping ${chatId} because it has less than 10 messages`);
                result[chatId] = null;
                skipped++;
                continue;
            }
            const lastMsg = msgResult?.[0];
            const lastMessageDate = lastMsg?.date ? (0, helpers_1.toISODate)(lastMsg.date) : null;
            let mediaCount = 0;
            if (!skipMediaCount) {
                const startTime = Date.now();
                const mediaResult = await ctx.client.getMessages(chatId, {
                    filter: new telegram_1.Api.InputMessagesFilterPhotoVideo(),
                    limit: 1,
                });
                mediaCount = mediaResult?.total ?? 0;
                ctx.logger.info(ctx.phoneNumber, `(${i}/${chatIds.length}) Media fetched for ${chatId}, Duration=${Date.now() - startTime}ms`);
                if (mediaCount < 1) {
                    ctx.logger.info(ctx.phoneNumber, `Skipping ${chatId} because it has less than 1 media`);
                    result[chatId] = null;
                    skipped++;
                    continue;
                }
            }
            result[chatId] = { totalMessages, mediaCount, lastMessageDate };
        }
        catch (e) {
            ctx.logger.warn(ctx.phoneNumber, `error for ${chatId}: ${e.message}`);
            result[chatId] = null;
        }
    }
    ctx.logger.info(ctx.phoneNumber, `Done. Fetched=${Object.keys(result).length - skipped}, Skipped=${skipped}`);
    return result;
}
async function fetchCallEntriesGlobal(ctx, maxCalls = 500) {
    const clamped = Math.min(Math.max(maxCalls, 1), 10000);
    const callCountsByChat = {};
    const callEntriesByChat = {};
    const chunkSize = 200;
    let offsetId = 0;
    let fetched = 0;
    while (fetched < clamped) {
        const result = await ctx.client.invoke(new telegram_1.Api.messages.Search({
            peer: new telegram_1.Api.InputPeerEmpty(),
            q: '',
            filter: new telegram_1.Api.InputMessagesFilterPhoneCalls({ missed: false }),
            minDate: 0,
            maxDate: 0,
            offsetId,
            addOffset: 0,
            limit: chunkSize,
            maxId: 0,
            minId: 0,
            hash: (0, big_integer_1.default)(0),
        }));
        const messages = result.messages || [];
        for (const m of messages) {
            if (!((m instanceof telegram_1.Api.Message || m instanceof telegram_1.Api.MessageService) && m.action instanceof telegram_1.Api.MessageActionPhoneCall))
                continue;
            const peerId = m.peerId;
            if (!peerId)
                continue;
            const chatId = 'userId' in peerId ? peerId.userId.toString()
                : 'chatId' in peerId ? peerId.chatId.toString()
                    : 'channelId' in peerId ? peerId.channelId.toString() : null;
            if (!chatId)
                continue;
            const action = m.action;
            if (!callCountsByChat[chatId])
                callCountsByChat[chatId] = { outgoing: 0, incoming: 0, videoCalls: 0, audioCalls: 0, totalCalls: 0, missed: 0, totalDuration: 0, averageDuration: 0, longestCall: 0, lastCallDate: null };
            const stats = callCountsByChat[chatId];
            stats.totalCalls++;
            if (m.out)
                stats.outgoing++;
            else
                stats.incoming++;
            if (action.video)
                stats.videoCalls++;
            let reason = 'unknown';
            if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonMissed)
                reason = 'missed';
            else if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonBusy)
                reason = 'busy';
            else if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonHangup)
                reason = 'hangup';
            else if (action.reason instanceof telegram_1.Api.PhoneCallDiscardReasonDisconnect)
                reason = 'disconnect';
            else if (action.duration && action.duration > 0)
                reason = 'hangup';
            if (!callEntriesByChat[chatId])
                callEntriesByChat[chatId] = [];
            callEntriesByChat[chatId].push({
                messageId: m.id,
                date: (0, helpers_1.toISODate)(m.date ?? 0),
                durationSeconds: action.duration ?? 0,
                video: !!action.video,
                outgoing: !!m.out,
                reason,
            });
        }
        fetched += messages.length;
        if (messages.length < chunkSize)
            break;
        const lastMessage = messages[messages.length - 1];
        if (lastMessage)
            offsetId = lastMessage.id;
        if (fetched >= clamped)
            break;
    }
    ctx.logger.info(ctx.phoneNumber, `fetchCallEntriesGlobal: scanned ${fetched} call messages, found calls in ${Object.keys(callCountsByChat).length} chats`);
    return { callEntriesByChat, callCountsByChat };
}
const nullCalls = {
    totalCalls: 0, incoming: 0, outgoing: 0, missed: 0,
    videoCalls: 0, audioCalls: 0, totalDuration: 0, averageDuration: 0,
    longestCall: 0, lastCallDate: null,
};
function buildTopPrivateChat(user, chatId, stats, weights, mediaCounts, callSummary) {
    const cCalls = stats.callStats;
    const mediaTotal = mediaCounts?.totalMedia ?? stats.mediaCount;
    const baseScore = (stats.totalMessages * weights.textMessage +
        cCalls.incoming * weights.incomingCall +
        cCalls.outgoing * weights.outgoingCall +
        cCalls.videoCalls * weights.videoCall +
        mediaTotal * weights.sharedMedia);
    const isSelf = chatId === 'me';
    const name = isSelf
        ? 'Saved Messages'
        : [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'Deleted Account';
    const media = mediaCounts ?? null;
    const calls = callSummary ? {
        totalCalls: callSummary.totalCalls,
        incoming: callSummary.incoming,
        outgoing: callSummary.outgoing,
        missed: callSummary.missed,
        videoCalls: callSummary.videoCalls,
        audioCalls: callSummary.audioCalls,
        totalDuration: callSummary.totalDuration,
        averageDuration: callSummary.averageDuration,
        longestCall: callSummary.longestCall,
        lastCallDate: callSummary.lastCallDate,
    } : cCalls.totalCalls > 0 ? {
        totalCalls: cCalls.totalCalls,
        incoming: cCalls.incoming,
        outgoing: cCalls.outgoing,
        missed: 0, videoCalls: cCalls.videoCalls,
        audioCalls: cCalls.totalCalls - cCalls.videoCalls,
        totalDuration: 0, averageDuration: 0, longestCall: 0, lastCallDate: null,
    } : { ...nullCalls };
    return {
        chatId: user.id.toString(),
        name,
        username: user.username ?? null,
        phone: user.phone ?? null,
        totalMessages: stats.totalMessages,
        mediaCount: mediaCounts?.totalMedia ?? stats.mediaCount,
        interactionScore: baseScore,
        lastMessageDate: stats.lastMessageDate,
        media,
        calls,
    };
}
async function getTopPrivateChats(ctx, limit = 45, enrichMedia = false, offsetDate) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const globalStart = Date.now();
    let startTime = globalStart;
    const isFirstPage = !offsetDate;
    const clampedLimit = Math.max(1, Math.min(limit, 45));
    ctx.logger.info(ctx.phoneNumber, `getTopPrivateChats: limit=${clampedLimit}, enrichMedia=${enrichMedia}, offsetDate=${offsetDate ?? 'none'}`);
    const weights = {
        videoCall: 10,
        incomingCall: 5,
        outgoingCall: 5,
        sharedMedia: 3,
        textMessage: 1,
    };
    const me = await getMe(ctx).catch(() => null);
    if (!me)
        throw new Error('Failed to fetch self userInfo');
    const selfChatId = me.id.toString();
    ctx.logger.info(ctx.phoneNumber, `selfChatId=${selfChatId}, Duration=${Date.now() - startTime}ms`);
    startTime = Date.now();
    const dialogParams = {
        limit: clampedLimit * 3,
    };
    if (offsetDate)
        dialogParams.offsetDate = offsetDate;
    const candidateChats = [];
    const seenIds = new Set();
    const userEntityMap = new Map();
    let lastDialogDate;
    for await (const d of ctx.client.iterDialogs(dialogParams)) {
        if (!d.isUser || !(d.entity instanceof telegram_1.Api.User))
            continue;
        const user = d.entity;
        if (user.bot)
            continue;
        const id = user.id.toString();
        if (id === selfChatId || seenIds.has(id))
            continue;
        seenIds.add(id);
        candidateChats.push(d);
        userEntityMap.set(id, user);
        if (d.message?.date)
            lastDialogDate = d.message.date;
        if (candidateChats.length >= clampedLimit)
            break;
    }
    ctx.logger.info(ctx.phoneNumber, `iterDialogs=${candidateChats.length}, lastDialogDate=${lastDialogDate}, Duration=${Date.now() - startTime}ms`);
    startTime = Date.now();
    const candidateIds = candidateChats.map(d => d.entity.id.toString());
    let callCountsByChat = {};
    let callEntriesByChat = {};
    const callData = await fetchCallEntriesGlobal(ctx, 500);
    callCountsByChat = callData.callCountsByChat;
    callEntriesByChat = callData.callEntriesByChat;
    ctx.logger.info(ctx.phoneNumber, `Call Counts=${Object.keys(callCountsByChat).length}, Duration=${Date.now() - startTime}ms`);
    startTime = Date.now();
    const chatIdsForMedia = [];
    if (isFirstPage)
        chatIdsForMedia.push(selfChatId);
    chatIdsForMedia.push(...candidateIds);
    ctx.logger.info(ctx.phoneNumber, `chatIdsForMedia=${chatIdsForMedia.length}, total chats=${candidateChats.length}`);
    const messageMediaByChat = await fetchMessageMediaForChats(ctx, chatIdsForMedia, enrichMedia, callData);
    ctx.logger.info(ctx.phoneNumber, `Message Media=${Object.keys(messageMediaByChat).length}, Duration=${Date.now() - startTime}ms`);
    startTime = Date.now();
    const zeroCallStats = { outgoing: 0, incoming: 0, videoCalls: 0, audioCalls: 0, totalCalls: 0, missed: 0, totalDuration: 0, averageDuration: 0, longestCall: 0, lastCallDate: null };
    const scored = [];
    for (const chatId of chatIdsForMedia) {
        const media = messageMediaByChat[chatId];
        if (!media)
            continue;
        const user = chatId === selfChatId ? me : userEntityMap.get(chatId);
        if (!user)
            continue;
        const callStats = callCountsByChat[chatId] ?? zeroCallStats;
        const stats = { ...media, callStats };
        const score = stats.totalMessages * weights.textMessage + callStats.incoming * weights.incomingCall +
            callStats.outgoing * weights.outgoingCall + callStats.videoCalls * weights.videoCall + stats.mediaCount * weights.sharedMedia;
        scored.push({ chatId, user, stats, score });
    }
    scored.sort((a, b) => b.score - a.score);
    ctx.logger.info(ctx.phoneNumber, `Scored=${scored.length}, Duration=${Date.now() - startTime}ms`);
    startTime = Date.now();
    const items = [];
    if (enrichMedia) {
        ctx.logger.info(ctx.phoneNumber, `Enriching ${scored.length} chats with detailed media counts...`);
        const enrichBatchSize = 3;
        for (let i = 0; i < scored.length; i += enrichBatchSize) {
            const batch = scored.slice(i, i + enrichBatchSize);
            await Promise.all(batch.map(async (candidate, idx) => {
                const { chatId, user, stats } = candidate;
                let mediaCounts;
                try {
                    mediaCounts = await getChatMediaCounts(ctx, chatId === selfChatId ? 'me' : chatId);
                }
                catch (e) {
                    ctx.logger.warn(ctx.phoneNumber, `Failed to fetch media counts for ${chatId}: ${e.message}`);
                }
                const callEntries = callEntriesByChat[chatId] ?? [];
                const callSummary = callEntries.length > 0 ? buildCallSummary(callEntries) : undefined;
                items.push(buildTopPrivateChat(user, chatId === selfChatId ? 'me' : chatId, stats, weights, mediaCounts, callSummary));
            }));
        }
    }
    else {
        for (const { chatId, user, stats } of scored) {
            const callEntries = callEntriesByChat[chatId] ?? [];
            const callSummary = callEntries.length > 0 ? buildCallSummary(callEntries) : undefined;
            items.push(buildTopPrivateChat(user, chatId === selfChatId ? 'me' : chatId, stats, weights, undefined, callSummary));
        }
    }
    items.sort((a, b) => b.interactionScore - a.interactionScore);
    const filtered = items.filter(item => item.totalMessages >= 700 || item.mediaCount > 0 || item.calls.totalCalls > 0);
    const hasMore = candidateChats.length >= clampedLimit && !!lastDialogDate;
    const nextOffsetDate = hasMore ? lastDialogDate : undefined;
    ctx.logger.info(ctx.phoneNumber, `getTopPrivateChats completed in ${Date.now() - globalStart}ms. Returning ${filtered.length}/${items.length} items, hasMore=${hasMore}, nextOffsetDate=${nextOffsetDate}`);
    return {
        items: filtered,
        pagination: {
            count: filtered.length,
            hasMore,
            ...(offsetDate && { previousOffsetDate: offsetDate }),
            ...(nextOffsetDate && { nextOffsetDate }),
        },
    };
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