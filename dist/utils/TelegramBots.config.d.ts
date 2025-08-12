export declare enum ChannelCategory {
    CLIENT_UPDATES = "CLIENT_UPDATES",
    USER_WARNINGS = "USER_WARNINGS",
    VC_WARNINGS = "VC_WARNINGS",
    USER_REQUESTS = "USER_REQUESTS",
    VC_NOTIFICATIONS = "VC_NOTIFICATIONS",
    CHANNEL_NOTIFICATIONS = "CHANNEL_NOTIFICATIONS",
    ACCOUNT_NOTIFICATIONS = "ACCOUNT_NOTIFICATIONS",
    ACCOUNT_LOGIN_FAILURES = "ACCOUNT_LOGIN_FAILURES",
    PROMOTION_ACCOUNT = "PROMOTION_ACCOUNT",
    CLIENT_ACCOUNT = "CLIENT_ACCOUNT",
    PAYMENT_FAIL_QUERIES = "PAYMENT_FAIL_QUERIES",
    SAVED_MESSAGES = "SAVED_MESSAGES",
    HTTP_FAILURES = "HTTP_FAILURES",
    UNVDS = "UNVDS",
    PROM_LOGS1 = "PROM_LOGS1",
    PROM_LOGS2 = "PROM_LOGS2",
    UNAUTH_CALLS = "UNAUTH_CALLS"
}
export interface SendMessageOptions {
    parseMode?: 'HTML' | 'MarkdownV2' | 'Markdown';
    disableWebPagePreview?: boolean;
    disableNotification?: boolean;
    replyToMessageId?: number;
    allowSendingWithoutReply?: boolean;
    protectContent?: boolean;
    linkPreviewOptions?: {
        isDisabled?: boolean;
        url?: string;
        preferSmallMedia?: boolean;
        preferLargeMedia?: boolean;
        showAboveText?: boolean;
    };
}
export interface MediaOptions extends Omit<SendMessageOptions, 'disableWebPagePreview' | 'linkPreviewOptions'> {
    caption?: string;
    hasSpoiler?: boolean;
}
export interface PhotoOptions extends MediaOptions {
}
export interface VideoOptions extends MediaOptions {
    duration?: number;
    width?: number;
    height?: number;
    thumbnail?: Buffer | string;
    supportsStreaming?: boolean;
}
export interface AudioOptions extends MediaOptions {
    duration?: number;
    performer?: string;
    title?: string;
    thumbnail?: Buffer | string;
}
export interface DocumentOptions extends MediaOptions {
    thumbnail?: Buffer | string;
    disableContentTypeDetection?: boolean;
}
export interface VoiceOptions extends Omit<MediaOptions, 'caption'> {
    duration?: number;
}
export interface VideoNoteOptions extends Omit<MediaOptions, 'caption'> {
    duration?: number;
    length?: number;
    thumbnail?: Buffer | string;
}
export interface AnimationOptions extends MediaOptions {
    duration?: number;
    width?: number;
    height?: number;
    thumbnail?: Buffer | string;
}
export interface StickerOptions extends Omit<MediaOptions, 'caption'> {
    emoji?: string;
}
export interface MediaGroupItem {
    type: 'photo' | 'video' | 'audio' | 'document';
    media: Buffer | string;
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
    thumbnail?: Buffer;
}
export interface MediaGroupOptions extends Omit<SendMessageOptions, 'parseMode' | 'disableWebPagePreview' | 'linkPreviewOptions'> {
}
export declare class BotConfig {
    private static instance;
    private categoryMap;
    private initialized;
    private initializing;
    private initPromise;
    private initRetries;
    private readonly MAX_RETRIES;
    private readonly RETRY_DELAY;
    private constructor();
    static getInstance(): BotConfig;
    static initializeAndGetInstance(): Promise<BotConfig>;
    ready(): Promise<void>;
    private initialize;
    private getCategoryFromDescription;
    private fetchUsername;
    getBotUsername(category: ChannelCategory): Promise<string>;
    getChannelId(category: ChannelCategory): Promise<string>;
    getBotAndChannel(category: ChannelCategory): Promise<{
        username: string;
        channelId: string;
        token: string;
    }>;
    sendMessage(category: ChannelCategory, message: string, options?: SendMessageOptions): Promise<boolean>;
    sendPhoto(category: ChannelCategory, photo: Buffer | string, options?: PhotoOptions): Promise<boolean>;
    sendVideo(category: ChannelCategory, video: Buffer | string, options?: VideoOptions): Promise<boolean>;
    sendAudio(category: ChannelCategory, audio: Buffer | string, options?: AudioOptions): Promise<boolean>;
    sendDocument(category: ChannelCategory, document: Buffer | string, options?: DocumentOptions): Promise<boolean>;
    sendVoice(category: ChannelCategory, voice: Buffer | string, options?: VoiceOptions): Promise<boolean>;
    sendVideoNote(category: ChannelCategory, videoNote: Buffer | string, options?: VideoNoteOptions): Promise<boolean>;
    sendAnimation(category: ChannelCategory, animation: Buffer | string, options?: AnimationOptions): Promise<boolean>;
    sendSticker(category: ChannelCategory, sticker: Buffer | string, options?: StickerOptions): Promise<boolean>;
    sendMediaGroup(category: ChannelCategory, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean>;
    private sendMedia;
    private initializeBots;
    private ensureInitialized;
    hasCategory(category: ChannelCategory): Promise<boolean>;
    getConfiguredCategories(): Promise<ChannelCategory[]>;
}
