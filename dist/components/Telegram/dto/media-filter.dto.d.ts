export declare enum MediaType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document",
    VOICE = "voice"
}
export declare class MediaFilterDto {
    chatId: string;
    types?: MediaType[];
    startDate?: string;
    endDate?: string;
    offset?: number;
    limit?: number;
}
