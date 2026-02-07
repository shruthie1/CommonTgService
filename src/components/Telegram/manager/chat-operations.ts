import { Api } from 'telegram';
import { TotalList, sleep } from 'telegram/Helpers';
import { EntityLike } from 'telegram/define';
import { contains } from '../../../utils';
import {
    TgContext, ChatListItem, ChatListResult, ChatStatistics, MessageStats, TopPrivateChat,
    PerChatCallStats, CallLogEntry, CallLogChat, CallLogResult, EngagementWeights, SelfMessagesInfo, ChatSettingsUpdate,
    ChatFolderCreateOptions, ChatFolder, MessageItem, TopSenderInfo,
    MediaInfo,
} from './types';
import {
    downloadFileFromUrl, toISODate, toTimeString, resolveEntityToSenderInfo,
    extractMediaInfo, getUserOnlineStatus, bufferToBase64DataUrl,
    getMediaType,
} from './helpers';
import { getThumbnailBuffer } from './media-operations';
import { CustomFile } from 'telegram/client/uploads';
import { Dialog } from 'telegram/tl/custom/dialog';
import bigInt from 'big-integer';

// ---- Entity resolution ----

export async function safeGetEntityById(ctx: TgContext, entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null> {
    if (!ctx.client) throw new Error('Client not initialized');

    try {
        return await ctx.client.getEntity(entityId);
    } catch (error) {
        ctx.logger.info(ctx.phoneNumber, `Failed to get entity directly for ${entityId}, searching in dialogs...`);
        try {
            for await (const dialog of ctx.client.iterDialogs({})) {
                const entity = dialog.entity;
                const dialogId = entity.id.toString();

                if (dialogId === entityId.toString()) return entity;
                if (dialogId.startsWith('-100')) {
                    if (dialogId.substring(4) === entityId.toString()) return entity;
                } else {
                    if (`-100${dialogId}` === entityId.toString()) return entity;
                }
            }
            ctx.logger.info(ctx.phoneNumber, `Entity ${entityId} not found in dialogs either`);
            return null;
        } catch (dialogError) {
            ctx.logger.error(ctx.phoneNumber, 'Error while searching dialogs:', dialogError);
            return null;
        }
    }
}

// ---- Basic getters ----

export async function getMe(ctx: TgContext): Promise<Api.User> {
    if (!ctx.client) throw new Error('Client is not initialized');
    try {
        return <Api.User>await ctx.client.getMe();
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error getting user info:', error);
        throw error;
    }
}

export async function getchatId(ctx: TgContext, username: string): Promise<Api.TypeInputPeer> {
    if (!ctx.client) throw new Error('Client is not initialized');
    return await ctx.client.getInputEntity(username);
}

export async function getEntity(ctx: TgContext, entity: EntityLike): Promise<Api.User | Api.Chat | Api.Channel> {
    return await ctx.client?.getEntity(entity) as Api.User | Api.Chat | Api.Channel;
}

export async function getMessages(ctx: TgContext, entityLike: Api.TypeEntityLike, limit: number = 8): Promise<TotalList<Api.Message>> {
    return await ctx.client.getMessages(entityLike, { limit });
}

export async function getAllChats(ctx: TgContext): Promise<ReturnType<Api.TypeChat['toJSON']>[]> {
    if (!ctx.client) throw new Error('Client is not initialized');
    const chatData: ReturnType<Api.TypeChat['toJSON']>[] = [];
    let total = 0;

    for await (const chat of ctx.client.iterDialogs({ limit: 500 })) {
        const chatEntity = chat.entity.toJSON();
        chatData.push(chatEntity);
        total++;
    }

    ctx.logger.info(ctx.phoneNumber, 'TotalChats:', total);
    return chatData;
}

function formatReactions(reactions: Api.MessageReactions): { reaction: string; count: number }[] {
    if (!reactions?.results?.length) return [];
    return reactions.results.map((r: { reaction?: Api.TypeReaction; count?: number }) => {
        let reaction = '';
        if (r.reaction instanceof Api.ReactionEmoji) reaction = r.reaction.emoticon ?? '';
        else if (r.reaction instanceof Api.ReactionCustomEmoji) reaction = `documentId:${(r.reaction as Api.ReactionCustomEmoji).documentId}`;
        else if (r.reaction && typeof (r.reaction as any).emoticon === 'string') reaction = (r.reaction as any).emoticon;
        return { reaction, count: r.count ?? 0 };
    }).filter(x => (x.count ?? 0) > 0);
}

export async function getMessagesNew(ctx: TgContext, chatId: string, offset: number = 0, limit: number = 20): Promise<MessageItem[]> {
    const messages = await ctx.client.getMessages(chatId, { offsetId: offset, limit });

    const senderIds = new Set<string>();
    for (const msg of messages) {
        const sid = msg.senderId?.toString();
        if (sid) senderIds.add(sid);
    }
    const entityCache = new Map<string, Api.User | Api.Chat | Api.Channel | null>();
    await Promise.all(Array.from(senderIds).map(async (sid) => {
        try {
            const entity = await safeGetEntityById(ctx, sid);
            entityCache.set(sid, entity as Api.User | Api.Chat | Api.Channel | null);
        } catch {
            entityCache.set(sid, null);
        }
    }));

    const messageList = await Promise.all(messages.map(async (message: Api.Message) => {
        const senderId = message.senderId?.toString() || '';

        let media: MediaInfo | null = null;
        if (message.media && !(message.media instanceof Api.MessageMediaEmpty)) {
            const thumbBuffer = await getThumbnailBuffer(ctx, message);
            media = extractMediaInfo(message, thumbBuffer);
        }

        let forwardedFrom: string | null = null;
        if (message.fwdFrom) {
            const fwdId = message.fwdFrom.fromId;
            if (fwdId instanceof Api.PeerUser) {
                const fwdEntity = entityCache.get(fwdId.userId.toString());
                if (fwdEntity instanceof Api.User) {
                    forwardedFrom = `${fwdEntity.firstName || ''} ${fwdEntity.lastName || ''}`.trim() || fwdId.userId.toString();
                } else {
                    forwardedFrom = fwdId.userId.toString();
                }
            } else if (fwdId instanceof Api.PeerChannel) {
                forwardedFrom = fwdId.channelId.toString();
            } else if (message.fwdFrom.fromName) {
                forwardedFrom = message.fwdFrom.fromName;
            }
        }

        const msgDate = message.date ?? 0;
        return {
            id: message.id,
            text: message.message || '',
            date: toISODate(msgDate),
            time: toTimeString(msgDate),
            dateUnix: msgDate,
            senderId,
            media,
            isEdited: !!message.editDate,
            editDate: message.editDate ? toISODate(message.editDate) : null,
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

    return messageList;
}

// ---- Self messages info ----

export async function getSelfMSgsInfo(ctx: TgContext, limit: number = 500): Promise<SelfMessagesInfo> {
    if (!ctx.client) throw new Error('Client is not initialized');

    try {
        const maxLimit = Math.min(Math.max(limit, 1), 10000);
        const movieKeywords = ['movie', 'series', '1080', '720', 'terabox', '640', 'title', 'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480', 'blura', 's0', 'se0', 'uncut'];

        const [photosList, videosList, photosByUsList, videosByUsList, totalBatch, movieScan] = await Promise.all([
            ctx.client.getMessages('me', { filter: new Api.InputMessagesFilterPhotos(), limit: 1 }).catch(() => []),
            ctx.client.getMessages('me', { filter: new Api.InputMessagesFilterVideo(), limit: 1 }).catch(() => []),
            ctx.client.getMessages('me', { filter: new Api.InputMessagesFilterPhotos(), limit: 1, fromUser: 'me' }).catch(() => []),
            ctx.client.getMessages('me', { filter: new Api.InputMessagesFilterVideo(), limit: 1, fromUser: 'me' }).catch(() => []),
            ctx.client.getMessages('me', { limit: 1 }).catch(() => []),
            (async () => {
                let analyzedMessages = 0;
                let movieCount = 0;
                for await (const message of ctx.client.iterMessages('me', { limit: maxLimit, reverse: false })) {
                    analyzedMessages++;
                    if (message?.text && contains(message.text.toLowerCase(), movieKeywords)) movieCount++;
                }
                return { analyzedMessages, movieCount };
            })(),
        ]);

        const photoCount = (photosList as { total?: number })?.total ?? 0;
        const videoCount = (videosList as { total?: number })?.total ?? 0;
        const ownPhotoCount = (photosByUsList as { total?: number })?.total ?? 0;
        const ownVideoCount = (videosByUsList as { total?: number })?.total ?? 0;

        let totalMessages = movieScan.analyzedMessages;
        const totalFromBatch = (totalBatch as { total?: number })?.total;
        if (totalFromBatch != null) totalMessages = totalFromBatch;

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
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, 'Error in getSelfMSgsInfo:', error);
        throw error;
    }
}

// ---- Call logs ----
export async function getCallLog(
    ctx: TgContext,
    limit: number = 1000,
    options?: { includeCallLog?: boolean }
): Promise<CallLogResult> {
    if (!ctx.client) throw new Error('Client is not initialized');
    const includeCallLog = options?.includeCallLog === true;

    try {
        const maxLimit = Math.min(Math.max(limit, 1), 10000);
        const chunkSize = 200;
        const callLogs: (Api.Message | Api.MessageService)[] = [];
        let offsetId = 0;

        while (callLogs.length < maxLimit) {
            const result = <Api.messages.Messages>await ctx.client.invoke(
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
            const batch = messages.filter(
                (m): m is Api.Message | Api.MessageService =>
                    (m instanceof Api.Message || m instanceof Api.MessageService) &&
                    m.action instanceof Api.MessageActionPhoneCall
            );
            callLogs.push(...batch);
            if (messages.length < chunkSize) break;
            const lastMessage = messages[messages.length - 1];
            if (lastMessage) offsetId = lastMessage.id;
            if (callLogs.length >= maxLimit) break;
        }

        const stats = {
            outgoing: 0,
            incoming: 0,
            video: 0,
            audio: 0,
            totalCalls: 0,
        };
        const rawChatStats: Record<string, {
            count: number;
            outgoing: number;
            incoming: number;
            video: number;
            peerType: 'user' | 'group' | 'channel';
        }> = {};
        for (const msg of callLogs) {
            const action = msg.action as Api.MessageActionPhoneCall;
            if (!action) continue;
            stats.totalCalls++;
            if (msg.out) stats.outgoing++;
            else stats.incoming++;
            if (action.video) stats.video++;
            else stats.audio++;
            let chatId: string;
            let peerType: 'user' | 'group' | 'channel' = 'user';

            if (msg.peerId instanceof Api.PeerUser) {
                chatId = msg.peerId.userId.toString();
                peerType = 'user';
            } else if (msg.peerId instanceof Api.PeerChat) {
                chatId = msg.peerId.chatId.toString();
                peerType = 'group';
            } else if (msg.peerId instanceof Api.PeerChannel) {
                chatId = msg.peerId.channelId.toString();
                peerType = 'channel';
            } else {
                continue;
            }

            if (!rawChatStats[chatId]) {
                rawChatStats[chatId] = { count: 0, outgoing: 0, incoming: 0, video: 0, peerType };
            }
            const r = rawChatStats[chatId];
            r.count++;
            if (msg.out) r.outgoing++;
            else r.incoming++;
            if (action.video) r.video++;
        }

        let callLogByChat: Record<string, CallLogEntry[]> = {};
        if (includeCallLog) {
            for (const msg of callLogs) {
                const action = msg.action as Api.MessageActionPhoneCall;
                if (!action) continue;
                let chatId: string;
                if (msg.peerId instanceof Api.PeerUser) {
                    chatId = msg.peerId.userId.toString();
                } else if (msg.peerId instanceof Api.PeerChat) {
                    chatId = msg.peerId.chatId.toString();
                } else if (msg.peerId instanceof Api.PeerChannel) {
                    chatId = msg.peerId.channelId.toString();
                } else continue;
                if (!callLogByChat[chatId]) callLogByChat[chatId] = [];
                callLogByChat[chatId].push({
                    messageId: msg.id,
                    date: msg.date ?? 0,
                    durationSeconds: action.duration ?? 0,
                    video: !!action.video,
                    outgoing: !!msg.out,
                });
            }
            for (const arr of Object.values(callLogByChat)) {
                arr.sort((a, b) => b.date - a.date);
            }
        }

        const uniqueChatIds = Object.keys(rawChatStats);
        const entityCache = new Map<string, {
            name: string;
            phone?: string;
            username?: string;
            peerType: 'user' | 'group' | 'channel';
        }>();
        await Promise.all(
            uniqueChatIds.map(async (chatId) => {
                try {
                    const entity = await ctx.client.getEntity(chatId);
                    if (entity instanceof Api.User) {
                        entityCache.set(chatId, {
                            phone: entity.phone,
                            username: entity.username ?? undefined,
                            name: [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim() || 'Deleted Account',
                            peerType: 'user',
                        });
                    } else if (entity instanceof Api.Chat) {
                        entityCache.set(chatId, {
                            name: entity.title || 'Unknown Group',
                            peerType: 'group',
                        });
                    } else if (entity instanceof Api.Channel) {
                        entityCache.set(chatId, {
                            username: entity.username ?? undefined,
                            name: entity.title || 'Unknown Channel',
                            peerType: 'channel',
                        });
                    } else {
                        entityCache.set(chatId, { name: 'Unknown', peerType: 'user' });
                    }
                } catch (err) {
                    ctx.logger?.warn?.(`Failed to get entity ${chatId}:`, err);
                    entityCache.set(chatId, { name: 'Unknown / Restricted', peerType: 'user' });
                }
            })
        );

        const chats: CallLogChat[] = [];
        for (const chatId of uniqueChatIds) {
            const base = entityCache.get(chatId)!;
            const r = rawChatStats[chatId];
            const callLog = includeCallLog ? (callLogByChat[chatId] ?? []) : undefined;
            let totalMessages: number | undefined;
            let photoCount = 0;
            let videoCount = 0;
            try {
                const inputPeer = await ctx.client.getInputEntity(chatId);
                const [photosRes, videosRes, historyRes] = await Promise.all([
                    ctx.client.invoke(
                        new Api.messages.Search({
                            peer: inputPeer,
                            q: "",
                            filter: new Api.InputMessagesFilterPhotos(),
                            minDate: 0,
                            maxDate: 0,
                            offsetId: 0,
                            addOffset: 0,
                            limit: 1,
                            maxId: 0,
                            minId: 0,
                        })
                    ).catch(() => ({ count: 0 })),
                    ctx.client.invoke(
                        new Api.messages.Search({
                            peer: inputPeer,
                            q: "",
                            filter: new Api.InputMessagesFilterVideo(),
                            minDate: 0,
                            maxDate: 0,
                            offsetId: 0,
                            addOffset: 0,
                            limit: 1,
                            maxId: 0,
                            minId: 0,
                        })
                    ).catch(() => ({ count: 0 })),
                    ctx.client.invoke(
                        new Api.messages.GetHistory({
                            peer: inputPeer,
                            offsetId: 0,
                            offsetDate: 0,
                            addOffset: 0,
                            limit: 1,
                            maxId: 0,
                            minId: 0,
                            hash: bigInt(0),
                        })
                    ).catch(() => ({ messages: [] })),
                ]);
                if (historyRes && 'count' in historyRes) totalMessages = historyRes.count;
                photoCount = (photosRes as { count?: number }).count ?? 0;
                videoCount = (videosRes as { count?: number }).count ?? 0;
            } catch (e) {
                ctx.logger?.warn?.(`Failed to fetch media/total for ${chatId}:`, e);
            }
            chats.push({
                chatId,
                phone: base.phone,
                username: base.username,
                name: base.name,
                peerType: base.peerType,
                calls: {
                    total: r.count,
                    outgoing: r.outgoing,
                    incoming: r.incoming,
                    video: r.video,
                    audio: r.count - r.video,
                },
                totalMessages,
                photoCount,
                videoCount,
                ...(includeCallLog && callLog !== undefined ? { callLog } : {}),
            });
        }
        chats.sort((a, b) => b.calls.total - a.calls.total);

        ctx.logger?.info?.(ctx.phoneNumber, 'Call log summary', {
            totalCalls: stats.totalCalls,
            outgoing: stats.outgoing,
            incoming: stats.incoming,
            video: stats.video,
            audio: stats.audio,
            uniqueChats: chats.length,
        });

        return {
            totalCalls: stats.totalCalls,
            outgoing: stats.outgoing,
            incoming: stats.incoming,
            video: stats.video,
            audio: stats.audio,
            chats,
        };
    } catch (error) {
        ctx.logger?.error?.(ctx.phoneNumber, 'getCallLog failed:', error);
        throw error;
    }
}
// ---- Chat stats ----

export async function getChatStatistics(ctx: TgContext, chatId: string, period: 'day' | 'week' | 'month'): Promise<ChatStatistics> {
    if (!ctx.client) throw new Error('Client not initialized');

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
                if (!m.media || m.media.className !== 'MessageMediaDocument') return false;
                const doc = (m.media as Api.MessageMediaDocument).document;
                return doc && 'mimeType' in doc && (doc as Api.Document).mimeType?.startsWith('video/');
            }).length,
            voice: messages.filter(m => {
                if (!m.media || m.media.className !== 'MessageMediaDocument') return false;
                const doc = (m.media as Api.MessageMediaDocument).document;
                return doc && 'mimeType' in doc && (doc as Api.Document).mimeType?.startsWith('audio/');
            }).length,
            other: messages.filter(m => m.media && !['MessageMediaPhoto', 'MessageMediaDocument'].includes(m.media.className)).length,
        },
        topSenders: await (async () => {
            const rawSenders = Object.entries(
                messages.reduce((acc, msg) => {
                    const senderId = msg.fromId?.toString();
                    if (senderId) acc[senderId] = (acc[senderId] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>)
            ).sort(([, a], [, b]) => b - a).slice(0, 10);

            return Promise.all(rawSenders.map(async ([id, count]): Promise<TopSenderInfo> => {
                let name = 'Unknown';
                let username: string | null = null;
                try {
                    const entity = await safeGetEntityById(ctx, id);
                    if (entity instanceof Api.User) {
                        name = `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown';
                        username = entity.username || null;
                    } else if (entity instanceof Api.Channel) {
                        name = entity.title || 'Unknown';
                        username = entity.username || null;
                    } else if (entity instanceof Api.Chat) {
                        name = entity.title || 'Unknown';
                    }
                } catch { /* ignore */ }
                return { id, name, username, count };
            }));
        })(),
        mostActiveHours: Object.entries(
            messages.reduce((acc, msg) => {
                const hour = new Date(msg.date * 1000).getHours();
                acc[hour] = (acc[hour] || 0) + 1;
                return acc;
            }, {} as Record<number, number>)
        ).sort(([, a], [, b]) => b - a).map(([hour, count]) => ({ hour: Number(hour), count })),
    };
}

export async function getMessageStats(ctx: TgContext, options: {
    chatId: string; period: 'day' | 'week' | 'month'; fromDate?: Date;
}): Promise<MessageStats> {
    if (!ctx.client) throw new Error('Client not initialized');

    const now = options.fromDate || new Date();
    const startDate = new Date(now);
    switch (options.period) {
        case 'day': startDate.setDate(startDate.getDate() - 1); break;
        case 'week': startDate.setDate(startDate.getDate() - 7); break;
        case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
    }

    const messages = await ctx.client.getMessages(options.chatId, {
        limit: 100, offsetDate: Math.floor(now.getTime() / 1000),
    });

    const gmt = getMediaType;
    const stats: MessageStats = {
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
        } else if (msg.message) {
            if (msg.message.match(/https?:\/\/[^\s]+/)) stats.withLinks++;
            stats.byType.text++;
        }
        if (msg.fwdFrom) stats.withForwards++;
    }

    return stats;
}

// ---- Chat list ----

export async function getChats(ctx: TgContext, options: {
    limit?: number; offsetDate?: number; folderId?: number; archived?: boolean; peerType?: 'all' | 'user' | 'group' | 'channel'; ignorePinned?: boolean; includePhotos?: boolean;
}): Promise<ChatListResult> {
    if (!ctx.client) throw new Error('Client not initialized');

    const dialogs: Dialog[] = [];
    const limit = options.limit || 100;
    const includePhotos = options.includePhotos || false;
    const peerType = options.peerType ?? 'all';
    const folder = options.folderId !== undefined ? options.folderId : (options.archived ? 1 : 0);
    const requestLimit = peerType === 'all' ? limit : Math.min(limit * 3, 100);
    const params: Parameters<typeof ctx.client.iterDialogs>[0] = { limit: requestLimit, folder, ignorePinned: options.ignorePinned ?? false };
    if (options.offsetDate != null && options.offsetDate > 0) params.offsetDate = options.offsetDate;
    const me = await ctx.client.getMe();

    for await (const dialog of ctx.client.iterDialogs(params)) {
        const entity = dialog.entity;
        const match =
            peerType === 'all' ||
            (peerType === 'user' && entity instanceof Api.User) ||
            (peerType === 'group' && entity instanceof Api.Chat) ||
            (peerType === 'channel' && entity instanceof Api.Channel);
        if (match) dialogs.push(dialog);
        if (dialogs.length >= limit) break;
    }

    const last = dialogs[dialogs.length - 1];
    const hasMore = dialogs.length === limit;
    const nextOffsetDate = hasMore && last?.message?.date != null ? last.message.date : undefined;

    const items = await Promise.all(dialogs.map(async (dialog: Dialog) => {
        const entity = dialog.entity;
        const type: 'user' | 'group' | 'channel' | 'unknown' =
            entity instanceof Api.User ? 'user' :
                entity instanceof Api.Chat ? 'group' :
                    entity instanceof Api.Channel ? 'channel' : 'unknown';

        // Resolve last message sender name
        let senderName: string | null = null;
        if (dialog.message?.senderId) {
            try {
                if (dialog.message.senderId.toString() === me.id.toString()) {
                    senderName = `${me.firstName || ''} ${me.lastName || ''} (Self)`.trim();
                } else {
                    if (type === 'user') {
                        const senderEntity = await safeGetEntityById(ctx, dialog.message.senderId.toString());
                        if (senderEntity instanceof Api.User) {
                            senderName = `${senderEntity.firstName || ''} ${senderEntity.lastName || ''}`.trim() || senderEntity.username || null;
                        } else {
                            senderName = "Unknown";
                        }
                    } else {
                        senderName = dialog.title || "Unknown Channel User";
                    }
                }
            } catch {
                senderName = "Unknown";
            }
        }

        // Online status & last seen (only for users)
        let onlineStatus: string | null = null;
        let lastSeen: string | null = null;
        if (entity instanceof Api.User) {
            const status = getUserOnlineStatus(entity);
            onlineStatus = status.status;
            lastSeen = status.lastSeen;
        }

        // Mute status
        const muteUntil = dialog.dialog?.notifySettings?.muteUntil;
        const isMuted = muteUntil ? muteUntil > Math.floor(Date.now() / 1000) : false;

        // Participant count
        let participantCount: number | null = null;
        if (entity instanceof Api.Chat) {
            participantCount = entity.participantsCount ?? null;
        } else if (entity instanceof Api.Channel) {
            participantCount = entity.participantsCount ?? null;
        }

        // Chat photo (opt-in)
        let photoBase64: string | null = null;
        if (includePhotos && 'photo' in entity && entity.photo && !(entity.photo instanceof Api.ChatPhotoEmpty)) {
            try {
                const photoResult = await ctx.client.downloadProfilePhoto(entity, { isBig: false });
                if (photoResult && Buffer.isBuffer(photoResult) && (photoResult as Buffer).length > 0) {
                    photoBase64 = bufferToBase64DataUrl(photoResult as Buffer);
                }
            } catch { /* ignore photo download failures */ }
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
                date: toISODate(dialog.message.date),
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

export async function updateChatSettings(ctx: TgContext, settings: ChatSettingsUpdate): Promise<boolean> {
    if (!ctx.client) throw new Error('Client not initialized');
    const chat = await ctx.client.getEntity(settings.chatId);
    const updates: Promise<Api.TypeUpdates | boolean>[] = [];

    if (settings.title) {
        updates.push(ctx.client.invoke(new Api.channels.EditTitle({ channel: chat, title: settings.title })));
    }
    if (settings.about) {
        updates.push(ctx.client.invoke(new Api.messages.EditChatAbout({ peer: chat, about: settings.about })));
    }
    if (settings.photo) {
        const buffer = await downloadFileFromUrl(settings.photo);
        const file = await ctx.client.uploadFile({
            file: new CustomFile('photo.jpg', buffer.length, 'photo.jpg', buffer), workers: 1,
        });
        updates.push(ctx.client.invoke(new Api.channels.EditPhoto({
            channel: chat, photo: new Api.InputChatUploadedPhoto({ file }),
        })));
    }
    if (settings.slowMode !== undefined) {
        updates.push(ctx.client.invoke(new Api.channels.ToggleSlowMode({ channel: chat, seconds: settings.slowMode })));
    }
    if (settings.linkedChat) {
        const linkedChannel = await ctx.client.getEntity(settings.linkedChat);
        updates.push(ctx.client.invoke(new Api.channels.SetDiscussionGroup({ broadcast: chat, group: linkedChannel })));
    }
    if (settings.username) {
        updates.push(ctx.client.invoke(new Api.channels.UpdateUsername({ channel: chat, username: settings.username })));
    }

    await Promise.all(updates);
    return true;
}

// ---- Chat folders ----

export async function createChatFolder(ctx: TgContext, options: ChatFolderCreateOptions): Promise<{
    id: number; name: string; options: Record<string, boolean>;
}> {
    if (!ctx.client) throw new Error('Client not initialized');

    const folder = new Api.DialogFilter({
        id: Math.floor(Math.random() * 1000),
        title: new Api.TextWithEntities({ text: options.name, entities: [] }),
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

    await ctx.client.invoke(new Api.messages.UpdateDialogFilter({ id: folder.id, filter: folder }));

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

export async function getChatFolders(ctx: TgContext): Promise<ChatFolder[]> {
    if (!ctx.client) throw new Error('Client not initialized');
    const filters = await ctx.client.invoke(new Api.messages.GetDialogFilters());
    return (filters.filters || []).map((filter: Api.TypeDialogFilter) => ({
        id: (filter as Api.DialogFilter).id ?? 0,
        title: ((filter as Api.DialogFilter).title as unknown as string) ?? '',
        includedChatsCount: Array.isArray((filter as Api.DialogFilter).includePeers) ? (filter as Api.DialogFilter).includePeers.length : 0,
        excludedChatsCount: Array.isArray((filter as Api.DialogFilter).excludePeers) ? (filter as Api.DialogFilter).excludePeers.length : 0,
    }));
}

// ---- Top private chats ----

async function analyzeChatEngagement(
    ctx: TgContext, chatId: string, user: Api.User,
    weights: EngagementWeights, now: number,
    dialog?: Dialog, callStats?: PerChatCallStats
): Promise<TopPrivateChat | null> {
    const lastMessage = await ctx.client.getMessages(chatId, { limit: 1 });
    if ((lastMessage?.total ?? 0) < 10) return null;

    const [photosList, videosList, photosByUsList, videosByUsList] = await Promise.all([
        ctx.client.getMessages(chatId, { filter: new Api.InputMessagesFilterPhotos(), limit: 1 }).catch(() => []),
        ctx.client.getMessages(chatId, { filter: new Api.InputMessagesFilterVideo(), limit: 1 }).catch(() => []),
        ctx.client.getMessages(chatId, { filter: new Api.InputMessagesFilterPhotos(), limit: 1, fromUser: 'me' }).catch(() => []),
        ctx.client.getMessages(chatId, { filter: new Api.InputMessagesFilterVideo(), limit: 1, fromUser: 'me' }).catch(() => []),
    ]);

    const totalPhotos = (photosList as { total?: number })?.total ?? 0;
    const totalVideos = (videosList as { total?: number })?.total ?? 0;
    const photosByUs = (photosByUsList as { total?: number })?.total ?? 0;
    const videosByUs = (videosByUsList as { total?: number })?.total ?? 0;
    const mediaStats = {
        photos: totalPhotos, videos: totalVideos, photosByUs,
        photosByThem: Math.max(0, totalPhotos - photosByUs),
        videosByUs, videosByThem: Math.max(0, totalVideos - videosByUs),
    };

    const lastMessageDate = dialog?.message?.date ? dialog.message.date * 1000 : now;
    const daysSinceLastActivity = (now - lastMessageDate) / (1000 * 60 * 60 * 24);
    const cCalls = callStats ?? { outgoing: 0, incoming: 0, video: 0, total: 0 };
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
        textMessages: lastMessage.total ?? 0,
    };

    return {
        chatId: user.id.toString(),
        username: user.username,
        firstName: (chatId === 'me' ? 'Saved Messages' : user.firstName),
        lastName: (chatId === 'me' ? '(Self)' : user.lastName),
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

export async function getTopPrivateChats(ctx: TgContext, limit: number = 10): Promise<TopPrivateChat[]> {
    if (!ctx.client) throw new Error('Client not initialized');

    const clampedLimit = Math.max(1, Math.min(50, limit || 10));
    ctx.logger.info(ctx.phoneNumber, `Starting getTopPrivateChats (private + self only, unique), limit=${clampedLimit}...`);

    const startTime = Date.now();
    const now = Date.now();

    const weights: EngagementWeights = {
        videoCall: 2, incomingCall: 4, outgoingCall: 1,
        sharedVideo: 12, sharedPhoto: 10, textMessage: 1, unreadMessages: 1,
    };

    const [me, callLogResult, dialogs] = await Promise.all([
        getMe(ctx).catch(() => null),
        getCallLog(ctx, 300).catch(() => ({ totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0, chats: [] })),
        ctx.client.getDialogs({ limit: 350 }),
    ]);

    if (!me) throw new Error('Failed to fetch self userInfo');
    const selfChatId = me.id.toString();

    // Only private user chats: skip channels and groups (explicit entity check)
    const privateUserDialogs = Array.from(dialogs).filter(
        (d): d is Dialog => !!d.isUser && d.entity instanceof Api.User
    );
    // Unique by chatId, exclude self and bots
    const seenIds = new Set<string>();
    const candidateChats = privateUserDialogs.filter((d) => {
        const user = d.entity as Api.User;
        if (user.bot) return false;
        const id = user.id.toString();
        if (id === selfChatId || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
    });

    const callLogsByChat = Object.fromEntries((callLogResult.chats ?? []).map(c => [c.chatId, c.calls]));

    // Self chat (Saved Messages) – fetch once, excluded from dialogs so no duplicate
    let selfChatData: TopPrivateChat | null = null;
    try {
        selfChatData = await analyzeChatEngagement(ctx, 'me', me, weights, now, undefined, callLogsByChat[selfChatId]);
        if (selfChatData) ctx.logger.info(ctx.phoneNumber, `Self chat - Score: ${selfChatData.interactionScore}`);
    } catch (e) {
        ctx.logger.warn(ctx.phoneNumber, 'Error processing self chat:', e);
    }

    const topCandidates = candidateChats.slice(0, Math.min(clampedLimit * 4, 49));
    ctx.logger.info(ctx.phoneNumber, `Analyzing ${topCandidates.length} unique private chats...`);

    const chatStats: TopPrivateChat[] = [];
    const batchSize = 10;

    for (let i = 0; i < topCandidates.length; i += batchSize) {
        const batch = topCandidates.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (candidate) => {
            const user = candidate.entity as Api.User;
            const chatId = user.id.toString();
            try {
                return await analyzeChatEngagement(ctx, chatId, user, weights, now, candidate, callLogsByChat[chatId]);
            } catch (error) {
                ctx.logger.warn(ctx.phoneNumber, `Error analyzing chat ${chatId}:`, (error as Error).message);
                return null;
            }
        }));
        chatStats.push(...batchResults.filter((r): r is TopPrivateChat => r !== null));
    }

    // Combine self + others, sort by score desc, dedupe by chatId, then take limit
    const allChats: TopPrivateChat[] = [...(selfChatData ? [selfChatData] : []), ...chatStats];
    const byScore = allChats.sort((a, b) => b.interactionScore - a.interactionScore);
    const uniqueByChatId: TopPrivateChat[] = [];
    const resultIds = new Set<string>();
    for (const chat of byScore) {
        const id = chat.chatId;
        if (resultIds.has(id)) continue;
        resultIds.add(id);
        uniqueByChatId.push(chat);
    }
    const topChats = uniqueByChatId.slice(0, clampedLimit);

    ctx.logger.info(ctx.phoneNumber, `getTopPrivateChats completed in ${Date.now() - startTime}ms. Returning ${topChats.length} unique chats (sorted by score).`);
    return topChats;
}

// ---- Bot creation ----

export async function createBot(ctx: TgContext, options: {
    name: string; username: string; description?: string; aboutText?: string; profilePhotoUrl?: string;
}): Promise<{ botToken: string; username: string }> {
    if (!ctx.client) throw new Error('Client not initialized');

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
            for (let i = 0; i < 3; i++) uniqueSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
            botUsername = botUsername.replace(/_?bot$/, '') + `_${uniqueSuffix}_bot`;
            ctx.logger.info(ctx.phoneNumber, `[BOT CREATION] Modified username: ${botUsername}`);
        }

        await ctx.client.sendMessage(entity, { message: botUsername });
        await new Promise(resolve => setTimeout(resolve, 1000));

        const messages = await ctx.client.getMessages(entity, { limit: 1 });
        if (!messages || messages.length === 0) throw new Error('No response received from BotFather');

        const lastMessage = messages[0].message;
        if (!lastMessage.toLowerCase().includes('use this token')) throw new Error(`Bot creation failed: ${lastMessage}`);

        const tokenMatch = lastMessage.match(/(\d+:[A-Za-z0-9_-]+)/);
        if (!tokenMatch) throw new Error('Could not extract bot token from BotFather response');
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
                const photoBuffer = await downloadFileFromUrl(options.profilePhotoUrl);
                await ctx.client.sendMessage(entity, { message: '/setuserpic' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                await ctx.client.sendMessage(entity, { message: `@${options.username}` });
                await new Promise(resolve => setTimeout(resolve, 1000));
                await ctx.client.sendFile(entity, { file: Buffer.from(photoBuffer), caption: '', forceDocument: false });
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (photoError) {
                ctx.logger.error(ctx.phoneNumber, `[BOT CREATION] Failed to set profile photo: ${photoError.message}`, {});
            }
        }

        ctx.logger.info(ctx.phoneNumber, `[BOT CREATION] Bot creation completed successfully: @${options.username}`);
        return { botToken, username: botUsername };
    } catch (error) {
        ctx.logger.error(ctx.phoneNumber, `[BOT CREATION] Error: ${error.message}`, error);
        throw new Error(`Failed to create bot: ${error.message}`);
    }
}
