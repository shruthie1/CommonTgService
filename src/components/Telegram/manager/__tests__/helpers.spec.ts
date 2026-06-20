import { Api } from 'telegram';
import bigInt from 'big-integer';
import axios from 'axios';
import {
    ByteLimitedLruCache,
    getSearchFilter,
    getMediaType,
    getMessageDate,
    extractMediaMetaFromMessage,
    getMediaDetails,
    detectContentType,
    generateETag,
    downloadFileFromUrl,
    downloadWithTimeout,
    processWithConcurrencyLimit,
    getMimeType,
    getMediaExtension,
    getMediaAttributes,
    getEntityId,
    generateCSV,
    generateVCard,
    createVCardContent,
    toISODate,
    toTimeString,
    bufferToBase64DataUrl,
    resolveEntityToSenderInfo,
    extractMediaInfo,
    getUserOnlineStatus,
    MAX_FILE_SIZE,
} from '../helpers';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ---- helpers to build Api proto instances ----
function makePhoto(sizes: any[] = []) {
    return Object.assign(Object.create(Api.Photo.prototype), { sizes });
}
function makeDocument(props: Record<string, unknown>) {
    return Object.assign(Object.create(Api.Document.prototype), props);
}
function makeUser(props: Record<string, unknown>) {
    return Object.assign(Object.create(Api.User.prototype), props);
}

describe('ByteLimitedLruCache', () => {
    afterEach(() => jest.restoreAllMocks());

    test('get returns undefined for missing key', () => {
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 5, maxBytes: 1000, ttlMs: 1000 });
        expect(cache.get('nope')).toBeUndefined();
    });

    test('set/get round-trips and updates recency', () => {
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 5, maxBytes: 1000, ttlMs: 10000 });
        cache.set('a', 'A', 10);
        cache.set('b', 'B', 10);
        expect(cache.get('a')).toBe('A');
        const stats = cache.stats();
        expect(stats.entries).toBe(2);
        expect(stats.totalBytes).toBe(20);
        expect(stats.maxBytes).toBe(1000);
    });

    test('expired entries are evicted on get', () => {
        const now = 1_000_000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 5, maxBytes: 1000, ttlMs: 100 });
        cache.set('a', 'A', 10);
        jest.spyOn(Date, 'now').mockReturnValue(now + 200);
        expect(cache.get('a')).toBeUndefined();
    });

    test('rejects entries larger than maxBytes', () => {
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 5, maxBytes: 100, ttlMs: 1000 });
        cache.set('big', 'X', 200);
        expect(cache.get('big')).toBeUndefined();
        expect(cache.stats().entries).toBe(0);
    });

    test('coerces non-positive size to 1', () => {
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 5, maxBytes: 100, ttlMs: 1000 });
        cache.set('a', 'A', 0);
        expect(cache.stats().totalBytes).toBe(1);
    });

    test('evicts oldest when over maxEntries', () => {
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 2, maxBytes: 1000, ttlMs: 10000 });
        cache.set('a', 'A', 10);
        cache.set('b', 'B', 10);
        cache.set('c', 'C', 10);
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe('B');
        expect(cache.get('c')).toBe('C');
    });

    test('evicts oldest when over maxBytes', () => {
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 10, maxBytes: 25, ttlMs: 10000 });
        cache.set('a', 'A', 10);
        cache.set('b', 'B', 10);
        cache.set('c', 'C', 10); // total would be 30 > 25, evict oldest
        expect(cache.get('a')).toBeUndefined();
        expect(cache.stats().totalBytes).toBeLessThanOrEqual(25);
    });

    test('delete is a no-op for missing key', () => {
        const cache = new ByteLimitedLruCache<string>({ maxEntries: 5, maxBytes: 100, ttlMs: 1000 });
        cache.delete('ghost');
        expect(cache.stats().entries).toBe(0);
    });
});

describe('getSearchFilter', () => {
    test.each([
        ['photo', Api.InputMessagesFilterPhotos],
        ['video', Api.InputMessagesFilterVideo],
        ['document', Api.InputMessagesFilterDocument],
        ['url', Api.InputMessagesFilterUrl],
        ['roundVideo', Api.InputMessagesFilterRoundVideo],
        ['photoVideo', Api.InputMessagesFilterPhotoVideo],
        ['voice', Api.InputMessagesFilterVoice],
        ['roundVoice', Api.InputMessagesFilterRoundVoice],
        ['gif', Api.InputMessagesFilterGif],
        ['sticker', Api.InputMessagesFilterDocument],
        ['animation', Api.InputMessagesFilterDocument],
        ['audio', Api.InputMessagesFilterMusic],
        ['music', Api.InputMessagesFilterMusic],
        ['chatPhoto', Api.InputMessagesFilterChatPhotos],
        ['location', Api.InputMessagesFilterGeo],
        ['contact', Api.InputMessagesFilterContacts],
        ['phoneCalls', Api.InputMessagesFilterPhoneCalls],
        ['unknown', Api.InputMessagesFilterEmpty],
    ])('maps %s', (filter, ctor) => {
        expect(getSearchFilter(filter)).toBeInstanceOf(ctor as any);
    });
});

describe('getMediaType', () => {
    test('photo', () => {
        const media = Object.assign(Object.create(Api.MessageMediaPhoto.prototype), {});
        expect(getMediaType(media)).toBe('photo');
    });
    test('document with no attributes', () => {
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: makeDocument({ attributes: undefined }) });
        expect(getMediaType(media)).toBe('document');
    });
    test('sticker', () => {
        const doc = makeDocument({ attributes: [Object.create(Api.DocumentAttributeSticker.prototype)] });
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
        expect(getMediaType(media)).toBe('sticker');
    });
    test('gif via animated attr', () => {
        const doc = makeDocument({ attributes: [Object.create(Api.DocumentAttributeAnimated.prototype)] });
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
        expect(getMediaType(media)).toBe('gif');
    });
    test('roundVideo and video', () => {
        const round = Object.assign(Object.create(Api.DocumentAttributeVideo.prototype), { roundMessage: true });
        const video = Object.assign(Object.create(Api.DocumentAttributeVideo.prototype), { roundMessage: false });
        expect(getMediaType(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: makeDocument({ attributes: [round] }) }))).toBe('roundVideo');
        expect(getMediaType(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: makeDocument({ attributes: [video] }) }))).toBe('video');
    });
    test('voice and audio', () => {
        const voice = Object.assign(Object.create(Api.DocumentAttributeAudio.prototype), { voice: true });
        const audio = Object.assign(Object.create(Api.DocumentAttributeAudio.prototype), { voice: false });
        expect(getMediaType(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: makeDocument({ attributes: [voice] }) }))).toBe('voice');
        expect(getMediaType(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: makeDocument({ attributes: [audio] }) }))).toBe('audio');
    });
    test('gif via image/gif mimeType', () => {
        const doc = makeDocument({ attributes: [], mimeType: 'image/gif' });
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
        expect(getMediaType(media)).toBe('gif');
    });
    test('plain document', () => {
        const doc = makeDocument({ attributes: [], mimeType: 'application/pdf' });
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
        expect(getMediaType(media)).toBe('document');
    });
    test('unknown media defaults to document', () => {
        const media = Object.assign(Object.create(Api.MessageMediaEmpty.prototype), {});
        expect(getMediaType(media as any)).toBe('document');
    });
});

describe('getMessageDate', () => {
    test('numeric date', () => {
        expect(getMessageDate({ date: 1234 } as any)).toBe(1234);
    });
    test('Date object date', () => {
        const d = new Date(2_000_000);
        expect(getMessageDate({ date: d } as any)).toBe(2000);
    });
    test('falsy date falls back to now', () => {
        jest.spyOn(Date, 'now').mockReturnValue(5_000_000);
        expect(getMessageDate({ date: 0 } as any)).toBe(5000);
        jest.restoreAllMocks();
    });
});

describe('extractMediaMetaFromMessage', () => {
    test('photo media', () => {
        const size = Object.assign(Object.create(Api.PhotoSize.prototype), { size: 999, w: 100, h: 200, type: 'x' });
        const msg = {
            id: 1,
            date: 50,
            message: 'cap',
            media: Object.create(Api.MessageMediaPhoto.prototype),
            photo: makePhoto([size]),
        } as any;
        const meta = extractMediaMetaFromMessage(msg, 'chat1', 'photo');
        expect(meta).toMatchObject({
            messageId: 1, chatId: 'chat1', type: 'photo', caption: 'cap',
            mimeType: 'image/jpeg', filename: 'photo.jpg', downloadable: true,
            thumbnailAvailable: true, fileSize: 999, width: 100, height: 200,
        });
    });
    test('photo with no sizes', () => {
        const media = Object.create(Api.MessageMediaPhoto.prototype);
        const msg = { id: 2, date: 1, message: '', media, photo: makePhoto([]) } as any;
        const meta = extractMediaMetaFromMessage(msg, 'c', 'photo');
        expect(meta.thumbnailAvailable).toBe(false);
        expect(meta.fileSize).toBeUndefined();
    });
    test('document media with video + filename attrs', () => {
        const fileAttr = Object.assign(Object.create(Api.DocumentAttributeFilename.prototype), { fileName: 'movie.mp4' });
        const videoAttr = Object.assign(Object.create(Api.DocumentAttributeVideo.prototype), { w: 640, h: 480, duration: 30 });
        const doc = makeDocument({ size: 1024, mimeType: 'video/mp4', thumbs: [{}], attributes: [fileAttr, videoAttr] });
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
        const msg = { id: 3, date: 10, message: 'm', media } as any;
        const meta = extractMediaMetaFromMessage(msg, 'c', 'video');
        expect(meta).toMatchObject({ fileSize: 1024, mimeType: 'video/mp4', filename: 'movie.mp4', width: 640, height: 480, duration: 30, downloadable: true, thumbnailAvailable: true });
    });
    test('document with bigint size and audio attr', () => {
        const audioAttr = Object.assign(Object.create(Api.DocumentAttributeAudio.prototype), { duration: 99 });
        const doc = makeDocument({ size: { toString: () => '2048' }, mimeType: 'audio/ogg', videoThumbs: [], thumbs: [], attributes: [audioAttr] });
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
        const msg = { id: 4, date: 10, message: '', media } as any;
        const meta = extractMediaMetaFromMessage(msg, 'c', 'audio');
        expect(meta.fileSize).toBe(2048);
        expect(meta.duration).toBe(99);
        expect(meta.thumbnailAvailable).toBe(false);
    });
    test('document with no size', () => {
        const doc = makeDocument({ size: undefined, mimeType: 'x', attributes: [] });
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
        const msg = { id: 5, date: 10, message: '', media } as any;
        const meta = extractMediaMetaFromMessage(msg, 'c', 'document');
        expect(meta.fileSize).toBeUndefined();
    });
    test('non-Document document instance leaves defaults', () => {
        const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: Object.create(Api.DocumentEmpty.prototype) });
        const msg = { id: 6, date: 10, message: '', media } as any;
        const meta = extractMediaMetaFromMessage(msg, 'c', 'document');
        expect(meta.downloadable).toBe(false);
    });
});

describe('getMediaDetails', () => {
    test('returns null for missing document', () => {
        expect(getMediaDetails({ document: undefined } as any)).toBeNull();
        expect(getMediaDetails(null as any)).toBeNull();
    });
    test('returns null for DocumentEmpty', () => {
        const media = { document: Object.create(Api.DocumentEmpty.prototype) } as any;
        expect(getMediaDetails(media)).toBeNull();
    });
    test('extracts details', () => {
        const fileAttr = Object.assign(Object.create(Api.DocumentAttributeFilename.prototype), { fileName: 'f.bin' });
        const videoAttr = Object.assign(Object.create(Api.DocumentAttributeVideo.prototype), { duration: 5, w: 10, h: 20 });
        const doc = makeDocument({ size: 50, mimeType: 'video/mp4', attributes: [fileAttr, videoAttr] });
        const result = getMediaDetails({ document: doc } as any);
        expect(result).toEqual({ size: 50, mimeType: 'video/mp4', fileName: 'f.bin', duration: 5, width: 10, height: 20 });
    });
    test('null fields when attrs missing', () => {
        const doc = makeDocument({ size: 50, mimeType: 'x', attributes: [] });
        const result = getMediaDetails({ document: doc } as any);
        expect(result).toEqual({ size: 50, mimeType: 'x', fileName: null, duration: null, width: null, height: null });
    });
});

describe('detectContentType', () => {
    test('returns provided mimeType', () => {
        expect(detectContentType('x.bin', 'application/foo')).toBe('application/foo');
    });
    test('maps extensions', () => {
        expect(detectContentType('photo.JPG')).toBe('image/jpeg');
        expect(detectContentType('a.png')).toBe('image/png');
        expect(detectContentType('a.mp4')).toBe('video/mp4');
        expect(detectContentType('a.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
    test('unknown extension defaults', () => {
        expect(detectContentType('a.xyz')).toBe('application/octet-stream');
        expect(detectContentType('noext')).toBe('application/octet-stream');
    });
});

describe('generateETag', () => {
    test('bigint fileId', () => {
        expect(generateETag(1, 'c', bigInt(123))).toBe('"1-c-123"');
    });
    test('string and number fileId', () => {
        expect(generateETag(2, 'c', 'fid')).toBe('"2-c-fid"');
        expect(generateETag(3, 'c', 42)).toBe('"3-c-42"');
    });
});

describe('downloadFileFromUrl', () => {
    afterEach(() => jest.clearAllMocks());

    test('downloads internal host with api key header', async () => {
        process.env.X_API_KEY = 'secret';
        mockedAxios.head.mockResolvedValue({ headers: { 'content-length': '10' } } as any);
        mockedAxios.get.mockResolvedValue({ data: Buffer.from('hello') } as any);
        const buf = await downloadFileFromUrl('https://cms.paidgirls.site/file');
        expect(buf.toString()).toBe('hello');
        expect(mockedAxios.head).toHaveBeenCalledWith('https://cms.paidgirls.site/file', expect.objectContaining({ headers: { 'x-api-key': 'secret' } }));
        delete process.env.X_API_KEY;
    });
    test('external host omits api key header', async () => {
        mockedAxios.head.mockResolvedValue({ headers: { 'content-length': '5' } } as any);
        mockedAxios.get.mockResolvedValue({ data: Buffer.from('ab') } as any);
        await downloadFileFromUrl('https://example.com/x');
        expect(mockedAxios.head).toHaveBeenCalledWith('https://example.com/x', expect.objectContaining({ headers: {} }));
    });
    test('invalid URL yields empty headers (caught)', async () => {
        mockedAxios.head.mockResolvedValue({ headers: { 'content-length': '1' } } as any);
        mockedAxios.get.mockResolvedValue({ data: Buffer.from('a') } as any);
        await downloadFileFromUrl('not a url');
        expect(mockedAxios.head).toHaveBeenCalledWith('not a url', expect.objectContaining({ headers: {} }));
    });
    test('throws when content-length exceeds max', async () => {
        mockedAxios.head.mockResolvedValue({ headers: { 'content-length': String(MAX_FILE_SIZE + 1) } } as any);
        await expect(downloadFileFromUrl('https://example.com/big')).rejects.toThrow(/exceeds maximum/);
    });
    test('throws when downloaded buffer exceeds max', async () => {
        mockedAxios.head.mockResolvedValue({ headers: { 'content-length': '1' } } as any);
        mockedAxios.get.mockResolvedValue({ data: Buffer.alloc(20) } as any);
        await expect(downloadFileFromUrl('https://example.com/x', 10)).rejects.toThrow(/exceeds maximum/);
    });
    test('http error response surfaces status', async () => {
        mockedAxios.head.mockRejectedValue({ response: { status: 404, statusText: 'Not Found' } });
        await expect(downloadFileFromUrl('https://example.com/missing')).rejects.toThrow(/HTTP 404 - Not Found/);
    });
    test('timeout error', async () => {
        mockedAxios.head.mockRejectedValue({ code: 'ECONNABORTED' });
        await expect(downloadFileFromUrl('https://example.com/slow')).rejects.toThrow(/Request timeout/);
    });
    test('generic error', async () => {
        mockedAxios.head.mockRejectedValue({ message: 'boom' });
        await expect(downloadFileFromUrl('https://example.com/x')).rejects.toThrow(/Failed to download file: boom/);
    });
    test('HEAD validateStatus accepts 2xx/3xx redirects but rejects others', async () => {
        mockedAxios.head.mockResolvedValue({ headers: { 'content-length': '1' } } as any);
        mockedAxios.get.mockResolvedValue({ data: Buffer.from('a') } as any);
        await downloadFileFromUrl('https://cms.paidgirls.site/file');
        const headCfg = mockedAxios.head.mock.calls[0][1] as any;
        // 3xx redirect on HEAD is allowed (CDN redirect to signed URL)
        expect(headCfg.validateStatus(200)).toBe(true);
        expect(headCfg.validateStatus(301)).toBe(true);
        expect(headCfg.validateStatus(399)).toBe(true);
        // out-of-range statuses rejected
        expect(headCfg.validateStatus(199)).toBe(false);
        expect(headCfg.validateStatus(400)).toBe(false);
        expect(headCfg.validateStatus(500)).toBe(false);
    });
    test('GET validateStatus only accepts 2xx, rejecting redirects and errors', async () => {
        mockedAxios.head.mockResolvedValue({ headers: { 'content-length': '1' } } as any);
        mockedAxios.get.mockResolvedValue({ data: Buffer.from('a') } as any);
        await downloadFileFromUrl('https://cms.paidgirls.site/file');
        const getCfg = mockedAxios.get.mock.calls[0][1] as any;
        // body download must be a real 2xx success
        expect(getCfg.validateStatus(200)).toBe(true);
        expect(getCfg.validateStatus(299)).toBe(true);
        // a 3xx redirect is NOT a successful body download
        expect(getCfg.validateStatus(199)).toBe(false);
        expect(getCfg.validateStatus(300)).toBe(false);
        expect(getCfg.validateStatus(404)).toBe(false);
    });
});

describe('downloadWithTimeout', () => {
    test('resolves before timeout', async () => {
        await expect(downloadWithTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
    });
    test('rejects on timeout', async () => {
        jest.useFakeTimers();
        const never = new Promise<string>(() => {});
        const p = downloadWithTimeout(never, 100);
        jest.advanceTimersByTime(100);
        await expect(p).rejects.toThrow('Download timeout');
        jest.useRealTimers();
    });
});

describe('processWithConcurrencyLimit', () => {
    test('processes all items, collecting successes only', async () => {
        const items = [1, 2, 3, 4, 5];
        const results = await processWithConcurrencyLimit(items, async (n) => {
            if (n === 3) throw new Error('skip');
            return n * 2;
        }, 2, 0);
        expect(results.sort((a, b) => a - b)).toEqual([2, 4, 8, 10]);
    });
    test('applies batch delay between batches', async () => {
        jest.useFakeTimers();
        const items = [1, 2, 3, 4];
        const promise = processWithConcurrencyLimit(items, async (n) => n, 2, 50);
        await jest.runAllTimersAsync();
        await expect(promise).resolves.toEqual([1, 2, 3, 4]);
        jest.useRealTimers();
    });
});

describe('mime/extension helpers', () => {
    test('getMimeType', () => {
        expect(getMimeType('photo')).toBe('image/jpeg');
        expect(getMimeType('video')).toBe('video/mp4');
        expect(getMimeType('document')).toBe('application/octet-stream');
        expect(getMimeType('other')).toBe('application/octet-stream');
    });
    test('getMediaExtension from string', () => {
        expect(getMediaExtension('photo')).toBe('jpg');
        expect(getMediaExtension('video')).toBe('mp4');
        expect(getMediaExtension('audio')).toBe('bin');
    });
    test('getMediaExtension from media objects', () => {
        expect(getMediaExtension(Object.create(Api.MessageMediaPhoto.prototype))).toBe('jpg');
        expect(getMediaExtension(null as any)).toBe('bin');
        const vdoc = makeDocument({ mimeType: 'video/mp4' });
        expect(getMediaExtension(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: vdoc }))).toBe('mp4');
        const idoc = makeDocument({ mimeType: 'image/png' });
        expect(getMediaExtension(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: idoc }))).toBe('png');
        const adoc = makeDocument({ mimeType: 'audio/mp3' });
        expect(getMediaExtension(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: adoc }))).toBe('ogg');
        const odoc = makeDocument({ mimeType: 'application/zip' });
        expect(getMediaExtension(Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: odoc }))).toBe('bin');
        const noMime = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: Object.create(Api.DocumentEmpty.prototype) });
        expect(getMediaExtension(noMime)).toBe('bin');
        expect(getMediaExtension(Object.create(Api.MessageMediaEmpty.prototype) as any)).toBe('bin');
    });
    test('getMediaAttributes', () => {
        const none = getMediaAttributes({ type: 'photo' });
        expect(none).toHaveLength(0);
        const withFile = getMediaAttributes({ type: 'photo', fileName: 'a.jpg' });
        expect(withFile[0]).toBeInstanceOf(Api.DocumentAttributeFilename);
        const video = getMediaAttributes({ type: 'video', fileName: 'v.mp4' });
        expect(video.some(a => a instanceof Api.DocumentAttributeVideo)).toBe(true);
    });
});

describe('getEntityId', () => {
    test('user/channel/chat', () => {
        expect(getEntityId(makeUser({ id: { toString: () => '11' } }) as any)).toBe('11');
        expect(getEntityId(Object.assign(Object.create(Api.Channel.prototype), { id: { toString: () => '22' } }) as any)).toBe('22');
        expect(getEntityId(Object.assign(Object.create(Api.Chat.prototype), { id: { toString: () => '33' } }) as any)).toBe('33');
    });
    test('unknown returns empty string', () => {
        expect(getEntityId({} as any)).toBe('');
    });
});

describe('CSV / vCard', () => {
    test('generateCSV', () => {
        const csv = generateCSV([{ firstName: 'A', lastName: 'B', phone: '123', blocked: true }]);
        expect(csv).toBe('First Name,Last Name,Phone,Blocked\nA,B,123,true');
    });
    test('generateVCard', () => {
        const v = generateVCard([{ firstName: 'A', lastName: 'B', phone: '1' }, {}]);
        expect(v).toContain('BEGIN:VCARD');
        expect(v).toContain('FN:A B');
        expect(v).toContain('TEL;TYPE=CELL:1');
        expect(v.split('\n\n')).toHaveLength(2);
    });
    test('createVCardContent', () => {
        const contacts = { users: [makeUser({ firstName: 'X', lastName: 'Y', phone: '9' })] } as any;
        const content = createVCardContent(contacts);
        expect(content).toContain('FN:X Y');
        expect(content).toContain('TEL;TYPE=CELL:9');
    });
});

describe('date/buffer helpers', () => {
    test('toISODate', () => {
        expect(toISODate(0)).toBe('1970-01-01T00:00:00.000Z');
    });
    test('toTimeString pads', () => {
        const ts = Math.floor(new Date(2020, 0, 1, 9, 5).getTime() / 1000);
        expect(toTimeString(ts)).toBe('09:05');
    });
    test('bufferToBase64DataUrl', () => {
        expect(bufferToBase64DataUrl(Buffer.from('hi'))).toBe('data:image/jpeg;base64,aGk=');
        expect(bufferToBase64DataUrl(Buffer.from('hi'), 'image/png')).toContain('data:image/png');
    });
});

describe('resolveEntityToSenderInfo', () => {
    test('user', () => {
        const u = makeUser({ firstName: 'F', lastName: 'L', username: 'u', phone: '1' });
        expect(resolveEntityToSenderInfo(u as any, '5', true)).toMatchObject({ id: '5', firstName: 'F', peerType: 'user', isSelf: true });
    });
    test('chat', () => {
        const c = Object.assign(Object.create(Api.Chat.prototype), { title: 'G' });
        expect(resolveEntityToSenderInfo(c as any, '5', false)).toMatchObject({ firstName: 'G', peerType: 'group' });
    });
    test('channel', () => {
        const ch = Object.assign(Object.create(Api.Channel.prototype), { title: 'C', username: 'cu' });
        expect(resolveEntityToSenderInfo(ch as any, '5', false)).toMatchObject({ firstName: 'C', username: 'cu', peerType: 'channel' });
    });
    test('null/unknown', () => {
        expect(resolveEntityToSenderInfo(null, '5', false)).toMatchObject({ peerType: 'unknown', firstName: null });
    });
});

describe('extractMediaInfo', () => {
    test('returns null for no media', () => {
        expect(extractMediaInfo({ media: undefined } as any, null)).toBeNull();
        expect(extractMediaInfo({ media: Object.create(Api.MessageMediaEmpty.prototype) } as any, null)).toBeNull();
    });
    test('extracts photo media info with thumbnail', () => {
        const size = Object.assign(Object.create(Api.PhotoSize.prototype), { size: 10, w: 1, h: 2 });
        const msg = { id: 1, date: 1, message: '', media: Object.create(Api.MessageMediaPhoto.prototype), photo: makePhoto([size]) } as any;
        const info = extractMediaInfo(msg, Buffer.from('t'));
        expect(info).toMatchObject({ type: 'photo', mimeType: 'image/jpeg' });
        expect(info!.thumbnail).toContain('data:image/jpeg;base64');
    });
    test('null thumbnail', () => {
        const msg = { id: 1, date: 1, message: '', media: Object.create(Api.MessageMediaPhoto.prototype), photo: makePhoto([]) } as any;
        const info = extractMediaInfo(msg, null);
        expect(info!.thumbnail).toBeNull();
    });
});

describe('getUserOnlineStatus', () => {
    test('no status', () => {
        expect(getUserOnlineStatus(makeUser({}) as any)).toEqual({ status: 'unknown', lastSeen: null });
    });
    test('online', () => {
        expect(getUserOnlineStatus(makeUser({ status: Object.create(Api.UserStatusOnline.prototype) }) as any)).toEqual({ status: 'online', lastSeen: null });
    });
    test('offline with truthy wasOnline', () => {
        const status = Object.assign(Object.create(Api.UserStatusOffline.prototype), { wasOnline: 1 });
        expect(getUserOnlineStatus(makeUser({ status }) as any)).toEqual({ status: 'offline', lastSeen: '1970-01-01T00:00:01.000Z' });
    });
    test('offline with falsy wasOnline yields null lastSeen', () => {
        const status = Object.assign(Object.create(Api.UserStatusOffline.prototype), { wasOnline: 0 });
        expect(getUserOnlineStatus(makeUser({ status }) as any).lastSeen).toBeNull();
        const status2 = Object.assign(Object.create(Api.UserStatusOffline.prototype), { wasOnline: undefined });
        expect(getUserOnlineStatus(makeUser({ status: status2 }) as any).lastSeen).toBeNull();
    });
    test('recently/lastWeek/lastMonth', () => {
        expect(getUserOnlineStatus(makeUser({ status: Object.create(Api.UserStatusRecently.prototype) }) as any).status).toBe('recently');
        expect(getUserOnlineStatus(makeUser({ status: Object.create(Api.UserStatusLastWeek.prototype) }) as any).status).toBe('lastWeek');
        expect(getUserOnlineStatus(makeUser({ status: Object.create(Api.UserStatusLastMonth.prototype) }) as any).status).toBe('lastMonth');
    });
    test('unknown status type', () => {
        expect(getUserOnlineStatus(makeUser({ status: Object.create(Api.UserStatusEmpty.prototype) }) as any).status).toBe('unknown');
    });
});
