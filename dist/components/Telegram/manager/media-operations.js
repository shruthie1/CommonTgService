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
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const big_integer_1 = __importDefault(require("big-integer"));
const helpers_1 = require("./helpers");
const chat_operations_1 = require("./chat-operations");
const Helpers_1 = require("telegram/Helpers");
async function getThumbnailBuffer(ctx, message) {
    try {
        if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
            const sizes = message.photo?.sizes || [];
            if (sizes.length > 0) {
                const preferredSize = sizes.find((s) => s.type === 'm') ||
                    sizes.find((s) => s.type === 'x') ||
                    sizes[sizes.length - 1] ||
                    sizes[0];
                return await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message, { thumb: preferredSize }), 30000);
            }
        }
        else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
            const thumbs = message.document?.thumbs || [];
            if (thumbs.length > 0) {
                const preferredThumb = thumbs.find((t) => t.type === 'm') ||
                    thumbs[thumbs.length - 1] ||
                    thumbs[0];
                return await (0, helpers_1.downloadWithTimeout)(ctx.client.downloadMedia(message, { thumb: preferredThumb }), 30000);
            }
        }
    }
    catch (error) {
        ctx.logger.warn(ctx.phoneNumber, `Failed to get thumbnail for message ${message.id}:`, error);
    }
    return null;
}
async function getMessageWithMedia(ctx, messageId, chatId) {
    const entity = await (0, chat_operations_1.safeGetEntityById)(ctx, chatId);
    const messages = await ctx.client.getMessages(entity, { ids: [messageId] });
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
    if (media instanceof telegram_1.Api.MessageMediaPhoto) {
        const photo = message.photo;
        if (!photo || photo instanceof telegram_1.Api.PhotoEmpty) {
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
        fileLocation = new telegram_1.Api.InputPhotoFileLocation({ ...data, thumbSize: 'm' });
        const sizes = photo?.sizes || [];
        const largestSize = sizes[sizes.length - 1];
        if (largestSize && 'size' in largestSize) {
            fileSize = largestSize.size || 0;
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
    return { contentType, filename, fileLocation, fileSize, inputLocation };
}
async function getMediaUrl(ctx, message) {
    if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
        ctx.logger.info(ctx.phoneNumber, 'messageId image:', message.id);
        const photo = message.photo;
        const sizes = photo?.sizes || [];
        const preferredSize = sizes.find((s) => s.type === 'm') ||
            sizes.find((s) => s.type === 'x') ||
            sizes[sizes.length - 1] ||
            sizes[0];
        return await ctx.client.downloadMedia(message, { thumb: preferredSize || sizes[0] });
    }
    else if (message.media instanceof telegram_1.Api.MessageMediaDocument &&
        (message.document?.mimeType?.startsWith('video') ||
            message.document?.mimeType?.startsWith('image'))) {
        ctx.logger.info(ctx.phoneNumber, 'messageId video:', message.id);
        const thumbs = message.document?.thumbs || [];
        const preferredThumb = thumbs.find((t) => t.type === 'm') ||
            thumbs[thumbs.length - 1] ||
            thumbs[0];
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
async function getThumbnail(ctx, messageId, chatId = 'me') {
    const message = await getMessageWithMedia(ctx, messageId, chatId);
    const thumbBuffer = await getThumbnailBuffer(ctx, message);
    if (!thumbBuffer) {
        throw new Error('Thumbnail not available for this media');
    }
    const etag = (0, helpers_1.generateETag)(messageId, chatId, `thumb-${messageId}`);
    return {
        buffer: thumbBuffer,
        etag,
        contentType: 'image/jpeg',
        filename: `thumbnail_${messageId}.jpg`,
    };
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
async function* streamMediaFile(ctx, fileLocation, offset = (0, big_integer_1.default)(0), limit = 5 * 1024 * 1024, requestSize = 512 * 1024) {
    for await (const chunk of ctx.client.iterDownload({
        file: fileLocation,
        offset,
        limit,
        requestSize,
    })) {
        yield chunk;
    }
}
async function getMediaMetadata(ctx, params) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    let { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
    const hasAll = types.includes('all');
    const typesToFetch = hasAll
        ? ['photo', 'video', 'document', 'voice']
        : types.filter(t => t !== 'all');
    const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);
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
    const ent = await (0, chat_operations_1.safeGetEntityById)(ctx, chatId);
    ctx.logger.info(ctx.phoneNumber, 'getMediaMetadata', params);
    let filteredMessages;
    if (typesToFetch.length === 1) {
        const messages = await ctx.client.getMessages(ent, {
            ...baseQuery,
            limit: queryLimit,
            filter: (0, helpers_1.getSearchFilter)(typesToFetch[0]),
        });
        filteredMessages = messages.map(message => (0, helpers_1.extractMediaMetaFromMessage)(message, chatId, typesToFetch[0]));
    }
    else if (typesToFetch.length > 1) {
        const resultsPerType = await Promise.all(typesToFetch.map(type => ctx.client.getMessages(ent, {
            ...baseQuery,
            limit,
            filter: (0, helpers_1.getSearchFilter)(type),
        }).then(msgs => msgs.map(m => (0, helpers_1.extractMediaMetaFromMessage)(m, chatId, type)))));
        if (hasAll) {
            filteredMessages = resultsPerType.flat();
        }
        else {
            filteredMessages = resultsPerType.flat().sort((a, b) => b.messageId - a.messageId).slice(0, limit);
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
    }
    else {
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
async function getAllMediaMetaData(ctx, params) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    let { chatId, types = ['all'], startDate, endDate, maxId, minId } = params;
    const hasAll = types.includes('all');
    const typesToFetch = hasAll
        ? ['photo', 'video', 'document', 'voice']
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
            filters: { chatId, types: ['all'], startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
        };
    }
    else {
        return {
            data: allMedia,
            pagination: { page: 1, limit: allMedia.length, total: allMedia.length, totalPages: 1, hasMore: false },
            filters: { chatId, types: typesToFetch, startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
        };
    }
}
async function getFilteredMedia(ctx, params) {
    if (!ctx.client)
        throw new Error('Client not initialized');
    let { chatId, types = ['photo', 'video', 'document'], startDate, endDate, limit = 50, maxId, minId } = params;
    const hasAll = types.includes('all');
    const typesToFetch = hasAll
        ? ['photo', 'video', 'document', 'voice']
        : types.filter(t => t !== 'all');
    const queryLimit = hasAll ? (limit || 50) * typesToFetch.length : (limit || 50);
    const query = {
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
    const ent = await (0, chat_operations_1.safeGetEntityById)(ctx, chatId);
    ctx.logger.info(ctx.phoneNumber, 'getFilteredMedia', params);
    const messages = await ctx.client.getMessages(ent, query);
    ctx.logger.info(ctx.phoneNumber, `Fetched ${messages.length} messages`);
    const filteredMessages = messages.filter(message => {
        if (!message.media)
            return false;
        const mediaType = (0, helpers_1.getMediaType)(message.media);
        return typesToFetch.includes(mediaType);
    });
    ctx.logger.info(ctx.phoneNumber, `Filtered down to ${filteredMessages.length} messages`);
    const mediaData = await (0, helpers_1.processWithConcurrencyLimit)(filteredMessages, async (message) => {
        const thumbBuffer = await getThumbnailBuffer(ctx, message);
        const mediaDetails = (0, helpers_1.getMediaDetails)(message.media);
        const baseMeta = (0, helpers_1.extractMediaMetaFromMessage)(message, chatId, (0, helpers_1.getMediaType)(message.media));
        return {
            ...baseMeta,
            type: (0, helpers_1.getMediaType)(message.media),
            thumbnail: thumbBuffer ? `data:image/jpeg;base64,${thumbBuffer.toString('base64')}` : undefined,
            mediaDetails: mediaDetails || undefined,
        };
    }, helpers_1.THUMBNAIL_CONCURRENCY_LIMIT, helpers_1.THUMBNAIL_BATCH_DELAY_MS);
    if (hasAll) {
        const grouped = mediaData.reduce((acc, item) => {
            if (!acc[item.type])
                acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {});
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
    }
    else {
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