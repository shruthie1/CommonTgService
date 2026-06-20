 
/**
 * Tests for TelegramController — a thin HTTP layer over TelegramService.
 * The service is fully stubbed; only HTTP-level parsing/validation, header
 * handling, and streaming orchestration logic in the controller is exercised.
 */

const mockAxios = { head: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));

const mockConnectionManager = { getClient: jest.fn() };
jest.mock('../utils/connection-manager', () => ({ connectionManager: mockConnectionManager }));

const mockRedis = { get: jest.fn(), del: jest.fn(), scan: jest.fn() };
jest.mock('../../../utils/redisClient', () => ({ RedisClient: { getClient: () => mockRedis } }));

jest.mock('../utils/tg-config', () => ({
    getTelegramCredentialPool: jest.fn(() => [{ apiId: 111 }, { apiId: 222 }]),
}));

import { TelegramController } from '../Telegram.controller';
import { BadRequestException } from '@nestjs/common';
import { MediaType, MediaSourceType } from '../dto';

function makeService(): any {
    return {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        disconnectAll: jest.fn().mockResolvedValue(undefined),
        getConnectionStats: jest.fn().mockReturnValue({ total: 1 }),
        getClientState: jest.fn().mockReturnValue({ state: 'connected' }),
        getActiveConnectionCount: jest.fn().mockReturnValue(2),
        getMe: jest.fn().mockResolvedValue({ id: 'me' }),
        getEntity: jest.fn().mockResolvedValue({ id: 'e' }),
        updateNameandBio: jest.fn().mockResolvedValue(undefined),
        setProfilePic: jest.fn().mockResolvedValue('pic'),
        deleteProfilePhotos: jest.fn().mockResolvedValue(undefined),
        getMessages: jest.fn().mockResolvedValue(['m']),
        sendMessage: jest.fn().mockResolvedValue('sent'),
        forwardBulkMessages: jest.fn().mockResolvedValue('fwd'),
        forwardMessage: jest.fn().mockResolvedValue(undefined),
        deleteChat: jest.fn().mockResolvedValue(undefined),
        processBatch: jest.fn().mockResolvedValue({ processed: 1, errors: [] }),
        searchMessages: jest.fn().mockResolvedValue({ messages: [] }),
        getChannelInfo: jest.fn().mockResolvedValue({ ids: [] }),
        forwardMedia: jest.fn().mockResolvedValue('media'),
        leaveChannel: jest.fn().mockResolvedValue('left'),
        updateUsername: jest.fn().mockResolvedValue('newuser'),
        set2Fa: jest.fn().mockResolvedValue('2fa'),
        updatePrivacy: jest.fn().mockResolvedValue('priv'),
        updatePrivacyBatch: jest.fn().mockResolvedValue('privbatch'),
        getAuths: jest.fn().mockResolvedValue({ authorizations: [] }),
        removeOtherAuths: jest.fn().mockResolvedValue('removed'),
        createNewSession: jest.fn().mockResolvedValue('session'),
        getSessionInfo: jest.fn().mockResolvedValue({ session: 1 }),
        terminateSession: jest.fn().mockResolvedValue('terminated'),
        getConnectionStatus: jest.fn().mockResolvedValue({ activeConnections: 1 }),
        getCallLog: jest.fn().mockResolvedValue(['c']),
        addContacts: jest.fn().mockResolvedValue('added'),
        getContacts: jest.fn().mockResolvedValue(['contact']),
        getMediaFileDownloadInfo: jest.fn(),
        streamMediaFile: jest.fn(),
        getThumbnail: jest.fn(),
        sendMediaAlbum: jest.fn().mockResolvedValue('album'),
        getMediaMetadata: jest.fn().mockResolvedValue({ meta: true }),
        getFilteredMedia: jest.fn().mockResolvedValue({ items: [] }),
        getGrpMembers: jest.fn().mockResolvedValue(['mem']),
        blockUser: jest.fn().mockResolvedValue('blocked'),
        sendInlineMessage: jest.fn().mockResolvedValue('inline'),
        getDialogs: jest.fn().mockResolvedValue({ items: [] }),
        getLastActiveTime: jest.fn().mockResolvedValue('time'),
        createGroupWithOptions: jest.fn().mockResolvedValue('group'),
        updateGroupSettings: jest.fn().mockResolvedValue('gset'),
        addGroupMembers: jest.fn().mockResolvedValue(undefined),
        removeGroupMembers: jest.fn().mockResolvedValue(undefined),
        promoteToAdmin: jest.fn().mockResolvedValue(undefined),
        demoteAdmin: jest.fn().mockResolvedValue(undefined),
        cleanupChat: jest.fn().mockResolvedValue('clean'),
        getChatMediaCounts: jest.fn().mockResolvedValue({ photo: 1 }),
        getChatCallHistory: jest.fn().mockResolvedValue({ totalCalls: 1 }),
        getChatStatistics: jest.fn().mockResolvedValue({ stat: 1 }),
        scheduleMessage: jest.fn().mockResolvedValue('scheduled'),
        getScheduledMessages: jest.fn().mockResolvedValue(['sm']),
        sendVoiceMessage: jest.fn().mockResolvedValue('voice'),
        sendViewOnceMedia: jest.fn().mockResolvedValue('viewonce'),
        getMessagesNew: jest.fn().mockResolvedValue(['mn']),
        unblockGroupUser: jest.fn().mockResolvedValue(undefined),
        getGroupAdmins: jest.fn().mockResolvedValue(['a']),
        getGroupBannedUsers: jest.fn().mockResolvedValue(['b']),
        exportContacts: jest.fn().mockResolvedValue('csv-data'),
        importContacts: jest.fn().mockResolvedValue('imported'),
        manageBlockList: jest.fn().mockResolvedValue('blocklist'),
        getContactStatistics: jest.fn().mockResolvedValue({ contacts: 1 }),
        createChatFolder: jest.fn().mockResolvedValue('folder'),
        getChatFolders: jest.fn().mockResolvedValue(['folder']),
        editMessage: jest.fn().mockResolvedValue('edited'),
        updateChatSettings: jest.fn().mockResolvedValue('chatset'),
        sendMediaBatch: jest.fn().mockResolvedValue('mediabatch'),
        getSecurityStatus: jest.fn().mockResolvedValue({ mobile: 'm' }),
        getFileUrl: jest.fn().mockResolvedValue('http://file'),
        getMessageStats: jest.fn().mockResolvedValue({ stats: 1 }),
        getTopPrivateChats: jest.fn().mockResolvedValue({ items: [] }),
        getSelfMsgsInfo: jest.fn().mockResolvedValue({ total: 1 }),
        addBotsToChannel: jest.fn().mockResolvedValue(undefined),
        createBot: jest.fn().mockResolvedValue({ botToken: 't' }),
    };
}

function makeRes(): any {
    const res: any = {
        statusCode: 200,
        headers: {},
        destroyed: false,
        headersSent: false,
        req: { headers: {} },
        status: jest.fn(function (this: any, c: number) { res.statusCode = c; return res; }),
        setHeader: jest.fn(function (this: any, k: string, v: any) { res.headers[k] = v; return res; }),
        getHeader: jest.fn((k: string) => res.headers[k]),
        write: jest.fn().mockReturnValue(true),
        end: jest.fn(),
        send: jest.fn(),
        destroy: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        get: jest.fn(),
    };
    return res;
}

let service: any;
let controller: TelegramController;

beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
    controller = new TelegramController(service);
});

describe('connection routes', () => {
    test('connect builds options and returns success', async () => {
        const r = await controller.connect('m', true, false);
        expect(service.connect).toHaveBeenCalledWith('m', { autoDisconnect: true, handler: false });
        expect(r).toEqual({ message: 'Connected successfully' });
    });

    test('disconnect / disconnect-all', async () => {
        expect(await controller.disconnect('m')).toEqual({ message: 'Disconnected successfully' });
        expect(await controller.disconnectAll()).toEqual({ message: 'All clients disconnected successfully' });
    });

    test('stats / state / count getters', () => {
        expect(controller.getConnectionStats()).toEqual({ total: 1 });
        expect(controller.getClientState('m')).toEqual({ state: 'connected' });
        expect(controller.getActiveConnectionCount()).toBe(2);
    });
});

describe('profile & basic routes', () => {
    test('getMe / getEntity / updateProfile / setProfilePhoto / deleteProfilePhotos', async () => {
        await controller.getMe('m');
        await controller.getEntity('m', 'ent');
        await controller.updateProfile('m', { firstName: 'F', about: 'a' } as any);
        await controller.setProfilePhoto('m', { name: 'N' } as any);
        await controller.deleteProfilePhotos('m');
        expect(service.updateNameandBio).toHaveBeenCalledWith('m', 'F', 'a');
        expect(service.setProfilePic).toHaveBeenCalledWith('m', 'N');
    });

    test('getMessages / sendMessage / forwardMessage / searchMessages', async () => {
        await controller.getMessages('m', 'chat', 5, 0);
        await controller.sendMessage('m', { chatId: 'c', message: 'x' } as any);
        await controller.forwardMessage('m', { fromChatId: 'f', toChatId: 't', messageIds: [1] } as any);
        await controller.searchMessages('m', { query: 'q' } as any);
        expect(service.forwardBulkMessages).toHaveBeenCalledWith('m', 'f', 't', [1]);
    });
});

describe('processBatchMessages', () => {
    test('FORWARD operation forwards each item', async () => {
        await controller.processBatchMessages('m', {
            items: [{ messageId: 1, fromChatId: 'f', toChatId: 't' }],
            batchSize: 5,
            operation: 'forward',
            delayMs: 0,
        } as any);
        // run the processor passed to service.processBatch
        const processor = service.processBatch.mock.calls[0][2];
        await processor([{ messageId: 1, fromChatId: 'f', toChatId: 't' }]);
        expect(service.forwardMessage).toHaveBeenCalledWith('m', 't', 'f', 1);
    });

    test('DELETE operation clears each chat', async () => {
        await controller.processBatchMessages('m', { items: [{ chatId: 'c' }], operation: 'delete' } as any);
        const processor = service.processBatch.mock.calls[0][2];
        await processor([{ chatId: 'c' }]);
        expect(service.deleteChat).toHaveBeenCalledWith('m', { peer: 'c', justClear: true });
    });

    test('unsupported operation throws inside processor', async () => {
        await controller.processBatchMessages('m', { items: [], operation: 'weird' } as any);
        const processor = service.processBatch.mock.calls[0][2];
        await expect(processor([{}])).rejects.toThrow('Unsupported batch operation');
    });
});

describe('channels', () => {
    test('getChannelInfo / forwardMedia / leaveChannel / updateUsername', async () => {
        await controller.getChannelInfo('m', true);
        await controller.forwardMedia('m', 'chan', 'from');
        expect(mockConnectionManager.getClient).toHaveBeenCalledWith('m', { autoDisconnect: false, handler: false });
        await controller.leaveChannel('m', 'ch');
        await controller.updateUsername('m', { newUsername: 'newuser' } as any);
        expect(service.updateUsername).toHaveBeenCalledWith('m', 'newuser');
    });
});

describe('security / session routes', () => {
    test('2fa / privacy / privacy batch / sessions', async () => {
        await controller.setup2FA('m');
        await controller.updatePrivacy('m');
        await controller.updatePrivacyBatch('m', {} as any);
        await controller.getActiveSessions('m');
        await controller.terminateOtherSessions('m');
        await controller.createNewSession('m');
        await controller.getSessionInfo('m');
        await controller.terminateSession('m', { hash: 'h', type: 'app' });
        await controller.getConnectionStatus();
        await controller.getSecurityStatus('m');
        expect(service.removeOtherAuths).toHaveBeenCalled();
    });
});

describe('getCallLogStats', () => {
    test('validates limit bounds', async () => {
        await expect(controller.getCallLogStats('m', 0)).rejects.toThrow('Limit must be between 1 and 10000');
        await expect(controller.getCallLogStats('m', 20000)).rejects.toThrow();
    });
    test('passes valid limit', async () => {
        await controller.getCallLogStats('m', 100);
        expect(service.getCallLog).toHaveBeenCalledWith('m', 100);
    });
});

describe('contacts', () => {
    test('addContactsBulk / getContacts', async () => {
        await controller.addContactsBulk('m', { phoneNumbers: ['1'], prefix: 'p' } as any);
        await controller.getContacts('m');
        expect(service.addContacts).toHaveBeenCalledWith('m', ['1'], 'p');
    });

    test('exportContacts streams file with headers', async () => {
        const res = makeRes();
        await controller.exportContacts('m', { format: 'csv', includeBlocked: false } as any, res);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
        expect(res.send).toHaveBeenCalledWith('csv-data');
    });

    test('exportContacts uses vcard content-type', async () => {
        const res = makeRes();
        await controller.exportContacts('m', { format: 'vcard', includeBlocked: true } as any, res);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/vcard');
    });

    test('importContacts / manageBlockList / getContactStatistics', async () => {
        await controller.importContacts('m', [{ firstName: 'A', phone: '1' }]);
        await controller.manageBlockList('m', { userIds: ['u'], block: true } as any);
        await controller.getContactStatistics('m');
        expect(service.manageBlockList).toHaveBeenCalledWith('m', ['u'], true);
    });
});

describe('sendMedia', () => {
    test('rejects oversized file via HEAD content-length', async () => {
        mockAxios.head.mockResolvedValue({ headers: { 'content-length': String(200 * 1024 * 1024) } });
        await expect(controller.sendMedia('m', { url: 'http://x', type: MediaType.PHOTO, chatId: 'c' } as any)).rejects.toThrow('exceeds maximum');
    });

    test('sends photo when within size limit', async () => {
        mockAxios.head.mockResolvedValue({ headers: { 'content-length': '1000' } });
        const client = { sendPhotoChat: jest.fn().mockResolvedValue('photo'), sendFileChat: jest.fn() };
        mockConnectionManager.getClient.mockResolvedValue(client);
        const r = await controller.sendMedia('m', { url: 'http://x', type: MediaType.PHOTO, chatId: 'c', caption: 'cap' } as any);
        expect(client.sendPhotoChat).toHaveBeenCalledWith('c', 'http://x', 'cap', undefined);
        expect(r).toBe('photo');
    });

    test('sends file for non-photo type, continues when HEAD fails', async () => {
        mockAxios.head.mockRejectedValue(new Error('no head'));
        const client = { sendPhotoChat: jest.fn(), sendFileChat: jest.fn().mockResolvedValue('file') };
        mockConnectionManager.getClient.mockResolvedValue(client);
        const r = await controller.sendMedia('m', { url: 'http://x', type: MediaType.DOCUMENT, chatId: 'c' } as any);
        expect(client.sendFileChat).toHaveBeenCalled();
        expect(r).toBe('file');
    });

    test('wraps send errors in BadRequest', async () => {
        const client = { sendPhotoChat: jest.fn().mockRejectedValue(new Error('boom')), sendFileChat: jest.fn() };
        mockConnectionManager.getClient.mockResolvedValue(client);
        await expect(controller.sendMedia('m', { type: MediaType.PHOTO, chatId: 'c' } as any)).rejects.toThrow('Failed to send media: boom');
    });

    test('re-throws a BadRequestException raised by the client unchanged', async () => {
        // a validation-style failure inside the client (e.g. bad chatId) should
        // surface as-is rather than being re-wrapped with the generic message.
        const client = {
            sendPhotoChat: jest.fn().mockRejectedValue(new BadRequestException('Invalid chat')),
            sendFileChat: jest.fn(),
        };
        mockConnectionManager.getClient.mockResolvedValue(client);
        await expect(
            controller.sendMedia('m', { type: MediaType.PHOTO, chatId: 'c' } as any),
        ).rejects.toThrow('Invalid chat');
    });
});

describe('downloadMedia', () => {
    const fileInfo = { filename: 'f.bin', etag: 'etag1', fileSize: 1000, contentType: 'image/png', fileLocation: { x: 1 }, dcId: 2 };

    async function* oneChunk() { yield Buffer.from('abc'); }

    test('rejects invalid messageId', async () => {
        const res = makeRes();
        await expect(controller.downloadMedia('m', 'c', 'notanumber', res)).rejects.toThrow('messageId must be an integer');
    });

    test('rejects empty chatId', async () => {
        const res = makeRes();
        await expect(controller.downloadMedia('m', '   ', '5', res)).rejects.toThrow('Chat ID is required');
    });

    test('returns 304 when If-None-Match matches etag', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        const res = makeRes();
        res.req.headers['if-none-match'] = 'etag1';
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(304);
    });

    test('full download streams chunks and ends', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.write).toHaveBeenCalled();
        expect(res.end).toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    });

    test('range request returns 206 with partial content', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        res.req.headers.range = 'bytes=0-99';
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(206);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Range', expect.stringContaining('bytes 0-99/1000'));
    });

    test('invalid range returns 416', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        const res = makeRes();
        res.req.headers.range = 'bytes=999999-1000000';
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(416);
    });

    test('404 for not-found media error', async () => {
        service.getMediaFileDownloadInfo.mockRejectedValue(new Error('FILE_REFERENCE_EXPIRED'));
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('415 for unsupported media error', async () => {
        service.getMediaFileDownloadInfo.mockRejectedValue(new Error('unsupported media type'));
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(415);
    });

    test('500 for generic error before headers sent', async () => {
        service.getMediaFileDownloadInfo.mockRejectedValue(new Error('weird'));
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    test('suffix range (bytes=-N) computes start from end and trims/skips chunk', async () => {
        // file 1000 bytes, suffix 100 -> start=900. chunkSize=512KB so alignedStart=0,
        // skipBytes=900. A single 1000-byte chunk forces both the skip and trim branches.
        service.getMediaFileDownloadInfo.mockResolvedValue({ ...fileInfo, fileSize: 1000 });
        async function* bigChunk() { yield Buffer.alloc(1000, 1); }
        service.streamMediaFile.mockReturnValue(bigChunk());
        const res = makeRes();
        res.req.headers.range = 'bytes=-100';
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(206);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Range', expect.stringContaining('bytes 900-999/1000'));
    });

    test('awaits drain when res.write returns false then resumes', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        res.write.mockReturnValue(false); // force backpressure path
        res.once.mockImplementation((event: string, cb: any) => {
            if (event === 'drain') process.nextTick(cb); // resolve the drain wait
            return res;
        });
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.once).toHaveBeenCalledWith('drain', expect.any(Function));
        expect(res.end).toHaveBeenCalled();
    });

    test('stops writing when response closes during drain wait', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        res.write.mockReturnValue(false);
        res.once.mockImplementation((event: string, cb: any) => {
            if (event === 'close') process.nextTick(() => { res.destroyed = true; cb(); });
            return res;
        });
        await controller.downloadMedia('m', 'c', '5', res);
        // returns early without throwing after close
        expect(res.once).toHaveBeenCalledWith('close', expect.any(Function));
    });

    test('range trims an oversized chunk down to the requested byte length', async () => {
        // request first 50 bytes; stream yields a 1000-byte chunk with no skip,
        // forcing the data.length > remaining trim branch.
        service.getMediaFileDownloadInfo.mockResolvedValue({ ...fileInfo, fileSize: 1000 });
        async function* bigChunk() { yield Buffer.alloc(1000, 7); }
        service.streamMediaFile.mockReturnValue(bigChunk());
        const res = makeRes();
        res.req.headers.range = 'bytes=0-49';
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(206);
        const written = res.write.mock.calls[0][0] as Buffer;
        expect(written.length).toBe(50);
    });

    test('propagates a write error surfaced during drain backpressure wait', async () => {
        // res.write returns false (backpressure) and the response then emits 'error',
        // exercising the onError reject path in waitForDrainOrClose -> stream catch.
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        res.headersSent = true; // error after headers => destroy path
        res.write.mockReturnValue(false);
        res.once.mockImplementation((event: string, cb: any) => {
            if (event === 'error') process.nextTick(() => cb(new Error('socket reset')));
            return res;
        });
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.once).toHaveBeenCalledWith('error', expect.any(Function));
        expect(res.destroy).toHaveBeenCalled();
    });

    test('destroys response when error after headers already sent', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockImplementation(() => { throw new Error('mid-stream'); });
        const res = makeRes();
        res.headersSent = true;
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.destroy).toHaveBeenCalled();
    });

    test('full download of an unknown-size file omits Content-Length and still streams', async () => {
        // fileSize 0 => the `fileSize > 0` Content-Length guard and the
        // `fileSize > 0 ? .. : undefined` / `fileSize || undefined` fallbacks all take their zero branch.
        service.getMediaFileDownloadInfo.mockResolvedValue({ ...fileInfo, fileSize: 0 });
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.setHeader).not.toHaveBeenCalledWith('Content-Length', expect.anything());
        expect(res.write).toHaveBeenCalled();
        expect(res.end).toHaveBeenCalled();
    });

    test('honours a matching If-Range header by serving the requested partial range', async () => {
        // if-range equal to the etag keeps the range valid (exercises the ifRange === etag branch).
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        res.req.headers.range = 'bytes=0-99';
        res.req.headers['if-range'] = 'etag1';
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(206);
    });

    test('a stale If-Range header falls back to a full download instead of a range', async () => {
        // if-range NOT equal to etag => rangeRequested is false, so a full 200 download is served.
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockReturnValue(oneChunk());
        const res = makeRes();
        res.req.headers.range = 'bytes=0-99';
        res.req.headers['if-range'] = 'an-old-etag';
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).not.toHaveBeenCalledWith(206);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    });

    test('404 maps a non-Error rejection (no .message) to the default message', async () => {
        // service rejects with a bare object whose message is falsy -> error.message || fallback branch.
        service.getMediaFileDownloadInfo.mockRejectedValue({ toString: () => 'not found here' });
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.send).toHaveBeenCalledWith('File reference expired');
    });

    test('415 maps a messageless unsupported-media rejection to the default message', async () => {
        service.getMediaFileDownloadInfo.mockRejectedValue({ toString: () => 'unsupported media type' });
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(415);
        expect(res.send).toHaveBeenCalledWith('Unsupported media type');
    });

    test('500 maps a messageless generic rejection to the Unknown error fallback', async () => {
        service.getMediaFileDownloadInfo.mockRejectedValue({ toString: () => 'weird' });
        const res = makeRes();
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Unknown error'));
    });

    test('post-headers stream failure with a messageless error still destroys the socket', async () => {
        service.getMediaFileDownloadInfo.mockResolvedValue(fileInfo);
        service.streamMediaFile.mockImplementation(() => { throw { toString: () => 'boom' }; });
        const res = makeRes();
        res.headersSent = true;
        await controller.downloadMedia('m', 'c', '5', res);
        expect(res.destroy).toHaveBeenCalled();
    });
});

describe('getThumbnail', () => {
    const thumb = { buffer: Buffer.from('img'), etag: 'te', contentType: 'image/jpeg', filename: 't.jpg' };

    test('rejects invalid messageId / empty chatId', async () => {
        const res = makeRes();
        await expect(controller.getThumbnail('m', 'c', 'x', 'low', res)).rejects.toThrow('messageId must be an integer');
        await expect(controller.getThumbnail('m', '', '5', 'low', res)).rejects.toThrow('Chat ID is required');
    });

    test('returns 304 on matching etag', async () => {
        service.getThumbnail.mockResolvedValue(thumb);
        const res = makeRes();
        res.req.headers['if-none-match'] = 'te';
        await controller.getThumbnail('m', 'c', '5', 'high', res);
        expect(res.status).toHaveBeenCalledWith(304);
    });

    test('sends thumbnail buffer', async () => {
        service.getThumbnail.mockResolvedValue(thumb);
        const res = makeRes();
        await controller.getThumbnail('m', 'c', '5', 'low', res);
        expect(res.send).toHaveBeenCalledWith(thumb.buffer);
    });

    test('404 for unavailable thumbnail', async () => {
        service.getThumbnail.mockRejectedValue(new Error('not available'));
        const res = makeRes();
        await controller.getThumbnail('m', 'c', '5', 'low', res);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('500 for generic thumbnail error', async () => {
        service.getThumbnail.mockRejectedValue(new Error('boom'));
        const res = makeRes();
        await controller.getThumbnail('m', 'c', '5', 'low', res);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('sendMediaAlbum', () => {
    test('rejects empty album', async () => {
        await expect(controller.sendMediaAlbum('m', { media: [] } as any)).rejects.toThrow('at least one media item');
    });
    test('rejects album over 10 items', async () => {
        await expect(controller.sendMediaAlbum('m', { media: new Array(11).fill({}) } as any)).rejects.toThrow('more than 10');
    });
    test('sends valid album', async () => {
        expect(await controller.sendMediaAlbum('m', { media: [{}] } as any)).toBe('album');
    });
});

describe('getMediaMetadata', () => {
    test('rejects empty chatId', async () => {
        await expect(controller.getMediaMetadata('m', '')).rejects.toThrow('Chat ID is required');
    });
    test('parses types, dates and pagination', async () => {
        await controller.getMediaMetadata('m', 'c', ['photo', 'video'], '2024-01-01', '2024-12-31', '50', '100', '1');
        expect(service.getMediaMetadata).toHaveBeenCalledWith('m', expect.objectContaining({
            chatId: 'c', types: ['photo', 'video'], limit: 50, maxId: 100, minId: 1,
        }));
    });
    test('rejects invalid types', async () => {
        await expect(controller.getMediaMetadata('m', 'c', ['nonsense'])).rejects.toThrow('Invalid types');
    });
    test('uses the first value when pagination params arrive as repeated query arrays', async () => {
        // duplicated query keys (?limit=25&limit=999) arrive as arrays; only the first is honoured.
        await controller.getMediaMetadata('m', 'c', undefined, undefined, undefined, ['25', '999'] as any, ['100'] as any, ['1'] as any);
        expect(service.getMediaMetadata).toHaveBeenCalledWith('m', expect.objectContaining({
            limit: 25, maxId: 100, minId: 1,
        }));
    });
    test('rejects out-of-range limit', async () => {
        await expect(controller.getMediaMetadata('m', 'c', undefined, undefined, undefined, '9999')).rejects.toThrow('must be between');
    });
    test('rejects non-integer limit', async () => {
        await expect(controller.getMediaMetadata('m', 'c', undefined, undefined, undefined, 'abc')).rejects.toThrow('must be an integer');
    });
    test('rejects invalid startDate', async () => {
        await expect(controller.getMediaMetadata('m', 'c', undefined, 'not-a-date')).rejects.toThrow('Invalid startDate');
    });
    test('rejects invalid endDate', async () => {
        await expect(controller.getMediaMetadata('m', 'c', undefined, '2024-01-01', 'nope')).rejects.toThrow('Invalid endDate');
    });
    test('rejects start after end', async () => {
        await expect(controller.getMediaMetadata('m', 'c', undefined, '2024-12-31', '2024-01-01')).rejects.toThrow('before or equal');
    });
    test('accepts single-string type', async () => {
        await controller.getMediaMetadata('m', 'c', 'photo');
        expect(service.getMediaMetadata).toHaveBeenCalledWith('m', expect.objectContaining({ types: ['photo'] }));
    });
});

describe('getFilteredMedia', () => {
    const req: any = { headers: {}, protocol: 'https', get: () => 'host.example', originalUrl: '/x?apiKey=k' };
    test('rejects empty chatId', async () => {
        await expect(controller.getFilteredMedia('m', '')).rejects.toThrow('Chat ID is required');
    });
    test('maps includeThumbnails=false to none mode', async () => {
        await controller.getFilteredMedia('m', 'c', undefined, undefined, undefined, undefined, undefined, undefined, 'base64', '10', 'false', undefined, req);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({ thumbnailMode: 'none' }));
    });
    test('passes base64 mode + request-derived api key/base url', async () => {
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, '10', undefined, undefined, 'base64', '5', 'true', 'qkey', req);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailMode: 'base64', thumbnailApiKey: 'qkey', thumbnailBaseUrl: 'https://host.example',
        }));
    });
    test('rejects invalid types', async () => {
        await expect(controller.getFilteredMedia('m', 'c', ['bad'], undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, req)).rejects.toThrow('Invalid types');
    });
    test('rejects invalid date range', async () => {
        await expect(controller.getFilteredMedia('m', 'c', undefined, '2024-12-31', '2024-01-01', undefined, undefined, undefined, undefined, undefined, undefined, undefined, req)).rejects.toThrow('before or equal');
    });
    test('rejects invalid startDate / endDate', async () => {
        await expect(controller.getFilteredMedia('m', 'c', undefined, 'bad-date', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, req)).rejects.toThrow('Invalid startDate');
        await expect(controller.getFilteredMedia('m', 'c', undefined, '2024-01-01', 'bad-date', undefined, undefined, undefined, undefined, undefined, undefined, undefined, req)).rejects.toThrow('Invalid endDate');
    });
    test('rejects invalid thumbnailMode', async () => {
        await expect(controller.getFilteredMedia('m', 'c', undefined, undefined, undefined, undefined, undefined, undefined, 'bogus', undefined, undefined, undefined, req)).rejects.toThrow('thumbnailMode must be one of');
    });
    test('rejects invalid includeThumbnails boolean', async () => {
        await expect(controller.getFilteredMedia('m', 'c', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'maybe', undefined, req)).rejects.toThrow('must be a boolean');
    });
    test('omits thumbnail api key and base url when no request object is supplied', async () => {
        // background / non-HTTP caller passes no req -> both request-derived fields fall back to undefined.
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, 'url', undefined, undefined, undefined, undefined);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailApiKey: undefined, thumbnailBaseUrl: undefined,
        }));
    });
    test('honours repeated includeThumbnails/thumbnailMode query arrays by taking the first', async () => {
        // duplicated query keys arrive as arrays; parseBoolean/parseThumbnailMode read [0].
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, ['base64', 'none'] as any, undefined, ['true', 'false'] as any, 'qkey', req);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailMode: 'base64',
        }));
    });
    test('derives base url from x-forwarded-* header arrays behind a proxy', async () => {
        // proxy sets x-forwarded-proto / x-forwarded-host as arrays; first element wins.
        const proxiedReq: any = {
            headers: { 'x-forwarded-proto': ['https', 'http'], 'x-forwarded-host': ['edge.example', 'origin.example'] },
            protocol: 'http', get: () => 'origin.example', originalUrl: '/x',
        };
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, 'base64', undefined, 'true', 'qkey', proxiedReq);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailBaseUrl: 'https://edge.example',
        }));
    });
    test('falls back to req.get(host) when no forwarded host header is present', async () => {
        const directReq: any = { headers: {}, protocol: 'http', get: () => 'direct.example', originalUrl: '/x' };
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, 'base64', undefined, 'true', 'qkey', directReq);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailBaseUrl: 'http://direct.example',
        }));
    });
    test('returns an empty base url when the host cannot be determined', async () => {
        const hostlessReq: any = { headers: {}, protocol: 'https', get: () => undefined, originalUrl: '/x' };
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, 'base64', undefined, 'true', 'qkey', hostlessReq);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailBaseUrl: '',
        }));
    });
    test('reads the auth-injected api key when no query api key is provided', async () => {
        // AuthGuard attaches authQueryApiKey to the request; getRequestApiKey prefers it over URL parsing.
        const authedReq: any = { headers: {}, protocol: 'https', get: () => 'host.example', originalUrl: '/x', authQueryApiKey: 'injected-key' };
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, 'base64', undefined, 'true', undefined, authedReq);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailApiKey: 'injected-key',
        }));
    });
    test('extracts the api key from the request query string when nothing else supplies it', async () => {
        const urlReq: any = { headers: {}, protocol: 'https', get: () => 'host.example', originalUrl: '/telegram/media?api_key=fromurl' };
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, 'base64', undefined, 'true', undefined, urlReq);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailApiKey: 'fromurl',
        }));
    });
    test('tolerates a malformed request URL when deriving the thumbnail api key', async () => {
        // No explicit apiKey + an originalUrl that cannot be parsed by new URL():
        // the extractor must swallow the parse error and fall back to undefined.
        const badReq: any = { headers: {}, protocol: 'https', get: () => 'host.example', originalUrl: 'http://%E0%A4%A' };
        await controller.getFilteredMedia('m', 'c', 'photo', undefined, undefined, undefined, undefined, undefined, 'base64', undefined, 'true', undefined, badReq);
        expect(service.getFilteredMedia).toHaveBeenCalledWith('m', expect.objectContaining({
            thumbnailMode: 'base64', thumbnailApiKey: undefined,
        }));
    });
});

describe('group / chat routes', () => {
    test('getGroupMembers / blockChat / inline message / dialogs / lastActive', async () => {
        await controller.getGroupMembers('m', 'g', 0, 200);
        await controller.blockChat('m', 'c');
        await controller.sendMessageWithInlineButton('m', 'c', 'msg', 'url');
        await controller.getDialogs('m', 10, 0, 0, true, 'user', true, false);
        await controller.getLastActiveTime('m');
        expect(service.getDialogs).toHaveBeenCalledWith('m', expect.objectContaining({ archived: true, peerType: 'user', ignorePinned: true }));
    });

    test('deleteChatHistory delegates', async () => {
        await controller.deleteChatHistory('m', { peer: 'p' } as any);
        expect(service.deleteChat).toHaveBeenCalledWith('m', { peer: 'p' });
    });

    test('createGroupWithOptions / updateGroupSettings / member ops', async () => {
        await controller.createGroupWithOptions('m', {} as any);
        await controller.updateGroupSettings('m', { groupId: 'g' } as any);
        await controller.addGroupMembers({ groupId: 'g', members: ['u'] } as any, 'm');
        await controller.removeGroupMembers({ groupId: 'g', members: ['u'] } as any, 'm');
        expect(service.addGroupMembers).toHaveBeenCalledWith('m', 'g', ['u']);
    });

    test('handleAdminOperation promotes / demotes', async () => {
        await controller.handleAdminOperation({ isPromote: true, groupId: 'g', userId: 'u', permissions: {}, rank: 'r' } as any, 'm');
        expect(service.promoteToAdmin).toHaveBeenCalled();
        await controller.handleAdminOperation({ isPromote: false, groupId: 'g', userId: 'u' } as any, 'm');
        expect(service.demoteAdmin).toHaveBeenCalledWith('m', 'g', 'u');
    });

    test('promoteToAdmin / demoteAdmin / unblock / admins / banned routes', async () => {
        await controller.promoteToAdmin('m', { groupId: 'g', userId: 'u', permissions: {}, rank: 'r' } as any);
        await controller.demoteAdmin('m', { groupId: 'g', members: ['u'] } as any);
        await controller.unblockGroupUser('m', { groupId: 'g', userId: 'u' });
        await controller.getGroupAdmins('m', 'g');
        await controller.getGroupBannedUsers('m', 'g');
        expect(service.demoteAdmin).toHaveBeenCalledWith('m', 'g', 'u');
    });

    test('cleanupChat maps beforeDate', async () => {
        await controller.cleanupChat('m', { chatId: 'c', beforeDate: '2024-01-01', onlyMedia: true } as any);
        expect(service.cleanupChat).toHaveBeenCalledWith('m', expect.objectContaining({ chatId: 'c', onlyMedia: true, beforeDate: expect.any(Date) }));
    });

    test('cleanupChat without beforeDate', async () => {
        await controller.cleanupChat('m', { chatId: 'c' } as any);
        expect(service.cleanupChat).toHaveBeenCalledWith('m', expect.objectContaining({ beforeDate: undefined }));
    });
});

describe('chat media counts / call history / statistics', () => {
    test('getChatMediaCounts validates chatId', async () => {
        await expect(controller.getChatMediaCounts('m', '')).rejects.toThrow('chatId is required');
        await controller.getChatMediaCounts('m', 'c');
        expect(service.getChatMediaCounts).toHaveBeenCalled();
    });

    test('getChatCallHistory validates chatId and limit', async () => {
        await expect(controller.getChatCallHistory('m', '')).rejects.toThrow('chatId is required');
        await expect(controller.getChatCallHistory('m', 'c', 1000)).rejects.toThrow('between 1 and 500');
        await controller.getChatCallHistory('m', 'c', 50, 'true');
        expect(service.getChatCallHistory).toHaveBeenCalledWith('m', 'c', 50, true);
    });

    test('getChatStatistics defaults period to week', async () => {
        await controller.getChatStatistics('m', 'c');
        expect(service.getChatStatistics).toHaveBeenCalledWith('m', 'c', 'week');
    });
});

describe('schedule / voice / view-once / history', () => {
    test('scheduleMessage maps scheduledTime to Date', async () => {
        await controller.scheduleMessage('m', { chatId: 'c', message: 'x', scheduledTime: '2024-01-01T00:00:00Z' } as any);
        expect(service.scheduleMessage).toHaveBeenCalledWith('m', expect.objectContaining({ scheduledTime: expect.any(Date) }));
    });

    test('getScheduledMessages delegates', async () => {
        await controller.getScheduledMessages('m', 'c');
        expect(service.getScheduledMessages).toHaveBeenCalledWith('m', 'c');
    });

    test('sendVoiceMessage validation', async () => {
        await expect(controller.sendVoiceMessage('m', { chatId: '', url: 'http://x' } as any)).rejects.toThrow('Chat ID is required');
        await expect(controller.sendVoiceMessage('m', { chatId: 'c', url: '' } as any)).rejects.toThrow('URL is required');
        await expect(controller.sendVoiceMessage('m', { chatId: 'c', url: 'not-a-url' } as any)).rejects.toThrow('Invalid URL');
        await expect(controller.sendVoiceMessage('m', { chatId: 'c', url: 'http://x', duration: -1 } as any)).rejects.toThrow('non-negative integer');
        await controller.sendVoiceMessage('m', { chatId: 'c', url: 'http://x', duration: 5 } as any);
        expect(service.sendVoiceMessage).toHaveBeenCalled();
    });

    test('sendViewOnceMedia with binary file', async () => {
        const file = { buffer: Buffer.from('b'), originalname: 'o.jpg' } as any;
        await controller.sendViewOnceMedia('m', file, { sourceType: MediaSourceType.BINARY, chatId: 'c' } as any);
        expect(service.sendViewOnceMedia).toHaveBeenCalledWith('m', expect.objectContaining({ binaryData: file.buffer, filename: 'o.jpg' }));
    });

    test('sendViewOnceMedia without binary file (path/base64)', async () => {
        await controller.sendViewOnceMedia('m', undefined as any, { sourceType: MediaSourceType.PATH, chatId: 'c', path: '/x' } as any);
        expect(service.sendViewOnceMedia).toHaveBeenCalledWith('m', expect.objectContaining({ path: '/x' }));
    });

    test('getChatHistory delegates', async () => {
        await controller.getChatHistory('m', 'c', 0, 10);
        expect(service.getMessagesNew).toHaveBeenCalledWith('m', 'c', 0, 10);
    });
});

describe('folders / messages edit / chat settings / media batch / file url / message stats', () => {
    test('createChatFolder / getChatFolders / editMessage / updateChatSettings / sendMediaBatch', async () => {
        await controller.createChatFolder('m', { name: 'F', includedChats: [] } as any);
        await controller.getChatFolders('m');
        await controller.editMessage('m', { chatId: 'c', messageId: 1 });
        await controller.updateChatSettings('m', { chatId: 'c' });
        await controller.sendMediaBatch('m', { chatId: 'c', media: [] });
        await controller.getFileUrl('m', 'http://x', 'f');
        await controller.getMessageStats('m', { chatId: 'c', period: 'day' });
        expect(service.editMessage).toHaveBeenCalled();
    });
});

describe('top private chats / self messages / bots', () => {
    test('getTopPrivateChats parses enrich and offset', async () => {
        await controller.getTopPrivateChats('m', 5, true, 100);
        expect(service.getTopPrivateChats).toHaveBeenCalledWith('m', 5, true, 100);
    });

    test('getTopPrivateChats with string "true" enrich and no offset', async () => {
        await controller.getTopPrivateChats('m', undefined, 'true' as any, undefined);
        expect(service.getTopPrivateChats).toHaveBeenCalledWith('m', undefined, true, undefined);
    });

    test('getSelfMsgsInfo validates limit', async () => {
        await expect(controller.getSelfMsgsInfo('m', 0)).rejects.toThrow('between 1 and 10000');
        await controller.getSelfMsgsInfo('m', 100);
        expect(service.getSelfMsgsInfo).toHaveBeenCalledWith('m', 100);
    });

    test('addBotsToChannel / createBot', async () => {
        await controller.addBotsToChannel('m', { channelIds: ['c'] });
        await controller.createBot('m', { name: 'b' } as any);
        expect(service.addBotsToChannel).toHaveBeenCalledWith('m', ['c']);
    });
});

describe('auditStaleConfigs', () => {
    test('dry-run scans all keys and reports stale configs', async () => {
        mockRedis.scan.mockResolvedValueOnce(['0', ['tg:config:111aa', 'tg:config:999bb', 'tg:config:empty']]);
        mockRedis.get
            .mockResolvedValueOnce(JSON.stringify({ _apiId: 111, deviceModel: 'D' })) // valid
            .mockResolvedValueOnce(JSON.stringify({ _apiId: 999, deviceModel: 'X' })) // stale
            .mockResolvedValueOnce(null); // no config

        const result = await controller.auditStaleConfigs(undefined, undefined);
        expect(result.mode).toBe('DRY_RUN');
        expect(result.validConfigs).toBe(1);
        expect(result.noConfigKeys).toBe(1);
        expect(result.staleConfigs).toHaveLength(1);
        expect(result.staleConfigs[0].deleted).toBe(false);
        expect(mockRedis.del).not.toHaveBeenCalled();
    });

    test('execute=true deletes stale config + proxy map for a single mobile', async () => {
        mockRedis.get.mockResolvedValueOnce(JSON.stringify({ _apiId: 999, deviceModel: 'X' }));
        const result = await controller.auditStaleConfigs('true', '919999');
        expect(result.mode).toBe('EXECUTE');
        expect(result.staleConfigs[0].deleted).toBe(true);
        expect(mockRedis.del).toHaveBeenCalledWith('tg:config:919999');
        expect(mockRedis.del).toHaveBeenCalledWith('tg:proxy_map:919999');
    });

    test('captures per-key parse errors', async () => {
        mockRedis.get.mockResolvedValueOnce('not-json{');
        const result = await controller.auditStaleConfigs(undefined, 'm1');
        expect(result.errors.length).toBeGreaterThan(0);
    });

    test('captures scan errors', async () => {
        mockRedis.scan.mockRejectedValue(new Error('scan down'));
        const result = await controller.auditStaleConfigs(undefined, undefined);
        expect(result.errors[0]).toContain('Scan error');
    });
});
