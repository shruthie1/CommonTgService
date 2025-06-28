import { Api, TelegramClient } from 'telegram';
import { EntityLike } from 'telegram/define';
import bigInt from 'big-integer';
import { GroupOptions } from '../../../interfaces/telegram';
interface GroupCreationConfig {
    defaultGroupName: string;
    defaultFolderId: number;
    memberLimit: number;
    retryAttempts: number;
    delayBetweenOperations: number;
}
export declare function createGroup(client: TelegramClient, phoneNumber: string, config?: Partial<GroupCreationConfig & {
    usersToAdd?: string[];
}>): Promise<{
    id: bigInt.BigInteger;
    accessHash: bigInt.BigInteger;
}>;
export declare function archiveChat(client: TelegramClient, id: bigInt.BigInteger, accessHash: bigInt.BigInteger, folderId?: number): Promise<void>;
export declare function joinChannel(client: TelegramClient, entity: EntityLike): Promise<Api.Updates>;
export declare function getGroupMembers(client: TelegramClient, entity: EntityLike, options?: {
    limit?: number;
    offset?: number;
}): Promise<Array<{
    tgId: string;
    name: string;
    username: string;
}>>;
export declare function addContact(client: TelegramClient, data: {
    mobile: string;
    tgId: string;
}[], namePrefix: string): Promise<{
    success: number;
    failed: number;
    errors: string[];
}>;
export declare function addContacts(client: TelegramClient, mobiles: string[], namePrefix: string): Promise<{
    imported: number;
    retryContacts: string[];
    failed: string[];
}>;
export declare function leaveChannels(client: TelegramClient, phoneNumber: string, chats: string[]): Promise<{
    success: string[];
    failed: Array<{
        id: string;
        error: string;
    }>;
}>;
export declare function createGroupWithOptions(client: TelegramClient, options: GroupOptions): Promise<Api.Chat | Api.Channel>;
export declare function createGroupOrChannel(client: TelegramClient, options: GroupOptions): Promise<Api.Updates>;
export declare function addMembersToGroup(client: TelegramClient, groupId: string, userIds: string[]): Promise<{
    success: string[];
    failed: Array<{
        id: string;
        error: string;
    }>;
}>;
export declare function removeMembersFromGroup(client: TelegramClient, groupId: string, userIds: string[]): Promise<{
    success: string[];
    failed: Array<{
        id: string;
        error: string;
    }>;
}>;
export declare function promoteUserToAdmin(client: TelegramClient, groupId: string, userId: string, adminRights?: Partial<Api.ChatAdminRights>, rank?: string): Promise<void>;
export declare function updateGroupInfo(client: TelegramClient, groupId: string, options: {
    title?: string;
    description?: string;
    photo?: string;
}): Promise<{
    title: boolean;
    description: boolean;
    photo: boolean;
}>;
export declare function getChannelInfo(client: TelegramClient, sendIds?: boolean, options?: {
    limit?: number;
    includeArchived?: boolean;
}): Promise<{
    chatsArrayLength: number;
    canSendTrueCount: number;
    canSendFalseCount: number;
    ids: string[];
    canSendFalseChats: string[];
    errors: string[];
}>;
export {};
