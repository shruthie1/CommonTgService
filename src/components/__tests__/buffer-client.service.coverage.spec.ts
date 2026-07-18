/**
 * Buffer Client Service — subclass-specific coverage spec.
 *
 * Real MongoDB (memory server) + real BufferClientService logic.
 * Only true externals are mocked: telegram/GramJS sleep, connectionManager,
 * organic-activity, channelInfo, fetchWithTimeout, notifbot, isPermanentError.
 *
 * Targets the buffer-specific code that the API spec does not exercise:
 * warmup profile updates (updateNameAndBio/updateUsername), enrollment
 * (setAsBufferClient / createBufferClientFromUser), refillJoinQueue,
 * joinchannelForBufferClients, diagnostics, checkBufferClients internals,
 * distribution stats, bulk session rotation, search/executeQuery error paths.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';
import { BufferClient } from '../buffer-clients/schemas/buffer-client.schema';
import { BufferClientSchema } from '../buffer-clients/schemas/buffer-client.schema';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { WarmupPhase } from '../shared/base-client.service';
import {
    MongoTestContext, startMongo, stopMongo,
    makeBufferClientData, resetCounter,
    mockBotsService, mockActiveChannelsService, mockChannelsService, mockSessionService,
} from './api-test-helpers';
import { connectionManager } from '../Telegram/utils/connection-manager';
import * as channelInfoModule from '../../utils/telegram-utils/channelinfo';
import * as organicModule from '../shared/organic-activity';
import isPermanentErrorDefault from '../../utils/isPermanentError';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/mock-bot'),
}));
jest.mock('../../utils/isPermanentError', () => ({
    __esModule: true,
    default: jest.fn(() => false),
}));

const isPermanentError = isPermanentErrorDefault as unknown as jest.Mock;

describe('BufferClientService coverage', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let BufferClientModel: Model<BufferClient>;
    let service: BufferClientService;
    let botsService: ReturnType<typeof mockBotsService>;
    let telegramService: any;
    let usersService: any;
    let clientService: any;
    let promoteClientService: any;
    let activeChannelsService: ReturnType<typeof mockActiveChannelsService>;
    let channelsService: any;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('buffer-coverage-test');
        connection = ctx.connection;
        BufferClientModel = connection.model<BufferClient>('BufferClientCoverage', BufferClientSchema);
        await BufferClientModel.init();
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    beforeEach(() => {
        resetCounter();
        isPermanentError.mockReset();
        isPermanentError.mockReturnValue(false);
        botsService = mockBotsService();
        telegramService = {
            hasActiveClientSetup: jest.fn(() => false),
            getChannelInfo: jest.fn(async () => ({ ids: ['c1', 'c2'], count: 2 })),
            updateUsernameForAClient: jest.fn(async () => 'set_username'),
            updateUsername: jest.fn(async () => undefined),
            createNewSession: jest.fn(async (m: string) => `fresh-${m}`),
        };
        usersService = {
            search: jest.fn(async () => []),
            update: jest.fn(async () => 1),
            executeQuery: jest.fn(async () => []),
            expireAccount: jest.fn(async () => undefined),
        };
        clientService = {
            findAll: jest.fn(async () => [{ clientId: 'test-client-1', mobile: '15559999999' }]),
            getActiveClientAssignment: jest.fn(async () => null),
        };
        promoteClientService = {
            findAll: jest.fn(async () => []),
            existsByMobile: jest.fn(async () => false),
            model: connection.model<any>('PromoteForBufferCoverage', BufferClientSchema),
        };
        activeChannelsService = mockActiveChannelsService();
        channelsService = mockChannelsService();
        channelsService.getActiveChannels = jest.fn().mockResolvedValue([]);

        service = new BufferClientService(
            BufferClientModel as any,
            telegramService as any,
            usersService as any,
            activeChannelsService as any,
            clientService as any,
            channelsService as any,
            promoteClientService as any,
            mockSessionService() as any,
            botsService as any,
        );
    });

    afterEach(async () => {
        await BufferClientModel.deleteMany({});
        await promoteClientService.model.deleteMany({});
        jest.restoreAllMocks();
    });

    // ─── search / executeQuery ───────────────────────────────────────────────

    describe('search()', () => {
        it('canonicalizes mobile and regex-matches username + clientId', async () => {
            await service.create(makeBufferClientData({ mobile: '917989706213', username: 'alpha_one', clientId: 'cid-search' }));
            await service.create(makeBufferClientData({ mobile: '917989706214', username: 'beta', clientId: 'other' }));

            const byUser = await service.search({ username: 'ALPHA' } as any);
            expect(byUser).toHaveLength(1);
            expect(byUser[0].mobile).toBe('917989706213');

            const byClient = await service.search({ clientId: 'cid-search' } as any);
            expect(byClient).toHaveLength(1);

            const byMobile = await service.search({ mobile: '917989706213' } as any);
            expect(byMobile).toHaveLength(1);
        });
    });

    describe('executeQuery()', () => {
        it('supports sort, limit and skip', async () => {
            await service.create(makeBufferClientData({ mobile: '15551110001', channels: 10 }));
            await service.create(makeBufferClientData({ mobile: '15551110002', channels: 20 }));
            await service.create(makeBufferClientData({ mobile: '15551110003', channels: 30 }));

            const res = await service.executeQuery({}, { channels: -1 }, 2, 1);
            expect(res).toHaveLength(2);
            expect(res[0].channels).toBe(20);
        });
    });

    // ─── BUFFER-SWAP ELIGIBILITY GATE (real query, real Mongo) ───────────────
    // This is the single gate (client.service.ts handleSetupClient) that stops an
    // under-warmed / dead / in-use buffer from being promoted into a live tg-aut
    // slot. Every other test mocks executeQuery, so this runs the REAL query against
    // REAL Mongo and proves each constraint actually excludes the wrong accounts.
    describe('buffer-swap candidate eligibility (the real swap query)', () => {
        const coll = () => BufferClientModel.collection;
        const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20d ago (>=15d)
        const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5d ago (<15d)
        const today = '2026-06-20';
        const pastDate = '2026-01-01';
        const futureDate = '2099-01-01';

        // Mirrors the production query in client.service.ts handleSetupClient.
        const swapQuery = (currentMobile: string) => ({
            clientId: 'swap-cid',
            mobile: { $ne: currentMobile },
            createdAt: { $lte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) },
            availableDate: { $lte: today },
            channels: { $gt: 200 },
            status: 'active',
            inUse: { $ne: true },
            warmupPhase: WarmupPhase.SESSION_ROTATED,
        });

        const eligibleDoc = (over: Record<string, unknown> = {}) => ({
            tgId: `tg-${Math.random()}`,
            session: `sess-${Math.random()}`,
            clientId: 'swap-cid',
            createdAt: old,
            updatedAt: old,
            availableDate: pastDate,
            channels: 250,
            status: 'active',
            inUse: false,
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            ...over,
        });

        // Real-format mobiles (country code + 11-15 digits) — the schema setter validates these on hydrate.
        const M = {
            eligible: '910000000001',
            current: '910000000002',
            tooNew: '910000000003',
            futureAvail: '910000000004',
            tooFewChannels: '910000000005',
            inactive: '910000000006',
            inUse: '910000000007',
            warming: '910000000008',
        };

        it('selects ONLY a fully-eligible buffer and excludes every ineligible-by-one-clause account', async () => {
            await coll().insertMany([
                eligibleDoc({ mobile: M.eligible }),
                eligibleDoc({ mobile: M.current }),                                  // excluded: it's the current mobile ($ne)
                eligibleDoc({ mobile: M.tooNew, createdAt: recent, updatedAt: recent }), // excluded: <15d old
                eligibleDoc({ mobile: M.futureAvail, availableDate: futureDate }),    // excluded: not yet available
                eligibleDoc({ mobile: M.tooFewChannels, channels: 200 }),            // excluded: channels not > 200
                eligibleDoc({ mobile: M.inactive, status: 'inactive' }),             // excluded: not active
                eligibleDoc({ mobile: M.inUse, inUse: true }),                       // excluded: already in use
                eligibleDoc({ mobile: M.warming, warmupPhase: WarmupPhase.GROWING }), // excluded: not session_rotated
            ]);

            const result = await service.executeQuery(swapQuery(M.current), { availableDate: 1, createdAt: 1 }, 10);
            const mobiles = result.map((r: any) => r.mobile);
            expect(mobiles).toEqual([M.eligible]);
        });

        it('returns nothing when the only candidate is still warming (would-be account loss)', async () => {
            // A regression deleting the warmupPhase clause would let this half-warm account go live.
            await coll().insertMany([
                eligibleDoc({ mobile: M.warming, warmupPhase: WarmupPhase.MATURING }),
            ]);
            const result = await service.executeQuery(swapQuery(M.current), { availableDate: 1, createdAt: 1 }, 10);
            expect(result).toHaveLength(0);
        });

        it('orders eligible candidates by availableDate then createdAt', async () => {
            await coll().insertMany([
                eligibleDoc({ mobile: M.inactive, availableDate: '2026-02-01' }),
                eligibleDoc({ mobile: M.eligible, availableDate: '2026-01-01' }),
            ]);
            const result = await service.executeQuery(swapQuery(M.current), { availableDate: 1, createdAt: 1 }, 10);
            expect(result.map((r: any) => r.mobile)).toEqual([M.eligible, M.inactive]);
        });
    });

    // ─── existsByMobile ──────────────────────────────────────────────────────

    it('existsByMobile reflects presence', async () => {
        await service.create(makeBufferClientData({ mobile: '15551120001' }));
        expect(await service.existsByMobile('15551120001')).toBe(true);
        expect(await service.existsByMobile('15551129999')).toBe(false);
    });

    // ─── create cross-pool guard + validation ────────────────────────────────

    describe('create() guards', () => {
        it('rejects cross-pool mobile already in promote pool', async () => {
            promoteClientService.existsByMobile.mockResolvedValue(true);
            await expect(service.create(makeBufferClientData({ mobile: '15551130001' })))
                .rejects.toThrow(/already enrolled in promoteClients/);
        });

        it('rejects null session as blank', async () => {
            await expect(service.create(makeBufferClientData({ mobile: '15551130002', session: null as any })))
                .rejects.toThrow(BadRequestException);
        });
    });

    // ─── updateUsername (buffer) ─────────────────────────────────────────────

    describe('updateUsername()', () => {
        it('short-circuits when username already stored (no TG connection)', async () => {
            await service.create(makeBufferClientData({ mobile: '15551200001', username: 'already_set' }));
            const doc = await service.findOne('15551200001');
            const getClientSpy = jest.spyOn(connectionManager, 'getClient');

            const count = await service.updateUsername(doc as any, { clientId: 'c', name: 'n' } as any, 0);
            expect(count).toBe(1);
            expect(getClientSpy).not.toHaveBeenCalled();
            const after = await service.findOne('15551200001');
            expect(after!.usernameUpdatedAt).toBeInstanceOf(Date);
        });

        it('updates username via Telegram when not stored', async () => {
            await service.create(makeBufferClientData({ mobile: '15551200002', username: null as any }));
            const doc = await service.findOne('15551200002');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ getMe: jest.fn(async () => ({ username: 'tg_user' })) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            const count = await service.updateUsername(doc as any, { clientId: 'c1', name: 'Name' } as any, 0);
            expect(count).toBe(1);
            expect(telegramService.updateUsernameForAClient).toHaveBeenCalled();
            const after = await service.findOne('15551200002');
            expect(after!.username).toBe('set_username');
        });

        it('falls back to the live TG username when the service returns nothing (line 428)', async () => {
            await service.create(makeBufferClientData({ mobile: '15551200010', username: null as any }));
            const doc = await service.findOne('15551200010');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ getMe: jest.fn(async () => ({ username: 'live_tg_name' })) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            telegramService.updateUsernameForAClient.mockResolvedValue(null);

            const count = await service.updateUsername(doc as any, { clientId: 'c1', name: 'Name' } as any, 0);
            expect(count).toBe(1);
            const after = await service.findOne('15551200010');
            expect(after!.username).toBe('live_tg_name');
        });

        it('increments failures on error and deactivates on permanent error', async () => {
            await service.create(makeBufferClientData({ mobile: '15551200003', username: null as any }));
            const doc = await service.findOne('15551200003');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => { throw new Error('SESSION_REVOKED'); }),
                client: { invoke: jest.fn() },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);

            const count = await service.updateUsername(doc as any, { clientId: 'c1', name: 'Name' } as any, 2);
            expect(count).toBe(0);
            // Real deactivateClient ran: it persists status=inactive + the permanent reason,
            // and (permanent) cascades to usersService.expireAccount (injected sibling mock).
            const after = await service.findOne('15551200003');
            expect(after!.failedUpdateAttempts).toBe(3);
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(after!.message).toContain('SESSION_REVOKED');
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551200003', expect.any(String));
        });
    });

    // ─── updateNameAndBio (buffer) ───────────────────────────────────────────

    describe('updateNameAndBio()', () => {
        it('marks step done when client has no persona pool', async () => {
            await service.create(makeBufferClientData({ mobile: '15551300001' }));
            const doc = await service.findOne('15551300001');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ getMe: jest.fn(async () => ({ firstName: 'Old' })) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            const count = await service.updateNameAndBio(doc as any, { clientId: 'c1', name: 'X' } as any, 0);
            expect(count).toBe(1);
            const after = await service.findOne('15551300001');
            expect(after!.nameBioUpdatedAt).toBeInstanceOf(Date);
        });

        it('atomically assigns a persona and applies name + bio to Telegram', async () => {
            await service.create(makeBufferClientData({ mobile: '15551300002' }));
            const doc = await service.findOne('15551300002');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: '' }], fullUser: { about: '' } }) // GetFullUser
                .mockResolvedValue(undefined); // UpdateProfile calls
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Old', username: 'u' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            const client = {
                clientId: 'c1', name: 'Persona One',
                firstNames: ['Aria'], bufferLastNames: ['Stone'], bios: ['hi there'], profilePics: [],
                dbcoll: 'db',
            };
            const count = await service.updateNameAndBio(doc as any, client as any, 0);
            expect(count).toBeGreaterThanOrEqual(1);
            const after = await service.findOne('15551300002');
            expect(after!.assignedFirstName).toBe('Aria');
            expect(after!.nameBioUpdatedAt).toBeInstanceOf(Date);
        });

        it('reuses existing valid assignment without re-querying', async () => {
            await service.create(makeBufferClientData({
                mobile: '15551300003', assignedFirstName: 'Bea', assignedLastName: 'Lynn', assignedBio: 'bio',
            }));
            const doc = await service.findOne('15551300003');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: 'Lynn' }], fullUser: { about: 'bio' } });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Bea', username: 'u' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            const client = { clientId: 'c1', name: 'n', firstNames: ['Bea'], bufferLastNames: ['Lynn'], bios: ['bio'], profilePics: [] };
            const count = await service.updateNameAndBio(doc as any, client as any, 0);
            // profile already matched → no UpdateProfile, but step satisfied
            expect(count).toBe(1);
        });

        it('handles permanent error during profile update', async () => {
            await service.create(makeBufferClientData({ mobile: '15551300004' }));
            const doc = await service.findOne('15551300004');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => { throw new Error('USER_DEACTIVATED_BAN'); }),
                client: { invoke: jest.fn() },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);

            const count = await service.updateNameAndBio(doc as any, { clientId: 'c1', name: 'n' } as any, 1);
            expect(count).toBe(0);
            // Real deactivateClient ran — assert the persisted retirement state, not a spy.
            const after = await service.findOne('15551300004');
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(after!.message).toContain('USER_DEACTIVATED_BAN');
            expect(after!.failedUpdateAttempts).toBe(2);
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551300004', expect.any(String));
        });
    });

    // ─── setAsBufferClient (enrollment) ──────────────────────────────────────

    describe('setAsBufferClient()', () => {
        it('enrolls an eligible user as a buffer client', async () => {
            usersService.search.mockResolvedValue([{ tgId: 'tg-enroll', session: 'user-session', mobile: '15551400001' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            const result = await service.setAsBufferClient('15551400001', 'test-client-1', '2026-05-01');
            expect(result).toContain('successfully');
            const doc = await service.findOne('15551400001');
            expect(doc!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(doc!.channels).toBe(2);
            expect(doc!.session).toBe('user-session');
        });

        it('throws when user not found', async () => {
            usersService.search.mockResolvedValue([]);
            await expect(service.setAsBufferClient('15551400002', 'test-client-1'))
                .rejects.toThrow('user not found');
        });

        it('throws when user session missing', async () => {
            usersService.search.mockResolvedValue([{ tgId: 't', session: '   ', mobile: '15551400003' }]);
            await expect(service.setAsBufferClient('15551400003', 'test-client-1'))
                .rejects.toThrow('User session missing');
        });

        it('throws Conflict when already a buffer client', async () => {
            await service.create(makeBufferClientData({ mobile: '15551400004' }));
            usersService.search.mockResolvedValue([{ tgId: 't', session: 's', mobile: '15551400004' }]);
            await expect(service.setAsBufferClient('15551400004', 'test-client-1'))
                .rejects.toThrow(ConflictException);
        });

        it('throws when mobile is an active client', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'c', mobile: '15551400005' }]);
            usersService.search.mockResolvedValue([{ tgId: 't', session: 's', mobile: '15551400005' }]);
            await expect(service.setAsBufferClient('15551400005', 'test-client-1'))
                .rejects.toThrow('Number is an Active Client');
        });

        it('expires the account on permanent enrollment error', async () => {
            usersService.search.mockResolvedValue([{ tgId: 'tg', session: 's', mobile: '15551400006' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            telegramService.getChannelInfo.mockRejectedValue(new Error('SESSION_REVOKED'));
            isPermanentError.mockReturnValue(true);

            await expect(service.setAsBufferClient('15551400006', 'test-client-1')).rejects.toThrow();
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551400006', expect.any(String));
        });
    });

    // ─── refillJoinQueue ─────────────────────────────────────────────────────

    describe('refillJoinQueue()', () => {
        it('returns 0 when active client setup is in progress', async () => {
            telegramService.hasActiveClientSetup.mockReturnValue(true);
            expect(await service.refillJoinQueue()).toBe(0);
        });

        it('queues joins for an eligible buffer client below target', async () => {
            await service.create(makeBufferClientData({ mobile: '15551500001', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
                ids: ['x1'], canSendFalseCount: 0, canSendFalseChats: [],
            } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);

            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(1);
            expect((service as any).joinChannelMap.get('15551500001')).toEqual([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);
        });

        it('excludes READY and SESSION_ROTATED accounts while retaining legacy phase-less accounts', async () => {
            await service.create(makeBufferClientData({ mobile: '15551500004', channels: 10, status: 'active', clientId: 'test-client-1', warmupPhase: WarmupPhase.READY }));
            await service.create(makeBufferClientData({ mobile: '15551500005', channels: 10, status: 'active', clientId: 'test-client-1', warmupPhase: WarmupPhase.SESSION_ROTATED }));
            await service.create(makeBufferClientData({ mobile: '15551500006', channels: 10, status: 'active', clientId: 'test-client-1' }));
            await BufferClientModel.collection.updateOne({ mobile: '15551500006' }, { $unset: { warmupPhase: '' } });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: [], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);

            expect(await service.refillJoinQueue('test-client-1')).toBe(1);
            expect((service as any).joinChannelMap.has('15551500004')).toBe(false);
            expect((service as any).joinChannelMap.has('15551500005')).toBe(false);
            expect((service as any).joinChannelMap.has('15551500006')).toBe(true);
        });

        it('skips the live primary client mobile', async () => {
            // Buffer doc shares the same mobile that the active client uses as primary.
            // create() runs before we point clientService at it, so the cross-pool guard
            // does not fire on creation.
            await service.create(makeBufferClientData({ mobile: '15551500002', channels: 10, status: 'active', clientId: 'test-client-1' }));
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15551500002' }]);
            const getClientSpy = jest.spyOn(connectionManager, 'getClient');
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
            // primary mobile excluded from query (mobile $nin) — never connects
            expect(getClientSpy).not.toHaveBeenCalled();
        });

        it('deactivates on permanent error while refilling', async () => {
            await service.create(makeBufferClientData({ mobile: '15551500003', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('AUTH_KEY_UNREGISTERED'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            await service.refillJoinQueue('test-client-1');
            // Real deactivateClient ran on the permanent error — assert persisted inactive state.
            const after = await service.findOne('15551500003');
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(after!.message).toContain('AUTH_KEY_UNREGISTERED');
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551500003', expect.any(String));
        });
    });

    // ─── joinchannelForBufferClients ─────────────────────────────────────────

    describe('joinchannelForBufferClients()', () => {
        it('short-circuits when active client setup exists', async () => {
            telegramService.hasActiveClientSetup.mockReturnValue(true);
            expect(await service.joinchannelForBufferClients()).toContain('skipping');
        });

        it('queues join + leave sets based on channel info', async () => {
            await service.create(makeBufferClientData({ mobile: '15551600001', channels: 10, status: 'active', clientId: 'test-client-1' }));
            await service.create(makeBufferClientData({ mobile: '15551600002', channels: 20, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo')
                .mockResolvedValueOnce({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any)
                .mockResolvedValueOnce({ ids: ['b'], canSendFalseCount: 12, canSendFalseChats: ['leave-1'] } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);

            const result = await service.joinchannelForBufferClients(true, 'test-client-1');
            expect(result).toContain('Buffer Join queued for: 1');
            expect(result).toContain('Leave queued for: 1');
        });

        it('deactivates a buffer client on permanent error during join sweep', async () => {
            await service.create(makeBufferClientData({ mobile: '15551600003', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('SESSION_REVOKED'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            await service.joinchannelForBufferClients(true, 'test-client-1');
            // Real deactivateClient ran during the sweep — assert persisted inactive state.
            const after = await service.findOne('15551600003');
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(after!.message).toContain('SESSION_REVOKED');
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551600003', expect.any(String));
        });

        it('skips when join/leave processing is already in progress', async () => {
            (service as any).isJoinChannelProcessing = true;
            const result = await service.joinchannelForBufferClients();
            expect(result).toContain('still processing');
            (service as any).isJoinChannelProcessing = false;
        });

        it('runs an all-clients sweep and uses channelsService for high-channel accounts', async () => {
            // No clientId → joinScopeClientId null + "all" logging (1414/1425).
            // >=220 channels → channelsService.getActiveChannels branch (1448-1450 false side).
            await service.create(makeBufferClientData({ mobile: '15551600010', channels: 240, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
                ids: new Array(230).fill('c'), canSendFalseCount: 0, canSendFalseChats: [],
            } as any);
            const highChannelSpy = jest.fn().mockResolvedValue([{ channelId: 'h1', username: 'h1', canSendMsgs: true }]);
            channelsService.getActiveChannels = highChannelSpy;

            const result = await service.joinchannelForBufferClients(true);
            expect(highChannelSpy).toHaveBeenCalled();
            expect(result).toContain('Buffer Join queued');
        });
    });

    // ─── diagnostics ─────────────────────────────────────────────────────────

    describe('diagnoseEnrollmentDecision()', () => {
        it('produces a per-client decision report', async () => {
            await service.create(makeBufferClientData({ mobile: '15551700001', status: 'active', clientId: 'test-client-1', warmupPhase: 'ready' }));
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 3, readyActive: 1, warmingPipeline: 0, totalActive: 1,
                calculationReason: 'reason', priority: 5, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            const report = await service.diagnoseEnrollmentDecision();
            expect(report.totalClientsNeedingEnrollment).toBe(1);
            expect(Array.isArray(report.perClientDecisions)).toBe(true);
        });

        it('reports blocked reason when no deficit', async () => {
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 0, readyActive: 5, warmingPipeline: 0, totalActive: 5,
                calculationReason: 'ok', priority: 1, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            const report = await service.diagnoseEnrollmentDecision();
            expect(report.totalClientsNeedingEnrollment).toBe(0);
        });

        it('caps global allocation at maxNewClientsPerTrigger across many clients (line 955)', async () => {
            // Several clients each with a deficit > the global per-trigger cap (10) → the
            // allocation loop fills up and breaks early.
            clientService.findAll.mockResolvedValue([
                { clientId: 'g-a', mobile: '77770000001' },
                { clientId: 'g-b', mobile: '77770000002' },
                { clientId: 'g-c', mobile: '77770000003' },
            ]);
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 6, readyActive: 0, warmingPipeline: 0, totalActive: 0,
                calculationReason: 'deficit', priority: 1, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            const report = await service.diagnoseEnrollmentDecision();
            // 3 clients × 6 = 18 requested, but global cap is 10.
            expect(report.totalSlotsAllocated).toBe(10);
        });

        it('sorts per-client decisions by descending totalNeeded (line 991)', async () => {
            // Two clients with different deficits exercise the final sort comparator.
            clientService.findAll.mockResolvedValue([
                { clientId: 'c-low', mobile: '88880000001' },
                { clientId: 'c-high', mobile: '88880000002' },
            ]);
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState')
                .mockImplementation(async (cid: string) => ({
                    totalNeeded: cid === 'c-high' ? 7 : 2,
                    readyActive: 0, warmingPipeline: 0, totalActive: 0,
                    calculationReason: 'deficit', priority: 1, replenishmentWindowNeeds: [], windowNeeds: [],
                }));
            const report = await service.diagnoseEnrollmentDecision();
            const decisions = report.perClientDecisions as any[];
            expect(decisions[0].totalNeeded).toBeGreaterThanOrEqual(decisions[1].totalNeeded);
            expect(decisions[0].clientId).toBe('c-high');
        });
    });

    describe('diagnoseWarmupPipeline()', () => {
        it('classifies active buffer clients into phases + actions', async () => {
            await service.create(makeBufferClientData({
                mobile: '15551710001', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'settling', enrolledAt: new Date(), privacyUpdatedAt: new Date(),
            }));
            const report = await service.diagnoseWarmupPipeline();
            expect(report.totalActive).toBe(1);
            expect(report.phaseCounts).toBeDefined();
        });

        it('skips docs whose client is missing', async () => {
            await service.create(makeBufferClientData({ mobile: '15551710002', status: 'active', clientId: 'ghost-client' }));
            const report = await service.diagnoseWarmupPipeline();
            expect((report.skippedReasons as any).no_client).toBe(1);
        });

        it('skips in-use, primary-mobile and session_rotated-used docs', async () => {
            await service.create(makeBufferClientData({ mobile: '15551710100', status: 'active', clientId: 'test-client-1' })); // primary
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15551710100' }]);
            await service.create(makeBufferClientData({ mobile: '15551710101', status: 'active', clientId: 'test-client-1', inUse: true })); // in use
            await service.create(makeBufferClientData({
                mobile: '15551710102', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'session_rotated', lastUsed: new Date(),
            })); // rotated + used
            const report = await service.diagnoseWarmupPipeline();
            expect((report.skippedReasons as any).is_primary_mobile).toBe(1);
            expect((report.skippedReasons as any).in_use).toBe(1);
            expect((report.skippedReasons as any).session_rotated_used).toBe(1);
        });

        it('flags stuck and failed-backoff accounts in the simulation', async () => {
            const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
            await service.create(makeBufferClientData({
                mobile: '15551710200', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'settling', enrolledAt: longAgo, failedUpdateAttempts: 2,
                lastUpdateFailure: longAgo,
            }));
            await service.create(makeBufferClientData({
                mobile: '15551710201', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'settling', enrolledAt: new Date(), failedUpdateAttempts: 5,
                lastUpdateFailure: new Date(),
            }));
            const report = await service.diagnoseWarmupPipeline();
            // Both active settling docs are eligible candidates...
            expect(report.totalActive).toBe(2);
            expect(report.eligibleToProcess).toBe(2);
            expect((report.phaseCounts as any).settling).toBe(2);
            // ...but the simulation skips both: one is stuck (60d in settling),
            // the other is in failed-backoff (5 fails, failure just now).
            const sim = report.simulation as any;
            expect(sim.totalProcessed).toBe(0);
            expect(sim.mutationsUsed).toBe(0);
            expect(sim.totalSkippedOther).toBe(2);
            expect(sim.totalSkippedCooldown).toBe(0);
            expect(sim.totalSkippedAfterSlotLimit).toBe(0);
        });
    });

    // ─── checkBufferClients ──────────────────────────────────────────────────

    describe('checkBufferClients()', () => {
        it('leaves READY+lastUsed accounts for the paced ready-rotation scheduler', async () => {
            // Normal maintenance must never batch READY -> SESSION_ROTATED work.
            const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            await service.create(makeBufferClientData({
                mobile: '15551800001', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'ready', inUse: false, enrolledAt: past, lastUsed: past,
                privacyUpdatedAt: past, twoFASetAt: past, otherAuthsRemovedAt: past,
                profilePicsDeletedAt: past, nameBioUpdatedAt: past, usernameUpdatedAt: past,
                profilePicsUpdatedAt: past, channels: 250,
            }));
            // usersService.search is consulted by backfill/hasDistinctUsersBackupSession — keep it empty.
            usersService.search.mockResolvedValue([]);

            await service.checkBufferClients();

            const after = await service.findOne('15551800001');
            expect(after!.warmupPhase).toBe(WarmupPhase.READY);
            expect(after!.sessionRotatedAt ?? null).toBeNull();
            // The real summary notification was sent through the externally-mocked bots service.
            const summaryCall = botsService.sendMessageByCategory.mock.calls
                .find((c) => typeof c[1] === 'string' && c[1].includes('Buffer Client Check Summary'));
            expect(summaryCall).toBeDefined();
            // Guard cleared on completion.
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });

        it('skips concurrent invocation without mutating any client', async () => {
            await service.create(makeBufferClientData({
                mobile: '15551800050', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled',
            }));
            (service as any).checkingBufferClientsSince = Date.now();
            await service.checkBufferClients();
            // No pipeline ran → the enrolled doc is untouched (no lastUpdateAttempt stamped).
            const after = await service.findOne('15551800050');
            expect(after!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(after!.lastUpdateAttempt ?? null).toBeNull();
            // Concurrency guard left as-is (caller resets).
            expect((service as any).checkingBufferClientsSince).toBeGreaterThan(0);
            (service as any).checkingBufferClientsSince = 0;
        });

        it('skips when active client setup exists without mutating any client', async () => {
            await service.create(makeBufferClientData({
                mobile: '15551800060', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled',
            }));
            telegramService.hasActiveClientSetup.mockReturnValue(true);
            await service.checkBufferClients();
            const after = await service.findOne('15551800060');
            expect(after!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(after!.lastUpdateAttempt ?? null).toBeNull();
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });

        it('reports crash via notifbot when internal pipeline throws', async () => {
            // Mock an EXTERNAL dependency (clientService.findAll) to throw — the very first DB/external
            // call inside _checkBufferClientsInternal — exercising the real crash-handling branch.
            clientService.findAll.mockRejectedValue(new Error('boom'));
            await service.checkBufferClients();
            // The guard is always reset in the finally block even after a crash.
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });
    });

    describe('rotateReadyBufferClients()', () => {
        it('rotates only non-primary, non-in-use READY accounts without a Telegram call when lastUsed is present', async () => {
            const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            await service.create(makeBufferClientData({
                mobile: '15551800101', status: 'active', clientId: 'test-client-1',
                warmupPhase: WarmupPhase.READY, inUse: false, enrolledAt: past, lastUsed: past, channels: 250,
                privacyUpdatedAt: past, twoFASetAt: past, otherAuthsRemovedAt: past,
                profilePicsDeletedAt: past, nameBioUpdatedAt: past, usernameUpdatedAt: past, profilePicsUpdatedAt: past,
            }));
            await service.create(makeBufferClientData({
                mobile: '15551800102', status: 'active', clientId: 'test-client-1',
                warmupPhase: WarmupPhase.READY, inUse: true, enrolledAt: past, lastUsed: past, channels: 250,
                privacyUpdatedAt: past, twoFASetAt: past, otherAuthsRemovedAt: past,
                profilePicsDeletedAt: past, nameBioUpdatedAt: past, usernameUpdatedAt: past, profilePicsUpdatedAt: past,
            }));
            await service.create(makeBufferClientData({
                mobile: '15551800104', status: 'active', clientId: 'test-client-1',
                warmupPhase: WarmupPhase.READY, inUse: false, enrolledAt: past, lastUsed: past, channels: 250,
                privacyUpdatedAt: past, twoFASetAt: past, otherAuthsRemovedAt: past,
                profilePicsDeletedAt: past, nameBioUpdatedAt: past, usernameUpdatedAt: past, profilePicsUpdatedAt: past,
            }));
            const rotateSpy = jest.spyOn(service, 'rotateSession');

            await service.rotateReadyBufferClients();

            expect((await service.findOne('15551800101'))!.warmupPhase).toBe(WarmupPhase.SESSION_ROTATED);
            expect((await service.findOne('15551800102'))!.warmupPhase).toBe(WarmupPhase.READY);
            expect((await service.findOne('15551800104'))!.warmupPhase).toBe(WarmupPhase.READY);
            expect(rotateSpy).not.toHaveBeenCalled();
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });

        it('does not overlap an active buffer check', async () => {
            await service.create(makeBufferClientData({
                mobile: '15551800103', status: 'active', clientId: 'test-client-1',
                warmupPhase: WarmupPhase.READY, inUse: false,
            }));
            (service as any).checkingBufferClientsSince = Date.now();

            await service.rotateReadyBufferClients();

            expect((await service.findOne('15551800103'))!.warmupPhase).toBe(WarmupPhase.READY);
            (service as any).checkingBufferClientsSince = 0;
        });

        it('runs during join maintenance while excluding a stale queued READY mobile', async () => {
            const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            await service.create(makeBufferClientData({
                mobile: '15551800105', status: 'active', clientId: 'test-client-1',
                warmupPhase: WarmupPhase.READY, inUse: false, enrolledAt: past, lastUsed: past, channels: 250,
                privacyUpdatedAt: past, twoFASetAt: past, otherAuthsRemovedAt: past,
                profilePicsDeletedAt: past, nameBioUpdatedAt: past, usernameUpdatedAt: past, profilePicsUpdatedAt: past,
            }));
            (service as any).activeMaintenanceRun = { name: 'processJoinChannelInterval', startedAt: Date.now() };

            await service.rotateReadyBufferClients();

            expect((await service.findOne('15551800105'))!.warmupPhase).toBe(WarmupPhase.SESSION_ROTATED);
            (service as any).activeMaintenanceRun = null;
        });
    });

    // ─── updateInfo ──────────────────────────────────────────────────────────

    describe('updateInfo()', () => {
        it('runs health checks for stale active buffer clients (skipping primary)', async () => {
            await service.create(makeBufferClientData({
                mobile: '15551900001', status: 'active', clientId: 'test-client-1',
                lastChecked: new Date('2020-01-01'),
            }));
            const healthSpy = jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue({ passed: true, performed: true });
            await service.updateInfo();
            expect(healthSpy).toHaveBeenCalledWith('15551900001', expect.any(Number), expect.any(Number));
        });
    });

    // ─── distribution + simple getters ───────────────────────────────────────

    describe('distribution + getters', () => {
        it('computes buffer client distribution', async () => {
            await service.create(makeBufferClientData({ mobile: '15552000001', status: 'active', clientId: 'test-client-1', lastUsed: null }));
            await service.create(makeBufferClientData({ mobile: '15552000002', status: 'inactive', clientId: 'test-client-1' }));
            const dist = await service.getBufferClientDistribution();
            expect(dist.totalBufferClients).toBe(2);
            expect(dist.activeBufferClients).toBe(1);
            expect(dist.distributionPerClient[0].clientId).toBe('test-client-1');
        });

        it('getBufferClientsByClientId filters by status', async () => {
            await service.create(makeBufferClientData({ mobile: '15552000003', status: 'active', clientId: 'cid-z' }));
            await service.create(makeBufferClientData({ mobile: '15552000004', status: 'inactive', clientId: 'cid-z' }));
            expect(await service.getBufferClientsByClientId('cid-z')).toHaveLength(2);
            expect(await service.getBufferClientsByClientId('cid-z', 'active')).toHaveLength(1);
        });

        it('getBufferClientsByStatus + getBufferClientsWithMessages', async () => {
            await service.create(makeBufferClientData({ mobile: '15552000005', status: 'active' }));
            expect(await service.getBufferClientsByStatus('active')).toHaveLength(1);
            const withMsgs = await service.getBufferClientsWithMessages();
            expect(withMsgs[0]).toHaveProperty('message');
        });

        it('markAsActive sets status active', async () => {
            await service.create(makeBufferClientData({ mobile: '15552000006', status: 'inactive' }));
            const res = await service.markAsActive('15552000006');
            expect(res.status).toBe('active');
        });
    });

    // ─── updateAllClientSessions ─────────────────────────────────────────────

    describe('updateAllClientSessions()', () => {
        it('dry run returns candidate snapshot without rotating', async () => {
            await service.create(makeBufferClientData({ mobile: '15552100001', status: 'active', warmupPhase: 'ready' }));
            const result = await service.updateAllClientSessions({ dryRun: true });
            expect(result.dryRun).toBe(true);
            expect(result.candidateCount).toBe(1);
            expect(result.candidates).toHaveLength(1);
        });

        it('uses the default options object when called with no arguments (line 1723)', async () => {
            const result = await service.updateAllClientSessions();
            expect(result.dryRun).toBe(false);
            expect(result.candidateCount).toBe(0);
        });

        it('rotates a ready buffer client session', async () => {
            await service.create(makeBufferClientData({ mobile: '15552100002', status: 'active', warmupPhase: 'ready', session: 'old-session' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => true),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'ensureDistinctUsersBackupSession').mockResolvedValue(true);
            telegramService.createNewSession.mockResolvedValue('brand-new-session');

            const result = await service.updateAllClientSessions({ mobile: '15552100002' });
            expect(result.rotated).toBe(1);
            const after = await service.findOne('15552100002');
            expect(after!.warmupPhase).toBe(WarmupPhase.SESSION_ROTATED);
        });

        it('recovers a missing session then rotates', async () => {
            await service.create(makeBufferClientData({ mobile: '15552100004', status: 'active', warmupPhase: 'session_rotated', session: 'has-session' }));
            // Force empty session at rotation time by stubbing the find to return a session-less doc
            const realFind = BufferClientModel.find.bind(BufferClientModel);
            jest.spyOn(BufferClientModel, 'find').mockImplementationOnce((...args: any[]) => {
                const q = realFind(...(args as [any]));
                const origExec = q.exec.bind(q);
                (q as any).exec = async () => {
                    const docs = await origExec();
                    return docs.map((d: any) => { const o = d.toObject ? d : d; (d as any).session = ''; return d; });
                };
                return q as any;
            });
            jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue({ activeSession: 'recovered-session', activeClient: { destroy: jest.fn() } });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), set2fa: jest.fn(async () => undefined) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'ensureDistinctUsersBackupSession').mockResolvedValue(true);
            telegramService.createNewSession.mockResolvedValue('rotated-session-x');

            const result = await service.updateAllClientSessions({ mobile: '15552100004' });
            expect(result.recoveredMissingSessions).toBe(1);
            expect(result.rotated).toBe(1);
        });

        it('deactivates on permanent rotation failure', async () => {
            await service.create(makeBufferClientData({ mobile: '15552100005', status: 'active', warmupPhase: 'ready', session: 'sess' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => { throw new Error('USER_DEACTIVATED'); }),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            const result = await service.updateAllClientSessions({ mobile: '15552100005' });
            expect(result.deactivated).toBe(1);
            // Real deactivateClient ran — assert the doc was persisted as inactive.
            const after = await service.findOne('15552100005');
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(usersService.expireAccount).toHaveBeenCalledWith('15552100005', expect.any(String));
        });

        it('counts failed when new session is not distinct', async () => {
            await service.create(makeBufferClientData({ mobile: '15552100003', status: 'active', warmupPhase: 'ready', session: 'same' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => true),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            telegramService.createNewSession.mockResolvedValue('same');
            const result = await service.updateAllClientSessions({ mobile: '15552100003' });
            expect(result.failed).toBe(1);
        });
    });

    // ─── createBufferClientFromUser + addNewUserstoBufferClientsDynamic ──────

    describe('addNewUserstoBufferClientsDynamic()', () => {
        const needs = (clientId: string, totalNeeded: number) => ([{
            clientId, totalNeeded, windowNeeds: [], totalActive: 0, totalNeededForCount: totalNeeded,
            calculationReason: 'need', priority: 0,
        }]);

        it('returns zero result when no slots are needed', async () => {
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 0));
            expect(res).toEqual({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
        });

        it('enrolls a new buffer client from an eligible user', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200001', tgId: 'tg-new-1' }]);
            // For createBufferClientFromUser internals
            usersService.search.mockResolvedValue([{ mobile: '15552200001', tgId: 'tg-new-1', session: 'src-session' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => false),
                client: {},
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a', 'b'], canSendFalseCount: 0, canSendFalseChats: [] } as any);

            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(1);
            const doc = await service.findOne('15552200001');
            expect(doc!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(doc!.clientId).toBe('test-client-1');
        });

        it('skips enrollment when the user has 2FA enabled (hasPassword)', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200002', tgId: 'tg-new-2' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => true),
                client: {},
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const twoFASpy = jest.spyOn(service as any, 'updateUser2FAStatus').mockResolvedValue(undefined);

            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
            expect(twoFASpy).toHaveBeenCalledWith('tg-new-2', '15552200002');
        });

        it('skips a mobile already enrolled in another pool', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200003', tgId: 'tg-new-3' }]);
            promoteClientService.existsByMobile.mockResolvedValue(true);
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
        });

        it('skips enrollment when source user session is missing', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200030', tgId: 'tg-new-30' }]);
            usersService.search.mockResolvedValue([{ mobile: '15552200030', tgId: 'tg-new-30', session: '  ' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
        });

        it('expires the user when enrollment hits a permanent error', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200031', tgId: 'tg-new-31' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => { throw new Error('PHONE_NUMBER_BANNED'); }), client: {},
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
            expect(usersService.expireAccount).toHaveBeenCalledWith('15552200031', expect.any(String));
        });

        it('respects projected healthy capacity cap', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200004', tgId: 'tg-new-4' }]);
            // client already at cap (20) → cappedNeed 0 → no assignment slots
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 5), new Map([['test-client-1', 20]]));
            expect(res.createdCount).toBe(0);
        });
    });

    describe('addNewUserstoBufferClients() (legacy wrapper)', () => {
        it('really enrolls via the dynamic path for needing clients', async () => {
            // Empty pool → real calculateAvailabilityBasedNeeds reports a deficit → real dynamic
            // enrollment runs and persists a new buffer client.
            usersService.executeQuery.mockResolvedValue([{ mobile: '15551960001', tgId: 'tg-legacy-1' }]);
            usersService.search.mockResolvedValue([{ mobile: '15551960001', tgId: 'tg-legacy-1', session: 'src-session' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a', 'b'], canSendFalseCount: 0, canSendFalseChats: [] } as any);

            await service.addNewUserstoBufferClients([], [], ['test-client-1']);

            const created = await service.findOne('15551960001');
            expect(created).not.toBeNull();
            expect(created!.clientId).toBe('test-client-1');
            expect(created!.warmupPhase).toBe(WarmupPhase.ENROLLED);
        });
    });

    // ─── remove + setPrimaryInUse error paths ────────────────────────────────

    describe('remove() + setPrimaryInUse()', () => {
        it('removes an existing buffer client', async () => {
            await service.create(makeBufferClientData({ mobile: '15552300001' }));
            await service.remove('15552300001', 'cleanup');
            expect(await service.findOne('15552300001', false)).toBeNull();
        });

        it('throws when setting primary in-use for a missing doc', async () => {
            await expect(service.setPrimaryInUse('no-client', '15559990000')).rejects.toThrow();
        });

        it('revokes stale in-use ownership and notifies on setPrimaryInUse', async () => {
            await service.create(makeBufferClientData({ mobile: '15552300010', clientId: 'cidp', inUse: true }));
            await service.create(makeBufferClientData({ mobile: '15552300011', clientId: 'cidp', inUse: false }));
            const result = await service.setPrimaryInUse('cidp', '15552300011');
            expect(result.inUse).toBe(true);
            const old = await service.findOne('15552300010');
            expect(old!.inUse).toBe(false);
            expect(botsService.sendMessageByCategory).toHaveBeenCalledWith(
                'ACCOUNT_NOTIFICATIONS', expect.stringContaining('Buffer Primary Reassigned'), expect.anything(),
            );
        });
    });

    // ─── updateStatus failure + markAsInactive idempotency ───────────────────

    describe('updateStatus() + markAsInactive()', () => {
        it('rethrows and notifies on update failure', async () => {
            await expect(service.updateStatus('15559990001', 'inactive', 'x')).rejects.toThrow();
            expect(botsService.sendMessageByCategory).toHaveBeenCalledWith(
                'ACCOUNT_NOTIFICATIONS', expect.stringContaining('Failed'), expect.anything(),
            );
        });

        it('markAsInactive is a no-op when already inactive', async () => {
            await service.create(makeBufferClientData({ mobile: '15559990002', status: 'inactive' }));
            const before = botsService.sendMessageByCategory.mock.calls.length;
            const res = await service.markAsInactive('15559990002', 'again');
            expect(res!.status).toBe('inactive');
            // No additional status-update notification
            expect(botsService.sendMessageByCategory.mock.calls.length).toBe(before);
        });
    });

    // ─── checkBufferClients full enrollment + summary ────────────────────────

    describe('checkBufferClients() enrollment path', () => {
        it('really enrolls a new buffer client from an eligible user when the pool is empty', async () => {
            // No existing buffer docs for the client → real calculateAvailabilityBasedNeedsForCurrentState
            // reports a deficit (totalNeeded > 0), driving the real dynamic-enrollment path.
            usersService.executeQuery.mockResolvedValue([{ mobile: '15551850001', tgId: 'tg-enroll-1' }]);
            usersService.search.mockResolvedValue([{ mobile: '15551850001', tgId: 'tg-enroll-1', session: 'src-session' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => false),
                client: {},
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a', 'b'], canSendFalseCount: 0, canSendFalseChats: [] } as any);

            await service.checkBufferClients();

            // The real enrollment persisted a brand-new buffer client.
            const created = await service.findOne('15551850001');
            expect(created).not.toBeNull();
            expect(created!.clientId).toBe('test-client-1');
            expect(created!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(created!.channels).toBe(2);
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });
    });

    // ─── sendBufferCheckSummaryNotification (real) ───────────────────────────

    describe('summary notification', () => {
        it('builds and sends the per-client summary message', async () => {
            await service.create(makeBufferClientData({ mobile: '15559990010', status: 'active', clientId: 'test-client-1' }));
            await (service as any).sendBufferCheckSummaryNotification(2, 1, 1, ['a | b'], ['c | d']);
            const lastCall = botsService.sendMessageByCategory.mock.calls.pop();
            expect(lastCall[1]).toContain('Buffer Client Check Summary');
            expect(lastCall[1]).toContain('UpdatedThisRun');
        });

        it('sorts multiple clients by clientId and reports none when nothing ran', async () => {
            // Two distinct clientIds exercise the localeCompare comparator (line 1963),
            // and empty entry arrays exercise the "none" branches. The per-client
            // distribution is keyed off clientService.findAll(), so register both there.
            await service.create(makeBufferClientData({ mobile: '15559990020', status: 'active', clientId: 'zeta-client' }));
            await service.create(makeBufferClientData({ mobile: '15559990021', status: 'active', clientId: 'alpha-client' }));
            // Distribution is keyed off clientService.findAll(); register both clients
            // AFTER creation so the cross-pool guard in create() does not reject them.
            clientService.findAll.mockResolvedValue([
                { clientId: 'zeta-client', mobile: '99990000020' },
                { clientId: 'alpha-client', mobile: '99990000021' },
            ]);
            await (service as any).sendBufferCheckSummaryNotification(0, 0, 0, [], []);
            const lastCall = botsService.sendMessageByCategory.mock.calls.pop();
            expect(lastCall[1]).toContain('UpdatedThisRun: none');
            expect(lastCall[1]).toContain('CreatedThisRunDetails: none');
            // alpha-client sorts before zeta-client in the per-client summary
            expect(lastCall[1].indexOf('alpha-client')).toBeLessThan(lastCall[1].indexOf('zeta-client'));
        });
    });

    // ─── create / update / executeQuery error branches ───────────────────────

    describe('create() + update() + executeQuery() branches', () => {
        it('rejects a non-string session', async () => {
            await expect(service.create(makeBufferClientData({ mobile: '15553000001', session: 123 as any })))
                .rejects.toThrow(/session must be a string/);
        });

        it('rejects an active create with a blank/whitespace session', async () => {
            await expect(service.create(makeBufferClientData({ mobile: '15553000002', session: '   ', status: 'active' })))
                .rejects.toThrow(BadRequestException);
        });

        it('rejects update when payload mobile does not match route mobile', async () => {
            await service.create(makeBufferClientData({ mobile: '15553000003' }));
            await expect(service.update('15553000003', { mobile: '15553009999' } as any))
                .rejects.toThrow(/payload must match route mobile/);
        });

        it('rejects activating a client that has no session', async () => {
            await service.create(makeBufferClientData({ mobile: '15553000004', status: 'inactive', session: 'has-it' }));
            // Clear stored session then try to activate without supplying one
            await BufferClientModel.updateOne({ mobile: '15553000004' }, { $set: { session: '' } });
            await expect(service.update('15553000004', { status: 'active' } as any))
                .rejects.toThrow(/Cannot activate BufferClient without a session/);
        });

        it('updates session + status when a valid session is provided', async () => {
            await service.create(makeBufferClientData({ mobile: '15553000005', status: 'inactive' }));
            const updated = await service.update('15553000005', { status: 'active', session: 'new-valid-session', mobile: '15553000005' } as any);
            expect(updated.status).toBe('active');
            expect(updated.session).toBe('new-valid-session');
        });

        it('throws when updating a missing buffer client', async () => {
            await expect(service.update('15553009998', { message: 'x' } as any)).rejects.toThrow(/not found/);
        });

        it('rejects a null/undefined query in executeQuery', async () => {
            await expect(service.executeQuery(null as any)).rejects.toThrow(BadRequestException);
        });
    });

    // ─── refillJoinQueue: leave-queue + daily-cap + at-cap branches ───────────

    describe('refillJoinQueue() additional branches', () => {
        it('queues a leave set (and arms the leave timeout) when canSendFalseCount is high', async () => {
            await service.create(makeBufferClientData({ mobile: '15553100001', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
                ids: ['x1', 'x2'], canSendFalseCount: 15, canSendFalseChats: ['leave-1', 'leave-2'],
            } as any);

            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
            expect((service as any).leaveChannelMap.has('15553100001')).toBe(true);
            expect((service as any).createTimeout).toHaveBeenCalled();
        });

        it('skips a mobile that already hit its daily join cap', async () => {
            await service.create(makeBufferClientData({ mobile: '15553100002', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'isMobileDailyCapped').mockReturnValue(true);
            const getClientSpy = jest.spyOn(connectionManager, 'getClient');
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
            expect(getClientSpy).not.toHaveBeenCalled();
        });

        it('uses channelsService for accounts at/above 220 channels (line 795)', async () => {
            await service.create(makeBufferClientData({ mobile: '15553100010', channels: 240, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
                ids: new Array(230).fill('c'), canSendFalseCount: 0, canSendFalseChats: [],
            } as any);
            const highSpy = jest.fn().mockResolvedValue([{ channelId: 'h', username: 'h', canSendMsgs: true }]);
            channelsService.getActiveChannels = highSpy;
            const added = await service.refillJoinQueue('test-client-1');
            expect(highSpy).toHaveBeenCalled();
            expect(added).toBe(1);
        });

        it('queues nothing once the per-day join cap is exhausted (line 792)', async () => {
            await service.create(makeBufferClientData({ mobile: '15553100011', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
                ids: ['x1'], canSendFalseCount: 0, canSendFalseChats: [],
            } as any);
            // Daily join count already at the per-day cap → remaining 0 → capped<=0 → [].
            jest.spyOn(service as any, 'getDailyJoinCount').mockReturnValue(25);
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
        });

        it('does not queue joins when no joinable channels remain', async () => {
            await service.create(makeBufferClientData({ mobile: '15553100003', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
                ids: ['x1'], canSendFalseCount: 0, canSendFalseChats: [],
            } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([]); // nothing to join
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
        });
    });

    // ─── markAsInactive failure branch ───────────────────────────────────────

    describe('markAsInactive() failure branch', () => {
        it('returns null when the underlying status update throws', async () => {
            await service.create(makeBufferClientData({ mobile: '15553200001', status: 'active' }));
            jest.spyOn(service, 'updateStatus').mockRejectedValue(new Error('db down'));
            const res = await service.markAsInactive('15553200001', 'reason');
            expect(res).toBeNull();
        });
    });

    // ─── diagnoseEnrollmentDecision: blocked-by-healthy-cap branch ────────────

    describe('diagnoseEnrollmentDecision() cap + pool branches', () => {
        it('marks a client as blocked when the healthy cap is reached despite a deficit', async () => {
            // 20 READY docs make the client healthy-capped (remainingCapacity = 0).
            for (let i = 0; i < 20; i++) {
                await service.create(makeBufferClientData({
                    mobile: `1555330${String(i).padStart(4, '0')}`, status: 'active',
                    clientId: 'test-client-1', warmupPhase: 'ready',
                }));
            }
            // Deficit reported but capacity exhausted → blockedReason path (lines 934-936).
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 4, readyActive: 20, warmingPipeline: 0, totalActive: 20,
                calculationReason: 'deficit', priority: 5, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            // A promote client with a mobile exercises the goodIds spread (line 964).
            promoteClientService.findAll.mockResolvedValue([{ mobile: '15553399999' }]);

            const report = await service.diagnoseEnrollmentDecision();
            const decision = (report.perClientDecisions as any[]).find((d) => d.clientId === 'test-client-1');
            expect(decision.wouldEnroll).toBe(0);
            expect(decision.blockedReason).toContain('healthy cap reached');
        });

        it('caps the enrollment when deficit exceeds remaining capacity', async () => {
            // 18 ready docs → remainingCapacity 2; deficit 5 → capped to 2.
            for (let i = 0; i < 18; i++) {
                await service.create(makeBufferClientData({
                    mobile: `1555340${String(i).padStart(4, '0')}`, status: 'active',
                    clientId: 'test-client-1', warmupPhase: 'ready',
                }));
            }
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 5, readyActive: 18, warmingPipeline: 0, totalActive: 18,
                calculationReason: 'deficit', priority: 5, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            const report = await service.diagnoseEnrollmentDecision();
            const decision = (report.perClientDecisions as any[]).find((d) => d.clientId === 'test-client-1');
            expect(decision.wouldEnroll).toBe(2);
            expect(decision.cappedReason).toContain('capped from 5 to 2');
        });
    });

    // ─── diagnoseWarmupPipeline: cooldown + slot-limit simulation ─────────────

    describe('diagnoseWarmupPipeline() simulation branches', () => {
        it('skips on cooldown and after the mutation slot limit is reached', async () => {
            const now = new Date();
            // Many SETTLING accounts with no privacyUpdatedAt → action 'set_privacy' (a mutation).
            // 30 such mutation entries saturate MAX_UPDATES_PER_CYCLE (20) → slot_limit skip
            // (1104-1105); a subset with a recent lastUpdateAttempt → onCooldown skip (1107-1109).
            for (let i = 0; i < 30; i++) {
                await service.create(makeBufferClientData({
                    mobile: `1555350${String(i).padStart(4, '0')}`, status: 'active',
                    clientId: 'test-client-1', warmupPhase: 'settling', enrolledAt: now,
                }));
            }
            // Put a subset on cooldown by stamping a very recent lastUpdateAttempt.
            // Give them the higher-priority 'set_2fa' action (privacy done 3d ago, 2FA not)
            // so they sort to the front and are evaluated before the slot limit fills up.
            const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
            await BufferClientModel.updateMany(
                { mobile: { $in: ['15553500000', '15553500001', '15553500002'] } },
                { $set: { lastUpdateAttempt: now, privacyUpdatedAt: threeDaysAgo } },
            );
            // One doc with channels=0 exercises the `bc.channels || 0` fallback (line 1086).
            await BufferClientModel.updateOne({ mobile: '15553500003' }, { $set: { channels: 0 } });
            const report = await service.diagnoseWarmupPipeline();
            const sim = report.simulation as any;
            expect(report.totalActive).toBe(30);
            expect(sim.totalProcessed).toBeGreaterThan(0);
            expect(sim.totalSkippedAfterSlotLimit).toBeGreaterThan(0);
            expect(sim.totalSkippedCooldown).toBeGreaterThan(0);
        });
    });

    // ─── checkBufferClients: session_rotated health-check failure ─────────────

    describe('checkBufferClients() health-check + capacity branches', () => {
        it('skips a session_rotated account whose health check fails', async () => {
            const past = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
            await service.create(makeBufferClientData({
                mobile: '15553600001', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'session_rotated', inUse: false, lastUsed: null,
                enrolledAt: past, privacyUpdatedAt: past, twoFASetAt: past, otherAuthsRemovedAt: past,
                profilePicsDeletedAt: past, nameBioUpdatedAt: past, usernameUpdatedAt: past,
                profilePicsUpdatedAt: past, channels: 250, lastChecked: past,
            }));
            const healthSpy = jest.spyOn(service as any, 'performHealthCheck')
                .mockResolvedValue({ passed: false, performed: true });
            await service.checkBufferClients();
            expect(healthSpy).toHaveBeenCalledWith('15553600001', expect.any(Number), expect.any(Number));
            // Health check failed → processClient skipped → phase unchanged.
            const after = await service.findOne('15553600001');
            expect(after!.warmupPhase).toBe(WarmupPhase.SESSION_ROTATED);
        });

        it('skips dynamic enrollment for a client already at the healthy cap', async () => {
            // 20 ready docs → remainingCapacity 0 in the enrollment loop (lines 1321-1327).
            for (let i = 0; i < 20; i++) {
                await service.create(makeBufferClientData({
                    mobile: `1555370${String(i).padStart(4, '0')}`, status: 'active',
                    clientId: 'test-client-1', warmupPhase: 'session_rotated', inUse: false, lastUsed: null,
                }));
            }
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 3, readyActive: 20, warmingPipeline: 0, totalActive: 20,
                calculationReason: 'deficit', priority: 5, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            const enrollSpy = jest.spyOn(service, 'addNewUserstoBufferClientsDynamic');
            await service.checkBufferClients();
            // capacity exhausted → no dynamic enrollment attempted.
            expect(enrollSpy).not.toHaveBeenCalled();
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });

        it('caps the dynamic enrollment need to the remaining healthy capacity (line 1336)', async () => {
            // 18 healthy ready docs → remaining capacity 2; calc deficit 5 → capped to 2 (T-branch).
            for (let i = 0; i < 18; i++) {
                await service.create(makeBufferClientData({
                    mobile: `1555380${String(i).padStart(4, '0')}`, status: 'active',
                    clientId: 'test-client-1', warmupPhase: 'session_rotated', inUse: false, lastUsed: null,
                }));
            }
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 5, readyActive: 18, warmingPipeline: 0, totalActive: 18,
                calculationReason: 'deficit', priority: 5, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            const enrollSpy = jest.spyOn(service, 'addNewUserstoBufferClientsDynamic')
                .mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
            await service.checkBufferClients();
            expect(enrollSpy).toHaveBeenCalled();
            const needArg = enrollSpy.mock.calls[0][2] as any[];
            const need = needArg.find((n) => n.clientId === 'test-client-1');
            expect(need.totalNeeded).toBe(2);
            expect(need.calculationReason).toContain('capped to remaining healthy capacity');
        });

        it('notifies when dynamic enrollment throws', async () => {
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 2, readyActive: 0, warmingPipeline: 0, totalActive: 0,
                calculationReason: 'deficit', priority: 5, replenishmentWindowNeeds: [], windowNeeds: [],
            });
            jest.spyOn(service, 'addNewUserstoBufferClientsDynamic').mockRejectedValue(new Error('enroll boom'));
            const { fetchWithTimeout } = require('../../utils/fetchWithTimeout');
            await service.checkBufferClients();
            const failCall = (fetchWithTimeout as jest.Mock).mock.calls
                .find((c: any[]) => typeof c[0] === 'string' && c[0].includes('Buffer%20Enrollment%20Failed'));
            expect(failCall).toBeDefined();
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });
    });

    describe('checkBufferClients() null-phase fallback', () => {
        it('treats a doc with no warmupPhase as ENROLLED (lines 1235 & 1289)', async () => {
            await service.create(makeBufferClientData({
                mobile: '15555200001', status: 'active', clientId: 'test-client-1',
                enrolledAt: new Date(), inUse: false, lastUsed: null,
            }));
            // Schema default leaves warmupPhase null.
            await BufferClientModel.collection.updateOne({ mobile: '15555200001' }, { $set: { warmupPhase: null } });
            await service.checkBufferClients();
            const after = await service.findOne('15555200001');
            // 'wait' fast-path stamps lastUpdateAttempt → the loops visited it via the null fallback.
            expect(after!.lastUpdateAttempt).toBeInstanceOf(Date);
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });
    });

    describe('checkBufferClients() real settling processing', () => {
        it('processes a SETTLING account (set_privacy) via the real pipeline', async () => {
            // enrolledAt old enough that ENROLLED→SETTLING threshold passes; no privacyUpdatedAt
            // → action set_privacy. An OLD lastUpdateAttempt (3h, past the 2h cooldown) exercises
            // the lastUpdateAttempt>0 priority branch (line 1245) without triggering cooldown.
            const enrolledLongAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
            const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
            await service.create(makeBufferClientData({
                mobile: '15555000001', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'settling', enrolledAt: enrolledLongAgo, lastUpdateAttempt: threeHoursAgo,
                inUse: false, lastUsed: null,
            }));
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                updatePrivacyforDeletedAccount: jest.fn(async () => undefined),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            // A doc with NO warmupPhase (schema default null) exercises the
            // `warmupPhase || ENROLLED` fallbacks (lines 1235 & 1289). Recent enrolledAt
            // → computed action 'wait' → DB-only fast path, no TG needed.
            await service.create(makeBufferClientData({
                mobile: '15555000002', status: 'active', clientId: 'test-client-1',
                enrolledAt: new Date(), inUse: false, lastUsed: null,
            }));

            await service.checkBufferClients();

            const after = await service.findOne('15555000001');
            expect(after!.privacyUpdatedAt).toBeInstanceOf(Date);
            // The null-phase doc was visited by the processing loop (lastUpdateAttempt stamped by 'wait').
            const nullPhaseDoc = await service.findOne('15555000002');
            expect(nullPhaseDoc!.lastUpdateAttempt).toBeInstanceOf(Date);
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });
    });

    // ─── updateInfo: empty pool ──────────────────────────────────────────────

    describe('updateInfo() additional', () => {
        it('runs health checks across multiple stale clients with inter-client sleep', async () => {
            await service.create(makeBufferClientData({
                mobile: '15553800001', status: 'active', clientId: 'test-client-1', lastChecked: new Date('2020-01-01'),
            }));
            await service.create(makeBufferClientData({
                mobile: '15553800002', status: 'active', clientId: 'test-client-1', lastChecked: new Date('2020-01-02'),
            }));
            const healthSpy = jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue({ passed: true, performed: true });
            await service.updateInfo();
            expect(healthSpy).toHaveBeenCalledTimes(2);
        });

        it('skips the primary client mobile during the health sweep', async () => {
            await service.create(makeBufferClientData({
                mobile: '15553800003', status: 'active', clientId: 'test-client-1', lastChecked: new Date('2020-01-01'),
            }));
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15553800003' }]);
            const healthSpy = jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue({ passed: true, performed: true });
            await service.updateInfo();
            expect(healthSpy).not.toHaveBeenCalled();
        });
    });

    // ─── updateAllClientSessions: skip-primary + recovery-failure + backup ────

    describe('updateAllClientSessions() additional branches', () => {
        it('skips a candidate that is the primary client mobile', async () => {
            await service.create(makeBufferClientData({
                mobile: '15553900001', status: 'active', warmupPhase: 'ready', session: 'sess',
            }));
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15553900001' }]);
            const result = await service.updateAllClientSessions({ mobile: '15553900001' });
            expect(result.skippedPrimary).toBe(1);
            expect(result.rotated).toBe(0);
        });

        it('counts a failure when no verified backup session can be recovered', async () => {
            await service.create(makeBufferClientData({
                mobile: '15553900002', status: 'active', warmupPhase: 'session_rotated', session: 'placeholder',
            }));
            // Force the session-less path then make recovery yield nothing.
            await BufferClientModel.updateOne({ mobile: '15553900002' }, { $set: { session: '' } });
            jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockResolvedValue({ activeSession: null, activeClient: null });
            const result = await service.updateAllClientSessions({ mobile: '15553900002' });
            expect(result.recoveredMissingSessions).toBe(0);
            expect(result.failed).toBe(1);
        });

        it('counts a failure when the new session lacks a distinct backup', async () => {
            await service.create(makeBufferClientData({
                mobile: '15553900003', status: 'active', warmupPhase: 'ready', session: 'old',
            }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => true),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'ensureDistinctUsersBackupSession').mockResolvedValue(false);
            telegramService.createNewSession.mockResolvedValue('brand-new-distinct');
            const result = await service.updateAllClientSessions({ mobile: '15553900003' });
            expect(result.failed).toBe(1);
            expect(result.rotated).toBe(0);
        });

        it('counts a failure (outer catch) when session recovery throws, with an inter-candidate delay', async () => {
            // Two session-less candidates so the outer catch path also runs its
            // i < length-1 inter-candidate sleep (line 1838).
            await service.create(makeBufferClientData({
                mobile: '15553900005', status: 'active', warmupPhase: 'session_rotated', session: 'p1',
            }));
            await service.create(makeBufferClientData({
                mobile: '15553900006', status: 'active', warmupPhase: 'session_rotated', session: 'p2',
            }));
            await BufferClientModel.updateMany(
                { mobile: { $in: ['15553900005', '15553900006'] } }, { $set: { session: '' } },
            );
            // resolveActiveSessionForRotation throws → escapes to the outer catch (line 1835-1838).
            jest.spyOn(service as any, 'resolveActiveSessionForRotation').mockRejectedValue(new Error('recovery exploded'));
            const result = await service.updateAllClientSessions({});
            expect(result.failed).toBe(2);
            expect(result.rotated).toBe(0);
        });

        it('sets 2FA first when the recovered account has no password', async () => {
            await service.create(makeBufferClientData({
                mobile: '15553900004', status: 'active', warmupPhase: 'ready', session: 'old',
            }));
            const set2fa = jest.fn(async () => undefined);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => false), set2fa,
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'ensureDistinctUsersBackupSession').mockResolvedValue(true);
            telegramService.createNewSession.mockResolvedValue('distinct-new');
            const result = await service.updateAllClientSessions({ mobile: '15553900004' });
            expect(set2fa).toHaveBeenCalled();
            expect(result.rotated).toBe(1);
        });
    });

    // ─── addNewUserstoBufferClientsDynamic: dedup + create-throw branches ─────

    describe('addNewUserstoBufferClientsDynamic() additional branches', () => {
        const needs = (clientId: string, totalNeeded: number) => ([{
            clientId, totalNeeded, windowNeeds: [], totalActive: 0, totalNeededForCount: totalNeeded,
            calculationReason: 'need', priority: 0,
        }]);

        it('skips a duplicate mobile already attempted in this run', async () => {
            // Same mobile returned twice → second occurrence hits the dedup skip (1693-1695).
            usersService.executeQuery.mockResolvedValue([
                { mobile: '15554000001', tgId: 'tg-dup' },
                { mobile: '15554000001', tgId: 'tg-dup' },
            ]);
            usersService.search.mockResolvedValue([{ mobile: '15554000001', tgId: 'tg-dup', session: 'src' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);

            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 2), new Map());
            expect(res.createdCount).toBe(1);
        });

        it('continues past a transient create error and counts the attempt', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15554000002', tgId: 'tg-err' }]);
            jest.spyOn(service as any, 'createBufferClientFromUser').mockRejectedValue(new Error('transient'));
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
            expect(res.attemptedCount).toBe(1);
        });

        it('skips a candidate document missing a mobile/tgId (line 1690)', async () => {
            // First doc is malformed (no mobile) → skipped; second is valid → enrolled.
            usersService.executeQuery.mockResolvedValue([
                { mobile: '', tgId: '' },
                { mobile: '15554000010', tgId: 'tg-valid' },
            ]);
            usersService.search.mockResolvedValue([{ mobile: '15554000010', tgId: 'tg-valid', session: 'src' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 2), new Map());
            expect(res.createdCount).toBe(1);
        });

        it('stops when the assignment queue is exhausted before the needed count (line 1700)', async () => {
            // Two candidate users, but only ONE assignment slot (cap leaves 1) → queue exhausts.
            usersService.executeQuery.mockResolvedValue([
                { mobile: '15554000020', tgId: 'tg-a' },
                { mobile: '15554000021', tgId: 'tg-b' },
            ]);
            usersService.search.mockImplementation(async ({ mobile }: any) => [{ mobile, tgId: 'tg', session: 'src' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            // needs totalNeeded 2 but projected healthy cap leaves only 1 slot (19/20 used).
            const res = await service.addNewUserstoBufferClientsDynamic([], [], needs('test-client-1', 2), new Map([['test-client-1', 19]]));
            expect(res.createdCount).toBe(1);
        });
    });

    // ─── updateNameAndBio persona-dedup branches ─────────────────────────────

    describe('updateNameAndBio() persona dedup branches', () => {
        const personaClient = (over: any = {}) => ({
            clientId: 'test-client-1', name: 'n',
            firstNames: ['Aria'], bufferLastNames: ['Stone'], bios: ['hi there'], profilePics: [],
            dbcoll: 'db', ...over,
        });

        const stubTg = (firstName = 'Old') => {
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: '' }], fullUser: { about: '' } })
                .mockResolvedValue(undefined);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName, username: 'u' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        };

        it('includes the active client assignment in dedup (line 271)', async () => {
            await service.create(makeBufferClientData({ mobile: '15554100001' }));
            const doc = await service.findOne('15554100001');
            stubTg();
            // The active client uses a different mobile + a distinct persona — it must be
            // folded into the dedup set (push at line 271).
            // null lastName/bio/pics exercise the `|| ''` / `|| []` fallbacks in usedKeys (276-278).
            clientService.getActiveClientAssignment.mockResolvedValue({
                mobile: '15554199999', assignedFirstName: 'Zed', assignedLastName: null, assignedBio: null, assignedProfilePics: null,
            });
            const count = await service.updateNameAndBio(doc as any, personaClient() as any, 0);
            expect(count).toBeGreaterThanOrEqual(1);
            const after = await service.findOne('15554100001');
            expect(after!.assignedFirstName).toBe('Aria');
        });

        it('falls back to the first candidate when no unique persona is available (line 285)', async () => {
            await service.create(makeBufferClientData({ mobile: '15554100002' }));
            const doc = await service.findOne('15554100002');
            // Another active buffer client already holds the ONLY persona the pool can build.
            await service.create(makeBufferClientData({
                mobile: '15554100003', status: 'active', clientId: 'test-client-1',
                assignedFirstName: 'Aria', assignedLastName: 'Stone', assignedBio: 'hi there',
            }));
            stubTg();
            const count = await service.updateNameAndBio(
                doc as any,
                personaClient({ firstNames: ['Aria'], bufferLastNames: ['Stone'], bios: ['hi there'] }) as any,
                0,
            );
            // Fallback still assigns the (only) persona and satisfies the step.
            expect(count).toBeGreaterThanOrEqual(1);
            const after = await service.findOne('15554100002');
            expect(after!.assignedFirstName).toBe('Aria');
        });

        it('applies a bio-only persona (no firstName/lastName pool) and updates the bio', async () => {
            await service.create(makeBufferClientData({ mobile: '15554100010' }));
            const doc = await service.findOne('15554100010');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: '' }], fullUser: { about: 'stale bio' } })
                .mockResolvedValue(undefined);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Old', username: 'u' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            // Bios only → assignedFirstName/'' and assignedLastName null; only the bio differs.
            // bufferLastNames/profilePics intentionally undefined to exercise the `|| []` fallbacks.
            const count = await service.updateNameAndBio(
                doc as any,
                { clientId: 'test-client-1', name: 'n', firstNames: [], bios: ['the new bio'] } as any,
                0,
            );
            expect(count).toBeGreaterThanOrEqual(1);
            const after = await service.findOne('15554100010');
            expect(after!.assignedBio).toBe('the new bio');
        });

        it('updates firstName with a null lastName when only firstNames are pooled', async () => {
            await service.create(makeBufferClientData({ mobile: '15554100011' }));
            const doc = await service.findOne('15554100011');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: '' }], fullUser: { about: '' } })
                .mockResolvedValue(undefined);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                // firstName undefined → exercises the `me.firstName || ''` fallback (line 339).
                getMe: jest.fn(async () => ({ firstName: undefined, username: 'u' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            // bufferLastNames/bios/profilePics omitted (undefined) → `|| []` fallbacks.
            const count = await service.updateNameAndBio(
                doc as any,
                { clientId: 'test-client-1', name: 'n', firstNames: ['Cleo'] } as any,
                0,
            );
            expect(count).toBeGreaterThanOrEqual(1);
            const after = await service.findOne('15554100011');
            expect(after!.assignedFirstName).toBe('Cleo');
            expect(after!.assignedLastName ?? null).toBeNull();
        });

        it('warns when the atomic persona assignment guard is not met (line 320)', async () => {
            await service.create(makeBufferClientData({ mobile: '15554100004' }));
            // Persist an assignment on the DB row so the findOneAndUpdate guard
            // (assignedFirstName: null …) never matches → returns null.
            await BufferClientModel.updateOne(
                { mobile: '15554100004' },
                { $set: { assignedFirstName: 'Pre', assignedLastName: 'Existing', assignedBio: 'b' } },
            );
            // Pass an in-memory doc WITHOUT assigned fields so hasValidAssignment is false
            // and the code takes the atomic-assignment branch.
            const inMemoryDoc = { mobile: '15554100004', clientId: 'test-client-1' };
            stubTg();
            const count = await service.updateNameAndBio(inMemoryDoc as any, personaClient() as any, 0);
            // Assignment failed (guard not met) → no persona applied → updateCount stays 0.
            expect(count).toBe(0);
            const after = await service.findOne('15554100004');
            // The pre-existing DB assignment is untouched and the step was NOT stamped.
            expect(after!.assignedFirstName).toBe('Pre');
            expect(after!.nameBioUpdatedAt ?? null).toBeNull();
        });
    });

    // ─── executeQuery internal failure (line 621-623) ────────────────────────

    describe('executeQuery() internal error', () => {
        it('wraps an unexpected driver error in InternalServerErrorException', async () => {
            jest.spyOn(BufferClientModel, 'find').mockImplementationOnce(() => {
                throw new Error('driver exploded');
            });
            await expect(service.executeQuery({ status: 'active' })).rejects.toThrow(/Query execution failed/);
        });

        it('re-throws a BadRequestException raised mid-query unchanged (line 621)', async () => {
            jest.spyOn(BufferClientModel, 'find').mockImplementationOnce(() => {
                throw new BadRequestException('bad query shape');
            });
            await expect(service.executeQuery({ status: 'active' })).rejects.toThrow(/bad query shape/);
        });

        it('handles a non-Error throwable (line 622 false branch)', async () => {
            jest.spyOn(BufferClientModel, 'find').mockImplementationOnce(() => {
                throw 'plain string failure';  
            });
            await expect(service.executeQuery({ status: 'active' })).rejects.toThrow(/Unknown error occurred/);
        });
    });

    describe('refillJoinQueue() processing guard', () => {
        it('returns 0 while a leave-channel sweep is in progress (line 713)', async () => {
            (service as any).isLeaveChannelProcessing = true;
            expect(await service.refillJoinQueue('test-client-1')).toBe(0);
            (service as any).isLeaveChannelProcessing = false;
        });
    });

    describe('createBufferClientFromUser() already-enrolled guard', () => {
        it('skips a candidate already present in the buffer pool (line 792)', async () => {
            await service.create(makeBufferClientData({ mobile: '15555100001', status: 'active', clientId: 'test-client-1' }));
            usersService.executeQuery.mockResolvedValue([{ mobile: '15555100001', tgId: 'tg-already' }]);
            const res = await service.addNewUserstoBufferClientsDynamic([], [], [{
                clientId: 'test-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0,
                totalNeededForCount: 1, calculationReason: 'need', priority: 0,
            }], new Map());
            expect(res.createdCount).toBe(0);
        });
    });

    // ─── updateStatus notification .catch callbacks (640, 649) ────────────────

    describe('updateStatus() notification failures', () => {
        it('logs (does not throw) when the success notification rejects with a non-Error', async () => {
            await service.create(makeBufferClientData({ mobile: '15554200001', status: 'inactive' }));
            // Non-Error rejection exercises the String(error) fallback in the .catch (line 640).
            botsService.sendMessageByCategory.mockRejectedValueOnce('notify string failure');
            const res = await service.updateStatus('15554200001', 'active', 'ok');
            expect(res.status).toBe('active');
        });

        it('logs (does not swallow) when the failure notification also rejects with a non-Error', async () => {
            // No doc → update throws → failure-notify path; make that notify reject with a
            // non-Error to exercise the String(error) fallback (line 649).
            botsService.sendMessageByCategory.mockRejectedValue('notify string failure');
            await expect(service.updateStatus('15554209999', 'inactive', 'x')).rejects.toThrow();
        });
    });

    // ─── checkBufferClients: rich internal branches (1198, 1226-1241) ─────────

    describe('checkBufferClients() rich internal branches', () => {
        it('skips primary-mobile + backfills a session_rotated+used doc, with promote mobiles in goodIds', async () => {
            const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            // (a) buffer doc whose mobile equals the client's primary mobile → skip (1225-1227)
            await service.create(makeBufferClientData({
                mobile: '15554300001', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled',
            }));
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15554300001' }]);
            // (b) session_rotated + lastUsed → backfillTimestamps + continue (1239-1241)
            await service.create(makeBufferClientData({
                mobile: '15554300002', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'session_rotated', inUse: false, lastUsed: past,
            }));
            // (c) a stuck + failed-cap doc exercises isHealthyBufferClientForCap false branches (158-171)
            const longAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
            await service.create(makeBufferClientData({
                mobile: '15554300003', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'settling', enrolledAt: longAgo, failedUpdateAttempts: 5,
                lastUpdateFailure: longAgo,
            }));
            // (d) stuck (60d) but UNDER the failed-attempt cap → isHealthyBufferClientForCap
            // returns false via the stuck-days branch (line 167), not the failed-cap branch.
            await service.create(makeBufferClientData({
                mobile: '15554300004', status: 'active', clientId: 'test-client-1',
                warmupPhase: 'settling', enrolledAt: longAgo, failedUpdateAttempts: 1,
            }));
            // promote clients with mobiles flow into goodIds (line 1198)
            promoteClientService.findAll.mockResolvedValue([{ mobile: '15554399999' }]);
            const backfillSpy = jest.spyOn(service as any, 'backfillTimestamps');

            await service.checkBufferClients();

            expect(backfillSpy).toHaveBeenCalledWith('15554300002', expect.anything(), expect.any(Number));
            // Primary-mobile doc untouched.
            const primary = await service.findOne('15554300001');
            expect(primary!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });
    });

    // ─── simple getters + create notification fallbacks ──────────────────────

    describe('simple getters + create fallbacks', () => {
        it('findAll returns everything when no status filter is passed', async () => {
            await service.create(makeBufferClientData({ mobile: '15554500002', status: 'active' }));
            await service.create(makeBufferClientData({ mobile: '15554500003', status: 'inactive' }));
            expect(await service.findAll()).toHaveLength(2);
            expect(await service.findAll('active')).toHaveLength(1);
        });

        it('getLeastRecentlyUsed / getNextAvailable / getUnused honor defaults', async () => {
            await service.create(makeBufferClientData({
                mobile: '15554500004', status: 'active', clientId: 'lru-client', lastUsed: null,
                warmupPhase: 'session_rotated', availableDate: '2026-04-01',
            }));
            const lru = await service.getLeastRecentlyUsedBufferClients('lru-client');
            expect(lru.length).toBeGreaterThanOrEqual(1);
            const next = await service.getNextAvailableBufferClient('lru-client');
            expect(next).not.toBeNull();
            const unused = await service.getUnusedBufferClients();
            expect(Array.isArray(unused)).toBe(true);
        });

        it('getNextAvailableBufferClient returns null when none exist', async () => {
            expect(await service.getNextAvailableBufferClient('no-such-client')).toBeNull();
        });

        it('addNewUserstoBufferClients is a no-op for an empty needing-clients list', async () => {
            await expect(service.addNewUserstoBufferClients([], [])).resolves.toBeUndefined();
        });
    });

    // ─── createBufferClientFromUser cross-pool (active client) collision ──────

    describe('createBufferClientFromUser() active-client collision', () => {
        it('skips a candidate whose mobile is an active client (line 1507)', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15554600001', tgId: 'tg-coll' }]);
            // The candidate mobile is registered as an active client → enrolledIn = 'clients'.
            clientService.findAll.mockResolvedValue([
                { clientId: 'test-client-1', mobile: '15554600001' },
            ]);
            const res = await service.addNewUserstoBufferClientsDynamic([], [], [{
                clientId: 'test-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0,
                totalNeededForCount: 1, calculationReason: 'need', priority: 0,
            }], new Map());
            expect(res.createdCount).toBe(0);
        });
    });

    // ─── checkBufferClients: ghost-client / in-use / cooldown loop guards ─────

    describe('checkBufferClients() loop guards', () => {
        it('skips ghost-client, in-use and on-cooldown docs in the maintenance loop', async () => {
            // Ghost: clientId not in clientService.findAll() → skip (1224).
            await service.create(makeBufferClientData({ mobile: '15554700001', status: 'active', clientId: 'ghost-x', warmupPhase: 'enrolled' }));
            // In-use → skip (1229).
            await service.create(makeBufferClientData({ mobile: '15554700002', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled', inUse: true }));
            // On cooldown (recent lastUpdateAttempt) → skip (1232).
            await service.create(makeBufferClientData({ mobile: '15554700003', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled', lastUpdateAttempt: new Date() }));
            const processSpy = jest.spyOn(service as any, 'processClient');
            await service.checkBufferClients();
            // None of the three guarded docs reach processClient.
            const processed = processSpy.mock.calls.map((c: any[]) => c[0].mobile);
            expect(processed).not.toContain('15554700001');
            expect(processed).not.toContain('15554700002');
            expect(processed).not.toContain('15554700003');
            expect((service as any).checkingBufferClientsSince).toBe(0);
        });
    });

    // ─── updateAllClientSessions multi-candidate sleep (line 1832) ────────────

    describe('updateAllClientSessions() multi-candidate', () => {
        it('processes multiple candidates with an inter-candidate delay', async () => {
            await service.create(makeBufferClientData({ mobile: '15554400001', status: 'active', warmupPhase: 'ready', session: 'a' }));
            await service.create(makeBufferClientData({ mobile: '15554400002', status: 'active', warmupPhase: 'ready', session: 'b' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => true) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'ensureDistinctUsersBackupSession').mockResolvedValue(true);
            telegramService.createNewSession.mockImplementation(async (m: string) => `distinct-${m}`);
            const result = await service.updateAllClientSessions({});
            expect(result.rotated).toBe(2);
        });
    });
});
