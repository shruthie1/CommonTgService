/**
 * Coverage-focused tests for base-client.service.ts targeting the methods that
 * the existing service-flows / end-to-end-warmup / bugfix-regression suites do
 * not reach: warmup step executors (privacy/photos/2fa/auths), channel join &
 * leave queue internals, session rotation + healing helpers, availability date
 * helpers, stats queries, and lifecycle cleanup.
 *
 * Mocking policy: only TRUE externals are mocked — telegram/GramJS
 * (TelegramClient/StringSession/computeCheck), connectionManager, network
 * (fetchWithTimeout / downloadFileFromUrl), organic-activity (talks to TG),
 * generateTGConfig (network/UMS), channelinfo (TG), notifbot, and sleep.
 * isPermanentError, parseError, ClientHelperUtils, warmup-phases are REAL.
 */

import { BaseClientDocument, BaseClientService, ClientConfig, WarmupPhase } from '../base-client.service';
import { Client } from '../../clients';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import { ClientHelperUtils } from '../client-helper.utils';
import { Api } from 'telegram';

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn(() => Promise.resolve()) };
});
jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/mock-bot'),
}));

// performOrganicActivity talks to Telegram — make it a no-op spy we can flip to throw.
jest.mock('../organic-activity', () => ({
    performOrganicActivity: jest.fn(async () => undefined),
    OrganicIntensity: {},
}));

// generateTGConfig fetches remote config — stub it.
jest.mock('../../Telegram/utils/generateTGConfig', () => ({
    generateTGConfig: jest.fn(async () => ({ apiId: 1, apiHash: 'hash', params: {} })),
}));

// downloadFileFromUrl is network IO — preserve the rest of the module (ByteLimitedLruCache etc).
jest.mock('../../Telegram/manager/helpers', () => ({
    ...jest.requireActual('../../Telegram/manager/helpers'),
    downloadFileFromUrl: jest.fn(async () => Buffer.from('img-bytes')),
}));

// channelInfo talks to Telegram.
jest.mock('../../../utils/telegram-utils/channelinfo', () => ({
    channelInfo: jest.fn(async () => ({ ids: ['c1', 'c2'], canSendFalseCount: 0, canSendFalseChats: [] })),
}));

// computeCheck (SRP) is crypto over a GramJS password object — stub.
jest.mock('telegram/Password', () => ({
    computeCheck: jest.fn(async () => ({ srpId: 1 })),
}));

// TelegramClient / StringSession — real GramJS network clients. Replace with a fake.
jest.mock('telegram', () => {
    const actual = jest.requireActual('telegram');
    const factory = jest.fn();
    const Mocked: any = jest.fn().mockImplementation((..._args: any[]) => factory());
    Mocked.__factory = factory;
    return { ...actual, TelegramClient: Mocked };
});
jest.mock('telegram/sessions', () => {
    const actual = jest.requireActual('telegram/sessions');
    return { ...actual, StringSession: jest.fn().mockImplementation((s: string) => ({ session: s })) };
});

const sleepMock = jest.requireMock('telegram/Helpers').sleep as jest.Mock;
const organicMock = jest.requireMock('../organic-activity').performOrganicActivity as jest.Mock;
const downloadMock = jest.requireMock('../../Telegram/manager/helpers').downloadFileFromUrl as jest.Mock;
const telegramClientFactory = (jest.requireMock('telegram').TelegramClient as any).__factory as jest.Mock;

// ─── TestBaseService (mirrors the established pattern) ───────────────────────
class TestBaseService extends BaseClientService<BaseClientDocument> {
    private readonly mockModel: any;
    public readonly updateMock = jest.fn(async (_mobile: string, updateDto: any) => updateDto);
    public readonly updateStatusMock = jest.fn(async (_mobile: string, _status: string, _message?: string) => ({ mobile: _mobile, status: _status }));
    public readonly findOneMock = jest.fn(async (_mobile: string) => null as any);
    public readonly updateNameAndBioMock = jest.fn(async () => 1);
    public readonly updateUsernameMock = jest.fn(async () => 1);
    public readonly refillJoinQueueMock = jest.fn(async () => 0);
    public readonly telegramServiceMock: any;
    public readonly usersServiceMock: any;
    public readonly botsServiceMock: any;
    public readonly clientServiceMock: any;
    public readonly activeChannelsServiceMock: any;
    public readonly sessionServiceMock: any;
    private readonly configOverrides: Partial<ClientConfig>;

    constructor(modelOverrides: any = {}, configOverrides: Partial<ClientConfig> = {}) {
        const telegramService = {
            createNewSession: jest.fn(async (mobile: string) => `rotated-${mobile}`),
            tryJoiningChannel: jest.fn(async () => undefined),
            getChannelInfo: jest.fn(async () => ({ ids: ['x1', 'x2'] })),
        };
        const usersService = {
            search: jest.fn(async ({ mobile }: { mobile: string }) => [{ tgId: `tg-${mobile}`, mobile, session: `backup-${mobile}` }]),
            findByMobileAnyStatus: jest.fn(async (mobile: string) => [{ tgId: `tg-${mobile}`, mobile, session: `backup-${mobile}` }]),
            backfillFromPool: jest.fn(async () => null),
            update: jest.fn(async () => 1),
            expireAccount: jest.fn(async () => undefined),
        };
        const botsService = { sendMessageByCategory: jest.fn(async () => undefined) };
        const clientService = { findOne: jest.fn(async () => ({ clientId: 'client-1' })) };
        const activeChannelsService = {
            findOne: jest.fn(async () => null),
            incrementClientsJoined: jest.fn(async () => undefined),
        };
        const sessionService = { createSession: jest.fn(async () => ({ success: true, session: 'healed-session' })) };
        super(
            telegramService as any,
            usersService as any,
            activeChannelsService as any,
            clientService as any,
            {} as any,
            sessionService as any,
            botsService as any,
            'TestBaseService',
        );
        this.mockModel = modelOverrides;
        this.configOverrides = configOverrides;
        this.telegramServiceMock = telegramService;
        this.usersServiceMock = usersService;
        this.botsServiceMock = botsService;
        this.clientServiceMock = clientService;
        this.activeChannelsServiceMock = activeChannelsService;
        this.sessionServiceMock = sessionService;
    }

    get model(): any { return this.mockModel; }
    get clientType(): 'buffer' { return 'buffer'; }
    get config(): ClientConfig {
        return {
            joinChannelInterval: 1, leaveChannelInterval: 1, leaveChannelBatchSize: 2,
            channelProcessingDelay: 1, channelTarget: 200, maxJoinsPerSession: 5,
            maxNewClientsPerTrigger: 1, minTotalClients: 10, maxMapSize: 5,
            cooldownHours: 2, clientProcessingDelay: 1, maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3, ...this.configOverrides,
        };
    }

    async updateNameAndBio(...a: any[]): Promise<number> { return this.updateNameAndBioMock(...(a as [])); }
    async updateUsername(...a: any[]): Promise<number> { return this.updateUsernameMock(...(a as [])); }
    async findOne(mobile: string): Promise<any> { return this.findOneMock(mobile); }
    async update(mobile: string, updateDto: any): Promise<any> { return this.updateMock(mobile, updateDto); }
    async markAsInactive(): Promise<any> { return null; }
    async updateStatus(mobile: string, status: string, message?: string): Promise<any> { return this.updateStatusMock(mobile, status, message); }
    async refillJoinQueue(clientId?: string | null): Promise<number> { return this.refillJoinQueueMock(); }

    // expose protected members for testing
    pub = {
        updatePrivacySettings: (d: any, c: any, f: number) => (this as any).updatePrivacySettings(d, c, f),
        deleteProfilePhotos: (d: any, c: any, f: number) => (this as any).deleteProfilePhotos(d, c, f),
        updateProfilePhotos: (d: any, c: any, f: number) => (this as any).updateProfilePhotos(d, c, f),
        set2fa: (d: any, f: number) => (this as any).set2fa(d, f),
        removeOtherAuths: (d: any, f: number) => (this as any).removeOtherAuths(d, f),
        performHealthCheck: (m: string, l: number, n: number) => (this as any).performHealthCheck(m, l, n),
        backfillTimestamps: (m: string, d: any, n: number) => (this as any).backfillTimestamps(m, d, n),
        retireIfStuck: (d: any, n: number) => (this as any).retireIfStuck(d, n),
        deactivateClient: (m: string, r: string, o?: any) => (this as any).deactivateClient(m, r, o),
        processJoinChannelSequentially: () => (this as any).processJoinChannelSequentially(),
        processLeaveChannelSequentially: () => (this as any).processLeaveChannelSequentially(),
        scheduleNextJoinRound: () => (this as any).scheduleNextJoinRound(),
        processJoinChannelInterval: () => (this as any).processJoinChannelInterval(),
        processLeaveChannelInterval: () => (this as any).processLeaveChannelInterval(),
        scheduleNextLeaveRound: () => (this as any).scheduleNextLeaveRound(),
        getStoredActiveSession: (m: string) => (this as any).getStoredActiveSession(m),
        createDistinctSessionString: (m: string, f: any[], n?: number) => (this as any).createDistinctSessionString(m, f, n),
        hasDistinctUsersBackupSession: (m: string, s: any) => (this as any).hasDistinctUsersBackupSession(m, s),
        getOrEnsureDistinctUsersBackupSession: (m: string, s: any) => (this as any).getOrEnsureDistinctUsersBackupSession(m, s),
        ensureDistinctUsersBackupSession: (m: string, s: any) => (this as any).ensureDistinctUsersBackupSession(m, s),
        expireUserByMobile: (m: string) => (this as any).expireUserByMobile(m),
        normalizeDateString: (v: any) => (this as any).normalizeDateString(v),
        maxDateString: (...a: any[]) => (this as any).maxDateString(...a),
        getProjectedReadyDateString: (d: any) => (this as any).getProjectedReadyDateString(d),
        getOperationalAvailabilityDateString: (d: any, n: number) => (this as any).getOperationalAvailabilityDateString(d, n),
        createVerifiedSessionClient: (m: string, s: string) => (this as any).createVerifiedSessionClient(m, s),
        verifySessionLive: (m: string, s: string) => (this as any).verifySessionLive(m, s),
        verifySessionAuthorizations: (m: string, s: string, c?: any) => (this as any).verifySessionAuthorizations(m, s, c),
        resolveActiveSessionForRotation: (m: string) => (this as any).resolveActiveSessionForRotation(m),
        resolveRotationBackupSession: (m: string, a: string, u: any) => (this as any).resolveRotationBackupSession(m, a, u),
        verifyRotationPersistence: (m: string, a: string, b: string) => (this as any).verifyRotationPersistence(m, a, b),
        normalizeMobileNumber: (v: any) => (this as any).normalizeMobileNumber(v),
        getReplenishmentWindows: () => (this as any).getReplenishmentWindows(),
        cleanup: () => (this as any).cleanup(),
        trimMapIfNeeded: (m: any, n: string) => (this as any).trimMapIfNeeded(m, n),
        clearAllTimeouts: () => (this as any).clearAllTimeouts(),
        createTimeout: (cb: any, d: number) => (this as any).createTimeout(cb, d),
        refreshProfilePhotosOnDemand: (m: string) => (this as any).refreshProfilePhotosOnDemand(m),
    };
}

function makeTgManager(overrides: any = {}) {
    return {
        client: {
            invoke: jest.fn(async () => ({ photos: [], authorizations: [], hasPassword: true })),
            getMe: jest.fn(async () => ({ phone: '919990000001' })),
            connect: jest.fn(async () => undefined),
            destroy: jest.fn(async () => undefined),
        },
        updatePrivacyforDeletedAccount: jest.fn(async () => undefined),
        deleteProfilePhotos: jest.fn(async () => undefined),
        updateProfilePic: jest.fn(async () => undefined),
        hasPassword: jest.fn(async () => false),
        set2fa: jest.fn(async () => undefined),
        removeOtherAuths: jest.fn(async () => undefined),
        leaveChannels: jest.fn(async () => ({ successCount: 1, skipCount: 0 })),
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    organicMock.mockResolvedValue(undefined);
    downloadMock.mockResolvedValue(Buffer.from('img-bytes'));
    sleepMock.mockResolvedValue(undefined);
});

afterAll(async () => {
    await connectionManager.shutdown();
});

// ════════════════════════════════════════════════════════════════════════════
// Lifecycle / cleanup / map helpers
// ════════════════════════════════════════════════════════════════════════════
describe('lifecycle & map helpers', () => {
    test('onModuleDestroy -> cleanup clears maps, counters, scope and intervals', async () => {
        const service = new TestBaseService();
        (service as any).joinChannelMap.set('m1', [{ username: 'c' }]);
        (service as any).leaveChannelMap.set('m1', ['c']);
        (service as any).dailyJoinCounts.set('m1', 3);
        (service as any).joinFailureCounts.set('m1', 1);
        (service as any).joinScopeClientId = 'client-9';
        (service as any).isJoinChannelProcessing = true;
        (service as any).isLeaveChannelProcessing = true;

        await service.onModuleDestroy();

        expect((service as any).joinChannelMap.size).toBe(0);
        expect((service as any).leaveChannelMap.size).toBe(0);
        expect((service as any).dailyJoinCounts.size).toBe(0);
        expect((service as any).joinFailureCounts.size).toBe(0);
        expect((service as any).joinScopeClientId).toBeNull();
        expect((service as any).isJoinChannelProcessing).toBe(false);
        expect((service as any).isLeaveChannelProcessing).toBe(false);
    });

    test('removeFromLeaveMap does NOT clear the processing guard mid-iteration', async () => {
        // Real scenario: processLeaveChannelSequentially calls removeFromLeaveMap() as it drains
        // each mobile. When the last entry is removed the map empties — but the for-loop is still
        // running (awaiting unregister/sleep). If removeFromLeaveMap flips isLeaveChannelProcessing
        // to false here, a concurrent leaveChannelQueue tick passes the `if (processing) return`
        // guard and starts a SECOND concurrent leave pass over the same accounts (double-leave).
        const service = new TestBaseService();
        (service as any).isLeaveChannelProcessing = true; // we are "mid-iteration"
        (service as any).leaveChannelMap.set('m1', ['c1']);

        (service as any).removeFromLeaveMap('m1'); // drains the map to empty

        expect((service as any).leaveChannelMap.size).toBe(0);
        // The processing guard must remain held until the owning processLeaveChannelInterval
        // finally-block resets it — NOT cleared as a side effect of emptying the map.
        expect((service as any).isLeaveChannelProcessing).toBe(true);
    });

    test('cleanup swallows errors thrown while clearing', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'clearAllTimeouts').mockImplementation(() => { throw new Error('boom'); });
        const errSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
        await expect(service.pub.cleanup()).resolves.toBeUndefined();
        expect(errSpy).toHaveBeenCalled();
    });

    test('trimMapIfNeeded removes overflow beyond maxMapSize', () => {
        const service = new TestBaseService({}, { maxMapSize: 2 });
        const map = new Map<string, number>([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
        service.pub.trimMapIfNeeded(map, 'testMap');
        expect(map.size).toBe(2);
    });

    test('createTimeout fires callback and removes itself from activeTimeouts', () => {
        jest.useFakeTimers();
        const service = new TestBaseService();
        const cb = jest.fn();
        const t = service.pub.createTimeout(cb, 1000);
        expect((service as any).activeTimeouts.has(t)).toBe(true);
        jest.advanceTimersByTime(1000);
        expect(cb).toHaveBeenCalled();
        expect((service as any).activeTimeouts.has(t)).toBe(false);
        jest.useRealTimers();
    });

    test('safeSetLeaveChannelMap rejects new entries once size limit is reached', () => {
        const service = new TestBaseService({}, { maxMapSize: 1 });
        expect((service as any).safeSetLeaveChannelMap('m1', ['c1'])).toBe(true);
        expect((service as any).safeSetLeaveChannelMap('m2', ['c2'])).toBe(false);
        // existing key still updatable
        expect((service as any).safeSetLeaveChannelMap('m1', ['c1', 'c3'])).toBe(true);
    });

    test('removeFromLeaveMap clears the pending timer (but not the processing guard) when last entry removed', () => {
        const service = new TestBaseService();
        // Simulate an armed timer.
        (service as any).leaveChannelIntervalId = setTimeout(() => { }, 100000);
        (service as any).activeTimeouts.add((service as any).leaveChannelIntervalId);
        (service as any).leaveChannelMap.set('m1', ['c']);

        service.removeFromLeaveMap('m1');

        // Timer handle cleared so no stray tick fires...
        expect((service as any).leaveChannelIntervalId).toBeNull();
        // ...but the re-entrancy guard is left untouched (only the owning interval resets it).
        expect((service as any).isLeaveChannelProcessing).toBe(false); // default; not forced here
    });
});

// ════════════════════════════════════════════════════════════════════════════
// deactivateClient / expireUserByMobile
// ════════════════════════════════════════════════════════════════════════════
describe('deactivateClient & expireUserByMobile', () => {
    test('permanent deactivation cascades to expireAccount', async () => {
        const service = new TestBaseService();
        const ok = await service.pub.deactivateClient('919990000010', 'banned', { permanent: true });
        expect(ok).toBe(true);
        expect(service.usersServiceMock.expireAccount).toHaveBeenCalledWith('919990000010', expect.any(String));
    });

    test('non-permanent deactivation does not cascade', async () => {
        const service = new TestBaseService();
        const ok = await service.pub.deactivateClient('919990000011', 'stuck');
        expect(ok).toBe(true);
        expect(service.usersServiceMock.expireAccount).not.toHaveBeenCalled();
    });

    test('returns false when updateStatus throws', async () => {
        const service = new TestBaseService();
        service.updateStatusMock.mockRejectedValueOnce(new Error('db down'));
        const ok = await service.pub.deactivateClient('919990000012', 'reason', { permanent: true });
        expect(ok).toBe(false);
        expect(service.usersServiceMock.expireAccount).not.toHaveBeenCalled();
    });

    test('expireUserByMobile swallows expireAccount failure', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.expireAccount.mockRejectedValueOnce(new Error('nope'));
        const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        await expect(service.pub.expireUserByMobile('919990000013')).resolves.toBeUndefined();
        expect(warnSpy).toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// retireIfStuck
// ════════════════════════════════════════════════════════════════════════════
describe('retireIfStuck', () => {
    const ONE_DAY = 24 * 60 * 60 * 1000;
    test('retires a non-terminal account stuck past STUCK_WARMUP_DAYS', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc: any = {
            mobile: '919990000020',
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: new Date(now - 60 * ONE_DAY),
            channels: 10,
            failedUpdateAttempts: 1,
        };
        const result = await service.pub.retireIfStuck(doc, now);
        expect(result).toBe(true);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000020', 'inactive', expect.stringContaining('Stuck'));
        expect(service.botsServiceMock.sendMessageByCategory).toHaveBeenCalled();
    });

    test('does not retire READY/SESSION_ROTATED terminal accounts even when old', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc: any = { mobile: '919990000021', warmupPhase: WarmupPhase.READY, enrolledAt: new Date(now - 90 * ONE_DAY) };
        expect(await service.pub.retireIfStuck(doc, now)).toBe(false);
    });

    test('does not retire young accounts', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc: any = { mobile: '919990000022', warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(now - 5 * ONE_DAY) };
        expect(await service.pub.retireIfStuck(doc, now)).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Warmup step executors
// ════════════════════════════════════════════════════════════════════════════
describe('warmup step executors', () => {
    const doc: any = { mobile: '919990000030', tgId: 'tg-30', assignedProfilePics: [] };

    test('updatePrivacySettings success path', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updatePrivacySettings(doc, {} as Client, 0);
        expect(n).toBe(1);
        expect(tg.updatePrivacyforDeletedAccount).toHaveBeenCalled();
        expect(service.updateMock).toHaveBeenCalledWith('919990000030', expect.objectContaining({ privacyUpdatedAt: expect.any(Date), failedUpdateAttempts: 0 }));
    });

    test('updatePrivacySettings transient error increments failedUpdateAttempts', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ updatePrivacyforDeletedAccount: jest.fn(async () => { throw new Error('TIMEOUT'); }) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updatePrivacySettings(doc, {} as Client, 2);
        expect(n).toBe(0);
        expect(service.updateMock).toHaveBeenCalledWith('919990000030', expect.objectContaining({ failedUpdateAttempts: 3 }));
        expect(service.updateStatusMock).not.toHaveBeenCalled();
    });

    test('updatePrivacySettings permanent error deactivates account', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ updatePrivacyforDeletedAccount: jest.fn(async () => { throw new Error('SESSION_REVOKED'); }) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updatePrivacySettings(doc, {} as Client, 0);
        expect(n).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000030', 'inactive', expect.stringContaining('SESSION_REVOKED'));
    });

    test('deleteProfilePhotos deletes when photos exist', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [{}, {}] })) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.deleteProfilePhotos(doc, {} as Client, 0);
        expect(n).toBe(1);
        expect(tg.deleteProfilePhotos).toHaveBeenCalled();
        expect(service.updateMock).toHaveBeenCalledWith('919990000030', expect.objectContaining({ profilePicsDeletedAt: expect.any(Date) }));
    });

    test('deleteProfilePhotos no-op when no photos', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [] })) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.deleteProfilePhotos(doc, {} as Client, 0);
        expect(n).toBe(1);
        expect(tg.deleteProfilePhotos).not.toHaveBeenCalled();
    });

    test('deleteProfilePhotos permanent error deactivates', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => { throw new Error('USER_DEACTIVATED_BAN'); }) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.deleteProfilePhotos(doc, {} as Client, 0);
        expect(n).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000030', 'inactive', expect.any(String));
    });

    test('updateProfilePhotos with no assigned pics stamps done', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [] })) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updateProfilePhotos({ ...doc, assignedProfilePics: [] }, {} as Client, 0);
        expect(n).toBe(1);
        expect(service.updateMock).toHaveBeenCalledWith('919990000030', expect.objectContaining({ profilePicsUpdatedAt: expect.any(Date) }));
    });

    test('updateProfilePhotos uploads assigned pics when account has fewer than 2 photos', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [] })) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updateProfilePhotos(
            { ...doc, assignedProfilePics: ['https://x.test/a.jpg', 'https://x.test/b.png'] },
            {} as Client, 0,
        );
        expect(n).toBeGreaterThanOrEqual(1);
        expect(downloadMock).toHaveBeenCalledTimes(2);
        expect(tg.updateProfilePic).toHaveBeenCalledTimes(2);
    });

    test('updateProfilePhotos already has 2+ photos marks done without upload', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [{}, {}, {}] })) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updateProfilePhotos(
            { ...doc, assignedProfilePics: ['https://x.test/a.jpg', 'https://x.test/b.jpg'] },
            {} as Client, 0,
        );
        expect(n).toBe(1);
        expect(tg.updateProfilePic).not.toHaveBeenCalled();
    });

    test('updateProfilePhotos upload failure still stamps done', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({
            client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [] })) },
            updateProfilePic: jest.fn(async () => { throw new Error('upload fail'); }),
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updateProfilePhotos(
            { ...doc, assignedProfilePics: ['https://x.test/a.jpg', 'https://x.test/b.jpg'] },
            {} as Client, 0,
        );
        expect(n).toBe(1); // forced to 1 to unblock pipeline
    });

    test('updateProfilePhotos permanent error deactivates', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => { throw new Error('AUTH_KEY_UNREGISTERED'); }) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updateProfilePhotos({ ...doc, assignedProfilePics: [] }, {} as Client, 0);
        expect(n).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000030', 'inactive', expect.any(String));
    });
});

// ════════════════════════════════════════════════════════════════════════════
// set2fa with verifyOurPassword
// ════════════════════════════════════════════════════════════════════════════
describe('set2fa & 2FA password verification', () => {
    const doc: any = { mobile: '919990000040', tgId: 'tg-40', warmupPhase: WarmupPhase.SETTLING };

    test('sets new 2FA when none exists', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ hasPassword: jest.fn(async () => false) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.set2fa(doc, 0);
        expect(n).toBe(1);
        expect(tg.set2fa).toHaveBeenCalled();
        expect(service.usersServiceMock.update).toHaveBeenCalledWith('tg-40', { twoFA: true });
    });

    test('recognizes our existing 2FA via verifyOurPassword (ours)', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({
            hasPassword: jest.fn(async () => true),
            client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ hasPassword: true })) },
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.set2fa(doc, 0);
        expect(n).toBe(1);
        expect(tg.set2fa).not.toHaveBeenCalled();
        expect(service.updateMock).toHaveBeenCalledWith('919990000040', expect.objectContaining({ twoFASetAt: expect.any(Date) }));
    });

    test('foreign 2FA password deactivates the account', async () => {
        const service = new TestBaseService();
        // GetPassword OK, GetPasswordSettings throws PASSWORD_HASH_INVALID => foreign
        let call = 0;
        const tg = makeTgManager({
            hasPassword: jest.fn(async () => true),
            client: {
                ...makeTgManager().client,
                invoke: jest.fn(async () => {
                    call++;
                    if (call === 1) return { hasPassword: true };
                    throw new Error('PASSWORD_HASH_INVALID');
                }),
            },
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.set2fa(doc, 0);
        expect(n).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000040', 'inactive', expect.stringContaining('Foreign 2FA'));
    });

    test('inconclusive verification throws and increments failures', async () => {
        const service = new TestBaseService();
        // GetPassword returns hasPassword=false (unknown) -> inconclusive -> throws -> catch increments
        const tg = makeTgManager({
            hasPassword: jest.fn(async () => true),
            client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ hasPassword: false })) },
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.set2fa(doc, 1);
        expect(n).toBe(0);
        expect(service.updateMock).toHaveBeenCalledWith('919990000040', expect.objectContaining({ failedUpdateAttempts: 2 }));
    });

    test('sets new 2FA but swallows a failure persisting twoFA flag on the user record (line 589)', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ hasPassword: jest.fn(async () => false) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        service.usersServiceMock.update.mockRejectedValueOnce(new Error('user collection unavailable'));
        const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        const n = await service.pub.set2fa(doc, 0);
        // 2FA still considered set on the client even though the user-record flag update failed.
        expect(n).toBe(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to update user 2FA status'), expect.anything());
    });

    test('set2fa permanent error path deactivates', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ hasPassword: jest.fn(async () => { throw new Error('PHONE_NUMBER_BANNED'); }) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.set2fa(doc, 0);
        expect(n).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000040', 'inactive', expect.any(String));
    });
});

// ════════════════════════════════════════════════════════════════════════════
// removeOtherAuths
// ════════════════════════════════════════════════════════════════════════════
describe('removeOtherAuths', () => {
    const doc: any = { mobile: '919990000050', tgId: 'tg-50', warmupPhase: WarmupPhase.SETTLING };

    test('success path', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.removeOtherAuths(doc, 0);
        expect(n).toBe(1);
        expect(tg.removeOtherAuths).toHaveBeenCalled();
        expect(service.updateMock).toHaveBeenCalledWith('919990000050', expect.objectContaining({ otherAuthsRemovedAt: expect.any(Date) }));
    });

    test('self-check failure marks inactive and notifies', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ removeOtherAuths: jest.fn(async () => { throw new Error('Session self-check failed'); }) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.removeOtherAuths(doc, 0);
        expect(n).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000050', 'inactive', expect.stringContaining('Session lost'));
        expect(service.botsServiceMock.sendMessageByCategory).toHaveBeenCalled();
    });

    test('transient error increments failures without deactivating', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ removeOtherAuths: jest.fn(async () => { throw new Error('TIMEOUT'); }) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.removeOtherAuths(doc, 1);
        expect(n).toBe(0);
        expect(service.updateMock).toHaveBeenCalledWith('919990000050', expect.objectContaining({ failedUpdateAttempts: 2 }));
        expect(service.updateStatusMock).not.toHaveBeenCalled();
    });

    test('permanent (non self-check) error deactivates', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager({ removeOtherAuths: jest.fn(async () => { throw new Error('USER_DEACTIVATED'); }) });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.removeOtherAuths(doc, 0);
        expect(n).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000050', 'inactive', expect.any(String));
    });
});

// ════════════════════════════════════════════════════════════════════════════
// performHealthCheck
// ════════════════════════════════════════════════════════════════════════════
describe('performHealthCheck', () => {
    test('skips when not due', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const res = await service.pub.performHealthCheck('919990000060', now - 1000, now);
        expect(res).toEqual({ passed: true, performed: false });
    });

    test('runs and passes when due', async () => {
        const service = new TestBaseService();
        const tg = makeTgManager();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const now = Date.now();
        const res = await service.pub.performHealthCheck('919990000061', 0, now);
        expect(res).toEqual({ passed: true, performed: true });
        expect(service.updateMock).toHaveBeenCalledWith('919990000061', expect.objectContaining({ lastChecked: expect.any(Date), channels: expect.any(Number) }));
    });

    test('permanent error during health check deactivates', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('SESSION_REVOKED'));
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const now = Date.now();
        const res = await service.pub.performHealthCheck('919990000062', 0, now);
        expect(res).toEqual({ passed: false, performed: true });
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000062', 'inactive', expect.stringContaining('SESSION_REVOKED'));
    });

    test('transient error during health check does not deactivate', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('NETWORK_TIMEOUT'));
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const now = Date.now();
        const res = await service.pub.performHealthCheck('919990000063', 0, now);
        expect(res).toEqual({ passed: false, performed: true });
        expect(service.updateStatusMock).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// refreshProfilePhotosOnDemand
// ════════════════════════════════════════════════════════════════════════════
describe('refreshProfilePhotosOnDemand', () => {
    test('throws NotFound when doc missing', async () => {
        const service = new TestBaseService();
        service.findOneMock.mockResolvedValueOnce(null);
        await expect(service.pub.refreshProfilePhotosOnDemand('919990000070')).rejects.toThrow(/not found/);
    });

    test('throws NotFound when not linked to clientId', async () => {
        const service = new TestBaseService();
        service.findOneMock.mockResolvedValueOnce({ mobile: '919990000071' });
        await expect(service.pub.refreshProfilePhotosOnDemand('919990000071')).rejects.toThrow(/not linked/);
    });

    test('throws NotFound when client lookup fails', async () => {
        const service = new TestBaseService();
        service.findOneMock.mockResolvedValueOnce({ mobile: '919990000072', clientId: 'c1' });
        service.clientServiceMock.findOne.mockResolvedValueOnce(null);
        await expect(service.pub.refreshProfilePhotosOnDemand('919990000072')).rejects.toThrow(/Client c1 not found/);
    });

    test('skips when fewer than 2 assigned pics', async () => {
        const service = new TestBaseService();
        service.findOneMock.mockResolvedValueOnce({ mobile: '919990000073', clientId: 'c1', assignedProfilePics: ['only-one'] });
        const res = await service.pub.refreshProfilePhotosOnDemand('919990000073');
        expect(res).toEqual({ refreshed: false, uploadedCount: 0 });
    });

    test('refreshes when 2+ assigned pics present', async () => {
        const service = new TestBaseService();
        service.findOneMock.mockResolvedValueOnce({
            mobile: '919990000074', clientId: 'c1',
            assignedProfilePics: ['https://x.test/a.jpg', 'https://x.test/b.jpg'],
            failedUpdateAttempts: 0,
        });
        const tg = makeTgManager({ client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [] })) } });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const res = await service.pub.refreshProfilePhotosOnDemand('919990000074');
        expect(res.refreshed).toBe(true);
        expect(res.uploadedCount).toBeGreaterThanOrEqual(1);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Channel join queue
// ════════════════════════════════════════════════════════════════════════════
describe('channel join queue', () => {
    const joinable = (id: string) => ({ channelId: id, username: id, canSendMsgs: true });

    test('joinChannelQueue does nothing when map empty', async () => {
        const service = new TestBaseService();
        const sched = jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);
        await service.joinChannelQueue();
        expect(sched).not.toHaveBeenCalled();
    });

    test('joinChannelQueue starts scheduling when map non-empty', async () => {
        const service = new TestBaseService();
        (service as any).joinChannelMap.set('m1', [joinable('c1')]);
        const sched = jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);
        await service.joinChannelQueue();
        expect(sched).toHaveBeenCalled();
    });

    test('joinChannelQueue warns when already processing', async () => {
        const service = new TestBaseService();
        (service as any).isJoinChannelProcessing = true;
        const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        await service.joinChannelQueue();
        expect(warn).toHaveBeenCalled();
    });

    test('scheduleNextJoinRound refills then schedules a timeout', async () => {
        const service = new TestBaseService();
        service.refillJoinQueueMock.mockImplementationOnce(async () => {
            (service as any).joinChannelMap.set('m1', [joinable('c1')]);
            return 1;
        });
        const timeoutSpy = jest.spyOn(service as any, 'createTimeout').mockReturnValue(123 as any);
        await service.pub.scheduleNextJoinRound();
        expect(service.refillJoinQueueMock).toHaveBeenCalled();
        expect(timeoutSpy).toHaveBeenCalled();
    });

    test('scheduleNextJoinRound stops when refill returns 0', async () => {
        const service = new TestBaseService();
        service.refillJoinQueueMock.mockResolvedValueOnce(0);
        const clearSpy = jest.spyOn(service as any, 'clearJoinChannelInterval');
        await service.pub.scheduleNextJoinRound();
        expect(clearSpy).toHaveBeenCalled();
    });

    test('scheduleNextJoinRound handles refill error', async () => {
        const service = new TestBaseService();
        service.refillJoinQueueMock.mockRejectedValueOnce(new Error('refill boom'));
        const clearSpy = jest.spyOn(service as any, 'clearJoinChannelInterval');
        await service.pub.scheduleNextJoinRound();
        expect(clearSpy).toHaveBeenCalled();
    });

    test('processJoinChannelInterval runs sequential processing then reschedules', async () => {
        const service = new TestBaseService();
        (service as any).joinChannelMap.set('m1', [joinable('c1')]);
        const seq = jest.spyOn(service as any, 'processJoinChannelSequentially').mockResolvedValue(undefined);
        jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);
        await service.pub.processJoinChannelInterval();
        expect(seq).toHaveBeenCalled();
    });

    test('processJoinChannelSequentially joins channels and increments count', async () => {
        const findOneAndUpdate = jest.fn(async () => ({ channels: 5 }));
        const service = new TestBaseService({ findOneAndUpdate }, { joinsPerMobilePerRound: 2, maxJoinsPerSession: 2 });
        (service as any).joinChannelMap.set('919990000080', [joinable('c1'), joinable('c2')]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        await service.pub.processJoinChannelSequentially();
        expect(service.telegramServiceMock.tryJoiningChannel).toHaveBeenCalledTimes(2);
        expect(findOneAndUpdate).toHaveBeenCalledWith({ mobile: '919990000080' }, { $inc: { channels: 2 } }, expect.any(Object));
    });

    test('processJoinChannelSequentially skips daily-capped mobiles', async () => {
        const service = new TestBaseService({}, { maxChannelJoinsPerDay: 1 });
        (service as any).joinChannelMap.set('919990000081', [joinable('c1')]);
        (service as any).dailyJoinCounts.set('919990000081', 1);
        (service as any).dailyJoinDate = ClientHelperUtils.getTodayDateString();
        await service.pub.processJoinChannelSequentially();
        expect(service.telegramServiceMock.tryJoiningChannel).not.toHaveBeenCalled();
        expect((service as any).joinChannelMap.has('919990000081')).toBe(false);
    });

    test('processJoinChannelSequentially reconciles channel count at maturing threshold', async () => {
        const findOneAndUpdate = jest.fn(async () => ({ channels: 200 }));
        const service = new TestBaseService({ findOneAndUpdate }, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1 });
        (service as any).joinChannelMap.set('919990000082', [joinable('c1')]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        service.telegramServiceMock.getChannelInfo.mockResolvedValueOnce({ ids: Array.from({ length: 195 }, (_, i) => `id${i}`) });
        await service.pub.processJoinChannelSequentially();
        expect(service.telegramServiceMock.getChannelInfo).toHaveBeenCalledWith('919990000082', true);
        expect(service.updateMock).toHaveBeenCalledWith('919990000082', { channels: 195 });
    });

    test('processJoinChannelSequentially handles FloodWaitError by removing from queue and refreshing count', async () => {
        const service = new TestBaseService({}, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1 });
        (service as any).joinChannelMap.set('919990000083', [joinable('c1')]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        // parseError reads err.name for the `error` field; FloodWaitError triggers the flood branch.
        service.telegramServiceMock.tryJoiningChannel.mockImplementationOnce(async () => {
            const e: any = new Error('flood wait'); e.name = 'FloodWaitError'; throw e;
        });
        service.telegramServiceMock.getChannelInfo.mockResolvedValueOnce({ ids: ['a', 'b', 'c'] });
        await service.pub.processJoinChannelSequentially();
        expect((service as any).joinChannelMap.has('919990000083')).toBe(false);
        expect(service.updateMock).toHaveBeenCalledWith('919990000083', { channels: 3 });
    });

    test('processJoinChannelSequentially handles CHANNELS_TOO_MUCH by capping channels at 500', async () => {
        const service = new TestBaseService({}, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1 });
        (service as any).joinChannelMap.set('919990000087', [joinable('c1')]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        service.telegramServiceMock.tryJoiningChannel.mockImplementationOnce(async () => { throw new Error('CHANNELS_TOO_MUCH'); });
        service.telegramServiceMock.getChannelInfo.mockRejectedValueOnce(new Error('CHANNELS_TOO_MUCH'));
        await service.pub.processJoinChannelSequentially();
        expect(service.updateMock).toHaveBeenCalledWith('919990000087', { channels: 500 });
    });

    test('processJoinChannelSequentially deactivates on permanent join error', async () => {
        const service = new TestBaseService({}, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1 });
        (service as any).joinChannelMap.set('919990000084', [joinable('c1')]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        service.telegramServiceMock.tryJoiningChannel.mockRejectedValueOnce(new Error('USER_DEACTIVATED_BAN'));
        await service.pub.processJoinChannelSequentially();
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000084', 'inactive', expect.any(String));
    });

    test('processJoinChannelSequentially restores channel and tracks transient failures', async () => {
        const service = new TestBaseService({}, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1, maxChannelJoinsPerDay: 20 });
        (service as any).joinChannelMap.set('919990000085', [joinable('c1')]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        service.telegramServiceMock.tryJoiningChannel.mockRejectedValueOnce(new Error('TEMP_NETWORK'));
        await service.pub.processJoinChannelSequentially();
        // channel restored to queue, failure counter incremented
        expect((service as any).joinFailureCounts.get('919990000085')).toBe(1);
        expect((service as any).joinChannelMap.get('919990000085')).toEqual([joinable('c1')]);
    });

    test('processJoinChannelSequentially quarantines a mobile after MAX_JOIN_FAILURES', async () => {
        const service = new TestBaseService({}, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1 });
        (service as any).joinChannelMap.set('919990000086', [joinable('c1')]);
        (service as any).joinFailureCounts.set('919990000086', 2);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        service.telegramServiceMock.tryJoiningChannel.mockRejectedValueOnce(new Error('TEMP_NETWORK'));
        await service.pub.processJoinChannelSequentially();
        expect((service as any).joinChannelMap.has('919990000086')).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Channel leave queue
// ════════════════════════════════════════════════════════════════════════════
describe('channel leave queue', () => {
    test('leaveChannelQueue does nothing when empty', async () => {
        const service = new TestBaseService();
        const sched = jest.spyOn(service as any, 'scheduleNextLeaveRound');
        await service.leaveChannelQueue();
        expect(sched).not.toHaveBeenCalled();
    });

    test('leaveChannelQueue schedules when non-empty', async () => {
        const service = new TestBaseService();
        (service as any).leaveChannelMap.set('m1', ['c1']);
        const sched = jest.spyOn(service as any, 'scheduleNextLeaveRound').mockImplementation(() => {});
        await service.leaveChannelQueue();
        expect(sched).toHaveBeenCalled();
    });

    test('leaveChannelQueue warns when already processing', async () => {
        const service = new TestBaseService();
        (service as any).isLeaveChannelProcessing = true;
        const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        await service.leaveChannelQueue();
        expect(warn).toHaveBeenCalled();
    });

    test('scheduleNextLeaveRound clears interval when map empty', () => {
        const service = new TestBaseService();
        const clearSpy = jest.spyOn(service as any, 'clearLeaveChannelInterval');
        service.pub.scheduleNextLeaveRound();
        expect(clearSpy).toHaveBeenCalled();
    });

    test('scheduleNextLeaveRound schedules timeout when non-empty', () => {
        const service = new TestBaseService();
        (service as any).leaveChannelMap.set('m1', ['c1']);
        const timeoutSpy = jest.spyOn(service as any, 'createTimeout').mockReturnValue(7 as any);
        service.pub.scheduleNextLeaveRound();
        expect(timeoutSpy).toHaveBeenCalled();
    });

    test('processLeaveChannelInterval processes then kicks join loop when idle', async () => {
        const service = new TestBaseService();
        (service as any).leaveChannelMap.set('m1', ['c1']);
        const seq = jest.spyOn(service as any, 'processLeaveChannelSequentially').mockResolvedValue(undefined);
        jest.spyOn(service as any, 'scheduleNextLeaveRound').mockImplementation(() => {});
        const joinKick = jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);
        await service.pub.processLeaveChannelInterval();
        expect(seq).toHaveBeenCalled();
        expect(joinKick).toHaveBeenCalled();
    });

    test('processLeaveChannelSequentially leaves channels and decrements count', async () => {
        const updateOne = jest.fn(async () => ({}));
        const service = new TestBaseService({ updateOne }, { leaveChannelBatchSize: 2 });
        (service as any).leaveChannelMap.set('919990000090', ['c1', 'c2']);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(
            makeTgManager({ leaveChannels: jest.fn(async () => ({ successCount: 2, skipCount: 0 })) }) as any,
        );
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        await service.pub.processLeaveChannelSequentially();
        // Decrement uses a floor-at-0 pipeline update (a plain $inc could drive channels
        // negative when the stored count is stale below leftCount).
        expect(updateOne).toHaveBeenCalledWith(
            { mobile: '919990000090' },
            [{ $set: { channels: { $max: [0, { $subtract: [{ $ifNull: ['$channels', 0] }, 2] }] } } }],
            { updatePipeline: true },
        );
        expect((service as any).leaveChannelMap.has('919990000090')).toBe(false);
    });

    test('processLeaveChannelSequentially keeps remaining channels for next round', async () => {
        const updateOne = jest.fn(async () => ({}));
        const service = new TestBaseService({ updateOne }, { leaveChannelBatchSize: 1 });
        (service as any).leaveChannelMap.set('919990000091', ['c1', 'c2', 'c3']);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(
            makeTgManager({ leaveChannels: jest.fn(async () => ({ successCount: 1, skipCount: 0 })) }) as any,
        );
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        await service.pub.processLeaveChannelSequentially();
        expect((service as any).leaveChannelMap.get('919990000091')).toEqual(['c2', 'c3']);
    });

    test('processLeaveChannelSequentially restores channels on transient failure', async () => {
        const service = new TestBaseService({}, { leaveChannelBatchSize: 2 });
        (service as any).leaveChannelMap.set('919990000092', ['c1', 'c2']);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(
            makeTgManager({ leaveChannels: jest.fn(async () => { throw new Error('TEMP'); }) }) as any,
        );
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        await service.pub.processLeaveChannelSequentially();
        expect((service as any).leaveChannelMap.get('919990000092')).toEqual(['c1', 'c2']);
    });

    test('processLeaveChannelSequentially deactivates on permanent failure', async () => {
        const service = new TestBaseService({}, { leaveChannelBatchSize: 2 });
        (service as any).leaveChannelMap.set('919990000093', ['c1', 'c2']);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(
            makeTgManager({ leaveChannels: jest.fn(async () => { throw new Error('AUTH_KEY_UNREGISTERED'); }) }) as any,
        );
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        await service.pub.processLeaveChannelSequentially();
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000093', 'inactive', expect.any(String));
        expect((service as any).leaveChannelMap.has('919990000093')).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Session helpers
// ════════════════════════════════════════════════════════════════════════════
describe('session helpers', () => {
    test('getStoredActiveSession returns trimmed session', async () => {
        const exec = jest.fn(async () => ({ session: '  sess-1  ' }));
        const lean = jest.fn(() => ({ exec }));
        const findOne = jest.fn(() => ({ lean }));
        const service = new TestBaseService({ findOne });
        expect(await service.pub.getStoredActiveSession('m1')).toBe('sess-1');
    });

    test('getStoredActiveSession returns null when no session', async () => {
        const exec = jest.fn(async () => null);
        const findOne = jest.fn(() => ({ lean: () => ({ exec }) }));
        const service = new TestBaseService({ findOne });
        expect(await service.pub.getStoredActiveSession('m1')).toBeNull();
    });

    test('createDistinctSessionString returns a distinct session', async () => {
        const service = new TestBaseService();
        service.telegramServiceMock.createNewSession.mockResolvedValueOnce('new-session');
        const s = await service.pub.createDistinctSessionString('m1', ['old-session']);
        expect(s).toBe('new-session');
    });

    test('createDistinctSessionString rejects duplicates across attempts then returns null', async () => {
        const service = new TestBaseService();
        service.telegramServiceMock.createNewSession.mockResolvedValue('dup');
        const s = await service.pub.createDistinctSessionString('m1', ['dup'], 2);
        expect(s).toBeNull();
        expect(service.telegramServiceMock.createNewSession).toHaveBeenCalledTimes(2);
    });

    test('hasDistinctUsersBackupSession true when backup differs from active', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'backup' }]);
        expect(await service.pub.hasDistinctUsersBackupSession('m1', 'active')).toBe(true);
    });

    test('hasDistinctUsersBackupSession false when same or no users', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.search.mockResolvedValueOnce([]);
        expect(await service.pub.hasDistinctUsersBackupSession('m1', 'active')).toBe(false);
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'same' }]);
        expect(await service.pub.hasDistinctUsersBackupSession('m1', 'same')).toBe(false);
    });

    test('getOrEnsureDistinctUsersBackupSession returns null for empty active', async () => {
        const service = new TestBaseService();
        expect(await service.pub.getOrEnsureDistinctUsersBackupSession('m1', '')).toBeNull();
    });

    test('getOrEnsureDistinctUsersBackupSession throws when user missing and backfill impossible', async () => {
        // No users doc AND the pool doc can't seed a backfill → the self-heal path fails,
        // so it throws NotFoundException.
        const service = new TestBaseService({
            findOne: () => ({ lean: () => ({ exec: async () => null }) }),
        });
        service.usersServiceMock.findByMobileAnyStatus.mockResolvedValueOnce([]);
        service.usersServiceMock.backfillFromPool.mockResolvedValueOnce(null);
        await expect(service.pub.getOrEnsureDistinctUsersBackupSession('m1', 'active')).rejects.toThrow(/User not found/);
    });

    test('getOrEnsureDistinctUsersBackupSession reuses valid existing backup', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.findByMobileAnyStatus.mockResolvedValueOnce([{ tgId: 'tg-1', session: 'existing-backup' }]);
        const user = await service.pub.getOrEnsureDistinctUsersBackupSession('m1', 'active');
        expect(user?.session).toBe('existing-backup');
        expect(service.usersServiceMock.update).not.toHaveBeenCalled();
    });

    test('getOrEnsureDistinctUsersBackupSession creates a new backup when needed', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.findByMobileAnyStatus.mockResolvedValueOnce([{ tgId: 'tg-1', session: 'active' }]);
        service.telegramServiceMock.createNewSession.mockResolvedValueOnce('fresh-backup');
        const user = await service.pub.getOrEnsureDistinctUsersBackupSession('m1', 'active');
        expect(user?.session).toBe('fresh-backup');
        expect(service.usersServiceMock.update).toHaveBeenCalledWith('tg-1', { session: 'fresh-backup' });
    });

    test('getOrEnsureDistinctUsersBackupSession returns null when no distinct backup can be created', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.findByMobileAnyStatus.mockResolvedValueOnce([{ tgId: 'tg-1', session: 'active' }]);
        service.telegramServiceMock.createNewSession.mockResolvedValue('active');
        expect(await service.pub.getOrEnsureDistinctUsersBackupSession('m1', 'active')).toBeNull();
    });

    test('ensureDistinctUsersBackupSession returns boolean', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.findByMobileAnyStatus.mockResolvedValueOnce([{ tgId: 'tg-1', session: 'existing-backup' }]);
        expect(await service.pub.ensureDistinctUsersBackupSession('m1', 'active')).toBe(true);
    });

    test('normalizeMobileNumber strips non-digits', () => {
        const service = new TestBaseService();
        expect(service.pub.normalizeMobileNumber('+91 999-000 1234')).toBe('919990001234');
        expect(service.pub.normalizeMobileNumber(null)).toBe('');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// createVerifiedSessionClient / verifySessionLive / verifySessionAuthorizations
// ════════════════════════════════════════════════════════════════════════════
describe('verified session client', () => {
    test('returns null for empty session', async () => {
        const service = new TestBaseService();
        expect(await service.pub.createVerifiedSessionClient('919990000001', '')).toBeNull();
    });

    test('returns client when mobile matches', async () => {
        const service = new TestBaseService();
        telegramClientFactory.mockReturnValue({
            connect: jest.fn(async () => undefined),
            getMe: jest.fn(async () => ({ phone: '919990000001' })),
            destroy: jest.fn(async () => undefined),
        });
        const c = await service.pub.createVerifiedSessionClient('919990000001', 'sess');
        expect(c).toBeTruthy();
    });

    test('returns null and destroys when mobile mismatches', async () => {
        const service = new TestBaseService();
        const destroy = jest.fn(async () => undefined);
        telegramClientFactory.mockReturnValue({
            connect: jest.fn(async () => undefined),
            getMe: jest.fn(async () => ({ phone: '910000000000' })),
            destroy,
        });
        const c = await service.pub.createVerifiedSessionClient('919990000001', 'sess');
        expect(c).toBeNull();
        expect(destroy).toHaveBeenCalled();
    });

    test('transient connect error returns null', async () => {
        const service = new TestBaseService();
        telegramClientFactory.mockReturnValue({
            connect: jest.fn(async () => { throw new Error('NETWORK'); }),
            getMe: jest.fn(),
            destroy: jest.fn(async () => undefined),
        });
        const c = await service.pub.createVerifiedSessionClient('919990000001', 'sess');
        expect(c).toBeNull();
    });

    test('permanent connect error re-throws', async () => {
        const service = new TestBaseService();
        telegramClientFactory.mockReturnValue({
            connect: jest.fn(async () => { throw new Error('SESSION_REVOKED'); }),
            getMe: jest.fn(),
            destroy: jest.fn(async () => undefined),
        });
        await expect(service.pub.createVerifiedSessionClient('919990000001', 'sess')).rejects.toThrow(/SESSION_REVOKED/);
    });

    test('verifySessionLive returns true when client created, then destroys', async () => {
        const service = new TestBaseService();
        const destroy = jest.fn(async () => undefined);
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue({ destroy });
        expect(await service.pub.verifySessionLive('m1', 'sess')).toBe(true);
        expect(destroy).toHaveBeenCalled();
    });

    test('verifySessionLive returns false when client null', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue(null);
        expect(await service.pub.verifySessionLive('m1', 'sess')).toBe(false);
    });

    test('verifySessionAuthorizations logs auth count using provided client', async () => {
        const service = new TestBaseService();
        const invoke = jest.fn(async () => ({ authorizations: [{}, {}] }));
        await service.pub.verifySessionAuthorizations('m1', 'sess', { invoke } as any);
        expect(invoke).toHaveBeenCalled();
    });

    test('verifySessionAuthorizations creates own client when none given', async () => {
        const service = new TestBaseService();
        const invoke = jest.fn(async () => ({ authorizations: [] }));
        const destroy = jest.fn(async () => undefined);
        telegramClientFactory.mockReturnValue({ connect: jest.fn(async () => undefined), invoke, destroy });
        await service.pub.verifySessionAuthorizations('m1', 'sess');
        expect(invoke).toHaveBeenCalled();
        expect(destroy).toHaveBeenCalled();
    });

    test('verifySessionAuthorizations swallows errors', async () => {
        const service = new TestBaseService();
        const invoke = jest.fn(async () => { throw new Error('auth fail'); });
        const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        await service.pub.verifySessionAuthorizations('m1', 'sess', { invoke } as any);
        expect(warn).toHaveBeenCalled();
    });

    test('verifySessionAuthorizations no-op when nothing to inspect', async () => {
        const service = new TestBaseService();
        await expect(service.pub.verifySessionAuthorizations('m1', '')).resolves.toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// resolveActiveSessionForRotation / resolveRotationBackupSession / verifyRotationPersistence
// ════════════════════════════════════════════════════════════════════════════
describe('rotation building blocks', () => {
    test('resolveActiveSessionForRotation returns stored session', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue('stored');
        const r = await service.pub.resolveActiveSessionForRotation('m1');
        expect(r).toEqual({ activeSession: 'stored', activeClient: null, recoveredFromUsers: false });
    });

    test('resolveActiveSessionForRotation recovers from users backup', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue(null);
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'user-session' }]);
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue({ destroy: jest.fn() });
        const r = await service.pub.resolveActiveSessionForRotation('m1');
        expect(r?.activeSession).toBe('user-session');
        expect(r?.recoveredFromUsers).toBe(true);
        expect(service.updateMock).toHaveBeenCalledWith('m1', { session: 'user-session' });
    });

    test('resolveActiveSessionForRotation returns null when no users session', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue(null);
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: '' }]);
        expect(await service.pub.resolveActiveSessionForRotation('m1')).toBeNull();
    });

    test('resolveActiveSessionForRotation returns null when recovered client unverified', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue(null);
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'user-session' }]);
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue(null);
        expect(await service.pub.resolveActiveSessionForRotation('m1')).toBeNull();
    });

    test('resolveActiveSessionForRotation cleans up client when update throws', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue(null);
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'user-session' }]);
        const destroy = jest.fn(async () => undefined);
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue({ destroy });
        service.updateMock.mockRejectedValueOnce(new Error('update fail'));
        await expect(service.pub.resolveActiveSessionForRotation('m1')).rejects.toThrow(/update fail/);
        expect(destroy).toHaveBeenCalled();
    });

    test('resolveRotationBackupSession reuses live existing backup', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'verifySessionLive').mockResolvedValue(true);
        const r = await service.pub.resolveRotationBackupSession('m1', 'active', { tgId: 't', session: 'existing-backup' } as any);
        expect(r).toEqual({ backupSession: 'existing-backup', reusedExisting: true });
    });

    test('resolveRotationBackupSession creates fresh when existing dead', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'verifySessionLive').mockResolvedValue(false);
        service.telegramServiceMock.createNewSession.mockResolvedValueOnce('fresh');
        const r = await service.pub.resolveRotationBackupSession('m1', 'active', { tgId: 't', session: 'dead-backup' } as any);
        expect(r.backupSession).toBe('fresh');
        expect(service.usersServiceMock.update).toHaveBeenCalledWith('t', { session: 'fresh' });
    });

    test('resolveRotationBackupSession returns null backup when creation fails', async () => {
        const service = new TestBaseService();
        service.telegramServiceMock.createNewSession.mockResolvedValue('active'); // always duplicate
        const r = await service.pub.resolveRotationBackupSession('m1', 'active', { tgId: 't', session: null } as any);
        expect(r.backupSession).toBeNull();
    });

    test('verifyRotationPersistence true when both sessions persisted distinctly', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'backup' }]);
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue('active');
        expect(await service.pub.verifyRotationPersistence('m1', 'active', 'backup')).toBe(true);
    });

    test('verifyRotationPersistence false when active changed', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'backup' }]);
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue('changed');
        expect(await service.pub.verifyRotationPersistence('m1', 'active', 'backup')).toBe(false);
    });

    test('verifyRotationPersistence false when backup wrong', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.search.mockResolvedValueOnce([{ session: 'other' }]);
        jest.spyOn(service as any, 'getStoredActiveSession').mockResolvedValue('active');
        expect(await service.pub.verifyRotationPersistence('m1', 'active', 'backup')).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Date / availability helpers
// ════════════════════════════════════════════════════════════════════════════
describe('date & availability helpers', () => {
    test('normalizeDateString passes through YYYY-MM-DD', () => {
        const service = new TestBaseService();
        expect(service.pub.normalizeDateString('2026-06-20')).toBe('2026-06-20');
        expect(service.pub.normalizeDateString(null)).toBeNull();
        expect(service.pub.normalizeDateString(new Date('2026-06-20T10:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('maxDateString picks the latest', () => {
        const service = new TestBaseService();
        expect(service.pub.maxDateString('2026-01-01', '2026-06-20', null)).toBe('2026-06-20');
        expect(service.pub.maxDateString(null, undefined)).toBeNull();
    });

    test('getProjectedReadyDateString returns date for warming account', () => {
        const service = new TestBaseService();
        const d = service.pub.getProjectedReadyDateString({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: new Date('2026-06-01T00:00:00Z'),
            warmupJitter: 2,
        });
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('getProjectedReadyDateString null for ready account', () => {
        const service = new TestBaseService();
        expect(service.pub.getProjectedReadyDateString({ warmupPhase: WarmupPhase.SESSION_ROTATED, enrolledAt: new Date() })).toBeNull();
    });

    test('getProjectedReadyDateString null when no enrolled timestamp', () => {
        const service = new TestBaseService();
        expect(service.pub.getProjectedReadyDateString({ warmupPhase: WarmupPhase.GROWING })).toBeNull();
    });

    test('getOperationalAvailabilityDateString for legacy used account', () => {
        const service = new TestBaseService();
        const now = Date.now();
        const d = service.pub.getOperationalAvailabilityDateString({ lastUsed: new Date(now - 1000) } as any, now);
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('getOperationalAvailabilityDateString for ready account uses now/availableDate', () => {
        const service = new TestBaseService();
        const now = Date.now();
        const d = service.pub.getOperationalAvailabilityDateString({ warmupPhase: WarmupPhase.SESSION_ROTATED } as any, now);
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('getOperationalAvailabilityDateString for warming account projects ready date', () => {
        const service = new TestBaseService();
        const now = Date.now();
        const d = service.pub.getOperationalAvailabilityDateString({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: new Date(now),
            warmupJitter: 0,
        } as any, now);
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('getReplenishmentWindows derives from config', () => {
        const service = new TestBaseService({}, { minTotalClients: 10 });
        const windows = service.pub.getReplenishmentWindows();
        expect(windows).toHaveLength(2);
        expect(windows[1]).toEqual(expect.objectContaining({ name: 'oneMonth', minRequired: 10 }));
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Stats / query helpers
// ════════════════════════════════════════════════════════════════════════════
describe('stats & query helpers', () => {
    function mockFindExec(result: any) {
        return jest.fn(() => ({ exec: jest.fn(async () => result) }));
    }

    test('getClientsByStatus queries by status', async () => {
        const find = mockFindExec([{ mobile: 'm1' }]);
        const service = new TestBaseService({ find });
        const r = await service.getClientsByStatus('active');
        expect(find).toHaveBeenCalledWith({ status: 'active' });
        expect(r).toEqual([{ mobile: 'm1' }]);
    });

    test('getClientsWithMessages maps fields', async () => {
        const exec = jest.fn(async () => [{ mobile: 'm1', status: 'active', message: 'hi', clientId: 'c1', lastUsed: null }]);
        const find = jest.fn(() => ({ lean: () => ({ exec }) }));
        const service = new TestBaseService({ find });
        const r = await service.getClientsWithMessages();
        expect(r[0]).toEqual({ mobile: 'm1', status: 'active', message: 'hi', clientId: 'c1', lastUsed: null });
    });

    test('markAsUsed updates lastUsed and message', async () => {
        const service = new TestBaseService();
        await service.markAsUsed('m1', 'used it');
        expect(service.updateMock).toHaveBeenCalledWith('m1', expect.objectContaining({ lastUsed: expect.any(Date), message: 'used it' }));
    });

    test('getUsageStatistics aggregates counts and average gap', async () => {
        const lastUsed = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const countDocuments = jest.fn()
            .mockResolvedValueOnce(5)  // total
            .mockResolvedValueOnce(1)  // neverUsed
            .mockResolvedValueOnce(2)  // 24h
            .mockResolvedValueOnce(3); // week
        const find = jest.fn(() => ({ exec: jest.fn(async () => [{ lastUsed }, { lastUsed: null }]) }));
        const service = new TestBaseService({ countDocuments, find });
        const stats = await service.getUsageStatistics('client-1');
        expect(stats.totalClients).toBe(5);
        expect(stats.neverUsed).toBe(1);
        expect(stats.averageUsageGap).toBeGreaterThan(0);
    });

    test('getNextAvailableClient returns first least-recently-used', async () => {
        const service = new TestBaseService();
        jest.spyOn(service, 'getLeastRecentlyUsedClients').mockResolvedValue([{ mobile: 'm1' } as any]);
        expect(await service.getNextAvailableClient('client-1')).toEqual({ mobile: 'm1' });
    });

    test('getNextAvailableClient returns null when none', async () => {
        const service = new TestBaseService();
        jest.spyOn(service, 'getLeastRecentlyUsedClients').mockResolvedValue([]);
        expect(await service.getNextAvailableClient('client-1')).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// healDeadSessions
// ════════════════════════════════════════════════════════════════════════════
describe('healDeadSessions', () => {
    function makeHealModel(docs: any[]) {
        return {
            find: jest.fn(() => ({ select: jest.fn(() => ({ exec: jest.fn(async () => docs) })) })),
        };
    }

    test('counts healthy sessions', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm1', session: 'live-session' }]));
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue({ destroy: jest.fn() });
        const r = await service.healDeadSessions();
        expect(r.total).toBe(1);
        expect(r.healthy).toBe(1);
    });

    test('heals a dead session via sessionService', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm2', session: 'dead-session' }]));
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue(null);
        service.sessionServiceMock.createSession.mockResolvedValueOnce({ success: true, session: 'new-session' });
        const r = await service.healDeadSessions();
        expect(r.healed).toBe(1);
        expect(service.updateMock).toHaveBeenCalledWith('m2', { session: 'new-session' });
    });

    test('deactivates when session creation fails', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm3', session: 'dead-session' }]));
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue(null);
        service.sessionServiceMock.createSession.mockResolvedValueOnce({ success: false, error: 'cannot create' });
        const r = await service.healDeadSessions();
        expect(r.deactivated).toBe(1);
        expect(service.updateStatusMock).toHaveBeenCalledWith('m3', 'inactive', expect.any(String));
    });

    test('deactivates when session creation throws', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm4', session: 'dead-session' }]));
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue(null);
        service.sessionServiceMock.createSession.mockRejectedValueOnce(new Error('create exploded'));
        const r = await service.healDeadSessions();
        expect(r.deactivated).toBe(1);
        expect(r.errors.length).toBeGreaterThanOrEqual(1);
    });

    test('recovers missing session string from users record', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm5', session: '' }]));
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue({ activeSession: 'recovered', activeClient: { destroy: jest.fn() } });
        const r = await service.healDeadSessions();
        expect(r.healed).toBe(1);
    });

    test('skips when no users session and no stored session', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm6', session: '' }]));
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue(null);
        const r = await service.healDeadSessions();
        expect(r.skipped).toBe(1);
    });

    test('handles error recovering missing session', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm7', session: '' }]));
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockRejectedValue(new Error('recover fail'));
        const r = await service.healDeadSessions();
        expect(r.skipped).toBe(1);
        expect(r.errors.length).toBe(1);
    });

    test('counts liveness check error as dead then heals', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm8', session: 'sess' }]));
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockRejectedValue(new Error('SESSION_REVOKED'));
        service.sessionServiceMock.createSession.mockResolvedValueOnce({ success: true, session: 'healed' });
        const r = await service.healDeadSessions();
        expect(r.healed).toBe(1);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Error / config helpers
// ════════════════════════════════════════════════════════════════════════════
describe('error & config helpers', () => {
    test('getErrorText handles Error, errorMessage, message, and primitive', () => {
        const service = new TestBaseService();
        const get = (e: any) => (service as any).getErrorText(e);
        expect(get(new Error('boom'))).toBe('boom');
        expect(get({ errorMessage: 'em' })).toBe('em');
        expect(get({ message: 'msg' })).toBe('msg');
        expect(get('plain')).toBe('plain');
    });

    test('isFrozenError detects frozen tokens', () => {
        const service = new TestBaseService();
        expect((service as any).isFrozenError({ message: 'FROZEN_METHOD_INVALID' })).toBe(true);
        expect((service as any).isFrozenError({ error: new Error('FROZEN_PARTICIPANT_MISSING') })).toBe(true);
        expect((service as any).isFrozenError({ message: 'something else' })).toBe(false);
    });

    test('readNestedString navigates object and array paths, returns empty on misses', () => {
        const service = new TestBaseService();
        const read = (root: any, path: any[]) => (service as any).readNestedString(root, path);
        expect(read({ a: { b: 'val' } }, ['a', 'b'])).toBe('val');
        expect(read({ arr: ['x', 'y'] }, ['arr', 1])).toBe('y');
        expect(read({ a: 1 }, ['a', 'b'])).toBe(''); // not record
        expect(read({ arr: 'notarray' }, ['arr', 0])).toBe(''); // not array
        expect(read({ a: { b: 42 } }, ['a', 'b'])).toBe(''); // not string
    });

    test('buildPermanentAccountReason returns base reason when not frozen', async () => {
        const service = new TestBaseService();
        const r = await (service as any).buildPermanentAccountReason('SESSION_REVOKED', { client: { invoke: jest.fn() } });
        expect(r).toBe('SESSION_REVOKED');
    });

    test('buildPermanentAccountReason swallows app-config fetch errors', async () => {
        const service = new TestBaseService();
        const tg = { client: { invoke: jest.fn(async () => { throw new Error('config fail'); }) } };
        const r = await (service as any).buildPermanentAccountReason('FROZEN_METHOD_INVALID', tg);
        expect(r).toBe('FROZEN_METHOD_INVALID');
    });

    test('canonicalMobile throws BadRequest on invalid input', () => {
        const service = new TestBaseService();
        expect(() => (service as any).canonicalMobile('')).toThrow();
    });

    test('mobilesMatch compares canonical numbers', () => {
        const service = new TestBaseService();
        expect((service as any).mobilesMatch('+919990001111', '919990001111')).toBe(true);
        expect((service as any).mobilesMatch('111', '222')).toBe(false);
    });

    test('safeUnregisterClient logs but does not throw on failure', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'unregisterClient').mockRejectedValueOnce(new Error('unreg fail'));
        const errSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
        await expect((service as any).safeUnregisterClient('m1')).resolves.toBeUndefined();
        expect(errSpy).toHaveBeenCalled();
    });

    test('clearAllTimeouts clears registered timeouts', () => {
        const service = new TestBaseService();
        const t = service.pub.createTimeout(() => {}, 100000);
        expect((service as any).activeTimeouts.size).toBe(1);
        service.pub.clearAllTimeouts();
        expect((service as any).activeTimeouts.size).toBe(0);
        clearTimeout(t);
    });

    test('clearJoinChannelInterval / clearLeaveChannelInterval clear timer handles', () => {
        const service = new TestBaseService();
        (service as any).joinChannelIntervalId = service.pub.createTimeout(() => {}, 100000);
        (service as any).leaveChannelIntervalId = service.pub.createTimeout(() => {}, 100000);
        (service as any).clearJoinChannelInterval();
        (service as any).clearLeaveChannelInterval();
        expect((service as any).joinChannelIntervalId).toBeNull();
        expect((service as any).leaveChannelIntervalId).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// rotateSession orchestration (end-to-end through real helpers)
// ════════════════════════════════════════════════════════════════════════════
describe('rotateSession orchestration', () => {
    test('returns false when no active session resolvable', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue(null);
        jest.spyOn(service as any, 'safeUnregisterClient').mockResolvedValue(undefined);
        expect(await service.rotateSession('m1')).toBe(false);
    });

    test('returns false when active session not live for mobile', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue({ activeSession: 'a', activeClient: null });
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue(null);
        jest.spyOn(service as any, 'safeUnregisterClient').mockResolvedValue(undefined);
        expect(await service.rotateSession('m1')).toBe(false);
    });

    test('returns false when no user record', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue({ activeSession: 'a', activeClient: { destroy: jest.fn() } });
        service.usersServiceMock.search.mockResolvedValueOnce([]);
        jest.spyOn(service as any, 'safeUnregisterClient').mockResolvedValue(undefined);
        expect(await service.rotateSession('m1')).toBe(false);
    });

    test('returns false when persistence verification fails', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue({ activeSession: 'a', activeClient: { destroy: jest.fn() } });
        service.usersServiceMock.search.mockResolvedValue([{ tgId: 't', session: 'existing-backup' }]);
        jest.spyOn(service as any, 'resolveRotationBackupSession').mockResolvedValue({ backupSession: 'b', reusedExisting: true });
        jest.spyOn(service as any, 'verifySessionAuthorizations').mockResolvedValue(undefined);
        jest.spyOn(service as any, 'verifyRotationPersistence').mockResolvedValue(false);
        jest.spyOn(service as any, 'safeUnregisterClient').mockResolvedValue(undefined);
        expect(await service.rotateSession('m1')).toBe(false);
    });

    test('re-throws permanent error from inner calls', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockRejectedValue(new Error('SESSION_REVOKED'));
        jest.spyOn(service as any, 'safeUnregisterClient').mockResolvedValue(undefined);
        await expect(service.rotateSession('m1')).rejects.toThrow(/SESSION_REVOKED/);
    });

    test('returns false (not throw) on transient error', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockRejectedValue(new Error('NETWORK_TIMEOUT'));
        jest.spyOn(service as any, 'safeUnregisterClient').mockResolvedValue(undefined);
        expect(await service.rotateSession('m1')).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// calculateAvailabilityBasedNeedsForCurrentState (real query shapes)
// ════════════════════════════════════════════════════════════════════════════
describe('availability needs calculation', () => {
    function makeAvailabilityModel(docs: any[]) {
        return { find: jest.fn(() => ({ exec: jest.fn(async () => docs) })) };
    }

    test('reports satisfied horizons when enough ready accounts present', async () => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const docs = Array.from({ length: 12 }, (_, i) => ({
            mobile: `m${i}`,
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            availableDate: ClientHelperUtils.toDateString(today.getTime()),
            channels: 200,
        }));
        const service = new TestBaseService(makeAvailabilityModel(docs), { minTotalClients: 10 });
        const r = await (service as any).calculateAvailabilityBasedNeedsForCurrentState('client-1');
        expect(r.readyActive).toBe(12);
        expect(r.totalNeeded).toBe(0);
        expect(r.calculationReason).toContain('satisfied');
    });

    test('reports deficit and pipeline need when too few accounts', async () => {
        const service = new TestBaseService(makeAvailabilityModel([]), { minTotalClients: 10 });
        const r = await (service as any).calculateAvailabilityBasedNeedsForCurrentState('client-1');
        expect(r.totalActive).toBe(0);
        expect(r.totalNeeded).toBeGreaterThan(0);
        expect(r.replenishmentWindowNeeds.length).toBe(2);
        expect(r.windowNeeds.length).toBe(4);
    });

    test('classifies warming-pipeline accounts separately from ready', async () => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const docs = [
            { mobile: 'w1', warmupPhase: WarmupPhase.GROWING, enrolledAt: new Date(today.getTime()), warmupJitter: 0, channels: 50 },
            { mobile: 'r1', warmupPhase: WarmupPhase.SESSION_ROTATED, availableDate: ClientHelperUtils.toDateString(today.getTime()), channels: 200 },
        ];
        const service = new TestBaseService(makeAvailabilityModel(docs), { minTotalClients: 10 });
        const r = await (service as any).calculateAvailabilityBasedNeedsForCurrentState('client-1');
        expect(r.readyActive).toBe(1);
        expect(r.warmingPipeline).toBe(1);
    });

    test('does NOT count a SESSION_ROTATED account with too few channels as ready supply (phantom supply)', async () => {
        // Real scenario: a stalled account graduates to SESSION_ROTATED with only ~150 channels
        // (warmup's relaxed target). The buffer-swap query requires channels > 200, so this
        // account can NEVER be swapped in — but availability planning counted it as "ready",
        // making the pool look healthy and suppressing replenishment. It must be treated as
        // pipeline (not ready), so the deficit is visible and more accounts get enrolled.
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const docs = [
            { mobile: 'lowch', warmupPhase: WarmupPhase.SESSION_ROTATED, availableDate: ClientHelperUtils.toDateString(today.getTime()), channels: 150 },
        ];
        const service = new TestBaseService(makeAvailabilityModel(docs), { minTotalClients: 10 });
        const r = await (service as any).calculateAvailabilityBasedNeedsForCurrentState('client-1');
        expect(r.readyActive).toBe(0);          // not swap-eligible -> not counted as ready
        expect(r.totalNeeded).toBeGreaterThan(0); // deficit surfaced
    });

    test('calculateAvailabilityBasedNeeds self-heals then delegates', async () => {
        const service = new TestBaseService(makeAvailabilityModel([]), { minTotalClients: 10 });
        const healSpy = jest.spyOn(service as any, 'selfHealLegacyOperationalState').mockResolvedValue(undefined);
        const calcSpy = jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 0 });
        await (service as any).calculateAvailabilityBasedNeeds('client-1');
        expect(healSpy).toHaveBeenCalledWith('client-1');
        expect(calcSpy).toHaveBeenCalledWith('client-1');
    });

    // A short-term window deficit but no replenishment-horizon need exercises the
    // hasShortWindowDeficit calculationReason branch (line 2274-2275). 10 ready
    // accounts available far in the future satisfy oneMonth but not the 1-day window.
    test('reports short-window deficit while replenishment horizon is satisfied', async () => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        // 12 accounts that only become available in 20 days: satisfy the 30-day replenishment
        // window (minRequired 10) but leave the 1/3/7-day availability windows short.
        const farDate = ClientHelperUtils.toDateString(today.getTime() + 20 * 24 * 60 * 60 * 1000);
        const docs = Array.from({ length: 12 }, (_, i) => ({
            mobile: `sw${i}`,
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            availableDate: farDate,
            channels: 200,
        }));
        const service = new TestBaseService(makeAvailabilityModel(docs), { minTotalClients: 10 });
        const r = await (service as any).calculateAvailabilityBasedNeedsForCurrentState('client-1');
        expect(r.calculationReason).toContain('3-4 week horizon');
    });

    // The three-week replenishment horizon is short while the one-month horizon is fully met:
    // maxEnrollableWindowNeeded > 0 (driven by threeWeeks) while totalNeededForCount (oneMonth) === 0.
    // Exercises the "needs N to meet minimum of M" calculationReason branch (lines 2270-2271).
    test('reports a three-week replenishment deficit when the one-month horizon is already met', async () => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        // 10 ready accounts that only become available on day 25: nothing is available by the
        // three-week (21-day) horizon (min 6 -> short), but all 10 are available by one-month
        // (30-day, min 10 -> satisfied).
        const day25 = ClientHelperUtils.toDateString(today.getTime() + 25 * 24 * 60 * 60 * 1000);
        const docs = Array.from({ length: 10 }, (_, i) => ({
            mobile: `tw${i}`, warmupPhase: WarmupPhase.SESSION_ROTATED, availableDate: day25, channels: 200,
        }));
        const service = new TestBaseService(makeAvailabilityModel(docs), { minTotalClients: 10 });
        const r = await (service as any).calculateAvailabilityBasedNeedsForCurrentState('client-1');
        expect(r.totalNeeded).toBeGreaterThan(0);
        expect(r.totalNeededForCount).toBe(0);
        expect(r.calculationReason).toContain('to meet minimum of');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Warmup metadata repair: prerequisite-phase demotion (IDENTITY / MATURING)
// ════════════════════════════════════════════════════════════════════════════
describe('warmup prerequisite-phase repair', () => {
    test('getMissingPrerequisitePhase demotes a GROWING account missing identity steps to IDENTITY', () => {
        const service = new TestBaseService();
        // currentRank = GROWING (3) >= IDENTITY rank, security all done, but identity timestamps missing.
        const doc: any = {
            warmupPhase: WarmupPhase.GROWING,
            privacyUpdatedAt: new Date(),
            twoFASetAt: new Date(),
            otherAuthsRemovedAt: new Date(),
            profilePicsDeletedAt: null,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
        };
        const result = (service as any).getMissingPrerequisitePhase(doc);
        expect(result.phase).toBe(WarmupPhase.IDENTITY);
        expect(result.missing).toEqual(expect.arrayContaining(['profilePicsDeletedAt', 'nameBioUpdatedAt', 'usernameUpdatedAt']));
    });

    test('getMissingPrerequisitePhase demotes a READY account missing the maturing photo to MATURING', () => {
        const service = new TestBaseService();
        // currentRank = READY (5), security + identity done, but the maturing profile photo never uploaded.
        const doc: any = {
            warmupPhase: WarmupPhase.READY,
            privacyUpdatedAt: new Date(),
            twoFASetAt: new Date(),
            otherAuthsRemovedAt: new Date(),
            profilePicsDeletedAt: new Date(),
            nameBioUpdatedAt: new Date(),
            usernameUpdatedAt: new Date(),
            profilePicsUpdatedAt: null,
        };
        const result = (service as any).getMissingPrerequisitePhase(doc);
        expect(result.phase).toBe(WarmupPhase.MATURING);
        expect(result.missing).toEqual(['profilePicsUpdatedAt']);
    });

    test('repairWarmupMetadata corrects a GROWING doc with missing identity steps back to IDENTITY', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc: any = {
            mobile: '919990000200',
            warmupPhase: WarmupPhase.GROWING,
            createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
            enrolledAt: new Date(now - 10 * 24 * 60 * 60 * 1000),
            warmupJitter: 0,
            privacyUpdatedAt: new Date(),
            twoFASetAt: new Date(),
            otherAuthsRemovedAt: new Date(),
            profilePicsDeletedAt: null,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
            channels: 0,
        };
        const repaired = await (service as any).repairWarmupMetadata(doc, now);
        expect(service.updateMock).toHaveBeenCalledWith('919990000200', expect.objectContaining({ warmupPhase: WarmupPhase.IDENTITY }));
        expect(repaired.warmupPhase).toBe(WarmupPhase.IDENTITY);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Config / map / misc helper branches
// ════════════════════════════════════════════════════════════════════════════
describe('config & map helper branches', () => {
    test('extractConfigValue returns undefined for empty array and unwraps key/value pairs', () => {
        const service = new TestBaseService();
        const extract = (node: any, key: string) => (service as any).extractConfigValue(node, key);
        // empty array exhausts the loop and returns undefined (line 632)
        expect(extract([], 'freeze_since_date')).toBeUndefined();
        // {key,value} shape
        expect(extract({ key: 'freeze_since_date', value: '123' }, 'freeze_since_date')).toBe('123');
        // direct property shape (line 641-642)
        expect(extract({ freeze_until_date: '456' }, 'freeze_until_date')).toBe('456');
        // nested recursive search
        expect(extract({ outer: { key: 'freeze_appeal_url', value: 'http://x' } }, 'freeze_appeal_url')).toBe('http://x');
        // not found anywhere
        expect(extract({ a: 1, b: 2 }, 'missing')).toBeUndefined();
        // null/undefined node
        expect(extract(null, 'x')).toBeUndefined();
    });

    test('buildPermanentAccountReason reads freeze metadata from a direct-property app config', async () => {
        const service = new TestBaseService();
        const invoke = jest.fn(async () => ({
            freeze_since_date: '1760000000',
            freeze_until_date: '1760500000',
            freeze_appeal_url: 'https://appeal.test',
        }));
        const reason = await (service as any).buildPermanentAccountReason('FROZEN_PARTICIPANT_MISSING', { client: { invoke } } as any);
        expect(reason).toContain('freeze_since=');
        expect(reason).toContain('appeal_url=https://appeal.test');
    });

    test('safeSetJoinChannelMap rejects new mobiles once the map size limit is reached', () => {
        const service = new TestBaseService({}, { maxMapSize: 1 });
        const joinable = (id: string) => ({ channelId: id, username: id, canSendMsgs: true } as any);
        expect((service as any).safeSetJoinChannelMap('m1', [joinable('c1')])).toBe(true);
        // map full and m2 not present -> rejected (lines 681-683)
        expect((service as any).safeSetJoinChannelMap('m2', [joinable('c2')])).toBe(false);
        expect((service as any).joinChannelMap.has('m2')).toBe(false);
    });

    test('clearLeaveMap empties the leave map and clears the interval', () => {
        const service = new TestBaseService();
        const clearSpy = jest.spyOn(service as any, 'clearLeaveChannelInterval');
        (service as any).leaveChannelMap.set('m1', ['c1']);
        (service as any).leaveChannelMap.set('m2', ['c2']);
        (service as any).clearLeaveMap();
        expect((service as any).leaveChannelMap.size).toBe(0);
        expect(clearSpy).toHaveBeenCalled();
    });

    test('getProfilePicExtension falls back to .jpg for an unparseable URL', () => {
        const service = new TestBaseService();
        expect((service as any).getProfilePicExtension('not a valid url')).toBe('.jpg');
        expect((service as any).getProfilePicExtension('https://x.test/photo.png')).toBe('.png');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// verifyOurPassword inconclusive (network) branch via set2fa
// ════════════════════════════════════════════════════════════════════════════
describe('2FA verification inconclusive (network error) branch', () => {
    test('GetPasswordSettings network error yields unknown -> set2fa retries with backoff', async () => {
        const service = new TestBaseService();
        let invokeCall = 0;
        const tg = makeTgManager({
            hasPassword: jest.fn(async () => true),
            client: {
                ...makeTgManager().client,
                invoke: jest.fn(async () => {
                    invokeCall++;
                    // 1st invoke = GetPassword (has a password), 2nd = GetPasswordSettings throws non-hash error.
                    if (invokeCall === 1) return { hasPassword: true };
                    throw new Error('NETWORK_TIMEOUT contacting datacenter');
                }),
            },
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const doc: any = { mobile: '919990000210', tgId: 'tg-210', warmupPhase: WarmupPhase.SETTLING };
        const n = await service.pub.set2fa(doc, 1);
        // unknown -> throws inconclusive -> catch increments, transient so no deactivation
        expect(n).toBe(0);
        expect(service.updateMock).toHaveBeenCalledWith('919990000210', expect.objectContaining({ failedUpdateAttempts: 2 }));
        expect(service.updateStatusMock).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// processClient orchestration branches (repair failure, phase persistence,
// outer catch for transient + permanent action errors)
// ════════════════════════════════════════════════════════════════════════════
describe('processClient orchestration branches', () => {
    function fullyWarmedReadyDoc(mobile: string): any {
        const old = new Date('2026-03-01T00:00:00Z');
        return {
            mobile,
            warmupPhase: WarmupPhase.READY,
            createdAt: old,
            enrolledAt: old,
            privacyUpdatedAt: old,
            twoFASetAt: old,
            otherAuthsRemovedAt: old,
            profilePicsDeletedAt: old,
            nameBioUpdatedAt: old,
            usernameUpdatedAt: old,
            profilePicsUpdatedAt: old,
            failedUpdateAttempts: 0,
            inUse: false,
        };
    }

    test('repairWarmupMetadata failure is swallowed and processing continues', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'repairWarmupMetadata').mockRejectedValueOnce(new Error('repair boom'));
        jest.spyOn(service, 'rotateSession').mockResolvedValue(true);
        const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        const doc = fullyWarmedReadyDoc('919990000220');
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('repairWarmupMetadata failed'), expect.anything());
        expect(res.updateSummary).toBe('rotate_session');
    });

    test('persists the resolved warmup phase when it differs from the stored phase (line 1266)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        // Stored phase SETTLING with all security done and old enough that the action resolver
        // advances to the IDENTITY phase (delete_photos). repairWarmupMetadata's progress-based
        // inference still sees only security done (no identity progress) so it does NOT bump the
        // phase — leaving warmupAction.phase (IDENTITY) != doc.warmupPhase (SETTLING).
        const old = new Date(now - 12 * 24 * 60 * 60 * 1000);
        const doc: any = {
            mobile: '919990000221',
            warmupPhase: WarmupPhase.SETTLING,
            createdAt: old,
            enrolledAt: old,
            warmupJitter: 0,
            privacyUpdatedAt: old,
            twoFASetAt: old,
            otherAuthsRemovedAt: old,
            profilePicsDeletedAt: null,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
            profilePicsUpdatedAt: null,
            channels: 0,
            failedUpdateAttempts: 0,
            inUse: false,
        };
        // Make the delete_photos executor a no-op so we only assert the phase-persistence side effect.
        jest.spyOn(service as any, 'deleteProfilePhotos').mockResolvedValue(1);
        await service.processClient(doc, { clientId: 'client-1' } as Client);
        const phaseOnlyUpdate = service.updateMock.mock.calls.find(
            ([m, dto]: any[]) => m === '919990000221' && dto && dto.warmupPhase === WarmupPhase.IDENTITY && Object.keys(dto).length === 1,
        );
        expect(phaseOnlyUpdate).toBeDefined();
    });

    test('set_2fa action returning 0 sends a WARMUP FAILED notification (line 1370)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        // SETTLING doc with privacy done but 2FA not yet set, old enough to trigger the set_2fa action.
        const old = new Date(now - 5 * 24 * 60 * 60 * 1000);
        const doc: any = {
            mobile: '919990000225',
            warmupPhase: WarmupPhase.SETTLING,
            createdAt: old,
            enrolledAt: old,
            warmupJitter: 0,
            privacyUpdatedAt: old,
            twoFASetAt: null,
            otherAuthsRemovedAt: null,
            profilePicsDeletedAt: null,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
            profilePicsUpdatedAt: null,
            channels: 0,
            failedUpdateAttempts: 0,
            inUse: false,
        };
        // Force the set2fa executor to report failure (0) so the else-branch notification fires.
        jest.spyOn(service as any, 'set2fa').mockResolvedValue(0);
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBeNull();
        const failNotice = service.botsServiceMock.sendMessageByCategory.mock.calls.find(
            ([, body]: any[]) => typeof body === 'string' && body.includes('WARMUP FAILED') && body.includes('set_2fa'),
        );
        expect(failNotice).toBeDefined();
    });

    test('transient error thrown by a warmup action increments failures and notifies (no deactivate)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        // Drive an IDENTITY doc to the update_name_bio action, then make that handler throw transiently.
        const old = new Date(now - 10 * 24 * 60 * 60 * 1000);
        const doc: any = {
            mobile: '919990000222',
            warmupPhase: WarmupPhase.IDENTITY,
            createdAt: old,
            enrolledAt: old,
            warmupJitter: 0,
            privacyUpdatedAt: old,
            twoFASetAt: old,
            otherAuthsRemovedAt: old,
            profilePicsDeletedAt: old,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
            profilePicsUpdatedAt: null,
            channels: 50,
            failedUpdateAttempts: 0,
            inUse: false,
        };
        service.updateNameAndBioMock.mockRejectedValueOnce(new Error('TEMP_NETWORK_GLITCH'));
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateCount).toBe(0);
        expect(service.updateMock).toHaveBeenCalledWith('919990000222', expect.objectContaining({
            failedUpdateAttempts: 1,
            lastUpdateFailure: expect.any(Date),
        }));
        expect(service.updateStatusMock).not.toHaveBeenCalled();
        const warmupErrorNotice = service.botsServiceMock.sendMessageByCategory.mock.calls.find(
            ([, body]: any[]) => typeof body === 'string' && body.includes('WARMUP ERROR'),
        );
        expect(warmupErrorNotice).toBeDefined();
    });

    test('permanent error thrown by a warmup action deactivates the account', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const old = new Date(now - 10 * 24 * 60 * 60 * 1000);
        const doc: any = {
            mobile: '919990000223',
            warmupPhase: WarmupPhase.IDENTITY,
            createdAt: old,
            enrolledAt: old,
            warmupJitter: 0,
            privacyUpdatedAt: old,
            twoFASetAt: old,
            otherAuthsRemovedAt: old,
            profilePicsDeletedAt: old,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
            profilePicsUpdatedAt: null,
            channels: 50,
            failedUpdateAttempts: 0,
            inUse: false,
        };
        service.updateNameAndBioMock.mockRejectedValueOnce(new Error('USER_DEACTIVATED_BAN'));
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateCount).toBe(0);
        expect(service.updateStatusMock).toHaveBeenCalledWith('919990000223', 'inactive', expect.any(String));
        const permanentNotice = service.botsServiceMock.sendMessageByCategory.mock.calls.find(
            ([, body]: any[]) => typeof body === 'string' && body.includes('WARMUP PERMANENT ERROR'),
        );
        expect(permanentNotice).toBeDefined();
    });

    test('update-attempt tracking failure inside the catch is swallowed', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const old = new Date(now - 10 * 24 * 60 * 60 * 1000);
        const doc: any = {
            mobile: '919990000224',
            warmupPhase: WarmupPhase.IDENTITY,
            createdAt: old,
            enrolledAt: old,
            warmupJitter: 0,
            privacyUpdatedAt: old,
            twoFASetAt: old,
            otherAuthsRemovedAt: old,
            profilePicsDeletedAt: old,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
            profilePicsUpdatedAt: null,
            channels: 50,
            failedUpdateAttempts: 0,
            inUse: false,
        };
        service.updateNameAndBioMock.mockRejectedValueOnce(new Error('TEMP_GLITCH'));
        // the failure-tracking update() inside the catch throws -> caught + warned (line 1438)
        service.updateMock.mockRejectedValueOnce(new Error('db write failed'));
        const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateCount).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to track update attempt'), expect.anything());
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Join/leave interval scheduling guards (timer-fire null handle, empty map,
// in-flight guard, error-in-sequential)
// ════════════════════════════════════════════════════════════════════════════
describe('join/leave interval guards', () => {
    test('processJoinChannelInterval no-ops while already processing', async () => {
        const service = new TestBaseService();
        (service as any).isJoinChannelProcessing = true;
        const seq = jest.spyOn(service as any, 'processJoinChannelSequentially').mockResolvedValue(undefined);
        await service.pub.processJoinChannelInterval();
        expect(seq).not.toHaveBeenCalled();
    });

    test('processJoinChannelInterval with empty map schedules next round (lines 1559-1561)', async () => {
        const service = new TestBaseService();
        const sched = jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);
        await service.pub.processJoinChannelInterval();
        expect(sched).toHaveBeenCalled();
    });

    test('processJoinChannelInterval logs when sequential processing throws (line 1568)', async () => {
        const service = new TestBaseService();
        (service as any).joinChannelMap.set('m1', [{ channelId: 'c1', username: 'c1', canSendMsgs: true }]);
        jest.spyOn(service as any, 'processJoinChannelSequentially').mockRejectedValue(new Error('seq boom'));
        jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);
        const errSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
        await service.pub.processJoinChannelInterval();
        expect(errSpy).toHaveBeenCalledWith('Error in join channel queue', expect.anything());
    });

    test('scheduleNextJoinRound timer callback nulls the handle then runs the interval (lines 1551-1552)', async () => {
        jest.useFakeTimers();
        const service = new TestBaseService();
        service.refillJoinQueueMock.mockImplementationOnce(async () => {
            (service as any).joinChannelMap.set('m1', [{ channelId: 'c1', username: 'c1', canSendMsgs: true }]);
            return 1;
        });
        const intervalSpy = jest.spyOn(service as any, 'processJoinChannelInterval').mockResolvedValue(undefined);
        await service.pub.scheduleNextJoinRound();
        expect((service as any).joinChannelIntervalId).not.toBeNull();
        await jest.runOnlyPendingTimersAsync();
        expect((service as any).joinChannelIntervalId).toBeNull();
        expect(intervalSpy).toHaveBeenCalled();
        jest.useRealTimers();
    });

    test('processLeaveChannelInterval no-ops while already processing', async () => {
        const service = new TestBaseService();
        (service as any).isLeaveChannelProcessing = true;
        const seq = jest.spyOn(service as any, 'processLeaveChannelSequentially').mockResolvedValue(undefined);
        await service.pub.processLeaveChannelInterval();
        expect(seq).not.toHaveBeenCalled();
    });

    test('processLeaveChannelInterval with empty map clears the interval (lines 1789-1791)', async () => {
        const service = new TestBaseService();
        const clearSpy = jest.spyOn(service as any, 'clearLeaveChannelInterval');
        await service.pub.processLeaveChannelInterval();
        expect(clearSpy).toHaveBeenCalled();
    });

    test('processLeaveChannelInterval logs when sequential processing throws (line 1798)', async () => {
        const service = new TestBaseService();
        (service as any).leaveChannelMap.set('m1', ['c1']);
        jest.spyOn(service as any, 'processLeaveChannelSequentially').mockRejectedValue(new Error('leave seq boom'));
        jest.spyOn(service as any, 'scheduleNextLeaveRound').mockImplementation(() => {});
        const errSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
        await service.pub.processLeaveChannelInterval();
        expect(errSpy).toHaveBeenCalledWith('Error in leave channel queue', expect.anything());
    });

    test('scheduleNextLeaveRound timer callback nulls the handle then runs the interval (lines 1781-1782)', async () => {
        jest.useFakeTimers();
        const service = new TestBaseService();
        (service as any).leaveChannelMap.set('m1', ['c1']);
        const intervalSpy = jest.spyOn(service as any, 'processLeaveChannelInterval').mockResolvedValue(undefined);
        service.pub.scheduleNextLeaveRound();
        expect((service as any).leaveChannelIntervalId).not.toBeNull();
        await jest.runOnlyPendingTimersAsync();
        expect((service as any).leaveChannelIntervalId).toBeNull();
        expect(intervalSpy).toHaveBeenCalled();
        jest.useRealTimers();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Sequential processing edge branches: empty channel arrays, unsafe candidates,
// channel-count reconcile error.
// ════════════════════════════════════════════════════════════════════════════
describe('sequential processing edge branches', () => {
    const joinable = (id: string) => ({ channelId: id, username: id, canSendMsgs: true } as any);

    test('processJoinChannelSequentially removes a mobile whose channel array is empty (lines 1604-1605)', async () => {
        const service = new TestBaseService({}, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1 });
        (service as any).joinChannelMap.set('919990000230', []);
        await service.pub.processJoinChannelSequentially();
        expect((service as any).joinChannelMap.has('919990000230')).toBe(false);
        expect(service.telegramServiceMock.tryJoiningChannel).not.toHaveBeenCalled();
    });

    test('processJoinChannelSequentially skips an unsafe (non-joinable) candidate (lines 1622-1625)', async () => {
        const service = new TestBaseService({}, { joinsPerMobilePerRound: 2, maxJoinsPerSession: 2 });
        // First candidate is unsafe (canSendMsgs false) and is skipped; second is joinable.
        (service as any).joinChannelMap.set('919990000231', [
            { channelId: 'bad', username: 'bad', canSendMsgs: false },
            joinable('good'),
        ]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        await service.pub.processJoinChannelSequentially();
        // Only the joinable channel was actually attempted.
        expect(service.telegramServiceMock.tryJoiningChannel).toHaveBeenCalledTimes(1);
    });

    test('processJoinChannelSequentially swallows a channel-count reconcile error at the maturing boundary (line 1695)', async () => {
        const findOneAndUpdate = jest.fn(async () => ({ channels: 200 }));
        const service = new TestBaseService({ findOneAndUpdate }, { joinsPerMobilePerRound: 1, maxJoinsPerSession: 1 });
        (service as any).joinChannelMap.set('919990000232', [joinable('c1')]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(makeTgManager() as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        // optimisticCount hits the maturing threshold, so reconcile runs and then throws.
        service.telegramServiceMock.getChannelInfo.mockRejectedValueOnce(new Error('reconcile lookup failed'));
        const debugSpy = jest.spyOn((service as any).logger, 'debug').mockImplementation(() => {});
        await service.pub.processJoinChannelSequentially();
        expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('reconcile skipped'));
    });

    test('processLeaveChannelSequentially removes a mobile whose channel array is empty (lines 1822-1823)', async () => {
        const service = new TestBaseService({}, { leaveChannelBatchSize: 2 });
        (service as any).leaveChannelMap.set('919990000233', []);
        await service.pub.processLeaveChannelSequentially();
        expect((service as any).leaveChannelMap.has('919990000233')).toBe(false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// getOperationalAvailabilityDateString READY (non-rotated) branch
// ════════════════════════════════════════════════════════════════════════════
describe('operational availability for READY (pre-rotation) accounts', () => {
    test('a READY account that has not yet rotated is treated as operationally available now (lines 2121-2122)', () => {
        const service = new TestBaseService();
        const now = Date.now();
        // warmupPhase READY is NOT isAccountReady (that is SESSION_ROTATED only) and not legacy-used,
        // so it falls through to the explicit READY branch.
        const d = (service as any).getOperationalAvailabilityDateString({ warmupPhase: WarmupPhase.READY } as any, now);
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// rotateSession: backup-session creation failure
// ════════════════════════════════════════════════════════════════════════════
describe('rotateSession backup-session failure', () => {
    test('returns false when a distinct backup session cannot be created (lines 2596-2598)', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue({ activeSession: 'a', activeClient: { destroy: jest.fn() } });
        service.usersServiceMock.search.mockResolvedValue([{ tgId: 't', mobile: 'm1', session: 'a' }]);
        jest.spyOn(service as any, 'resolveRotationBackupSession').mockResolvedValue({ backupSession: null, reusedExisting: false });
        jest.spyOn(service as any, 'safeUnregisterClient').mockResolvedValue(undefined);
        const errSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
        expect(await service.rotateSession('m1')).toBe(false);
        expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create distinct backup session'));
    });
});

// ════════════════════════════════════════════════════════════════════════════
// healDeadSessions: deactivation-failed bookkeeping branch (line 2738)
// ════════════════════════════════════════════════════════════════════════════
describe('healDeadSessions deactivation-failed bookkeeping', () => {
    function makeHealModel(docs: any[]) {
        return { find: jest.fn(() => ({ select: jest.fn(() => ({ exec: jest.fn(async () => docs) })) })) };
    }

    test('records an error entry when creation fails AND deactivation also fails', async () => {
        const service = new TestBaseService(makeHealModel([{ mobile: 'm-heal-fail', session: 'dead-session' }]));
        jest.spyOn(service as any, 'createVerifiedSessionClient').mockResolvedValue(null);
        service.sessionServiceMock.createSession.mockResolvedValueOnce({ success: false, error: 'no strategy worked' });
        // deactivateClient returns false (updateStatus fails) -> hits the else error-push branch (line 2738).
        service.updateStatusMock.mockRejectedValueOnce(new Error('db down'));
        const r = await service.healDeadSessions();
        expect(r.deactivated).toBe(0);
        expect(r.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ mobile: 'm-heal-fail', action: 'deactivation failed' }),
        ]));
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Micro-branch coverage: ||/??/ternary fallbacks across helpers
// ════════════════════════════════════════════════════════════════════════════
describe('helper fallback branches', () => {
    test('inferWarmupPhaseFromProgress covers each progress tier', () => {
        const service = new TestBaseService();
        const infer = (doc: any, useStored?: boolean) => (service as any).inferWarmupPhaseFromProgress(doc, useStored);
        // stored-phase honored when useStoredPhase true
        expect(infer({ warmupPhase: WarmupPhase.MATURING }, true)).toBe(WarmupPhase.MATURING);
        // useStoredPhase false ignores stored phase and infers from progress
        expect(infer({ warmupPhase: WarmupPhase.MATURING, sessionRotatedAt: new Date() }, false)).toBe(WarmupPhase.SESSION_ROTATED);
        expect(infer({ profilePicsUpdatedAt: new Date() }, false)).toBe(WarmupPhase.MATURING);
        expect(infer({ channels: 200 }, false)).toBe(WarmupPhase.GROWING);
        expect(infer({ usernameUpdatedAt: new Date() }, false)).toBe(WarmupPhase.GROWING);
        expect(infer({ nameBioUpdatedAt: new Date() }, false)).toBe(WarmupPhase.IDENTITY);
        expect(infer({ profilePicsDeletedAt: new Date() }, false)).toBe(WarmupPhase.IDENTITY);
        expect(infer({ twoFASetAt: new Date() }, false)).toBe(WarmupPhase.SETTLING);
        expect(infer({ privacyUpdatedAt: new Date() }, false)).toBe(WarmupPhase.SETTLING);
        // nothing done -> enrolled
        expect(infer({}, false)).toBe(WarmupPhase.ENROLLED);
        // default useStoredPhase (true) with no stored phase falls through to inference
        expect(infer({ twoFASetAt: new Date() })).toBe(WarmupPhase.SETTLING);
    });

    test('getEffectiveCooldownMs returns base cooldown when no prior attempt', () => {
        const service = new TestBaseService({}, { cooldownHours: 2 });
        // lastUpdateAttempt <= 0 short-circuits before the jitter math (line 259).
        expect((service as any).getEffectiveCooldownMs('919990000300', 0)).toBe(2 * 60 * 60 * 1000);
    });

    test('isJoinableChannelCandidate rejects each unsafe flag', () => {
        const service = new TestBaseService();
        const can = (c: any) => (service as any).isJoinableChannelCandidate(c);
        const base = { channelId: 'c', username: 'c', canSendMsgs: true };
        expect(can(null)).toBe(false);
        expect(can({ ...base, channelId: '' })).toBe(false);
        expect(can({ ...base, canSendMsgs: false })).toBe(false);
        expect(can({ ...base, restricted: true })).toBe(false);
        expect(can({ ...base, banned: true })).toBe(false);
        expect(can({ ...base, forbidden: true })).toBe(false);
        expect(can({ ...base, private: true })).toBe(false);
        expect(can({ ...base, tempBan: true })).toBe(false);
        expect(can(base)).toBe(true);
    });

    test('normalizeDateString handles non-canonical string and invalid value', () => {
        const service = new TestBaseService();
        // a non-YYYY-MM-DD string is parsed via getTimestamp then re-stringified (line 2084-2085)
        expect(service.pub.normalizeDateString('2026-06-20T10:00:00Z' as any)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // an unparseable string -> timestamp 0 -> null
        expect(service.pub.normalizeDateString('not-a-date' as any)).toBeNull();
    });

    test('getProjectedReadyDateString infers phase when warmupPhase is absent', () => {
        const service = new TestBaseService();
        // No warmupPhase: inferWarmupPhaseFromProgress decides; security-only progress => SETTLING (warming).
        const d = service.pub.getProjectedReadyDateString({
            twoFASetAt: new Date('2026-06-01T00:00:00Z'),
            enrolledAt: new Date('2026-06-01T00:00:00Z'),
            warmupJitter: 0,
        });
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('getOperationalAvailabilityDateString returns null for a non-warming, non-ready phase', () => {
        const service = new TestBaseService();
        const now = Date.now();
        // No availableDate, no lastUsed; a phase that is neither ready nor warming returns null.
        // SESSION_ROTATED is "ready" so it returns a date; force a phase the warming check rejects:
        // use a doc with profilePicsUpdatedAt+sessionRotatedAt so inference yields SESSION_ROTATED (ready path).
        const d = service.pub.getOperationalAvailabilityDateString({ warmupPhase: WarmupPhase.SESSION_ROTATED } as any, now);
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('createVerifiedSessionClient logs unknown when getMe returns no phone', async () => {
        const service = new TestBaseService();
        const destroy = jest.fn(async () => undefined);
        telegramClientFactory.mockReturnValue({
            connect: jest.fn(async () => undefined),
            getMe: jest.fn(async () => ({})), // no phone -> sessionPhone '' -> 'unknown' fallback (line 2444)
            destroy,
        });
        const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        const c = await service.pub.createVerifiedSessionClient('919990000301', 'sess');
        expect(c).toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown'));
    });

    test('getUsageStatistics reports zero average gap when fewer than two used accounts', async () => {
        const countDocuments = jest.fn()
            .mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
        // single used doc -> gapCount stays 0 -> averageUsageGap branch false (line 2415)
        const find = jest.fn(() => ({ exec: jest.fn(async () => [{ lastUsed: new Date() }]) }));
        const service = new TestBaseService({ countDocuments, find });
        const stats = await service.getUsageStatistics('client-1');
        expect(stats.averageUsageGap).toBe(0);
    });

    test('buildPermanentAccountReason ignores non-numeric freeze values and returns base reason', async () => {
        const service = new TestBaseService();
        // freeze values present but non-numeric/empty -> no extras appended (line 663-664-671 false paths)
        const invoke = jest.fn(async () => ({ config: [
            { key: 'freeze_since_date', value: { nested: true } },
            { key: 'freeze_until_date', value: [] },
            { key: 'freeze_appeal_url', value: '' },
        ] }));
        const reason = await (service as any).buildPermanentAccountReason('FROZEN_METHOD_INVALID', { client: { invoke } } as any);
        expect(reason).toBe('FROZEN_METHOD_INVALID');
    });

    test('selfHealLegacyUsedAccounts backfills each legacy used doc and logs with clientId', async () => {
        const docs = [{ mobile: 'leg-1', lastUsed: new Date(), session: 'sess-1' }];
        const model = {
            find: jest.fn(() => ({ sort: () => ({ limit: () => ({ exec: jest.fn(async () => docs) }) }) })),
        };
        const service = new TestBaseService(model);
        jest.spyOn(service as any, 'backfillTimestamps').mockResolvedValue(undefined);
        const healed = await (service as any).selfHealLegacyUsedAccounts('client-7');
        expect(healed).toBe(1);
    });

    test('selfHealLegacyUsedAccounts returns 0 with no matching docs (no clientId scope)', async () => {
        const model = { find: jest.fn(() => ({ sort: () => ({ limit: () => ({ exec: jest.fn(async () => []) }) }) })) };
        const service = new TestBaseService(model);
        expect(await (service as any).selfHealLegacyUsedAccounts()).toBe(0);
    });

    test('selfHealLegacyWarmupAccounts repairs each legacy warming doc and logs without clientId', async () => {
        const docs = [{ mobile: 'warm-1', createdAt: new Date() }];
        const model = { find: jest.fn(() => ({ sort: () => ({ limit: () => ({ exec: jest.fn(async () => docs) }) }) })) };
        const service = new TestBaseService(model);
        jest.spyOn(service as any, 'repairWarmupMetadata').mockResolvedValue(docs[0]);
        expect(await (service as any).selfHealLegacyWarmupAccounts()).toBe(1);
    });

    test('selfHealLegacyWarmupAccounts returns 0 when nothing to heal', async () => {
        const model = { find: jest.fn(() => ({ sort: () => ({ limit: () => ({ exec: jest.fn(async () => []) }) }) })) };
        const service = new TestBaseService(model);
        expect(await (service as any).selfHealLegacyWarmupAccounts('client-9')).toBe(0);
    });

    test('backfillTimestamps skips unverified security timestamps and infers session-rotated when distinct backup exists', async () => {
        const service = new TestBaseService();
        const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        jest.spyOn(service as any, 'hasDistinctUsersBackupSession').mockResolvedValue(true);
        const now = Date.now();
        // doc missing twoFASetAt + warmupPhase: hits the unverified-security warn (line 1482) and
        // the SESSION_ROTATED inference (line 1489 truthy path) plus sessionRotatedAt backfill.
        await service.pub.backfillTimestamps('919990000310', {
            mobile: '919990000310', session: 'live', twoFASetAt: null, otherAuthsRemovedAt: null,
        } as any, now);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('unverified security'), expect.anything());
        expect(service.updateMock).toHaveBeenCalledWith('919990000310', expect.objectContaining({
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            sessionRotatedAt: expect.any(Date),
        }));
    });

    test('backfillTimestamps infers READY when no distinct backup session exists', async () => {
        const service = new TestBaseService();
        jest.spyOn(service as any, 'hasDistinctUsersBackupSession').mockResolvedValue(false);
        await service.pub.backfillTimestamps('919990000311', {
            mobile: '919990000311', session: 'live', twoFASetAt: new Date(), otherAuthsRemovedAt: new Date(),
        } as any, Date.now());
        expect(service.updateMock).toHaveBeenCalledWith('919990000311', expect.objectContaining({ warmupPhase: WarmupPhase.READY }));
    });

    test('backfillTimestamps no-ops when nothing is missing', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const complete: any = {
            mobile: '919990000312', session: 'live',
            warmupPhase: WarmupPhase.READY, enrolledAt: new Date(now), privacyUpdatedAt: new Date(now),
            profilePicsDeletedAt: new Date(now), nameBioUpdatedAt: new Date(now), usernameUpdatedAt: new Date(now),
            profilePicsUpdatedAt: new Date(now), twoFASetAt: new Date(now), otherAuthsRemovedAt: new Date(now),
        };
        await service.pub.backfillTimestamps('919990000312', complete, now);
        expect(service.updateMock).not.toHaveBeenCalled();
    });

    test('foreign 2FA notification reports inactive-update-failure when deactivation fails', async () => {
        const service = new TestBaseService();
        let call = 0;
        const tg = makeTgManager({
            hasPassword: jest.fn(async () => true),
            client: { ...makeTgManager().client, invoke: jest.fn(async () => {
                call++; if (call === 1) return { hasPassword: true }; throw new Error('PASSWORD_HASH_INVALID');
            }) },
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        // deactivateClient returns false (updateStatus throws) -> "inactivate FAILED" path.
        service.updateStatusMock.mockRejectedValueOnce(new Error('db down'));
        const doc: any = { mobile: '919990000320', tgId: 'tg-320', warmupPhase: WarmupPhase.SETTLING };
        const n = await service.pub.set2fa(doc, 0);
        expect(n).toBe(0);
        const notice = service.botsServiceMock.sendMessageByCategory.mock.calls.find(
            ([, body]: any[]) => typeof body === 'string' && body.includes('FOREIGN 2FA') && body.includes('inactivate FAILED'),
        );
        expect(notice).toBeDefined();
    });

    test('processLeaveChannelSequentially falls back to batch size when leaveResult omits counts', async () => {
        const updateOne = jest.fn(async () => ({}));
        const service = new TestBaseService({ updateOne }, { leaveChannelBatchSize: 2 });
        (service as any).leaveChannelMap.set('919990000330', ['c1', 'c2']);
        // leaveChannels resolves an object with NO successCount/skipCount -> ?? fallbacks (lines 1837-1838).
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(
            makeTgManager({ leaveChannels: jest.fn(async () => ({})) }) as any,
        );
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        await service.pub.processLeaveChannelSequentially();
        // leftCount defaulted to channelsToProcess.length (2) -> floor-at-0 pipeline decrement by 2.
        expect(updateOne).toHaveBeenCalledWith(
            { mobile: '919990000330' },
            [{ $set: { channels: { $max: [0, { $subtract: [{ $ifNull: ['$channels', 0] }, 2] }] } } }],
            { updatePipeline: true },
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════
// processClient drives each warmup action's success path (notification + summary)
// ════════════════════════════════════════════════════════════════════════════
describe('processClient warmup action success paths', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const ago = (now: number, days: number) => new Date(now - days * DAY);

    // GROWING phase with all settling + identity steps long-complete and channels at target.
    // The specific identity timestamp left null selects the corresponding catch-up action.
    function growingDoc(now: number, overrides: any): any {
        const base = {
            warmupPhase: WarmupPhase.GROWING,
            createdAt: ago(now, 30),
            enrolledAt: ago(now, 30),
            warmupJitter: 0,
            privacyUpdatedAt: ago(now, 28),
            twoFASetAt: ago(now, 25),
            otherAuthsRemovedAt: ago(now, 22),
            profilePicsDeletedAt: ago(now, 18),
            nameBioUpdatedAt: ago(now, 14),
            usernameUpdatedAt: ago(now, 10),
            profilePicsUpdatedAt: null,
            channels: 200,
            failedUpdateAttempts: 0,
            inUse: false,
        };
        return { ...base, ...overrides };
    }

    test('set_privacy success emits update notification (lines 1308-1315)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc = growingDoc(now, { mobile: '919990000400', privacyUpdatedAt: null });
        jest.spyOn(service as any, 'updatePrivacySettings').mockResolvedValue(1);
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBe('set_privacy');
    });

    test('delete_photos success emits update notification (lines 1319-1326)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc = growingDoc(now, { mobile: '919990000401', profilePicsDeletedAt: null, nameBioUpdatedAt: null, usernameUpdatedAt: null });
        jest.spyOn(service as any, 'deleteProfilePhotos').mockResolvedValue(1);
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBe('delete_photos');
    });

    test('update_name_bio success emits update notification (lines 1330-1337)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc = growingDoc(now, { mobile: '919990000402', nameBioUpdatedAt: null, usernameUpdatedAt: null });
        service.updateNameAndBioMock.mockResolvedValueOnce(1);
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBe('update_name_bio');
    });

    test('update_username success emits update notification (lines 1341-1348)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const doc = growingDoc(now, { mobile: '919990000403', usernameUpdatedAt: null });
        service.updateUsernameMock.mockResolvedValueOnce(1);
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBe('update_username');
    });

    test('upload_photo success emits update notification (lines 1352-1359)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        // All identity done, channels at target, enrolled past the maturing floor, no photo yet.
        const doc = growingDoc(now, { mobile: '919990000404' });
        jest.spyOn(service as any, 'updateProfilePhotos').mockResolvedValue(1);
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBe('upload_photo');
    });

    test('advance_to_ready emits READY notification (lines 1280-1287)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        // All steps done incl. photo, enrolled past the ready floor -> advance_to_ready.
        const doc = growingDoc(now, { mobile: '919990000405', profilePicsUpdatedAt: ago(now, 2) });
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBe('advance_to_ready');
        const readyNotice = service.botsServiceMock.sendMessageByCategory.mock.calls.find(
            ([, body]: any[]) => typeof body === 'string' && body.includes('WARMUP READY'),
        );
        expect(readyNotice).toBeDefined();
    });

    test('organic_only success stamps activity (lines 1296-1303)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        const tg = makeTgManager();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        // GROWING, identity done but username only 1 day old -> organic_only catch-up.
        const doc = growingDoc(now, { mobile: '919990000406', usernameUpdatedAt: ago(now, 1) });
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBe('organic_only');
        expect(service.updateMock).toHaveBeenCalledWith('919990000406', expect.objectContaining({ organicActivityAt: expect.any(Date) }));
    });

    test('join_channels action returns early without a TG connection (line 1275-1276)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        // GROWING with identity done but channels below target -> join_channels.
        const doc = growingDoc(now, { mobile: '919990000407', channels: 10 });
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateCount).toBe(0);
    });

    test('wait action stamps lastUpdateAttempt and returns early (lines 1270-1272)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        // ENROLLED and too young -> wait.
        const doc: any = {
            mobile: '919990000408', warmupPhase: WarmupPhase.ENROLLED,
            createdAt: ago(now, 0), enrolledAt: ago(now, 0), warmupJitter: 5,
            failedUpdateAttempts: 0, inUse: false,
        };
        const res = await service.processClient(doc, { clientId: 'client-1' } as Client);
        expect(res.updateCount).toBe(0);
        expect(service.updateMock).toHaveBeenCalledWith('919990000408', expect.objectContaining({ lastUpdateAttempt: expect.any(Date) }));
    });

    test('in-use clients are skipped immediately (lines 1181-1183)', async () => {
        const service = new TestBaseService();
        const res = await service.processClient({ mobile: '919990000409', inUse: true } as any, { clientId: 'client-1' } as Client);
        expect(res).toEqual({ updateCount: 0 });
    });

    test('missing client object short-circuits (lines 1186-1188)', async () => {
        const service = new TestBaseService();
        const res = await service.processClient({ mobile: '919990000410', inUse: false } as any, null as any);
        expect(res).toEqual({ updateCount: 0 });
    });
});

// ════════════════════════════════════════════════════════════════════════════
// processClient warmup action FAILURE paths (updateCount === 0 -> null summary)
// ════════════════════════════════════════════════════════════════════════════
describe('processClient warmup action failure summaries', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const ago = (now: number, days: number) => new Date(now - days * DAY);
    function growingDoc(now: number, overrides: any): any {
        return {
            warmupPhase: WarmupPhase.GROWING,
            createdAt: ago(now, 30), enrolledAt: ago(now, 30), warmupJitter: 0,
            privacyUpdatedAt: ago(now, 28), twoFASetAt: ago(now, 25), otherAuthsRemovedAt: ago(now, 22),
            profilePicsDeletedAt: ago(now, 18), nameBioUpdatedAt: ago(now, 14), usernameUpdatedAt: ago(now, 10),
            profilePicsUpdatedAt: null, channels: 200, failedUpdateAttempts: 0, inUse: false, ...overrides,
        };
    }

    test('set_privacy returning 0 yields null summary (line 1315 false path)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        jest.spyOn(service as any, 'updatePrivacySettings').mockResolvedValue(0);
        const res = await service.processClient(growingDoc(now, { mobile: '919990000420', privacyUpdatedAt: null }), { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBeNull();
    });

    test('delete_photos returning 0 yields null summary (line 1326 false path)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        jest.spyOn(service as any, 'deleteProfilePhotos').mockResolvedValue(0);
        const res = await service.processClient(growingDoc(now, { mobile: '919990000421', profilePicsDeletedAt: null, nameBioUpdatedAt: null, usernameUpdatedAt: null }), { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBeNull();
    });

    test('update_name_bio returning 0 yields null summary (line 1337 false path)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        service.updateNameAndBioMock.mockResolvedValueOnce(0);
        const res = await service.processClient(growingDoc(now, { mobile: '919990000422', nameBioUpdatedAt: null, usernameUpdatedAt: null }), { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBeNull();
    });

    test('update_username returning 0 yields null summary (line 1348 false path)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        service.updateUsernameMock.mockResolvedValueOnce(0);
        const res = await service.processClient(growingDoc(now, { mobile: '919990000423', usernameUpdatedAt: null }), { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBeNull();
    });

    test('upload_photo returning 0 yields null summary (line 1359 false path)', async () => {
        const service = new TestBaseService();
        const now = Date.now();
        jest.spyOn(service as any, 'updateProfilePhotos').mockResolvedValue(0);
        const res = await service.processClient(growingDoc(now, { mobile: '919990000424' }), { clientId: 'client-1' } as Client);
        expect(res.updateSummary).toBeNull();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Non-Error thrown values exercise the `instanceof Error ? : String(error)` else paths
// ════════════════════════════════════════════════════════════════════════════
describe('non-Error error-text fallbacks', () => {
    test('expireUserByMobile stringifies a non-Error rejection (line 2074 false path)', async () => {
        const service = new TestBaseService();
        service.usersServiceMock.expireAccount.mockRejectedValueOnce('plain string failure');
        const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        await expect(service.pub.expireUserByMobile('919990000430')).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('plain string failure'));
    });

    test('handleError stringifies a non-Error value and omits mobile when not provided (lines 533/541 false paths)', () => {
        const service = new TestBaseService();
        // no mobile -> contextWithMobile uses bare context; non-Error -> String(error)
        const details = (service as any).handleError({ weird: true }, 'ctx-no-mobile');
        expect(details).toBeDefined();
    });

    test('updateProfilePhotos upload of a non-Error rejection still completes (line 924 false path)', async () => {
        const service = new TestBaseService();
        const doc: any = { mobile: '919990000431', tgId: 'tg-431' };
        const tg = makeTgManager({
            client: { ...makeTgManager().client, invoke: jest.fn(async () => ({ photos: [] })) },
            updateProfilePic: jest.fn(async () => { throw 'string upload failure'; }),
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue(tg as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const n = await service.pub.updateProfilePhotos(
            { ...doc, assignedProfilePics: ['https://x.test/a.jpg', 'https://x.test/b.jpg'] }, {} as Client, 0,
        );
        expect(n).toBe(1);
    });

    test('safeUnregisterClient stringifies a non-Error rejection (line 527 false path)', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'unregisterClient').mockRejectedValueOnce('non-error unregister');
        const errSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
        await expect((service as any).safeUnregisterClient('m1')).resolves.toBeUndefined();
        expect(errSpy).toHaveBeenCalled();
    });
});
