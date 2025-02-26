export interface ActiveClientSetup {
    days?: number;
    archiveOld: boolean;
    formalities: boolean;
    newMobile: string;
    existingMobile: string;
    clientId: string;
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


export interface MessageScheduleOptions {
    chatId: string;
    message: string;
    scheduledTime: Date;
    replyTo?: number;
    silent?: boolean;
}
export interface GroupOptions {
    title: string;
    members?: string[];
    photo?: string;
    description?: string;
    address?: string;
    slowMode?: number;
    megagroup?: boolean;
    forImport?: boolean;
}

export interface ChannelInfo {
    chatsArrayLength: number;
    canSendTrueCount: number;
    canSendFalseCount: number;
    ids: string[];
    canSendFalseChats: string[];
}