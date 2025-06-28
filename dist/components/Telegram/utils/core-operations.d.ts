import { Api, TelegramClient } from 'telegram';
import { NewMessageEvent } from 'telegram/events';
import { TotalList } from 'telegram/Helpers';
import { IterDialogsParams } from 'telegram/client/dialogs';
import { EntityLike } from 'telegram/define';
export declare function createClient(sessionString: string, apiId: number, apiHash: string, handler?: boolean, handlerFn?: (event: NewMessageEvent) => Promise<void>): Promise<TelegramClient>;
export declare function destroy(client: TelegramClient): Promise<void>;
export declare function getChatId(client: TelegramClient, username: string): Promise<any>;
export declare function getMe(client: TelegramClient): Promise<Api.User>;
export declare function errorHandler(client: TelegramClient, error: any): Promise<void>;
export declare function getGrpMembers(client: TelegramClient, entity: EntityLike): Promise<{
    totalCount: number;
    members: Array<{
        id: string;
        username?: string;
        firstName?: string;
        lastName?: string;
        isBot: boolean;
        isAdmin: boolean;
    }>;
}>;
export declare function getMessages(client: TelegramClient, entityLike: Api.TypeEntityLike, limit?: number): Promise<TotalList<Api.Message>>;
export declare function getDialogs(client: TelegramClient, params: IterDialogsParams): Promise<any>;
export declare function channelInfo(client: TelegramClient, sendIds?: boolean): Promise<{
    chatsArrayLength: number;
    canSendTrueCount: number;
    canSendFalseCount: number;
    ids: string[];
    canSendFalseChats: string[];
}>;
export declare function leaveChannels(client: TelegramClient, chats: string[]): Promise<void>;
export declare function getEntity(client: TelegramClient, entity: Api.TypeEntityLike): Promise<any>;
export declare function safeGetEntity(client: TelegramClient, entityId: string): Promise<Api.TypeUser | Api.TypeChat | Api.PeerChannel | null>;
export declare function createOrJoinChannel(client: TelegramClient, channel: string): Promise<void>;
export declare function getChats(client: TelegramClient, options: {
    limit?: number;
    offsetDate?: number;
    offsetId?: number;
    offsetPeer?: string;
    folderId?: number;
}): Promise<Array<{
    id: string;
    title: string | null;
    username: string | null;
    type: 'user' | 'group' | 'channel' | 'unknown';
    unreadCount: number;
    lastMessage: {
        id: number;
        text: string;
        date: Date;
    } | null;
}>>;
