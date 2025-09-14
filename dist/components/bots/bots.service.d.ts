import { Model } from 'mongoose';
import { Bot, BotDocument } from './schemas/bot.schema';
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
export declare class BotsService {
    private botModel;
    constructor(botModel: Model<BotDocument>);
    createBot(createBotDto: {
        token: string;
        category: ChannelCategory;
        channelId: string;
        description?: string;
    }): Promise<Bot>;
    getBots(category?: ChannelCategory): Promise<Bot[]>;
    getBotById(id: string): Promise<BotDocument>;
    updateBot(id: string, updateBotDto: Partial<Bot>): Promise<Bot>;
    deleteBot(id: string): Promise<void>;
    private sendByCategoryWithFailover;
    sendMessageByCategory(category: ChannelCategory, message: string, options?: SendMessageOptions): Promise<boolean>;
    sendPhotoByCategory(category: ChannelCategory, photo: string | Buffer, options?: PhotoOptions): Promise<boolean>;
    sendVideoByCategory(category: ChannelCategory, video: string | Buffer, options?: VideoOptions): Promise<boolean>;
    sendAudioByCategory(category: ChannelCategory, audio: string | Buffer, options?: AudioOptions): Promise<boolean>;
    sendDocumentByCategory(category: ChannelCategory, document: string | Buffer, options?: DocumentOptions): Promise<boolean>;
    sendVoiceByCategory(category: ChannelCategory, voice: string | Buffer, options?: VoiceOptions): Promise<boolean>;
    sendAnimationByCategory(category: ChannelCategory, animation: string | Buffer, options?: AnimationOptions): Promise<boolean>;
    sendStickerByCategory(category: ChannelCategory, sticker: string | Buffer, options?: StickerOptions): Promise<boolean>;
    sendMediaGroupByCategory(category: ChannelCategory, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean>;
    sendMessageByBotId(botId: string, message: string, options?: SendMessageOptions): Promise<boolean>;
    sendPhotoByBotId(botId: string, photo: string | Buffer, options?: PhotoOptions): Promise<boolean>;
    sendVideoByBotId(botId: string, video: string | Buffer, options?: VideoOptions): Promise<boolean>;
    sendAudioByBotId(botId: string, audio: string | Buffer, options?: AudioOptions): Promise<boolean>;
    sendDocumentByBotId(botId: string, document: string | Buffer, options?: DocumentOptions): Promise<boolean>;
    sendVoiceByBotId(botId: string, voice: string | Buffer, options?: VoiceOptions): Promise<boolean>;
    sendAnimationByBotId(botId: string, animation: string | Buffer, options?: AnimationOptions): Promise<boolean>;
    sendStickerByBotId(botId: string, sticker: string | Buffer, options?: StickerOptions): Promise<boolean>;
    sendMediaGroupByBotId(botId: string, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean>;
    private executeSendMessage;
    private executeSendMedia;
    private executeSendMediaGroup;
    private fetchUsername;
    private updateBotStats;
    private getDefaultExtension;
    private addMethodSpecificOptions;
    getBotStatsByCategory(category: ChannelCategory): Promise<any>;
}
