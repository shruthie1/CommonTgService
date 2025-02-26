export enum PrivacyLevelEnum {
    everybody = 'everybody',
    contacts = 'contacts',
    nobody = 'nobody'
}

export type PrivacyLevel = keyof typeof PrivacyLevelEnum;

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
    memberRestrictions?: {
        sendMessages?: boolean;
        sendMedia?: boolean;
        sendStickers?: boolean;
        sendGifs?: boolean;
        sendGames?: boolean;
        sendInline?: boolean;
        embedLinks?: boolean;
    };
}

export interface ChannelInfo {
    chatsArrayLength: number;
    canSendTrueCount: number;
    canSendFalseCount: number;
    ids: string[];
    canSendFalseChats: string[];
}

export interface ChatFolderOptions {
    name: string;
    includedChats: string[];
    excludedChats?: string[];
    includeContacts?: boolean;
    includeNonContacts?: boolean;
    includeGroups?: boolean;
    includeBroadcasts?: boolean;
    includeBots?: boolean;
    excludeMuted?: boolean;
    excludeRead?: boolean;
    excludeArchived?: boolean;
}