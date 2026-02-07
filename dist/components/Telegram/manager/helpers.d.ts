import { Api } from 'telegram';
import { MediaMetadataItem, DocumentMediaDetails, SenderInfo, MediaInfo } from './types';
export declare const MAX_FILE_SIZE: number;
export declare const FILE_DOWNLOAD_TIMEOUT = 60000;
export declare const TEMP_FILE_CLEANUP_DELAY = 3600000;
export declare const THUMBNAIL_CONCURRENCY_LIMIT = 3;
export declare const THUMBNAIL_BATCH_DELAY_MS = 100;
export declare function getSearchFilter(filter: string): Api.TypeMessagesFilter;
export declare function getMediaType(media: Api.TypeMessageMedia): 'photo' | 'video' | 'document';
export declare function getMessageDate(message: Api.Message): number;
export declare function extractMediaMetaFromMessage(message: Api.Message, chatId: string, mediaType: string): MediaMetadataItem;
export declare function getMediaDetails(media: Api.MessageMediaDocument): DocumentMediaDetails | null;
export declare function detectContentType(filename: string, mimeType?: string): string;
import bigInt from 'big-integer';
export declare function generateETag(messageId: number, chatId: string, fileId: bigInt.BigInteger | string | number): string;
export declare function downloadFileFromUrl(url: string, maxSize?: number): Promise<Buffer>;
export declare function downloadWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T>;
export declare function processWithConcurrencyLimit<T, R>(items: T[], processor: (item: T) => Promise<R>, concurrencyLimit?: number, batchDelay?: number): Promise<R[]>;
export declare function getMimeType(type: string): string;
export declare function getMediaExtension(mediaOrType: string | Api.TypeMessageMedia): string;
export declare function getMediaAttributes(item: {
    type: string;
    fileName?: string;
}): Api.TypeDocumentAttribute[];
export declare function getEntityId(entity: Api.TypeInputPeer | Api.TypeUser | Api.TypeChat): string;
export declare function generateCSV(contacts: Array<{
    firstName: string;
    lastName: string;
    phone: string;
    blocked: boolean;
}>): string;
export declare function generateVCard(contacts: Array<{
    firstName?: string;
    lastName?: string;
    phone?: string;
}>): string;
export declare function createVCardContent(contacts: Api.contacts.Contacts): string;
export declare function toISODate(timestamp: number): string;
export declare function bufferToBase64DataUrl(buffer: Buffer, mimeType?: string): string;
export declare function resolveEntityToSenderInfo(entity: Api.User | Api.Chat | Api.Channel | null, senderId: string, isSelf: boolean): SenderInfo;
export declare function extractMediaInfo(message: Api.Message, thumbnailBuffer: Buffer | null): MediaInfo | null;
export declare function getUserOnlineStatus(user: Api.User): {
    status: string;
    lastSeen: string | null;
};
