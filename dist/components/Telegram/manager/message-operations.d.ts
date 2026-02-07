import { Api } from 'telegram';
import { TgContext, MessageScheduleOptions, EditMessageOptions, MediaBatchOptions, VoiceMessageOptions, AlbumSendResult, ForwardResult, ScheduledMessageItem } from './types';
import { SearchMessagesDto, SearchMessagesResponseDto } from '../dto/message-search.dto';
import { SendTgMessageDto } from '../dto/send-message.dto';
import { MediaAlbumOptions } from '../types/telegram-types';
export declare function sendMessageToChat(ctx: TgContext, params: SendTgMessageDto): Promise<Api.Message>;
export declare function sendInlineMessage(ctx: TgContext, chatId: string, message: string, url: string): Promise<Api.Message>;
export declare function forwardSecretMsgs(ctx: TgContext, fromChatId: string, toChatId: string): Promise<ForwardResult>;
export declare function forwardMessages(ctx: TgContext, fromChatId: string, toChatId: string, messageIds: number[]): Promise<number>;
export declare function forwardMessage(ctx: TgContext, toChatId: string, fromChatId: string, messageId: number): Promise<void>;
export declare function searchMessages(ctx: TgContext, params: SearchMessagesDto): Promise<SearchMessagesResponseDto>;
export declare function scheduleMessageSend(ctx: TgContext, opts: MessageScheduleOptions): Promise<Api.Message | Api.TypeUpdates>;
export declare function getScheduledMessages(ctx: TgContext, chatId: string): Promise<ScheduledMessageItem[]>;
export declare function sendMediaAlbum(ctx: TgContext, album: MediaAlbumOptions): Promise<AlbumSendResult>;
export declare function sendVoiceMessage(ctx: TgContext, voice: VoiceMessageOptions): Promise<Api.TypeUpdates>;
export declare function cleanupChat(ctx: TgContext, cleanup: {
    chatId: string;
    beforeDate?: Date;
    onlyMedia?: boolean;
    excludePinned?: boolean;
    revoke?: boolean;
}): Promise<{
    deletedCount: number;
}>;
export declare function editMessage(ctx: TgContext, options: EditMessageOptions): Promise<Api.TypeUpdates>;
export declare function sendMediaBatch(ctx: TgContext, options: MediaBatchOptions): Promise<Api.TypeUpdates>;
export declare function sendViewOnceMedia(ctx: TgContext, chatId: string, buffer: Buffer, caption?: string, isVideo?: boolean, filename?: string): Promise<Api.TypeUpdates>;
export declare function sendPhotoChat(ctx: TgContext, id: string, url: string, caption: string, filename: string): Promise<void>;
export declare function sendFileChat(ctx: TgContext, id: string, url: string, caption: string, filename: string): Promise<void>;
export declare function deleteChat(ctx: TgContext, params: {
    peer: string | Api.TypeInputPeer;
    maxId?: number;
    justClear?: boolean;
    revoke?: boolean;
    minDate?: number;
    maxDate?: number;
}): Promise<void>;
