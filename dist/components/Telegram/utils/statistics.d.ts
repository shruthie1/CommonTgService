import { TelegramClient } from 'telegram';
export declare function getChatStatistics(client: TelegramClient, chatId: string, period: 'day' | 'week' | 'month'): Promise<{
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
    topSenders: Array<{
        id: string;
        count: number;
    }>;
    mostActiveHours: Array<{
        hour: number;
        count: number;
    }>;
}>;
export declare function getMessageStats(client: TelegramClient, options: {
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
}>;
export declare function getTopPrivateChats(client: TelegramClient): Promise<Array<{
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
}>>;
export declare function getSelfMSgsInfo(client: TelegramClient): Promise<{
    photoCount: number;
    videoCount: number;
    movieCount: number;
    total: number;
    ownPhotoCount: number;
    otherPhotoCount: number;
    ownVideoCount: number;
    otherVideoCount: number;
}>;
