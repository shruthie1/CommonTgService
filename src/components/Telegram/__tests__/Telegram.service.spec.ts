 
/**
 * Tests for TelegramService — the orchestration/delegation layer over a
 * per-mobile TelegramManager obtained from connectionManager.
 *
 * Boundary mocks ONLY: connectionManager, TelegramManager (static helpers),
 * cloudinary, fetchWithTimeout, channelInfo, channel-live-facts, fs, Api.
 * The real delegation/wrapper logic in the service is exercised.
 */

// ── Boundary mocks ────────────────────────────────────────────
const mockManager: any = {};

const mockConnectionManager = {
    getClient: jest.fn(),
    unregisterClient: jest.fn().mockResolvedValue(undefined),
    disconnectAll: jest.fn().mockResolvedValue(undefined),
    getConnectionStats: jest.fn(),
    getClientState: jest.fn(),
    getActiveConnectionCount: jest.fn(),
    hasClient: jest.fn(),
    setUsersService: jest.fn(),
};
jest.mock('../utils/connection-manager', () => ({
    connectionManager: mockConnectionManager,
}));

// Static client-setup helpers live on TelegramManager
const staticSetup = {
    getActiveClientSetup: jest.fn(),
    hasActiveClientSetup: jest.fn(),
    setActiveClientSetup: jest.fn(),
    clearActiveClientSetup: jest.fn(),
};
jest.mock('../TelegramManager', () => ({
    __esModule: true,
    default: staticSetup,
}));

jest.mock('../../../cloudinary', () => ({
    CloudinaryService: { getInstance: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn().mockResolvedValue({ data: { ok: true, result: { id: 'botid', username: 'botuser' } } }),
}));

jest.mock('../../../utils/telegram-utils/channelinfo', () => ({
    channelInfo: jest.fn().mockResolvedValue({ canSendFalseChats: ['c1', 'c2'], ids: [], chatsArrayLength: 0, canSendTrueCount: 0, canSendFalseCount: 0 }),
}));

jest.mock('../../../utils/telegram-utils/channel-live-facts', () => ({
    getTelegramChannelLiveFacts: jest.fn(),
}));

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn().mockResolvedValue(undefined) };
});

jest.mock('fs');

import * as fs from 'fs';
import { TelegramService } from '../Telegram.service';
import { CloudinaryService } from '../../../cloudinary';
import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { channelInfo } from '../../../utils/telegram-utils/channelinfo';
import { getTelegramChannelLiveFacts } from '../../../utils/telegram-utils/channel-live-facts';
import { HttpException, BadRequestException } from '@nestjs/common';

const mockChannelInfo = channelInfo as jest.Mock;
const mockLiveFacts = getTelegramChannelLiveFacts as jest.Mock;
const mockFetch = fetchWithTimeout as jest.Mock;

// ── Fake TelegramManager whose methods are jest.fns ───────────
function makeFakeManager(overrides: Record<string, any> = {}) {
    const m: any = {
        phoneNumber: '910000000000',
        apiId: 123,
        apiHash: 'hash',
        client: {
            invoke: jest.fn(),
            iterDialogs: jest.fn(),
        },
        getMessages: jest.fn().mockResolvedValue(['m']),
        getMessagesNew: jest.fn().mockResolvedValue(['mn']),
        sendInlineMessage: jest.fn().mockResolvedValue('inline'),
        getchatId: jest.fn().mockResolvedValue('chatid'),
        getLastActiveTime: jest.fn().mockResolvedValue('time'),
        joinChannel: jest.fn().mockResolvedValue(undefined),
        getGrpMembers: jest.fn().mockResolvedValue(['member']),
        addContact: jest.fn().mockResolvedValue('addContact'),
        addContacts: jest.fn().mockResolvedValue('addContacts'),
        getSelfMSgsInfo: jest.fn().mockResolvedValue({ total: 1 }),
        createGroup: jest.fn().mockResolvedValue('group'),
        forwardMedia: jest.fn().mockResolvedValue(undefined),
        blockUser: jest.fn().mockResolvedValue('blocked'),
        getCallLog: jest.fn().mockResolvedValue(['call']),
        getMediaMessages: jest.fn().mockResolvedValue(['media']),
        getMe: jest.fn().mockResolvedValue({ id: { toString: () => 'tg1' }, username: 'me', firstName: 'F', lastName: 'L', phone: '910000000000' }),
        getEntity: jest.fn().mockResolvedValue({ id: 'e' }),
        createNewSession: jest.fn().mockResolvedValue('newsession'),
        set2fa: jest.fn().mockResolvedValue(undefined),
        updatePrivacyforDeletedAccount: jest.fn().mockResolvedValue(undefined),
        deleteProfilePhotos: jest.fn().mockResolvedValue(undefined),
        updateProfilePic: jest.fn().mockResolvedValue(undefined),
        updatePrivacy: jest.fn().mockResolvedValue(undefined),
        downloadProfilePic: jest.fn().mockResolvedValue('pic'),
        updateUsername: jest.fn().mockResolvedValue('newusername'),
        getMediaMetadata: jest.fn().mockResolvedValue({ meta: true }),
        getMediaFileDownloadInfo: jest.fn().mockResolvedValue({ filename: 'f' }),
        streamMediaFile: jest.fn(),
        getThumbnail: jest.fn().mockResolvedValue({ buffer: Buffer.from('t') }),
        forwardMessage: jest.fn().mockResolvedValue('forwarded'),
        leaveChannels: jest.fn().mockResolvedValue(undefined),
        deleteChat: jest.fn().mockResolvedValue('deleted'),
        updateProfile: jest.fn().mockResolvedValue(undefined),
        forwardMessages: jest.fn().mockResolvedValue('bulk'),
        getAuths: jest.fn().mockResolvedValue({ authorizations: [{ current: true, dateCreated: 1700000000, dateActive: 1700000001 }] }),
        removeOtherAuths: jest.fn().mockResolvedValue(undefined),
        createGroupOrChannel: jest.fn().mockResolvedValue({ chats: [{ id: { toString: () => 'g1' } }] }),
        updateGroupSettings: jest.fn().mockResolvedValue('gset'),
        scheduleMessageSend: jest.fn().mockResolvedValue('scheduled'),
        getScheduledMessages: jest.fn().mockResolvedValue(['sm']),
        sendMediaAlbum: jest.fn().mockResolvedValue('album'),
        sendMessage: jest.fn().mockResolvedValue('sent'),
        sendVoiceMessage: jest.fn().mockResolvedValue('voice'),
        cleanupChat: jest.fn().mockResolvedValue('clean'),
        getChatStatistics: jest.fn().mockResolvedValue({ stat: 1 }),
        updatePrivacyBatch: jest.fn().mockResolvedValue('privbatch'),
        addGroupMembers: jest.fn().mockResolvedValue(undefined),
        removeGroupMembers: jest.fn().mockResolvedValue(undefined),
        promoteToAdmin: jest.fn().mockResolvedValue(undefined),
        demoteAdmin: jest.fn().mockResolvedValue(undefined),
        unblockGroupUser: jest.fn().mockResolvedValue(undefined),
        getGroupAdmins: jest.fn().mockResolvedValue(['admin']),
        getGroupBannedUsers: jest.fn().mockResolvedValue(['banned']),
        searchMessages: jest.fn().mockResolvedValue({ messages: [] }),
        getFilteredMedia: jest.fn().mockResolvedValue({ items: [] }),
        exportContacts: jest.fn().mockResolvedValue('exported'),
        importContacts: jest.fn().mockResolvedValue('imported'),
        manageBlockList: jest.fn().mockResolvedValue('blocklist'),
        getContactStatistics: jest.fn().mockResolvedValue({ contacts: 1 }),
        createChatFolder: jest.fn().mockResolvedValue('folder'),
        getChatFolders: jest.fn().mockResolvedValue(['folder']),
        getSessionInfo: jest.fn().mockResolvedValue({ session: 1 }),
        terminateSession: jest.fn().mockResolvedValue('terminated'),
        editMessage: jest.fn().mockResolvedValue('edited'),
        updateChatSettings: jest.fn().mockResolvedValue('chatset'),
        sendMediaBatch: jest.fn().mockResolvedValue('mediabatch'),
        getContacts: jest.fn().mockResolvedValue(['contact']),
        getChats: jest.fn().mockResolvedValue({ items: [] }),
        getFileUrl: jest.fn().mockResolvedValue('http://file'),
        getMessageStats: jest.fn().mockResolvedValue({ stats: 1 }),
        getChatMediaCounts: jest.fn().mockResolvedValue({ photo: 1 }),
        getChatCallHistory: jest.fn().mockResolvedValue({ totalCalls: 1 }),
        sendViewOnceMedia: jest.fn().mockResolvedValue('viewonce'),
        getTopPrivateChats: jest.fn().mockResolvedValue({ items: [] }),
        createBot: jest.fn().mockResolvedValue({ botToken: 'tok' }),
        ...overrides,
    };
    return m;
}

// ── Stubbed injected services ─────────────────────────────────
function makeServices() {
    const usersService: any = {
        search: jest.fn().mockResolvedValue([{ tgId: 'tg1', mobile: '910000000000', twoFA: false }]),
        update: jest.fn().mockResolvedValue(undefined),
    };
    const activeChannelsService: any = {
        update: jest.fn().mockResolvedValue(undefined),
        createMultiple: jest.fn().mockResolvedValue(undefined),
    };
    const channelsService: any = {
        update: jest.fn().mockResolvedValue(undefined),
        createMultiple: jest.fn().mockResolvedValue(undefined),
    };
    const bufferClientService: any = {
        model: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ tgId: 'b1', mobile: '111' }]) }) },
    };
    const promoteClientService: any = {
        model: { find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{ tgId: 'p1', mobile: '222' }]) }) },
    };
    return { usersService, activeChannelsService, channelsService, bufferClientService, promoteClientService };
}

function makeService(managerOverrides: Record<string, any> = {}) {
    const services = makeServices();
    const fakeManager = makeFakeManager(managerOverrides);
    mockConnectionManager.getClient.mockResolvedValue(fakeManager);
    const svc = new TelegramService(
        services.usersService,
        services.activeChannelsService,
        services.channelsService,
        services.bufferClientService,
        services.promoteClientService,
    );
    return { svc, fakeManager, services };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockConnectionManager.unregisterClient.mockResolvedValue(undefined);
});

describe('TelegramService — construction & static setup', () => {
    test('constructor wires usersService into connectionManager', () => {
        makeService();
        expect(mockConnectionManager.setUsersService).toHaveBeenCalled();
    });

    test('onModuleDestroy runs without throwing', async () => {
        const { svc } = makeService();
        await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    });

    test('active client setup delegates to TelegramManager statics', () => {
        const { svc } = makeService();
        staticSetup.getActiveClientSetup.mockReturnValue({ a: 1 });
        staticSetup.hasActiveClientSetup.mockReturnValue(true);
        expect(svc.getActiveClientSetup('999')).toEqual({ a: 1 });
        expect(svc.hasActiveClientSetup()).toBe(true);
        svc.setActiveClientSetup({ newMobile: '999' } as any);
        svc.clearActiveClientSetup('999');
        expect(staticSetup.setActiveClientSetup).toHaveBeenCalledWith({ newMobile: '999' });
        expect(staticSetup.clearActiveClientSetup).toHaveBeenCalledWith('999');
    });
});

describe('TelegramService — own-account id/mobile caching', () => {
    test('getOwnAccountTgIds collects unique tgIds and caches', async () => {
        const { svc, services } = makeService();
        const ids = await svc.getOwnAccountTgIds();
        expect([...ids].sort()).toEqual(['b1', 'p1']);
        // second call uses cache (no extra find)
        await svc.getOwnAccountTgIds();
        expect(services.bufferClientService.model.find).toHaveBeenCalledTimes(1);
    });

    test('getOwnAccountMobiles collects unique mobiles and caches', async () => {
        const { svc, services } = makeService();
        services.bufferClientService.model.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ mobile: '111' }, { mobile: null }, { tgId: 'x' }]) });
        services.promoteClientService.model.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ mobile: '222' }, { mobile: 111 as any }]) });
        const mobiles = await svc.getOwnAccountMobiles();
        expect(mobiles.sort()).toEqual(['111', '222']);
        await svc.getOwnAccountMobiles();
        expect(services.promoteClientService.model.find).toHaveBeenCalledTimes(1);
    });
});

describe('TelegramService — simple delegations', () => {
    test('getMessages delegates with defaults', async () => {
        const { svc, fakeManager } = makeService();
        await svc.getMessages('m', 'user');
        expect(fakeManager.getMessages).toHaveBeenCalledWith('user', 8, 0);
    });

    test('getMessagesNew delegates', async () => {
        const { svc, fakeManager } = makeService();
        await svc.getMessagesNew('m', 'user', 5, 10);
        expect(fakeManager.getMessagesNew).toHaveBeenCalledWith('user', 5, 10);
    });

    test('sendInlineMessage delegates', async () => {
        const { svc, fakeManager } = makeService();
        await svc.sendInlineMessage('m', 'chat', 'msg', 'url');
        expect(fakeManager.sendInlineMessage).toHaveBeenCalledWith('chat', 'msg', 'url');
    });

    test('getChatId delegates', async () => {
        const { svc, fakeManager } = makeService();
        expect(await svc.getChatId('m', 'user')).toBe('chatid');
        expect(fakeManager.getchatId).toHaveBeenCalledWith('user');
    });

    test('getLastActiveTime delegates', async () => {
        const { svc, fakeManager } = makeService();
        await svc.getLastActiveTime('m');
        expect(fakeManager.getLastActiveTime).toHaveBeenCalled();
    });

    test('createGroup, getmedia, getMe, getEntity, createNewSession delegate', async () => {
        const { svc, fakeManager } = makeService();
        expect(await svc.createGroup('m')).toBe('group');
        expect(await svc.getmedia('m')).toEqual(['media']);
        await svc.getMe('m');
        await svc.getEntity('m', 'ent');
        expect(await svc.createNewSession('m')).toBe('newsession');
        expect(fakeManager.getEntity).toHaveBeenCalledWith('ent');
    });

    test('blockUser, joinChannel delegate', async () => {
        const { svc, fakeManager } = makeService();
        expect(await svc.blockUser('m', 'c')).toBe('blocked');
        expect(await svc.joinChannel('m', 'ch')).toBeUndefined();
        expect(fakeManager.joinChannel).toHaveBeenCalledWith('ch');
    });

    test('updatePrivacyforDeletedAccount, deleteProfilePhotos delegate', async () => {
        const { svc, fakeManager } = makeService();
        await svc.updatePrivacyforDeletedAccount('m');
        await svc.deleteProfilePhotos('m');
        expect(fakeManager.updatePrivacyforDeletedAccount).toHaveBeenCalled();
        expect(fakeManager.deleteProfilePhotos).toHaveBeenCalled();
    });

    test('updateNameandBio, deleteChat, forwardMessage, forwardBulkMessages delegate', async () => {
        const { svc, fakeManager } = makeService();
        await svc.updateNameandBio('m', 'First', 'about');
        expect(fakeManager.updateProfile).toHaveBeenCalledWith('First', 'about');
        await svc.deleteChat('m', { peer: 'p' });
        expect(fakeManager.deleteChat).toHaveBeenCalledWith({ peer: 'p' });
        await svc.forwardMessage('m', 'to', 'from', 5);
        expect(fakeManager.forwardMessage).toHaveBeenCalledWith('to', 'from', 5);
        await svc.forwardBulkMessages('m', 'from', 'to', [1, 2]);
        expect(fakeManager.forwardMessages).toHaveBeenCalledWith('from', 'to', [1, 2]);
    });
});

describe('TelegramService — try/catch wrappers', () => {
    test('getGrpMembers returns members on success', async () => {
        const { svc } = makeService();
        expect(await svc.getGrpMembers('m', 'ent')).toEqual(['member']);
    });

    test('getGrpMembers swallows errors and returns undefined', async () => {
        const { svc } = makeService({ getGrpMembers: jest.fn().mockRejectedValue(new Error('x')) });
        expect(await svc.getGrpMembers('m', 'ent')).toBeUndefined();
    });

    test('addContact / addContacts succeed and swallow errors', async () => {
        const ok = makeService();
        expect(await ok.svc.addContact('m', [{ mobile: '1', tgId: 't' }], 'p')).toBe('addContact');
        expect(await ok.svc.addContacts('m', ['1'], 'p')).toBe('addContacts');

        const bad = makeService({
            addContact: jest.fn().mockRejectedValue(new Error('e')),
            addContacts: jest.fn().mockRejectedValue(new Error('e')),
        });
        expect(await bad.svc.addContact('m', [], 'p')).toBeUndefined();
        expect(await bad.svc.addContacts('m', [], 'p')).toBeUndefined();
    });

    test('getSelfMsgsInfo rethrows on error', async () => {
        const ok = makeService();
        expect(await ok.svc.getSelfMsgsInfo('m', 10)).toEqual({ total: 1 });
        const bad = makeService({ getSelfMSgsInfo: jest.fn().mockRejectedValue(new Error('e')) });
        await expect(bad.svc.getSelfMsgsInfo('m')).rejects.toThrow('e');
    });

    test('getCallLog rethrows on error', async () => {
        const ok = makeService();
        expect(await ok.svc.getCallLog('m', 5)).toEqual(['call']);
        const bad = makeService({ getCallLog: jest.fn().mockRejectedValue(new Error('cl')) });
        await expect(bad.svc.getCallLog('m')).rejects.toThrow('cl');
    });

    test('getMediaMetadata rethrows on error', async () => {
        const ok = makeService();
        expect(await ok.svc.getMediaMetadata('m', { chatId: 'c' })).toEqual({ meta: true });
        const bad = makeService({ getMediaMetadata: jest.fn().mockRejectedValue(new Error('mm')) });
        await expect(bad.svc.getMediaMetadata('m', { chatId: 'c' })).rejects.toThrow('mm');
    });

    test('sendMediaAlbum, sendVoiceMessage, getFilteredMedia rethrow on error', async () => {
        const bad = makeService({
            sendMediaAlbum: jest.fn().mockRejectedValue(new Error('a')),
            sendVoiceMessage: jest.fn().mockRejectedValue(new Error('v')),
            getFilteredMedia: jest.fn().mockRejectedValue(new Error('f')),
        });
        await expect(bad.svc.sendMediaAlbum('m', {} as any)).rejects.toThrow('a');
        await expect(bad.svc.sendVoiceMessage('m', { chatId: 'c', url: 'u' })).rejects.toThrow('v');
        await expect(bad.svc.getFilteredMedia('m', { chatId: 'c' })).rejects.toThrow('f');
    });

    test('getMediaFileDownloadInfo logs warn for known unavailable msgs, error otherwise, always rethrows', async () => {
        const warnCase = makeService({ getMediaFileDownloadInfo: jest.fn().mockRejectedValue(new Error('FILE_REFERENCE_EXPIRED')) });
        await expect(warnCase.svc.getMediaFileDownloadInfo('m', 1, 'c')).rejects.toThrow('FILE_REFERENCE_EXPIRED');
        const errCase = makeService({ getMediaFileDownloadInfo: jest.fn().mockRejectedValue(new Error('weird')) });
        await expect(errCase.svc.getMediaFileDownloadInfo('m', 1, 'c')).rejects.toThrow('weird');
        const ok = makeService();
        expect(await ok.svc.getMediaFileDownloadInfo('m', 1, 'c')).toEqual({ filename: 'f' });
    });

    test('getMediaFileDownloadInfo treats a messageless string rejection as unavailable', async () => {
        // GramJS sometimes rejects with a bare string (no .message); the `|| error`
        // fallback must still classify "unsupported media type" / "not found" as a warn.
        const stringCase = makeService({ getMediaFileDownloadInfo: jest.fn().mockRejectedValue('unsupported media type') });
        await expect(stringCase.svc.getMediaFileDownloadInfo('m', 1, 'c')).rejects.toBe('unsupported media type');
        const notFoundCase = makeService({ getMediaFileDownloadInfo: jest.fn().mockRejectedValue('entity not found') });
        await expect(notFoundCase.svc.getMediaFileDownloadInfo('m', 1, 'c')).rejects.toBe('entity not found');
    });

    test('getThumbnail logs warn for unavailable, error otherwise, always rethrows', async () => {
        const warnCase = makeService({ getThumbnail: jest.fn().mockRejectedValue(new Error('not available')) });
        await expect(warnCase.svc.getThumbnail('m', 1, 'c')).rejects.toThrow('not available');
        const errCase = makeService({ getThumbnail: jest.fn().mockRejectedValue(new Error('boom')) });
        await expect(errCase.svc.getThumbnail('m', 1, 'c', 'high')).rejects.toThrow('boom');
        const ok = makeService();
        expect(await ok.svc.getThumbnail('m', 1, 'c')).toEqual({ buffer: expect.any(Buffer) });
    });

    test('getThumbnail classifies messageless not-found/expired rejections as unavailable', async () => {
        const notFound = makeService({ getThumbnail: jest.fn().mockRejectedValue('thumbnail not found') });
        await expect(notFound.svc.getThumbnail('m', 1, 'c')).rejects.toBe('thumbnail not found');
        const expired = makeService({ getThumbnail: jest.fn().mockRejectedValue('FILE_REFERENCE_EXPIRED') });
        await expect(expired.svc.getThumbnail('m', 1, 'c')).rejects.toBe('FILE_REFERENCE_EXPIRED');
    });
});

describe('TelegramService — HttpException wrappers', () => {
    test('set2Fa returns success message', async () => {
        const { svc } = makeService();
        expect(await svc.set2Fa('m')).toBe('2Fa set successfully');
    });

    test('set2Fa throws HttpException on failure', async () => {
        const { svc } = makeService({ set2fa: jest.fn().mockRejectedValue(new Error('2fa fail')) });
        await expect(svc.set2Fa('m')).rejects.toBeInstanceOf(HttpException);
    });

    test('updatePrivacy returns success / throws HttpException', async () => {
        const ok = makeService();
        expect(await ok.svc.updatePrivacy('m')).toBe('Privacy updated successfully');
        const bad = makeService({ updatePrivacy: jest.fn().mockRejectedValue(new Error('p')) });
        await expect(bad.svc.updatePrivacy('m')).rejects.toBeInstanceOf(HttpException);
    });

    test('downloadProfilePic returns pic / throws on error', async () => {
        const ok = makeService();
        expect(await ok.svc.downloadProfilePic('m', 0)).toBe('pic');
        const bad = makeService({ downloadProfilePic: jest.fn().mockRejectedValue(new Error('d')) });
        await expect(bad.svc.downloadProfilePic('m', 0)).rejects.toThrow('Failed to update username');
    });

    test('updateUsername returns username / throws on error', async () => {
        const ok = makeService();
        expect(await ok.svc.updateUsername('m', 'newname')).toBe('newusername');
        const bad = makeService({ updateUsername: jest.fn().mockRejectedValue(new Error('u')) });
        await expect(bad.svc.updateUsername('m', 'x')).rejects.toThrow('Failed to update username');
    });
});

describe('TelegramService — setProfilePic', () => {
    test('sets 3 photos and unregisters', async () => {
        const { svc, fakeManager } = makeService();
        expect(await svc.setProfilePic('m', 'Name')).toBe('Profile pic set successfully');
        expect(CloudinaryService.getInstance).toHaveBeenCalledWith('Name');
        expect(fakeManager.deleteProfilePhotos).toHaveBeenCalled();
        expect(fakeManager.updateProfilePic).toHaveBeenCalledTimes(3);
        expect(mockConnectionManager.unregisterClient).toHaveBeenCalledWith('m');
    });

    test('throws HttpException and still unregisters on failure', async () => {
        (CloudinaryService.getInstance as jest.Mock).mockRejectedValueOnce(new Error('cloud'));
        const { svc } = makeService();
        await expect(svc.setProfilePic('m', 'Name')).rejects.toBeInstanceOf(HttpException);
        expect(mockConnectionManager.unregisterClient).toHaveBeenCalledWith('m');
    });
});

describe('TelegramService — updateUsernameForAClient', () => {
    test('skips update when current username already matches regex', async () => {
        const { svc, fakeManager } = makeService();
        // pattern: ^Joh\d+$  (firstPart=John->slice(0,4)=John? actually first 4 of "John")
        const result = await svc.updateUsernameForAClient('m', 'client9', 'John', 'john123');
        expect(result).toBe('john123');
        expect(fakeManager.updateUsername).not.toHaveBeenCalled();
    });

    test('generates a new username when current does not match', async () => {
        const { svc, fakeManager } = makeService();
        const result = await svc.updateUsernameForAClient('m', 'client9', 'John Doe', 'totally-different');
        expect(fakeManager.updateUsername).toHaveBeenCalled();
        expect(result).toBe('newusername');
    });

    test('builds a username for a single-word client name (no middle part)', async () => {
        // single-word name => middleName defaults to '' so middlePart is empty,
        // exercising the `middlePart ? ... : ''` false branch.
        const { svc, fakeManager } = makeService();
        const result = await svc.updateUsernameForAClient('m', 'client9', 'Madonna', 'totally-different');
        expect(fakeManager.updateUsername).toHaveBeenCalledWith(expect.stringMatching(/^Mado/));
        expect(result).toBe('newusername');
    });
});

describe('TelegramService — channel join / removeChannels', () => {
    test('tryJoiningChannel joins successfully', async () => {
        const { svc, fakeManager } = makeService();
        await svc.tryJoiningChannel('m', { username: 'chan', canSendMsgs: true, channelId: 'id1' } as any);
        expect(fakeManager.joinChannel).toHaveBeenCalledWith('chan');
    });

    test('tryJoiningChannel handles "No user has" (frozen account) then rethrows', async () => {
        const err = new Error('No user has this');
        const { svc } = makeService({ joinChannel: jest.fn().mockRejectedValue(err) });
        await expect(svc.tryJoiningChannel('m', { username: 'chan', channelId: 'id1' } as any)).rejects.toThrow('No user has');
    });

    test('tryJoiningChannel CHANNEL_PRIVATE error updates channel as private and rethrows', async () => {
        const err: any = new Error('private'); err.errorMessage = 'CHANNEL_PRIVATE';
        const { svc, services } = makeService({ joinChannel: jest.fn().mockRejectedValue(err) });
        await expect(svc.tryJoiningChannel('m', { username: 'chan', channelId: 'id1' } as any)).rejects.toBe(err);
        expect(services.channelsService.update).toHaveBeenCalledWith('id1', { private: true });
        expect(services.activeChannelsService.update).toHaveBeenCalledWith('id1', { private: true });
    });

    test('removeChannels no-op for USERNAME_INVALID', async () => {
        const { svc, services } = makeService();
        await svc.removeChannels({ errorMessage: 'USERNAME_INVALID' }, 'id', 'u', 'm');
        expect(services.channelsService.update).not.toHaveBeenCalled();
    });
});

describe('TelegramService — forwardMedia & forwardMediaToBot', () => {
    test('forwardMedia initiates and schedules leave', async () => {
        jest.useFakeTimers();
        const { svc, fakeManager } = makeService();
        const result = await svc.forwardMedia('m', 'chan', 'from');
        expect(result).toBe('Media forward initiated');
        expect(fakeManager.forwardMedia).toHaveBeenCalledWith('chan', 'from');
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    test('forwardMediaToBot collects matching channels and persists them', async () => {
        const chatEntity = {
            id: { toString: () => '900' },
            participantsCount: 100,
            broadcast: true,
            title: 'chat group', // matches shouldMatch() regex
        };
        const dialogs = [{ isChannel: true, isGroup: false, entity: chatEntity }];
        const fakeManager = makeFakeManager();
        fakeManager.client.iterDialogs = jest.fn(() => ({
            async *[Symbol.asyncIterator]() {
                for (const d of dialogs) yield d;
            },
        }));
        mockConnectionManager.getClient.mockResolvedValue(fakeManager);
        mockLiveFacts.mockResolvedValue({
            canSendMsgs: true,
            participantsCount: 100,
            title: 'T',
            broadcast: true,
            megagroup: false,
            restricted: false,
            sendMessages: true,
            sendPlain: true,
            username: 'u',
        });
        const services = makeServices();
        const svc = new TelegramService(services.usersService, services.activeChannelsService, services.channelsService, services.bufferClientService, services.promoteClientService);

        const result = await svc.forwardMediaToBot('m', 'from');
        expect(result).toBe('Media forward initiated successfully');
        expect(services.channelsService.createMultiple).toHaveBeenCalledWith([
            expect.objectContaining({ channelId: '900', canSendMsgs: true, participantsCount: 100 }),
        ]);
        expect(mockConnectionManager.unregisterClient).toHaveBeenCalledWith('m');
    });

    test('forwardMediaToBot skips DMs, unresolved channels, and fills defaults for sparse facts', async () => {
        // Realistic mixed dialog set: a private chat (filtered out), a channel whose
        // live facts cannot be resolved (skipped), and a matching channel that omits
        // most optional fields — exercising the filter-false, null-facts and
        // ||-default / === true fallback branches.
        const privateChat = { isChannel: false, isGroup: false, entity: { id: { toString: () => '1' } } };
        const unresolved = { isChannel: true, isGroup: false, entity: { id: { toString: () => '2' } } };
        const sparseEntity = { id: { toString: () => '300' }, participantsCount: 80, title: 'sparse chat' };
        const matching = { isChannel: false, isGroup: true, entity: sparseEntity };
        const dialogs = [privateChat, unresolved, matching];

        const fakeManager = makeFakeManager();
        fakeManager.client.iterDialogs = jest.fn(() => ({
            async *[Symbol.asyncIterator]() { for (const d of dialogs) yield d; },
        }));
        mockConnectionManager.getClient.mockResolvedValue(fakeManager);
        mockLiveFacts
            .mockResolvedValueOnce(null) // unresolved channel -> continue
            .mockResolvedValueOnce({
                // sparse facts: missing title/username, non-true booleans
                canSendMsgs: true,
                participantsCount: 80,
                broadcast: 'yes',
                megagroup: undefined,
            });

        const services = makeServices();
        const svc = new TelegramService(services.usersService, services.activeChannelsService, services.channelsService, services.bufferClientService, services.promoteClientService);

        const result = await svc.forwardMediaToBot('m', 'from');
        expect(result).toBe('Media forward initiated successfully');
        // participantsCount falls back from entity.participantsCount (80 > 50 => matches),
        // and title/username default to empty strings, booleans to false.
        expect(services.channelsService.createMultiple).toHaveBeenCalledWith([
            expect.objectContaining({
                channelId: '300', canSendMsgs: true, participantsCount: 80,
                title: '', username: '', broadcast: false, megagroup: false,
            }),
        ]);
    });

    test('forwardMediaToBot returns failure message on error', async () => {
        const { svc } = makeService({ forwardMedia: jest.fn().mockRejectedValue(new Error('fm fail')) });
        const result = await svc.forwardMediaToBot('m', 'from');
        expect(result).toContain('Media forward failed');
    });
});

describe('TelegramService — channel info / leave', () => {
    test('getChannelInfo delegates to channelInfo util', async () => {
        const { svc } = makeService();
        const result = await svc.getChannelInfo('m', true);
        expect(mockChannelInfo).toHaveBeenCalled();
        expect(result).toHaveProperty('canSendFalseChats');
    });

    test('getChannelInfo defaults sendIds to false when the flag is omitted', async () => {
        const { svc } = makeService();
        await svc.getChannelInfo('m');
        expect(mockChannelInfo).toHaveBeenCalledWith(expect.anything(), false);
    });

    test('leaveChannels leaves canSendFalse chats', async () => {
        const { svc, fakeManager } = makeService();
        expect(await svc.leaveChannels('m')).toBe('Left channels initiated');
        expect(fakeManager.leaveChannels).toHaveBeenCalledWith(['c1', 'c2']);
    });

    test('leaveChannel leaves a single channel', async () => {
        const { svc, fakeManager } = makeService();
        expect(await svc.leaveChannel('m', 'ch')).toBe('Left channel initiated');
        expect(fakeManager.leaveChannels).toHaveBeenCalledWith(['ch']);
    });
});

describe('TelegramService — connection management', () => {
    test('getConnectionStatus reports counts', async () => {
        const { svc } = makeService();
        mockConnectionManager.getActiveConnectionCount.mockReturnValue(3);
        const status = await svc.getConnectionStatus();
        expect(status).toEqual({ activeConnections: 3, rateLimited: 0, totalOperations: 0 });
    });

    test('connect/disconnect/disconnectAll/getConnectionStats/getClientState/getActiveConnectionCount', async () => {
        const { svc } = makeService();
        await svc.connect('m', { autoDisconnect: true } as any);
        expect(mockConnectionManager.getClient).toHaveBeenCalledWith('m', { autoDisconnect: true });
        await svc.disconnect('m');
        expect(mockConnectionManager.unregisterClient).toHaveBeenCalledWith('m');
        await svc.disconnectAll();
        expect(mockConnectionManager.disconnectAll).toHaveBeenCalled();
        mockConnectionManager.getConnectionStats.mockReturnValue({ total: 1 });
        expect(svc.getConnectionStats()).toEqual({ total: 1 });
        mockConnectionManager.getClientState.mockReturnValue({ state: 'connected' });
        expect(svc.getClientState('m')).toEqual({ state: 'connected' });
        mockConnectionManager.getActiveConnectionCount.mockReturnValue(7);
        expect(svc.getActiveConnectionCount()).toBe(7);
    });
});

describe('TelegramService — getAuths / removeOtherAuths', () => {
    // notifbot() (via logbots) requires BOT_TOKENS to be configured.
    let prevBotTokens: string | undefined;
    beforeAll(() => { prevBotTokens = process.env.BOT_TOKENS; process.env.BOT_TOKENS = 'tok1'; });
    afterAll(() => { if (prevBotTokens === undefined) delete process.env.BOT_TOKENS; else process.env.BOT_TOKENS = prevBotTokens; });

    test('getAuths logs and returns', async () => {
        const { svc } = makeService();
        const auths = await svc.getAuths('m');
        expect(auths.authorizations).toHaveLength(1);
    });

    test('getAuths logs a zero count when the response has no authorizations list', async () => {
        // defensive fallback: `auths?.authorizations?.length || 0` when the client
        // returns an object without an authorizations array.
        const { svc } = makeService({ getAuths: jest.fn().mockResolvedValue({}) });
        const auths = await svc.getAuths('m');
        expect(auths).toEqual({});
    });

    test('removeOtherAuths sends success notification', async () => {
        const { svc } = makeService();
        expect(await svc.removeOtherAuths('m')).toBe('Removed other authorizations');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('text='), { timeout: 5000 });
    });

    test('removeOtherAuths sends failure notification and rethrows', async () => {
        const { svc } = makeService({ removeOtherAuths: jest.fn().mockRejectedValue(new Error('auth fail')) });
        await expect(svc.removeOtherAuths('m')).rejects.toThrow('auth fail');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('Failed'), { timeout: 5000 });
    });

    test('removeOtherAuths handles non-Error rejection', async () => {
        const { svc } = makeService({ removeOtherAuths: jest.fn().mockRejectedValue('stringErr') });
        await expect(svc.removeOtherAuths('m')).rejects.toBe('stringErr');
    });
});

describe('TelegramService — processBatch', () => {
    test('processes all batches with delay between them', async () => {
        jest.useFakeTimers();
        const { svc } = makeService();
        const processor = jest.fn().mockResolvedValue(undefined);
        const promise = svc.processBatch([1, 2, 3, 4, 5], 2, processor, 10);
        await jest.runAllTimersAsync();
        const result = await promise;
        expect(result.processed).toBe(5);
        expect(result.errors).toHaveLength(0);
        expect(processor).toHaveBeenCalledTimes(3);
        jest.useRealTimers();
    });

    test('collects processor errors and continues', async () => {
        const { svc } = makeService();
        const processor = jest.fn().mockRejectedValue(new Error('batch err'));
        const result = await svc.processBatch([1, 2], 2, processor, 0);
        expect(result.processed).toBe(0);
        expect(result.errors).toHaveLength(1);
    });

    test('processes a single batch using the default inter-batch delay', async () => {
        // omit the delayMs argument -> default 2000ms; single batch means no delay
        // is actually awaited, so this resolves immediately without fake timers.
        const { svc } = makeService();
        const processor = jest.fn().mockResolvedValue(undefined);
        const result = await svc.processBatch([1, 2], 5, processor);
        expect(result.processed).toBe(2);
        expect(processor).toHaveBeenCalledTimes(1);
    });
});

describe('TelegramService — group/message/contact/session delegations', () => {
    test('createGroupWithOptions extracts groupId from chats', async () => {
        const { svc } = makeService();
        const result = await svc.createGroupWithOptions('m', {} as any);
        expect(result).toHaveProperty('chats');
    });

    test('createGroupWithOptions tolerates result without chats', async () => {
        const { svc } = makeService({ createGroupOrChannel: jest.fn().mockResolvedValue({}) });
        expect(await svc.createGroupWithOptions('m', {} as any)).toEqual({});
    });

    test('updateGroupSettings / scheduleMessage / getScheduledMessages', async () => {
        const { svc, fakeManager } = makeService();
        await svc.updateGroupSettings('m', { groupId: 'g' });
        expect(await svc.scheduleMessage('m', { chatId: 'c', message: 'hi', scheduledTime: new Date() } as any)).toBe('scheduled');
        expect(fakeManager.scheduleMessageSend).toHaveBeenCalled();
        expect(await svc.getScheduledMessages('m', 'c')).toEqual(['sm']);
    });

    test('sendMessage / cleanupChat / getChatStatistics / updatePrivacyBatch', async () => {
        const { svc } = makeService();
        expect(await svc.sendMessage('m', { chatId: 'c', message: 'x' } as any)).toBe('sent');
        expect(await svc.cleanupChat('m', { chatId: 'c' })).toBe('clean');
        expect(await svc.getChatStatistics('m', 'c', 'week')).toEqual({ stat: 1 });
        expect(await svc.updatePrivacyBatch('m', {})).toBe('privbatch');
    });

    test('group member ops delegate', async () => {
        const { svc, fakeManager } = makeService();
        await svc.addGroupMembers('m', 'g', ['u']);
        await svc.removeGroupMembers('m', 'g', ['u']);
        await svc.promoteToAdmin('m', 'g', 'u', { banUsers: true }, 'rank');
        await svc.demoteAdmin('m', 'g', 'u');
        await svc.unblockGroupUser('m', 'g', 'u');
        expect(await svc.getGroupAdmins('m', 'g')).toEqual(['admin']);
        expect(await svc.getGroupBannedUsers('m', 'g')).toEqual(['banned']);
        expect(fakeManager.promoteToAdmin).toHaveBeenCalledWith('g', 'u', { banUsers: true }, 'rank');
    });

    test('searchMessages / contact + folder + session delegations', async () => {
        const { svc } = makeService();
        await svc.searchMessages('m', { query: 'q' } as any);
        expect(await svc.exportContacts('m', 'csv', true)).toBe('exported');
        // omitting includeBlocked uses the default (false)
        expect(await svc.exportContacts('m', 'vcard')).toBe('exported');
        expect(await svc.importContacts('m', [{ firstName: 'A', phone: '1' }])).toBe('imported');
        expect(await svc.manageBlockList('m', ['u'], true)).toBe('blocklist');
        expect(await svc.manageBlockList('m', ['u'], false)).toBe('blocklist');
        expect(await svc.getContactStatistics('m')).toEqual({ contacts: 1 });
        expect(await svc.createChatFolder('m', { name: 'F', includedChats: [] })).toBe('folder');
        expect(await svc.getChatFolders('m')).toEqual(['folder']);
        expect(await svc.getSessionInfo('m')).toEqual({ session: 1 });
        expect(await svc.terminateSession('m', { hash: 'h', type: 'app' })).toBe('terminated');
        expect(await svc.editMessage('m', { chatId: 'c', messageId: 1 })).toBe('edited');
        expect(await svc.getContacts('m')).toEqual(['contact']);
    });

    test('updateChatSettings requires chatId', async () => {
        const { svc } = makeService();
        await expect(svc.updateChatSettings('m', { chatId: '' })).rejects.toThrow('chatId is required');
        expect(await svc.updateChatSettings('m', { chatId: 'c' })).toBe('chatset');
    });

    test('sendMediaBatch / getDialogs / getFileUrl / getMessageStats / media counts / call history', async () => {
        const { svc } = makeService();
        expect(await svc.sendMediaBatch('m', { chatId: 'c', media: [] })).toBe('mediabatch');
        expect(await svc.getDialogs('m', { limit: 5 })).toEqual({ items: [] });
        expect(await svc.getFileUrl('m', 'u', 'f')).toBe('http://file');
        expect(await svc.getMessageStats('m', { chatId: 'c', period: 'day' })).toEqual({ stats: 1 });
        expect(await svc.getChatMediaCounts('m', 'c')).toEqual({ photo: 1 });
        expect(await svc.getChatCallHistory('m', 'c', 10, true)).toEqual({ totalCalls: 1 });
    });
});

describe('TelegramService — getSecurityStatus', () => {
    test('returns security status and syncs 2FA when different', async () => {
        const fakeManager = makeFakeManager();
        fakeManager.client.invoke = jest.fn().mockResolvedValue({ hasPassword: true, hint: 'hint', hasRecovery: true, pendingResetDate: 1700000000 });
        mockConnectionManager.getClient.mockResolvedValue(fakeManager);
        mockConnectionManager.hasClient.mockReturnValue(false);
        const services = makeServices();
        const svc = new TelegramService(services.usersService, services.activeChannelsService, services.channelsService, services.bufferClientService, services.promoteClientService);

        const status = await svc.getSecurityStatus('m');
        expect(status.security.has2FA).toBe(true);
        expect(status.security.hint).toBe('hint');
        expect(status.tgId).toBe('tg1');
        // wasConnected false -> unregister called
        expect(mockConnectionManager.unregisterClient).toHaveBeenCalledWith('m');
        expect(services.usersService.update).toHaveBeenCalledWith('tg1', { twoFA: true });
    });

    test('does not unregister when client was already connected, tolerates user sync errors', async () => {
        const fakeManager = makeFakeManager();
        fakeManager.client.invoke = jest.fn().mockResolvedValue({ hasPassword: false });
        mockConnectionManager.getClient.mockResolvedValue(fakeManager);
        mockConnectionManager.hasClient.mockReturnValue(true);
        const services = makeServices();
        services.usersService.search.mockRejectedValue(new Error('db down'));
        const svc = new TelegramService(services.usersService, services.activeChannelsService, services.channelsService, services.bufferClientService, services.promoteClientService);

        const status = await svc.getSecurityStatus('m');
        expect(status.security.has2FA).toBe(false);
        expect(status.security.pendingResetDate).toBeNull();
        expect(mockConnectionManager.unregisterClient).not.toHaveBeenCalled();
    });

    test('handles a freshly-provisioned account with no sessions and a bare profile', async () => {
        // brand-new account: getAuths returns no authorizations list and getMe lacks
        // username/lastName -> exercises `authorizations || []`, `username || null`,
        // `lastName || null`, and the `find(current) || null` fallbacks.
        const fakeManager = makeFakeManager();
        fakeManager.client.invoke = jest.fn().mockResolvedValue({ hasPassword: false });
        fakeManager.getAuths = jest.fn().mockResolvedValue({});
        fakeManager.getMe = jest.fn().mockResolvedValue({ id: { toString: () => 'tg9' }, firstName: 'New', phone: '910000000001' });
        mockConnectionManager.getClient.mockResolvedValue(fakeManager);
        mockConnectionManager.hasClient.mockReturnValue(true);
        const services = makeServices();
        const svc = new TelegramService(services.usersService, services.activeChannelsService, services.channelsService, services.bufferClientService, services.promoteClientService);

        const status = await svc.getSecurityStatus('m');
        expect(status.sessions.count).toBe(0);
        expect(status.sessions.current).toBeNull();
        expect(status.username).toBeNull();
        expect(status.lastName).toBeNull();
    });
});

describe('TelegramService — getTopPrivateChats', () => {
    test('delegates with excluded tgIds on success', async () => {
        const { svc, fakeManager } = makeService();
        await svc.getTopPrivateChats('m', 5, true, 100);
        expect(fakeManager.getTopPrivateChats).toHaveBeenCalledWith(5, true, 100, expect.any(Set));
    });

    test('rethrows on error', async () => {
        const { svc } = makeService({ getTopPrivateChats: jest.fn().mockRejectedValue(new Error('tp')) });
        await expect(svc.getTopPrivateChats('m')).rejects.toThrow('tp');
    });
});

describe('TelegramService — bot helpers', () => {
    test('getBotInfo returns result on ok', async () => {
        const { svc } = makeService();
        const info = await svc.getBotInfo('token');
        expect(info).toEqual({ id: 'botid', username: 'botuser' });
    });

    test('getBotInfo throws when api returns not ok', async () => {
        mockFetch.mockResolvedValueOnce({ data: { ok: false } });
        const { svc } = makeService();
        await expect(svc.getBotInfo('token')).rejects.toThrow('Failed to get bot info');
    });

    test('getBotInfo throws on fetch error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('net'));
        const { svc } = makeService();
        await expect(svc.getBotInfo('token')).rejects.toThrow('Failed to get bot info: net');
    });

    test('addBotsToChannel throws when no bot tokens configured', async () => {
        const prev = process.env.BOT_TOKENS;
        delete process.env.BOT_TOKENS;
        const { svc } = makeService();
        await expect(svc.addBotsToChannel('m', ['ch'])).rejects.toThrow('No bot tokens configured');
        if (prev !== undefined) process.env.BOT_TOKENS = prev;
    });

    test('addBotsToChannel falls back to the env-configured channel list when none are passed', async () => {
        // omitting channelIds uses the default [accountsChannel, updatesChannel, ...]
        // env-derived list. Provide one env channel so the default array has a real id.
        const prevTokens = process.env.BOT_TOKENS;
        const prevAcct = process.env.accountsChannel;
        process.env.BOT_TOKENS = 'tok1';
        process.env.accountsChannel = 'envchan';
        const { svc, fakeManager } = makeService();
        await svc.addBotsToChannel('m');
        expect(fakeManager.joinChannel).toHaveBeenCalledWith('envchan');
        if (prevTokens === undefined) delete process.env.BOT_TOKENS; else process.env.BOT_TOKENS = prevTokens;
        if (prevAcct === undefined) delete process.env.accountsChannel; else process.env.accountsChannel = prevAcct;
    });

    test('addBotsToChannel sets up bot in each channel', async () => {
        process.env.BOT_TOKENS = 'tok1';
        const { svc, fakeManager } = makeService();
        await svc.addBotsToChannel('m', ['ch1', 'ch2']);
        // joinChannel + promoteToAdmin called per channel (twice each in setupBotInChannel)
        expect(fakeManager.joinChannel).toHaveBeenCalledWith('ch1');
        expect(fakeManager.promoteToAdmin).toHaveBeenCalled();
        delete process.env.BOT_TOKENS;
    });

    test('addBotsToChannel swallows per-token errors', async () => {
        process.env.BOT_TOKENS = 'tok1';
        mockFetch.mockRejectedValueOnce(new Error('botinfo fail'));
        const { svc } = makeService();
        await expect(svc.addBotsToChannel('m', ['ch1'])).resolves.toBeUndefined();
        delete process.env.BOT_TOKENS;
    });

    test('setupBotInChannel swallows join + promote errors', async () => {
        const { svc } = makeService({
            joinChannel: jest.fn().mockRejectedValue(new Error('join')),
            promoteToAdmin: jest.fn().mockRejectedValue(new Error('promote')),
        });
        await expect(svc.setupBotInChannel('m', 'ch', 'bid', 'buser', {})).resolves.toBeUndefined();
    });

    test('createBot delegates', async () => {
        const { svc } = makeService();
        expect(await svc.createBot('m', { name: 'b' } as any)).toEqual({ botToken: 'tok' });
    });
});

describe('TelegramService — streamMediaFile generator', () => {
    test('yields chunks from manager stream', async () => {
        async function* gen() { yield Buffer.from('a'); yield Buffer.from('b'); }
        const { svc } = makeService({ streamMediaFile: jest.fn().mockReturnValue(gen()) });
        const chunks: Buffer[] = [];
        for await (const c of svc.streamMediaFile('m', { loc: 1 })) chunks.push(c as Buffer);
        expect(chunks).toHaveLength(2);
    });
});

describe('TelegramService — sendViewOnceMedia', () => {
    test('path source reads file and sends', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('vid'));
        const { svc, fakeManager } = makeService();
        const result = await svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'path', path: '/tmp/x.mp4' });
        expect(result).toBe('viewonce');
        expect(fakeManager.sendViewOnceMedia).toHaveBeenCalledWith('c', expect.any(Buffer), undefined, true, 'x.mp4');
    });

    test('path source throws BadRequest when path missing', async () => {
        const { svc } = makeService();
        await expect(svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'path' })).rejects.toBeInstanceOf(BadRequestException);
    });

    test('path source throws BadRequest when file not found', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        const { svc } = makeService();
        await expect(svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'path', path: '/no/file.jpg' })).rejects.toBeInstanceOf(BadRequestException);
    });

    test('path source wraps read errors in BadRequest', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockImplementation(() => { throw new Error('read fail'); });
        const { svc } = makeService();
        await expect(svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'path', path: '/tmp/x.jpg' })).rejects.toBeInstanceOf(BadRequestException);
    });

    test('base64 source sends decoded buffer (video by extension)', async () => {
        const { svc, fakeManager } = makeService();
        await svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'base64', base64Data: Buffer.from('x').toString('base64'), filename: 'clip.mov' });
        expect(fakeManager.sendViewOnceMedia).toHaveBeenCalledWith('c', expect.any(Buffer), undefined, true, 'clip.mov');
    });

    test('base64 source throws BadRequest when data missing', async () => {
        const { svc } = makeService();
        await expect(svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'base64' })).rejects.toBeInstanceOf(BadRequestException);
    });

    test('binary source sends buffer (non-video filename)', async () => {
        const { svc, fakeManager } = makeService();
        await svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'binary', binaryData: Buffer.from('b'), filename: 'pic.jpg' });
        expect(fakeManager.sendViewOnceMedia).toHaveBeenCalledWith('c', expect.any(Buffer), undefined, false, 'pic.jpg');
    });

    test('binary source without a filename logs "unknown" and treats media as non-video', async () => {
        // no filename => `filename || 'unknown'` fallback in the log, and the
        // `if (filename)` guard is skipped so isVideo stays false.
        const { svc, fakeManager } = makeService();
        await svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'binary', binaryData: Buffer.from('b') });
        expect(fakeManager.sendViewOnceMedia).toHaveBeenCalledWith('c', expect.any(Buffer), undefined, false, undefined);
    });

    test('binary source with an extension-less filename is treated as non-video', async () => {
        // filename present but no dot/extension => `ext &&` short-circuits to false.
        const { svc, fakeManager } = makeService();
        await svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'binary', binaryData: Buffer.from('b'), filename: 'rawfile' });
        expect(fakeManager.sendViewOnceMedia).toHaveBeenCalledWith('c', expect.any(Buffer), undefined, false, 'rawfile');
    });

    test('binary source throws BadRequest when data missing', async () => {
        const { svc } = makeService();
        await expect(svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'binary' })).rejects.toBeInstanceOf(BadRequestException);
    });

    test('throws BadRequest for invalid source type', async () => {
        const { svc } = makeService();
        await expect(svc.sendViewOnceMedia('m', { chatId: 'c', sourceType: 'bogus' as any })).rejects.toBeInstanceOf(BadRequestException);
    });
});
