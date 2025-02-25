export interface ActiveClientSetup {
    days?: number;
    archiveOld: boolean;
    formalities: boolean;
    newMobile: string;
    existingMobile: string;
    clientId: string;
}

export interface MediaMessageMetadata {
    messageId: number;
    mediaType: 'photo' | 'video';
    thumb: string | null;
}

export interface BackupOptions {
    chatIds?: string[];
    includeMedia?: boolean;
    exportFormat?: 'json' | 'html';
    backupId?: string;
    beforeDate?: Date;
    afterDate?: Date;
    maxMessages?: number;
    outputPath?: string;
    mediaTypes?: ('photo' | 'video' | 'document' | 'audio')[];
    restoreToChat?: string;
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

export interface ContentFilter {
    chatId: string;
    keywords?: string[];
    mediaTypes?: ('photo' | 'video' | 'document')[];
    actions: ('delete' | 'warn' | 'mute')[];
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