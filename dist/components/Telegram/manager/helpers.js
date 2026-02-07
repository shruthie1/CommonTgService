"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.THUMBNAIL_BATCH_DELAY_MS = exports.THUMBNAIL_CONCURRENCY_LIMIT = exports.TEMP_FILE_CLEANUP_DELAY = exports.FILE_DOWNLOAD_TIMEOUT = exports.MAX_FILE_SIZE = void 0;
exports.getSearchFilter = getSearchFilter;
exports.getMediaType = getMediaType;
exports.getMessageDate = getMessageDate;
exports.extractMediaMetaFromMessage = extractMediaMetaFromMessage;
exports.getMediaDetails = getMediaDetails;
exports.detectContentType = detectContentType;
exports.generateETag = generateETag;
exports.downloadFileFromUrl = downloadFileFromUrl;
exports.downloadWithTimeout = downloadWithTimeout;
exports.processWithConcurrencyLimit = processWithConcurrencyLimit;
exports.getMimeType = getMimeType;
exports.getMediaExtension = getMediaExtension;
exports.getMediaAttributes = getMediaAttributes;
exports.getEntityId = getEntityId;
exports.generateCSV = generateCSV;
exports.generateVCard = generateVCard;
exports.createVCardContent = createVCardContent;
exports.toISODate = toISODate;
exports.bufferToBase64DataUrl = bufferToBase64DataUrl;
exports.resolveEntityToSenderInfo = resolveEntityToSenderInfo;
exports.extractMediaInfo = extractMediaInfo;
exports.getUserOnlineStatus = getUserOnlineStatus;
const telegram_1 = require("telegram");
const axios_1 = __importDefault(require("axios"));
exports.MAX_FILE_SIZE = 100 * 1024 * 1024;
exports.FILE_DOWNLOAD_TIMEOUT = 60000;
exports.TEMP_FILE_CLEANUP_DELAY = 3600000;
exports.THUMBNAIL_CONCURRENCY_LIMIT = 3;
exports.THUMBNAIL_BATCH_DELAY_MS = 100;
function getSearchFilter(filter) {
    switch (filter) {
        case 'photo': return new telegram_1.Api.InputMessagesFilterPhotos();
        case 'video': return new telegram_1.Api.InputMessagesFilterVideo();
        case 'document': return new telegram_1.Api.InputMessagesFilterDocument();
        case 'url': return new telegram_1.Api.InputMessagesFilterUrl();
        case 'roundVideo': return new telegram_1.Api.InputMessagesFilterRoundVideo();
        case 'photoVideo': return new telegram_1.Api.InputMessagesFilterPhotoVideo();
        case 'voice': return new telegram_1.Api.InputMessagesFilterVoice();
        case 'roundVoice': return new telegram_1.Api.InputMessagesFilterRoundVoice();
        case 'gif': return new telegram_1.Api.InputMessagesFilterGif();
        case 'sticker': return new telegram_1.Api.InputMessagesFilterDocument();
        case 'animation': return new telegram_1.Api.InputMessagesFilterDocument();
        case 'music': return new telegram_1.Api.InputMessagesFilterMusic();
        case 'chatPhoto': return new telegram_1.Api.InputMessagesFilterChatPhotos();
        case 'location': return new telegram_1.Api.InputMessagesFilterGeo();
        case 'contact': return new telegram_1.Api.InputMessagesFilterContacts();
        case 'phoneCalls': return new telegram_1.Api.InputMessagesFilterPhoneCalls({ missed: false });
        default: return new telegram_1.Api.InputMessagesFilterEmpty();
    }
}
function getMediaType(media) {
    if (media instanceof telegram_1.Api.MessageMediaPhoto) {
        return 'photo';
    }
    else if (media instanceof telegram_1.Api.MessageMediaDocument) {
        const document = media.document;
        if (document?.attributes?.some(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo)) {
            return 'video';
        }
        return 'document';
    }
    return 'document';
}
function getMessageDate(message) {
    const msgDate = message.date;
    if (msgDate) {
        if (typeof msgDate === 'number') {
            return msgDate;
        }
        else if (typeof msgDate === 'object' && msgDate !== null && 'getTime' in msgDate) {
            return Math.floor(msgDate.getTime() / 1000);
        }
    }
    return Math.floor(Date.now() / 1000);
}
function extractMediaMetaFromMessage(message, chatId, mediaType) {
    let fileSize;
    let mimeType;
    let filename;
    let width;
    let height;
    let duration;
    if (message.media instanceof telegram_1.Api.MessageMediaPhoto) {
        const photo = message.photo;
        mimeType = 'image/jpeg';
        filename = 'photo.jpg';
        if (photo?.sizes && photo.sizes.length > 0) {
            const largestSize = photo.sizes[photo.sizes.length - 1];
            if (largestSize && 'size' in largestSize)
                fileSize = largestSize.size;
            if (largestSize && 'w' in largestSize)
                width = largestSize.w;
            if (largestSize && 'h' in largestSize)
                height = largestSize.h;
        }
    }
    else if (message.media instanceof telegram_1.Api.MessageMediaDocument) {
        const doc = message.media.document;
        if (doc instanceof telegram_1.Api.Document) {
            fileSize = typeof doc.size === 'number' ? doc.size : (doc.size ? Number(doc.size.toString()) : undefined);
            mimeType = doc.mimeType;
            const fileNameAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
            filename = fileNameAttr?.fileName;
            const videoAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
            if (videoAttr) {
                width = videoAttr.w;
                height = videoAttr.h;
                duration = videoAttr.duration;
            }
            const audioAttr = doc.attributes?.find(attr => attr instanceof telegram_1.Api.DocumentAttributeAudio);
            if (audioAttr && !duration)
                duration = audioAttr.duration;
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
    };
}
function getMediaDetails(media) {
    if (!media?.document)
        return null;
    const doc = media.document;
    if (doc instanceof telegram_1.Api.DocumentEmpty)
        return null;
    const videoAttr = doc.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeVideo);
    const fileNameAttr = doc.attributes.find(attr => attr instanceof telegram_1.Api.DocumentAttributeFilename);
    return {
        size: doc.size,
        mimeType: doc.mimeType,
        fileName: fileNameAttr?.fileName || null,
        duration: videoAttr?.duration || null,
        width: videoAttr?.w || null,
        height: videoAttr?.h || null,
    };
}
function detectContentType(filename, mimeType) {
    if (mimeType)
        return mimeType;
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeMap = {
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
function generateETag(messageId, chatId, fileId) {
    const fileIdStr = typeof fileId === 'object' ? fileId.toString() : String(fileId);
    return `"${messageId}-${chatId}-${fileIdStr}"`;
}
async function downloadFileFromUrl(url, maxSize = exports.MAX_FILE_SIZE) {
    try {
        const headResponse = await axios_1.default.head(url, {
            timeout: exports.FILE_DOWNLOAD_TIMEOUT,
            validateStatus: (status) => status >= 200 && status < 400,
        });
        const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);
        if (contentLength > maxSize) {
            throw new Error(`File size ${contentLength} exceeds maximum ${maxSize} bytes`);
        }
        const response = await axios_1.default.get(url, {
            responseType: 'arraybuffer',
            timeout: exports.FILE_DOWNLOAD_TIMEOUT,
            maxContentLength: maxSize,
            validateStatus: (status) => status >= 200 && status < 300,
        });
        const buffer = Buffer.from(response.data);
        if (buffer.length > maxSize) {
            throw new Error(`Downloaded file size ${buffer.length} exceeds maximum ${maxSize} bytes`);
        }
        return buffer;
    }
    catch (error) {
        if (error.response) {
            throw new Error(`Failed to download file: HTTP ${error.response.status} - ${error.response.statusText}`);
        }
        else if (error.code === 'ECONNABORTED') {
            throw new Error(`Failed to download file: Request timeout after ${exports.FILE_DOWNLOAD_TIMEOUT}ms`);
        }
        else {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
}
async function downloadWithTimeout(promise, timeout) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Download timeout')), timeout)),
    ]);
}
async function processWithConcurrencyLimit(items, processor, concurrencyLimit = exports.THUMBNAIL_CONCURRENCY_LIMIT, batchDelay = exports.THUMBNAIL_BATCH_DELAY_MS) {
    const results = [];
    const errors = [];
    for (let i = 0; i < items.length; i += concurrencyLimit) {
        const batch = items.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.allSettled(batch.map(item => processor(item)));
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
            else {
                errors.push(result.reason);
            }
        }
        if (i + concurrencyLimit < items.length && batchDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }
    return results;
}
function getMimeType(type) {
    switch (type) {
        case 'photo': return 'image/jpeg';
        case 'video': return 'video/mp4';
        case 'document': return 'application/octet-stream';
        default: return 'application/octet-stream';
    }
}
function getMediaExtension(mediaOrType) {
    if (typeof mediaOrType === 'string') {
        switch (mediaOrType) {
            case 'photo': return 'jpg';
            case 'video': return 'mp4';
            default: return 'bin';
        }
    }
    const media = mediaOrType;
    if (!media)
        return 'bin';
    if (media instanceof telegram_1.Api.MessageMediaPhoto)
        return 'jpg';
    if (media instanceof telegram_1.Api.MessageMediaDocument) {
        const doc = media.document;
        if (!doc || !('mimeType' in doc))
            return 'bin';
        const mime = doc.mimeType;
        if (mime?.startsWith('video/'))
            return 'mp4';
        if (mime?.startsWith('image/'))
            return mime.split('/')[1];
        if (mime?.startsWith('audio/'))
            return 'ogg';
        return 'bin';
    }
    return 'bin';
}
function getMediaAttributes(item) {
    const attributes = [];
    if (item.fileName) {
        attributes.push(new telegram_1.Api.DocumentAttributeFilename({ fileName: item.fileName }));
    }
    if (item.type === 'video') {
        attributes.push(new telegram_1.Api.DocumentAttributeVideo({
            duration: 0,
            w: 1280,
            h: 720,
            supportsStreaming: true,
        }));
    }
    return attributes;
}
function getEntityId(entity) {
    if (entity instanceof telegram_1.Api.User)
        return entity.id.toString();
    if (entity instanceof telegram_1.Api.Channel)
        return entity.id.toString();
    if (entity instanceof telegram_1.Api.Chat)
        return entity.id.toString();
    return '';
}
function generateCSV(contacts) {
    const header = ['First Name', 'Last Name', 'Phone', 'Blocked'].join(',');
    const rows = contacts.map(contact => [
        contact.firstName,
        contact.lastName,
        contact.phone,
        contact.blocked,
    ].join(','));
    return [header, ...rows].join('\n');
}
function generateVCard(contacts) {
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
function createVCardContent(contacts) {
    let vCardContent = '';
    contacts.users.map((rawUser) => {
        const user = rawUser;
        vCardContent += 'BEGIN:VCARD\n';
        vCardContent += 'VERSION:3.0\n';
        vCardContent += `FN:${user.firstName || ''} ${user.lastName || ''}\n`;
        vCardContent += `TEL;TYPE=CELL:${user.phone}\n`;
        vCardContent += 'END:VCARD\n';
    });
    return vCardContent;
}
function toISODate(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}
function bufferToBase64DataUrl(buffer, mimeType = 'image/jpeg') {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
function resolveEntityToSenderInfo(entity, senderId, isSelf) {
    if (entity instanceof telegram_1.Api.User) {
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
    if (entity instanceof telegram_1.Api.Chat) {
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
    if (entity instanceof telegram_1.Api.Channel) {
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
function extractMediaInfo(message, thumbnailBuffer) {
    if (!message.media || message.media instanceof telegram_1.Api.MessageMediaEmpty) {
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
function getUserOnlineStatus(user) {
    const userStatus = user.status;
    if (!userStatus) {
        return { status: 'unknown', lastSeen: null };
    }
    if (userStatus instanceof telegram_1.Api.UserStatusOnline) {
        return { status: 'online', lastSeen: null };
    }
    if (userStatus instanceof telegram_1.Api.UserStatusOffline) {
        return {
            status: 'offline',
            lastSeen: userStatus.wasOnline ? toISODate(userStatus.wasOnline) : null,
        };
    }
    if (userStatus instanceof telegram_1.Api.UserStatusRecently) {
        return { status: 'recently', lastSeen: null };
    }
    if (userStatus instanceof telegram_1.Api.UserStatusLastWeek) {
        return { status: 'lastWeek', lastSeen: null };
    }
    if (userStatus instanceof telegram_1.Api.UserStatusLastMonth) {
        return { status: 'lastMonth', lastSeen: null };
    }
    return { status: 'unknown', lastSeen: null };
}
//# sourceMappingURL=helpers.js.map