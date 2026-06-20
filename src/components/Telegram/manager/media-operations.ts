import { Api } from 'telegram';
import { strippedPhotoToJpg } from 'telegram/Utils';
import * as fs from 'fs';
import axios from 'axios';
import bigInt from 'big-integer';
import { IterMessagesParams } from 'telegram/client/messages';
import { TgContext, MediaMetadataItem, FilteredMediaItem, MediaFileInfo, ThumbnailResult, MediaFileDownloadInfo, MediaListResponse, FilteredMediaListResponse, MediaQueryParams } from './types';
import {
    getSearchFilter, getMediaType, extractMediaMetaFromMessage, getMediaDetails,
    detectContentType, generateETag, downloadFileFromUrl, downloadWithTimeout,
    processWithConcurrencyLimit,
    FILE_DOWNLOAD_TIMEOUT, MAX_FILE_SIZE, TEMP_FILE_CLEANUP_DELAY,
    THUMBNAIL_CONCURRENCY_LIMIT, THUMBNAIL_BATCH_DELAY_MS,
    ByteLimitedLruCache,
    INLINE_THUMBNAIL_DEFAULT_LIMIT,
    INLINE_THUMBNAIL_MAX_LIMIT,
    MEDIA_DEFAULT_LIMIT,
    MEDIA_MAX_LIMIT,
    MEDIA_MAX_QUERY_LIMIT,
    MISSING_THUMBNAIL_CACHE_TTL_MS,
    THUMBNAIL_CACHE_MAX_BYTES,
    THUMBNAIL_CACHE_MAX_ENTRIES,
    THUMBNAIL_CACHE_TTL_MS,
} from './helpers';
import { sleep } from 'telegram/Helpers';
import { safeGetEntityById } from './chat-operations';

// ---- Thumbnail ----

const thumbnailCache = new ByteLimitedLruCache<ThumbnailResult>({
    maxEntries: THUMBNAIL_CACHE_MAX_ENTRIES,
    maxBytes: THUMBNAIL_CACHE_MAX_BYTES,
    ttlMs: THUMBNAIL_CACHE_TTL_MS,
});

const missingThumbnailCache = new ByteLimitedLruCache<true>({
    maxEntries: THUMBNAIL_CACHE_MAX_ENTRIES * 2,
    maxBytes: 64 * 1024,
    ttlMs: MISSING_THUMBNAIL_CACHE_TTL_MS,
});

function safeIsoString(date?: Date): string | undefined {
    if (!(date instanceof Date) || isNaN(date.getTime())) return undefined;
    return date.toISOString();
}

function normalizeMediaLimit(limit?: number): number {
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit) || numericLimit <= 0) return MEDIA_DEFAULT_LIMIT;
    return Math.min(Math.floor(numericLimit), MEDIA_MAX_LIMIT);
}

function normalizeQueryLimit(limit: number, typeCount: number, hasAll: boolean): number {
    const requested = hasAll ? limit * Math.max(typeCount, 1) : limit;
    return Math.min(requested, MEDIA_MAX_QUERY_LIMIT);
}

function normalizeInlineThumbnailLimit(limit?: number): number {
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0) return INLINE_THUMBNAIL_DEFAULT_LIMIT;
    return Math.min(Math.floor(numericLimit), INLINE_THUMBNAIL_MAX_LIMIT);
}

function buildThumbnailCacheKey(ctx: TgContext, chatId: string, messageId: number, quality: 'low' | 'high'): string {
    return `${ctx.phoneNumber}:${chatId}:${messageId}:${quality}`;
}

function appendQueryParam(params: string[], name: string, value: string | number | undefined): void {
    if (value === undefined || value === null || value === '') return;
    params.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
}

function buildThumbnailUrl(
    ctx: TgContext,
    chatId: string,
    messageId: number,
    quality: 'low' | 'high',
    apiKey?: string,
    baseUrl?: string,
): string {
    const params: string[] = [];
    appendQueryParam(params, 'chatId', chatId);
    appendQueryParam(params, 'messageId', messageId);
    appendQueryParam(params, 'quality', quality);
    appendQueryParam(params, 'apiKey', apiKey);
    const prefix = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    return `${prefix}/telegram/media/thumbnail/${encodeURIComponent(ctx.phoneNumber)}?${params.join('&')}`;
}

async function getThumbnailResultFromMessage(
    ctx: TgContext,
    message: Api.Message,
    chatId: string,
    quality: 'low' | 'high' = 'low',
): Promise<ThumbnailResult | null> {
    const cacheKey = buildThumbnailCacheKey(ctx, chatId, message.id, quality);
    const cached = thumbnailCache.get(cacheKey);
    if (cached) return cached;

    if (missingThumbnailCache.get(cacheKey)) return null;

    const thumbBuffer = await getThumbnailBuffer(ctx, message, quality);
    if (!thumbBuffer) {
        missingThumbnailCache.set(cacheKey, true, 1);
        return null;
    }

    const etag = generateETag(message.id, chatId, `thumb-${quality}-${message.id}`);

    let contentType = 'image/jpeg';
    let ext = 'jpg';
    if (message.media instanceof Api.MessageMediaDocument) {
        const doc = message.document;
        if (doc && doc instanceof Api.Document) {
            const isSticker = doc.attributes?.some(attr => attr instanceof Api.DocumentAttributeSticker);
            const isGif = isAnimatedGif(doc);

            if (isSticker) {
                contentType = 'image/webp';
                ext = 'webp';
            } else if (isGif) {
                contentType = doc.mimeType || 'video/mp4';
                ext = doc.mimeType === 'image/gif' ? 'gif' : 'mp4';
            }
        }
    }

    const result = {
        buffer: thumbBuffer,
        etag,
        contentType,
        filename: `thumbnail_${message.id}.${ext}`,
    };
    thumbnailCache.set(cacheKey, result, thumbBuffer.length);
    return result;
}

function isDownloadableSize(s: Api.TypePhotoSize): boolean {
    return !(s instanceof Api.PhotoStrippedSize) &&
           !(s instanceof Api.PhotoCachedSize) &&
           !(s instanceof Api.PhotoSizeEmpty);
}

function findSize(sizes: Api.TypePhotoSize[], ...types: string[]): Api.TypePhotoSize | undefined {
    for (const type of types) {
        const found = sizes.find((s: Api.TypePhotoSize) => isDownloadableSize(s) && (s as Api.PhotoSize).type === type);
        if (found) return found;
    }
    return undefined;
}

function lastDownloadableSize(sizes: Api.TypePhotoSize[]): Api.TypePhotoSize | undefined {
    for (let i = sizes.length - 1; i >= 0; i--) {
        if (isDownloadableSize(sizes[i])) return sizes[i];
    }
    return undefined;
}

function extractInlineThumbnail(sizes: Api.TypePhotoSize[]): Buffer | null {
    for (const s of sizes) {
        if (s instanceof Api.PhotoStrippedSize) {
            return strippedPhotoToJpg(s.bytes) as Buffer;
        }
        if (s instanceof Api.PhotoCachedSize) {
            return Buffer.from(s.bytes);
        }
    }
    return null;
}

function isAnimatedGif(doc: Api.Document): boolean {
    return doc.attributes?.some(attr => attr instanceof Api.DocumentAttributeAnimated) ||
        doc.mimeType === 'image/gif' ||
        doc.mimeType === 'video/mp4' && doc.attributes?.some(attr => attr instanceof Api.DocumentAttributeAnimated);
}

export async function getThumbnailBuffer(ctx: TgContext, message: Api.Message, quality: 'low' | 'high' = 'low'): Promise<Buffer | null> {
    try {
        if (message.media instanceof Api.MessageMediaPhoto) {
            const sizes = (<Api.Photo>message.photo)?.sizes || [];
            if (sizes.length > 0) {
                const preferredSize = quality === 'high'
                    ? (findSize(sizes, 'x', 'y', 'm') || lastDownloadableSize(sizes))
                    : (findSize(sizes, 'm', 'x') || lastDownloadableSize(sizes));
                if (preferredSize) {
                    try {
                        const buf = await downloadWithTimeout(
                            ctx.client.downloadMedia(message, { thumb: preferredSize }) as Promise<Buffer>,
                            30000
                        );
                        if (buf) return buf;
                    } catch { /* fall through to inline */ }
                }
                const inline = extractInlineThumbnail(sizes);
                if (inline) return inline;
            }
        } else if (message.media instanceof Api.MessageMediaDocument) {
            const doc = message.document;
            if (!(doc instanceof Api.Document)) return null;

            const isGif = isAnimatedGif(doc);
            const isSticker = doc.attributes?.some(attr => attr instanceof Api.DocumentAttributeSticker);
            const fileSize = typeof doc.size === 'number' ? doc.size : Number(doc.size?.toString() || '0');
            const thumbs = doc.thumbs || [];
            const videoThumbs = doc.videoThumbs || [];

            if (isSticker) {
                if (thumbs.length > 0) {
                    const preferredThumb = quality === 'high'
                        ? (findSize(thumbs, 'x', 'y', 'm') || lastDownloadableSize(thumbs))
                        : (findSize(thumbs, 'm', 'x', 's') || lastDownloadableSize(thumbs));
                    if (preferredThumb) {
                        try {
                            const buf = await downloadWithTimeout(
                                ctx.client.downloadMedia(message, { thumb: preferredThumb }) as Promise<Buffer>,
                                30000
                            );
                            if (buf) return buf;
                        } catch { /* fall through to inline */ }
                    }
                    const inline = extractInlineThumbnail(thumbs);
                    if (inline) return inline;
                }
                const renderable = doc.mimeType === 'image/webp' || doc.mimeType === 'image/png';
                if (renderable && fileSize < 2 * 1024 * 1024) {
                    return await downloadWithTimeout(
                        ctx.client.downloadMedia(message) as Promise<Buffer>,
                        30000
                    );
                }
                return null;
            }

            if (isGif && fileSize < 2 * 1024 * 1024) {
                return await downloadWithTimeout(
                    ctx.client.downloadMedia(message) as Promise<Buffer>,
                    30000
                );
            }

            if (thumbs.length > 0) {
                const preferredThumb = quality === 'high'
                    ? (findSize(thumbs, 'x', 'y', 'm') || lastDownloadableSize(thumbs))
                    : (findSize(thumbs, 'm', 'x', 's') || lastDownloadableSize(thumbs));
                if (preferredThumb) {
                    try {
                        const buf = await downloadWithTimeout(
                            ctx.client.downloadMedia(message, { thumb: preferredThumb }) as Promise<Buffer>,
                            30000
                        );
                        if (buf) return buf;
                    } catch { /* fall through */ }
                }
                const inline = extractInlineThumbnail(thumbs);
                if (inline) return inline;
            }

            if (videoThumbs.length > 0) {
                const vThumb = videoThumbs.find(v => v instanceof Api.VideoSize);
                if (vThumb) {
                    try {
                        const buf = await downloadWithTimeout(
                            ctx.client.downloadMedia(message, { thumb: vThumb as any }) as Promise<Buffer>,
                            30000
                        );
                        if (buf) return buf;
                    } catch { /* fall through */ }
                }
            }

            if (isGif && fileSize < 5 * 1024 * 1024) {
                return await downloadWithTimeout(
                    ctx.client.downloadMedia(message) as Promise<Buffer>,
                    30000
                );
            }
        }
    } catch (error) {
        ctx.logger.warn(ctx.phoneNumber, `Failed to get thumbnail for message ${message.id}:`, error);
    }
    return null;
}

async function resolveEntity(ctx: TgContext, chatId: string) {
    if (chatId === 'me') return 'me';
    try {
        return await safeGetEntityById(ctx, chatId) || chatId;
    } catch {
        return chatId;
    }
}

// ---- Message with media ----

async function getMessageWithMedia(ctx: TgContext, messageId: number, chatId: string): Promise<Api.Message> {
    const peer = await resolveEntity(ctx, chatId);
    const messages = await ctx.client.getMessages(peer, { ids: [messageId] });
    const message = <Api.Message>messages[0];

    if (!message || message.media instanceof Api.MessageMediaEmpty) {
        throw new Error('Media not found');
    }

    return message;
}

// ---- Media file info extraction ----

function getMediaFileInfoFromMessage(message: Api.Message): MediaFileInfo {
    const media = message.media;
    let contentType: string;
    let filename: string;
    let fileLocation: Api.TypeInputFileLocation;
    let fileSize = 0;
    let inputLocation: Api.Photo | Api.Document;
    let dcId: number | undefined;

    if (media instanceof Api.MessageMediaPhoto) {
        const photo = message.photo as Api.Photo;
        if (!photo || photo instanceof Api.PhotoEmpty) {
            throw new Error('Photo not found in message');
        }
        inputLocation = photo;
        dcId = photo.dcId;
        contentType = 'image/jpeg';
        filename = 'photo.jpg';

        const sizes = photo?.sizes || [];
        const bestSize = findSize(sizes, 'w', 'y', 'x') || lastDownloadableSize(sizes);
        const thumbSizeType = bestSize ? (bestSize as Api.PhotoSize).type || '' : '';

        const data = {
            id: photo.id,
            accessHash: photo.accessHash,
            fileReference: photo.fileReference,
        };
        fileLocation = new Api.InputPhotoFileLocation({ ...data, thumbSize: thumbSizeType });

        const largestSize = lastDownloadableSize(sizes);
        if (largestSize && 'size' in largestSize) {
            fileSize = (largestSize as Api.PhotoSize).size || 0;
        } else if (largestSize && 'sizes' in largestSize) {
            const progressiveSizes = (largestSize as Api.PhotoSizeProgressive).sizes;
            if (progressiveSizes?.length > 0) fileSize = progressiveSizes[progressiveSizes.length - 1];
        }
    } else if (media instanceof Api.MessageMediaDocument) {
        const document = media.document;
        if (!document || document instanceof Api.DocumentEmpty) {
            throw new Error('Document not found in message');
        }
        if (!(document instanceof Api.Document)) {
            throw new Error('Document format not supported');
        }

        inputLocation = document;
        dcId = document.dcId;
        const fileNameAttr = document.attributes?.find(
            attr => attr instanceof Api.DocumentAttributeFilename
        ) as Api.DocumentAttributeFilename;

        filename = fileNameAttr?.fileName || 'document.bin';
        contentType = document.mimeType || detectContentType(filename);
        fileSize = typeof document.size === 'number' ? document.size : (document.size ? Number(document.size.toString()) : 0);

        const data = {
            id: document.id,
            accessHash: document.accessHash,
            fileReference: document.fileReference,
        };
        fileLocation = new Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
    } else {
        throw new Error('Unsupported media type');
    }

    return { contentType, filename, fileLocation, fileSize, inputLocation, dcId };
}

// ---- Public media operations ----

export async function getMediaUrl(ctx: TgContext, message: Api.Message): Promise<string | Buffer> {
    if (message.media instanceof Api.MessageMediaPhoto) {
        ctx.logger.info(ctx.phoneNumber, 'messageId image:', message.id);
        const photo = <Api.Photo>message.photo;
        const sizes = photo?.sizes || [];
        const preferredSize = findSize(sizes, 'm', 'x') || lastDownloadableSize(sizes);

        return await ctx.client.downloadMedia(message, { thumb: preferredSize || sizes[0] });
    } else if (message.media instanceof Api.MessageMediaDocument &&
        (message.document?.mimeType?.startsWith('video') ||
            message.document?.mimeType?.startsWith('image'))) {
        ctx.logger.info(ctx.phoneNumber, 'messageId video:', message.id);
        const thumbs = message.document?.thumbs || [];
        const preferredThumb = findSize(thumbs, 'm') || lastDownloadableSize(thumbs);

        return await ctx.client.downloadMedia(message, { thumb: preferredThumb || thumbs[0] });
    }
    return null;
}

export async function getMediaMessages(ctx: TgContext): Promise<Api.messages.Messages> {
    const result = <Api.messages.Messages>await ctx.client.invoke(
        new Api.messages.Search({
            peer: new Api.InputPeerEmpty(),
            q: '',
            filter: new Api.InputMessagesFilterPhotos(),
            minDate: 0,
            maxDate: 0,
            offsetId: 0,
            addOffset: 0,
            limit: 200,
            maxId: 0,
            minId: 0,
            hash: bigInt(0),
        })
    );
    return result;
}

export async function getThumbnail(ctx: TgContext, messageId: number, chatId: string = 'me', quality: 'low' | 'high' = 'low'): Promise<ThumbnailResult> {
    const cacheKey = buildThumbnailCacheKey(ctx, chatId, messageId, quality);
    const cached = thumbnailCache.get(cacheKey);
    if (cached) return cached;

    if (missingThumbnailCache.get(cacheKey)) {
        throw new Error('Thumbnail not available for this media');
    }

    const message = await getMessageWithMedia(ctx, messageId, chatId);
    const thumbnail = await getThumbnailResultFromMessage(ctx, message, chatId, quality);

    if (!thumbnail) {
        throw new Error('Thumbnail not available for this media');
    }

    return thumbnail;
}

export async function getMediaFileDownloadInfo(ctx: TgContext, messageId: number, chatId: string = 'me'): Promise<MediaFileDownloadInfo> {
    const message = await getMessageWithMedia(ctx, messageId, chatId);
    const fileInfo = getMediaFileInfoFromMessage(message);

    const fileId = typeof fileInfo.inputLocation.id === 'object'
        ? fileInfo.inputLocation.id.toString()
        : fileInfo.inputLocation.id;
    const etag = generateETag(messageId, chatId, fileId);

    return { ...fileInfo, etag };
}

export async function* streamMediaFile(
    ctx: TgContext,
    fileLocation: Api.TypeInputFileLocation,
    offset: bigInt.BigInteger = bigInt(0),
    limit?: number,
    requestSize: number = 512 * 1024,
    fileSize?: number,
    dcId?: number,
): AsyncGenerator<Buffer> {
    for await (const chunk of ctx.client.iterDownload({
        file: fileLocation,
        offset,
        ...(limit !== undefined ? { limit } : {}),
        requestSize,
        ...(fileSize ? { fileSize: bigInt(fileSize) } : {}),
        ...(dcId ? { dcId } : {}),
    })) {
        yield chunk;
    }
}

export async function getMediaMetadata(ctx: TgContext, params: MediaQueryParams): Promise<MediaListResponse> {
    if (!ctx.client) throw new Error('Client not initialized');

    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit, maxId, minId } = params;
    const effectiveLimit = normalizeMediaLimit(limit);
    const peer = await resolveEntity(ctx, chatId);

    const ALL_MEDIA_TYPES = ['photo', 'video', 'document', 'voice', 'gif', 'audio', 'roundVideo', 'sticker'];
    const hasAll = types.includes('all');
    const typesToFetch: string[] = hasAll
        ? ALL_MEDIA_TYPES
        : types.filter(t => t !== 'all');

    const queryLimit = normalizeQueryLimit(effectiveLimit, typesToFetch.length, hasAll);
    const baseQuery: Partial<IterMessagesParams> = {
        ...(maxId ? { maxId } : {}),
        ...(minId ? { minId } : {}),
        ...(startDate && startDate instanceof Date && !isNaN(startDate.getTime()) && {
            minDate: Math.floor(startDate.getTime() / 1000),
        } as Partial<IterMessagesParams>),
        ...(endDate && endDate instanceof Date && !isNaN(endDate.getTime()) && {
            maxDate: Math.floor(endDate.getTime() / 1000),
        } as Partial<IterMessagesParams>),
    };

    ctx.logger.info(ctx.phoneNumber, 'getMediaMetadata', params);

    const NEEDS_POST_FILTER = new Set(['sticker', 'animation']);

    async function fetchWithPostFilter(type: string, fetchLimit: number): Promise<MediaMetadataItem[]> {
        if (!NEEDS_POST_FILTER.has(type)) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: fetchLimit,
                filter: getSearchFilter(type),
            });
            return messages
                .map(m => {
                    const detectedType = m.media ? getMediaType(m.media) : type;
                    return extractMediaMetaFromMessage(m, chatId, detectedType);
                })
                .filter(item => item.type === type);
        }

        const results: MediaMetadataItem[] = [];
        let currentMaxId = maxId;
        const maxIterations = 5;
        const batchSize = Math.max(fetchLimit * 4, 100);

        for (let i = 0; i < maxIterations && results.length < fetchLimit; i++) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: batchSize,
                filter: getSearchFilter(type),
                ...(currentMaxId ? { maxId: currentMaxId } : {}),
            });
            if (messages.length === 0) break;

            for (const m of messages) {
                const detectedType = m.media ? getMediaType(m.media) : type;
                if (detectedType === type) {
                    results.push(extractMediaMetaFromMessage(m, chatId, detectedType));
                    if (results.length >= fetchLimit) break;
                }
            }
            currentMaxId = messages[messages.length - 1].id;
            if (messages.length < batchSize) break;
        }
        return results;
    }

    let filteredMessages: MediaMetadataItem[];

    // Pre-slice combined count for the multi-type branch: lets hasMore reflect whether the
    // raw fetch genuinely had more than the page limit, instead of the post-slice length
    // which is clamped to effectiveLimit and would make hasMore always true.
    let multiTypeRawCount: number | undefined;
    if (typesToFetch.length === 1) {
        filteredMessages = await fetchWithPostFilter(typesToFetch[0], queryLimit);
    } else if (typesToFetch.length > 1) {
        const resultsPerType = await Promise.all(
            typesToFetch.map(type => fetchWithPostFilter(type, effectiveLimit))
        );
        const combined = resultsPerType.flat();
        multiTypeRawCount = combined.length;
        if (hasAll) {
            filteredMessages = combined;
        } else {
            filteredMessages = combined.sort((a, b) => b.messageId - a.messageId).slice(0, effectiveLimit);
        }
    } else {
        filteredMessages = [];
    }

    if (hasAll) {
        const grouped = filteredMessages.reduce((acc, item) => {
            if (!acc[item.type]) acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {} as Record<string, MediaMetadataItem[]>);

        const groups = typesToFetch.map(mediaType => {
            const items = (grouped[mediaType] || []).slice(0, effectiveLimit);
            const typeTotal = items.length;
            const typeHasMore = (grouped[mediaType]?.length ?? 0) > effectiveLimit;
            const typeFirstMessageId = items.length > 0 ? items[0].messageId : undefined;
            const typeLastMessageId = items.length > 0 ? items[items.length - 1].messageId : undefined;

            return {
                type: mediaType,
                count: typeTotal,
                items,
                pagination: {
                    page: 1, limit: effectiveLimit, total: typeTotal,
                    totalPages: typeHasMore ? -1 : 1,
                    hasMore: typeHasMore,
                    nextMaxId: typeHasMore ? typeLastMessageId : undefined,
                    firstMessageId: typeFirstMessageId,
                    lastMessageId: typeLastMessageId,
                },
            };
        });

        const totalItems = filteredMessages.length;
        const overallHasMore = filteredMessages.length >= queryLimit && filteredMessages.length > 0;
        const overallFirstMessageId = filteredMessages.length > 0 ? filteredMessages[0].messageId : undefined;
        const overallLastMessageId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].messageId : undefined;

        return {
            groups, pagination: {
                page: 1, limit: effectiveLimit, total: totalItems,
                totalPages: overallHasMore ? -1 : 1,
                hasMore: overallHasMore,
                nextMaxId: overallHasMore ? overallLastMessageId : undefined,
                prevMaxId: maxId && filteredMessages.length > 0 ? overallFirstMessageId : undefined,
                firstMessageId: overallFirstMessageId,
                lastMessageId: overallLastMessageId,
            },
            filters: { chatId, types: ['all'], startDate: safeIsoString(startDate), endDate: safeIsoString(endDate) },
        };
    } else {
        const total = filteredMessages.length;
        // Single-type: a full page (>= queryLimit) implies more. Multi-type: use the PRE-slice
        // combined count — only report hasMore if the raw fetch actually exceeded the page limit,
        // otherwise the slice clamps length to effectiveLimit and hasMore would always be true.
        const hasMore = (typesToFetch.length === 1
            ? filteredMessages.length >= queryLimit
            : (multiTypeRawCount ?? 0) > effectiveLimit) && filteredMessages.length > 0;
        const firstMessageId = filteredMessages.length > 0 ? filteredMessages[0].messageId : undefined;
        const lastMessageId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].messageId : undefined;

        return {
            data: filteredMessages, pagination: {
                page: 1, limit: effectiveLimit, total,
                totalPages: hasMore ? -1 : 1,
                hasMore,
                nextMaxId: hasMore ? lastMessageId : undefined,
                prevMaxId: maxId && filteredMessages.length > 0 ? firstMessageId : undefined,
                firstMessageId, lastMessageId,
            },
            filters: { chatId, types: typesToFetch, startDate: safeIsoString(startDate), endDate: safeIsoString(endDate) },
        };
    }
}

export async function getAllMediaMetaData(ctx: TgContext, params: MediaQueryParams): Promise<MediaListResponse> {
    if (!ctx.client) throw new Error('Client not initialized');
    const { chatId, types = ['all'], startDate, endDate, maxId, minId } = params;

    const ALL_MEDIA_TYPES = ['photo', 'video', 'document', 'voice', 'gif', 'audio', 'roundVideo', 'sticker'];
    const hasAll = types.includes('all');
    const typesToFetch: string[] = hasAll
        ? ALL_MEDIA_TYPES
        : types.filter(t => t !== 'all');
    let allMedia: MediaMetadataItem[] = [];
    let hasMore = true;
    let lastOffsetId = 0;
    const limit = 200;

    while (hasMore) {
        const response = await getMediaMetadata(ctx, {
            chatId, types: hasAll ? ['all'] : typesToFetch,
            startDate, endDate, limit,
            maxId: lastOffsetId > 0 ? lastOffsetId : undefined, minId,
        });
        ctx.logger.info(ctx.phoneNumber, `hasMore: ${response.pagination.hasMore}, Total: ${response.pagination.total}, nextMaxId: ${response.pagination.nextMaxId}`);

        if (response.groups) {
            const items = response.groups.flatMap(group => group.items || []);
            allMedia = allMedia.concat(items);
        } else if (response.data) {
            allMedia = allMedia.concat(response.data);
        }

        if (!response.pagination.hasMore || !response.pagination.nextMaxId) {
            hasMore = false;
            ctx.logger.info(ctx.phoneNumber, 'No more messages to fetch');
        } else {
            lastOffsetId = response.pagination.nextMaxId;
            ctx.logger.info(ctx.phoneNumber, `Fetched ${allMedia.length} messages so far`);
        }
        await sleep(3000);
    }

    if (hasAll) {
        const grouped = allMedia.reduce((acc, item) => {
            if (!acc[item.type]) acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {} as Record<string, MediaMetadataItem[]>);

        return {
            groups: typesToFetch.map(mediaType => ({
                type: mediaType,
                count: grouped[mediaType]?.length || 0,
                items: grouped[mediaType] || [],
                pagination: { page: 1, limit: grouped[mediaType]?.length || 0, total: grouped[mediaType]?.length || 0, totalPages: 1, hasMore: false },
            })),
            pagination: { page: 1, limit: allMedia.length, total: allMedia.length, totalPages: 1, hasMore: false },
            filters: { chatId, types: ['all'], startDate: safeIsoString(startDate), endDate: safeIsoString(endDate) },
        };
    } else {
        return {
            data: allMedia,
            pagination: { page: 1, limit: allMedia.length, total: allMedia.length, totalPages: 1, hasMore: false },
            filters: { chatId, types: typesToFetch, startDate: safeIsoString(startDate), endDate: safeIsoString(endDate) },
        };
    }
}

export async function getFilteredMedia(ctx: TgContext, params: MediaQueryParams): Promise<FilteredMediaListResponse> {
    if (!ctx.client) throw new Error('Client not initialized');

    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit, maxId, minId } = params;
    const effectiveLimit = normalizeMediaLimit(limit);
    const thumbnailMode = params.thumbnailMode || 'url';
    const inlineThumbnailLimit = normalizeInlineThumbnailLimit(params.inlineThumbnailLimit);
    const peer = await resolveEntity(ctx, chatId);

    const ALL_MEDIA_TYPES = ['photo', 'video', 'document', 'voice', 'gif', 'audio', 'roundVideo', 'sticker'];
    const hasAll = types.includes('all');
    const typesToFetch: string[] = hasAll
        ? ALL_MEDIA_TYPES
        : types.filter(t => t !== 'all');

    const queryLimit = normalizeQueryLimit(effectiveLimit, typesToFetch.length, hasAll);

    const baseQuery: Partial<IterMessagesParams> = {
        ...(maxId ? { maxId } : {}),
        ...(minId ? { minId } : {}),
        ...(startDate && startDate instanceof Date && !isNaN(startDate.getTime()) && {
            minDate: Math.floor(startDate.getTime() / 1000),
        }),
        ...(endDate && endDate instanceof Date && !isNaN(endDate.getTime()) && {
            maxDate: Math.floor(endDate.getTime() / 1000),
        }),
    };

    ctx.logger.info(ctx.phoneNumber, 'getFilteredMedia', params);

    const NEEDS_POST_FILTER = new Set(['sticker', 'animation']);

    async function fetchWithPostFilter(type: string, fetchLimit: number): Promise<Api.Message[]> {
        if (!NEEDS_POST_FILTER.has(type)) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: fetchLimit,
                filter: getSearchFilter(type),
            });
            return messages.filter((message): message is Api.Message => {
                if (!(message instanceof Api.Message) || !message.media) return false;
                return getMediaType(message.media) === type;
            });
        }

        const results: Api.Message[] = [];
        let currentMaxId = maxId;
        const maxIterations = 5;
        const batchSize = Math.max(fetchLimit * 4, 100);

        for (let i = 0; i < maxIterations && results.length < fetchLimit; i++) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: batchSize,
                filter: getSearchFilter(type),
                ...(currentMaxId ? { maxId: currentMaxId } : {}),
            });
            if (messages.length === 0) break;

            for (const message of messages) {
                if (!(message instanceof Api.Message) || !message.media) continue;
                if (getMediaType(message.media) === type) {
                    results.push(message);
                    if (results.length >= fetchLimit) break;
                }
            }

            const lastMessage = messages[messages.length - 1];
            currentMaxId = lastMessage instanceof Api.Message ? lastMessage.id : currentMaxId;
            if (!currentMaxId || messages.length < batchSize) break;
        }

        return results;
    }

    let filteredMessages: Api.Message[];
    // Pre-slice combined count (see getMediaMetadata) so hasMore reflects a genuinely-larger
    // raw fetch instead of the slice-clamped length.
    let multiTypeRawCount: number | undefined;
    if (typesToFetch.length === 1) {
        filteredMessages = await fetchWithPostFilter(typesToFetch[0], queryLimit);
    } else if (typesToFetch.length > 1) {
        const resultsPerType = await Promise.all(
            typesToFetch.map(type => fetchWithPostFilter(type, effectiveLimit))
        );
        const combined = resultsPerType.flat();
        multiTypeRawCount = combined.length;
        filteredMessages = hasAll
            ? combined
            : combined.sort((a, b) => b.id - a.id).slice(0, effectiveLimit);
    } else {
        filteredMessages = [];
    }

    ctx.logger.info(ctx.phoneNumber, `Filtered down to ${filteredMessages.length} messages`);

    const buildMediaItem = async (message: Api.Message, index: number): Promise<FilteredMediaItem> => {
        const mediaDetails = message.media instanceof Api.MessageMediaDocument
            ? getMediaDetails(message.media)
            : null;
        const mediaType = getMediaType(message.media);
        const baseMeta = extractMediaMetaFromMessage(message, chatId, mediaType);
        const thumbnailUrl = thumbnailMode === 'none' || !baseMeta.thumbnailAvailable
            ? undefined
            : buildThumbnailUrl(ctx, chatId, message.id, 'low', params.thumbnailApiKey, params.thumbnailBaseUrl);
        let thumbnail = thumbnailUrl;

        if (thumbnailMode === 'base64' && thumbnailUrl && index < inlineThumbnailLimit) {
            const thumbnailResult = await getThumbnailResultFromMessage(ctx, message, chatId, 'low');
            thumbnail = thumbnailResult
                ? `data:${thumbnailResult.contentType};base64,${thumbnailResult.buffer.toString('base64')}`
                : thumbnailUrl;
        }

        return {
            ...baseMeta,
            type: mediaType,
            thumbnail,
            thumbnailUrl,
            thumbnailMode,
            mediaDetails: mediaDetails || undefined,
        };
    };

    const mediaData: FilteredMediaItem[] = thumbnailMode === 'base64'
        ? await processWithConcurrencyLimit(
            filteredMessages,
            buildMediaItem,
            THUMBNAIL_CONCURRENCY_LIMIT,
            THUMBNAIL_BATCH_DELAY_MS
        )
        : await Promise.all(filteredMessages.map(buildMediaItem));

    if (hasAll) {
        const grouped = mediaData.reduce((acc, item) => {
            if (!acc[item.type]) acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {} as Record<string, FilteredMediaItem[]>);

        const groups = typesToFetch.map(mediaType => {
            const items = (grouped[mediaType] || []).slice(0, effectiveLimit);
            const typeTotal = items.length;
            const typeHasMore = (grouped[mediaType]?.length ?? 0) > effectiveLimit;
            const typeFirstMessageId = items.length > 0 ? items[0].messageId : undefined;
            const typeLastMessageId = items.length > 0 ? items[items.length - 1].messageId : undefined;

            return {
                type: mediaType, count: typeTotal, items,
                pagination: {
                    page: 1, limit: effectiveLimit, total: typeTotal,
                    totalPages: typeHasMore ? -1 : 1, hasMore: typeHasMore,
                    nextMaxId: typeHasMore ? typeLastMessageId : undefined,
                    firstMessageId: typeFirstMessageId, lastMessageId: typeLastMessageId,
                },
            };
        });

        const totalItems = mediaData.length;
        const overallHasMore = filteredMessages.length >= queryLimit && filteredMessages.length > 0;
        const overallFirstMessageId = mediaData.length > 0 ? mediaData[0].messageId : undefined;
        const overallLastMessageId = mediaData.length > 0 ? mediaData[mediaData.length - 1].messageId : undefined;

        return {
            groups, pagination: {
                page: 1, limit: effectiveLimit, total: totalItems,
                totalPages: overallHasMore ? -1 : 1, hasMore: overallHasMore,
                nextMaxId: overallHasMore ? overallLastMessageId : undefined,
                prevMaxId: maxId && mediaData.length > 0 ? overallFirstMessageId : undefined,
                firstMessageId: overallFirstMessageId, lastMessageId: overallLastMessageId,
            },
            filters: { chatId, types: ['all'], startDate: safeIsoString(startDate), endDate: safeIsoString(endDate) },
        };
    } else {
        const total = mediaData.length;
        // Multi-type: use the PRE-slice combined count so hasMore isn't always true (the slice
        // clamps filteredMessages.length to effectiveLimit). Single-type: a full page implies more.
        const hasMoreResult = (typesToFetch.length === 1
            ? filteredMessages.length >= queryLimit
            : (multiTypeRawCount ?? 0) > effectiveLimit)
            && filteredMessages.length > 0;
        const firstMessageId = mediaData.length > 0 ? mediaData[0].messageId : undefined;
        const lastMessageId = mediaData.length > 0 ? mediaData[mediaData.length - 1].messageId : undefined;

        return {
            data: mediaData, pagination: {
                page: 1, limit: effectiveLimit, total,
                totalPages: hasMoreResult ? -1 : 1, hasMore: hasMoreResult,
                nextMaxId: hasMoreResult ? lastMessageId : undefined,
                prevMaxId: maxId && mediaData.length > 0 ? firstMessageId : undefined,
                firstMessageId, lastMessageId,
            },
            filters: { chatId, types: typesToFetch, startDate: safeIsoString(startDate), endDate: safeIsoString(endDate) },
        };
    }
}

export async function getFileUrl(ctx: TgContext, url: string, filename: string): Promise<string> {
    const uniqueFilename = `${filename}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const filePath = `/tmp/${uniqueFilename}`;

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: FILE_DOWNLOAD_TIMEOUT,
            maxContentLength: MAX_FILE_SIZE,
            validateStatus: (status) => status >= 200 && status < 300,
        });

        await new Promise<void>((resolve, reject) => {
            const writer = fs.createWriteStream(filePath);
            writer.on('finish', () => resolve());
            writer.on('error', reject);
            response.data.pipe(writer);
            response.data.on('error', reject);
        });

        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    ctx.logger.debug(ctx.phoneNumber, `Cleaned up temp file: ${filePath}`);
                }
            } catch (cleanupError) {
                ctx.logger.warn(ctx.phoneNumber, `Failed to cleanup temp file ${filePath}:`, cleanupError);
            }
        }, TEMP_FILE_CLEANUP_DELAY);

        return filePath;
    } catch (error:any) {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) { /* ignore cleanup errors */ }

        if (error.response) {
            throw new Error(`Failed to download file: HTTP ${error.response.status}`);
        } else if (error.code === 'ECONNABORTED') {
            throw new Error(`Failed to download file: Request timeout`);
        } else {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
}
