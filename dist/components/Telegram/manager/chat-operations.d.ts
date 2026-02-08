import { Api } from 'telegram';
import { TotalList } from 'telegram/Helpers';
import { EntityLike } from 'telegram/define';
import { TgContext, ChatListResult, ChatStatistics, MessageStats, TopPrivateChatsResult, PerChatCallStats, SelfMessagesInfo, ChatSettingsUpdate, ChatFolderCreateOptions, ChatFolder, MessageItem, ChatMediaCounts, ChatCallHistory, CallHistoryEntry } from './types';
export declare function safeGetEntityById(ctx: TgContext, entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null>;
export declare function getMe(ctx: TgContext): Promise<Api.User>;
export declare function getchatId(ctx: TgContext, username: string): Promise<Api.TypeInputPeer>;
export declare function getEntity(ctx: TgContext, entity: EntityLike): Promise<Api.User | Api.Chat | Api.Channel>;
export declare function getMessages(ctx: TgContext, entityLike: Api.TypeEntityLike, limit?: number): Promise<TotalList<Api.Message>>;
export declare function getAllChats(ctx: TgContext): Promise<ReturnType<Api.TypeChat['toJSON']>[]>;
export declare function getMessagesNew(ctx: TgContext, chatId: string, offset?: number, limit?: number): Promise<MessageItem[]>;
export declare function getSelfMSgsInfo(ctx: TgContext, limit?: number): Promise<SelfMessagesInfo>;
export declare function getChatStatistics(ctx: TgContext, chatId: string, period: 'day' | 'week' | 'month'): Promise<ChatStatistics>;
export declare function getMessageStats(ctx: TgContext, options: {
    chatId: string;
    period: 'day' | 'week' | 'month';
    fromDate?: Date;
}): Promise<MessageStats>;
export declare function getChatMediaCounts(ctx: TgContext, chatId: string): Promise<ChatMediaCounts>;
export declare function getCallLogStats(ctx: TgContext, maxCalls?: number): Promise<{
    totalCalls: number;
    outgoing: number;
    incoming: number;
    video: number;
    audio: number;
    chats: (PerChatCallStats & {
        chatId: string;
    })[];
}>;
export declare function getCallLog(ctx: TgContext, maxCalls?: number): Promise<Record<string, CallHistoryEntry[]>>;
export declare function getChatCallHistory(ctx: TgContext, chatId: string, limit?: number, includeCalls?: boolean): Promise<ChatCallHistory>;
export declare function getChats(ctx: TgContext, options: {
    limit?: number;
    offsetDate?: number;
    folderId?: number;
    archived?: boolean;
    peerType?: 'all' | 'user' | 'group' | 'channel';
    ignorePinned?: boolean;
    includePhotos?: boolean;
}): Promise<ChatListResult>;
export declare function updateChatSettings(ctx: TgContext, settings: ChatSettingsUpdate): Promise<boolean>;
export declare function createChatFolder(ctx: TgContext, options: ChatFolderCreateOptions): Promise<{
    id: number;
    name: string;
    options: Record<string, boolean>;
}>;
export declare function getChatFolders(ctx: TgContext): Promise<ChatFolder[]>;
export declare function getTopPrivateChats(ctx: TgContext, limit?: number, enrichMedia?: boolean, offsetDate?: number): Promise<TopPrivateChatsResult>;
export declare function createBot(ctx: TgContext, options: {
    name: string;
    username: string;
    description?: string;
    aboutText?: string;
    profilePhotoUrl?: string;
}): Promise<{
    botToken: string;
    username: string;
}>;
