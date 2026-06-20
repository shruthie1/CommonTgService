import { Api } from 'telegram';
import axios from 'axios';
import * as fs from 'fs';
import bigInt from 'big-integer';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn().mockResolvedValue(undefined),
}));

// No mock of ../chat-operations: the REAL safeGetEntityById runs, driven through the
// fake GramJS client (client.getEntity / client.iterDialogs).
jest.mock('axios');
jest.mock('fs');

import {
    getThumbnailBuffer, getMediaUrl, getMediaMessages, getThumbnail,
    getMediaFileDownloadInfo, streamMediaFile, getMediaMetadata,
    getAllMediaMetaData, getFilteredMedia, getFileUrl,
} from '../media-operations';

function makeLogger() {
    return { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}
function makeCtx(client: any) {
    return { client, phoneNumber: '9990003333', logger: makeLogger() } as any;
}

// ---- Fakes for Api objects ----

function photoSize(type: string, size = 1000): Api.PhotoSize {
    return Object.assign(Object.create(Api.PhotoSize.prototype), { type, size, w: 100, h: 100, bytes: undefined });
}
function strippedSize(): Api.PhotoStrippedSize {
    return Object.assign(Object.create(Api.PhotoStrippedSize.prototype), { type: 'i', bytes: Buffer.from([1, 2, 3]) });
}
function cachedSize(): Api.PhotoCachedSize {
    return Object.assign(Object.create(Api.PhotoCachedSize.prototype), { type: 'c', w: 10, h: 10, bytes: Buffer.from([9, 8, 7]) });
}
function progressiveSize(type = 'y', sizes = [100, 5000, 40000]): Api.PhotoSizeProgressive {
    return Object.assign(Object.create(Api.PhotoSizeProgressive.prototype), { type, w: 200, h: 200, sizes });
}
function makePhoto(sizes: any[]) {
    return Object.assign(Object.create(Api.Photo.prototype), {
        id: bigInt(123), accessHash: bigInt(456), fileReference: Buffer.from('ref'), dcId: 2, sizes,
    });
}
function makePhotoMessage(id: number, sizes: any[]) {
    const photo = makePhoto(sizes);
    const media = Object.assign(Object.create(Api.MessageMediaPhoto.prototype), { photo });
    // Api.Message.photo is a getter derived from media; only set media.
    const msg = Object.assign(Object.create(Api.Message.prototype), {
        id, message: '', date: 1700000000, media,
    });
    return msg;
}
function makeDocument(opts: { attributes?: any[]; mimeType?: string; size?: number; thumbs?: any[]; videoThumbs?: any[] } = {}) {
    return Object.assign(Object.create(Api.Document.prototype), {
        id: bigInt(7), accessHash: bigInt(8), fileReference: Buffer.from('r'), dcId: 1,
        attributes: opts.attributes ?? [], mimeType: opts.mimeType ?? 'application/pdf',
        size: opts.size ?? 100, thumbs: opts.thumbs ?? [], videoThumbs: opts.videoThumbs ?? [],
    });
}
function makeDocMessage(id: number, doc: any) {
    const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
    // Api.Message.document is a getter derived from media; only set media.
    const msg = Object.assign(Object.create(Api.Message.prototype), {
        id, message: '', date: 1700000000, media,
    });
    return msg;
}

describe('media-operations', () => {
    beforeEach(() => {
        (axios.get as jest.Mock).mockReset();
        (fs.createWriteStream as jest.Mock).mockReset();
        (fs.existsSync as jest.Mock).mockReset();
        (fs.unlinkSync as jest.Mock).mockReset();
    });

    describe('getThumbnailBuffer', () => {
        test('photo: downloads preferred size (low quality)', async () => {
            const msg = makePhotoMessage(1, [photoSize('m'), photoSize('x')]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('thumb'));
            const ctx = makeCtx({ downloadMedia });
            const buf = await getThumbnailBuffer(ctx, msg as any, 'low');
            expect(buf).toEqual(Buffer.from('thumb'));
        });
        test('photo: high quality preferred + download fail falls back to inline stripped', async () => {
            const msg = makePhotoMessage(1, [photoSize('x'), strippedSize()]);
            const downloadMedia = jest.fn().mockRejectedValue(new Error('dl'));
            const ctx = makeCtx({ downloadMedia });
            const buf = await getThumbnailBuffer(ctx, msg as any, 'high');
            expect(buf).not.toBeNull();
        });
        test('photo: empty sizes returns null', async () => {
            const msg = makePhotoMessage(1, []);
            const ctx = makeCtx({ downloadMedia: jest.fn() });
            const buf = await getThumbnailBuffer(ctx, msg as any);
            expect(buf).toBeNull();
        });
        test('document: non-Document returns null', async () => {
            const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), {
                document: Object.create(Api.DocumentEmpty.prototype),
            });
            const msg = Object.assign(Object.create(Api.Message.prototype), { id: 1, media });
            const ctx = makeCtx({ downloadMedia: jest.fn() });
            expect(await getThumbnailBuffer(ctx, msg as any)).toBeNull();
        });
        test('document: sticker with thumbs downloads', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp', size: 500, thumbs: [photoSize('m')],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('s'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('s'));
        });
        test('document: small sticker no thumbs downloads whole', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp', size: 100, thumbs: [],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('whole'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('whole'));
        });
        test('document: large non-renderable sticker returns null', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'application/x-tgsticker', size: 3 * 1024 * 1024, thumbs: [],
            });
            const msg = makeDocMessage(1, doc);
            const ctx = makeCtx({ downloadMedia: jest.fn() });
            expect(await getThumbnailBuffer(ctx, msg as any)).toBeNull();
        });
        test('document: small gif downloads whole', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeAnimated()], mimeType: 'video/mp4', size: 100,
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('gif'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('gif'));
        });
        test('document: video with thumbs downloads', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeVideo({ duration: 5, w: 10, h: 10 })],
                mimeType: 'video/mp4', size: 5000, thumbs: [photoSize('m')],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('vt'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any, 'high')).toEqual(Buffer.from('vt'));
        });
        test('document: thumb download fails, inline thumb fallback', async () => {
            const doc = makeDocument({ mimeType: 'application/pdf', size: 5000, thumbs: [photoSize('m'), strippedSize()] });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockRejectedValue(new Error('x'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).not.toBeNull();
        });
        test('document: videoThumbs path', async () => {
            const vThumb = Object.assign(Object.create(Api.VideoSize.prototype), { type: 'v', w: 1, h: 1, size: 1 });
            const doc = makeDocument({ mimeType: 'video/mp4', size: 5000, thumbs: [], videoThumbs: [vThumb] });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('vtb'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('vtb'));
        });
        test('no media returns null', async () => {
            const msg = Object.assign(Object.create(Api.Message.prototype), { id: 1, media: undefined });
            const ctx = makeCtx({ downloadMedia: jest.fn() });
            expect(await getThumbnailBuffer(ctx, msg as any)).toBeNull();
        });
        test('catch path logs warn', async () => {
            const msg = makePhotoMessage(1, [photoSize('m')]);
            const downloadMedia = jest.fn().mockImplementation(() => { throw new Error('sync'); });
            // make extractInlineThumbnail also fail by throwing in sizes access
            const ctx = makeCtx({ downloadMedia });
            // first download throws (caught inner), inline returns null -> returns null, no warn
            const buf = await getThumbnailBuffer(ctx, msg as any);
            expect(buf).toBeNull();
        });
        // Scenario: a photo whose only available size is a cached preview (no downloadable
        // server size) - we skip the network download entirely and serve the cached bytes
        // inline (covers findSize/lastDownloadableSize returning undefined + cached branch).
        test('photo: only cached size present -> no download, inline cached bytes returned', async () => {
            const msg = makePhotoMessage(1, [cachedSize()]);
            const downloadMedia = jest.fn();
            const ctx = makeCtx({ downloadMedia });
            const buf = await getThumbnailBuffer(ctx, msg as any);
            expect(downloadMedia).not.toHaveBeenCalled();
            expect(buf).toEqual(Buffer.from([9, 8, 7]));
        });
        // Scenario: a sticker whose CDN thumb download fails over the network falls back to
        // the embedded stripped preview so the gallery still shows something (lines 216-217).
        test('document: sticker thumb download fails, inline stripped fallback', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp', size: 500, thumbs: [photoSize('m'), strippedSize()],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockRejectedValue(new Error('flood'));
            const ctx = makeCtx({ downloadMedia });
            const buf = await getThumbnailBuffer(ctx, msg as any);
            expect(buf).not.toBeNull();
        });
        // Scenario: a medium-sized animated GIF (>2MB but <5MB) has no usable thumbnails or
        // video previews, so we download the whole clip as a last resort (lines 267-271).
        test('document: mid-size gif with no thumbs downloads whole clip as fallback', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeAnimated()],
                mimeType: 'video/mp4', size: 3 * 1024 * 1024, thumbs: [], videoThumbs: [],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('midgif'));
            const ctx = makeCtx({ downloadMedia });
            const buf = await getThumbnailBuffer(ctx, msg as any);
            expect(downloadMedia).toHaveBeenCalledTimes(1);
            expect(buf).toEqual(Buffer.from('midgif'));
        });
        // Scenario: a large GIF (>5MB) with no thumbs cannot be cheaply previewed, so all
        // fallbacks are exhausted and we return null (final fall-through, line 272/276).
        test('document: oversized gif with no thumbs returns null', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeAnimated()],
                mimeType: 'video/mp4', size: 6 * 1024 * 1024, thumbs: [], videoThumbs: [],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn();
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toBeNull();
            expect(downloadMedia).not.toHaveBeenCalled();
        });
        // Scenario: high-quality preview of a sticker prefers the largest server thumb
        // (x/y/m order) - exercises the quality==='high' ternary for sticker thumbs (204-206).
        test('document: high-quality sticker prefers large thumb', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp', size: 500, thumbs: [photoSize('x')],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('hi'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any, 'high')).toEqual(Buffer.from('hi'));
        });
        // Scenario: a video's CDN thumb download fails (flood-wait/network) and there is no
        // inline preview to fall back to, so we try the videoThumbs path next (246/250/255).
        test('document: video thumb download fails then videoThumbs succeeds', async () => {
            const vThumb = Object.assign(Object.create(Api.VideoSize.prototype), { type: 'v', w: 1, h: 1, size: 1 });
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeVideo({ duration: 5, w: 10, h: 10 })],
                mimeType: 'video/mp4', size: 5000, thumbs: [photoSize('m')], videoThumbs: [vThumb],
            });
            const msg = makeDocMessage(1, doc);
            let n = 0;
            const downloadMedia = jest.fn().mockImplementation(() => {
                n++;
                if (n === 1) return Promise.reject(new Error('FLOOD_WAIT_5'));
                return Promise.resolve(Buffer.from('fromvideo'));
            });
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('fromvideo'));
            expect(downloadMedia).toHaveBeenCalledTimes(2);
        });
        // Scenario: the videoThumb download also fails - with no other fallback for a
        // non-gif video the function returns null (255 catch + final fall-through).
        test('document: videoThumbs download failure returns null', async () => {
            const vThumb = Object.assign(Object.create(Api.VideoSize.prototype), { type: 'v', w: 1, h: 1, size: 1 });
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeVideo({ duration: 5, w: 10, h: 10 })],
                mimeType: 'video/mp4', size: 5000, thumbs: [], videoThumbs: [vThumb],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockRejectedValue(new Error('FLOOD_WAIT_30'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toBeNull();
        });
        // Scenario: high-quality thumbnail for a regular document selects the large thumb
        // and the download succeeds (238 high-quality ternary path).
        test('document: high-quality regular doc thumb download', async () => {
            const doc = makeDocument({ mimeType: 'application/pdf', size: 5000, thumbs: [photoSize('y')] });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('hq'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any, 'high')).toEqual(Buffer.from('hq'));
        });
        // Scenario: high quality photo download succeeds on first try (line 178 high branch
        // with findSize hit).
        test('photo: high quality finds x size and downloads', async () => {
            const msg = makePhotoMessage(1, [photoSize('x')]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('hx'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any, 'high')).toEqual(Buffer.from('hx'));
        });
        // Scenario: photo download returns an empty/null buffer so we fall back to the
        // embedded stripped preview (line 186 buf falsy branch).
        test('photo: download returns null buffer, falls back to inline', async () => {
            const msg = makePhotoMessage(1, [photoSize('m'), strippedSize()]);
            const downloadMedia = jest.fn().mockResolvedValue(null);
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).not.toBeNull();
        });
        // Scenario: photo has only an unusual-type ('a') downloadable size - none of the
        // preferred types match so we fall back to lastDownloadableSize (180 right branch).
        test('photo: no preferred type uses lastDownloadableSize fallback', async () => {
            const msg = makePhotoMessage(1, [photoSize('a')]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('last'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('last'));
            expect(await getThumbnailBuffer(ctx, msg as any, 'high')).toEqual(Buffer.from('last'));
        });
        // Scenario: a sticker with only an odd-type thumb falls back to lastDownloadableSize
        // for both quality modes (203-205 right branches).
        test('document: sticker thumb falls back to lastDownloadableSize', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp', size: 500, thumbs: [photoSize('a')],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('sf'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('sf'));
            expect(await getThumbnailBuffer(ctx, msg as any, 'high')).toEqual(Buffer.from('sf'));
        });
        // Scenario: a regular document thumb of odd type falls back to lastDownloadableSize
        // (243-244 right branches) for both qualities.
        test('document: regular thumb falls back to lastDownloadableSize', async () => {
            const doc = makeDocument({ mimeType: 'application/pdf', size: 5000, thumbs: [photoSize('a')] });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('df'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getThumbnailBuffer(ctx, msg as any)).toEqual(Buffer.from('df'));
            expect(await getThumbnailBuffer(ctx, msg as any, 'high')).toEqual(Buffer.from('df'));
        });
    });

    describe('getMediaUrl', () => {
        test('photo path downloads thumb', async () => {
            const msg = makePhotoMessage(1, [photoSize('m'), photoSize('x')]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('p'));
            const ctx = makeCtx({ downloadMedia });
            const r = await getMediaUrl(ctx, msg as any);
            expect(r).toEqual(Buffer.from('p'));
        });
        test('document video path downloads thumb', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeVideo({ duration: 1, w: 1, h: 1 })],
                mimeType: 'video/mp4', thumbs: [photoSize('m')],
            });
            const msg = makeDocMessage(1, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('v'));
            const ctx = makeCtx({ downloadMedia });
            const r = await getMediaUrl(ctx, msg as any);
            expect(r).toEqual(Buffer.from('v'));
        });
        test('returns null for unsupported media', async () => {
            const doc = makeDocument({ mimeType: 'application/zip', thumbs: [] });
            const msg = makeDocMessage(1, doc);
            const ctx = makeCtx({ downloadMedia: jest.fn() });
            expect(await getMediaUrl(ctx, msg as any)).toBeNull();
        });
    });

    describe('getMediaUrl additional branches', () => {
        // Scenario: photo where the only size is a non-downloadable stripped preview, so
        // findSize/lastDownloadableSize yield nothing and we fall back to sizes[0] (382/380/379).
        test('photo with only stripped size falls back to sizes[0]', async () => {
            const msg = makePhotoMessage(1, [strippedSize()]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('p0'));
            const ctx = makeCtx({ downloadMedia });
            const r = await getMediaUrl(ctx, msg as any);
            expect(r).toEqual(Buffer.from('p0'));
            // thumb arg should be the only (stripped) size since nothing was preferred
            expect(downloadMedia.mock.calls[0][1].thumb).toBe(msg.media.photo.sizes[0]);
        });
        // Scenario: an image document with no thumbs - preferredThumb undefined, falls back
        // to thumbs[0] (which is undefined) (lines 387/388/390 right-hand branches).
        test('image document with no thumbs falls back to thumbs[0]', async () => {
            const doc = makeDocument({ mimeType: 'image/png', thumbs: [] });
            const msg = makeDocMessage(2, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('img'));
            const ctx = makeCtx({ downloadMedia });
            const r = await getMediaUrl(ctx, msg as any);
            expect(r).toEqual(Buffer.from('img'));
            expect(downloadMedia.mock.calls[0][1].thumb).toBeUndefined();
        });
    });

    describe('getMediaUrl edge cases', () => {
        // Scenario: a stripped-only photo where the Photo wrapper is null (purged) - photo?.sizes
        // yields [] and thumb falls back to sizes[0]=undefined (384/385/387 right branches).
        test('photo with null photo object downloads with undefined thumb', async () => {
            const media = Object.assign(Object.create(Api.MessageMediaPhoto.prototype), { photo: undefined });
            const msg = Object.assign(Object.create(Api.Message.prototype), { id: 1, message: '', media });
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('np'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getMediaUrl(ctx, msg as any)).toEqual(Buffer.from('np'));
            expect(downloadMedia.mock.calls[0][1].thumb).toBeUndefined();
        });
        // Scenario: an image (not video) document is downloadable via the image mime branch
        // (covers the image side of the OR at 389-390).
        test('image document downloads thumb', async () => {
            const doc = makeDocument({ mimeType: 'image/jpeg', thumbs: [photoSize('m')] });
            const msg = makeDocMessage(2, doc);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('imgthumb'));
            const ctx = makeCtx({ downloadMedia });
            expect(await getMediaUrl(ctx, msg as any)).toEqual(Buffer.from('imgthumb'));
        });
    });

    describe('streamMediaFile minimal params', () => {
        // Scenario: caller streams with no explicit limit/fileSize/dcId (e.g. unknown size) -
        // those optional spreads must be omitted from the iterDownload call (462/464/465 false).
        test('omits optional limit/fileSize/dcId when not provided', async () => {
            const iterDownload = jest.fn(function* (_opts: any) { yield Buffer.from('x'); });
            const ctx = makeCtx({ iterDownload });
            const loc = new Api.InputDocumentFileLocation({ id: bigInt(1), accessHash: bigInt(2), fileReference: Buffer.from('x'), thumbSize: '' });
            const chunks: Buffer[] = [];
            for await (const c of streamMediaFile(ctx, loc)) chunks.push(c);
            const arg = iterDownload.mock.calls[0][0];
            expect(arg.limit).toBeUndefined();
            expect(arg.fileSize).toBeUndefined();
            expect(arg.dcId).toBeUndefined();
            expect(chunks).toHaveLength(1);
        });
    });

    describe('default argument paths', () => {
        // Scenario: callers rely on defaults - getThumbnail without chatId/quality, download
        // info without chatId, and the list endpoints without an explicit types array.
        test('getThumbnail uses default chatId="me" and quality="low"', async () => {
            const msg = makePhotoMessage(2001, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('d'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            const r = await getThumbnail(ctx, 2001);
            expect(r.filename).toContain('thumbnail_2001');
        });
        test('getMediaFileDownloadInfo uses default chatId="me"', async () => {
            const msg = makePhotoMessage(2002, [photoSize('w')]);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 2002);
            expect(info.contentType).toBe('image/jpeg');
        });
        test('getMediaMetadata uses default types', async () => {
            const getMessages = jest.fn().mockResolvedValue([]);
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'me', limit: 5 });
            expect(r.data).toBeDefined();
        });
        test('getFilteredMedia uses default types', async () => {
            const getMessages = jest.fn().mockResolvedValue([]);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'me', limit: 5 });
            expect(r.data).toBeDefined();
        });
        test('getAllMediaMetaData uses default types (all)', async () => {
            const getMessages = jest.fn().mockResolvedValue([]);
            const ctx = makeCtx({ getMessages });
            const r = await getAllMediaMetaData(ctx, { chatId: 'me' });
            expect(r.groups).toBeDefined();
        });
    });

    describe('getMediaMessages', () => {
        test('invokes Search', async () => {
            const invoke = jest.fn().mockResolvedValue({ messages: [] });
            const ctx = makeCtx({ invoke });
            await getMediaMessages(ctx);
            expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.Search);
        });
    });

    describe('getThumbnail', () => {
        test('returns thumbnail result for a photo message', async () => {
            const msg = makePhotoMessage(555, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('thumbdata'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            const r = await getThumbnail(ctx, 555, 'me', 'low');
            expect(r.contentType).toBe('image/jpeg');
            expect(r.filename).toContain('thumbnail_555');
        });
        test('throws when message has no media', async () => {
            const empty = Object.assign(Object.create(Api.Message.prototype), {
                id: 1, media: Object.create(Api.MessageMediaEmpty.prototype),
            });
            const getMessages = jest.fn().mockResolvedValue([empty]);
            const ctx = makeCtx({ getMessages });
            await expect(getThumbnail(ctx, 1, 'chat1')).rejects.toThrow('Media not found');
        });
        test('throws when thumbnail not available', async () => {
            const doc = makeDocument({ mimeType: 'application/zip', thumbs: [], videoThumbs: [] });
            const msg = makeDocMessage(99, doc);
            // Real safeGetEntityById resolves the chat via the client before fetching messages.
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.User.prototype));
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(null);
            const ctx = makeCtx({ getEntity, getMessages, downloadMedia });
            await expect(getThumbnail(ctx, 99, 'chat9')).rejects.toThrow('Thumbnail not available');
            expect(getEntity).toHaveBeenCalledWith('chat9');
        });
        test('caches result on second call', async () => {
            const msg = makePhotoMessage(777, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('c'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            await getThumbnail(ctx, 777, 'cacheChat', 'low');
            getMessages.mockClear();
            const r = await getThumbnail(ctx, 777, 'cacheChat', 'low');
            expect(getMessages).not.toHaveBeenCalled();
            expect(r).toBeDefined();
        });
        test('sticker contentType webp', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp', size: 100, thumbs: [],
            });
            const msg = makeDocMessage(888, doc);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('webp'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            const r = await getThumbnail(ctx, 888, 'stk');
            expect(r.contentType).toBe('image/webp');
        });
        // Scenario: an animated mp4 GIF preview is served with video content type so
        // the browser renders it as a looping video (lines 116-118 mp4 branch).
        test('animated mp4 gif thumbnail gets video/mp4 contentType and mp4 ext', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeAnimated()],
                mimeType: 'video/mp4', size: 100, thumbs: [],
            });
            const msg = makeDocMessage(1001, doc);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('gifbytes'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            const r = await getThumbnail(ctx, 1001, 'gifchat');
            expect(r.contentType).toBe('video/mp4');
            expect(r.filename).toBe('thumbnail_1001.mp4');
        });
        // Scenario: a true image/gif animation keeps the .gif extension (line 118 gif branch).
        test('image/gif animation thumbnail keeps gif contentType and ext', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeAnimated()],
                mimeType: 'image/gif', size: 100, thumbs: [],
            });
            const msg = makeDocMessage(1002, doc);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('reallgif'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            const r = await getThumbnail(ctx, 1002, 'gifchat2');
            expect(r.contentType).toBe('image/gif');
            expect(r.filename).toBe('thumbnail_1002.gif');
        });
        // Scenario: repeated requests for a media that has no extractable thumbnail are
        // served from the negative cache and short-circuit before re-fetching (line 420).
        test('second request for missing thumbnail hits negative cache and throws', async () => {
            const doc = makeDocument({ mimeType: 'application/zip', thumbs: [], videoThumbs: [] });
            const msg = makeDocMessage(1003, doc);
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.User.prototype));
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(null);
            const ctx = makeCtx({ getEntity, getMessages, downloadMedia });
            await expect(getThumbnail(ctx, 1003, 'misschat')).rejects.toThrow('Thumbnail not available');
            getMessages.mockClear();
            await expect(getThumbnail(ctx, 1003, 'misschat')).rejects.toThrow('Thumbnail not available');
            expect(getMessages).not.toHaveBeenCalled();
        });
    });

    describe('getMediaFileDownloadInfo', () => {
        test('photo download info', async () => {
            const msg = makePhotoMessage(1, [photoSize('w'), photoSize('y')]);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 1, 'me');
            expect(info.contentType).toBe('image/jpeg');
            expect(info.filename).toBe('photo.jpg');
            expect(info.etag).toBeDefined();
        });
        test('document download info', async () => {
            const doc = makeDocument({
                attributes: [new Api.DocumentAttributeFilename({ fileName: 'doc.pdf' })],
                mimeType: 'application/pdf', size: 2048,
            });
            const msg = makeDocMessage(2, doc);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 2, 'me');
            expect(info.filename).toBe('doc.pdf');
            expect(info.fileSize).toBe(2048);
        });
        test('throws for empty photo', async () => {
            const media = Object.assign(Object.create(Api.MessageMediaPhoto.prototype), {
                photo: Object.create(Api.PhotoEmpty.prototype),
            });
            const msg = Object.assign(Object.create(Api.Message.prototype), {
                id: 3, media,
            });
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            await expect(getMediaFileDownloadInfo(ctx, 3, 'me')).rejects.toThrow('Photo not found');
        });
        test('throws for unsupported media', async () => {
            const media = Object.assign(Object.create(Api.MessageMediaContact.prototype), {});
            const msg = Object.assign(Object.create(Api.Message.prototype), { id: 4, media });
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            await expect(getMediaFileDownloadInfo(ctx, 4, 'me')).rejects.toThrow('Unsupported media type');
        });
        // Scenario: a high-res photo whose largest size is a progressive JPEG - the reported
        // file size must come from the last entry of its progressive sizes array (337-339).
        test('photo with progressive largest size reports last progressive byte count', async () => {
            const msg = makePhotoMessage(5, [photoSize('m'), progressiveSize('y', [100, 5000, 40000])]);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 5, 'me');
            expect(info.fileSize).toBe(40000);
        });
        // Scenario: a message references a document that Telegram has since purged
        // (DocumentEmpty), so download info cannot be built (line 344).
        test('throws when document is empty/purged', async () => {
            const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), {
                document: Object.create(Api.DocumentEmpty.prototype),
            });
            const msg = Object.assign(Object.create(Api.Message.prototype), { id: 6, media });
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            await expect(getMediaFileDownloadInfo(ctx, 6, 'me')).rejects.toThrow('Document not found');
        });
        // Scenario: the media carries a document object of an unexpected subtype we don't
        // know how to build a file location for (line 347).
        test('throws for unsupported document format', async () => {
            const weirdDoc = Object.assign(Object.create(Api.WebDocument.prototype), {});
            const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: weirdDoc });
            const msg = Object.assign(Object.create(Api.Message.prototype), { id: 7, media });
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            await expect(getMediaFileDownloadInfo(ctx, 7, 'me')).rejects.toThrow('Document format not supported');
        });
        // Scenario: a document with no filename attribute and no mime type - filename falls
        // back to 'document.bin' and contentType is detected from it (361/362 right branches).
        test('document with no filename/mime falls back to defaults', async () => {
            const doc = makeDocument({ attributes: [], thumbs: [] });
            doc.mimeType = undefined;
            const msg = makeDocMessage(20, doc);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 20, 'me');
            expect(info.filename).toBe('document.bin');
            expect(info.contentType).toBeTruthy();
        });
        // Scenario: a document whose size is reported as a big-integer (large file) must be
        // coerced to a number (363 bigint branch).
        test('document with bigint size is coerced to number', async () => {
            const doc = makeDocument({ attributes: [new Api.DocumentAttributeFilename({ fileName: 'big.bin' })], mimeType: 'application/octet-stream' });
            doc.size = bigInt(5242880);
            const msg = makeDocMessage(21, doc);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 21, 'me');
            expect(info.fileSize).toBe(5242880);
        });
        // Scenario: a photo whose best size lacks the explicit byte count (progressive only)
        // yields a fileSize of 0 from the size branch but a valid thumbSize from 'w' (330/341).
        test('photo with w-size best size sets thumbSize', async () => {
            const wsize = Object.assign(Object.create(Api.PhotoSize.prototype), { type: 'w', w: 200, h: 200 });
            delete (wsize as any).size;
            const msg = makePhotoMessage(22, [wsize]);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 22, 'me');
            expect(info.contentType).toBe('image/jpeg');
        });
        // Scenario: entity resolution fails (e.g. peer lookup RPC error) but we gracefully
        // fall back to using the raw chatId so the lookup still proceeds (resolveEntity catch, 284).
        test('falls back to raw chatId when entity resolution throws', async () => {
            const msg = makePhotoMessage(8, [photoSize('w')]);
            // Real safeGetEntityById: direct getEntity fails, dialog scan finds nothing -> null,
            // so resolveEntity falls back to the raw chatId.
            const getEntity = jest.fn().mockRejectedValue(new Error('PEER_ID_INVALID'));
            const iterDialogs = async function* () { /* no dialogs */ };
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const ctx = makeCtx({ getEntity, iterDialogs, getMessages });
            const info = await getMediaFileDownloadInfo(ctx, 8, 'someChat');
            expect(info.contentType).toBe('image/jpeg');
            expect(getEntity).toHaveBeenCalledWith('someChat');
            // resolveEntity fell back to the raw chatId for the message lookup
            expect(getMessages).toHaveBeenCalledWith('someChat', expect.anything());
        });
    });

    describe('streamMediaFile', () => {
        test('yields chunks from iterDownload', async () => {
            const iterDownload = jest.fn(function* () {
                yield Buffer.from('a');
                yield Buffer.from('b');
            });
            const ctx = makeCtx({ iterDownload });
            const loc = new Api.InputDocumentFileLocation({ id: bigInt(1), accessHash: bigInt(2), fileReference: Buffer.from('x'), thumbSize: '' });
            const chunks: Buffer[] = [];
            for await (const c of streamMediaFile(ctx, loc, bigInt(0), 100, 512 * 1024, 1000, 2)) {
                chunks.push(c);
            }
            expect(chunks).toHaveLength(2);
        });
    });

    describe('getMediaMetadata', () => {
        test('throws when client missing', async () => {
            await expect(getMediaMetadata(makeCtx(null), { chatId: 'c' })).rejects.toThrow('Client not initialized');
        });
        test('single type returns data list', async () => {
            const photoMsg = makePhotoMessage(10, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'me', types: ['photo'], limit: 10 });
            expect(r.data).toBeDefined();
            expect(r.data!.length).toBe(1);
        });
        test('multiple types merged and sorted', async () => {
            const photoMsg = makePhotoMessage(20, [photoSize('m')]);
            const doc = makeDocument({ attributes: [new Api.DocumentAttributeVideo({ duration: 1, w: 1, h: 1 })], mimeType: 'video/mp4' });
            const videoMsg = makeDocMessage(30, doc);
            const getMessages = jest.fn(async (peer: any, opts: any) => {
                if (opts.filter instanceof Api.InputMessagesFilterPhotos) return [photoMsg];
                if (opts.filter instanceof Api.InputMessagesFilterVideo) return [videoMsg];
                return [];
            });
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: ['photo', 'video'], limit: 10 });
            expect(r.data!.length).toBe(2);
            expect(r.data![0].messageId).toBe(30);
        });

        test('multi-type hasMore is FALSE on the last page (exactly limit items, none beyond)', async () => {
            // Real scenario: 2 media items total (1 photo + 1 video), limit=2. After the slice,
            // filteredMessages.length === limit, which previously made hasMore always true and
            // sent the dashboard paginating forever. Raw fetch had exactly 2 (not > 2) => no more.
            const photoMsg = makePhotoMessage(20, [photoSize('m')]);
            const videoMsg = makeDocMessage(30, makeDocument({ attributes: [new Api.DocumentAttributeVideo({ duration: 1, w: 1, h: 1 })], mimeType: 'video/mp4' }));
            const getMessages = jest.fn(async (peer: any, opts: any) => {
                if (opts.filter instanceof Api.InputMessagesFilterPhotos) return [photoMsg];
                if (opts.filter instanceof Api.InputMessagesFilterVideo) return [videoMsg];
                return [];
            });
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: ['photo', 'video'], limit: 2 });
            expect(r.data!.length).toBe(2);
            expect(r.pagination.hasMore).toBe(false);
            expect(r.pagination.nextMaxId).toBeUndefined();
        });

        test('multi-type hasMore is TRUE when the raw fetch exceeds the page limit', async () => {
            const photos = [makePhotoMessage(20, [photoSize('m')]), makePhotoMessage(21, [photoSize('m')])];
            const videos = [makeDocMessage(30, makeDocument({ attributes: [new Api.DocumentAttributeVideo({ duration: 1, w: 1, h: 1 })], mimeType: 'video/mp4' }))];
            const getMessages = jest.fn(async (peer: any, opts: any) => {
                if (opts.filter instanceof Api.InputMessagesFilterPhotos) return photos;
                if (opts.filter instanceof Api.InputMessagesFilterVideo) return videos;
                return [];
            });
            const ctx = makeCtx({ getMessages });
            // 3 raw items, limit 2 -> there IS more.
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: ['photo', 'video'], limit: 2 });
            expect(r.data!.length).toBe(2);
            expect(r.pagination.hasMore).toBe(true);
        });
        test('all types returns groups, with post-filter for sticker', async () => {
            const sticker = makeDocMessage(40, makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp',
            }));
            const photoMsg = makePhotoMessage(41, [photoSize('m')]);
            const getMessages = jest.fn(async (peer: any, opts: any) => {
                if (opts.filter instanceof Api.InputMessagesFilterPhotos) return [photoMsg];
                if (opts.filter instanceof Api.InputMessagesFilterDocument) return [sticker];
                return [];
            });
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.User.prototype));
            const ctx = makeCtx({ getMessages, getEntity });
            const r = await getMediaMetadata(ctx, { chatId: '123', types: ['all'], limit: 5 });
            expect(r.groups).toBeDefined();
            const stickerGroup = r.groups!.find(g => g.type === 'sticker');
            expect(stickerGroup!.count).toBeGreaterThanOrEqual(1);
        });
        test('empty typesToFetch returns empty data', async () => {
            const ctx = makeCtx({ getMessages: jest.fn() });
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: [], limit: 5 });
            expect(r.data).toEqual([]);
        });
        // Scenario: client narrows a gallery query by a valid date window plus pagination
        // cursors - the date filters and maxId/minId must be forwarded to Telegram
        // (covers the truthy + instanceof Date + !isNaN branches at 483/486 and maxId/minId).
        test('forwards valid startDate/endDate window and maxId/minId to query', async () => {
            const photoMsg = makePhotoMessage(50, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const ctx = makeCtx({ getMessages });
            await getMediaMetadata(ctx, {
                chatId: 'me', types: ['photo'], limit: 5,
                startDate: new Date('2024-01-01T00:00:00Z'),
                endDate: new Date('2024-02-01T00:00:00Z'),
                maxId: 999, minId: 10,
            });
            const opts = getMessages.mock.calls[0][1];
            expect(opts.minDate).toBeGreaterThan(0);
            expect(opts.maxDate).toBeGreaterThan(0);
            expect(opts.maxId).toBe(999);
            expect(opts.minId).toBe(10);
        });
        // Scenario: a caller passes an unparseable date (upstream new Date('garbage') yields
        // an Invalid Date object). The query must ignore it AND the response builder must not
        // crash on it. Regression test for the safeIsoString fix (date guards 483/486 false
        // branch + filters echo not throwing RangeError).
        test('ignores invalid (NaN) dates and does not crash response builder', async () => {
            const photoMsg = makePhotoMessage(51, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, {
                chatId: 'me', types: ['photo'], limit: 5,
                startDate: new Date('not-a-date'),
                endDate: new Date('also-bad'),
            });
            const opts = getMessages.mock.calls[0][1];
            expect(opts.minDate).toBeUndefined();
            expect(opts.maxDate).toBeUndefined();
            // Invalid dates must surface as undefined in the echoed filters, never throw.
            expect(r.filters.startDate).toBeUndefined();
            expect(r.filters.endDate).toBeUndefined();
        });
        // Scenario: a full page of results signals there may be more - hasMore is true and a
        // nextMaxId cursor (and prevMaxId from the incoming maxId) is returned (584/602/612).
        test('full page yields hasMore with next and prev cursors', async () => {
            const msgs = Array.from({ length: 5 }, (_, i) => makePhotoMessage(100 - i, [photoSize('m')]));
            const getMessages = jest.fn().mockResolvedValue(msgs);
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'me', types: ['photo'], limit: 5, maxId: 200 });
            expect(r.pagination.hasMore).toBe(true);
            expect(r.pagination.nextMaxId).toBe(96);
            expect(r.pagination.prevMaxId).toBe(100);
        });
        // Scenario: 'all' query returns grouped media with a populated photo group and proper
        // per-type pagination cursors (group cond-exprs at 574/576/585/586/591/593/594).
        test('all-types grouping populates cursors for non-empty groups', async () => {
            const photos = Array.from({ length: 5 }, (_, i) => makePhotoMessage(70 - i, [photoSize('m')]));
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterPhotos ? photos : []);
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: ['all'], limit: 5, maxId: 80 });
            const photoGroup = r.groups!.find(g => g.type === 'photo')!;
            expect(photoGroup.count).toBe(5);
            expect(photoGroup.pagination.firstMessageId).toBe(70);
            expect(photoGroup.pagination.lastMessageId).toBe(66);
        });
        // Scenario: an 'all' query where one media type has far more items than the per-type
        // limit AND the overall haul exceeds the query cap - both per-type and overall
        // hasMore flags flip true with next-page cursors (L579/581/589/596/598 true branches).
        test('all-types with overflow sets per-type and overall hasMore', async () => {
            const photos = Array.from({ length: 50 }, (_, i) => makePhotoMessage(2000 - i, [photoSize('m')]));
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterPhotos ? photos : []);
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: ['all'], limit: 5 });
            const photoGroup = r.groups!.find(g => g.type === 'photo')!;
            expect(photoGroup.pagination.hasMore).toBe(true);
            expect(photoGroup.pagination.nextMaxId).toBeDefined();
            expect(r.pagination.hasMore).toBe(true);
            expect(r.pagination.nextMaxId).toBeDefined();
        });
        // Scenario: a sticker search must paginate across batches (post-filter loop) advancing
        // currentMaxId until enough stickers are collected (covers 520/525-532 loop branches).
        test('sticker post-filter paginates across multiple batches', async () => {
            const sticker = (id: number) => makeDocMessage(id, makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp',
            }));
            // Non-sticker doc so first batch contains a mix and a defined currentMaxId.
            const plainDoc = (id: number) => makeDocMessage(id, makeDocument({
                attributes: [new Api.DocumentAttributeFilename({ fileName: 'f.pdf' })], mimeType: 'application/pdf',
            }));
            let call = 0;
            const batchA = [sticker(500), plainDoc(499)].concat(Array.from({ length: 98 }, (_, i) => plainDoc(498 - i)));
            const batchB = [sticker(400)];
            const getMessages = jest.fn(async (_peer: any, _opts: any) => { call++; return call === 1 ? batchA : batchB; });
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: ['sticker'], limit: 3 });
            expect(getMessages.mock.calls.length).toBeGreaterThanOrEqual(2);
            // second batch should pass a maxId cursor derived from the last message of batch A
            expect(getMessages.mock.calls[1][1].maxId).toBe(batchA[batchA.length - 1].id);
            expect(r.data!.length).toBeGreaterThanOrEqual(2);
        });
        // Scenario: a single sticker batch contains more stickers than requested plus a
        // media-less service message - the inner collector stops at the limit (L533 break)
        // and tolerates the no-media entry (L530 false branch).
        test('sticker post-filter stops at limit within one batch and skips media-less msg', async () => {
            const sticker = (id: number) => makeDocMessage(id, makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp',
            }));
            const noMedia = Object.assign(Object.create(Api.Message.prototype), { id: 999, message: 'hi', date: 1, media: undefined });
            const batch = [noMedia, sticker(50), sticker(49), sticker(48), sticker(47), sticker(46)];
            const getMessages = jest.fn(async (_peer: any, _opts: any) => batch);
            const ctx = makeCtx({ getMessages });
            const r = await getMediaMetadata(ctx, { chatId: 'c', types: ['sticker'], limit: 3 });
            expect(r.data!.length).toBe(3);
        });
    });

    describe('getAllMediaMetaData', () => {
        test('paginates until no more (single type)', async () => {
            let call = 0;
            const photoMsgs = (start: number) => Array.from({ length: 200 }, (_, i) => makePhotoMessage(start - i, [photoSize('m')]));
            const getMessages = jest.fn(async () => {
                call++;
                if (call === 1) return photoMsgs(400);
                return [];
            });
            const ctx = makeCtx({ getMessages });
            const r = await getAllMediaMetaData(ctx, { chatId: 'c', types: ['photo'] });
            expect(r.data).toBeDefined();
            expect(r.data!.length).toBe(200);
        });
        test('all types returns grouped', async () => {
            const photoMsg = makePhotoMessage(1, [photoSize('m')]);
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterPhotos ? [photoMsg] : []);
            const ctx = makeCtx({ getMessages });
            const r = await getAllMediaMetaData(ctx, { chatId: 'c', types: ['all'] });
            expect(r.groups).toBeDefined();
        });
        test('throws when client missing', async () => {
            await expect(getAllMediaMetaData(makeCtx(null), { chatId: 'c' })).rejects.toThrow('Client not initialized');
        });
        // Scenario: an 'all'-types backfill collects a full page of photos and flattens the
        // grouped response items into the accumulator (groups-concat branch 643).
        test('all types backfill flattens grouped items', async () => {
            const page = Array.from({ length: 200 }, (_, i) => makePhotoMessage(1000 - i, [photoSize('m')]));
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterPhotos ? page : []);
            const ctx = makeCtx({ getMessages });
            const r = await getAllMediaMetaData(ctx, { chatId: 'c', types: ['all'] });
            const photoGroup = r.groups!.find(g => g.type === 'photo')!;
            expect(photoGroup.count).toBe(200);
        });
    });

    describe('getFilteredMedia', () => {
        test('throws when client missing', async () => {
            await expect(getFilteredMedia(makeCtx(null), { chatId: 'c' })).rejects.toThrow('Client not initialized');
        });
        test('single type with url thumbnails', async () => {
            const photoMsg = makePhotoMessage(10, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'me', types: ['photo'], limit: 10, thumbnailMode: 'url' });
            expect(r.data!.length).toBe(1);
            expect(r.data![0].thumbnailUrl).toContain('/telegram/media/thumbnail/');
        });
        test('base64 thumbnail mode', async () => {
            const photoMsg = makePhotoMessage(11, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('thumbb'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            const r = await getFilteredMedia(ctx, {
                chatId: 'me', types: ['photo'], limit: 5, thumbnailMode: 'base64', inlineThumbnailLimit: 5,
            });
            expect(r.data![0].thumbnail).toContain('data:');
        });
        test('none thumbnail mode', async () => {
            const photoMsg = makePhotoMessage(12, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'me', types: ['photo'], thumbnailMode: 'none' });
            expect(r.data![0].thumbnailUrl).toBeUndefined();
        });
        test('all types returns groups', async () => {
            const photoMsg = makePhotoMessage(20, [photoSize('m')]);
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterPhotos ? [photoMsg] : []);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: ['all'], limit: 5 });
            expect(r.groups).toBeDefined();
        });
        test('multiple types merged', async () => {
            const photoMsg = makePhotoMessage(20, [photoSize('m')]);
            const videoMsg = makeDocMessage(30, makeDocument({
                attributes: [new Api.DocumentAttributeVideo({ duration: 1, w: 1, h: 1 })], mimeType: 'video/mp4',
            }));
            const getMessages = jest.fn(async (peer: any, opts: any) => {
                if (opts.filter instanceof Api.InputMessagesFilterPhotos) return [photoMsg];
                if (opts.filter instanceof Api.InputMessagesFilterVideo) return [videoMsg];
                return [];
            });
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: ['photo', 'video'], limit: 10 });
            expect(r.data!.length).toBe(2);
        });
        test('sticker post-filter path', async () => {
            const sticker = makeDocMessage(40, makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp',
            }));
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterDocument ? [sticker] : []);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: ['sticker'], limit: 5 });
            expect(r.data!.length).toBe(1);
        });
        test('empty types returns empty', async () => {
            const ctx = makeCtx({ getMessages: jest.fn() });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: [], limit: 5 });
            expect(r.data).toEqual([]);
        });
        // Scenario: filtered gallery narrowed by a valid date window plus pagination cursors
        // (date guard truthy branches at 705/708, maxId/minId forwarding).
        test('forwards valid dates and cursors', async () => {
            const photoMsg = makePhotoMessage(60, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const ctx = makeCtx({ getMessages });
            await getFilteredMedia(ctx, {
                chatId: 'me', types: ['photo'], limit: 5,
                startDate: new Date('2024-03-01T00:00:00Z'),
                endDate: new Date('2024-04-01T00:00:00Z'),
                maxId: 500, minId: 5, thumbnailMode: 'url',
            });
            const opts = getMessages.mock.calls[0][1];
            expect(opts.minDate).toBeGreaterThan(0);
            expect(opts.maxDate).toBeGreaterThan(0);
            expect(opts.maxId).toBe(500);
            expect(opts.minId).toBe(5);
        });
        // Scenario: a full page of filtered photos signals hasMore with next/prev cursors
        // (839/855/863-865 truthy branches).
        test('full page sets hasMore with cursors', async () => {
            const msgs = Array.from({ length: 5 }, (_, i) => makePhotoMessage(300 - i, [photoSize('m')]));
            const getMessages = jest.fn().mockResolvedValue(msgs);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'me', types: ['photo'], limit: 5, maxId: 400, thumbnailMode: 'url' });
            expect(r.pagination.hasMore).toBe(true);
            expect(r.pagination.nextMaxId).toBe(296);
            expect(r.pagination.prevMaxId).toBe(300);
        });
        // Scenario: all-types filtered query returns grouped media with populated photo group
        // and full per-group + overall pagination cursors (831/832/840/841/846-848).
        test('all-types grouping returns populated cursors', async () => {
            const photos = Array.from({ length: 5 }, (_, i) => makePhotoMessage(90 - i, [photoSize('m')]));
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterPhotos ? photos : []);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: ['all'], limit: 5, maxId: 100, thumbnailMode: 'url' });
            const photoGroup = r.groups!.find(g => g.type === 'photo')!;
            expect(photoGroup.pagination.firstMessageId).toBe(90);
            expect(photoGroup.pagination.lastMessageId).toBe(86);
            expect(r.pagination.prevMaxId).toBe(90);
        });
        // Scenario: filtered 'all' query where the photo type overflows the per-type limit and
        // the overall haul exceeds the query cap - per-type & overall hasMore flip true with
        // cursors (L836/837/844/845/846/851/852 true branches).
        test('all-types overflow sets per-type and overall hasMore (filtered)', async () => {
            const photos = Array.from({ length: 50 }, (_, i) => makePhotoMessage(3000 - i, [photoSize('m')]));
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts.filter instanceof Api.InputMessagesFilterPhotos ? photos : []);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: ['all'], limit: 5, thumbnailMode: 'url' });
            const photoGroup = r.groups!.find(g => g.type === 'photo')!;
            expect(photoGroup.pagination.hasMore).toBe(true);
            expect(photoGroup.pagination.nextMaxId).toBeDefined();
            expect(r.pagination.hasMore).toBe(true);
            expect(r.pagination.nextMaxId).toBeDefined();
        });
        // Scenario: sticker post-filter pagination across batches in the filtered (full
        // message) variant, advancing currentMaxId between batches (740/745-754).
        test('sticker post-filter paginates across batches (filtered)', async () => {
            const sticker = (id: number) => makeDocMessage(id, makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp',
            }));
            const plainDoc = (id: number) => makeDocMessage(id, makeDocument({
                attributes: [new Api.DocumentAttributeFilename({ fileName: 'f.pdf' })], mimeType: 'application/pdf',
            }));
            let call = 0;
            const batchA = [sticker(600), plainDoc(599)].concat(Array.from({ length: 98 }, (_, i) => plainDoc(598 - i)));
            const batchB = [sticker(500)];
            const getMessages = jest.fn(async (_peer: any, _opts: any) => { call++; return call === 1 ? batchA : batchB; });
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: ['sticker'], limit: 3, thumbnailMode: 'url' });
            expect(getMessages.mock.calls.length).toBeGreaterThanOrEqual(2);
            expect(getMessages.mock.calls[1][1].maxId).toBe(batchA[batchA.length - 1].id);
            expect(r.data!.length).toBeGreaterThanOrEqual(2);
        });
        // Scenario: filtered sticker batch with more stickers than requested plus a non-Message
        // entry - collector skips the non-message (L730 true) and breaks at the limit (L750).
        test('filtered sticker post-filter skips non-message and breaks at limit', async () => {
            const sticker = (id: number) => makeDocMessage(id, makeDocument({
                attributes: [new Api.DocumentAttributeSticker({ alt: '', stickerset: new Api.InputStickerSetEmpty() })],
                mimeType: 'image/webp',
            }));
            const notAMessage = Object.assign(Object.create(Api.MessageService.prototype), { id: 700, media: undefined });
            const batch = [notAMessage, sticker(60), sticker(59), sticker(58), sticker(57)];
            const getMessages = jest.fn(async (_peer: any, _opts: any) => batch);
            const ctx = makeCtx({ getMessages });
            const r = await getFilteredMedia(ctx, { chatId: 'c', types: ['sticker'], limit: 2, thumbnailMode: 'url' });
            expect(r.data!.length).toBe(2);
        });
        // Scenario: base64 mode requested twice for the same media - the second pass serves
        // the thumbnail straight from the in-memory cache without re-downloading (cached
        // return at getThumbnailResultFromMessage line 98).
        test('base64 mode reuses cached thumbnail on repeat', async () => {
            const photoMsg = makePhotoMessage(1414, [photoSize('m')]);
            const getMessages = jest.fn().mockResolvedValue([photoMsg]);
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('cachedthumb'));
            const ctx = makeCtx({ getMessages, downloadMedia });
            const params = { chatId: 'cacheFiltered', types: ['photo'], limit: 5, thumbnailMode: 'base64' as const, inlineThumbnailLimit: 5 };
            await getFilteredMedia(ctx, params);
            downloadMedia.mockClear();
            const r2 = await getFilteredMedia(ctx, params);
            expect(downloadMedia).not.toHaveBeenCalled();
            expect(r2.data![0].thumbnail).toContain('data:');
        });
        // Scenario: base64 thumbnail mode where the inline thumbnail cannot be produced
        // (download returns null and no inline preview) so the item falls back to the URL
        // string instead of a data: URI (line 789 false branch).
        test('base64 mode falls back to url when no thumbnail buffer', async () => {
            const doc = makeDocument({ mimeType: 'application/pdf', size: 5000, thumbs: [photoSize('m')], videoThumbs: [] });
            const msg = makeDocMessage(13, doc);
            const getMessages = jest.fn().mockResolvedValue([msg]);
            const downloadMedia = jest.fn().mockResolvedValue(null);
            const ctx = makeCtx({ getMessages, downloadMedia });
            const r = await getFilteredMedia(ctx, {
                chatId: 'me', types: ['document'], limit: 5, thumbnailMode: 'base64', inlineThumbnailLimit: 5,
            });
            expect(r.data![0].thumbnail).toContain('/telegram/media/thumbnail/');
            expect(r.data![0].thumbnail).not.toContain('data:');
        });
    });

    describe('getFileUrl', () => {
        test('downloads to file and returns path', async () => {
            const stream = { pipe: jest.fn(), on: jest.fn() };
            (axios.get as jest.Mock).mockResolvedValue({ data: stream });
            const writer: any = { on: jest.fn((event, cb) => { if (event === 'finish') setImmediate(cb); }) };
            (fs.createWriteStream as jest.Mock).mockReturnValue(writer);
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            const ctx = makeCtx({});
            const r = await getFileUrl(ctx, 'http://x/file', 'name');
            expect(r).toContain('/tmp/name');
        });
        test('throws with HTTP status on response error', async () => {
            (axios.get as jest.Mock).mockRejectedValue({ response: { status: 404 } });
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            const ctx = makeCtx({});
            await expect(getFileUrl(ctx, 'http://x', 'n')).rejects.toThrow('HTTP 404');
        });
        test('throws timeout on ECONNABORTED', async () => {
            (axios.get as jest.Mock).mockRejectedValue({ code: 'ECONNABORTED' });
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            const ctx = makeCtx({});
            await expect(getFileUrl(ctx, 'http://x', 'n')).rejects.toThrow('Request timeout');
        });
        test('throws generic message', async () => {
            (axios.get as jest.Mock).mockRejectedValue({ message: 'oops' });
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            const ctx = makeCtx({});
            await expect(getFileUrl(ctx, 'http://x', 'n')).rejects.toThrow('oops');
        });
        // Scenario: validate the HTTP status policy passed to axios - only 2xx responses are
        // accepted as successful downloads (validateStatus predicate, line 882).
        test('validateStatus accepts only 2xx responses', async () => {
            const stream = { pipe: jest.fn(), on: jest.fn() };
            (axios.get as jest.Mock).mockResolvedValue({ data: stream });
            const writer: any = { on: jest.fn((event, cb) => { if (event === 'finish') setImmediate(cb); }) };
            (fs.createWriteStream as jest.Mock).mockReturnValue(writer);
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            const ctx = makeCtx({});
            await getFileUrl(ctx, 'http://x/file', 'name');
            const config = (axios.get as jest.Mock).mock.calls[0][1];
            expect(config.validateStatus(200)).toBe(true);
            expect(config.validateStatus(299)).toBe(true);
            expect(config.validateStatus(404)).toBe(false);
            expect(config.validateStatus(500)).toBe(false);
        });
        // Scenario: after the download completes the temp file is cleaned up on a delayed
        // timer; verify the existing-file deletion branch actually runs (lines 894-897).
        test('delayed cleanup removes the temp file when it still exists', async () => {
            jest.useFakeTimers();
            try {
                const stream = { pipe: jest.fn(), on: jest.fn() };
                (axios.get as jest.Mock).mockResolvedValue({ data: stream });
                const writer: any = { on: jest.fn((event, cb) => { if (event === 'finish') cb(); }) };
                (fs.createWriteStream as jest.Mock).mockReturnValue(writer);
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);
                const ctx = makeCtx({});
                const filePath = await getFileUrl(ctx, 'http://x/file', 'cleanup');
                jest.runOnlyPendingTimers();
                expect(fs.unlinkSync).toHaveBeenCalledWith(filePath);
                expect(ctx.logger.debug).toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });
        // Scenario: by the time the delayed cleanup fires the temp file is already gone
        // (existsSync false) so no unlink is attempted (line 900 false branch).
        test('delayed cleanup is a no-op when temp file already gone', async () => {
            jest.useFakeTimers();
            try {
                const stream = { pipe: jest.fn(), on: jest.fn() };
                (axios.get as jest.Mock).mockResolvedValue({ data: stream });
                const writer: any = { on: jest.fn((event, cb) => { if (event === 'finish') cb(); }) };
                (fs.createWriteStream as jest.Mock).mockReturnValue(writer);
                (fs.existsSync as jest.Mock).mockReturnValue(false);
                const ctx = makeCtx({});
                await getFileUrl(ctx, 'http://x/file', 'gone');
                jest.runOnlyPendingTimers();
                expect(fs.unlinkSync).not.toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });
        // Scenario: the delayed cleanup itself errors (e.g. unlink fails) - the failure must
        // be swallowed and only logged as a warning (cleanup catch, lines 899-900).
        test('delayed cleanup swallows unlink errors and warns', async () => {
            jest.useFakeTimers();
            try {
                const stream = { pipe: jest.fn(), on: jest.fn() };
                (axios.get as jest.Mock).mockResolvedValue({ data: stream });
                const writer: any = { on: jest.fn((event, cb) => { if (event === 'finish') cb(); }) };
                (fs.createWriteStream as jest.Mock).mockReturnValue(writer);
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.unlinkSync as jest.Mock).mockImplementation(() => { throw new Error('EBUSY'); });
                const ctx = makeCtx({});
                await getFileUrl(ctx, 'http://x/file', 'cleanupfail');
                expect(() => jest.runOnlyPendingTimers()).not.toThrow();
                expect(ctx.logger.warn).toHaveBeenCalled();
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
