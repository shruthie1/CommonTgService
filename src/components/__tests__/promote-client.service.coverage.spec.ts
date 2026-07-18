/**
 * Promote Client Service — subclass-specific coverage spec.
 *
 * Real MongoDB (memory server) + real PromoteClientService logic.
 * Only true externals are mocked: telegram/GramJS sleep, connectionManager,
 * organic-activity, channelInfo, fetchWithTimeout, notifbot, isPermanentError.
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Connection, Model } from 'mongoose';
import { PromoteClient, PromoteClientSchema } from '../promote-clients/schemas/promote-client.schema';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import { WarmupPhase } from '../shared/base-client.service';
import {
    MongoTestContext, startMongo, stopMongo,
    makePromoteClientData, resetCounter,
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

describe('PromoteClientService coverage', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let PromoteClientModel: Model<PromoteClient>;
    let service: PromoteClientService;
    let botsService: ReturnType<typeof mockBotsService>;
    let telegramService: any;
    let usersService: any;
    let clientService: any;
    let bufferClientService: any;
    let activeChannelsService: ReturnType<typeof mockActiveChannelsService>;
    let channelsService: any;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('promote-coverage-test');
        connection = ctx.connection;
        PromoteClientModel = connection.model<PromoteClient>('PromoteClientCoverage', PromoteClientSchema);
        await PromoteClientModel.init();
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
        bufferClientService = {
            findAll: jest.fn(async () => []),
            existsByMobile: jest.fn(async () => false),
            model: connection.model<any>('BufferForPromoteCoverage', PromoteClientSchema),
        };
        activeChannelsService = mockActiveChannelsService();
        channelsService = mockChannelsService();
        channelsService.getActiveChannels = jest.fn().mockResolvedValue([]);

        service = new PromoteClientService(
            PromoteClientModel as any,
            telegramService as any,
            usersService as any,
            activeChannelsService as any,
            clientService as any,
            channelsService as any,
            bufferClientService as any,
            mockSessionService() as any,
            botsService as any,
        );
    });

    afterEach(async () => {
        await PromoteClientModel.deleteMany({});
        await bufferClientService.model.deleteMany({});
        jest.restoreAllMocks();
    });

    // ─── search / executeQuery ───────────────────────────────────────────────

    it('search canonicalizes mobile and regex-matches clientId', async () => {
        await service.create(makePromoteClientData({ mobile: '917989706213', clientId: 'cid-find' }));
        await service.create(makePromoteClientData({ mobile: '917989706214', clientId: 'other' }));
        expect(await service.search({ clientId: 'cid-find' } as any)).toHaveLength(1);
        expect(await service.search({ mobile: '917989706213' } as any)).toHaveLength(1);
    });

    it('executeQuery supports sort/limit/skip', async () => {
        await service.create(makePromoteClientData({ mobile: '15551110001', channels: 10 }));
        await service.create(makePromoteClientData({ mobile: '15551110002', channels: 20 }));
        const res = await service.executeQuery({}, { channels: -1 }, 1, 0);
        expect(res).toHaveLength(1);
        expect(res[0].channels).toBe(20);
    });

    it('create rejects cross-pool mobile already in buffer pool', async () => {
        bufferClientService.existsByMobile.mockResolvedValue(true);
        await expect(service.create(makePromoteClientData({ mobile: '15551130001' })))
            .rejects.toThrow(/already enrolled in bufferClients/);
    });

    // ─── updateUsername (clears username) ────────────────────────────────────

    describe('updateUsername()', () => {
        it('clears username via Telegram and stamps timestamp', async () => {
            await service.create(makePromoteClientData({ mobile: '15551200001' }));
            const doc = await service.findOne('15551200001');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            const count = await service.updateUsername(doc as any, { clientId: 'c1' } as any, 0);
            expect(count).toBe(1);
            expect(telegramService.updateUsername).toHaveBeenCalledWith('15551200001', '');
            const after = await service.findOne('15551200001');
            expect(after!.usernameUpdatedAt).toBeInstanceOf(Date);
        });

        it('deactivates on permanent error', async () => {
            await service.create(makePromoteClientData({ mobile: '15551200002' }));
            const doc = await service.findOne('15551200002');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            telegramService.updateUsername.mockRejectedValue(new Error('SESSION_REVOKED'));
            isPermanentError.mockReturnValue(true);

            const count = await service.updateUsername(doc as any, { clientId: 'c1' } as any, 1);
            expect(count).toBe(0);
            // Real deactivateClient ran — assert persisted retirement state, not a spy.
            const after = await service.findOne('15551200002');
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(after!.message).toContain('SESSION_REVOKED');
            expect(after!.failedUpdateAttempts).toBe(2);
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551200002', expect.any(String));
        });
    });

    // ─── updateNameAndBio (promote) ──────────────────────────────────────────

    describe('updateNameAndBio()', () => {
        it('marks step done when no persona pool', async () => {
            await service.create(makePromoteClientData({ mobile: '15551300001' }));
            const doc = await service.findOne('15551300001');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ getMe: jest.fn(async () => ({ firstName: 'Old' })) } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const count = await service.updateNameAndBio(doc as any, { clientId: 'c1' } as any, 0);
            expect(count).toBe(1);
        });

        it('assigns persona and updates name/bio (uses promoteLastNames)', async () => {
            await service.create(makePromoteClientData({ mobile: '15551300002' }));
            const doc = await service.findOne('15551300002');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: '' }], fullUser: { about: '' } })
                .mockResolvedValue(undefined);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Old', username: 'u' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const client = { clientId: 'c1', firstNames: ['Cleo'], promoteLastNames: ['Vale'], bios: ['promo bio'], profilePics: [], dbcoll: 'db' };
            const count = await service.updateNameAndBio(doc as any, client as any, 0);
            expect(count).toBeGreaterThanOrEqual(1);
            const after = await service.findOne('15551300002');
            expect(after!.assignedFirstName).toBe('Cleo');
        });
    });

    // ─── setAsPromoteClient ──────────────────────────────────────────────────

    describe('setAsPromoteClient()', () => {
        it('enrolls a user, auto-assigning clientId with fewest promote clients', async () => {
            usersService.search.mockResolvedValue([{ tgId: 'tg-enroll', session: 'user-session', mobile: '15551400001' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

            const result = await service.setAsPromoteClient('15551400001');
            expect(result).toContain('successfully');
            const doc = await service.findOne('15551400001');
            expect(doc!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(doc!.clientId).toBe('test-client-1');
        });

        it('throws when user not found', async () => {
            usersService.search.mockResolvedValue([]);
            await expect(service.setAsPromoteClient('15551400002', 'test-client-1')).rejects.toThrow('User not found');
        });

        it('throws Conflict when already a promote client', async () => {
            await service.create(makePromoteClientData({ mobile: '15551400003' }));
            usersService.search.mockResolvedValue([{ tgId: 't', session: 's', mobile: '15551400003' }]);
            await expect(service.setAsPromoteClient('15551400003', 'test-client-1')).rejects.toThrow(ConflictException);
        });

        it('throws when mobile is an active client', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'c', mobile: '15551400004' }]);
            usersService.search.mockResolvedValue([{ tgId: 't', session: 's', mobile: '15551400004' }]);
            await expect(service.setAsPromoteClient('15551400004', 'test-client-1')).rejects.toThrow('Number is an Active Client');
        });

        it('throws on missing session', async () => {
            usersService.search.mockResolvedValue([{ tgId: 't', session: '', mobile: '15551400005' }]);
            await expect(service.setAsPromoteClient('15551400005', 'test-client-1')).rejects.toThrow('User session missing');
        });

        it('expires account on permanent enrollment error', async () => {
            usersService.search.mockResolvedValue([{ tgId: 'tg', session: 's', mobile: '15551400006' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            telegramService.getChannelInfo.mockRejectedValue(new Error('PHONE_NUMBER_BANNED'));
            isPermanentError.mockReturnValue(true);
            await expect(service.setAsPromoteClient('15551400006', 'test-client-1')).rejects.toThrow();
            expect(usersService.expireAccount).toHaveBeenCalled();
        });
    });

    // ─── refillJoinQueue ─────────────────────────────────────────────────────

    describe('refillJoinQueue()', () => {
        it('returns 0 when active client setup is in progress', async () => {
            telegramService.hasActiveClientSetup.mockReturnValue(true);
            expect(await service.refillJoinQueue()).toBe(0);
        });

        it('queues joins for an eligible promote client', async () => {
            await service.create(makePromoteClientData({ mobile: '15551500001', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['x'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(1);
        });

        it('excludes READY and SESSION_ROTATED accounts while retaining legacy phase-less accounts', async () => {
            await service.create(makePromoteClientData({ mobile: '15551500004', channels: 10, status: 'active', clientId: 'test-client-1', warmupPhase: WarmupPhase.READY }));
            await service.create(makePromoteClientData({ mobile: '15551500005', channels: 10, status: 'active', clientId: 'test-client-1', warmupPhase: WarmupPhase.SESSION_ROTATED }));
            await service.create(makePromoteClientData({ mobile: '15551500006', channels: 10, status: 'active', clientId: 'test-client-1' }));
            await PromoteClientModel.collection.updateOne({ mobile: '15551500006' }, { $unset: { warmupPhase: '' } });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: [], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);

            expect(await service.refillJoinQueue('test-client-1')).toBe(1);
            expect((service as any).joinChannelMap.has('15551500004')).toBe(false);
            expect((service as any).joinChannelMap.has('15551500005')).toBe(false);
            expect((service as any).joinChannelMap.has('15551500006')).toBe(true);
        });

        it('queues a leave when too many unsendable channels', async () => {
            await service.create(makePromoteClientData({ mobile: '15551500002', channels: 50, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['x'], canSendFalseCount: 12, canSendFalseChats: ['l1', 'l2'] } as any);
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
            expect((service as any).leaveChannelMap.get('15551500002')).toEqual(['l1', 'l2']);
        });

        it('deactivates on permanent error', async () => {
            await service.create(makePromoteClientData({ mobile: '15551500003', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('AUTH_KEY_DUPLICATED'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            await service.refillJoinQueue('test-client-1');
            // Real deactivateClient ran on the permanent error — assert persisted inactive state.
            const after = await service.findOne('15551500003');
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(after!.message).toContain('AUTH_KEY_DUPLICATED');
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551500003', expect.any(String));
        });
    });

    // ─── joinchannelForPromoteClients ────────────────────────────────────────

    describe('joinchannelForPromoteClients()', () => {
        it('short-circuits when active client setup exists', async () => {
            telegramService.hasActiveClientSetup.mockReturnValue(true);
            expect(await service.joinchannelForPromoteClients()).toContain('skipping');
        });

        it('queues join + leave based on channel info', async () => {
            await service.create(makePromoteClientData({ mobile: '15551600001', channels: 10, status: 'active', clientId: 'test-client-1' }));
            await service.create(makePromoteClientData({ mobile: '15551600002', channels: 20, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo')
                .mockResolvedValueOnce({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any)
                .mockResolvedValueOnce({ ids: ['b'], canSendFalseCount: 12, canSendFalseChats: ['l1'] } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);
            const result = await service.joinchannelForPromoteClients(true);
            expect(result).toContain('Initiated Joining channels for 1');
        });

        it('skips when join/leave is in progress', async () => {
            (service as any).isLeaveChannelProcessing = true;
            const result = await service.joinchannelForPromoteClients();
            expect(result).toContain('still processing');
            (service as any).isLeaveChannelProcessing = false;
        });

        it('deactivates on permanent error during sweep', async () => {
            await service.create(makePromoteClientData({ mobile: '15551600003', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('SESSION_REVOKED'));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            await service.joinchannelForPromoteClients(true);
            // Real deactivateClient ran during the sweep — assert persisted inactive state.
            const after = await service.findOne('15551600003');
            expect(after!.status).toBe('inactive');
            expect(after!.inUse).toBe(false);
            expect(after!.message).toContain('SESSION_REVOKED');
            expect(usersService.expireAccount).toHaveBeenCalledWith('15551600003', expect.any(String));
        });
    });

    // ─── updateInfo ──────────────────────────────────────────────────────────

    it('updateInfo runs health checks on stale promote clients', async () => {
        await service.create(makePromoteClientData({ mobile: '15551900001', status: 'active', lastChecked: new Date('2020-01-01') }));
        const healthSpy = jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue({ passed: true, performed: true });
        await service.updateInfo();
        expect(healthSpy).toHaveBeenCalledWith('15551900001', expect.any(Number), expect.any(Number));
    });

    // ─── updateLastUsed / markAsActive ───────────────────────────────────────

    it('updateLastUsed + markAsActive', async () => {
        await service.create(makePromoteClientData({ mobile: '15551950001', status: 'inactive' }));
        const used = await service.updateLastUsed('15551950001');
        expect(used.lastUsed).toBeInstanceOf(Date);
        const active = await service.markAsActive('15551950001');
        expect(active.status).toBe('active');
    });

    // ─── checkPromoteClients ─────────────────────────────────────────────────

    describe('checkPromoteClients()', () => {
        it('skips concurrent invocation without mutating any client', async () => {
            await service.create(makePromoteClientData({
                mobile: '15551800050', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled',
            }));
            (service as any).checkingPromoteClientsSince = Date.now();
            await service.checkPromoteClients();
            // No pipeline ran → the enrolled doc is untouched.
            const after = await service.findOne('15551800050');
            expect(after!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(after!.lastUpdateAttempt ?? null).toBeNull();
            expect((service as any).checkingPromoteClientsSince).toBeGreaterThan(0);
            (service as any).checkingPromoteClientsSince = 0;
        });

        it('skips when active client setup exists without mutating any client', async () => {
            await service.create(makePromoteClientData({
                mobile: '15551800060', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled',
            }));
            telegramService.hasActiveClientSetup.mockReturnValue(true);
            await service.checkPromoteClients();
            const after = await service.findOne('15551800060');
            expect(after!.warmupPhase).toBe(WarmupPhase.ENROLLED);
            expect(after!.lastUpdateAttempt ?? null).toBeNull();
            expect((service as any).checkingPromoteClientsSince).toBe(0);
        });

        it('leaves READY+lastUsed accounts for the paced ready-rotation scheduler', async () => {
            // Normal maintenance must never batch READY -> SESSION_ROTATED work.
            const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            await service.create(makePromoteClientData({
                mobile: '15551800001', status: 'active', clientId: 'test-client-1', inUse: false,
                warmupPhase: 'ready', enrolledAt: past, lastUsed: past,
                privacyUpdatedAt: past, twoFASetAt: past, otherAuthsRemovedAt: past,
                profilePicsDeletedAt: past, nameBioUpdatedAt: past, usernameUpdatedAt: past,
                profilePicsUpdatedAt: past, channels: 250,
            }));
            usersService.search.mockResolvedValue([]);

            await service.checkPromoteClients();

            const after = await service.findOne('15551800001');
            expect(after!.warmupPhase).toBe(WarmupPhase.READY);
            expect(after!.sessionRotatedAt ?? null).toBeNull();
            const summaryCall = botsService.sendMessageByCategory.mock.calls
                .find((c) => typeof c[1] === 'string' && c[1].includes('Promote Client Check Summary'));
            expect(summaryCall).toBeDefined();
            expect((service as any).checkingPromoteClientsSince).toBe(0);
        });

        it('reports crash without throwing when an external dependency fails', async () => {
            // Mock an EXTERNAL dependency (clientService.findAll) to throw — exercising the real
            // crash-handling branch instead of stubbing the unit's own internal method.
            clientService.findAll.mockRejectedValue(new Error('kaboom'));
            await service.checkPromoteClients();
            expect((service as any).checkingPromoteClientsSince).toBe(0);
        });
    });

    // ─── addNewUserstoPromoteClientsDynamic + createPromoteClientFromUser ─────

    describe('addNewUserstoPromoteClientsDynamic()', () => {
        const needs = (clientId: string, totalNeeded: number) => ([{
            clientId, totalNeeded, windowNeeds: [], totalActive: 0, totalNeededForCount: totalNeeded,
            calculationReason: 'need', priority: 0,
        }]);

        it('returns zero when no slots needed', async () => {
            expect(await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 0)))
                .toEqual({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
        });

        it('enrolls a new promote client from eligible user', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200001', tgId: 'tg-new-1' }]);
            usersService.search.mockResolvedValue([{ mobile: '15552200001', tgId: 'tg-new-1', session: 'src-session' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a', 'b'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(1);
            const doc = await service.findOne('15552200001');
            expect(doc!.warmupPhase).toBe(WarmupPhase.ENROLLED);
        });

        it('skips 2FA-enabled user and updates 2FA status', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200002', tgId: 'tg-new-2' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => true), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const twoFASpy = jest.spyOn(service as any, 'updateUser2FAStatus').mockResolvedValue(undefined);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
            expect(twoFASpy).toHaveBeenCalledWith('tg-new-2', '15552200002');
        });

        it('skips mobile already enrolled elsewhere', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200003', tgId: 'tg-new-3' }]);
            bufferClientService.existsByMobile.mockResolvedValue(true);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
        });

        it('expires user on permanent enrollment error', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15552200004', tgId: 'tg-new-4' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                hasPassword: jest.fn(async () => { throw new Error('USER_DEACTIVATED_BAN'); }), client: {},
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
            expect(usersService.expireAccount).toHaveBeenCalled();
        });
    });

    it('addNewUserstoPromoteClients (legacy wrapper) really enrolls via the dynamic path', async () => {
        // Empty pool → real calculateAvailabilityBasedNeeds reports a deficit → real dynamic
        // enrollment runs and persists a new promote client.
        usersService.executeQuery.mockResolvedValue([{ mobile: '15551960001', tgId: 'tg-legacy-1' }]);
        usersService.search.mockResolvedValue([{ mobile: '15551960001', tgId: 'tg-legacy-1', session: 'src-session' }]);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a', 'b'], canSendFalseCount: 0, canSendFalseChats: [] } as any);

        await service.addNewUserstoPromoteClients([], [], ['test-client-1']);

        const created = await service.findOne('15551960001');
        expect(created).not.toBeNull();
        expect(created!.clientId).toBe('test-client-1');
        expect(created!.warmupPhase).toBe(WarmupPhase.ENROLLED);
    });

    // ─── distribution + getters ──────────────────────────────────────────────

    describe('distribution + getters', () => {
        it('computes promote client distribution', async () => {
            await service.create(makePromoteClientData({ mobile: '15552000001', status: 'active', clientId: 'test-client-1', lastUsed: null }));
            await service.create(makePromoteClientData({ mobile: '15552000002', status: 'inactive', clientId: 'test-client-1' }));
            const dist = await service.getPromoteClientDistribution();
            expect(dist.totalPromoteClients).toBe(2);
            expect(dist.activePromoteClients).toBe(1);
        });

        it('getPromoteClientsByStatus + WithMessages + LRU getters', async () => {
            await service.create(makePromoteClientData({ mobile: '15552000003', status: 'active', clientId: 'cid-z', warmupPhase: 'session_rotated', availableDate: '2020-01-01' }));
            expect(await service.getPromoteClientsByStatus('active')).toHaveLength(1);
            expect((await service.getPromoteClientsWithMessages())[0]).toHaveProperty('message');
            const lru = await service.getNextAvailablePromoteClient('cid-z');
            expect(lru).not.toBeNull();
            const unused = await service.getUnusedPromoteClients(24, 'cid-z');
            expect(Array.isArray(unused)).toBe(true);
        });

        it('sends promote check summary notification', async () => {
            await service.create(makePromoteClientData({ mobile: '15552000010', status: 'active', clientId: 'test-client-1' }));
            await (service as any).sendPromoteCheckSummaryNotification(1, 1, 1, ['a | b'], ['c | d']);
            const lastCall = botsService.sendMessageByCategory.mock.calls.pop();
            expect(lastCall[1]).toContain('Promote Client Check Summary');
        });
    });

    // ─── remove + createOrUpdate + updateStatus failure ──────────────────────

    describe('crud edge paths', () => {
        it('remove deletes existing promote client', async () => {
            await service.create(makePromoteClientData({ mobile: '15552300001' }));
            await service.remove('15552300001', 'cleanup');
            expect(await service.findOne('15552300001', false)).toBeNull();
        });

        it('remove throws NotFound for unknown mobile', async () => {
            await expect(service.remove('15559990000')).rejects.toThrow();
        });

        it('createOrUpdate creates then updates', async () => {
            const created = await service.createOrUpdate('15552300002', makePromoteClientData({ mobile: '15552300002', channels: 10 }));
            expect(created.channels).toBe(10);
            const updated = await service.createOrUpdate('15552300002', makePromoteClientData({ mobile: '15552300002', channels: 99 }));
            expect(updated.channels).toBe(99);
        });

        it('updateStatus rethrows and notifies on failure', async () => {
            await expect(service.updateStatus('15559990001', 'inactive', 'x')).rejects.toThrow();
            expect(botsService.sendMessageByCategory).toHaveBeenCalledWith(
                'ACCOUNT_NOTIFICATIONS', expect.stringContaining('Failed'), expect.anything(),
            );
        });

        it('markAsInactive is a no-op when already inactive', async () => {
            await service.create(makePromoteClientData({ mobile: '15559990002', status: 'inactive' }));
            const before = botsService.sendMessageByCategory.mock.calls.length;
            const res = await service.markAsInactive('15559990002', 'again');
            expect(res!.status).toBe('inactive');
            expect(botsService.sendMessageByCategory.mock.calls.length).toBe(before);
        });

        it('markAsInactive returns null when updateStatus throws (catch path)', async () => {
            await service.create(makePromoteClientData({ mobile: '15559990010', status: 'active' }));
            jest.spyOn(service, 'updateStatus').mockRejectedValue(new Error('db down'));
            const res = await service.markAsInactive('15559990010', 'boom');
            expect(res).toBeNull();
        });
    });

    // ─── normalizeSessionForWrite branches (387, 390, 470) ───────────────────
    describe('session normalization + update guards', () => {
        it('create rejects null session', async () => {
            await expect(service.create(makePromoteClientData({ mobile: '15553000001', session: null })))
                .rejects.toThrow('session cannot be blank');
        });

        it('create rejects non-string session', async () => {
            await expect(service.create(makePromoteClientData({ mobile: '15553000002', session: 12345 as any })))
                .rejects.toThrow('session must be a string');
        });

        it('create rejects whitespace-only session', async () => {
            await expect(service.create(makePromoteClientData({ mobile: '15553000003', session: '   ' })))
                .rejects.toThrow('session cannot be blank');
        });

        it('create rejects active client with no session', async () => {
            await expect(service.create(makePromoteClientData({ mobile: '15553000004', status: 'active', session: undefined })))
                .rejects.toThrow('Active PromoteClient requires a session');
        });

        it('update rejects mobile in payload mismatching route mobile', async () => {
            await service.create(makePromoteClientData({ mobile: '15553000005' }));
            await expect(service.update('15553000005', { mobile: '15553009999' } as any))
                .rejects.toThrow('mobile in payload must match route mobile');
        });

        it('update rejects activating without any session', async () => {
            await service.create(makePromoteClientData({ mobile: '15553000006', status: 'inactive' }));
            // Wipe stored session so activation guard trips
            await PromoteClientModel.updateOne({ mobile: '15553000006' }, { $unset: { session: '' } });
            await expect(service.update('15553000006', { status: 'active' } as any))
                .rejects.toThrow('Cannot activate PromoteClient without a session');
        });
    });

    // ─── executeQuery error + remove catch (663-665, 635-636) ────────────────
    describe('query/remove error paths', () => {
        it('executeQuery throws BadRequest for falsy query', async () => {
            await expect(service.executeQuery(null as any)).rejects.toThrow('Query is invalid.');
        });

        it('executeQuery wraps unexpected error as InternalServerError', async () => {
            // Force a non-BadRequest/NotFound error from the cursor exec
            const spy = jest.spyOn(PromoteClientModel, 'find').mockImplementation(() => {
                throw new Error('mongo blew up');
            });
            await expect(service.executeQuery({})).rejects.toThrow(/Query execution failed/);
            spy.mockRestore();
        });

        it('remove wraps non-NotFound error as HttpException', async () => {
            const spy = jest.spyOn(PromoteClientModel, 'deleteOne').mockImplementation(() => {
                throw new Error('delete failed');
            });
            await expect(service.remove('15553100001', 'x')).rejects.toThrow('delete failed');
            spy.mockRestore();
        });

        it('executeQuery rethrows a BadRequestException raised during exec (663,664)', async () => {
            const spy = jest.spyOn(PromoteClientModel, 'find').mockImplementation(() => {
                throw new BadRequestException('bad inner');
            });
            await expect(service.executeQuery({})).rejects.toThrow(BadRequestException);
            spy.mockRestore();
        });
    });

    // ─── isHealthyPromoteClientForCap branches (127-140) ─────────────────────
    describe('isHealthyPromoteClientForCap()', () => {
        const now = Date.now();
        it('counts READY phase as healthy', () => {
            expect((service as any).isHealthyPromoteClientForCap({ warmupPhase: WarmupPhase.READY }, now)).toBe(true);
        });

        it('rejects accounts that exceeded MAX_FAILED_ATTEMPTS', () => {
            expect((service as any).isHealthyPromoteClientForCap(
                { warmupPhase: WarmupPhase.GROWING, failedUpdateAttempts: 99 }, now)).toBe(false);
        });

        it('rejects accounts stuck in warmup past STUCK_WARMUP_DAYS', () => {
            const enrolledAt = new Date(now - 60 * 24 * 60 * 60 * 1000);
            expect((service as any).isHealthyPromoteClientForCap(
                { warmupPhase: WarmupPhase.GROWING, enrolledAt }, now)).toBe(false);
        });

        it('accepts a recently enrolled mid-warmup account', () => {
            const enrolledAt = new Date(now - 2 * 24 * 60 * 60 * 1000);
            expect((service as any).isHealthyPromoteClientForCap(
                { warmupPhase: WarmupPhase.GROWING, enrolledAt }, now)).toBe(true);
        });

        it('infers phase when warmupPhase missing (no enrolledAt → healthy)', () => {
            expect((service as any).isHealthyPromoteClientForCap({ channels: 0 }, now)).toBe(true);
        });
    });

    // ─── getter / alias coverage (100, 1450-1451, 1415) ──────────────────────
    describe('getters + aliases', () => {
        it('exposes promote clientType', () => {
            expect(service.clientType).toBe('promote');
        });

        it('removeFromPromoteMap + clearPromoteMap delegate to join map', () => {
            (service as any).joinChannelMap.set('15553200001', ['a']);
            service.removeFromPromoteMap('15553200001');
            expect((service as any).joinChannelMap.has('15553200001')).toBe(false);
            (service as any).joinChannelMap.set('15553200002', ['b']);
            service.clearPromoteMap();
            expect((service as any).joinChannelMap.size).toBe(0);
        });

        it('distribution summary sorts multiple clients (comparator path)', async () => {
            clientService.findAll.mockResolvedValue([
                { clientId: 'zeta', mobile: '15553200010' },
                { clientId: 'alpha', mobile: '15553200011' },
            ]);
            await service.create(makePromoteClientData({ mobile: '15553200012', status: 'active', clientId: 'zeta' }));
            await service.create(makePromoteClientData({ mobile: '15553200013', status: 'active', clientId: 'alpha' }));
            await (service as any).sendPromoteCheckSummaryNotification(0, 0, 0, [], []);
            const summary = botsService.sendMessageByCategory.mock.calls.pop()[1];
            expect(summary).toContain('alpha:');
            expect(summary).toContain('zeta:');
            // alpha should be listed before zeta after sorting
            expect(summary.indexOf('alpha:')).toBeLessThan(summary.indexOf('zeta:'));
        });
    });

    // ─── updateStatus notification .catch handlers (499, 508) ────────────────
    describe('updateStatus notification failures', () => {
        it('logs but does not throw when success notification fails', async () => {
            await service.create(makePromoteClientData({ mobile: '15553300001', status: 'inactive' }));
            botsService.sendMessageByCategory.mockRejectedValueOnce(new Error('notify down'));
            const res = await service.updateStatus('15553300001', 'active', 'reactivate');
            expect(res.status).toBe('active');
            // allow the swallowed rejection to settle
            await new Promise((r) => setTimeout(r, 0));
        });

        it('logs but does not throw when failure notification also fails', async () => {
            // update throws (unknown mobile) → failure-notification path; that notify also rejects
            botsService.sendMessageByCategory.mockRejectedValueOnce(new Error('notify down'));
            await expect(service.updateStatus('15553399999', 'inactive', 'x')).rejects.toThrow();
            await new Promise((r) => setTimeout(r, 0));
        });

        it('handles non-Error success-notification rejection + no message (499)', async () => {
            await service.create(makePromoteClientData({ mobile: '15553300010', status: 'inactive' }));
            botsService.sendMessageByCategory.mockRejectedValueOnce('plain string failure');
            const res = await service.updateStatus('15553300010', 'active'); // no message → "-" branch
            expect(res.status).toBe('active');
            await new Promise((r) => setTimeout(r, 0));
        });

        it('handles non-Error thrown by update + non-Error failure-notification (502,508)', async () => {
            jest.spyOn(service, 'update').mockRejectedValueOnce('raw failure');
            botsService.sendMessageByCategory.mockRejectedValueOnce('raw notify failure');
            await expect(service.updateStatus('15553300020', 'inactive')).rejects.toBe('raw failure');
            await new Promise((r) => setTimeout(r, 0));
        });
    });

    // ─── updateInfo with multiple stale clients (768) ────────────────────────
    it('updateInfo sleeps between multiple stale promote clients', async () => {
        await service.create(makePromoteClientData({ mobile: '15553400001', status: 'active', lastChecked: new Date('2020-01-01') }));
        await service.create(makePromoteClientData({ mobile: '15553400002', status: 'active', lastChecked: new Date('2020-01-01') }));
        const healthSpy = jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue({ passed: true, performed: true });
        await service.updateInfo();
        expect(healthSpy).toHaveBeenCalledTimes(2);
    });

    // ─── joinchannelForPromoteClients outer catch (864-869) ──────────────────
    it('joinchannelForPromoteClients clears maps and throws on unexpected error', async () => {
        await service.create(makePromoteClientData({ mobile: '15553500001', channels: 10, status: 'active', clientId: 'test-client-1' }));
        // prepareJoinChannelRefresh succeeds, but the model query throws → outer catch
        jest.spyOn(PromoteClientModel, 'find').mockImplementationOnce(() => { throw new Error('query boom'); });
        await expect(service.joinchannelForPromoteClients(true)).rejects.toThrow('Failed to initiate channel joining process');
        expect((service as any).joinChannelMap.size).toBe(0);
        expect((service as any).leaveChannelMap.size).toBe(0);
    });

    // ─── updateNameAndBio catch + permanent error (331-341) ──────────────────
    describe('updateNameAndBio() error paths', () => {
        it('increments failure attempts on transient error', async () => {
            await service.create(makePromoteClientData({ mobile: '15553600001' }));
            const doc = await service.findOne('15553600001');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => { throw new Error('FLOOD_WAIT_30'); }),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(false);
            const count = await service.updateNameAndBio(doc as any, { clientId: 'c1', firstNames: [], promoteLastNames: [], bios: [], profilePics: [] } as any, 2);
            expect(count).toBe(0);
            const after = await service.findOne('15553600001');
            expect(after!.failedUpdateAttempts).toBe(3);
            expect(after!.status).not.toBe('inactive');
        });

        it('deactivates on permanent error', async () => {
            await service.create(makePromoteClientData({ mobile: '15553600002' }));
            const doc = await service.findOne('15553600002');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => { throw new Error('USER_DEACTIVATED_BAN'); }),
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            isPermanentError.mockReturnValue(true);
            const count = await service.updateNameAndBio(doc as any, { clientId: 'c1', firstNames: ['X'], promoteLastNames: [], bios: [], profilePics: [] } as any, 0);
            expect(count).toBe(0);
            const after = await service.findOne('15553600002');
            expect(after!.status).toBe('inactive');
            expect(after!.message).toContain('USER_DEACTIVATED_BAN');
        });
    });

    // ─── updateNameAndBio persona edge branches (167, 212, 226, 261) ─────────
    describe('updateNameAndBio() persona edge branches', () => {
        it('reuses an existing valid assignment on the doc (167)', async () => {
            await service.create(makePromoteClientData({ mobile: '15553700001' }));
            // pre-stamp an assignment so hasValidAssignment is true
            await PromoteClientModel.updateOne({ mobile: '15553700001' }, { $set: { assignedFirstName: 'Cleo', assignedLastName: 'Vale', assignedBio: 'b' } });
            const doc = await service.findOne('15553700001');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn().mockResolvedValue({ users: [{ lastName: '' }], fullUser: { about: '' } });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Old' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const client = { clientId: 'c1', firstNames: ['Cleo'], promoteLastNames: ['Vale'], bios: ['b'], profilePics: [], dbcoll: 'db' };
            const count = await service.updateNameAndBio(doc as any, client as any, 0);
            expect(count).toBeGreaterThanOrEqual(1);
        });

        it('pushes active client assignment into dedup set (212)', async () => {
            await service.create(makePromoteClientData({ mobile: '15553700002', clientId: 'cid-dedup' }));
            const doc = await service.findOne('15553700002');
            clientService.getActiveClientAssignment.mockResolvedValue({
                mobile: '15559998888', assignedFirstName: 'Taken', assignedLastName: 'Name', assignedBio: 'x', assignedProfilePics: [],
            });
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn().mockResolvedValue({ users: [{ lastName: '' }], fullUser: { about: '' } });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Old' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const client = { clientId: 'cid-dedup', firstNames: ['Cleo'], promoteLastNames: ['Vale'], bios: ['b'], profilePics: [], dbcoll: 'db' };
            const count = await service.updateNameAndBio(doc as any, client as any, 0);
            expect(count).toBeGreaterThanOrEqual(1);
            expect(clientService.getActiveClientAssignment).toHaveBeenCalled();
        });

        it('warns and falls back when all persona candidates are used (226)', async () => {
            // Two active docs already consume the only persona combination
            await service.create(makePromoteClientData({ mobile: '15553700010', clientId: 'cid-pool', status: 'active' }));
            await PromoteClientModel.updateOne({ mobile: '15553700010' }, { $set: { assignedFirstName: 'Solo', assignedLastName: null, assignedBio: null } });
            await service.create(makePromoteClientData({ mobile: '15553700011', clientId: 'cid-pool', status: 'active' }));
            const doc = await service.findOne('15553700011');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn().mockResolvedValue({ users: [{ lastName: '' }], fullUser: { about: '' } });
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Old' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const warnSpy = jest.spyOn((service as any).logger, 'warn');
            // single-name pool → only one candidate → it's used → fallback warn fires
            const client = { clientId: 'cid-pool', firstNames: ['Solo'], promoteLastNames: [], bios: [], profilePics: [], dbcoll: 'db' };
            await service.updateNameAndBio(doc as any, client as any, 0);
            expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('No unique persona candidate'))).toBe(true);
        });

        it('applies bio-only assignment with null first/last name (269-270, 285-286)', async () => {
            await service.create(makePromoteClientData({ mobile: '15553700030' }));
            // assignment with only bio set; firstName & lastName null → display fallbacks used
            await PromoteClientModel.updateOne({ mobile: '15553700030' }, { $set: { assignedFirstName: null, assignedLastName: null, assignedBio: 'just-bio' } });
            // hasValidAssignment is false (all of first/last/bio checks: bio set makes it true actually)
            const doc = await service.findOne('15553700030');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            const invoke = jest.fn()
                .mockResolvedValueOnce({ users: [{ lastName: '' }], fullUser: { about: 'old' } })
                .mockResolvedValue(undefined);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Keep' })),
                client: { invoke },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            const client = { clientId: 'c1', firstNames: ['Cleo'], promoteLastNames: ['Vale'], bios: ['just-bio'], profilePics: [], dbcoll: 'db' };
            const count = await service.updateNameAndBio(doc as any, client as any, 0);
            // bio mismatch → at least one update
            expect(count).toBeGreaterThanOrEqual(1);
        });

        it('warns when atomic assignment guard fails (261)', async () => {
            await service.create(makePromoteClientData({ mobile: '15553700020', clientId: 'cid-guard' }));
            const doc = await service.findOne('15553700020');
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Old' })),
                client: { invoke: jest.fn().mockResolvedValue({ users: [{ lastName: '' }], fullUser: { about: '' } }) },
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            // findOneAndUpdate returns null → guard not met
            const fouSpy = jest.spyOn(PromoteClientModel, 'findOneAndUpdate').mockResolvedValueOnce(null as any);
            const warnSpy = jest.spyOn((service as any).logger, 'warn');
            const client = { clientId: 'cid-guard', firstNames: ['Cleo'], promoteLastNames: ['Vale'], bios: ['b'], profilePics: [], dbcoll: 'db' };
            await service.updateNameAndBio(doc as any, client as any, 0);
            expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('Atomic persona assignment failed'))).toBe(true);
            fouSpy.mockRestore();
        });
    });

    // ─── createPromoteClientFromUser missing-session + dynamic loop edges ────
    describe('dynamic enrollment edge paths', () => {
        const needs = (clientId: string, totalNeeded: number) => ([{
            clientId, totalNeeded, windowNeeds: [], totalActive: 0, totalNeededForCount: totalNeeded,
            calculationReason: 'need', priority: 0,
        }]);

        it('skips enrollment when source user session is missing (1118-1119)', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15553800001', tgId: 'tg-ns' }]);
            // user lookup inside createPromoteClientFromUser returns a session-less user
            usersService.search.mockResolvedValue([{ mobile: '15553800001', tgId: 'tg-ns', session: '  ' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
            expect(await service.findOne('15553800001', false)).toBeNull();
        });

        it('skips a duplicate mobile already attempted in the same run (1272-1273)', async () => {
            // Same mobile appears twice; need 2 so loop runs twice
            usersService.executeQuery.mockResolvedValue([
                { mobile: '15553800002', tgId: 'tg-dup' },
                { mobile: '15553800002', tgId: 'tg-dup' },
            ]);
            usersService.search.mockResolvedValue([{ mobile: '15553800002', tgId: 'tg-dup', session: 'sess' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 2), new Map());
            // first creates, second is the same mobile → skipped via enrolledThisRun
            expect(res.createdCount).toBe(1);
        });

        it('handles a thrown createPromoteClientFromUser inside the dynamic loop (1289-1291)', async () => {
            usersService.executeQuery.mockResolvedValue([{ mobile: '15553800003', tgId: 'tg-throw' }]);
            // make createPromoteClientFromUser throw by having isMobileEnrolledAnywhere reject
            jest.spyOn(service as any, 'createPromoteClientFromUser').mockRejectedValue(new Error('connection boom'));
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], needs('test-client-1', 1), new Map());
            expect(res.createdCount).toBe(0);
            expect(res.attemptedCount).toBe(1);
        });
    });

    // ─── create notification ternaries + executeQuery branches + defaults ────
    describe('misc branch fill', () => {
        it('create handles missing clientId in notification (430)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554500001', clientId: undefined }));
            const doc = await service.findOne('15554500001');
            expect(doc).not.toBeNull();
            const msg = botsService.sendMessageByCategory.mock.calls.pop()[1];
            expect(msg).toContain('<b>Client ID:</b> -');
        });

        it('executeQuery applies skip and no-sort path (660,663)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554500010', channels: 5 }));
            await service.create(makePromoteClientData({ mobile: '15554500011', channels: 6 }));
            const res = await service.executeQuery({}, undefined, undefined, 1);
            expect(res).toHaveLength(1);
        });

        it('markAsInactive swallows a non-Error throw (603)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554500030', status: 'active' }));
            jest.spyOn(service, 'updateStatus').mockRejectedValue('string failure');
            const res = await service.markAsInactive('15554500030', 'x');
            expect(res).toBeNull();
        });

        it('getLeastRecentlyUsedPromoteClients + getUnusedPromoteClients use default args (1393,1402)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554500040', status: 'active', clientId: 'cid-def', warmupPhase: 'session_rotated', availableDate: '2020-01-01' }));
            const lru = await service.getLeastRecentlyUsedPromoteClients('cid-def');
            expect(Array.isArray(lru)).toBe(true);
            const unused = await service.getUnusedPromoteClients();
            expect(Array.isArray(unused)).toBe(true);
        });

        it('getNextAvailablePromoteClient returns null when none available (1399)', async () => {
            const res = await service.getNextAvailablePromoteClient('cid-none-at-all');
            expect(res).toBeNull();
        });

        it('create of inactive client without session omits session field (418)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554500060', status: 'inactive', session: undefined }));
            const doc = await service.findOne('15554500060');
            expect(doc!.status).toBe('inactive');
        });

        it('fetchJoinableChannels returns [] when remaining capacity is 0 (579)', async () => {
            const res = await (service as any).fetchJoinableChannels(10, 0, []);
            expect(res).toEqual([]);
        });

        it('createPromoteClientFromUser short-circuits when already enrolled in promote pool', async () => {
            await service.create(makePromoteClientData({ mobile: '15554500070' }));
            const created = await (service as any).createPromoteClientFromUser({ mobile: '15554500070', tgId: 't' }, 'test-client-1');
            expect(created).toBe(false);
        });

        it('createPromoteClientFromUser short-circuits when mobile is an active client (1087)', async () => {
            // Not in promote/buffer pools, but present in clients → clientExists branch
            clientService.findAll.mockResolvedValue([{ clientId: 'c', mobile: '15554500075' }]);
            const created = await (service as any).createPromoteClientFromUser({ mobile: '15554500075', tgId: 't' }, 'test-client-1');
            expect(created).toBe(false);
            expect(await service.findOne('15554500075', false)).toBeNull();
        });

        it('addNewUserstoPromoteClients legacy wrapper defaults clientsNeeding to [] (1184)', async () => {
            // No clients needing → dynamic path enrolls nothing
            const res = await service.addNewUserstoPromoteClients([], []);
            expect(res).toBeUndefined();
        });

        it('dynamic loop breaks when assignment queue is exhausted (1278)', async () => {
            // totalNeeded 2 but capacity caps assignmentQueue to 1 via projected counts
            usersService.executeQuery.mockResolvedValue([
                { mobile: '15554500080', tgId: 'a' },
                { mobile: '15554500081', tgId: 'b' },
            ]);
            usersService.search.mockResolvedValue([{ mobile: '15554500080', tgId: 'a', session: 'sess' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            // projected count already at cap-1 so only one slot enqueues despite totalNeeded 2
            const projected = new Map([['test-client-1', 29]]);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], [{
                clientId: 'test-client-1', totalNeeded: 2, windowNeeds: [], totalActive: 0, totalNeededForCount: 2, calculationReason: 'n', priority: 0,
            }], projected);
            expect(res.createdCount).toBe(1);
        });

        it('addNewUserstoPromoteClientsDynamic skips documents missing mobile/tgId (1268)', async () => {
            usersService.executeQuery.mockResolvedValue([{ tgId: 'no-mobile' }, { mobile: '15554500050', tgId: 'ok' }]);
            usersService.search.mockResolvedValue([{ mobile: '15554500050', tgId: 'ok', session: 'sess' }]);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ hasPassword: jest.fn(async () => false), client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['a'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            const res = await service.addNewUserstoPromoteClientsDynamic([], [], [{
                clientId: 'test-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'n', priority: 0,
            }], new Map());
            expect(res.createdCount).toBe(1);
        });
    });

    // ─── refillJoinQueue extra branches (514, 537, 546, 583) ─────────────────
    describe('refillJoinQueue() branches', () => {
        it('returns 0 when a join is already processing (514)', async () => {
            (service as any).isJoinChannelProcessing = true;
            expect(await service.refillJoinQueue('test-client-1')).toBe(0);
            (service as any).isJoinChannelProcessing = false;
        });

        it('skips a mobile that is daily-capped (537)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554000001', channels: 10, status: 'active', clientId: 'test-client-1' }));
            // Push the mobile over the daily cap (set date so the counter isn't reset on entry)
            (service as any).resetDailyJoinCountersIfNeeded();
            (service as any).dailyJoinCounts.set('15554000001', service.config.maxChannelJoinsPerDay);
            const getClientSpy = jest.spyOn(connectionManager, 'getClient');
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
            expect(getClientSpy).not.toHaveBeenCalled();
            (service as any).dailyJoinCounts.clear();
        });

        it('continues when no joinable channels are returned (546)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554000002', channels: 10, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: ['x'], canSendFalseCount: 0, canSendFalseChats: [] } as any);
            activeChannelsService.getActiveChannels.mockResolvedValue([]); // nothing joinable
            const added = await service.refillJoinQueue('test-client-1');
            expect(added).toBe(0);
        });

        it('uses broader channels pool once past 220 channels (583)', async () => {
            await service.create(makePromoteClientData({ mobile: '15554000003', channels: 230, status: 'active', clientId: 'test-client-1' }));
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            // channelInfo reports 230 ids so fetchJoinableChannels takes the channelsService branch
            jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
                ids: Array.from({ length: 230 }, (_, i) => `c${i}`), canSendFalseCount: 0, canSendFalseChats: [],
            } as any);
            channelsService.getActiveChannels.mockResolvedValue([{ channelId: 'b1', username: 'b1', canSendMsgs: true }]);
            const added = await service.refillJoinQueue('test-client-1');
            expect(channelsService.getActiveChannels).toHaveBeenCalled();
            expect(added).toBe(1);
        });
    });

    it('joinchannelForPromoteClients uses broader channels pool when at/over 220 (822)', async () => {
        await service.create(makePromoteClientData({ mobile: '15554600001', channels: 230, status: 'active', clientId: 'test-client-1' }));
        jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
            ids: Array.from({ length: 230 }, (_, i) => `c${i}`), canSendFalseCount: 0, canSendFalseChats: [],
        } as any);
        channelsService.getActiveChannels.mockResolvedValue([{ channelId: 'b1', username: 'b1', canSendMsgs: true }]);
        const result = await service.joinchannelForPromoteClients(true);
        expect(channelsService.getActiveChannels).toHaveBeenCalled();
        expect(result).toContain('Initiated Joining channels for 1');
    });

    // ─── updateNameAndBio applies name + bio writes (269-270, 280, 285-286) ──
    it('updateNameAndBio writes name and bio when TG profile mismatches', async () => {
        await service.create(makePromoteClientData({ mobile: '15554100001', clientId: 'cid-write' }));
        const doc = await service.findOne('15554100001');
        jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
        // current TG firstName "Old", lastName "Wrong", bio "old bio" — all mismatch the assignment
        const invoke = jest.fn()
            .mockResolvedValueOnce({ users: [{ lastName: 'Wrong' }], fullUser: { about: 'old bio' } })
            .mockResolvedValue(undefined);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getMe: jest.fn(async () => ({ firstName: 'Old', username: 'u' })),
            client: { invoke },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const client = { clientId: 'cid-write', firstNames: ['Cleo'], promoteLastNames: ['Vale'], bios: ['promo bio'], profilePics: [], dbcoll: 'db' };
        const count = await service.updateNameAndBio(doc as any, client as any, 0);
        expect(count).toBeGreaterThanOrEqual(2); // name update + bio update
        const after = await service.findOne('15554100001');
        expect(after!.nameBioUpdatedAt).toBeInstanceOf(Date);
    });

    // ─── _checkPromoteClientsInternal pipeline branches (918,933,935,936,939, etc.) ─
    describe('checkPromoteClients() pipeline filtering', () => {
        it('skips inUse, cross-client-missing, cooldown and runs an enrolled account through processClient', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15559990000', firstNames: [], promoteLastNames: [], bios: [], profilePics: [] }]);
            // inUse account — skipped (936)
            await service.create(makePromoteClientData({ mobile: '15554200001', status: 'active', clientId: 'test-client-1', inUse: true, warmupPhase: 'enrolled' }));
            // account assigned to an unknown clientId — clientMap.get miss (935)
            await service.create(makePromoteClientData({ mobile: '15554200002', status: 'active', clientId: 'ghost-client', warmupPhase: 'enrolled' }));
            // account on cooldown — recent lastUpdateAttempt (939)
            await service.create(makePromoteClientData({ mobile: '15554200003', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled', lastUpdateAttempt: new Date() }));
            // a clean enrolled account that should reach processClient
            await service.create(makePromoteClientData({ mobile: '15554200004', status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled' }));
            const processSpy = jest.spyOn(service as any, 'processClient').mockResolvedValue({ updateCount: 1, updateSummary: 'did-it' });
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 0, windowNeeds: [], totalActive: 0, totalNeededForCount: 0, calculationReason: 'ok', priority: 0,
            });
            await service.checkPromoteClients();
            const processedMobiles = processSpy.mock.calls.map((c) => (c[0] as any).mobile);
            expect(processedMobiles).toContain('15554200004');
            expect(processedMobiles).not.toContain('15554200001');
            expect(processedMobiles).not.toContain('15554200002');
            expect(processedMobiles).not.toContain('15554200003');
        });

        it('stops processing once MAX_UPDATES_PER_CYCLE is reached (987)', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15559990000', firstNames: [], promoteLastNames: [], bios: [], profilePics: [] }]);
            for (let i = 0; i < 3; i++) {
                await service.create(makePromoteClientData({ mobile: `1555421${String(i).padStart(4, '0')}`, status: 'active', clientId: 'test-client-1', warmupPhase: 'enrolled' }));
            }
            (service as any).MAX_UPDATES_PER_CYCLE = 1;
            const processSpy = jest.spyOn(service as any, 'processClient').mockResolvedValue({ updateCount: 5, updateSummary: 's' });
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 0, windowNeeds: [], totalActive: 0, totalNeededForCount: 0, calculationReason: 'ok', priority: 0,
            });
            await service.checkPromoteClients();
            expect(processSpy).toHaveBeenCalledTimes(1);
            (service as any).MAX_UPDATES_PER_CYCLE = 20;
        });
    });

    // ─── checkPromoteClients deeper branches (947-948, 990-992, 1021-1026, 1058-1060) ─
    describe('checkPromoteClients() deeper branches', () => {
        it('backfills timestamps for a used SESSION_ROTATED account then continues (947-948)', async () => {
            const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            await service.create(makePromoteClientData({
                mobile: '15553900001', status: 'active', clientId: 'test-client-1', inUse: false,
                warmupPhase: 'session_rotated', lastUsed: past, enrolledAt: past,
            }));
            const backfillSpy = jest.spyOn(service as any, 'backfillTimestamps');
            usersService.search.mockResolvedValue([]);
            await service.checkPromoteClients();
            expect(backfillSpy).toHaveBeenCalledWith('15553900001', expect.anything(), expect.any(Number));
        });

        it('skips a SESSION_ROTATED account that fails its health check (990-992)', async () => {
            await service.create(makePromoteClientData({
                mobile: '15553900002', status: 'active', clientId: 'test-client-1', inUse: false,
                warmupPhase: 'session_rotated', lastUsed: null, lastChecked: new Date('2020-01-01'),
            }));
            const healthSpy = jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue({ passed: false, performed: true });
            const processSpy = jest.spyOn(service as any, 'processClient');
            usersService.search.mockResolvedValue([]);
            await service.checkPromoteClients();
            expect(healthSpy).toHaveBeenCalledWith('15553900002', expect.any(Number), expect.any(Number));
            expect(processSpy).not.toHaveBeenCalled();
        });

        it('skips dynamic enrollment when healthy pool already at cap (1021-1026)', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'cap-client', mobile: '15559997777' }]);
            // 30 healthy READY promote clients for cap-client → remainingCapacity 0
            for (let i = 0; i < 30; i++) {
                await service.create(makePromoteClientData({
                    mobile: `1555391${String(i).padStart(4, '0')}`, status: 'active',
                    clientId: 'cap-client', warmupPhase: 'ready', inUse: true,
                }));
            }
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 5, windowNeeds: [], totalActive: 0, totalNeededForCount: 5, calculationReason: 'need', priority: 0,
            });
            const dynSpy = jest.spyOn(service as any, 'addNewUserstoPromoteClientsDynamic');
            const debugSpy = jest.spyOn((service as any).logger, 'debug');
            await service.checkPromoteClients();
            expect(dynSpy).not.toHaveBeenCalled();
            expect(debugSpy.mock.calls.some((c) => String(c[0]).includes('healthy pool already at cap'))).toBe(true);
        });

        it('processes a phase-less account with no prior update attempt (941,952,988,998)', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'test-client-1', mobile: '15559990000', firstNames: [], promoteLastNames: [], bios: [], profilePics: [] }]);
            await service.create(makePromoteClientData({ mobile: '15553900050', status: 'active', clientId: 'test-client-1', inUse: false }));
            // Remove warmupPhase + lastUpdateAttempt so the `|| ENROLLED` and `>0 ? : 10000` defaults fire
            await PromoteClientModel.updateOne({ mobile: '15553900050' }, { $unset: { warmupPhase: '', lastUpdateAttempt: '' } });
            // processClient returns updateCount>0 but no updateSummary → `|| 'updated'` branch
            jest.spyOn(service as any, 'processClient').mockResolvedValue({ updateCount: 1 });
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 0, windowNeeds: [], totalActive: 0, totalNeededForCount: 0, calculationReason: 'ok', priority: 0,
            });
            await service.checkPromoteClients();
            const summary = botsService.sendMessageByCategory.mock.calls.map((c) => c[1]).find((m: any) => typeof m === 'string' && m.includes('Check Summary'));
            expect(summary).toContain('| updated | count=1');
        });

        it('skips an unhealthy assigned account in the cap tally (919) and caps need message (1035)', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'cap2-client', mobile: '15559995555' }]);
            // 29 healthy ready accounts + a couple of unhealthy (stuck) ones that the cap tally must skip
            for (let i = 0; i < 29; i++) {
                await service.create(makePromoteClientData({ mobile: `1555395${String(i).padStart(4, '0')}`, status: 'active', clientId: 'cap2-client', warmupPhase: 'ready', inUse: true }));
            }
            // stuck account: growing phase, enrolled 60 days ago → not healthy for cap (919 true path)
            await service.create(makePromoteClientData({
                mobile: '15553959999', status: 'active', clientId: 'cap2-client', inUse: true,
                warmupPhase: 'growing', enrolledAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            }));
            // need 5, remaining capacity = 30-29 = 1 → cappedNeeded(1) < totalNeeded(5) → capping reason (1035)
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 5, windowNeeds: [], totalActive: 0, totalNeededForCount: 5, calculationReason: 'need', priority: 0,
            });
            const dynSpy = jest.spyOn(service as any, 'addNewUserstoPromoteClientsDynamic').mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
            await service.checkPromoteClients();
            expect(dynSpy).toHaveBeenCalled();
            const need = dynSpy.mock.calls[0][2][0];
            expect(need.totalNeeded).toBe(1);
            expect(need.calculationReason).toContain('capped to remaining healthy capacity');
        });

        it('reports dynamic enrollment failure without crashing (1058-1060)', async () => {
            clientService.findAll.mockResolvedValue([{ clientId: 'need-client', mobile: '15559996666' }]);
            jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
                totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'need', priority: 0,
            });
            jest.spyOn(service as any, 'addNewUserstoPromoteClientsDynamic').mockRejectedValue(new Error('enroll boom'));
            const errSpy = jest.spyOn((service as any).logger, 'error');
            await service.checkPromoteClients();
            expect(errSpy.mock.calls.some((c) => String(c[0]).includes('Dynamic promote enrollment failed'))).toBe(true);
            expect((service as any).checkingPromoteClientsSince).toBe(0);
        });
    });
});
