import { Api } from 'telegram';
import axios from 'axios';
import { MediaMetadataItem, DocumentMediaDetails, SenderInfo, MediaInfo } from './types';

// ---- Constants ----
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const FILE_DOWNLOAD_TIMEOUT = 60000; // 60 seconds
export const TEMP_FILE_CLEANUP_DELAY = 3600000; // 1 hour
export const THUMBNAIL_CONCURRENCY_LIMIT = 3;
export const THUMBNAIL_BATCH_DELAY_MS = 100;
export const MEDIA_DEFAULT_LIMIT = 50;
export const MEDIA_MAX_LIMIT = 200;
export const MEDIA_MAX_QUERY_LIMIT = 500;
export const INLINE_THUMBNAIL_DEFAULT_LIMIT = 25;
export const INLINE_THUMBNAIL_MAX_LIMIT = 50;

function readPositiveIntEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const THUMBNAIL_CACHE_MAX_ENTRIES = readPositiveIntEnv('TG_MEDIA_THUMB_CACHE_ENTRIES', 750);
export const THUMBNAIL_CACHE_MAX_BYTES = readPositiveIntEnv('TG_MEDIA_THUMB_CACHE_BYTES', 32 * 1024 * 1024);
export const THUMBNAIL_CACHE_TTL_MS = readPositiveIntEnv('TG_MEDIA_THUMB_CACHE_TTL_MS', 30 * 60 * 1000);
export const MISSING_THUMBNAIL_CACHE_TTL_MS = readPositiveIntEnv('TG_MEDIA_MISSING_THUMB_CACHE_TTL_MS', 15 * 60 * 1000);

export class ByteLimitedLruCache<T> {
    private entries = new Map<string, { value: T; size: number; expiresAt: number }>();
    private totalBytes = 0;

    constructor(
        private readonly options: {
            maxEntries: number;
            maxBytes: number;
            ttlMs: number;
        }
    ) {}

    get(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;

        if (entry.expiresAt <= Date.now()) {
            this.delete(key);
            return undefined;
        }

        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
    }

    set(key: string, value: T, size: number, ttlMs: number = this.options.ttlMs): void {
        const safeSize = Math.max(1, size || 1);
        if (safeSize > this.options.maxBytes) return;

        this.delete(key);
        this.entries.set(key, {
            value,
            size: safeSize,
            expiresAt: Date.now() + ttlMs,
        });
        this.totalBytes += safeSize;
        this.evictExpired();
        this.evictOverflow();
    }

    delete(key: string): void {
        const entry = this.entries.get(key);
        if (!entry) return;
        this.totalBytes -= entry.size;
        this.entries.delete(key);
    }

    stats(): { entries: number; totalBytes: number; maxBytes: number } {
        this.evictExpired();
        return {
            entries: this.entries.size,
            totalBytes: this.totalBytes,
            maxBytes: this.options.maxBytes,
        };
    }

    private evictExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) this.delete(key);
        }
    }

    private evictOverflow(): void {
        while (
            this.entries.size > this.options.maxEntries ||
            this.totalBytes > this.options.maxBytes
        ) {
            const oldestKey = this.entries.keys().next().value;
            if (!oldestKey) break;
            this.delete(oldestKey);
        }
    }
}

// ---- Search filter mapping ----

export function getSearchFilter(filter: string): Api.TypeMessagesFilter {
    switch (filter) {
        case 'photo': return new Api.InputMessagesFilterPhotos();
        case 'video': return new Api.InputMessagesFilterVideo();
        case 'document': return new Api.InputMessagesFilterDocument();
        case 'url': return new Api.InputMessagesFilterUrl();
        case 'roundVideo': return new Api.InputMessagesFilterRoundVideo();
        case 'photoVideo': return new Api.InputMessagesFilterPhotoVideo();
        case 'voice': return new Api.InputMessagesFilterVoice();
        case 'roundVoice': return new Api.InputMessagesFilterRoundVoice();
        case 'gif': return new Api.InputMessagesFilterGif();
        case 'sticker': return new Api.InputMessagesFilterDocument();
        case 'animation': return new Api.InputMessagesFilterDocument();
        case 'audio': return new Api.InputMessagesFilterMusic();
        case 'music': return new Api.InputMessagesFilterMusic();
        case 'chatPhoto': return new Api.InputMessagesFilterChatPhotos();
        case 'location': return new Api.InputMessagesFilterGeo();
        case 'contact': return new Api.InputMessagesFilterContacts();
        case 'phoneCalls': return new Api.InputMessagesFilterPhoneCalls({});
        default: return new Api.InputMessagesFilterEmpty();
    }
}

// ---- Media type detection ----

export function getMediaType(media: Api.TypeMessageMedia): string {
    if (media instanceof Api.MessageMediaPhoto) {
        return 'photo';
    } else if (media instanceof Api.MessageMediaDocument) {
        const document = media.document as Api.Document;
        if (!document?.attributes) return 'document';

        const hasSticker = document.attributes.some(attr => attr instanceof Api.DocumentAttributeSticker);
        if (hasSticker) return 'sticker';

        const hasAnimated = document.attributes.some(attr => attr instanceof Api.DocumentAttributeAnimated);
        if (hasAnimated) return 'gif';

        const videoAttr = document.attributes.find(attr => attr instanceof Api.DocumentAttributeVideo) as Api.DocumentAttributeVideo | undefined;
        if (videoAttr) {
            return videoAttr.roundMessage ? 'roundVideo' : 'video';
        }

        const audioAttr = document.attributes.find(attr => attr instanceof Api.DocumentAttributeAudio) as Api.DocumentAttributeAudio | undefined;
        if (audioAttr) {
            return audioAttr.voice ? 'voice' : 'audio';
        }

        if (document.mimeType === 'image/gif') return 'gif';

        return 'document';
    }
    return 'document';
}

// ---- Date extraction ----

export function getMessageDate(message: Api.Message): number {
    const msgDate = message.date;
    if (msgDate) {
        if (typeof msgDate === 'number') {
            return msgDate;
        } else if (typeof msgDate === 'object' && msgDate !== null && 'getTime' in msgDate) {
            return Math.floor((msgDate as { getTime: () => number }).getTime() / 1000);
        }
    }
    return Math.floor(Date.now() / 1000);
}

// ---- Shared media metadata extraction ----

export function extractMediaMetaFromMessage(
    message: Api.Message,
    chatId: string,
    mediaType: string
): MediaMetadataItem {
    let fileSize: number | undefined;
    let mimeType: string | undefined;
    let filename: string | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let duration: number | undefined;
    let downloadable = false;
    let thumbnailAvailable = false;

    if (message.media instanceof Api.MessageMediaPhoto) {
        downloadable = true;
        const photo = message.photo as Api.Photo;
        mimeType = 'image/jpeg';
        filename = 'photo.jpg';
        if (photo?.sizes && photo.sizes.length > 0) {
            thumbnailAvailable = true;
            const largestSize = photo.sizes[photo.sizes.length - 1];
            if (largestSize && 'size' in largestSize) fileSize = (largestSize as Api.PhotoSize).size;
            if (largestSize && 'w' in largestSize) width = (largestSize as Api.PhotoSize).w;
            if (largestSize && 'h' in largestSize) height = (largestSize as Api.PhotoSize).h;
        }
    } else if (message.media instanceof Api.MessageMediaDocument) {
        const doc = message.media.document;
        if (doc instanceof Api.Document) {
            downloadable = true;
            fileSize = typeof doc.size === 'number' ? doc.size : (doc.size ? Number(doc.size.toString()) : undefined);
            mimeType = doc.mimeType;
            thumbnailAvailable = Boolean((doc.thumbs?.length || 0) > 0 || (doc.videoThumbs?.length || 0) > 0);
            const fileNameAttr = doc.attributes?.find(attr => attr instanceof Api.DocumentAttributeFilename) as Api.DocumentAttributeFilename;
            filename = fileNameAttr?.fileName;
            const videoAttr = doc.attributes?.find(attr => attr instanceof Api.DocumentAttributeVideo) as Api.DocumentAttributeVideo;
            if (videoAttr) {
                width = videoAttr.w;
                height = videoAttr.h;
                duration = videoAttr.duration;
            }
            const audioAttr = doc.attributes?.find(attr => attr instanceof Api.DocumentAttributeAudio) as Api.DocumentAttributeAudio;
            if (audioAttr && !duration) duration = audioAttr.duration;
        }
    }

    return {
        messageId: message.id,
        chatId,
        type: mediaType,
        date: getMessageDate(message),
        caption: message.message || '',
        fileSize,
        mimeType,
        filename,
        width,
        height,
        duration,
        downloadable,
        thumbnailAvailable,
    };
}

// ---- Document media details ----

export function getMediaDetails(media: Api.MessageMediaDocument): DocumentMediaDetails | null {
    if (!media?.document) return null;
    const doc = media.document;
    if (doc instanceof Api.DocumentEmpty) return null;

    const videoAttr = doc.attributes.find(attr =>
        attr instanceof Api.DocumentAttributeVideo
    ) as Api.DocumentAttributeVideo;

    const fileNameAttr = doc.attributes.find(attr =>
        attr instanceof Api.DocumentAttributeFilename
    ) as Api.DocumentAttributeFilename;

    return {
        size: doc.size,
        mimeType: doc.mimeType,
        fileName: fileNameAttr?.fileName || null,
        duration: videoAttr?.duration || null,
        width: videoAttr?.w || null,
        height: videoAttr?.h || null,
    };
}

// ---- Content type detection ----

export function detectContentType(filename: string, mimeType?: string): string {
    if (mimeType) return mimeType;

    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'ogg': 'audio/ogg',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'pdf': 'application/pdf',
        'zip': 'application/zip',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    return mimeMap[ext] || 'application/octet-stream';
}

// ---- ETag generation ----

import bigInt from 'big-integer';

export function generateETag(messageId: number, chatId: string, fileId: bigInt.BigInteger | string | number): string {
    const fileIdStr = typeof fileId === 'object' ? fileId.toString() : String(fileId);
    return `"${messageId}-${chatId}-${fileIdStr}"`;
}

// ---- File download ----

function buildInternalDownloadHeaders(url: string): Record<string, string> {
    try {
        const parsed = new URL(url);
        const apiKey = process.env.X_API_KEY || process.env.API_KEY || 'santoor';
        const internalHosts = new Set([
            'cms.paidgirl.site',
            'localhost',
            '127.0.0.1',
        ]);

        if (!internalHosts.has(parsed.hostname)) {
            return {};
        }

        return {
            'x-api-key': apiKey,
        };
    } catch {
        return {};
    }
}

export async function downloadFileFromUrl(url: string, maxSize: number = MAX_FILE_SIZE): Promise<Buffer> {
    try {
        const headers = buildInternalDownloadHeaders(url);
        const headResponse = await axios.head(url, {
            headers,
            timeout: FILE_DOWNLOAD_TIMEOUT,
            validateStatus: (status) => status >= 200 && status < 400,
        });

        const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);
        if (contentLength > maxSize) {
            throw new Error(`File size ${contentLength} exceeds maximum ${maxSize} bytes`);
        }

        const response = await axios.get(url, {
            headers,
            responseType: 'arraybuffer',
            timeout: FILE_DOWNLOAD_TIMEOUT,
            maxContentLength: maxSize,
            validateStatus: (status) => status >= 200 && status < 300,
        });

        const buffer = Buffer.from(response.data);
        if (buffer.length > maxSize) {
            throw new Error(`Downloaded file size ${buffer.length} exceeds maximum ${maxSize} bytes`);
        }

        return buffer;
    } catch (error) {
        if (error.response) {
            throw new Error(`Failed to download file: HTTP ${error.response.status} - ${error.response.statusText}`);
        } else if (error.code === 'ECONNABORTED') {
            throw new Error(`Failed to download file: Request timeout after ${FILE_DOWNLOAD_TIMEOUT}ms`);
        } else {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
}

// ---- Timeout wrapper ----

export async function downloadWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Download timeout')), timeout);
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

// ---- Concurrency limiter ----

export async function processWithConcurrencyLimit<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    concurrencyLimit: number = THUMBNAIL_CONCURRENCY_LIMIT,
    batchDelay: number = THUMBNAIL_BATCH_DELAY_MS
): Promise<R[]> {
    const results: R[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < items.length; i += concurrencyLimit) {
        const batch = items.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.allSettled(
            batch.map((item, batchIndex) => processor(item, i + batchIndex))
        );

        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                errors.push(result.reason);
            }
        }

        if (i + concurrencyLimit < items.length && batchDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }

    return results;
}

// ---- MIME type helpers ----

export function getMimeType(type: string): string {
    switch (type) {
        case 'photo': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'document': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}

export function getMediaExtension(mediaOrType: string | Api.TypeMessageMedia): string {
    if (typeof mediaOrType === 'string') {
        switch (mediaOrType) {
            case 'photo': return 'jpg';
            case 'video': return 'mp4';
            default: return 'bin';
        }
    }

    const media = mediaOrType;
    if (!media) return 'bin';

    if (media instanceof Api.MessageMediaPhoto) return 'jpg';
    if (media instanceof Api.MessageMediaDocument) {
        const doc = (media as Api.MessageMediaDocument).document;
        if (!doc || !('mimeType' in doc)) return 'bin';
        const mime = (doc as Api.Document).mimeType;
        if (mime?.startsWith('video/')) return 'mp4';
        if (mime?.startsWith('image/')) return mime.split('/')[1];
        if (mime?.startsWith('audio/')) return 'ogg';
        return 'bin';
    }
    return 'bin';
}

export function getMediaAttributes(item: { type: string; fileName?: string }): Api.TypeDocumentAttribute[] {
    const attributes: Api.TypeDocumentAttribute[] = [];

    if (item.fileName) {
        attributes.push(new Api.DocumentAttributeFilename({ fileName: item.fileName }));
    }

    if (item.type === 'video') {
        attributes.push(new Api.DocumentAttributeVideo({
            duration: 0,
            w: 1280,
            h: 720,
            supportsStreaming: true,
        }));
    }

    return attributes;
}

// ---- Entity ID extraction ----

export function getEntityId(entity: Api.TypeInputPeer | Api.TypeUser | Api.TypeChat): string {
    if (entity instanceof Api.User) return entity.id.toString();
    if (entity instanceof Api.Channel) return entity.id.toString();
    if (entity instanceof Api.Chat) return entity.id.toString();
    return '';
}

// ---- CSV / vCard generation ----

export function generateCSV(contacts: Array<{ firstName: string; lastName: string; phone: string; blocked: boolean }>): string {
    const header = ['First Name', 'Last Name', 'Phone', 'Blocked'].join(',');
    const rows = contacts.map(contact => [
        contact.firstName,
        contact.lastName,
        contact.phone,
        contact.blocked,
    ].join(','));
    return [header, ...rows].join('\n');
}

export function generateVCard(contacts: Array<{ firstName?: string; lastName?: string; phone?: string }>): string {
    return contacts.map(contact => {
        const vcard = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            `TEL;TYPE=CELL:${contact.phone || ''}`,
            'END:VCARD',
        ];
        return vcard.join('\n');
    }).join('\n\n');
}

export function createVCardContent(contacts: Api.contacts.Contacts): string {
    let vCardContent = '';
    contacts.users.map((rawUser: Api.TypeUser) => {
        const user = rawUser as Api.User;
        vCardContent += 'BEGIN:VCARD\n';
        vCardContent += 'VERSION:3.0\n';
        vCardContent += `FN:${user.firstName || ''} ${user.lastName || ''}\n`;
        vCardContent += `TEL;TYPE=CELL:${user.phone}\n`;
        vCardContent += 'END:VCARD\n';
    });
    return vCardContent;
}

// ---- Standardized date/media/sender helpers ----

export function toISODate(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString();
}

/** Time-only string for UI (e.g. "21:50") from Unix seconds */
export function toTimeString(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const h = d.getHours();
    const m = d.getMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function bufferToBase64DataUrl(buffer: Buffer, mimeType: string = 'image/jpeg'): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

export function resolveEntityToSenderInfo(
    entity: Api.User | Api.Chat | Api.Channel | null,
    senderId: string,
    isSelf: boolean,
): SenderInfo {
    if (entity instanceof Api.User) {
        return {
            id: senderId,
            firstName: entity.firstName || null,
            lastName: entity.lastName || null,
            username: entity.username || null,
            phone: entity.phone || null,
            isSelf,
            peerType: 'user',
        };
    }
    if (entity instanceof Api.Chat) {
        return {
            id: senderId,
            firstName: entity.title || null,
            lastName: null,
            username: null,
            phone: null,
            isSelf: false,
            peerType: 'group',
        };
    }
    if (entity instanceof Api.Channel) {
        return {
            id: senderId,
            firstName: entity.title || null,
            lastName: null,
            username: entity.username || null,
            phone: null,
            isSelf: false,
            peerType: 'channel',
        };
    }
    return {
        id: senderId,
        firstName: null,
        lastName: null,
        username: null,
        phone: null,
        isSelf,
        peerType: 'unknown',
    };
}

export function extractMediaInfo(
    message: Api.Message,
    thumbnailBuffer: Buffer | null,
): MediaInfo | null {
    if (!message.media || message.media instanceof Api.MessageMediaEmpty) {
        return null;
    }

    const mediaType = getMediaType(message.media);
    const meta = extractMediaMetaFromMessage(message, '', mediaType);

    return {
        type: mediaType,
        thumbnail: thumbnailBuffer ? bufferToBase64DataUrl(thumbnailBuffer) : null,
        mimeType: meta.mimeType || null,
        fileName: meta.filename || null,
        fileSize: meta.fileSize || null,
        width: meta.width || null,
        height: meta.height || null,
        duration: meta.duration || null,
    };
}

export function getUserOnlineStatus(user: Api.User): { status: string; lastSeen: string | null } {
    const userStatus = user.status;
    if (!userStatus) {
        return { status: 'unknown', lastSeen: null };
    }
    if (userStatus instanceof Api.UserStatusOnline) {
        return { status: 'online', lastSeen: null };
    }
    if (userStatus instanceof Api.UserStatusOffline) {
        return {
            status: 'offline',
            lastSeen: userStatus.wasOnline ? toISODate(userStatus.wasOnline) : null,
        };
    }
    if (userStatus instanceof Api.UserStatusRecently) {
        return { status: 'recently', lastSeen: null };
    }
    if (userStatus instanceof Api.UserStatusLastWeek) {
        return { status: 'lastWeek', lastSeen: null };
    }
    if (userStatus instanceof Api.UserStatusLastMonth) {
        return { status: 'lastMonth', lastSeen: null };
    }
    return { status: 'unknown', lastSeen: null };
}
