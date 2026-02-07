import { Api } from 'telegram';
import * as fs from 'fs';
import axios from 'axios';
import bigInt from 'big-integer';
import { CustomFile } from 'telegram/client/uploads';
import { IterMessagesParams } from 'telegram/client/messages';
import { TgContext, MediaMetadataItem, FilteredMediaItem, MediaFileInfo, ThumbnailResult, MediaFileDownloadInfo, MediaListResponse, FilteredMediaListResponse, MediaQueryParams } from './types';
import {
    getSearchFilter, getMediaType, extractMediaMetaFromMessage, getMediaDetails,
    detectContentType, generateETag, downloadFileFromUrl, downloadWithTimeout,
    processWithConcurrencyLimit,
    FILE_DOWNLOAD_TIMEOUT, MAX_FILE_SIZE, TEMP_FILE_CLEANUP_DELAY,
    THUMBNAIL_CONCURRENCY_LIMIT, THUMBNAIL_BATCH_DELAY_MS,
} from './helpers';
import { safeGetEntityById } from './chat-operations';
import { sleep } from 'telegram/Helpers';

// ---- Thumbnail ----

export async function getThumbnailBuffer(ctx: TgContext, message: Api.Message): Promise<Buffer | null> {
    try {
        if (message.media instanceof Api.MessageMediaPhoto) {
            const sizes = (<Api.Photo>message.photo)?.sizes || [];
            if (sizes.length > 0) {
                const preferredSize = sizes.find((s: Api.TypePhotoSize) => (s as Api.PhotoSize).type === 'm') ||
                    sizes.find((s: Api.TypePhotoSize) => (s as Api.PhotoSize).type === 'x') ||
                    sizes[sizes.length - 1] ||
                    sizes[0];
                return await downloadWithTimeout(
                    ctx.client.downloadMedia(message, { thumb: preferredSize }) as Promise<Buffer>,
                    30000
                );
            }
        } else if (message.media instanceof Api.MessageMediaDocument) {
            const thumbs = message.document?.thumbs || [];
            if (thumbs.length > 0) {
                const preferredThumb = thumbs.find((t: Api.TypePhotoSize) => (t as Api.PhotoSize).type === 'm') ||
                    thumbs[thumbs.length - 1] ||
                    thumbs[0];
                return await downloadWithTimeout(
                    ctx.client.downloadMedia(message, { thumb: preferredThumb }) as Promise<Buffer>,
                    30000
                );
            }
        }
    } catch (error) {
        ctx.logger.warn(ctx.phoneNumber, `Failed to get thumbnail for message ${message.id}:`, error);
    }
    return null;
}

// ---- Message with media ----

async function getMessageWithMedia(ctx: TgContext, messageId: number, chatId: string): Promise<Api.Message> {
    const entity = await safeGetEntityById(ctx, chatId);
    const messages = await ctx.client.getMessages(entity, { ids: [messageId] });
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

    if (media instanceof Api.MessageMediaPhoto) {
        const photo = message.photo as Api.Photo;
        if (!photo || photo instanceof Api.PhotoEmpty) {
            throw new Error('Photo not found in message');
        }
        inputLocation = photo;
        contentType = 'image/jpeg';
        filename = 'photo.jpg';

        const data = {
            id: photo.id,
            accessHash: photo.accessHash,
            fileReference: photo.fileReference,
        };
        fileLocation = new Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });

        const sizes = photo?.sizes || [];
        const largestSize = sizes[sizes.length - 1];
        if (largestSize && 'size' in largestSize) {
            fileSize = (largestSize as Api.PhotoSize).size || 0;
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

    return { contentType, filename, fileLocation, fileSize, inputLocation };
}

// ---- Public media operations ----

export async function getMediaUrl(ctx: TgContext, message: Api.Message): Promise<string | Buffer> {
    if (message.media instanceof Api.MessageMediaPhoto) {
        ctx.logger.info(ctx.phoneNumber, 'messageId image:', message.id);
        const photo = <Api.Photo>message.photo;
        const sizes = photo?.sizes || [];
        const preferredSize = sizes.find((s: Api.TypePhotoSize) => (s as Api.PhotoSize).type === 'm') ||
            sizes.find((s: Api.TypePhotoSize) => (s as Api.PhotoSize).type === 'x') ||
            sizes[sizes.length - 1] ||
            sizes[0];

        return await ctx.client.downloadMedia(message, { thumb: preferredSize || sizes[0] });
    } else if (message.media instanceof Api.MessageMediaDocument &&
        (message.document?.mimeType?.startsWith('video') ||
            message.document?.mimeType?.startsWith('image'))) {
        ctx.logger.info(ctx.phoneNumber, 'messageId video:', message.id);
        const thumbs = message.document?.thumbs || [];
        const preferredThumb = thumbs.find((t: Api.TypePhotoSize) => (t as Api.PhotoSize).type === 'm') ||
            thumbs[thumbs.length - 1] ||
            thumbs[0];

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

export async function getThumbnail(ctx: TgContext, messageId: number, chatId: string = 'me'): Promise<ThumbnailResult> {
    const message = await getMessageWithMedia(ctx, messageId, chatId);
    const thumbBuffer = await getThumbnailBuffer(ctx, message);

    if (!thumbBuffer) {
        throw new Error('Thumbnail not available for this media');
    }

    const etag = generateETag(messageId, chatId, `thumb-${messageId}`);

    return {
        buffer: thumbBuffer,
        etag,
        contentType: 'image/jpeg',
        filename: `thumbnail_${messageId}.jpg`,
    };
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
    limit: number = 5 * 1024 * 1024,
    requestSize: number = 512 * 1024
): AsyncGenerator<Buffer> {
    for await (const chunk of ctx.client.iterDownload({
        file: fileLocation,
        offset,
        limit,
        requestSize,
    })) {
        yield chunk;
    }
}

export async function getMediaMetadata(ctx: TgContext, params: MediaQueryParams): Promise<MediaListResponse> {
    if (!ctx.client) throw new Error('Client not initialized');

    let { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;

    const hasAll = types.includes('all');
    const typesToFetch: ('photo' | 'video' | 'document' | 'voice')[] = hasAll
        ? ['photo', 'video', 'document', 'voice']
        : types.filter(t => t !== 'all') as ('photo' | 'video' | 'document' | 'voice')[];

    const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);
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

    const ent = await safeGetEntityById(ctx, chatId);
    ctx.logger.info(ctx.phoneNumber, 'getMediaMetadata', params);

    let filteredMessages: MediaMetadataItem[];

    if (typesToFetch.length === 1) {
        const messages = await ctx.client.getMessages(ent, {
            ...baseQuery,
            limit: queryLimit,
            filter: getSearchFilter(typesToFetch[0]),
        });
        filteredMessages = messages.map(message => extractMediaMetaFromMessage(message, chatId, typesToFetch[0]));
    } else if (typesToFetch.length > 1) {
        const resultsPerType = await Promise.all(
            typesToFetch.map(type =>
                ctx.client.getMessages(ent, {
                    ...baseQuery,
                    limit,
                    filter: getSearchFilter(type),
                }).then(msgs => msgs.map(m => extractMediaMetaFromMessage(m, chatId, type)))
            )
        );
        if (hasAll) {
            filteredMessages = resultsPerType.flat();
        } else {
            filteredMessages = resultsPerType.flat().sort((a, b) => b.messageId - a.messageId).slice(0, limit);
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
            const items = (grouped[mediaType] || []).slice(0, limit);
            const typeTotal = items.length;
            const typeHasMore = (grouped[mediaType]?.length ?? 0) > limit;
            const typeFirstMessageId = items.length > 0 ? items[0].messageId : undefined;
            const typeLastMessageId = items.length > 0 ? items[items.length - 1].messageId : undefined;

            return {
                type: mediaType,
                count: typeTotal,
                items,
                pagination: {
                    page: 1, limit, total: typeTotal,
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
                page: 1, limit, total: totalItems,
                totalPages: overallHasMore ? -1 : 1,
                hasMore: overallHasMore,
                nextMaxId: overallHasMore ? overallLastMessageId : undefined,
                prevMaxId: maxId && filteredMessages.length > 0 ? overallFirstMessageId : undefined,
                firstMessageId: overallFirstMessageId,
                lastMessageId: overallLastMessageId,
            },
            filters: { chatId, types: ['all'], startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
        };
    } else {
        const total = filteredMessages.length;
        const hasMore = (typesToFetch.length === 1 ? filteredMessages.length >= queryLimit : filteredMessages.length === limit) && filteredMessages.length > 0;
        const firstMessageId = filteredMessages.length > 0 ? filteredMessages[0].messageId : undefined;
        const lastMessageId = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].messageId : undefined;

        return {
            data: filteredMessages, pagination: {
                page: 1, limit, total,
                totalPages: hasMore ? -1 : 1,
                hasMore,
                nextMaxId: hasMore ? lastMessageId : undefined,
                prevMaxId: maxId && filteredMessages.length > 0 ? firstMessageId : undefined,
                firstMessageId, lastMessageId,
            },
            filters: { chatId, types: typesToFetch, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
        };
    }
}

export async function getAllMediaMetaData(ctx: TgContext, params: MediaQueryParams): Promise<MediaListResponse> {
    if (!ctx.client) throw new Error('Client not initialized');
    let { chatId, types = ['all'], startDate, endDate, maxId, minId } = params;

    const hasAll = types.includes('all');
    const typesToFetch: ('photo' | 'video' | 'document' | 'voice')[] = hasAll
        ? ['photo', 'video', 'document', 'voice']
        : types.filter(t => t !== 'all') as ('photo' | 'video' | 'document' | 'voice')[];
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
            filters: { chatId, types: ['all'], startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
        };
    } else {
        return {
            data: allMedia,
            pagination: { page: 1, limit: allMedia.length, total: allMedia.length, totalPages: 1, hasMore: false },
            filters: { chatId, types: typesToFetch, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
        };
    }
}

export async function getFilteredMedia(ctx: TgContext, params: MediaQueryParams): Promise<FilteredMediaListResponse> {
    if (!ctx.client) throw new Error('Client not initialized');

    let { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;

    const hasAll = types.includes('all');
    const typesToFetch: ('photo' | 'video' | 'document' | 'voice')[] = hasAll
        ? ['photo', 'video', 'document', 'voice']
        : types.filter(t => t !== 'all') as ('photo' | 'video' | 'document' | 'voice')[];

    const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);

    const query: Partial<IterMessagesParams> = {
        limit: queryLimit,
        ...(maxId ? { maxId } : {}),
        ...(minId ? { minId } : {}),
        ...(startDate && startDate instanceof Date && !isNaN(startDate.getTime()) && {
            minDate: Math.floor(startDate.getTime() / 1000),
        }),
        ...(endDate && endDate instanceof Date && !isNaN(endDate.getTime()) && {
            maxDate: Math.floor(endDate.getTime() / 1000),
        }),
    };

    const ent = await safeGetEntityById(ctx, chatId);
    ctx.logger.info(ctx.phoneNumber, 'getFilteredMedia', params);
    const messages = await ctx.client.getMessages(ent, query);
    ctx.logger.info(ctx.phoneNumber, `Fetched ${messages.length} messages`);

    const filteredMessages = messages.filter(message => {
        if (!message.media) return false;
        const mediaType = getMediaType(message.media);
        return typesToFetch.includes(mediaType);
    });

    ctx.logger.info(ctx.phoneNumber, `Filtered down to ${filteredMessages.length} messages`);

    const mediaData: FilteredMediaItem[] = await processWithConcurrencyLimit(
        filteredMessages,
        async (message: Api.Message) => {
            const thumbBuffer = await getThumbnailBuffer(ctx, message);
            const mediaDetails = getMediaDetails(message.media as Api.MessageMediaDocument);
            const baseMeta = extractMediaMetaFromMessage(message, chatId, getMediaType(message.media));

            return {
                ...baseMeta,
                type: getMediaType(message.media),
                thumbnail: thumbBuffer ? `data:image/jpeg;base64,${thumbBuffer.toString('base64')}` : undefined,
                mediaDetails: mediaDetails || undefined,
            };
        },
        THUMBNAIL_CONCURRENCY_LIMIT,
        THUMBNAIL_BATCH_DELAY_MS
    );

    if (hasAll) {
        const grouped = mediaData.reduce((acc, item) => {
            if (!acc[item.type]) acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {} as Record<string, FilteredMediaItem[]>);

        const groups = typesToFetch.map(mediaType => {
            const items = (grouped[mediaType] || []).slice(0, limit);
            const typeTotal = items.length;
            const typeHasMore = (grouped[mediaType]?.length ?? 0) > limit;
            const typeFirstMessageId = items.length > 0 ? items[0].messageId : undefined;
            const typeLastMessageId = items.length > 0 ? items[items.length - 1].messageId : undefined;

            return {
                type: mediaType, count: typeTotal, items,
                pagination: {
                    page: 1, limit, total: typeTotal,
                    totalPages: typeHasMore ? -1 : 1, hasMore: typeHasMore,
                    nextMaxId: typeHasMore ? typeLastMessageId : undefined,
                    firstMessageId: typeFirstMessageId, lastMessageId: typeLastMessageId,
                },
            };
        });

        const totalItems = mediaData.length;
        const overallHasMore = messages.length === queryLimit && messages.length > 0;
        const overallFirstMessageId = mediaData.length > 0 ? mediaData[0].messageId : undefined;
        const overallLastMessageId = mediaData.length > 0 ? mediaData[mediaData.length - 1].messageId : undefined;

        return {
            groups, pagination: {
                page: 1, limit, total: totalItems,
                totalPages: overallHasMore ? -1 : 1, hasMore: overallHasMore,
                nextMaxId: overallHasMore ? overallLastMessageId : undefined,
                prevMaxId: maxId && mediaData.length > 0 ? overallFirstMessageId : undefined,
                firstMessageId: overallFirstMessageId, lastMessageId: overallLastMessageId,
            },
            filters: { chatId, types: ['all'], startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
        };
    } else {
        const total = mediaData.length;
        const hasMoreResult = messages.length === queryLimit && messages.length > 0;
        const firstMessageId = mediaData.length > 0 ? mediaData[0].messageId : undefined;
        const lastMessageId = mediaData.length > 0 ? mediaData[mediaData.length - 1].messageId : undefined;

        return {
            data: mediaData, pagination: {
                page: 1, limit, total,
                totalPages: hasMoreResult ? -1 : 1, hasMore: hasMoreResult,
                nextMaxId: hasMoreResult ? lastMessageId : undefined,
                prevMaxId: maxId && mediaData.length > 0 ? firstMessageId : undefined,
                firstMessageId, lastMessageId,
            },
            filters: { chatId, types: typesToFetch, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
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
    } catch (error) {
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
