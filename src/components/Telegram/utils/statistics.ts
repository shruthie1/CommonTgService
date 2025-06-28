import { Api, TelegramClient } from 'telegram';
import { MessageMediaType, SearchMessagesDto } from '../dto/message-search.dto';
import { searchMessages } from './message-management';

/**
 * Get chat statistics for a specific period
 */
export async function getChatStatistics(client: TelegramClient, chatId: string, period: 'day' | 'week' | 'month'): Promise<{
    period: string;
    totalMessages: number;
    uniqueSenders: number;
    messageTypes: {
        text: number;
        photo: number;
        video: number;
        voice: number;
        other: number;
    };
    topSenders: Array<{ id: string; count: number }>;
    mostActiveHours: Array<{ hour: number; count: number }>;
}> {
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
                (m.media as Api.MessageMediaDocument).document && 
                ((m.media as Api.MessageMediaDocument).document as Api.Document).mimeType?.startsWith('video/')).length,
            voice: messages.filter(m => m.media && m.media.className === 'MessageMediaDocument' && 
                (m.media as Api.MessageMediaDocument).document && 
                ((m.media as Api.MessageMediaDocument).document as Api.Document).mimeType?.startsWith('audio/')).length,
            other: messages.filter(m => m.media && !['MessageMediaPhoto', 'MessageMediaDocument'].includes(m.media.className)).length
        },
        topSenders: Object.entries(
            messages.reduce((acc, msg) => {
                const senderId = msg.fromId?.toString();
                if (senderId) {
                    acc[senderId] = (acc[senderId] || 0) + 1;
                }
                return acc;
            }, {} as Record<string, number>)
        )
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([id, count]) => ({ id, count })),
        mostActiveHours: Object.entries(
            messages.reduce((acc, msg) => {
                const hour = new Date(msg.date * 1000).getHours();
                acc[hour] = (acc[hour] || 0) + 1;
                return acc;
            }, {} as Record<number, number>)
        )
            .sort(([, a], [, b]) => b - a)
            .map(([hour, count]) => ({ hour: Number(hour), count }))
    };

    return stats;
}

/**
 * Get message statistics
 */
export async function getMessageStats(client: TelegramClient, options: {
    chatId: string;
    period: 'day' | 'week' | 'month';
    fromDate?: Date;
}): Promise<{
    total: number;
    withMedia: number;
    withLinks: number;
    withForwards: number;
    byHour: number[];
    byType: {
        text: number;
        photo: number;
        video: number;
        document: number;
        other: number;
    };
}> {
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
        } else if (msg.message) {
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

/**
 * Get top private chats based on interaction score
 */
export async function getTopPrivateChats(client: TelegramClient): Promise<Array<{
    chatId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    totalMessages: number;
    interactionScore: number;
    calls: {
        total: number;
        incoming: {
            total: number;
            audio: number;
            video: number;
        };
        outgoing: {
            total: number;
            audio: number;
            video: number;
        };
    };
    media: {
        photos: number;
        videos: number;
    };
    activityBreakdown: {
        videoCalls: number;
        audioCalls: number;
        mediaSharing: number;
        textMessages: number;
    };
}>> {
    console.log('Starting getTopPrivateChats analysis...');
    const startTime = Date.now();

    // Weighting factors for different interaction types
    const weights = {
        videoCall: 15,      // Video calls have highest weight due to high engagement
        incoming: 5,
        outgoing: 1,       // Audio calls indicate strong connection
        sharedVideo: 6,     // Videos show high interaction intent
        sharedPhoto: 4,     // Photos show moderate interaction
        textMessage: 1,     // Base weight for messages
    };

    console.log('Fetching dialogs...');
    const dialogs = await client.getDialogs({
        limit: 200 // Reduced from 500 for better performance
    });
    console.log(`Found ${dialogs.length} total dialogs`);

    // Filter private chats more strictly
    const privateChats = dialogs.filter(dialog =>
        dialog.isUser &&
        dialog.entity instanceof Api.User &&
        !dialog.entity.bot && // Explicitly exclude bots
        !dialog.entity.fake && // Exclude fake accounts
        dialog.entity.id.toString() !== "777000" && // Exclude Telegram's service notifications
        dialog.entity.id.toString() !== "42777" // Exclude Telegram's support account
    );

    console.log(`Found ${privateChats.length} valid private chats after filtering`);

    // Process chats in batches to avoid overwhelming the API
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
            const user = dialog.entity as Api.User;

            console.log(`Processing chat ${chatId} (${user.firstName || 'Unknown'}) last: ${dialog.message?.id}`);

            try {
                // Get recent messages with optimization
                const messages = await client.getMessages(chatId, {
                    limit: 30,
                });

                // Skip chats with fewer than 20 messages
                if (messages.length < 20) {
                    console.log(`Skipping chat ${chatId} - insufficient messages (${messages.length})`);
                    return null;
                }

                const messageStats = await searchMessages(client, { 
                    chatId, 
                    types: [
                        MessageMediaType.PHOTO, 
                        MessageMediaType.ROUND_VIDEO, 
                        MessageMediaType.VIDEO, 
                        MessageMediaType.DOCUMENT, 
                        MessageMediaType.VOICE, 
                        MessageMediaType.ROUND_VOICE, 
                        MessageMediaType.CHAT_PHOTO
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

                // Calculate scores
                const interactionScore = (
                    callStats.incoming * weights.incoming +
                    callStats.outgoing * weights.outgoing +
                    callStats.video * weights.videoCall +
                    mediaStats.videos * weights.sharedVideo +
                    mediaStats.photos * weights.sharedPhoto +
                    messages.total * weights.textMessage
                )

                // Calculate activity breakdown
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
            } catch (error) {
                console.error(`Error processing chat ${chatId}:`, error);
                return null;
            }
        }));

        chatStats.push(...batchResults.filter(Boolean));
    }

    // Sort by interaction score and get top 10
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

/**
 * Get self messages info including photo/video counts and categorization
 */
export async function getSelfMSgsInfo(client: TelegramClient): Promise<{
    photoCount: number;
    videoCount: number;
    movieCount: number;
    total: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
}> {
    const self = await client.getMe() as Api.User;
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
        } else {
            if (message.photo) {
                photoCount++;
                if (!message.fwdFrom) {
                    ownPhotoCount++;
                } else {
                    otherPhotoCount++;
                }
            } else if (message.video) {
                videoCount++;
                if (!message.fwdFrom) {
                    ownVideoCount++;
                } else {
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

// Helper functions
function getMediaType(media: Api.TypeMessageMedia): 'photo' | 'video' | 'document' | 'other' {
    if (media instanceof Api.MessageMediaPhoto) {
        return 'photo';
    } else if (media instanceof Api.MessageMediaDocument) {
        const doc = media.document as Api.Document;
        if (doc.mimeType?.startsWith('video/')) {
            return 'video';
        } else {
            return 'document';
        }
    }
    return 'other';
}

async function getCallLogsInternal(client: TelegramClient): Promise<Record<string, any>> {
    // This is a placeholder for call logs functionality
    // In practice, this would need to integrate with the actual call logs API
    console.log('Call logs functionality not implemented');
    return {};
}
