import { Api, TelegramClient } from 'telegram';

/**
 * Extract a unique identifier from a peer object for comparison
 */
function getPeerId(peer: any): string {
    if (peer.userId) return `user_${peer.userId}`;
    if (peer.chatId) return `chat_${peer.chatId}`;
    if (peer.channelId) return `channel_${peer.channelId}`;
    return peer.toString();
}

/**
 * Validate input parameters
 */
function validateChatIds(chatIds: string[]): void {
    if (!Array.isArray(chatIds)) {
        throw new Error('Chat IDs must be an array');
    }
    if (chatIds.length === 0) {
        throw new Error('Chat IDs array cannot be empty');
    }
    for (const id of chatIds) {
        if (typeof id !== 'string' || id.trim() === '') {
            throw new Error('All chat IDs must be non-empty strings');
        }
    }
}

/**
 * Process chat IDs and convert them to peer objects with error handling
 */
async function processChatIds(client: TelegramClient, chatIds: string[]): Promise<any[]> {
    const peers = [];
    for (const chatId of chatIds) {
        try {
            const peer = await client.getInputEntity(chatId);
            peers.push(peer);
        } catch (error) {
            console.warn(`Failed to get entity for chat ${chatId}:`, error);
        }
    }
    return peers;
}

export async function createChatFolder(client: TelegramClient, options: {
    name: string,
    includedChats: string[],
    excludedChats?: string[],
    includeContacts?: boolean,
    includeNonContacts?: boolean,
    includeGroups?: boolean,
    includeBroadcasts?: boolean,
    includeBots?: boolean,
    excludeMuted?: boolean,
    excludeRead?: boolean,
    excludeArchived?: boolean
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
}> {
    // Validate inputs
    validateChatIds(options.includedChats);
    if (options.excludedChats) {
        validateChatIds(options.excludedChats);
    }

    // Get existing filters to avoid ID collisions
    const existingFilters = await client.invoke(new Api.messages.GetDialogFilters());
    const existingIds = new Set((existingFilters.filters || []).map((f: any) => f.id));

    // Generate a unique ID
    let newId = Math.floor(Math.random() * 100000) + 1000; // Larger range, avoid 0-999
    while (existingIds.has(newId)) {
        newId = Math.floor(Math.random() * 100000) + 1000;
    }

    // Process chat IDs with error handling
    const includePeers = await processChatIds(client, options.includedChats);
    const excludePeers = await processChatIds(client, options.excludedChats || []);

    const folder = new Api.DialogFilter({
        id: newId,
        title: new Api.TextWithEntities({
            text: options.name,
            entities: []
        }),
        includePeers,
        excludePeers,
        pinnedPeers: [],
        contacts: options.includeContacts ?? true,
        nonContacts: options.includeNonContacts ?? true,
        groups: options.includeGroups ?? true,
        broadcasts: options.includeBroadcasts ?? true,
        bots: options.includeBots ?? true,
        excludeMuted: options.excludeMuted ?? false,
        excludeRead: options.excludeRead ?? false,
        excludeArchived: options.excludeArchived ?? false
    });

    await client.invoke(new Api.messages.UpdateDialogFilter({
        id: folder.id,
        filter: folder
    }));

    return {
        id: folder.id,
        name: options.name,
        options: {
            includeContacts: folder.contacts,
            includeNonContacts: folder.nonContacts,
            includeGroups: folder.groups,
            includeBroadcasts: folder.broadcasts,
            includeBots: folder.bots,
            excludeMuted: folder.excludeMuted,
            excludeRead: folder.excludeRead,
            excludeArchived: folder.excludeArchived
        }
    };
}

/**
 * Get all chat folders
 */
export async function getChatFolders(client: TelegramClient): Promise<Array<{
    id: number;
    title: string;
    includedChatsCount: number;
    excludedChatsCount: number;
}>> {
    const filters = await client.invoke(new Api.messages.GetDialogFilters());
    // DialogFilters object has a 'filters' property which is an array
    return (filters.filters || []).map((filter: any) => ({
        id: filter.id ?? 0,
        title: filter.title?.text ?? '',
        includedChatsCount: Array.isArray(filter.includePeers) ? filter.includePeers.length : 0,
        excludedChatsCount: Array.isArray(filter.excludePeers) ? filter.excludePeers.length : 0
    }));
}

/**
 * Update an existing chat folder
 */
export async function updateChatFolder(client: TelegramClient, folderId: number, options: {
    name?: string,
    includedChats?: string[],
    excludedChats?: string[],
    includeContacts?: boolean,
    includeNonContacts?: boolean,
    includeGroups?: boolean,
    includeBroadcasts?: boolean,
    includeBots?: boolean,
    excludeMuted?: boolean,
    excludeRead?: boolean,
    excludeArchived?: boolean
}): Promise<void> {
    const existingFilters = await client.invoke(new Api.messages.GetDialogFilters());
    const existingFilter = existingFilters.filters?.find((f: any) => f.id === folderId) as any;

    if (!existingFilter) {
        throw new Error(`Chat folder with ID ${folderId} not found`);
    }

    // Process includedChats with error handling
    let includePeers = existingFilter.includePeers || [];
    if (options.includedChats) {
        validateChatIds(options.includedChats);
        includePeers = await processChatIds(client, options.includedChats);
    }

    // Process excludedChats with error handling
    let excludePeers = existingFilter.excludePeers || [];
    if (options.excludedChats) {
        validateChatIds(options.excludedChats);
        excludePeers = await processChatIds(client, options.excludedChats);
    }

    const updatedFolder = new Api.DialogFilter({
        id: folderId,
        title: new Api.TextWithEntities({
            text: options.name || (existingFilter.title?.text || ''),
            entities: []
        }),
        includePeers,
        excludePeers,
        pinnedPeers: existingFilter.pinnedPeers || [],
        contacts: options.includeContacts ?? (existingFilter.contacts ?? true),
        nonContacts: options.includeNonContacts ?? (existingFilter.nonContacts ?? true),
        groups: options.includeGroups ?? (existingFilter.groups ?? true),
        broadcasts: options.includeBroadcasts ?? (existingFilter.broadcasts ?? true),
        bots: options.includeBots ?? (existingFilter.bots ?? true),
        excludeMuted: options.excludeMuted ?? (existingFilter.excludeMuted ?? false),
        excludeRead: options.excludeRead ?? (existingFilter.excludeRead ?? false),
        excludeArchived: options.excludeArchived ?? (existingFilter.excludeArchived ?? false)
    });

    await client.invoke(new Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: updatedFolder
    }));
}

/**
 * Delete a chat folder
 */
export async function deleteChatFolder(client: TelegramClient, folderId: number): Promise<void> {
    await client.invoke(new Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: undefined
    }));
}

/**
 * Add chats to a folder
 */
export async function addChatsToFolder(client: TelegramClient, folderId: number, chatIds: string[]): Promise<void> {
    validateChatIds(chatIds);

    const existingFilters = await client.invoke(new Api.messages.GetDialogFilters());
    const existingFilter = existingFilters.filters?.find((f: any) => f.id === folderId) as any;

    if (!existingFilter) {
        throw new Error(`Chat folder with ID ${folderId} not found`);
    }

    // Get new peers with error handling
    const newIncludePeers = await processChatIds(client, chatIds);

    // Combine with existing peers and remove duplicates
    const existingPeers = existingFilter.includePeers || [];
    const existingPeerIds = new Set(existingPeers.map((peer: any) => getPeerId(peer)));

    const uniqueNewPeers = newIncludePeers.filter(peer => {
        const peerId = getPeerId(peer);
        return !existingPeerIds.has(peerId);
    });

    const allIncludePeers = [...existingPeers, ...uniqueNewPeers];

    const updatedFolder = new Api.DialogFilter({
        id: folderId,
        title: existingFilter.title || new Api.TextWithEntities({ text: 'Folder', entities: [] }),
        includePeers: allIncludePeers,
        excludePeers: existingFilter.excludePeers || [],
        pinnedPeers: existingFilter.pinnedPeers || [],
        contacts: existingFilter.contacts ?? true,
        nonContacts: existingFilter.nonContacts ?? true,
        groups: existingFilter.groups ?? true,
        broadcasts: existingFilter.broadcasts ?? true,
        bots: existingFilter.bots ?? true,
        excludeMuted: existingFilter.excludeMuted ?? false,
        excludeRead: existingFilter.excludeRead ?? false,
        excludeArchived: existingFilter.excludeArchived ?? false
    });

    await client.invoke(new Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: updatedFolder
    }));
}

/**
 * Remove chats from a folder
 */
export async function removeChatsFromFolder(client: TelegramClient, folderId: number, chatIds: string[]): Promise<void> {
    validateChatIds(chatIds);

    const existingFilters = await client.invoke(new Api.messages.GetDialogFilters());
    const existingFilter = existingFilters.filters?.find((f: any) => f.id === folderId) as any;

    if (!existingFilter) {
        throw new Error(`Chat folder with ID ${folderId} not found`);
    }

    // Get peer objects for the chats to remove
    const peersToRemove = await processChatIds(client, chatIds);

    // Create set of peer IDs to remove
    const peerIdsToRemove = new Set(peersToRemove.map(peer => getPeerId(peer)));

    // Filter out the peers to remove
    const filteredIncludePeers = (existingFilter.includePeers || []).filter((peer: any) => {
        const peerId = getPeerId(peer);
        return !peerIdsToRemove.has(peerId);
    });

    const updatedFolder = new Api.DialogFilter({
        id: folderId,
        title: existingFilter.title || new Api.TextWithEntities({ text: 'Folder', entities: [] }),
        includePeers: filteredIncludePeers,
        excludePeers: existingFilter.excludePeers || [],
        pinnedPeers: existingFilter.pinnedPeers || [],
        contacts: existingFilter.contacts ?? true,
        nonContacts: existingFilter.nonContacts ?? true,
        groups: existingFilter.groups ?? true,
        broadcasts: existingFilter.broadcasts ?? true,
        bots: existingFilter.bots ?? true,
        excludeMuted: existingFilter.excludeMuted ?? false,
        excludeRead: existingFilter.excludeRead ?? false,
        excludeArchived: existingFilter.excludeArchived ?? false
    });

    await client.invoke(new Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: updatedFolder
    }));
}

/**
 * Get chats in a specific folder
 */
export async function getChatsInFolder(client: TelegramClient, folderId: number): Promise<Array<{
    id: string;
    title: string;
    type: 'user' | 'group' | 'channel';
}>> {
    const dialogs = await client.getDialogs({
        folder: folderId,
        limit: 100
    });

    return dialogs.map(dialog => ({
        id: dialog.entity.id.toString(),
        title: 'title' in dialog.entity ? dialog.entity.title :
               'firstName' in dialog.entity ? dialog.entity.firstName + (dialog.entity.lastName ? ' ' + dialog.entity.lastName : '') :
               'Unknown',
        type: dialog.entity instanceof Api.User ? 'user' :
              dialog.entity instanceof Api.Chat ? 'group' :
              dialog.entity instanceof Api.Channel ? 'channel' : 'user'
    }));
}
