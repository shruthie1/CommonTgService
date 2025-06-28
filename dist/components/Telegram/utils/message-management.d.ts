import { Api, TelegramClient } from 'telegram';
import { SearchMessagesDto, SearchMessagesResponseDto } from '../dto/message-search.dto';
import { MediaAlbumOptions } from '../types/telegram-types';
interface MessageScheduleOptions {
    chatId: string;
    message: string;
    scheduledTime: Date;
    replyTo?: number;
    silent?: boolean;
    media?: {
        type: 'photo' | 'video' | 'document';
        url: string;
    };
}
export declare function sendMessage(client: TelegramClient, params: {
    peer: string;
    parseMode?: string;
    message: string;
}): Promise<any>;
export declare function forwardMessages(client: TelegramClient, fromChatId: string, toChatId: string, messageIds: number[]): Promise<any>;
export declare function forwardSecretMessages(client: TelegramClient, fromChatId: string, toChatId: string, sleep: (ms: number) => Promise<void>): Promise<void>;
export declare function scheduleMessageSend(client: TelegramClient, opts: MessageScheduleOptions): Promise<any>;
export declare function getScheduledMessages(client: TelegramClient, chatId: string): Promise<Api.TypeMessage[]>;
export declare function sendVoiceMessage(client: TelegramClient, voice: {
    chatId: string;
    url: string;
    duration?: number;
    caption?: string;
}): Promise<any>;
export declare function sendPhotoChat(client: TelegramClient, id: string, url: string, caption: string, filename: string): Promise<void>;
export declare function sendFileChat(client: TelegramClient, id: string, url: string, caption: string, filename: string): Promise<void>;
export declare function sendMediaAlbum(client: TelegramClient, album: MediaAlbumOptions): Promise<any>;
export declare function editMessage(client: TelegramClient, options: {
    chatId: string;
    messageId: number;
    text?: string;
    media?: {
        type: 'photo' | 'video' | 'document';
        url: string;
    };
}): Promise<any>;
export declare function searchMessages(client: TelegramClient, params: SearchMessagesDto): Promise<SearchMessagesResponseDto>;
export declare function cleanupChat(client: TelegramClient, cleanup: {
    chatId: string;
    beforeDate?: Date;
    onlyMedia?: boolean;
    excludePinned?: boolean;
    revoke?: boolean;
}): Promise<void>;
export declare function downloadFileFromUrl(url: string): Promise<Buffer>;
export declare function getMediaExtension(type: string): string;
export declare function getMimeType(type: string): string;
export declare function getMediaAttributes(item: {
    type: string;
    fileName?: string;
}): Api.TypeDocumentAttribute[];
export declare function getSearchFilter(filter: string): Api.TypeMessagesFilter;
export declare function getMediaType(media: Api.TypeMessageMedia): 'photo' | 'video' | 'document';
export declare function getMediaDetails(client: TelegramClient, media: Api.MessageMediaDocument): Promise<any>;
export {};
