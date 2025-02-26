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
export declare class DialogsQueryDto {
    limit: number;
    offsetId?: number;
    archived?: boolean;
}
export declare class BulkMessageOperationDto {
    fromChatId: string;
    toChatId: string;
    messageIds: number[];
}
