export declare enum MessageType {
    ALL = "all",
    TEXT = "text",
    PHOTO = "photo",
    VIDEO = "video",
    VOICE = "voice",
    DOCUMENT = "document"
}
export declare class MessageSearchDto {
    chatId: string;
    query?: string;
    types?: MessageType[];
    offset?: number;
    limit?: number;
}
