export declare class MediaOptionsDto {
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
    caption?: string;
    disableNotification?: boolean;
    replyToMessageId?: number;
    allowSendingWithoutReply?: boolean;
    protectContent?: boolean;
    hasSpoiler?: boolean;
}
export declare class VideoOptionsDto extends MediaOptionsDto {
    duration?: number;
    width?: number;
    height?: number;
    supportsStreaming?: boolean;
}
export declare class AudioOptionsDto extends MediaOptionsDto {
    duration?: number;
    performer?: string;
    title?: string;
}
export declare class DocumentOptionsDto extends MediaOptionsDto {
    disableContentTypeDetection?: boolean;
}
export declare class SendPhotoDto {
    photo: string;
    options?: MediaOptionsDto;
}
export declare class SendVideoDto {
    video: string;
    options?: VideoOptionsDto;
}
export declare class SendAudioDto {
    audio: string;
    options?: AudioOptionsDto;
}
export declare class SendDocumentDto {
    document: string;
    options?: DocumentOptionsDto;
}
