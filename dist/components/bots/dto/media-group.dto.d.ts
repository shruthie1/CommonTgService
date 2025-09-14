import { MediaOptionsDto } from './media.dto';
export declare class MediaGroupItemDto {
    type: 'photo' | 'video' | 'audio' | 'document';
    media: string;
    caption?: string;
    parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    hasSpoiler?: boolean;
    extension?: string;
    duration?: number;
    width?: number;
    height?: number;
    supportsStreaming?: boolean;
    performer?: string;
    title?: string;
}
export declare class SendMediaGroupDto {
    media: MediaGroupItemDto[];
    options?: MediaOptionsDto;
}
