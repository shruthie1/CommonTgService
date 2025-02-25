export interface ContentFilter {
    chatId: string;
    keywords?: string[];
    mediaTypes?: ('photo' | 'video' | 'document')[];
    actions: ('delete' | 'warn' | 'mute')[];
}
export interface BackupOptions {
    chatIds?: string[];
    includeMedia?: boolean;
    exportFormat?: 'json' | 'html';
}
export interface BackupResult {
    backupId: string;
    path: string;
    format: 'json' | 'html';
    timestamp: string;
    chats: number;
    messages: number;
}
export interface ChatStatistics {
    period: 'day' | 'week' | 'month';
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
}
export interface ScheduleMessageOptions {
    chatId: string;
    message: string;
    scheduledTime: Date;
    media?: {
        type: 'photo' | 'video' | 'document';
        url: string;
    };
}
export interface MediaAlbumOptions {
    chatId: string;
    media: Array<{
        type: 'photo' | 'video';
        url: string;
        caption?: string;
    }>;
}
export interface GroupOptions {
    title: string;
    description?: string;
    members?: string[];
    isPublic?: boolean;
    photo?: string;
}
