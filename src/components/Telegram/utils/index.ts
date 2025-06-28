// Core operations
export * from './core-operations';

// Group and channel management (specific exports to avoid conflicts)
export {
    createGroup,
    archiveChat,
    joinChannel,
    getGroupMembers,
    addContact as addContactToGroup,
    addContacts as addContactsToGroup,
    leaveChannels as leaveChannelsFromGroup,
    createGroupWithOptions,
    createGroupOrChannel,
    addMembersToGroup,
    removeMembersFromGroup,
    promoteUserToAdmin,
    updateGroupInfo,
    getChannelInfo
} from './group-management';

// Message management
export * from './message-management';

// Contact management

export {
    addContact as addContactFromContacts,
    addContacts as addContactsFromContacts,
    sendContactsFile,
    exportContacts,
    importContacts,
    manageBlockList,
    getContactStatistics
} from './contact-management';

// Privacy and session management
export * from './privacy-session';

// Statistics and analytics
export * from './statistics';

// Bot management
export * from './bot-management';

// Media management (with specific exports to avoid conflicts)
export {
    getMediaMetadata,
    getAllMediaMetaData,
    getFilteredMedia,
    sendMediaBatch,
    updateChatSettings,
    forwardMediaToChannel,
    forwardMediaToBot
} from './media-management';

// Chat folders management
export * from './chat-folders';
