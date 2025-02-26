export declare enum MediaType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document",
    VOICE = "voice",
    AUDIO = "audio"
}
export declare class MediaSearchDto {
    chatId: string;
    types: MediaType[];
    offset?: number;
    limit?: number;
}
export declare class MediaFilterDto {
    chatId: string;
    types: MediaType[];
    startDate?: string;
    endDate?: string;
    offset?: number;
    limit?: number;
}
export declare class SendMediaDto {
    chatId: string;
    url: string;
    caption?: string;
    filename: string;
    type: MediaType;
}
export declare class MediaAlbumItemDto {
    url: string;
    type: MediaType;
    caption?: string;
}
export declare class SendMediaAlbumDto {
    chatId: string;
    media: MediaAlbumItemDto[];
}
export declare class VoiceMessageDto {
    chatId: string;
    url: string;
    duration?: number;
    caption?: string;
}
export declare class MediaDownloadDto {
    messageId: number;
    chatId: string;
}
