import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Model } from 'mongoose';
import { Bot, BotDocument } from './schemas/bot.schema';
import { ChannelCategory } from './channel-category.enum';
export interface DeadBotInfo {
    username: string;
    category: ChannelCategory;
    channelId: string;
    token: string;
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
export type PhotoOptions = MediaOptions;
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
export type MediaGroupOptions = Omit<SendMessageOptions, 'parseMode' | 'disableWebPagePreview' | 'linkPreviewOptions'>;
export declare class BotsService implements OnModuleInit, OnModuleDestroy {
    private botModel;
    private readonly moduleRef;
    private cache;
    private readonly flushInterval;
    private readonly maxPendingUpdates;
    private static readonly HEALTH_JOB_NAME;
    private static readonly HEALTH_JOB_CRON;
    private static readonly HEALTH_JOB_TZ;
    private readonly maxReplacementsPerRun;
    private healthCheckJob;
    private flushTimer;
    private destroyed;
    private replaceInProgress;
    constructor(botModel: Model<BotDocument>, moduleRef: ModuleRef);
    private get telegramService();
    private get usersService();
    onModuleInit(): Promise<void>;
    private isBotHealthJobEnabled;
    private scheduleBotHealthCheck;
    onModuleDestroy(): void;
    private initializeCache;
    private startPeriodicFlush;
    private flushPendingStats;
    createBot(createBotDto: {
        token: string;
        category: ChannelCategory;
        channelId: string;
        description?: string;
    }): Promise<BotDocument>;
    getBots(category?: ChannelCategory): Promise<BotDocument[]>;
    getBotById(id: string): Promise<BotDocument>;
    updateBot(id: string, updateBotDto: Partial<Bot>): Promise<BotDocument>;
    deleteBot(id: string): Promise<void>;
    private sendByCategoryWithFailover;
    sendMessageByCategory(category: ChannelCategory, message: string, options?: SendMessageOptions, allowServiceName?: boolean): Promise<boolean>;
    sendPhotoByCategory(category: ChannelCategory, photo: string | Buffer, options?: PhotoOptions): Promise<boolean>;
    sendVideoByCategory(category: ChannelCategory, video: string | Buffer, options?: VideoOptions): Promise<boolean>;
    sendAudioByCategory(category: ChannelCategory, audio: string | Buffer, options?: AudioOptions): Promise<boolean>;
    sendDocumentByCategory(category: ChannelCategory, document: string | Buffer, options?: DocumentOptions): Promise<boolean>;
    sendVoiceByCategory(category: ChannelCategory, voice: string | Buffer, options?: VoiceOptions): Promise<boolean>;
    sendAnimationByCategory(category: ChannelCategory, animation: string | Buffer, options?: AnimationOptions): Promise<boolean>;
    sendStickerByCategory(category: ChannelCategory, sticker: string | Buffer, options?: StickerOptions): Promise<boolean>;
    sendMediaGroupByCategory(category: ChannelCategory, media: MediaGroupItem[], options?: MediaGroupOptions): Promise<boolean>;
    sendMessageByBotId(botId: string, message: string, options?: SendMessageOptions, allowServiceName?: boolean): Promise<boolean>;
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
    private readonly BOT_TOKEN_REGEX;
    private sleep;
    private humanDelay;
    private isFloodSignal;
    private checkBotToken;
    validateAndReplaceBots(): Promise<{
        checked: number;
        alive: number;
        dead: number;
        unknown: number;
        replaced: number;
        failures: string[];
    }>;
    private replaceDeadBot;
    private addBotToChannelAsAdmin;
    private verifyBotIsChannelAdmin;
    private getChannelManagerMobiles;
    private resolveChannelAdminMobile;
    private matchOwnMobileToAdminIds;
    private shuffle;
    private pickRandomHealthyUser;
    private getHealthyAccountMobiles;
    private notify;
    private sendHealthSummary;
}
