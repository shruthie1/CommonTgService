export declare enum MediaType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document",
    VOICE = "voice",
    AUDIO = "audio"
}
export declare class BaseMediaOperationDto {
    chatId: string;
}
export declare class MediaSearchDto extends BaseMediaOperationDto {
    types: MediaType[];
    offset?: number;
    limit?: number;
}
export declare class MediaFilterDto extends MediaSearchDto {
    startDate?: string;
    endDate?: string;
}
export declare class SendMediaDto extends BaseMediaOperationDto {
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
export declare class SendMediaAlbumDto extends BaseMediaOperationDto {
    media: MediaAlbumItemDto[];
}
export declare class VoiceMessageDto extends BaseMediaOperationDto {
    url: string;
    duration?: number;
    caption?: string;
}
