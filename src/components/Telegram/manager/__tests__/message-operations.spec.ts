import { Api } from 'telegram';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn().mockResolvedValue(undefined),
}));

const downloadFileFromUrlMock = jest.fn();
jest.mock('../helpers', () => ({
    ...jest.requireActual('../helpers'),
    downloadFileFromUrl: (...args: any[]) => downloadFileFromUrlMock(...args),
}));

// No mock of ../chat-operations: the REAL safeGetEntityById runs during in-chat
// searches, driven through the fake GramJS client (client.getEntity / iterDialogs).
import {
    sendMessageToChat, sendInlineMessage, forwardSecretMsgs, forwardMessages,
    forwardMessage, searchMessages, scheduleMessageSend, getScheduledMessages,
    sendMediaAlbum, sendVoiceMessage, cleanupChat, editMessage, sendMediaBatch,
    sendViewOnceMedia, sendPhotoChat, sendFileChat, deleteChat,
} from '../message-operations';
import { MessageMediaType } from '../../dto/message-search.dto';

function makeLogger() {
    return { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}
function makeCtx(client: any) {
    return { client, phoneNumber: '9990002222', logger: makeLogger() } as any;
}

function makeMessage(overrides: Record<string, unknown> = {}) {
    return Object.assign(Object.create(Api.Message.prototype), {
        id: 1, message: 'hi', date: 1700000000, media: undefined, ...overrides,
    });
}

function makeDocMessage(fileName: string, extra: Record<string, unknown> = {}) {
    const doc = Object.assign(Object.create(Api.Document.prototype), {
        attributes: [new Api.DocumentAttributeFilename({ fileName })],
        mimeType: 'application/pdf', size: 100,
    });
    const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
    return makeMessage({ media, ...extra });
}

describe('message-operations', () => {
    beforeEach(() => {
        downloadFileFromUrlMock.mockReset().mockResolvedValue(Buffer.from('data'));
    });

    describe('sendMessageToChat', () => {
        test('throws when client missing', async () => {
            await expect(sendMessageToChat(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });
        test('sends message', async () => {
            const sendMessage = jest.fn().mockResolvedValue({ id: 5 });
            const ctx = makeCtx({ sendMessage });
            const r = await sendMessageToChat(ctx, { peer: 'p', parseMode: 'md', message: 'hello' } as any);
            expect(sendMessage).toHaveBeenCalledWith('p', { message: 'hello', parseMode: 'md' });
            expect(r).toEqual({ id: 5 });
        });
    });

    describe('sendInlineMessage', () => {
        test('sends with url button', async () => {
            const sendMessage = jest.fn().mockResolvedValue({ id: 6 });
            const ctx = makeCtx({ sendMessage });
            const r = await sendInlineMessage(ctx, 'chat', 'msg', 'http://x');
            expect(r).toEqual({ id: 6 });
            expect(sendMessage.mock.calls[0][1].buttons[0]).toBeInstanceOf(Api.KeyboardButtonUrl);
        });
    });

    describe('forwardSecretMsgs', () => {
        test('forwards media messages then stops', async () => {
            const m1 = makeMessage({ id: 10, media: {} });
            const m2 = makeMessage({ id: 11, media: undefined });
            let call = 0;
            const getMessages = jest.fn(async () => (call++ === 0 ? [m1, m2] : []));
            const clientForward = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ getMessages, forwardMessages: clientForward });
            const r = await forwardSecretMsgs(ctx, 'from', 'to');
            expect(r.forwardedCount).toBe(1);
        });
        test('logs error on forward failure', async () => {
            const m1 = makeMessage({ id: 10, media: {} });
            let call = 0;
            const getMessages = jest.fn(async () => (call++ === 0 ? [m1] : []));
            const clientForward = jest.fn().mockRejectedValue(new Error('fwd fail'));
            const ctx = makeCtx({ getMessages, forwardMessages: clientForward });
            const r = await forwardSecretMsgs(ctx, 'from', 'to');
            expect(ctx.logger.error).toHaveBeenCalled();
            expect(r.forwardedCount).toBe(0);
        });
        test('skips forwarding when a page has only text messages (no media)', async () => {
            // Real scenario: channel history page contains only plain text posts;
            // there is nothing secret to forward so the forward call must be skipped.
            const textOnly = makeMessage({ id: 20, media: undefined });
            let call = 0;
            const getMessages = jest.fn(async () => (call++ === 0 ? [textOnly] : []));
            const clientForward = jest.fn();
            const ctx = makeCtx({ getMessages, forwardMessages: clientForward });
            const r = await forwardSecretMsgs(ctx, 'from', 'to');
            expect(clientForward).not.toHaveBeenCalled();
            expect(r.forwardedCount).toBe(0);
        });

        test('forwards media across MULTIPLE pages (does not stop after the first page)', async () => {
            // Real scenario: a chat has >100 media messages. The function must paginate and
            // forward every page, not silently drop everything past the first 100.
            const page1 = Array.from({ length: 100 }, (_, i) => makeMessage({ id: i + 1, media: {} }));
            const page2 = Array.from({ length: 30 }, (_, i) => makeMessage({ id: i + 101, media: {} }));
            let call = 0;
            const getMessages = jest.fn(async () => {
                const c = call++;
                if (c === 0) return page1;
                if (c === 1) return page2;
                return []; // history exhausted
            });
            const clientForward = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ getMessages, forwardMessages: clientForward });
            const r = await forwardSecretMsgs(ctx, 'from', 'to');
            expect(clientForward).toHaveBeenCalledTimes(2);  // both pages forwarded
            expect(r.forwardedCount).toBe(130);              // all media, not just the first 100
        });
    });

    describe('forwardMessages', () => {
        test('forwards in chunks', async () => {
            const clientForward = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ forwardMessages: clientForward });
            const ids = Array.from({ length: 35 }, (_, i) => i + 1);
            const r = await forwardMessages(ctx, 'from', 'to', ids);
            expect(r).toBe(35);
            expect(clientForward).toHaveBeenCalledTimes(2);
        });
        test('continues after a transient chunk error', async () => {
            const clientForward = jest.fn().mockRejectedValue(new Error('x'));
            const ctx = makeCtx({ forwardMessages: clientForward });
            const r = await forwardMessages(ctx, 'from', 'to', [1, 2]);
            expect(r).toBe(0);
            expect(ctx.logger.error).toHaveBeenCalled();
        });

        test('aborts remaining chunks on a PERMANENT error and re-throws (mark-and-skip)', async () => {
            // Session-survival: a revoked/banned account must not keep forwarding chunk after
            // chunk on a dead session. First chunk fails permanently -> stop and re-throw.
            const clientForward = jest.fn().mockRejectedValue({ errorMessage: 'SESSION_REVOKED' });
            const ctx = makeCtx({ forwardMessages: clientForward });
            const ids = Array.from({ length: 90 }, (_, i) => i + 1); // 3 chunks of 30
            await expect(forwardMessages(ctx, 'from', 'to', ids)).rejects.toMatchObject({ errorMessage: 'SESSION_REVOKED' });
            expect(clientForward).toHaveBeenCalledTimes(1); // did not proceed to chunks 2 and 3
        });
    });

    describe('forwardMessage', () => {
        test('forwards single message', async () => {
            const forwardMessages = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ forwardMessages });
            await forwardMessage(ctx, 'to', 'from', 99);
            expect(forwardMessages).toHaveBeenCalled();
        });
        test('logs error on failure', async () => {
            const forwardMessages = jest.fn().mockRejectedValue({ errorMessage: 'boom' });
            const ctx = makeCtx({ forwardMessages });
            await forwardMessage(ctx, 'to', 'from', 99);
            expect(ctx.logger.info).toHaveBeenCalled();
        });
    });

    describe('searchMessages', () => {
        test('throws when client missing', async () => {
            await expect(searchMessages(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });

        test('searches within a chat and filters unwanted', async () => {
            const goodMsg = makeMessage({ id: 1, message: 'hello world', date: 1700000000,
                fromId: new Api.PeerUser({ userId: 42 as any }) });
            const goodDoc = makeDocMessage('vacation.pdf', { id: 2, date: 1700000000 });
            const badDoc = makeDocMessage('torrent.mkv', { id: 3, date: 1700000000 });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [goodMsg, goodDoc, badDoc], count: 5,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            // Real safeGetEntityById resolves the chat peer via the client before searching.
            const peerEntity = Object.assign(Object.create(Api.Channel.prototype), { id: 1 });
            const getEntity = jest.fn().mockResolvedValue(peerEntity);
            const ctx = makeCtx({ invoke, getEntity });
            const r = await searchMessages(ctx, { chatId: 'c1', query: '', types: [MessageMediaType.PHOTO] } as any);
            expect(getEntity).toHaveBeenCalledWith('c1');
            const searchReq = invoke.mock.calls[0][0];
            expect(searchReq).toBeInstanceOf(Api.messages.Search);
            // the resolved entity is forwarded as the search peer
            expect(searchReq.peer).toBe(peerEntity);
            expect(r.photo.messages).toEqual([1, 2]);
            expect(r.photo.total).toBe(5);
        });

        test('global search when no chatId, text type filters media', async () => {
            const textMsg = makeMessage({ id: 1, message: 'hi there',
                peerId: new Api.PeerChannel({ channelId: 7 as any }) });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [textMsg], count: 1,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const ctx = makeCtx({ invoke });
            const r = await searchMessages(ctx, { types: [MessageMediaType.TEXT] } as any);
            expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.SearchGlobal);
            expect(r.text.messages).toEqual([1]);
        });

        test('returns finalResult when result lacks messages', async () => {
            const invoke = jest.fn().mockResolvedValue({});
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.Channel.prototype));
            const ctx = makeCtx({ invoke, getEntity });
            const r = await searchMessages(ctx, { chatId: 'c1', types: [MessageMediaType.PHOTO] } as any);
            expect(r.photo.messages).toEqual([]);
        });

        test('global returns finalResult when lacks messages', async () => {
            const invoke = jest.fn().mockResolvedValue({});
            const ctx = makeCtx({ invoke });
            const r = await searchMessages(ctx, { types: [MessageMediaType.PHOTO] } as any);
            expect(r.photo.messages).toEqual([]);
        });

        test('uses default type set when types not supplied (full media sweep)', async () => {
            // Operator runs a search without specifying types -> all 8 default
            // categories are queried in one pass.
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [], count: 0,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.Channel.prototype));
            const ctx = makeCtx({ invoke, getEntity });
            const r = await searchMessages(ctx, { chatId: 'c1' } as any);
            // 8 default media types => 8 search invocations
            expect(invoke).toHaveBeenCalledTimes(8);
            expect(r.all.messages).toEqual([]);
        });

        test('applies maxId/minId pagination bounds and falls back to filtered count', async () => {
            // Paginated search: client passes maxId/minId to page through history,
            // and the server omits a total count so we fall back to filtered length.
            const goodMsg = makeMessage({ id: 9, message: 'family photo', date: 1700000000 });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [goodMsg], // no `count` property -> count || 0 false branch
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.Channel.prototype));
            const ctx = makeCtx({ invoke, getEntity });
            const r = await searchMessages(ctx, {
                chatId: 'c1', types: [MessageMediaType.PHOTO], maxId: 500, minId: 100,
            } as any);
            const searchReq = invoke.mock.calls[0][0];
            expect(searchReq.maxId).toBe(500);
            expect(searchReq.minId).toBe(100);
            // count missing => total derived from filtered ids length
            expect(r.photo.total).toBe(1);
        });

        test('global search without count falls back to filtered length', async () => {
            const goodMsg = makeMessage({ id: 3, message: 'sunset', date: 1700000000 });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [goodMsg], // no count
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const ctx = makeCtx({ invoke });
            const r = await searchMessages(ctx, { types: [MessageMediaType.PHOTO] } as any);
            expect(r.photo.total).toBe(1);
        });

        test('document with no filename attribute is treated as wanted', async () => {
            // A forwarded document that lost its filename attribute: fileName resolves
            // to '' (no DocumentAttributeFilename) and is kept since '' is not unwanted.
            const doc = Object.assign(Object.create(Api.Document.prototype), {
                attributes: [], mimeType: 'application/pdf', size: 100,
            });
            const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
            const namelessDoc = makeMessage({ id: 4, media, date: 1700000000 });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [namelessDoc], count: 1,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.Channel.prototype));
            const ctx = makeCtx({ invoke, getEntity });
            const r = await searchMessages(ctx, { chatId: 'c1', types: [MessageMediaType.DOCUMENT] } as any);
            expect(r.document.messages).toEqual([4]);
            expect(r.document.data[0].mediaType).toBe('document');
        });

        test('filters out non-media message whose text is spam', async () => {
            // A plain text post advertising a "free download torrent" must be dropped.
            const spam = makeMessage({ id: 8, message: 'free download torrent link', date: 1700000000 });
            Object.defineProperty(spam, 'text', { value: 'free download torrent link' });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [spam], count: 1,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const getEntity = jest.fn().mockResolvedValue(Object.create(Api.Channel.prototype));
            const ctx = makeCtx({ invoke, getEntity });
            const r = await searchMessages(ctx, { chatId: 'c1', types: [MessageMediaType.PHOTO] } as any);
            expect(r.photo.messages).toEqual([]);
        });

        test('global search derives chatId from PeerUser and PeerChat sender peers', async () => {
            // Global search returns messages from a 1:1 chat (PeerUser) and a basic
            // group (PeerChat); the enriched chatId is derived from each peer type.
            const fromUser = makeMessage({
                id: 11, message: 'hey', date: 1700000000,
                fromId: new Api.PeerUser({ userId: 42 as any }),
                peerId: new Api.PeerUser({ userId: 99 as any }),
            });
            const fromGroup = makeMessage({
                id: 12, message: 'group post', date: 1700000000,
                peerId: new Api.PeerChat({ chatId: 55 as any }),
            });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [fromUser, fromGroup], count: 2,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const ctx = makeCtx({ invoke });
            const r = await searchMessages(ctx, { types: [MessageMediaType.PHOTO] } as any);
            expect(r.photo.data[0].chatId).toBe('99');
            expect(r.photo.data[0].senderName).toBe('42');
            expect(r.photo.data[1].chatId).toBe('55');
        });

        test('global search derives chatId from a PeerChannel post with no caption', async () => {
            // A channel broadcast (PeerChannel) with an empty caption: chatId comes
            // from the channelId and the enriched text falls back to ''.
            const fromChannel = makeMessage({
                id: 21, message: '', date: 1700000000,
                peerId: new Api.PeerChannel({ channelId: 7 as any }),
            });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [fromChannel], count: 1,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const ctx = makeCtx({ invoke });
            const r = await searchMessages(ctx, { types: [MessageMediaType.PHOTO] } as any);
            expect(r.photo.data[0].chatId).toBe('7');
            expect(r.photo.data[0].text).toBe('');
        });

        test('global search leaves chatId empty for an unrecognized peer type', async () => {
            // Defensive path: a message whose peerId is none of User/Chat/Channel
            // (e.g. a malformed/unknown peer) leaves the derived chatId blank.
            const weird = makeMessage({
                id: 22, message: 'odd', date: 1700000000,
                peerId: { className: 'PeerUnknown' } as any,
            });
            const result = Object.assign(Object.create(Api.messages.ChannelMessages.prototype), {
                messages: [weird], count: 1,
            });
            const invoke = jest.fn().mockResolvedValue(result);
            const ctx = makeCtx({ invoke });
            const r = await searchMessages(ctx, { types: [MessageMediaType.PHOTO] } as any);
            expect(r.photo.data[0].chatId).toBe('');
        });
    });

    describe('scheduleMessageSend', () => {
        test('throws when client missing', async () => {
            await expect(scheduleMessageSend(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });
        test('schedules text message', async () => {
            const sendMessage = jest.fn().mockResolvedValue({ id: 1 });
            const ctx = makeCtx({ sendMessage });
            await scheduleMessageSend(ctx, { chatId: 'c', message: 'm', scheduledTime: new Date() } as any);
            expect(sendMessage).toHaveBeenCalled();
        });
        test('schedules media message', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const sendFile = jest.fn().mockResolvedValue({ id: 2 });
            const ctx = makeCtx({ uploadFile, sendFile });
            await scheduleMessageSend(ctx, {
                chatId: 'c', message: 'm', scheduledTime: new Date(),
                media: { type: 'document', url: 'http://x' },
            } as any);
            expect(sendFile).toHaveBeenCalled();
        });
    });

    describe('getScheduledMessages', () => {
        test('throws when client missing', async () => {
            await expect(getScheduledMessages(makeCtx(null), 'c')).rejects.toThrow('Client not initialized');
        });
        test('maps scheduled messages with and without media', async () => {
            const plain = makeMessage({ id: 1, message: 'plain', date: 1700000000 });
            const withMedia = makeDocMessage('file.pdf', { id: 2, message: 'doc', date: 1700000000 });
            const invoke = jest.fn().mockResolvedValue({ messages: [plain, withMedia, { className: 'x' }] });
            const ctx = makeCtx({ invoke });
            const r = await getScheduledMessages(ctx, 'c');
            expect(r.length).toBe(2);
            expect(r[1].media).not.toBeNull();
        });
        test('returns empty when no messages array', async () => {
            const invoke = jest.fn().mockResolvedValue({});
            const ctx = makeCtx({ invoke });
            const r = await getScheduledMessages(ctx, 'c');
            expect(r).toEqual([]);
        });
        test('extracts width/height/duration for a scheduled video document', async () => {
            // A scheduled video clip: dimensions and duration come from the
            // DocumentAttributeVideo attribute.
            const doc = Object.assign(Object.create(Api.Document.prototype), {
                mimeType: 'video/mp4', size: 2048,
                attributes: [
                    new Api.DocumentAttributeVideo({ duration: 30, w: 640, h: 480 } as any),
                    new Api.DocumentAttributeFilename({ fileName: 'clip.mp4' }),
                ],
            });
            const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: doc });
            const vid = makeMessage({ id: 5, message: 'clip', media, date: 1700000000 });
            const invoke = jest.fn().mockResolvedValue({ messages: [vid] });
            const ctx = makeCtx({ invoke });
            const r = await getScheduledMessages(ctx, 'c');
            expect(r[0].media.type).toBe('video');
            expect(r[0].media.width).toBe(640);
            expect(r[0].media.height).toBe(480);
            expect(r[0].media.duration).toBe(30);
        });
        test('scheduled media with no resolvable metadata yields null fields and empty text', async () => {
            // A scheduled document whose document object is not a full Api.Document
            // (e.g. a stale/empty placeholder): media type is still derived, but
            // mimeType/fileName/fileSize/dimensions/duration all collapse to null,
            // and a caption-less message yields ''.
            const media = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: {} });
            const emptyMeta = makeMessage({ id: 7, message: '', media, date: 1700000000 });
            const invoke = jest.fn().mockResolvedValue({ messages: [emptyMeta] });
            const ctx = makeCtx({ invoke });
            const r = await getScheduledMessages(ctx, 'c');
            expect(r[0].text).toBe('');
            expect(r[0].media).not.toBeNull();
            expect(r[0].media.mimeType).toBeNull();
            expect(r[0].media.fileName).toBeNull();
            expect(r[0].media.fileSize).toBeNull();
        });
    });

    describe('sendMediaAlbum', () => {
        test('throws when client missing', async () => {
            await expect(sendMediaAlbum(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });
        test('sends album of photo + video', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendMediaAlbum(ctx, {
                chatId: 'c',
                media: [
                    { type: 'photo', url: 'http://a' },
                    { type: 'video', url: 'http://b', filename: 'v.mp4' },
                    { type: 'document', url: 'http://c', filename: 'd.pdf' },
                ],
            } as any);
            expect(r.success).toBe(3);
            expect(r.failed).toBe(0);
        });
        test('collects errors and throws if all fail', async () => {
            downloadFileFromUrlMock.mockRejectedValue(new Error('dl fail'));
            const ctx = makeCtx({ uploadFile: jest.fn(), invoke: jest.fn() });
            await expect(sendMediaAlbum(ctx, {
                chatId: 'c', media: [{ type: 'photo', url: 'http://a' }],
            } as any)).rejects.toThrow('No media items could be processed');
        });
        test('partial failure reports errors', async () => {
            downloadFileFromUrlMock.mockResolvedValueOnce(Buffer.from('ok')).mockRejectedValueOnce(new Error('boom'));
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendMediaAlbum(ctx, {
                chatId: 'c', media: [{ type: 'photo', url: 'http://a' }, { type: 'photo', url: 'http://b' }],
            } as any);
            expect(r.success).toBe(1);
            expect(r.failed).toBe(1);
            expect(r.errors).toHaveLength(1);
        });
        test('document item without filename derives mime from generated name', async () => {
            // A document attached with no filename -> detectContentType runs against
            // the auto-generated `media_<i>` name.
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendMediaAlbum(ctx, {
                chatId: 'c', media: [{ type: 'document', url: 'http://d' }],
            } as any);
            expect(r.success).toBe(1);
        });
        test('records "Unknown error" when a failing item throws without a message', async () => {
            // Upload rejects with a bare value (no .message) -> fallback string used.
            downloadFileFromUrlMock.mockResolvedValueOnce(Buffer.from('ok')).mockResolvedValueOnce(Buffer.from('ok'));
            const uploadFile = jest.fn()
                .mockResolvedValueOnce({ id: 'f' })
                .mockRejectedValueOnce({});
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendMediaAlbum(ctx, {
                chatId: 'c', media: [{ type: 'photo', url: 'http://a' }, { type: 'photo', url: 'http://b' }],
            } as any);
            expect(r.failed).toBe(1);
            expect(r.errors?.[0].error).toBe('Unknown error');
        });
    });

    describe('sendVoiceMessage', () => {
        test('throws when client missing', async () => {
            await expect(sendVoiceMessage(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });
        test('sends voice', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 1 });
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendVoiceMessage(ctx, { chatId: 'c', url: 'http://x', duration: 5 } as any);
            expect(r).toEqual({ id: 1 });
        });
        test('rethrows on error', async () => {
            downloadFileFromUrlMock.mockRejectedValue(new Error('dl'));
            const ctx = makeCtx({ uploadFile: jest.fn(), invoke: jest.fn() });
            await expect(sendVoiceMessage(ctx, { chatId: 'c', url: 'http://x' } as any)).rejects.toThrow('dl');
        });
        test('defaults duration to 0 when not provided', async () => {
            // Voice note sent without a measured duration -> attribute duration 0.
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 9 });
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendVoiceMessage(ctx, { chatId: 'c', url: 'http://x' } as any);
            expect(r).toEqual({ id: 9 });
        });
    });

    describe('cleanupChat', () => {
        test('throws when client missing', async () => {
            await expect(cleanupChat(makeCtx(null), { chatId: 'c' })).rejects.toThrow('Client not initialized');
        });
        test('deletes filtered messages', async () => {
            const msgs = [
                makeMessage({ id: 1, pinned: true, media: undefined }),
                makeMessage({ id: 2, pinned: false, media: {} }),
                makeMessage({ id: 3, pinned: false, media: undefined }),
            ];
            const getMessages = jest.fn().mockResolvedValue(msgs);
            const deleteMessages = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ getMessages, deleteMessages });
            const r = await cleanupChat(ctx, { chatId: 'c', excludePinned: true, onlyMedia: true, beforeDate: new Date() });
            expect(r.deletedCount).toBe(1);
            expect(deleteMessages).toHaveBeenCalled();
        });
        test('nothing to delete', async () => {
            const getMessages = jest.fn().mockResolvedValue([]);
            const deleteMessages = jest.fn();
            const ctx = makeCtx({ getMessages, deleteMessages });
            const r = await cleanupChat(ctx, { chatId: 'c' });
            expect(r.deletedCount).toBe(0);
            expect(deleteMessages).not.toHaveBeenCalled();
        });
        test('honors explicit revoke=false (delete only for self)', async () => {
            // Caller explicitly requests a non-revoking cleanup -> the provided
            // revoke flag is respected instead of defaulting to true.
            const msgs = [makeMessage({ id: 1, pinned: false, media: {} })];
            const getMessages = jest.fn().mockResolvedValue(msgs);
            const deleteMessages = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ getMessages, deleteMessages });
            const r = await cleanupChat(ctx, { chatId: 'c', revoke: false });
            expect(r.deletedCount).toBe(1);
            expect(deleteMessages.mock.calls[0][2]).toEqual({ revoke: false });
        });
    });

    describe('editMessage', () => {
        test('throws when client missing', async () => {
            await expect(editMessage(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });
        test('edits with photo media', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 1 });
            const ctx = makeCtx({ uploadFile, invoke });
            await editMessage(ctx, { chatId: 'c', messageId: 1, text: 't', media: { type: 'photo', url: 'http://x' } } as any);
            expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.EditMessage);
        });
        test('edits with document media', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 1 });
            const ctx = makeCtx({ uploadFile, invoke });
            await editMessage(ctx, { chatId: 'c', messageId: 1, media: { type: 'document', url: 'http://x' } } as any);
            expect(invoke).toHaveBeenCalled();
        });
        test('edits text only', async () => {
            const invoke = jest.fn().mockResolvedValue({ id: 1 });
            const ctx = makeCtx({ invoke });
            await editMessage(ctx, { chatId: 'c', messageId: 1, text: 'newtext' } as any);
            expect(invoke).toHaveBeenCalled();
        });
        test('throws when neither text nor media', async () => {
            const ctx = makeCtx({ invoke: jest.fn() });
            await expect(editMessage(ctx, { chatId: 'c', messageId: 1 } as any)).rejects.toThrow('Either text or media');
        });
    });

    describe('sendMediaBatch', () => {
        test('throws when client missing', async () => {
            await expect(sendMediaBatch(makeCtx(null), {} as any)).rejects.toThrow('Client not initialized');
        });
        test('sends multimedia batch', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 1 });
            const ctx = makeCtx({ uploadFile, invoke });
            await sendMediaBatch(ctx, {
                chatId: 'c',
                media: [{ type: 'photo', url: 'http://a' }, { type: 'video', url: 'http://b', fileName: 'v.mp4', caption: 'c' }],
            } as any);
            expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.SendMultiMedia);
        });
    });

    describe('sendViewOnceMedia', () => {
        test('throws when client missing', async () => {
            await expect(sendViewOnceMedia(makeCtx(null), 'c', Buffer.from('x'))).rejects.toThrow('Client is not initialized');
        });
        test('sends view-once photo', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 1 });
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendViewOnceMedia(ctx, 'c', Buffer.from('x'), 'cap', false);
            expect(r).toEqual({ id: 1 });
        });
        test('sends view-once video with filename', async () => {
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 2 });
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendViewOnceMedia(ctx, 'c', Buffer.from('x'), '', true, 'v.mp4');
            expect(r).toEqual({ id: 2 });
        });
        test('rethrows on error', async () => {
            const uploadFile = jest.fn().mockRejectedValue(new Error('up fail'));
            const ctx = makeCtx({ uploadFile, invoke: jest.fn() });
            await expect(sendViewOnceMedia(ctx, 'c', Buffer.from('x'))).rejects.toThrow('up fail');
        });
        test('view-once video without filename auto-generates an mp4 name', async () => {
            // No filename supplied for a self-destructing video -> default name uses
            // the .mp4 extension branch.
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const invoke = jest.fn().mockResolvedValue({ id: 3 });
            const ctx = makeCtx({ uploadFile, invoke });
            const r = await sendViewOnceMedia(ctx, 'c', Buffer.from('x'), 'cap', true);
            expect(r).toEqual({ id: 3 });
            expect(uploadFile.mock.calls[0][0].file.name).toMatch(/\.mp4$/);
        });
    });

    describe('sendPhotoChat / sendFileChat', () => {
        test('sendPhotoChat throws when client missing', async () => {
            await expect(sendPhotoChat(makeCtx(null), 'id', 'u', 'c', 'f')).rejects.toThrow('Client is not initialized');
        });
        test('sendPhotoChat sends', async () => {
            const sendFile = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ sendFile });
            await sendPhotoChat(ctx, 'id', 'http://x', 'cap', 'f.jpg');
            expect(sendFile).toHaveBeenCalled();
        });
        test('sendPhotoChat rethrows', async () => {
            downloadFileFromUrlMock.mockRejectedValue(new Error('dl'));
            const ctx = makeCtx({ sendFile: jest.fn() });
            await expect(sendPhotoChat(ctx, 'id', 'http://x', 'cap', 'f.jpg')).rejects.toThrow('dl');
        });
        test('sendFileChat throws when client missing', async () => {
            await expect(sendFileChat(makeCtx(null), 'id', 'u', 'c', 'f')).rejects.toThrow('Client is not initialized');
        });
        test('sendFileChat sends', async () => {
            const sendFile = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ sendFile });
            await sendFileChat(ctx, 'id', 'http://x', 'cap', 'f.bin');
            expect(sendFile).toHaveBeenCalled();
        });
        test('sendFileChat rethrows', async () => {
            downloadFileFromUrlMock.mockRejectedValue(new Error('dl2'));
            const ctx = makeCtx({ sendFile: jest.fn() });
            await expect(sendFileChat(ctx, 'id', 'http://x', 'cap', 'f.bin')).rejects.toThrow('dl2');
        });
    });

    describe('deleteChat', () => {
        test('deletes history', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ invoke });
            await deleteChat(ctx, { peer: 'c' });
            expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.DeleteHistory);
        });
        test('logs error on failure', async () => {
            const invoke = jest.fn().mockRejectedValue(new Error('del fail'));
            const ctx = makeCtx({ invoke });
            await deleteChat(ctx, { peer: 'c' });
            expect(ctx.logger.error).toHaveBeenCalled();
        });
    });
});
