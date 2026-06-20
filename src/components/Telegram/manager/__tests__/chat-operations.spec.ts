import { Api } from 'telegram';
import bigInt from 'big-integer';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn().mockResolvedValue(undefined),
}));

const downloadFileFromUrlMock = jest.fn().mockResolvedValue(Buffer.from('data'));
jest.mock('../helpers', () => ({
    ...jest.requireActual('../helpers'),
    downloadFileFromUrl: (...args: any[]) => downloadFileFromUrlMock(...args),
}));

import {
    safeGetEntityById, getMe, getchatId,
    getEntity as opGetEntity, getMessages as opGetMessages, getAllChats,
    getMessagesNew, getSelfMSgsInfo, getChatStatistics, getMessageStats,
    getChatMediaCounts, getCallLogStats, getCallLog, getChatCallHistory,
    getChats, updateChatSettings, createChatFolder, getChatFolders,
    getTopPrivateChats, createBot,
} from '../chat-operations';

function makeLogger() {
    return { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
}
function makeCtx(client: any) {
    return { client, phoneNumber: '9990005555', logger: makeLogger() } as any;
}

function makeUser(id: string, overrides: Record<string, unknown> = {}) {
    return Object.assign(Object.create(Api.User.prototype), {
        id: bigInt(id), firstName: 'First', lastName: 'Last', username: 'uname',
        phone: '123', bot: false, status: undefined, ...overrides,
    });
}
function makeChannel(id: string, overrides: Record<string, unknown> = {}) {
    return Object.assign(Object.create(Api.Channel.prototype), {
        id: bigInt(id), title: 'Channel', username: 'chan', participantsCount: 100,
        broadcast: true, ...overrides,
    });
}
function makeChat(id: string, overrides: Record<string, unknown> = {}) {
    return Object.assign(Object.create(Api.Chat.prototype), {
        id: bigInt(id), title: 'Group', participantsCount: 5, ...overrides,
    });
}
// Properties on Api.Message that are getter-only (derived) need defineProperty.
const GETTER_PROPS = new Set(['senderId', 'photo', 'document', 'text']);
function makeMessage(overrides: Record<string, unknown> = {}) {
    const msg = Object.create(Api.Message.prototype);
    const plain: Record<string, unknown> = { id: 1, message: 'hi', date: 1700000000, out: false, media: undefined };
    for (const [k, v] of Object.entries({ ...plain, ...overrides })) {
        if (GETTER_PROPS.has(k)) {
            Object.defineProperty(msg, k, { value: v, writable: true, configurable: true, enumerable: true });
        } else {
            msg[k] = v;
        }
    }
    return msg;
}

// A real MessageMediaPhoto whose photo carries a downloadable 'm' size, so the REAL
// getThumbnailBuffer (media-operations) selects it and downloads via client.downloadMedia.
function makePhotoMedia() {
    const size = Object.assign(Object.create(Api.PhotoSize.prototype), { type: 'm', w: 320, h: 320, size: 1234 });
    const photo = Object.assign(Object.create(Api.Photo.prototype), {
        id: bigInt(1), accessHash: bigInt(2), fileReference: Buffer.alloc(0), dcId: 1, sizes: [size],
    });
    return Object.assign(Object.create(Api.MessageMediaPhoto.prototype), { photo });
}

describe('chat-operations', () => {
    beforeEach(() => {
        downloadFileFromUrlMock.mockClear().mockResolvedValue(Buffer.from('data'));
    });

    describe('safeGetEntityById', () => {
        test('throws when no client', async () => {
            await expect(safeGetEntityById(makeCtx(null), '1')).rejects.toThrow('Client not initialized');
        });
        test('returns entity directly', async () => {
            const getEntity = jest.fn().mockResolvedValue(makeUser('1'));
            const ctx = makeCtx({ getEntity });
            const r = await safeGetEntityById(ctx, '1');
            expect(r).not.toBeNull();
        });
        test('falls back to dialogs and matches by id', async () => {
            const channel = makeChannel('1179403119');
            const ctx = makeCtx({
                getEntity: jest.fn().mockRejectedValue(new Error('fail')),
                iterDialogs: async function* () { yield { entity: channel }; },
            });
            const r = await safeGetEntityById(ctx, '-1001179403119');
            expect(r).toBe(channel);
        });
        test('dialog matches when stored id already has -100 prefix', async () => {
            const entity = makeChannel('100200');
            // make id.toString start with -100
            (entity as any).id = { toString: () => '-100200300' };
            const ctx = makeCtx({
                getEntity: jest.fn().mockRejectedValue(new Error('fail')),
                iterDialogs: async function* () { yield { entity }; },
            });
            const r = await safeGetEntityById(ctx, '200300');
            expect(r).toBe(entity);
        });
        test('returns null when not found in dialogs', async () => {
            const ctx = makeCtx({
                getEntity: jest.fn().mockRejectedValue(new Error('fail')),
                iterDialogs: async function* () { yield { entity: makeUser('99') }; },
            });
            expect(await safeGetEntityById(ctx, '1')).toBeNull();
        });
        // Business scenario: a -100-prefixed dialog id whose channel part does not match the
        // requested id keeps scanning and ultimately returns null.
        test('non-matching -100 prefixed dialog is skipped', async () => {
            const entity = makeChannel('111');
            (entity as any).id = { toString: () => '-100999888' };
            const ctx = makeCtx({
                getEntity: jest.fn().mockRejectedValue(new Error('fail')),
                iterDialogs: async function* () { yield { entity }; },
            });
            expect(await safeGetEntityById(ctx, '123456')).toBeNull();
        });
        test('returns null and logs on dialog iteration error', async () => {
            const ctx = makeCtx({
                getEntity: jest.fn().mockRejectedValue(new Error('fail')),
                iterDialogs: function () { throw new Error('dialog fail'); },
            });
            expect(await safeGetEntityById(ctx, '1')).toBeNull();
            expect(ctx.logger.error).toHaveBeenCalled();
        });
    });

    describe('getMe / getchatId / getEntity', () => {
        test('getMe throws when no client', async () => {
            await expect(getMe(makeCtx(null))).rejects.toThrow('Client is not initialized');
        });
        test('getMe returns user', async () => {
            const ctx = makeCtx({ getMe: jest.fn().mockResolvedValue(makeUser('1')) });
            expect(await getMe(ctx)).not.toBeNull();
        });
        test('getMe rethrows', async () => {
            const ctx = makeCtx({ getMe: jest.fn().mockRejectedValue(new Error('boom')) });
            await expect(getMe(ctx)).rejects.toThrow('boom');
        });
        test('getchatId throws when no client', async () => {
            await expect(getchatId(makeCtx(null), 'u')).rejects.toThrow('Client is not initialized');
        });
        test('getchatId returns input entity', async () => {
            const ctx = makeCtx({ getInputEntity: jest.fn().mockResolvedValue('peer') });
            expect(await getchatId(ctx, 'u')).toBe('peer');
        });
        test('getEntity returns entity', async () => {
            const ctx = makeCtx({ getEntity: jest.fn().mockResolvedValue(makeUser('1')) });
            expect(await opGetEntity(ctx, 'x')).not.toBeNull();
        });
    });

    describe('getMessages', () => {
        test('returns paginated messages with hasMore', async () => {
            const m1 = makeMessage({ id: 5, senderId: bigInt(42), message: 'a' });
            const m2 = makeMessage({ id: 4, senderId: bigInt(42), message: 'b' });
            const getMessages = jest.fn().mockResolvedValue([m1, m2]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(makeUser('42')) });
            const r = await opGetMessages(ctx, 'chat', 1, 0);
            expect(r.pagination.hasMore).toBe(true);
            expect(r.messages.length).toBe(1);
            expect(r.pagination.nextOffsetId).toBe(5);
        });
        test('handles media, reactions, forwards (PeerUser/PeerChannel/fromName)', async () => {
            const reactions = Object.assign(Object.create(Api.MessageReactions.prototype), {
                results: [
                    { reaction: new Api.ReactionEmoji({ emoticon: '👍' }), count: 3 },
                    { reaction: new Api.ReactionCustomEmoji({ documentId: bigInt(9) }), count: 2 },
                    { reaction: { className: 'X', emoticon: '🔥' }, count: 1 },
                    { reaction: new Api.ReactionEmoji({ emoticon: '😀' }), count: 0 },
                ],
            });
            const media = makePhotoMedia();
            const fwdUser = makeMessage({
                id: 10, senderId: bigInt(1), media, photo: media.photo, editDate: 1700000100, pinned: true,
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerUser({ userId: bigInt(1) as any }) }),
                replyTo: new Api.MessageReplyHeader({ replyToMsgId: 3 }),
                groupedId: bigInt(77), views: 100, forwards: 5, reactions,
            });
            // Real getThumbnailBuffer downloads the 'm' size via the (mocked) GramJS downloadMedia.
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('thumb'));
            const getMessages = jest.fn().mockResolvedValue([fwdUser]);
            const getEntity = jest.fn().mockResolvedValue(makeUser('1', { firstName: 'Fwd', lastName: 'User' }));
            const ctx = makeCtx({ getMessages, getEntity, downloadMedia });
            const r = await opGetMessages(ctx, 'chat', 8);
            expect(r.messages[0].reactions).toEqual([
                { reaction: '👍', count: 3 },
                { reaction: 'documentId:9', count: 2 },
                { reaction: '🔥', count: 1 },
            ]);
            expect(r.messages[0].forwardedFrom).toBe('Fwd User');
            expect(r.messages[0].media).not.toBeNull();
            expect(r.messages[0].media?.type).toBe('photo');
            // Real getThumbnailBuffer ran end to end: downloaded the 'm' size and base64-encoded it.
            expect(downloadMedia).toHaveBeenCalled();
            expect(r.messages[0].media?.thumbnail).toBe(
                `data:image/jpeg;base64,${Buffer.from('thumb').toString('base64')}`,
            );
        });
        // Business scenario: reaction objects with missing emoticon/count (partial server data).
        test('reactions with missing emoticon and missing count are normalized', async () => {
            const reactions = Object.assign(Object.create(Api.MessageReactions.prototype), {
                results: [
                    // ReactionEmoji with undefined emoticon -> '' (filtered out, count default 0)
                    { reaction: Object.assign(Object.create(Api.ReactionEmoji.prototype), { emoticon: undefined }), count: undefined },
                    // generic reaction object with emoticon, count missing -> count ?? 0 -> filtered
                    { reaction: { className: 'X', emoticon: '⭐' }, count: undefined },
                    // valid reaction kept
                    { reaction: new Api.ReactionEmoji({ emoticon: '❤️' }), count: 4 },
                ],
            });
            const m = makeMessage({ id: 1, senderId: bigInt(2), reactions });
            const getMessages = jest.fn().mockResolvedValue([m]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(makeUser('2')) });
            const r = await opGetMessages(ctx, 'chat', 8);
            expect(r.messages[0].reactions).toEqual([{ reaction: '❤️', count: 4 }]);
        });
        test('forwarded from channel and fromName', async () => {
            const fwdChannel = makeMessage({
                id: 1, senderId: bigInt(2),
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerChannel({ channelId: bigInt(55) as any }) }),
            });
            const fwdName = makeMessage({
                id: 2, senderId: undefined,
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: undefined, fromName: 'Anon' }),
            });
            const getMessages = jest.fn().mockResolvedValue([fwdChannel, fwdName]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(null) });
            const r = await opGetMessages(ctx, 'chat', 8);
            expect(r.messages[0].forwardedFrom).toBe('55');
            expect(r.messages[1].forwardedFrom).toBe('Anon');
        });
        test('entity resolution failure caches null', async () => {
            const m = makeMessage({ id: 1, senderId: bigInt(3) });
            const getMessages = jest.fn().mockResolvedValue([m]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockRejectedValue(new Error('x')), iterDialogs: async function* () {} });
            const r = await opGetMessages(ctx, 'chat', 8);
            expect((r.messages[0] as any).sender.peerType).toBe('unknown');
        });
        // Business scenario: empty chat — getMessages returns nothing. nextOffsetId falls to 0.
        test('empty history yields zero offset and no messages (default args)', async () => {
            const getMessages = jest.fn().mockResolvedValue([]);
            const ctx = makeCtx({ getMessages });
            const r = await opGetMessages(ctx, 'chat'); // default limit/offsetId
            expect(r.messages).toEqual([]);
            expect(r.pagination.hasMore).toBe(false);
            expect(r.pagination.nextOffsetId).toBe(0);
        });
        // Business scenario: a forwarded message whose origin user resolves but has a blank name —
        // we fall back to the numeric id. Also covers empty text, no date, empty reactions list.
        test('forwarded from a nameless user, blank text, no date, empty reactions', async () => {
            const emptyReactions = Object.assign(Object.create(Api.MessageReactions.prototype), { results: [] });
            const m = makeMessage({
                id: 7, senderId: bigInt(6060), message: '', date: undefined,
                reactions: emptyReactions,
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerUser({ userId: bigInt(6060) as any }) }),
            });
            const getMessages = jest.fn().mockResolvedValue([m]);
            // sender 6060 resolves to a user with blank first/last name
            const getEntity = jest.fn().mockResolvedValue(makeUser('6060', { firstName: '', lastName: '' }));
            const ctx = makeCtx({ getMessages, getEntity, iterDialogs: async function* () {} });
            const r = await opGetMessages(ctx, 'chat', 8);
            expect(r.messages[0].text).toBe('');
            expect(r.messages[0].forwardedFrom).toBe('6060');
            expect(r.messages[0].reactions).toEqual([]);
        });
        // Business scenario: a forwarded header with neither an origin id nor a name — no attribution.
        test('forward header with no fromId and no fromName yields null attribution', async () => {
            const m = makeMessage({
                id: 8, senderId: bigInt(2),
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: undefined, fromName: undefined }),
            });
            const getMessages = jest.fn().mockResolvedValue([m]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(makeUser('2')) });
            const r = await opGetMessages(ctx, 'chat', 8);
            expect(r.messages[0].forwardedFrom).toBeNull();
            expect(r.messages[0].isForwarded).toBe(true);
        });
        // Business scenario: a message forwarded from a user whose account was deleted /
        // is not in our dialogs — entity cache holds null, so we fall back to the numeric id.
        test('forwarded from a user we cannot resolve falls back to numeric id', async () => {
            const fwdUser = makeMessage({
                id: 9, senderId: bigInt(2),
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerUser({ userId: bigInt(4040) as any }) }),
            });
            const getMessages = jest.fn().mockResolvedValue([fwdUser]);
            // sender 2 resolves, but forwarded-from user 4040 is never resolved (not a sender, cache miss)
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(makeUser('2')), iterDialogs: async function* () {} });
            const r = await opGetMessages(ctx, 'chat', 8);
            expect(r.messages[0].forwardedFrom).toBe('4040');
        });
    });

    describe('getAllChats', () => {
        test('throws when no client', async () => {
            await expect(getAllChats(makeCtx(null))).rejects.toThrow('Client is not initialized');
        });
        test('collects chats', async () => {
            const ctx = makeCtx({
                iterDialogs: async function* () {
                    yield { entity: { toJSON: () => ({ id: '1' }) } };
                    yield { entity: { toJSON: () => ({ id: '2' }) } };
                },
            });
            const r = await getAllChats(ctx);
            expect(r.length).toBe(2);
        });
    });

    describe('getMessagesNew', () => {
        test('returns paginated messages', async () => {
            const m = makeMessage({ id: 1, senderId: bigInt(5) });
            const getMessages = jest.fn().mockResolvedValue([m]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(makeUser('5')) });
            const r = await getMessagesNew(ctx, 'chat', 0, 20);
            expect(r.messages.length).toBe(1);
            expect(r.pagination.hasMore).toBe(false);
        });
        // Business scenario: a chat history page containing a photo message and three kinds of
        // forwarded messages (from a known user, from a channel, and an anonymous forward).
        test('handles media and forwards from user, channel and anonymous name', async () => {
            const media = makePhotoMedia();
            const fwdFromUser = makeMessage({
                id: 30, senderId: bigInt(7), media, photo: media.photo,
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerUser({ userId: bigInt(7) as any }) }),
            });
            const fwdFromChannel = makeMessage({
                id: 29, senderId: bigInt(7),
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerChannel({ channelId: bigInt(88) as any }) }),
            });
            const fwdAnon = makeMessage({
                id: 28, senderId: undefined,
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: undefined, fromName: 'Channel Admin' }),
            });
            // Real getThumbnailBuffer downloads the 'm' size via the (mocked) GramJS downloadMedia.
            const downloadMedia = jest.fn().mockResolvedValue(Buffer.from('thumb'));
            const getMessages = jest.fn().mockResolvedValue([fwdFromUser, fwdFromChannel, fwdAnon]);
            const getEntity = jest.fn().mockResolvedValue(makeUser('7', { firstName: 'Origin', lastName: 'Poster' }));
            const ctx = makeCtx({ getMessages, getEntity, downloadMedia, iterDialogs: async function* () {} });
            const r = await getMessagesNew(ctx, 'chat', 0, 20);
            expect(r.messages[0].media).not.toBeNull();
            expect(r.messages[0].media?.thumbnail).toBe(`data:image/jpeg;base64,${Buffer.from('thumb').toString('base64')}`);
            expect(downloadMedia).toHaveBeenCalled();
            expect(r.messages[0].forwardedFrom).toBe('Origin Poster');
            expect(r.messages[1].forwardedFrom).toBe('88');
            expect(r.messages[2].forwardedFrom).toBe('Channel Admin');
        });
        // Business scenario: forwarded from a user not present in our dialogs -> numeric id fallback.
        test('forwarded from unresolved user falls back to numeric id', async () => {
            const fwdUser = makeMessage({
                id: 12, senderId: bigInt(7),
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerUser({ userId: bigInt(5050) as any }) }),
            });
            const getMessages = jest.fn().mockResolvedValue([fwdUser]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(makeUser('7')), iterDialogs: async function* () {} });
            const r = await getMessagesNew(ctx, 'chat', 0, 20);
            expect(r.messages[0].forwardedFrom).toBe('5050');
        });
        // Business scenario: empty chat, default offset/limit args.
        test('empty chat returns zero offset (default args)', async () => {
            const getMessages = jest.fn().mockResolvedValue([]);
            const ctx = makeCtx({ getMessages });
            const r = await getMessagesNew(ctx, 'chat'); // defaults
            expect(r.messages).toEqual([]);
            expect(r.pagination.nextOffsetId).toBe(0);
            expect(r.pagination.hasMore).toBe(false);
        });
        // Business scenario: an edited + pinned + grouped (album) message, and a forward header
        // whose origin id is neither a user nor a channel and carries no name (no attribution).
        test('edited, pinned, grouped message and unattributed forward', async () => {
            const edited = makeMessage({
                id: 40, senderId: bigInt(3), message: 'album item',
                editDate: 1700000500, pinned: true, groupedId: bigInt(123),
            });
            const oddFwd = makeMessage({
                id: 39, senderId: bigInt(3),
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), {
                    fromId: new Api.PeerChat({ chatId: bigInt(7) as any }), fromName: undefined,
                }),
            });
            const getMessages = jest.fn().mockResolvedValue([edited, oddFwd]);
            const ctx = makeCtx({ getMessages, getEntity: jest.fn().mockResolvedValue(makeUser('3')) });
            const r = await getMessagesNew(ctx, 'chat', 0, 20);
            expect(r.messages[0].isEdited).toBe(true);
            expect(r.messages[0].isPinned).toBe(true);
            expect(r.messages[0].groupedId).toBe('123');
            expect(r.messages[1].forwardedFrom).toBeNull();
        });
        // Business scenario: blank text, no date, anonymous forward name, nameless forwarded user.
        test('blank/edge fields are normalized', async () => {
            const emptyReactions = Object.assign(Object.create(Api.MessageReactions.prototype), { results: [] });
            const namelessFwd = makeMessage({
                id: 21, senderId: bigInt(9090), message: '', date: undefined, reactions: emptyReactions,
                fwdFrom: Object.assign(Object.create(Api.MessageFwdHeader.prototype), { fromId: new Api.PeerUser({ userId: bigInt(9090) as any }) }),
            });
            const getMessages = jest.fn().mockResolvedValue([namelessFwd]);
            const getEntity = jest.fn().mockResolvedValue(makeUser('9090', { firstName: '', lastName: '' }));
            const ctx = makeCtx({ getMessages, getEntity, iterDialogs: async function* () {} });
            const r = await getMessagesNew(ctx, 'chat', 0, 20);
            expect(r.messages[0].text).toBe('');
            expect(r.messages[0].forwardedFrom).toBe('9090');
            expect(r.messages[0].reactions).toEqual([]);
        });
    });

    describe('getSelfMSgsInfo', () => {
        test('throws when no client', async () => {
            await expect(getSelfMSgsInfo(makeCtx(null))).rejects.toThrow('Client is not initialized');
        });
        test('aggregates counts and scans for movies', async () => {
            const getMessages = jest.fn(async (peer: any, opts: any) => {
                if (opts.filter instanceof Api.InputMessagesFilterPhotos && opts.fromUser) return { total: 4 };
                if (opts.filter instanceof Api.InputMessagesFilterPhotos) return { total: 10 };
                if (opts.filter instanceof Api.InputMessagesFilterVideo && opts.fromUser) return { total: 2 };
                if (opts.filter instanceof Api.InputMessagesFilterVideo) return { total: 6 };
                return { total: 50 };
            });
            const iterMessages = async function* () {
                yield { text: 'a 1080p movie' };
                yield { text: 'hello' };
            };
            const ctx = makeCtx({ getMessages, iterMessages });
            const r = await getSelfMSgsInfo(ctx, 500);
            expect(r.photoCount).toBe(10);
            expect(r.videoCount).toBe(6);
            expect(r.movieCount).toBe(1);
            expect(r.total).toBe(50);
            expect(r.otherPhotoCount).toBe(6);
        });
        test('rethrows on error', async () => {
            const getMessages = jest.fn().mockImplementation(() => { throw new Error('boom'); });
            const ctx = makeCtx({ getMessages, iterMessages: async function* () {} });
            await expect(getSelfMSgsInfo(ctx)).rejects.toThrow('boom');
        });
        // Business scenario: filtered photo/video count queries hit a flood-wait and reject,
        // but the full message scan still succeeds. Counts degrade to 0, total comes from scan.
        test('filtered count queries that reject degrade to zero', async () => {
            const getMessages = jest.fn().mockRejectedValue(new Error('FLOOD_WAIT_30'));
            const iterMessages = async function* () {
                yield { text: 'a terabox movie 1080' };
                yield { text: 'random chat' };
                yield { text: 'another movie series mkv' };
            };
            const ctx = makeCtx({ getMessages, iterMessages });
            const r = await getSelfMSgsInfo(ctx, 500);
            expect(r.photoCount).toBe(0);
            expect(r.videoCount).toBe(0);
            expect(r.ownPhotoCount).toBe(0);
            // totalBatch rejected too -> total falls back to analyzedMessages from the scan
            expect(r.total).toBe(3);
            expect(r.analyzedMessages).toBe(3);
            expect(r.movieCount).toBe(2);
        });
    });

    describe('getChatStatistics', () => {
        test('throws when no client', async () => {
            await expect(getChatStatistics(makeCtx(null), 'c', 'day')).rejects.toThrow('Client not initialized');
        });
        test('computes stats for mixed message types', async () => {
            const photoMedia = Object.assign(Object.create(Api.MessageMediaPhoto.prototype), {});
            (photoMedia as any).className = 'MessageMediaPhoto';
            const videoDoc = Object.assign(Object.create(Api.Document.prototype), { mimeType: 'video/mp4' });
            const videoMedia = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: videoDoc });
            (videoMedia as any).className = 'MessageMediaDocument';
            const audioDoc = Object.assign(Object.create(Api.Document.prototype), { mimeType: 'audio/ogg' });
            const audioMedia = Object.assign(Object.create(Api.MessageMediaDocument.prototype), { document: audioDoc });
            (audioMedia as any).className = 'MessageMediaDocument';
            const messages = [
                makeMessage({ id: 1, message: 'text', fromId: new Api.PeerUser({ userId: bigInt(1) as any }), date: 1700000000 }),
                makeMessage({ id: 2, media: photoMedia, fromId: new Api.PeerUser({ userId: bigInt(1) as any }), date: 1700000000 }),
                makeMessage({ id: 3, media: videoMedia, fromId: new Api.PeerUser({ userId: bigInt(2) as any }), date: 1700000000 }),
                makeMessage({ id: 4, media: audioMedia, fromId: new Api.PeerChannel({ channelId: bigInt(3) as any }), date: 1700000000 }),
            ];
            const getMessages = jest.fn().mockResolvedValue(messages);
            const getEntity = jest.fn().mockResolvedValue(makeUser('1'));
            const ctx = makeCtx({ getMessages, getEntity, iterDialogs: async function* () {} });
            const r = await getChatStatistics(ctx, 'c', 'week');
            expect(r.totalMessages).toBe(4);
            expect(r.messageTypes.photo).toBe(1);
            expect(r.messageTypes.video).toBe(1);
            expect(r.messageTypes.voice).toBe(1);
            expect(r.topSenders.length).toBeGreaterThan(0);
        });
        test('resolves channel and chat top senders', async () => {
            const messages = [
                makeMessage({ id: 1, message: 't', fromId: new Api.PeerChannel({ channelId: bigInt(5) as any }), date: 1700000000 }),
            ];
            const getMessages = jest.fn().mockResolvedValue(messages);
            const getEntity = jest.fn().mockResolvedValue(makeChannel('5'));
            const ctx = makeCtx({ getMessages, getEntity });
            const r = await getChatStatistics(ctx, 'c', 'month');
            expect(r.topSenders[0].name).toBe('Channel');
        });
        // Business scenario: a legacy basic-group (Api.Chat) is one of the top senders, alongside a
        // chatty user. Ranks senders by message count and resolves the group title.
        test('ranks multiple senders and resolves a basic-group (Chat) sender', async () => {
            // Distinct sender ids so the count sort comparator actually compares two buckets.
            const userPeer = { toString: () => '101' };
            const chatPeer = { toString: () => '202' };
            const messages = [
                makeMessage({ id: 1, message: 'm1', fromId: userPeer, date: 1700000000 }),
                makeMessage({ id: 2, message: 'm2', fromId: userPeer, date: 1700003600 }),
                makeMessage({ id: 3, message: 'm3', fromId: userPeer, date: 1700007200 }),
                makeMessage({ id: 4, message: 'g1', fromId: chatPeer, date: 1700000000 }),
            ];
            const getMessages = jest.fn().mockResolvedValue(messages);
            const getEntity = jest.fn(async (id: any) =>
                id.toString() === '202' ? makeChat('202', { title: 'Family Group' }) : makeUser('101', { firstName: 'Chatty', lastName: '' }));
            const ctx = makeCtx({ getMessages, getEntity, iterDialogs: async function* () {} });
            const r = await getChatStatistics(ctx, 'c', 'day');
            // chatty user accrued 3 messages, the group 1 (exercises the count sort comparator)
            expect(r.topSenders[0].id).toBe('101');
            expect(r.topSenders[0].name).toBe('Chatty');
            expect(r.topSenders[0].count).toBe(3);
            // the basic-group sender resolves its title (Api.Chat branch)
            const group = r.topSenders.find(s => s.id === '202');
            expect(group?.name).toBe('Family Group');
            expect(group?.count).toBe(1);
        });
        // Business scenario: messages with no sender (service/anonymous), plus a nameless user and a
        // titleless channel — names degrade to "Unknown", usernames to null.
        test('handles senderless messages and nameless user/channel senders', async () => {
            const userPeer = { toString: () => '11' };
            const chanPeer = { toString: () => '22' };
            const messages = [
                makeMessage({ id: 1, message: 'a', fromId: undefined, date: 1700000000 }), // no sender -> 362 false
                makeMessage({ id: 2, message: 'b', fromId: userPeer, date: 1700000000 }),
                makeMessage({ id: 3, message: 'c', fromId: chanPeer, date: 1700000000 }),
            ];
            const getMessages = jest.fn().mockResolvedValue(messages);
            const getEntity = jest.fn(async (id: any) =>
                id.toString() === '22'
                    ? makeChannel('22', { title: '', username: undefined })
                    : makeUser('11', { firstName: '', lastName: '', username: undefined }));
            const ctx = makeCtx({ getMessages, getEntity, iterDialogs: async function* () {} });
            const r = await getChatStatistics(ctx, 'c', 'week');
            const user = r.topSenders.find(s => s.id === '11');
            expect(user?.name).toBe('Unknown');
            expect(user?.username).toBeNull();
            const chan = r.topSenders.find(s => s.id === '22');
            expect(chan?.name).toBe('Unknown');
            expect(chan?.username).toBeNull();
        });
    });

    describe('getMessageStats', () => {
        test('throws when no client', async () => {
            await expect(getMessageStats(makeCtx(null), { chatId: 'c', period: 'day' })).rejects.toThrow('Client not initialized');
        });
        test('computes message stats with media and links', async () => {
            const photoMedia = Object.assign(Object.create(Api.MessageMediaPhoto.prototype), {});
            const messages = [
                makeMessage({ id: 1, message: 'check https://x.com link', date: 1700000000 }),
                makeMessage({ id: 2, media: photoMedia, date: 1700000000, fwdFrom: {} }),
            ];
            const getMessages = jest.fn().mockResolvedValue(messages);
            const ctx = makeCtx({ getMessages });
            for (const period of ['day', 'week', 'month'] as const) {
                const r = await getMessageStats(ctx, { chatId: 'c', period });
                expect(r.total).toBe(2);
                expect(r.withLinks).toBe(1);
                expect(r.withMedia).toBe(1);
                expect(r.withForwards).toBe(1);
            }
        });
        // Business scenario: plain text without links and an empty service message (no media, no
        // text) — neither counts toward links; the empty message skips the text branch entirely.
        test('plain text without links and empty service messages', async () => {
            const messages = [
                makeMessage({ id: 1, message: 'just a normal note', date: 1700000000 }),
                makeMessage({ id: 2, message: '', media: undefined, date: 1700000000 }),
            ];
            const getMessages = jest.fn().mockResolvedValue(messages);
            const ctx = makeCtx({ getMessages });
            const r = await getMessageStats(ctx, { chatId: 'c', period: 'day' });
            expect(r.total).toBe(2);
            expect(r.withLinks).toBe(0);
            expect(r.withMedia).toBe(0);
            expect(r.byType.text).toBe(1); // only the non-empty text message
        });
    });

    describe('getChatMediaCounts', () => {
        test('throws when no client', async () => {
            await expect(getChatMediaCounts(makeCtx(null), 'c')).rejects.toThrow('Client not initialized');
        });
        test('returns counts via getInputEntity', async () => {
            const getInputEntity = jest.fn().mockResolvedValue(new Api.InputPeerChat({ chatId: bigInt(1) }));
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.messages.GetSearchCounters) {
                    return [{ count: 1 }, { count: 2 }, { count: 3 }, { count: 4 }, { count: 5 }, { count: 6 }, { count: 7 }, { count: 8 }];
                }
                if (req instanceof Api.messages.GetHistory) return { count: 99 };
                return undefined;
            });
            const ctx = makeCtx({ getInputEntity, invoke });
            const r = await getChatMediaCounts(ctx, 'c');
            expect(r.totalMessages).toBe(99);
            expect(r.photo).toBe(1);
            expect(r.totalMedia).toBe(1 + 2 + 3 + 4 + 5 + 6 + 7);
        });
        test('fallback resolves user entity', async () => {
            const getInputEntity = jest.fn().mockRejectedValue(new Error('fail'));
            const invoke = jest.fn().mockResolvedValue([]);
            const ctx = makeCtx({
                getInputEntity, invoke,
                getEntity: jest.fn().mockResolvedValue(makeUser('5', { accessHash: bigInt(1) })),
            });
            const r = await getChatMediaCounts(ctx, '5');
            expect(r.totalMedia).toBe(0);
        });
        test('fallback channel entity', async () => {
            const getInputEntity = jest.fn().mockRejectedValue(new Error('fail'));
            const ctx = makeCtx({
                getInputEntity, invoke: jest.fn().mockResolvedValue([]),
                getEntity: jest.fn().mockResolvedValue(makeChannel('5', { accessHash: bigInt(1) })),
            });
            const r = await getChatMediaCounts(ctx, '5');
            expect(r).toBeDefined();
        });
        // Business scenario: resolved channel has no access hash (cached partial entity) -> defaults to 0.
        test('fallback channel entity without accessHash defaults to zero', async () => {
            const getInputEntity = jest.fn().mockRejectedValue(new Error('fail'));
            const ctx = makeCtx({
                getInputEntity, invoke: jest.fn().mockResolvedValue([]),
                getEntity: jest.fn().mockResolvedValue(makeChannel('5', { accessHash: undefined })),
                iterDialogs: async function* () {},
            });
            const r = await getChatMediaCounts(ctx, '5');
            expect(r).toBeDefined();
        });
        test('fallback chat entity', async () => {
            const getInputEntity = jest.fn().mockRejectedValue(new Error('fail'));
            const ctx = makeCtx({
                getInputEntity, invoke: jest.fn().mockResolvedValue([]),
                getEntity: jest.fn().mockResolvedValue(makeChat('5')),
            });
            const r = await getChatMediaCounts(ctx, '5');
            expect(r).toBeDefined();
        });
        test('fallback throws when entity unresolved', async () => {
            const getInputEntity = jest.fn().mockRejectedValue(new Error('fail'));
            const ctx = makeCtx({
                getInputEntity, invoke: jest.fn(),
                getEntity: jest.fn().mockRejectedValue(new Error('no')), iterDialogs: async function* () {},
            });
            await expect(getChatMediaCounts(ctx, '5')).rejects.toThrow('Could not resolve entity');
        });
        // Business scenario: the resolved peer is something we cannot build an InputPeer for
        // (e.g. a resolved ChatForbidden / unexpected type) -> explicit unsupported-type error.
        test('fallback throws for an unsupported resolved entity type', async () => {
            const getInputEntity = jest.fn().mockRejectedValue(new Error('fail'));
            const forbidden = Object.assign(Object.create(Api.ChatForbidden.prototype), { id: bigInt(9) });
            const ctx = makeCtx({
                getInputEntity, invoke: jest.fn(),
                getEntity: jest.fn().mockResolvedValue(forbidden), iterDialogs: async function* () {},
            });
            await expect(getChatMediaCounts(ctx, '9')).rejects.toThrow('Unsupported entity type');
        });
        // Business scenario: GetSearchCounters fails (e.g. CHAT_ADMIN_REQUIRED on a restricted peer)
        // but history count still succeeds. Media counters degrade to zero, totalMessages preserved.
        test('search counters failure degrades media counts to zero', async () => {
            const getInputEntity = jest.fn().mockResolvedValue(new Api.InputPeerChat({ chatId: bigInt(1) }));
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.messages.GetSearchCounters) throw new Error('CHAT_ADMIN_REQUIRED');
                if (req instanceof Api.messages.GetHistory) return { count: 42 };
                return undefined;
            });
            const ctx = makeCtx({ getInputEntity, invoke });
            const r = await getChatMediaCounts(ctx, 'c');
            expect(r.totalMessages).toBe(42);
            expect(r.totalMedia).toBe(0);
            expect(r.photo).toBe(0);
        });
    });

    describe('getCallLog / getCallLogStats / getChatCallHistory', () => {
        function callMessage(id: number, peerId: any, opts: Record<string, unknown> = {}) {
            const action = Object.assign(Object.create(Api.MessageActionPhoneCall.prototype), {
                reason: opts.reason, duration: opts.duration ?? 60, video: opts.video ?? false,
            });
            return Object.assign(Object.create(Api.Message.prototype), {
                id, peerId, out: opts.out ?? false, date: 1700000000, action,
            });
        }
        test('getCallLog buckets calls by chat with various reasons', async () => {
            const messages = [
                callMessage(1, new Api.PeerUser({ userId: bigInt(10) as any }), { reason: new Api.PhoneCallDiscardReasonMissed(), out: true }),
                callMessage(2, new Api.PeerChat({ chatId: bigInt(20) as any }), { reason: new Api.PhoneCallDiscardReasonBusy() }),
                callMessage(3, new Api.PeerChannel({ channelId: bigInt(30) as any }), { reason: new Api.PhoneCallDiscardReasonHangup(), video: true }),
                callMessage(4, new Api.PeerUser({ userId: bigInt(10) as any }), { reason: new Api.PhoneCallDiscardReasonDisconnect() }),
                callMessage(5, new Api.PeerUser({ userId: bigInt(11) as any }), { reason: undefined, duration: 30 }),
            ];
            let call = 0;
            const invoke = jest.fn(async () => {
                call++;
                const result = Object.assign(Object.create(Api.messages.Messages.prototype), {
                    messages: call === 1 ? messages : [],
                });
                return result;
            });
            const ctx = makeCtx({ invoke });
            const r = await getCallLog(ctx, 2000);
            expect(Object.keys(r)).toContain('10');
            expect(r['10'].length).toBe(2);
        });
        test('getCallLogStats aggregates', async () => {
            const messages = [
                callMessage(1, new Api.PeerUser({ userId: bigInt(10) as any }), { out: true, video: true }),
            ];
            let call = 0;
            const invoke = jest.fn(async () => {
                call++;
                return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: call === 1 ? messages : [] });
            });
            const ctx = makeCtx({ invoke });
            const r = await getCallLogStats(ctx, 10);
            expect(r.totalCalls).toBe(1);
            expect(r.outgoing).toBe(1);
            expect(r.video).toBe(1);
        });
        test('getCallLogStats throws when no client', async () => {
            await expect(getCallLogStats(makeCtx(null))).rejects.toThrow('Client not initialized');
        });
        test('getChatCallHistory returns summary with calls', async () => {
            const messages = [
                callMessage(1, new Api.PeerUser({ userId: bigInt(10) as any }), { out: false }),
                // missed and busy calls exercise the missed-counter branch in buildCallSummary
                callMessage(2, new Api.PeerUser({ userId: bigInt(10) as any }), { out: true, reason: new Api.PhoneCallDiscardReasonMissed(), duration: 0 }),
                callMessage(3, new Api.PeerUser({ userId: bigInt(10) as any }), { out: false, reason: new Api.PhoneCallDiscardReasonBusy(), duration: 0, video: true }),
            ];
            let call = 0;
            const invoke = jest.fn(async () => {
                call++;
                return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: call === 1 ? messages : [] });
            });
            const ctx = makeCtx({ invoke });
            const r = await getChatCallHistory(ctx, '10', 100, true);
            expect(r.totalCalls).toBe(3);
            expect(r.missed).toBe(2);
            expect(r.calls).toBeDefined();
        });
        test('getChatCallHistory throws when no client', async () => {
            await expect(getChatCallHistory(makeCtx(null), 'c')).rejects.toThrow('Client not initialized');
        });
        // Business scenario: requesting call history for a chat that has never had a call — summary
        // is all zeros, lastCallDate null, and (default) the detailed calls array is omitted.
        test('getChatCallHistory for a chat with no calls returns empty summary without calls array', async () => {
            const otherChatCall = callMessage(1, new Api.PeerUser({ userId: bigInt(10) as any }), { out: false });
            let call = 0;
            const invoke = jest.fn(async () => {
                call++;
                return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: call === 1 ? [otherChatCall] : [] });
            });
            const ctx = makeCtx({ invoke });
            const r = await getChatCallHistory(ctx, '999'); // default includeCalls=false
            expect(r.totalCalls).toBe(0);
            expect(r.averageDuration).toBe(0);
            expect(r.lastCallDate).toBeNull();
            expect((r as { calls?: unknown }).calls).toBeUndefined();
        });
        test('getCallLog skips non-call messages and empty result', async () => {
            const invoke = jest.fn().mockResolvedValue(Object.assign(Object.create(Api.messages.Messages.prototype), { messages: [] }));
            const ctx = makeCtx({ invoke });
            const r = await getCallLog(ctx, 100);
            expect(r).toEqual({});
        });
        // Business scenario: a call whose peer type is unrecognized (no user/chat/channel id) is
        // skipped, and a call with no discard reason and zero duration is classified "unknown".
        test('getCallLog skips unrecognized peers and classifies unknown-reason calls', async () => {
            const noPeer = callMessage(7, undefined, { reason: undefined, duration: 0 });
            const unknownReason = callMessage(8, new Api.PeerUser({ userId: bigInt(40) as any }), { reason: undefined, duration: 0 });
            let call = 0;
            const invoke = jest.fn(async () => {
                call++;
                return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: call === 1 ? [noPeer, unknownReason] : [] });
            });
            const ctx = makeCtx({ invoke });
            const r = await getCallLog(ctx, 100);
            // the no-peer call is dropped; the unknown-reason call is bucketed under user 40
            expect(Object.keys(r)).toEqual(['40']);
            expect(r['40'][0].reason).toBe('unknown');
        });
        // Business scenario: an account with a long call history. The first page returns a full
        // chunk (200), so we must paginate: advance offsetId past the last id and fetch again.
        test('getCallLog paginates when a full chunk is returned', async () => {
            const fullChunk = Array.from({ length: 200 }, (_, i) =>
                callMessage(1000 - i, new Api.PeerUser({ userId: bigInt(10) as any }), { reason: new Api.PhoneCallDiscardReasonHangup() }));
            let call = 0;
            let secondOffsetId: number | undefined;
            const invoke = jest.fn(async (req: any) => {
                call++;
                if (call === 2) secondOffsetId = (req as Api.messages.Search).offsetId;
                return Object.assign(Object.create(Api.messages.Messages.prototype), {
                    messages: call === 1 ? fullChunk : [],
                });
            });
            const ctx = makeCtx({ invoke });
            const r = await getCallLog(ctx, 2000);
            expect(invoke).toHaveBeenCalledTimes(2);
            // offsetId for the second page is the last message id of the first chunk (1000-199 = 801)
            expect(secondOffsetId).toBe(801);
            expect(r['10'].length).toBe(200);
        });
    });

    describe('getChats', () => {
        function dialog(entity: any, opts: Record<string, unknown> = {}) {
            return {
                entity,
                title: opts.title ?? 'Title',
                unreadCount: opts.unreadCount ?? 0,
                message: opts.message,
                dialog: opts.dialogMeta,
                isUser: entity instanceof Api.User,
            };
        }
        test('throws when no client', async () => {
            await expect(getChats(makeCtx(null), {})).rejects.toThrow('Client not initialized');
        });
        test('returns chat list with filters and photos', async () => {
            const me = makeUser('1');
            const user = makeUser('2', { status: new Api.UserStatusOnline({ expires: 9999999999 }) });
            const channel = makeChannel('3', { photo: Object.create(Api.ChatPhoto.prototype) });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getEntity: jest.fn().mockResolvedValue(user),
                iterDialogs: async function* () {
                    yield dialog(user, { message: makeMessage({ id: 1, senderId: bigInt(2), date: 1700000000 }), dialogMeta: { notifySettings: { muteUntil: 0 } } });
                    yield dialog(channel, { message: makeMessage({ id: 2, senderId: bigInt(3), date: 1700000000 }) });
                },
                downloadProfilePhoto: jest.fn().mockResolvedValue(Buffer.from('photo')),
            });
            const r = await getChats(ctx, { limit: 100, includePhotos: true, peerType: 'all' });
            expect(r.items.length).toBe(2);
            expect(r.items[0].onlineStatus).toBe('online');
        });
        test('skips system chats and applies user peerType filter', async () => {
            const me = makeUser('1');
            const sys = makeUser('777000');
            const user = makeUser('2');
            const channel = makeChannel('3');
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getEntity: jest.fn().mockResolvedValue(user),
                iterDialogs: async function* () {
                    yield dialog(sys);
                    yield dialog(user, { message: makeMessage({ senderId: bigInt(2) }) });
                    yield dialog(channel, { message: makeMessage({ senderId: bigInt(3) }) });
                },
            });
            const r = await getChats(ctx, { limit: 100, peerType: 'user', offsetDate: 100, archived: true });
            expect(r.items.every(i => i.type === 'user')).toBe(true);
        });
        test('self message sender labeled (Self)', async () => {
            const me = makeUser('1');
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getEntity: jest.fn(),
                iterDialogs: async function* () {
                    yield dialog(me, { message: makeMessage({ senderId: bigInt(1), date: 1700000000 }) });
                },
            });
            const r = await getChats(ctx, { limit: 100 });
            expect(r.items[0].title).toContain('(Self)');
        });
        // Business scenario: a 1:1 user chat whose last-message sender id no longer resolves to a
        // User (deleted/blocked peer) — sender name shows "Unknown" rather than crashing.
        test('user chat with unresolvable last-message sender shows Unknown', async () => {
            const me = makeUser('1');
            const user = makeUser('2');
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                // safeGetEntityById resolves to a non-User (channel) -> hits the else "Unknown" branch
                getEntity: jest.fn().mockResolvedValue(makeChannel('999')),
                iterDialogs: async function* () {
                    yield dialog(user, { message: makeMessage({ senderId: bigInt(2), date: 1700000000 }) });
                },
            });
            const r = await getChats(ctx, { limit: 100, peerType: 'user' });
            expect(r.items[0].lastMessage?.senderName).toBe('Unknown');
        });
        // Business scenario: the last-message sender id is corrupt/unreadable (throws on access) —
        // the whole sender-resolution block is guarded, falling back to "Unknown".
        test('sender resolution error is caught and labeled Unknown', async () => {
            const me = makeUser('1');
            const user = makeUser('2');
            const corruptSenderId = { toString: () => { throw new Error('corrupt peer'); } };
            const msg = makeMessage({ date: 1700000000, senderId: corruptSenderId });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getEntity: jest.fn(),
                iterDialogs: async function* () {
                    yield dialog(user, { message: msg });
                },
            });
            const r = await getChats(ctx, { limit: 100, peerType: 'user' });
            expect(r.items[0].lastMessage?.senderName).toBe('Unknown');
        });
        // Business scenario: paginated dialog list (more dialogs than the requested limit) with a
        // muted channel that has no participant count, an empty photo download, and a dialog with no
        // last message. Verifies pagination cursor (nextOffsetDate), mute flag and photo handling.
        test('pagination cursor, muted channel, empty photo and no-message dialog', async () => {
            const me = makeUser('1');
            const futureMute = Math.floor(Date.now() / 1000) + 100000;
            const channelA = makeChannel('3', { participantsCount: undefined, photo: Object.create(Api.ChatPhoto.prototype) });
            const channelB = makeChannel('4', { photo: Object.create(Api.ChatPhoto.prototype) });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getEntity: jest.fn(),
                // empty buffer -> photoBase64 stays null (length check false)
                downloadProfilePhoto: jest.fn().mockResolvedValue(Buffer.alloc(0)),
                iterDialogs: async function* () {
                    yield dialog(channelA, { dialogMeta: { notifySettings: { muteUntil: futureMute } }, message: makeMessage({ id: 1, date: 1700000000 }) });
                    yield dialog(channelB, { message: undefined }); // no last message
                },
            });
            const r = await getChats(ctx, { limit: 1, includePhotos: true, peerType: 'channel' });
            expect(r.items.length).toBe(1);
            expect(r.items[0].isMuted).toBe(true);
            expect(r.items[0].participantCount).toBeNull();
            expect(r.items[0].photoBase64).toBeNull();
            expect(r.hasMore).toBe(true);
            expect(r.nextOffsetDate).toBe(1700000000);
        });
        // Business scenario: a non-chat/non-channel/non-user dialog entity (unknown type) and a
        // dialog whose title is empty so the title falls back to the entity's title field.
        test('unknown entity type and title fallback', async () => {
            const me = makeUser('1');
            const unknownEntity = Object.assign(Object.create(Api.ChatForbidden.prototype), { id: bigInt(50), title: 'Forbidden Chat' });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getEntity: jest.fn(),
                iterDialogs: async function* () {
                    yield dialog(unknownEntity, { title: '', message: undefined });
                },
            });
            const r = await getChats(ctx, { limit: 100, peerType: 'all' });
            expect(r.items[0].type).toBe('unknown');
            expect(r.items[0].title).toBe('Forbidden Chat');
        });
        // Business scenario: a legacy basic group (Api.Chat) in the dialog list — participant count
        // is read from the Chat entity, and the group-type sender name uses the dialog title.
        test('basic group reports participant count and group sender name', async () => {
            const me = makeUser('1');
            const group = makeChat('300', { participantsCount: 12 });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getEntity: jest.fn(),
                iterDialogs: async function* () {
                    yield dialog(group, { title: 'Project Chat', message: makeMessage({ senderId: bigInt(50), date: 1700000000 }) });
                },
            });
            const r = await getChats(ctx, { limit: 100, peerType: 'group' });
            expect(r.items[0].type).toBe('group');
            expect(r.items[0].participantCount).toBe(12);
            expect(r.items[0].lastMessage?.senderName).toBe('Project Chat');
        });
    });

    describe('updateChatSettings', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());
        async function runWithTimers<T>(p: Promise<T>): Promise<T> {
            await jest.runAllTimersAsync();
            return p;
        }
        test('throws when no client', async () => {
            await expect(updateChatSettings(makeCtx(null), { chatId: 'c' })).rejects.toThrow('Client not initialized');
        });
        test('applies all settings', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const uploadFile = jest.fn().mockResolvedValue({ id: 'f' });
            const getEntity = jest.fn().mockResolvedValue(makeChannel('1'));
            const ctx = makeCtx({ invoke, uploadFile, getEntity });
            const r = await runWithTimers(updateChatSettings(ctx, {
                chatId: 'c', title: 'T', about: 'A', photo: 'http://x',
                slowMode: 30, linkedChat: 'l', username: 'u',
            }));
            expect(r).toBe(true);
            expect(invoke).toHaveBeenCalled();
        });
        test('minimal update', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ invoke, getEntity: jest.fn().mockResolvedValue(makeChannel('1')) });
            const r = await runWithTimers(updateChatSettings(ctx, { chatId: 'c', slowMode: 0 }));
            expect(r).toBe(true);
        });
        // Business scenario: a no-op settings call (only chatId) — slowMode is undefined so the
        // slow-mode toggle is skipped entirely; nothing is invoked but it still succeeds.
        test('no-op when only chatId provided', async () => {
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ invoke, getEntity: jest.fn().mockResolvedValue(makeChannel('1')) });
            const r = await runWithTimers(updateChatSettings(ctx, { chatId: 'c' }));
            expect(r).toBe(true);
            expect(invoke).not.toHaveBeenCalled();
        });
    });

    describe('createChatFolder / getChatFolders', () => {
        test('createChatFolder throws when no client', async () => {
            await expect(createChatFolder(makeCtx(null), { name: 'f', includedChats: [] })).rejects.toThrow('Client not initialized');
        });
        test('creates folder', async () => {
            const getInputEntity = jest.fn().mockResolvedValue('peer');
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ getInputEntity, invoke });
            const r = await createChatFolder(ctx, {
                name: 'My Folder', includedChats: ['1'], excludedChats: ['2'],
            });
            expect(r.name).toBe('My Folder');
            expect(invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.UpdateDialogFilter);
        });
        // Business scenario: create a folder specifying only included chats, overriding the include
        // flags to false — exercises the excludedChats default ([]) and explicit flag overrides.
        test('creates folder with no excluded chats and overridden flags', async () => {
            const getInputEntity = jest.fn().mockResolvedValue('peer');
            const invoke = jest.fn().mockResolvedValue(undefined);
            const ctx = makeCtx({ getInputEntity, invoke });
            const r = await createChatFolder(ctx, {
                name: 'Tight', includedChats: ['1'],
                includeContacts: false, includeNonContacts: false, includeGroups: false,
                includeBroadcasts: false, includeBots: false,
                excludeMuted: true, excludeRead: true, excludeArchived: true,
            });
            expect(r.options.includeContacts).toBe(false);
            expect(r.options.excludeMuted).toBe(true);
        });
        test('getChatFolders throws when no client', async () => {
            await expect(getChatFolders(makeCtx(null))).rejects.toThrow('Client not initialized');
        });
        test('lists folders', async () => {
            const filter = Object.assign(Object.create(Api.DialogFilter.prototype), {
                id: 2, title: 'Work', includePeers: ['a'], excludePeers: [],
            });
            const invoke = jest.fn().mockResolvedValue({ filters: [filter] });
            const ctx = makeCtx({ invoke });
            const r = await getChatFolders(ctx);
            expect(r[0].id).toBe(2);
            expect(r[0].includedChatsCount).toBe(1);
        });
        // Business scenario: the default "All chats" filter has no id/title and non-array peer
        // fields — every field falls back to its default (0 / '' / 0 counts). Also covers the
        // empty `filters` list.
        test('lists folders with missing fields and handles empty filter set', async () => {
            const bareFilter = Object.assign(Object.create(Api.DialogFilter.prototype), {
                id: undefined, title: undefined, includePeers: undefined, excludePeers: undefined,
            });
            const invoke = jest.fn()
                .mockResolvedValueOnce({ filters: [bareFilter] })
                .mockResolvedValueOnce({ filters: undefined });
            const ctx = makeCtx({ invoke });
            const r1 = await getChatFolders(ctx);
            expect(r1[0].id).toBe(0);
            expect(r1[0].title).toBe('');
            expect(r1[0].includedChatsCount).toBe(0);
            expect(r1[0].excludedChatsCount).toBe(0);
            const r2 = await getChatFolders(ctx);
            expect(r2).toEqual([]);
        });
    });

    describe('getTopPrivateChats', () => {
        test('throws when no client', async () => {
            await expect(getTopPrivateChats(makeCtx(null))).rejects.toThrow('Client not initialized');
        });
        test('throws when self not fetched', async () => {
            const ctx = makeCtx({ getMe: jest.fn().mockRejectedValue(new Error('no me')) });
            await expect(getTopPrivateChats(ctx)).rejects.toThrow('Failed to fetch self userInfo');
        });
        test('builds top private chats (no enrich)', async () => {
            const me = makeUser('1');
            const user = makeUser('2', { firstName: 'Active', lastName: 'User' });
            const dialogUser = { isUser: true, entity: user, message: { date: 1700000000 } };
            const getMessages = jest.fn().mockResolvedValue(Object.assign([makeMessage({ date: 1700000000 })], { total: 20 }));
            let searchCall = 0;
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.messages.Search) {
                    searchCall++;
                    return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: [] });
                }
                return undefined;
            });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getMessages, invoke,
                iterDialogs: async function* () { yield dialogUser; },
            });
            const r = await getTopPrivateChats(ctx, 45, false);
            expect(r.items.length).toBeGreaterThanOrEqual(1);
            expect(r.items.find(i => i.name === 'Active User')).toBeDefined();
        });
        test('enrichMedia path with call entries', async () => {
            const me = makeUser('1');
            const user = makeUser('2');
            const dialogUser = { isUser: true, entity: user, message: { date: 1700000000 } };
            const getMessages = jest.fn().mockResolvedValue(Object.assign([makeMessage({ date: 1700000000 })], { total: 20 }));
            const callAction = Object.assign(Object.create(Api.MessageActionPhoneCall.prototype), { duration: 30, video: false, reason: new Api.PhoneCallDiscardReasonHangup() });
            const callMsg = Object.assign(Object.create(Api.Message.prototype), {
                id: 1, peerId: new Api.PeerUser({ userId: bigInt(2) as any }), out: false, date: 1700000000, action: callAction,
            });
            let searchCall = 0;
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.messages.Search) {
                    searchCall++;
                    return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: searchCall === 1 ? [callMsg] : [] });
                }
                if (req instanceof Api.messages.GetSearchCounters) return [{ count: 1 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];
                if (req instanceof Api.messages.GetHistory) return { count: 20 };
                return undefined;
            });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getMessages, invoke,
                getInputEntity: jest.fn().mockResolvedValue(new Api.InputPeerUser({ userId: bigInt(2), accessHash: bigInt(1) })),
                iterDialogs: async function* () { yield dialogUser; },
            });
            const r = await getTopPrivateChats(ctx, 45, true, undefined, new Set(['999']));
            expect(r.items.length).toBeGreaterThanOrEqual(1);
        });
        test('skips bots, self, and low-activity chats', async () => {
            const me = makeUser('1');
            const bot = makeUser('5', { bot: true });
            const lowUser = makeUser('6');
            // message-count query returns total 2; media-count query (with filter) returns 0
            const getMessages = jest.fn(async (peer: any, opts: any) =>
                opts?.filter ? Object.assign([], { total: 0 }) : Object.assign([], { total: 2 }));
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.messages.Search) return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: [] });
                return undefined;
            });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getMessages, invoke,
                iterDialogs: async function* () {
                    yield { isUser: true, entity: bot, message: { date: 1700000000 } };
                    yield { isUser: true, entity: lowUser, message: { date: 1700000000 } };
                },
            });
            const r = await getTopPrivateChats(ctx, 45, false, 1700000000);
            // low-activity user filtered out (total<10, no calls)
            expect(r.items.length).toBe(0);
        });
        // Business scenario: a low-message chat WITH no call history is short-circuited and skipped
        // during the media pass, while a low-message chat that DID have calls is retained.
        test('low-message no-call chat is skipped; low-message chat with calls is kept', async () => {
            const me = makeUser('1');
            const lowNoCall = makeUser('6');
            const lowWithCall = makeUser('7');
            // Both chats have only 2 messages.
            const getMessages = jest.fn(async () => Object.assign([makeMessage({ date: 1700000000 })], { total: 2 }));
            // A call exists with chat 7 so callCountsByChat['7'].totalCalls === 1 -> not skipped.
            const callAction = Object.assign(Object.create(Api.MessageActionPhoneCall.prototype), { duration: 45, video: false, reason: new Api.PhoneCallDiscardReasonHangup() });
            const callMsg = Object.assign(Object.create(Api.Message.prototype), {
                id: 1, peerId: new Api.PeerUser({ userId: bigInt(7) as any }), out: true, date: 1700000000, action: callAction,
            });
            let searchCall = 0;
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.messages.Search) {
                    searchCall++;
                    return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: searchCall === 1 ? [callMsg] : [] });
                }
                return undefined;
            });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getMessages, invoke,
                iterDialogs: async function* () {
                    yield { isUser: true, entity: lowNoCall, message: { date: 1700000000 } };
                    yield { isUser: true, entity: lowWithCall, message: { date: 1700000000 } };
                },
            });
            const r = await getTopPrivateChats(ctx, 45, false, 1700000000);
            // chat 7 retained because it had a call (totalCalls >= 1)
            expect(r.items.some(i => i.chatId === '7')).toBe(true);
            // chat 6 skipped (low messages, no calls)
            expect(r.items.some(i => i.chatId === '6')).toBe(false);
        });
        // Business scenario: fetching message totals for one chat throws (e.g. CHANNEL_PRIVATE /
        // flood) — the per-chat error is caught, that chat is recorded null and others proceed.
        test('per-chat message fetch error is caught and chat dropped', async () => {
            const me = makeUser('1');
            const badUser = makeUser('8');
            const getMessages = jest.fn(async () => { throw new Error('CHANNEL_PRIVATE'); });
            const invoke = jest.fn(async (req: any) =>
                req instanceof Api.messages.Search ? Object.assign(Object.create(Api.messages.Messages.prototype), { messages: [] }) : undefined);
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getMessages, invoke,
                iterDialogs: async function* () { yield { isUser: true, entity: badUser, message: { date: 1700000000 } }; },
            });
            const r = await getTopPrivateChats(ctx, 45, false, 1700000000);
            expect(r.items.length).toBe(0);
            expect(ctx.logger.warn).toHaveBeenCalled();
        });
        // Business scenario: global call scan spans multiple pages (full 200-chunk) and includes
        // a disconnected call and a no-reason call with a non-zero duration (treated as hangup).
        test('global call scan paginates and classifies disconnect / duration-only reasons', async () => {
            const me = makeUser('1');
            const user = makeUser('9');
            const mkCall = (id: number, opts: Record<string, any>) => {
                const action = Object.assign(Object.create(Api.MessageActionPhoneCall.prototype), {
                    duration: opts.duration ?? 0, video: opts.video ?? false, reason: opts.reason,
                });
                return Object.assign(Object.create(Api.Message.prototype), {
                    id, peerId: new Api.PeerUser({ userId: bigInt(9) as any }), out: !!opts.out, date: 1700000000, action,
                });
            };
            // First page: full 200-chunk -> forces pagination. Mix in disconnect + duration-only calls.
            const firstChunk = Array.from({ length: 200 }, (_, i) => {
                if (i === 0) return mkCall(2000, { reason: new Api.PhoneCallDiscardReasonDisconnect(), video: true });
                if (i === 1) return mkCall(1999, { duration: 30 }); // no reason, duration>0 -> hangup
                return mkCall(2000 - i, { reason: new Api.PhoneCallDiscardReasonHangup() });
            });
            const getMessages = jest.fn(async () => Object.assign([makeMessage({ date: 1700000000 })], { total: 20 }));
            let searchCall = 0;
            let secondOffsetId: number | undefined;
            const invoke = jest.fn(async (req: any) => {
                if (req instanceof Api.messages.Search) {
                    searchCall++;
                    if (searchCall === 2) secondOffsetId = (req as Api.messages.Search).offsetId;
                    return Object.assign(Object.create(Api.messages.Messages.prototype), { messages: searchCall === 1 ? firstChunk : [] });
                }
                return undefined;
            });
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getMessages, invoke,
                iterDialogs: async function* () { yield { isUser: true, entity: user, message: { date: 1700000000 } }; },
            });
            const r = await getTopPrivateChats(ctx, 45, false);
            // paginated: second Search advanced past the last id of the first chunk
            expect(secondOffsetId).toBe(2000 - 199);
            expect(r.items.some(i => i.chatId === '9')).toBe(true);
        });
        // Business scenario: enrichMedia=true but fetching detailed media counts for a chat fails
        // (peer no longer resolvable). The failure is caught/logged and the chat still appears.
        test('enrichMedia media-count failure is caught and logged', async () => {
            const me = makeUser('1');
            const user = makeUser('2', { firstName: 'Enrich', lastName: 'Me' });
            const getMessages = jest.fn().mockResolvedValue(Object.assign([makeMessage({ date: 1700000000 })], { total: 20 }));
            const invoke = jest.fn(async (req: any) =>
                req instanceof Api.messages.Search ? Object.assign(Object.create(Api.messages.Messages.prototype), { messages: [] }) : undefined);
            const ctx = makeCtx({
                getMe: jest.fn().mockResolvedValue(me),
                getMessages, invoke,
                // getChatMediaCounts: getInputEntity rejects AND safeGetEntityById can't resolve -> throws
                getInputEntity: jest.fn().mockRejectedValue(new Error('fail')),
                getEntity: jest.fn().mockRejectedValue(new Error('gone')),
                iterDialogs: async function* () { yield { isUser: true, entity: user, message: { date: 1700000000 } }; },
            });
            const r = await getTopPrivateChats(ctx, 45, true);
            expect(r.items.some(i => i.name === 'Enrich Me')).toBe(true);
            expect(ctx.logger.warn).toHaveBeenCalledWith(ctx.phoneNumber, expect.stringContaining('Failed to fetch media counts'));
        });
    });

    describe('createBot', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        async function runWithTimers<T>(p: Promise<T>): Promise<T> {
            await jest.runAllTimersAsync();
            return p;
        }

        test('throws when no client', async () => {
            await expect(createBot(makeCtx(null), { name: 'B', username: 'b_bot' })).rejects.toThrow('Client not initialized');
        });
        test('creates bot with token, description, about, photo', async () => {
            const entity = makeUser('1000');
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            const sendFile = jest.fn().mockResolvedValue(undefined);
            const getMessages = jest.fn().mockResolvedValue([{ message: 'Done! Use this token 123456:ABCdefGHI to access' }]);
            const ctx = makeCtx({
                getEntity: jest.fn().mockResolvedValue(entity),
                sendMessage, sendFile, getMessages,
            });
            const r = await runWithTimers(createBot(ctx, {
                name: 'MyBot', username: 'mybot_bot', description: 'desc', aboutText: 'about', profilePhotoUrl: 'http://x',
            }));
            expect(r.botToken).toBe('123456:ABCdefGHI');
            expect(r.username).toBe('mybot_bot');
        });
        test('modifies username when not ending in _bot', async () => {
            const sendMessage = jest.fn().mockResolvedValue(undefined);
            const getMessages = jest.fn().mockResolvedValue([{ message: 'use this token 999:XYZ now' }]);
            const ctx = makeCtx({
                getEntity: jest.fn().mockResolvedValue(makeUser('1000')),
                sendMessage, getMessages,
            });
            const r = await runWithTimers(createBot(ctx, { name: 'B', username: 'myname' }));
            expect(r.username).toMatch(/_bot$/);
        });
        test('throws when no response from BotFather', async () => {
            const ctx = makeCtx({
                getEntity: jest.fn().mockResolvedValue(makeUser('1000')),
                sendMessage: jest.fn().mockResolvedValue(undefined),
                getMessages: jest.fn().mockResolvedValue([]),
            });
            const assertion = expect(createBot(ctx, { name: 'B', username: 'b_bot' })).rejects.toThrow(/No response received/);
            await jest.runAllTimersAsync();
            await assertion;
        });
        test('throws when token not in response', async () => {
            const ctx = makeCtx({
                getEntity: jest.fn().mockResolvedValue(makeUser('1000')),
                sendMessage: jest.fn().mockResolvedValue(undefined),
                getMessages: jest.fn().mockResolvedValue([{ message: 'sorry, that name is taken' }]),
            });
            const assertion = expect(createBot(ctx, { name: 'B', username: 'b_bot' })).rejects.toThrow(/Bot creation failed/);
            await jest.runAllTimersAsync();
            await assertion;
        });
        test('photo error is caught and logged', async () => {
            downloadFileFromUrlMock.mockRejectedValue(new Error('photo dl'));
            const ctx = makeCtx({
                getEntity: jest.fn().mockResolvedValue(makeUser('1000')),
                sendMessage: jest.fn().mockResolvedValue(undefined),
                sendFile: jest.fn(),
                getMessages: jest.fn().mockResolvedValue([{ message: 'use this token 1:A now' }]),
            });
            const r = await runWithTimers(createBot(ctx, { name: 'B', username: 'b_bot', profilePhotoUrl: 'http://x' }));
            expect(r.botToken).toBe('1:A');
            expect(ctx.logger.error).toHaveBeenCalled();
        });
    });
});
