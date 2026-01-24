export declare enum MediaType {
    PHOTO = "photo",
    VIDEO = "video",
    DOCUMENT = "document",
    VOICE = "voice",
    ALL = "all"
}
export declare class MediaItemDto {
    messageId: number;
    chatId: string;
    type: MediaType;
    date: number;
    caption?: string;
    fileSize?: number;
    mimeType?: string;
    filename?: string;
    thumbnail?: string;
    width?: number;
    height?: number;
    duration?: number;
    mediaDetails?: Record<string, any>;
}
export declare class PaginationDto {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    nextMaxId?: number;
    prevMaxId?: number;
    firstMessageId?: number;
    lastMessageId?: number;
}
export declare class MediaFiltersDto {
    chatId: string;
    types?: MediaType[];
    startDate?: string;
    endDate?: string;
}
export declare class MediaGroupDto {
    type: MediaType;
    count: number;
    items: MediaItemDto[];
    pagination: PaginationDto;
}
export declare class PaginatedMediaResponseDto {
    data?: MediaItemDto[];
    groups?: MediaGroupDto[];
    pagination: PaginationDto;
    filters: MediaFiltersDto;
}
export declare class MediaMetadataQueryDto {
    chatId: string;
    types?: MediaType[];
    startDate?: string;
    endDate?: string;
    limit?: number;
    maxId?: number;
    minId?: number;
}
