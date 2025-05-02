export declare enum MessageMediaType {
    ALL = "all",
    TEXT = "text",
    PHOTO = "photo",
    VIDEO = "video",
    VOICE = "voice",
    DOCUMENT = "document",
    ROUND_VIDEO = "roundVideo"
}
export declare enum SearchScope {
    CHAT = "chat",
    GLOBAL = "global"
}
export declare class SearchMessagesDto {
    chatId?: string;
    query?: string;
    types?: MessageMediaType[];
    minId?: number;
    maxId?: number;
    limit?: number;
    offsetId?: number;
    offsetDate?: number;
    startDate?: Date;
    endDate?: Date;
}
export declare class MessageTypeResult {
    messages: number[];
    total: number;
    data?: any;
}
export declare class SearchMessagesResponseDto {
    all?: MessageTypeResult;
    text?: MessageTypeResult;
    photo?: MessageTypeResult;
    video?: MessageTypeResult;
    voice?: MessageTypeResult;
    document?: MessageTypeResult;
    roundVideo?: MessageTypeResult;
}
