export declare class LinkPreviewOptionsDto {
    isDisabled?: boolean;
    url?: string;
    preferSmallMedia?: boolean;
    preferLargeMedia?: boolean;
    showAboveText?: boolean;
}
export declare class SendMessageOptionsDto {
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
    disableWebPagePreview?: boolean;
    disableNotification?: boolean;
    replyToMessageId?: number;
    allowSendingWithoutReply?: boolean;
    protectContent?: boolean;
    linkPreviewOptions?: LinkPreviewOptionsDto;
}
export declare class SendMessageDto {
    message: string;
    options?: SendMessageOptionsDto;
}
