"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getThumbnailBuffer = getThumbnailBuffer;
exports.getMediaUrl = getMediaUrl;
exports.getMediaMessages = getMediaMessages;
exports.getThumbnail = getThumbnail;
exports.getMediaFileDownloadInfo = getMediaFileDownloadInfo;
exports.streamMediaFile = streamMediaFile;
exports.getMediaMetadata = getMediaMetadata;
exports.getAllMediaMetaData = getAllMediaMetaData;
exports.getFilteredMedia = getFilteredMedia;
exports.getFileUrl = getFileUrl;
const telegram_1 = require("telegram");
const Utils_1 = require("telegram/Utils");
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const big_integer_1 = __importDefault(require("big-integer"));
const helpers_1 = require("./helpers");
const Helpers_1 = require("telegram/Helpers");
const chat_operations_1 = require("./chat-operations");
const thumbnailCache = new helpers_1.ByteLimitedLruCache({
    maxEntries: helpers_1.THUMBNAIL_CACHE_MAX_ENTRIES,
    maxBytes: helpers_1.THUMBNAIL_CACHE_MAX_BYTES,
    ttlMs: helpers_1.THUMBNAIL_CACHE_TTL_MS,
});
const missingThumbnailCache = new helpers_1.ByteLimitedLruCache({
    maxEntries: helpers_1.THUMBNAIL_CACHE_MAX_ENTRIES * 2,
    maxBytes: 64 * 1024,
    ttlMs: helpers_1.MISSING_THUMBNAIL_CACHE_TTL_MS,
});
function safeIsoString(date) {
    if (!(date instanceof Date) || isNaN(date.getTime()))
        return undefined;
    return date.toISOString();
}
function normalizeMediaLimit(limit) {
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit) || numericLimit <= 0)
        return helpers_1.MEDIA_DEFAULT_LIMIT;
    return Math.min(Math.floor(numericLimit), helpers_1.MEDIA_MAX_LIMIT);
}
function normalizeQueryLimit(limit, typeCount, hasAll) {
    const requested = hasAll ? limit * Math.max(typeCount, 1) : limit;
    return Math.min(requested, helpers_1.MEDIA_MAX_QUERY_LIMIT);
}
function normalizeInlineThumbnailLimit(limit) {
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0)
        return helpers_1.INLINE_THUMBNAIL_DEFAULT_LIMIT;
    return Math.min(Math.floor(numericLimit), helpers_1.INLINE_THUMBNAIL_MAX_LIMIT);
}
function buildThumbnailCacheKey(ctx, chatId, messageId, quality) {
    return `${ctx.phoneNumber}:${chatId}:${messageId}:${quality}`;
}
function appendQueryParam(params, name, value) {
    if (value === undefined || value === null || value === '')
        return;
    params.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
}
function buildThumbnailUrl(ctx, chatId, messageId, quality, apiKey, baseUrl) {
    const params = [];
    appendQueryParam(params, 'chatId', chatId);
    appendQueryParam(params, 'messageId', messageId);
    appendQueryParam(params, 'quality', quality);
    appendQueryParam(params, 'apiKey', apiKey);
    const prefix = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    return `${prefix}/telegram/media/thumbnail/${encodeURIComponent(ctx.phoneNumber)}?${params.join('&')}`;
}
async function getThumbnailResultFromMessage(ctx, message, chatId, quality = 'low') {
    const cacheKey = buildThumbnailCacheKey(ctx, chatId, message.id, quality);
    const cached = thumbnailCache.get(cacheKey);
    if (cached)
        return cached;
    if (missingThumbnailCache.get(cacheKey))
        return null;
    const thumbBuffer = await getThumbnailBuffer(ctx, message, quality);
    if (!thumbBuffer) {
        missingThumbnailCache.set(cacheKey, true, 1);
        return null;
    }
    const etag = (0, helpers_1.generateETag)(message.id, chatId, `thumb-${quality}-${message.id}`);
    let contentType = 'image/jpeg';
    let ext = 'jpg';
    if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
        const doc = message.document;
        if (doc && doc instanceof telegram_1.Api.Document) {
            const isSticker = doc.attributes?.some(attr => attr instanceof telegram_1.Api.DocumentAttributeSticker);
            const isGif = isAnimatedGif(doc);
            if (isSticker) {
                contentType = 'image/webp';
                ext = 'webp';
            }
            else if (isGif) {
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
function isDownloadableSize(s) {
    return !(s instanceof telegram_1.Api.PhotoStrippedSize) &&
        !(s instanceof telegram_1.Api.PhotoCachedSize) &&
        !(s instanceof telegram_1.Api.PhotoSizeEmpty);
}
function findSize(sizes, ...types) {
    for (const type of types) {
        const found = sizes.find((s) => isDownloadableSize(s) && s.type === type);
        if (found)
            return found;
    }
    return undefined;
}
function lastDownloadableSize(sizes) {
    for (let i = sizes.length - 1; i >= 0; i--) {
        if (isDownloadableSize(sizes[i]))
            return sizes[i];
    }
    return undefined;
}
function extractInlineThumbnail(sizes) {
    for (const s of sizes) {
        if (s instanceof telegram_1.Api.PhotoStrippedSize) {
            return (0, Utils_1.strippedPhotoToJpg)(s.bytes);
        }
        if (s instanceof telegram_1.Api.PhotoCachedSize) {
            return Buffer.from(s.bytes);
        }
    }
    return null;
}
function isAnimatedGif(doc) {
    return doc.attributes?.some(attr => attr instanceof telegram_1.Api.DocumentAttributeAnimated) ||
        doc.mimeType === 'image/gif' ||
        doc.mimeType === 'video/mp4' && doc.attributes?.some(attr => attr instanceof telegram_1.Api.DocumentAttributeAnimated);
}
async function getThumbnailBuffer(ctx, message, quality = 'low') {
    try {
        if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
            const sizes = message.photo?.sizes || [];
            if (sizes.length > 0) {
                const preferredSize = quality === 'high'
                    ? (findSize(sizes, 'x', 'y', 'm') || lastDownloadableSize(sizes))
                    : (findSize(sizes, 'm', 'x') || lastDownloadableSize(sizes));
                if (preferredSize) {
                    try {
                        const buf = await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message, { thumb: preferredSize }), 30000);
                        if (buf)
                            return buf;
                    }
                    catch { }
                }
                const inline = extractInlineThumbnail(sizes);
                if (inline)
                    return inline;
            }
        }
        else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
            const doc = message.document;
            if (!(doc instanceof telegram_1.Api.Document))
                return null;
            const isGif = isAnimatedGif(doc);
            const isSticker = doc.attributes?.some(attr => attr instanceof telegram_1.Api.DocumentAttributeSticker);
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
                            const buf = await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message, { thumb: preferredThumb }), 30000);
                            if (buf)
                                return buf;
                        }
                        catch { }
                    }
                    const inline = extractInlineThumbnail(thumbs);
                    if (inline)
                        return inline;
                }
                const renderable = doc.mimeType === 'image/webp' || doc.mimeType === 'image/png';
                if (renderable && fileSize < 2 * 1024 * 1024) {
                    return await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message), 30000);
                }
                return null;
            }
            if (isGif && fileSize < 2 * 1024 * 1024) {
                return await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message), 30000);
            }
            if (thumbs.length > 0) {
                const preferredThumb = quality === 'high'
                    ? (findSize(thumbs, 'x', 'y', 'm') || lastDownloadableSize(thumbs))
                    : (findSize(thumbs, 'm', 'x', 's') || lastDownloadableSize(thumbs));
                if (preferredThumb) {
                    try {
                        const buf = await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message, { thumb: preferredThumb }), 30000);
                        if (buf)
                            return buf;
                    }
                    catch { }
                }
                const inline = extractInlineThumbnail(thumbs);
                if (inline)
                    return inline;
            }
            if (videoThumbs.length > 0) {
                const vThumb = videoThumbs.find(v => v instanceof telegram_1.Api.VideoSize);
                if (vThumb) {
                    try {
                        const buf = await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message, { thumb: vThumb }), 30000);
                        if (buf)
                            return buf;
                    }
                    catch { }
                }
            }
            if (isGif && fileSize < 5 * 1024 * 1024) {
                return await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message), 30000);
            }
        }
    }
    catch (error) {
        ctx.logger.warn(ctx.phoneNumber, `Failed to get thumbnail for message ${message.id}:`, error);
    }
    return null;
}
async function resolveEntity(ctx, chatId) {
    if (chatId === 'me')
        return 'me';
    try {
        return await (0, chat_operations_1.safeGetEntityById)(ctx, chatId) || chatId;
    }
    catch {
        return chatId;
    }
}
async function getMessageWithMedia(ctx, messageId, chatId) {
    const peer = await resolveEntity(ctx, chatId);
    const messages = await ctx.client.getMessages(peer, { ids: [messageId] });
    const message = messages[0];
    if (!message || message.media instanceof telegram_1.Api.MessageMediaEmpty) {
        throw new Error('Media not found');
    }
    return message;
}
function getMediaFileInfoFromMessage(message) {
    const media = message.media;
    let contentType;
    let filename;
    let fileLocation;
    let fileSize = 0;
    let inputLocation;
    let dcId;
    if (media instanceof telegram_1.Api.MessageMediaPhoto) {
        const photo = message.photo;
        if (!photo || photo instanceof telegram_1.Api.PhotoEmpty) {
            throw new Error('Photo not found in message');
        }
        inputLocation = photo;
        dcId = photo.dcId;
        contentType = 'image/jpeg';
        filename = 'photo.jpg';
        const sizes = photo?.sizes || [];
        const bestSize = findSize(sizes, 'w', 'y', 'x') || lastDownloadableSize(sizes);
        const thumbSizeType = bestSize ? bestSize.type || '' : '';
        const data = {
            id: photo.id,
            accessHash: photo.accessHash,
            fileReference: photo.fileReference,
        };
        fileLocation = new telegram_1.Api.InputPhotoFileLocation({ ...data, thumbSize: thumbSizeType });
        const largestSize = lastDownloadableSize(sizes);
        if (largestSize && 'size' in largestSize) {
            fileSize = largestSize.size || 0;
        }
        else if (largestSize && 'sizes' in largestSize) {
            const progressiveSizes = largestSize.sizes;
            if (progressiveSizes?.length > 0)
                fileSize = progressiveSizes[progressiveSizes.length - 1];
        }
    }
    else if (media instanceof telegram_1.Api.MessageMediaDocument) {
        const document = media.document;
        if (!document || document instanceof telegram_1.Api.DocumentEmpty) {
            throw new Error('Document not found in message');
        }
        if (!(document instanceof telegram_1.Api.Document)) {
            throw new Error('Document format not supported');
        }
        inputLocation = document;
        dcId = document.dcId;
        const fileNameAttr = document.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
        filename = fileNameAttr?.fileName || 'document.bin';
        contentType = document.mimeType || (0, helpers_1.detectContentType)(filename);
        fileSize = typeof document.size === 'number' ? document.size : (document.size ? Number(document.size.toString()) : 0);
        const data = {
            id: document.id,
            accessHash: document.accessHash,
            fileReference: document.fileReference,
        };
        fileLocation = new telegram_1.Api.InputDocumentFileLocation({ ...data, thumbSize: '' });
    }
    else {
        throw new Error('Unsupported media type');
    }
    return { contentType, filename, fileLocation, fileSize, inputLocation, dcId };
}
async function getMediaUrl(ctx, message) {
    if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
        ctx.logger.info(ctx.phoneNumber, 'messageId image:', message.id);
        const photo = message.photo;
        const sizes = photo?.sizes || [];
        const preferredSize = findSize(sizes, 'm', 'x') || lastDownloadableSize(sizes);
        return await ctx.client.downloadMedia(message, { thumb: preferredSize || sizes[0] });
    }
    else if (message.media instanceof telegram_1.Api.MessageMediaDocument &&
        (message.document?.mimeType?.startsWith('video') ||
            message.document?.mimeType?.startsWith('image'))) {
        ctx.logger.info(ctx.phoneNumber, 'messageId video:', message.id);
        const thumbs = message.document?.thumbs || [];
        const preferredThumb = findSize(thumbs, 'm') || lastDownloadableSize(thumbs);
        return await ctx.client.downloadMedia(message, { thumb: preferredThumb || thumbs[0] });
    }
    return null;
}
async function getMediaMessages(ctx) {
    const result = await ctx.client.invoke(new telegram_1.Api.messages.Search({
        peer: new telegram_1.Api.InputPeerEmpty(),
        q: '',
        filter: new telegram_1.Api.InputMessagesFilterPhotos(),
        minDate: 0,
        maxDate: 0,
        offsetId: 0,
        addOffset: 0,
        limit: 200,
        maxId: 0,
        minId: 0,
        hash: (0, big_integer_1.default)(0),
    }));
    return result;
}
async function getThumbnail(ctx, messageId, chatId = 'me', quality = 'low') {
    const cacheKey = buildThumbnailCacheKey(ctx, chatId, messageId, quality);
    const cached = thumbnailCache.get(cacheKey);
    if (cached)
        return cached;
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
async function getMediaFileDownloadInfo(ctx, messageId, chatId = 'me') {
    const message = await getMessageWithMedia(ctx, messageId, chatId);
    const fileInfo = getMediaFileInfoFromMessage(message);
    const fileId = typeof fileInfo.inputLocation.id === 'object'
        ? fileInfo.inputLocation.id.toString()
        : fileInfo.inputLocation.id;
    const etag = (0, helpers_1.generateETag)(messageId, chatId, fileId);
    return { ...fileInfo, etag };
}
async function* streamMediaFile(ctx, fileLocation, offset = (0, big_integer_1.default)(0), limit, requestSize = 512 * 1024, fileSize, dcId) {
    for await (const chunk of ctx.client.iterDownload({
        file: fileLocation,
        offset,
        ...(limit !== undefined ? { limit } : {}),
        requestSize,
        ...(fileSize ? { fileSize: (0, big_integer_1.default)(fileSize) } : {}),
        ...(dcId ? { dcId } : {}),
    })) {
        yield chunk;
    }
}
async function getMediaMetadata(ctx, params) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit, maxId, minId } = params;
    const effectiveLimit = normalizeMediaLimit(limit);
    const peer = await resolveEntity(ctx, chatId);
    const ALL_MEDIA_TYPES = ['photo', 'video', 'document', 'voice', 'gif', 'audio', 'roundVideo', 'sticker'];
    const hasAll = types.includes('all');
    const typesToFetch = hasAll
        ? ALL_MEDIA_TYPES
        : types.filter(t => t !== 'all');
    const queryLimit = normalizeQueryLimit(effectiveLimit, typesToFetch.length, hasAll);
    const baseQuery = {
        ...(maxId ? { maxId } : {}),
        ...(minId ? { minId } : {}),
        ...(startDate && startDate instanceof Date && !isNaN(startDate.getTime()) && {
            minDate: Math.floor(startDate.getTime() / 1000),
        }),
        ...(endDate && endDate instanceof Date && !isNaN(endDate.getTime()) && {
            maxDate: Math.floor(endDate.getTime() / 1000),
        }),
    };
    ctx.logger.info(ctx.phoneNumber, 'getMediaMetadata', params);
    const NEEDS_POST_FILTER = new Set(['sticker', 'animation']);
    async function fetchWithPostFilter(type, fetchLimit) {
        if (!NEEDS_POST_FILTER.has(type)) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: fetchLimit,
                filter: (0, helpers_1.getSearchFilter)(type),
            });
            return messages
                .map(m => {
                const detectedType = m.media ? (0, helpers_1.getMediaType)(m.media) : type;
                return (0, helpers_1.extractMediaMetaFromMessage)(m, chatId, detectedType);
            })
                .filter(item => item.type === type);
        }
        const results = [];
        let currentMaxId = maxId;
        const maxIterations = 5;
        const batchSize = Math.max(fetchLimit * 4, 100);
        for (let i = 0; i < maxIterations && results.length < fetchLimit; i++) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: batchSize,
                filter: (0, helpers_1.getSearchFilter)(type),
                ...(currentMaxId ? { maxId: currentMaxId } : {}),
            });
            if (messages.length === 0)
                break;
            for (const m of messages) {
                const detectedType = m.media ? (0, helpers_1.getMediaType)(m.media) : type;
                if (detectedType === type) {
                    results.push((0, helpers_1.extractMediaMetaFromMessage)(m, chatId, detectedType));
                    if (results.length >= fetchLimit)
                        break;
                }
            }
            currentMaxId = messages[messages.length - 1].id;
            if (messages.length < batchSize)
                break;
        }
        return results;
    }
    let filteredMessages;
    let multiTypeRawCount;
    if (typesToFetch.length === 1) {
        filteredMessages = await fetchWithPostFilter(typesToFetch[0], queryLimit);
    }
    else if (typesToFetch.length > 1) {
        const resultsPerType = await Promise.all(typesToFetch.map(type => fetchWithPostFilter(type, effectiveLimit)));
        const combined = resultsPerType.flat();
        multiTypeRawCount = combined.length;
        if (hasAll) {
            filteredMessages = combined;
        }
        else {
            filteredMessages = combined.sort((a, b) => b.messageId - a.messageId).slice(0, effectiveLimit);
        }
    }
    else {
        filteredMessages = [];
    }
    if (hasAll) {
        const grouped = filteredMessages.reduce((acc, item) => {
            if (!acc[item.type])
                acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {});
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
    }
    else {
        const total = filteredMessages.length;
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
async function getAllMediaMetaData(ctx, params) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const { chatId, types = ['all'], startDate, endDate, maxId, minId } = params;
    const ALL_MEDIA_TYPES = ['photo', 'video', 'document', 'voice', 'gif', 'audio', 'roundVideo', 'sticker'];
    const hasAll = types.includes('all');
    const typesToFetch = hasAll
        ? ALL_MEDIA_TYPES
        : types.filter(t => t !== 'all');
    let allMedia = [];
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
        }
        else if (response.data) {
            allMedia = allMedia.concat(response.data);
        }
        if (!response.pagination.hasMore || !response.pagination.nextMaxId) {
            hasMore = false;
            ctx.logger.info(ctx.phoneNumber, 'No more messages to fetch');
        }
        else {
            lastOffsetId = response.pagination.nextMaxId;
            ctx.logger.info(ctx.phoneNumber, `Fetched ${allMedia.length} messages so far`);
        }
        await (0, Helpers_1.sleep)(3000);
    }
    if (hasAll) {
        const grouped = allMedia.reduce((acc, item) => {
            if (!acc[item.type])
                acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {});
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
    }
    else {
        return {
            data: allMedia,
            pagination: { page: 1, limit: allMedia.length, total: allMedia.length, totalPages: 1, hasMore: false },
            filters: { chatId, types: typesToFetch, startDate: safeIsoString(startDate), endDate: safeIsoString(endDate) },
        };
    }
}
async function getFilteredMedia(ctx, params) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    const { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit, maxId, minId } = params;
    const effectiveLimit = normalizeMediaLimit(limit);
    const thumbnailMode = params.thumbnailMode || 'url';
    const inlineThumbnailLimit = normalizeInlineThumbnailLimit(params.inlineThumbnailLimit);
    const peer = await resolveEntity(ctx, chatId);
    const ALL_MEDIA_TYPES = ['photo', 'video', 'document', 'voice', 'gif', 'audio', 'roundVideo', 'sticker'];
    const hasAll = types.includes('all');
    const typesToFetch = hasAll
        ? ALL_MEDIA_TYPES
        : types.filter(t => t !== 'all');
    const queryLimit = normalizeQueryLimit(effectiveLimit, typesToFetch.length, hasAll);
    const baseQuery = {
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
    async function fetchWithPostFilter(type, fetchLimit) {
        if (!NEEDS_POST_FILTER.has(type)) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: fetchLimit,
                filter: (0, helpers_1.getSearchFilter)(type),
            });
            return messages.filter((message) => {
                if (!(message instanceof telegram_1.Api.Message) || !message.media)
                    return false;
                return (0, helpers_1.getMediaType)(message.media) === type;
            });
        }
        const results = [];
        let currentMaxId = maxId;
        const maxIterations = 5;
        const batchSize = Math.max(fetchLimit * 4, 100);
        for (let i = 0; i < maxIterations && results.length < fetchLimit; i++) {
            const messages = await ctx.client.getMessages(peer, {
                ...baseQuery,
                limit: batchSize,
                filter: (0, helpers_1.getSearchFilter)(type),
                ...(currentMaxId ? { maxId: currentMaxId } : {}),
            });
            if (messages.length === 0)
                break;
            for (const message of messages) {
                if (!(message instanceof telegram_1.Api.Message) || !message.media)
                    continue;
                if ((0, helpers_1.getMediaType)(message.media) === type) {
                    results.push(message);
                    if (results.length >= fetchLimit)
                        break;
                }
            }
            const lastMessage = messages[messages.length - 1];
            currentMaxId = lastMessage instanceof telegram_1.Api.Message ? lastMessage.id : currentMaxId;
            if (!currentMaxId || messages.length < batchSize)
                break;
        }
        return results;
    }
    let filteredMessages;
    let multiTypeRawCount;
    if (typesToFetch.length === 1) {
        filteredMessages = await fetchWithPostFilter(typesToFetch[0], queryLimit);
    }
    else if (typesToFetch.length > 1) {
        const resultsPerType = await Promise.all(typesToFetch.map(type => fetchWithPostFilter(type, effectiveLimit)));
        const combined = resultsPerType.flat();
        multiTypeRawCount = combined.length;
        filteredMessages = hasAll
            ? combined
            : combined.sort((a, b) => b.id - a.id).slice(0, effectiveLimit);
    }
    else {
        filteredMessages = [];
    }
    ctx.logger.info(ctx.phoneNumber, `Filtered down to ${filteredMessages.length} messages`);
    const buildMediaItem = async (message, index) => {
        const mediaDetails = message.media instanceof telegram_1.Api.MessageMediaDocument
            ? (0, helpers_1.getMediaDetails)(message.media)
            : null;
        const mediaType = (0, helpers_1.getMediaType)(message.media);
        const baseMeta = (0, helpers_1.extractMediaMetaFromMessage)(message, chatId, mediaType);
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
    const mediaData = thumbnailMode === 'base64'
        ? await (0, helpers_1.processWithConcurrencyLimit)(filteredMessages, buildMediaItem, helpers_1.THUMBNAIL_CONCURRENCY_LIMIT, helpers_1.THUMBNAIL_BATCH_DELAY_MS)
        : await Promise.all(filteredMessages.map(buildMediaItem));
    if (hasAll) {
        const grouped = mediaData.reduce((acc, item) => {
            if (!acc[item.type])
                acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {});
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
    }
    else {
        const total = mediaData.length;
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
async function getFileUrl(ctx, url, filename) {
    const uniqueFilename = `${filename}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const filePath = `/tmp/${uniqueFilename}`;
    try {
        const response = await axios_1.default.get(url, {
            responseType: 'stream',
            timeout: helpers_1.FILE_DOWNLOAD_TIMEOUT,
            maxContentLength: helpers_1.MAX_FILE_SIZE,
            validateStatus: (status) => status >= 200 && status < 300,
        });
        await new Promise((resolve, reject) => {
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
            }
            catch (cleanupError) {
                ctx.logger.warn(ctx.phoneNumber, `Failed to cleanup temp file ${filePath}:`, cleanupError);
            }
        }, helpers_1.TEMP_FILE_CLEANUP_DELAY);
        return filePath;
    }
    catch (error) {
        try {
            if (fs.existsSync(filePath))
                fs.unlinkSync(filePath);
        }
        catch (_) { }
        if (error.response) {
            throw new Error(`Failed to download file: HTTP ${error.response.status}`);
        }
        else if (error.code === 'ECONNABORTED') {
            throw new Error(`Failed to download file: Request timeout`);
        }
        else {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
}
//# sourceMappingURL=media-operations.js.map