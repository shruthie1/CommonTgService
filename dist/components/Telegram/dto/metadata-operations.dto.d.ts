export declare enum MetadataType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document"
}
export declare class MediaMetadataDto {
    chatId: string;
    offset?: number;
    limit?: number;
}
export declare enum DialogsPeerType {
    ALL = "all",
    USER = "user",
    GROUP = "group",
    CHANNEL = "channel"
}
export declare class BulkMessageOperationDto {
    fromChatId: string;
    toChatId: string;
    messageIds: number[];
}
