"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatFolder = createChatFolder;
exports.getChatFolders = getChatFolders;
exports.updateChatFolder = updateChatFolder;
exports.deleteChatFolder = deleteChatFolder;
exports.addChatsToFolder = addChatsToFolder;
exports.removeChatsFromFolder = removeChatsFromFolder;
exports.getChatsInFolder = getChatsInFolder;
const telegram_1 = require("telegram");
function getPeerId(peer) {
    if (peer.userId)
        return `user_${peer.userId}`;
    if (peer.chatId)
        return `chat_${peer.chatId}`;
    if (peer.channelId)
        return `channel_${peer.channelId}`;
    return peer.toString();
}
function validateChatIds(chatIds) {
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
async function processChatIds(client, chatIds) {
    const peers = [];
    for (const chatId of chatIds) {
        try {
            const peer = await client.getInputEntity(chatId);
            peers.push(peer);
        }
        catch (error) {
            console.warn(`Failed to get entity for chat ${chatId}:`, error);
        }
    }
    return peers;
}
async function createChatFolder(client, options) {
    validateChatIds(options.includedChats);
    if (options.excludedChats) {
        validateChatIds(options.excludedChats);
    }
    const existingFilters = await client.invoke(new telegram_1.Api.messages.GetDialogFilters());
    const existingIds = new Set((existingFilters.filters || []).map((f) => f.id));
    let newId = Math.floor(Math.random() * 100000) + 1000;
    while (existingIds.has(newId)) {
        newId = Math.floor(Math.random() * 100000) + 1000;
    }
    const includePeers = await processChatIds(client, options.includedChats);
    const excludePeers = await processChatIds(client, options.excludedChats || []);
    const folder = new telegram_1.Api.DialogFilter({
        id: newId,
        title: new telegram_1.Api.TextWithEntities({
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
    await client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({
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
async function getChatFolders(client) {
    const filters = await client.invoke(new telegram_1.Api.messages.GetDialogFilters());
    return (filters.filters || []).map((filter) => ({
        id: filter.id ?? 0,
        title: filter.title?.text ?? '',
        includedChatsCount: Array.isArray(filter.includePeers) ? filter.includePeers.length : 0,
        excludedChatsCount: Array.isArray(filter.excludePeers) ? filter.excludePeers.length : 0
    }));
}
async function updateChatFolder(client, folderId, options) {
    const existingFilters = await client.invoke(new telegram_1.Api.messages.GetDialogFilters());
    const existingFilter = existingFilters.filters?.find((f) => f.id === folderId);
    if (!existingFilter) {
        throw new Error(`Chat folder with ID ${folderId} not found`);
    }
    let includePeers = existingFilter.includePeers || [];
    if (options.includedChats) {
        validateChatIds(options.includedChats);
        includePeers = await processChatIds(client, options.includedChats);
    }
    let excludePeers = existingFilter.excludePeers || [];
    if (options.excludedChats) {
        validateChatIds(options.excludedChats);
        excludePeers = await processChatIds(client, options.excludedChats);
    }
    const updatedFolder = new telegram_1.Api.DialogFilter({
        id: folderId,
        title: new telegram_1.Api.TextWithEntities({
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
    await client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: updatedFolder
    }));
}
async function deleteChatFolder(client, folderId) {
    await client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: undefined
    }));
}
async function addChatsToFolder(client, folderId, chatIds) {
    validateChatIds(chatIds);
    const existingFilters = await client.invoke(new telegram_1.Api.messages.GetDialogFilters());
    const existingFilter = existingFilters.filters?.find((f) => f.id === folderId);
    if (!existingFilter) {
        throw new Error(`Chat folder with ID ${folderId} not found`);
    }
    const newIncludePeers = await processChatIds(client, chatIds);
    const existingPeers = existingFilter.includePeers || [];
    const existingPeerIds = new Set(existingPeers.map((peer) => getPeerId(peer)));
    const uniqueNewPeers = newIncludePeers.filter(peer => {
        const peerId = getPeerId(peer);
        return !existingPeerIds.has(peerId);
    });
    const allIncludePeers = [...existingPeers, ...uniqueNewPeers];
    const updatedFolder = new telegram_1.Api.DialogFilter({
        id: folderId,
        title: existingFilter.title || new telegram_1.Api.TextWithEntities({ text: 'Folder', entities: [] }),
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
    await client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: updatedFolder
    }));
}
async function removeChatsFromFolder(client, folderId, chatIds) {
    validateChatIds(chatIds);
    const existingFilters = await client.invoke(new telegram_1.Api.messages.GetDialogFilters());
    const existingFilter = existingFilters.filters?.find((f) => f.id === folderId);
    if (!existingFilter) {
        throw new Error(`Chat folder with ID ${folderId} not found`);
    }
    const peersToRemove = await processChatIds(client, chatIds);
    const peerIdsToRemove = new Set(peersToRemove.map(peer => getPeerId(peer)));
    const filteredIncludePeers = (existingFilter.includePeers || []).filter((peer) => {
        const peerId = getPeerId(peer);
        return !peerIdsToRemove.has(peerId);
    });
    const updatedFolder = new telegram_1.Api.DialogFilter({
        id: folderId,
        title: existingFilter.title || new telegram_1.Api.TextWithEntities({ text: 'Folder', entities: [] }),
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
    await client.invoke(new telegram_1.Api.messages.UpdateDialogFilter({
        id: folderId,
        filter: updatedFolder
    }));
}
async function getChatsInFolder(client, folderId) {
    const dialogs = await client.getDialogs({
        folder: folderId,
        limit: 100
    });
    return dialogs.map(dialog => ({
        id: dialog.entity.id.toString(),
        title: 'title' in dialog.entity ? dialog.entity.title :
            'firstName' in dialog.entity ? dialog.entity.firstName + (dialog.entity.lastName ? ' ' + dialog.entity.lastName : '') :
                'Unknown',
        type: dialog.entity instanceof telegram_1.Api.User ? 'user' :
            dialog.entity instanceof telegram_1.Api.Chat ? 'group' :
                dialog.entity instanceof telegram_1.Api.Channel ? 'channel' : 'user'
    }));
}
//# sourceMappingURL=chat-folders.js.map