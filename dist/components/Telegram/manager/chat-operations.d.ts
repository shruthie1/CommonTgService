import { Api } from 'telegram';
import { TotalList } from 'telegram/Helpers';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
import { TgContext, ChatListItem, ChatStatistics, MessageStats, TopPrivateChat, PerChatCallStats, SelfMessagesInfo, ChatSettingsUpdate, ChatFolderCreateOptions, ChatFolder, MessageItem } from './types';
import { Dialog } from 'telegram/tl/custom/dialog';
export declare function safeGetEntityById(ctx: TgContext, entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null>;
export declare function getMe(ctx: TgContext): Promise<Api.User>;
export declare function getchatId(ctx: TgContext, username: string): Promise<Api.TypeInputPeer>;
export declare function getEntity(ctx: TgContext, entity: EntityLike): Promise<Api.User | Api.Chat | Api.Channel>;
export declare function getMessages(ctx: TgContext, entityLike: Api.TypeEntityLike, limit?: number): Promise<TotalList<Api.Message>>;
export declare function getDialogs(ctx: TgContext, params: IterDialogsParams): Promise<Dialog[] & {
    total: number;
}>;
export declare function getAllChats(ctx: TgContext): Promise<ReturnType<Api.TypeChat['toJSON']>[]>;
export declare function getMessagesNew(ctx: TgContext, chatId: string, offset?: number, limit?: number): Promise<MessageItem[]>;
export declare function getSelfMSgsInfo(ctx: TgContext, limit?: number): Promise<SelfMessagesInfo>;
export declare function getCallLog(ctx: TgContext, limit?: number): Promise<{
    outgoing: number;
    incoming: number;
    video: number;
    audio: number;
    chatCallCounts: Array<{
        chatId: string;
        phone?: string;
        username?: string;
        name: string;
        count: number;
        msgs?: number;
        video?: number;
        photo?: number;
        peerType: 'user' | 'group' | 'channel';
    }>;
    totalCalls: number;
    analyzedCalls: number;
}>;
export declare function getCallLogsInternal(ctx: TgContext, maxCalls?: number): Promise<Record<string, PerChatCallStats>>;
export declare function getChatStatistics(ctx: TgContext, chatId: string, period: 'day' | 'week' | 'month'): Promise<ChatStatistics>;
export declare function getMessageStats(ctx: TgContext, options: {
    chatId: string;
    period: 'day' | 'week' | 'month';
    fromDate?: Date;
}): Promise<MessageStats>;
export declare function getChats(ctx: TgContext, options: {
    limit?: number;
    offsetDate?: number;
    offsetId?: number;
    offsetPeer?: string;
    folderId?: number;
    includePhotos?: boolean;
}): Promise<ChatListItem[]>;
export declare function updateChatSettings(ctx: TgContext, settings: ChatSettingsUpdate): Promise<boolean>;
export declare function createChatFolder(ctx: TgContext, options: ChatFolderCreateOptions): Promise<{
    id: number;
    name: string;
    options: Record<string, boolean>;
}>;
export declare function getChatFolders(ctx: TgContext): Promise<ChatFolder[]>;
export declare function getTopPrivateChats(ctx: TgContext, limit?: number): Promise<TopPrivateChat[]>;
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
