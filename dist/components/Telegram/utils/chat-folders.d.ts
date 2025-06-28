import { TelegramClient } from 'telegram';
export declare function createChatFolder(client: TelegramClient, options: {
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
}): Promise<{
    id: number;
    name: string;
    options: {
        includeContacts: boolean;
        includeNonContacts: boolean;
        includeGroups: boolean;
        includeBroadcasts: boolean;
        includeBots: boolean;
        excludeMuted: boolean;
        excludeRead: boolean;
        excludeArchived: boolean;
    };
}>;
export declare function getChatFolders(client: TelegramClient): Promise<Array<{
    id: number;
    title: string;
    includedChatsCount: number;
    excludedChatsCount: number;
}>>;
export declare function updateChatFolder(client: TelegramClient, folderId: number, options: {
    name?: string;
    includedChats?: string[];
    excludedChats?: string[];
    includeContacts?: boolean;
    includeNonContacts?: boolean;
    includeGroups?: boolean;
    includeBroadcasts?: boolean;
    includeBots?: boolean;
    excludeMuted?: boolean;
    excludeRead?: boolean;
    excludeArchived?: boolean;
}): Promise<void>;
export declare function deleteChatFolder(client: TelegramClient, folderId: number): Promise<void>;
export declare function addChatsToFolder(client: TelegramClient, folderId: number, chatIds: string[]): Promise<void>;
export declare function removeChatsFromFolder(client: TelegramClient, folderId: number, chatIds: string[]): Promise<void>;
export declare function getChatsInFolder(client: TelegramClient, folderId: number): Promise<Array<{
    id: string;
    title: string;
    type: 'user' | 'group' | 'channel';
}>>;
