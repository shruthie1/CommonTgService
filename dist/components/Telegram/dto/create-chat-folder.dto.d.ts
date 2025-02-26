export declare class CreateChatFolderDto {
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
