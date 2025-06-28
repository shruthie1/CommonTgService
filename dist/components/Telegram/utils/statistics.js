"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatStatistics = getChatStatistics;
exports.getMessageStats = getMessageStats;
exports.getTopPrivateChats = getTopPrivateChats;
exports.getSelfMSgsInfo = getSelfMSgsInfo;
const telegram_1 = require("telegram");
const message_search_dto_1 = require("../dto/message-search.dto");
const message_management_1 = require("./message-management");
async function getChatStatistics(client, chatId, period) {
    const now = Math.floor(Date.now() / 1000);
    const periodInSeconds = {
        day: 24 * 60 * 60,
        week: 7 * 24 * 60 * 60,
        month: 30 * 24 * 60 * 60
    }[period];
    const messages = await client.getMessages(chatId, {
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
            video: messages.filter(m => m.media && m.media.className === 'MessageMediaDocument' &&
                m.media.document &&
                m.media.document.mimeType?.startsWith('video/')).length,
            voice: messages.filter(m => m.media && m.media.className === 'MessageMediaDocument' &&
                m.media.document &&
                m.media.document.mimeType?.startsWith('audio/')).length,
            other: messages.filter(m => m.media && !['MessageMediaPhoto', 'MessageMediaDocument'].includes(m.media.className)).length
        },
        topSenders: Object.entries(messages.reduce((acc, msg) => {
            const senderId = msg.fromId?.toString();
            if (senderId) {
                acc[senderId] = (acc[senderId] || 0) + 1;
            }
            return acc;
        }, {}))
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([id, count]) => ({ id, count })),
        mostActiveHours: Object.entries(messages.reduce((acc, msg) => {
            const hour = new Date(msg.date * 1000).getHours();
            acc[hour] = (acc[hour] || 0) + 1;
            return acc;
        }, {}))
            .sort(([, a], [, b]) => b - a)
            .map(([hour, count]) => ({ hour: Number(hour), count }))
    };
    return stats;
}
async function getMessageStats(client, options) {
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
    const messages = await client.getMessages(options.chatId, {
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
            const mediaType = getMediaType(msg.media);
            stats.byType[mediaType] = (stats.byType[mediaType] || 0) + 1;
        }
        else if (msg.message) {
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
async function getTopPrivateChats(client) {
    console.log('Starting getTopPrivateChats analysis...');
    const startTime = Date.now();
    const weights = {
        videoCall: 15,
        incoming: 5,
        outgoing: 1,
        sharedVideo: 6,
        sharedPhoto: 4,
        textMessage: 1,
    };
    console.log('Fetching dialogs...');
    const dialogs = await client.getDialogs({
        limit: 200
    });
    console.log(`Found ${dialogs.length} total dialogs`);
    const privateChats = dialogs.filter(dialog => dialog.isUser &&
        dialog.entity instanceof telegram_1.Api.User &&
        !dialog.entity.bot &&
        !dialog.entity.fake &&
        dialog.entity.id.toString() !== "777000" &&
        dialog.entity.id.toString() !== "42777");
    console.log(`Found ${privateChats.length} valid private chats after filtering`);
    const batchSize = 10;
    const chatStats = [];
    const callLogs = await getCallLogsInternal(client);
    console.log(callLogs);
    for (let i = 0; i < privateChats.length; i += batchSize) {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(privateChats.length / batchSize)}`);
        const batch = privateChats.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (dialog) => {
            const processingStart = Date.now();
            const chatId = dialog.entity.id.toString();
            const user = dialog.entity;
            console.log(`Processing chat ${chatId} (${user.firstName || 'Unknown'}) last: ${dialog.message?.id}`);
            try {
                const messages = await client.getMessages(chatId, {
                    limit: 30,
                });
                if (messages.length < 20) {
                    console.log(`Skipping chat ${chatId} - insufficient messages (${messages.length})`);
                    return null;
                }
                const messageStats = await (0, message_management_1.searchMessages)(client, {
                    chatId,
                    types: [
                        message_search_dto_1.MessageMediaType.PHOTO,
                        message_search_dto_1.MessageMediaType.ROUND_VIDEO,
                        message_search_dto_1.MessageMediaType.VIDEO,
                        message_search_dto_1.MessageMediaType.DOCUMENT,
                        message_search_dto_1.MessageMediaType.VOICE,
                        message_search_dto_1.MessageMediaType.ROUND_VOICE,
                        message_search_dto_1.MessageMediaType.CHAT_PHOTO
                    ],
                    limit: 100
                });
                console.log(`Retrieved ${messages.length} messages for chat ${chatId} | total: ${messages.total}`);
                const callStats = {
                    total: 0,
                    incoming: 0,
                    outgoing: 0,
                    video: 0
                };
                const mediaStats = {
                    photos: messageStats.photo.total,
                    videos: (messageStats?.video?.total || 0) + (messageStats?.roundVideo?.total || 0)
                };
                const userCalls = callLogs[chatId];
                console.log(userCalls);
                if (userCalls) {
                    callStats.total = userCalls.total || 0;
                    callStats.incoming = userCalls.incoming || 0;
                    callStats.outgoing = userCalls.outgoing || 0;
                    callStats.video = userCalls.video || 0;
                }
                const interactionScore = (callStats.incoming * weights.incoming +
                    callStats.outgoing * weights.outgoing +
                    callStats.video * weights.videoCall +
                    mediaStats.videos * weights.sharedVideo +
                    mediaStats.photos * weights.sharedPhoto +
                    messages.total * weights.textMessage);
                const activityBreakdown = {
                    videoCalls: (callStats.video * weights.videoCall) / interactionScore * 100,
                    incoming: (callStats.incoming * weights.incoming) / interactionScore * 100,
                    outgoing: (callStats.outgoing * weights.outgoing) / interactionScore * 100,
                    mediaSharing: ((mediaStats.videos * weights.sharedVideo + mediaStats.photos * weights.sharedPhoto)) / interactionScore * 100,
                    textMessages: (messages.total * weights.textMessage) / interactionScore * 100
                };
                const processingTime = Date.now() - processingStart;
                console.log(`Finished processing chat ${chatId} in ${processingTime}ms with interaction score: ${interactionScore}`);
                return {
                    chatId,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    totalMessages: messages.total,
                    interactionScore: Math.round(interactionScore * 100) / 100,
                    calls: callStats,
                    media: mediaStats,
                    activityBreakdown
                };
            }
            catch (error) {
                console.error(`Error processing chat ${chatId}:`, error);
                return null;
            }
        }));
        chatStats.push(...batchResults.filter(Boolean));
    }
    const topChats = chatStats
        .sort((a, b) => b.interactionScore - a.interactionScore)
        .slice(0, 10);
    const totalTime = Date.now() - startTime;
    console.log(`getTopPrivateChats completed in ${totalTime}ms. Found ${topChats.length} top chats`);
    topChats.forEach((chat, index) => {
        console.log(`Top ${index + 1}: ${chat.firstName} (${chat.username || 'no username'}) - Score: ${chat.interactionScore}`);
    });
    return topChats;
}
async function getSelfMSgsInfo(client) {
    const self = await client.getMe();
    const selfChatId = self.id;
    let photoCount = 0;
    let ownPhotoCount = 0;
    let ownVideoCount = 0;
    let otherPhotoCount = 0;
    let otherVideoCount = 0;
    let videoCount = 0;
    let movieCount = 0;
    const messageHistory = await client.getMessages(selfChatId, { limit: 200 });
    for (const message of messageHistory) {
        const text = message.text?.toLowerCase() || '';
        const movieKeywords = [
            'movie', 'series', '1080', '720', 'terabox', '640', 'title',
            'aac', '265', '264', 'instagr', 'hdrip', 'mkv', 'hq', '480',
            'blura', 's0', 'se0', 'uncut'
        ];
        const containsMovieKeywords = movieKeywords.some(keyword => text.includes(keyword));
        if (containsMovieKeywords) {
            movieCount++;
        }
        else {
            if (message.photo) {
                photoCount++;
                if (!message.fwdFrom) {
                    ownPhotoCount++;
                }
                else {
                    otherPhotoCount++;
                }
            }
            else if (message.video) {
                videoCount++;
                if (!message.fwdFrom) {
                    ownVideoCount++;
                }
                else {
                    otherVideoCount++;
                }
            }
        }
    }
    return {
        total: messageHistory.total,
        photoCount,
        videoCount,
        movieCount,
        ownPhotoCount,
        otherPhotoCount,
        ownVideoCount,
        otherVideoCount
    };
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
        else {
            return 'document';
        }
    }
    return 'other';
}
async function getCallLogsInternal(client) {
    console.log('Call logs functionality not implemented');
    return {};
}
//# sourceMappingURL=statistics.js.map