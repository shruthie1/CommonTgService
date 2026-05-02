/**
 * Enrollment deduplication & concurrency guard integration tests.
 *
 * Validates the 4-layer protection against duplicate enrollment:
 *   Layer 1 — Concurrency guard (boolean flag prevents parallel runs)
 *   Layer 2 — Comprehensive goodIds (all statuses, cross-collection)
 *   Layer 3 — In-flight tracking (enrolledThisRun Set within batch)
 *   Layer 4 — Cross-collection existence check before TG work
 *
 * Uses real MongoDB (memory server) with real service logic.
 * External dependencies (Telegram, bots, connection-manager) are mocked.
 */
import { Model } from 'mongoose';
import { BufferClient } from '../buffer-clients/schemas/buffer-client.schema';
import { PromoteClient } from '../promote-clients/schemas/promote-client.schema';
import { Client } from '../clients/schemas/client.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import {
    MongoTestContext, startMongo, stopMongo,
    createBufferClientModel, createPromoteClientModel, createClientModel, createUserModel,
    makeBufferClientData, makePromoteClientData, makeClientData, makeUserData,
    resetCounter, mockBotsService, mockTelegramService, mockUsersService,
    mockClientService, mockActiveChannelsService, mockChannelsService, mockSessionService,
} from './api-test-helpers';

// ─── External mocks ────────────────────────────────────────────────────────

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

const mockGetClient = jest.fn().mockResolvedValue({
    client: {},
    hasPassword: jest.fn().mockResolvedValue(false),
});
const mockUnregisterClient = jest.fn().mockResolvedValue(undefined);
jest.mock('../Telegram/utils/connection-manager', () => ({
    connectionManager: {
        hasClient: jest.fn(() => false),
        get getClient() { return mockGetClient; },
        get unregisterClient() { return mockUnregisterClient; },
    },
}));

const mockChannelInfo = jest.fn().mockResolvedValue({ ids: new Array(200).fill('ch'), count: 200 });
jest.mock('../../utils/telegram-utils/channelinfo', () => ({
    channelInfo: (...args: any[]) => mockChannelInfo(...args),
}));

// ─── Test suite ────────────────────────────────────────────────────────────

describe('Enrollment Deduplication', () => {
    let ctx: MongoTestContext;
    let BufferClientModel: Model<BufferClient>;
    let PromoteClientModel: Model<PromoteClient>;
    let ClientModel: Model<Client>;
    let UserModel: Model<UserDocument>;

    let bufferService: BufferClientService;
    let promoteService: PromoteClientService;
    let botsService: ReturnType<typeof mockBotsService>;

    const mainClient = { clientId: 'main-client-1', mobile: '+15559990001' };

    beforeAll(async () => {
        jest.setTimeout(120_000);
        ctx = await startMongo('enrollment-dedup-test');
        BufferClientModel = createBufferClientModel(ctx.connection);
        PromoteClientModel = createPromoteClientModel(ctx.connection);
        ClientModel = createClientModel(ctx.connection);
        UserModel = createUserModel(ctx.connection);
        await BufferClientModel.init();
        await PromoteClientModel.init();
        await ClientModel.init();
        await UserModel.ensureIndexes();
    });

    beforeEach(() => {
        resetCounter();
        jest.clearAllMocks();
        botsService = mockBotsService();

        const clientServiceMock = mockClientService([mainClient]);
        const usersServiceMock: any = {
            ...mockUsersService(),
            // Wire up search to query our real UserModel
            search: jest.fn(async (query: any) => {
                const filter: any = {};
                if (query.mobile) filter.mobile = query.mobile;
                return UserModel.find(filter).lean().exec();
            }),
            executeQuery: jest.fn(async (query: any, sort: any, limit: number) => {
                return UserModel.find(query).sort(sort).limit(limit).lean().exec();
            }),
        };

        // Create promote service
        promoteService = new PromoteClientService(
            PromoteClientModel as any,
            mockTelegramService() as any,
            usersServiceMock as any,
            mockActiveChannelsService() as any,
            clientServiceMock as any,
            mockChannelsService() as any,
            { findAll: jest.fn().mockResolvedValue([]), existsByMobile: jest.fn().mockResolvedValue(false) } as any,
            mockSessionService() as any,
            botsService as any,
        );

        // Create buffer service
        bufferService = new BufferClientService(
            BufferClientModel as any,
            mockTelegramService() as any,
            usersServiceMock as any,
            mockActiveChannelsService() as any,
            clientServiceMock as any,
            mockChannelsService() as any,
            { findAll: jest.fn().mockResolvedValue([]), existsByMobile: jest.fn().mockResolvedValue(false) } as any,
            mockSessionService() as any,
            botsService as any,
        );

        // Wire cross-references so isMobileEnrolledAnywhere works with real models
        (promoteService as any).bufferClientService = {
            findAll: jest.fn(async () => BufferClientModel.find({}).exec()),
            existsByMobile: jest.fn(async (mobile: string) =>
                !!(await BufferClientModel.findOne({ mobile }, { _id: 1 }).lean().exec())
            ),
        };
        (bufferService as any).promoteClientService = {
            findAll: jest.fn(async () => PromoteClientModel.find({}).exec()),
            existsByMobile: jest.fn(async (mobile: string) =>
                !!(await PromoteClientModel.findOne({ mobile }, { _id: 1 }).lean().exec())
            ),
        };
    });

    afterEach(async () => {
        await BufferClientModel.deleteMany({});
        await PromoteClientModel.deleteMany({});
        await ClientModel.deleteMany({});
        await UserModel.deleteMany({});
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    // ─── HELPERS ────────────────────────────────────────────────────────────

    async function insertUser(overrides: any = {}) {
        return UserModel.create(makeUserData({
            expired: false,
            twoFA: false,
            lastActive: '2025-01-01',
            totalChats: 200,
            ...overrides,
        }));
    }

    async function insertPromoteClient(overrides: any = {}) {
        return PromoteClientModel.create(makePromoteClientData({
            status: 'active',
            ...overrides,
        }));
    }

    async function insertBufferClient(overrides: any = {}) {
        return BufferClientModel.create(makeBufferClientData({
            status: 'active',
            ...overrides,
        }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 1: Concurrency Guard
    // ═══════════════════════════════════════════════════════════════════════

    describe('Layer 1: Concurrency Guard', () => {

        it('promote: second concurrent checkPromoteClients call is rejected', async () => {
            // Simulate long-running check by making internal method slow
            const originalInternal = (promoteService as any)._checkPromoteClientsInternal;
            let callCount = 0;
            (promoteService as any)._checkPromoteClientsInternal = jest.fn(async () => {
                callCount++;
                // Simulate slow work
                await new Promise((resolve) => setTimeout(resolve, 100));
            });

            // Fire two concurrent calls
            const p1 = promoteService.checkPromoteClients();
            const p2 = promoteService.checkPromoteClients();
            await Promise.all([p1, p2]);

            // Only ONE internal call should have executed
            expect(callCount).toBe(1);

            // Restore
            (promoteService as any)._checkPromoteClientsInternal = originalInternal;
        });

        it('buffer: second concurrent checkBufferClients call is rejected', async () => {
            let callCount = 0;
            const originalInternal = (bufferService as any)._checkBufferClientsInternal;
            (bufferService as any)._checkBufferClientsInternal = jest.fn(async () => {
                callCount++;
                await new Promise((resolve) => setTimeout(resolve, 100));
            });

            const p1 = bufferService.checkBufferClients();
            const p2 = bufferService.checkBufferClients();
            await Promise.all([p1, p2]);

            expect(callCount).toBe(1);

            (bufferService as any)._checkBufferClientsInternal = originalInternal;
        });

        it('promote: flag resets after completion allowing next run', async () => {
            let callCount = 0;
            (promoteService as any)._checkPromoteClientsInternal = jest.fn(async () => { callCount++; });

            await promoteService.checkPromoteClients();
            await promoteService.checkPromoteClients();

            // Both should run — sequential, not concurrent
            expect(callCount).toBe(2);
        });

        it('buffer: flag resets after completion allowing next run', async () => {
            let callCount = 0;
            (bufferService as any)._checkBufferClientsInternal = jest.fn(async () => { callCount++; });

            await bufferService.checkBufferClients();
            await bufferService.checkBufferClients();

            expect(callCount).toBe(2);
        });

        it('promote: flag resets even if internal method throws (error is caught, not propagated)', async () => {
            (promoteService as any)._checkPromoteClientsInternal = jest.fn(async () => {
                throw new Error('simulated crash');
            });

            // Error is caught internally — does not reject
            await promoteService.checkPromoteClients();

            // Flag should be reset — next call must work
            let ranAgain = false;
            (promoteService as any)._checkPromoteClientsInternal = jest.fn(async () => { ranAgain = true; });
            await promoteService.checkPromoteClients();
            expect(ranAgain).toBe(true);
        });

        it('buffer: flag resets even if internal method throws (error is caught, not propagated)', async () => {
            (bufferService as any)._checkBufferClientsInternal = jest.fn(async () => {
                throw new Error('simulated crash');
            });

            // Error is caught internally — does not reject
            await bufferService.checkBufferClients();

            let ranAgain = false;
            (bufferService as any)._checkBufferClientsInternal = jest.fn(async () => { ranAgain = true; });
            await bufferService.checkBufferClients();
            expect(ranAgain).toBe(true);
        });

        it('promote: three rapid concurrent calls only executes once', async () => {
            let callCount = 0;
            (promoteService as any)._checkPromoteClientsInternal = jest.fn(async () => {
                callCount++;
                await new Promise((resolve) => setTimeout(resolve, 50));
            });

            await Promise.all([
                promoteService.checkPromoteClients(),
                promoteService.checkPromoteClients(),
                promoteService.checkPromoteClients(),
            ]);

            expect(callCount).toBe(1);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 2: Comprehensive goodIds (all statuses, cross-collection)
    // ═══════════════════════════════════════════════════════════════════════

    describe('Layer 2: Comprehensive goodIds', () => {

        it('promote: inactive promote clients are excluded from candidate pool', async () => {
            // Create a user
            const user = await insertUser({ mobile: '+15550010001' });

            // Enroll them as an inactive promote client
            await insertPromoteClient({ mobile: '+15550010001', status: 'inactive', clientId: 'main-client-1' });

            // goodIds should include this mobile even though it's inactive
            // To test: call addNewUserstoPromoteClientsDynamic and verify
            // the user's mobile won't be picked
            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                // Pass goodIds that includes the mobile (simulating what checkPromoteClients builds)
                ['+15550010001'],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            // Should not create — mobile is in goodIds
            expect(result.createdCount).toBe(0);
        });

        it('buffer: inactive buffer clients are excluded from candidate pool', async () => {
            const user = await insertUser({ mobile: '+15550020001' });
            await insertBufferClient({ mobile: '+15550020001', status: 'inactive', clientId: 'main-client-1' });

            const result = await (bufferService as any).addNewUserstoBufferClientsDynamic(
                [],
                ['+15550020001'],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });

        it('promote: buffer client mobiles are excluded from promote candidate pool', async () => {
            // A user who is already a buffer client should not be picked as promote
            const user = await insertUser({ mobile: '+15550030001' });
            await insertBufferClient({ mobile: '+15550030001', status: 'active', clientId: 'main-client-1' });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                ['+15550030001'], // buffer mobile included in goodIds
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });

        it('promote: main client mobiles are excluded from candidate pool', async () => {
            const user = await insertUser({ mobile: mainClient.mobile });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [mainClient.mobile],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });

        it('promote: eligible user not in any collection IS picked', async () => {
            // Create a user who is NOT in any collection — they should be enrolled
            const user = await insertUser({ mobile: '+15550050001' });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [], // no exclusions
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(1);
            expect(result.createdEntries[0]).toContain('+15550050001');

            // Verify the promote client doc was actually created
            const doc = await PromoteClientModel.findOne({ mobile: '+15550050001' }).lean();
            expect(doc).toBeTruthy();
            expect(doc!.clientId).toBe('main-client-1');
        });

        it('buffer: eligible user not in any collection IS picked', async () => {
            const user = await insertUser({ mobile: '+15550060001' });

            const result = await (bufferService as any).addNewUserstoBufferClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(1);
            expect(result.createdEntries[0]).toContain('+15550060001');

            const doc = await BufferClientModel.findOne({ mobile: '+15550060001' }).lean();
            expect(doc).toBeTruthy();
            expect(doc!.clientId).toBe('main-client-1');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 3: In-flight tracking (enrolledThisRun Set)
    // ═══════════════════════════════════════════════════════════════════════

    describe('Layer 3: In-flight Tracking', () => {

        it('promote: same mobile appearing twice in candidates is only enrolled once', async () => {
            // Create two users with the same mobile (simulating edge case where
            // executeQuery somehow returns duplicates)
            const mobile = '+15550070001';
            await insertUser({ mobile });

            // Manually invoke the enrollment with a candidate list that has duplicates
            // We do this by calling createPromoteClientFromUser directly twice
            const doc = { mobile, tgId: 'tg-dup-1' };
            const r1 = await (promoteService as any).createPromoteClientFromUser(doc, 'main-client-1');
            const r2 = await (promoteService as any).createPromoteClientFromUser(doc, 'main-client-1');

            expect(r1).toBe(true);
            expect(r2).toBe(false); // Second call should be skipped by existence check

            // Only one document in DB
            const count = await PromoteClientModel.countDocuments({ mobile });
            expect(count).toBe(1);

            // Only one bot notification
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
        });

        it('buffer: same mobile appearing twice in candidates is only enrolled once', async () => {
            const mobile = '+15550080001';
            await insertUser({ mobile });

            const doc = { mobile, tgId: 'tg-dup-2' };
            const r1 = await (bufferService as any).createBufferClientFromUser(doc, 'main-client-1');
            const r2 = await (bufferService as any).createBufferClientFromUser(doc, 'main-client-1');

            expect(r1).toBe(true);
            expect(r2).toBe(false);

            const count = await BufferClientModel.countDocuments({ mobile });
            expect(count).toBe(1);
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
        });

        it('promote: batch enrollment of 5 users creates exactly 5 unique documents', async () => {
            const mobiles = ['+15550090001', '+15550090002', '+15550090003', '+15550090004', '+15550090005'];
            for (const mobile of mobiles) {
                await insertUser({ mobile });
            }

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 5, windowNeeds: [], totalActive: 0, totalNeededForCount: 5, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(5);

            const allDocs = await PromoteClientModel.find({}).lean();
            const uniqueMobiles = new Set(allDocs.map((d) => d.mobile));
            expect(uniqueMobiles.size).toBe(5);
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(5);
        });

        it('buffer: batch enrollment of 5 users creates exactly 5 unique documents', async () => {
            const mobiles = ['+15550100001', '+15550100002', '+15550100003', '+15550100004', '+15550100005'];
            for (const mobile of mobiles) {
                await insertUser({ mobile });
            }

            const result = await (bufferService as any).addNewUserstoBufferClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 5, windowNeeds: [], totalActive: 0, totalNeededForCount: 5, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(5);

            const allDocs = await BufferClientModel.find({}).lean();
            const uniqueMobiles = new Set(allDocs.map((d) => d.mobile));
            expect(uniqueMobiles.size).toBe(5);
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(5);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // LAYER 4: Cross-collection existence check (isMobileEnrolledAnywhere)
    // ═══════════════════════════════════════════════════════════════════════

    describe('Layer 4: Cross-Collection Existence Check', () => {

        it('promote: skips mobile already in promoteClients collection', async () => {
            await insertPromoteClient({ mobile: '+15550110001', clientId: 'main-client-1' });

            const result = await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550110001', tgId: 'tg-cross-1' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(mockGetClient).not.toHaveBeenCalled(); // No TG connection opened
            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('promote: skips mobile already in bufferClients collection', async () => {
            await insertBufferClient({ mobile: '+15550120001', clientId: 'main-client-1' });

            const result = await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550120001', tgId: 'tg-cross-2' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(mockGetClient).not.toHaveBeenCalled();
            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('promote: skips mobile that is the main client mobile', async () => {
            const result = await (promoteService as any).createPromoteClientFromUser(
                { mobile: mainClient.mobile, tgId: 'tg-cross-3' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(mockGetClient).not.toHaveBeenCalled();
        });

        it('buffer: skips mobile already in bufferClients collection', async () => {
            await insertBufferClient({ mobile: '+15550140001', clientId: 'main-client-1' });

            const result = await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550140001', tgId: 'tg-cross-4' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(mockGetClient).not.toHaveBeenCalled();
            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('buffer: skips mobile already in promoteClients collection', async () => {
            await insertPromoteClient({ mobile: '+15550150001', clientId: 'main-client-1' });

            const result = await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550150001', tgId: 'tg-cross-5' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(mockGetClient).not.toHaveBeenCalled();
            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('buffer: skips mobile that is the main client mobile', async () => {
            const result = await (bufferService as any).createBufferClientFromUser(
                { mobile: mainClient.mobile, tgId: 'tg-cross-6' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(mockGetClient).not.toHaveBeenCalled();
        });

        it('promote: enrolls mobile not present in any collection', async () => {
            await insertUser({ mobile: '+15550170001' });

            const result = await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550170001', tgId: 'tg-fresh-1' },
                'main-client-1',
            );

            expect(result).toBe(true);
            expect(mockGetClient).toHaveBeenCalledWith('+15550170001', { autoDisconnect: false });
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);

            const doc = await PromoteClientModel.findOne({ mobile: '+15550170001' }).lean();
            expect(doc).toBeTruthy();
            expect(doc!.warmupPhase).toBe('enrolled');
        });

        it('buffer: enrolls mobile not present in any collection', async () => {
            await insertUser({ mobile: '+15550180001' });

            const result = await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550180001', tgId: 'tg-fresh-2' },
                'main-client-1',
            );

            expect(result).toBe(true);
            expect(mockGetClient).toHaveBeenCalledWith('+15550180001', { autoDisconnect: false });
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);

            const doc = await BufferClientModel.findOne({ mobile: '+15550180001' }).lean();
            expect(doc).toBeTruthy();
            expect(doc!.warmupPhase).toBe('enrolled');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // CROSS-SERVICE SCENARIOS (production-like multi-step flows)
    // ═══════════════════════════════════════════════════════════════════════

    describe('Cross-Service Scenarios', () => {

        it('mobile enrolled as buffer cannot be re-enrolled as promote', async () => {
            await insertUser({ mobile: '+15550190001' });

            // First: enroll as buffer
            const bufResult = await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550190001', tgId: 'tg-xsvc-1' },
                'main-client-1',
            );
            expect(bufResult).toBe(true);

            // Then: attempt to enroll as promote — must be rejected
            const promResult = await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550190001', tgId: 'tg-xsvc-1' },
                'main-client-1',
            );
            expect(promResult).toBe(false);

            // Only 1 buffer doc, 0 promote docs
            expect(await BufferClientModel.countDocuments({ mobile: '+15550190001' })).toBe(1);
            expect(await PromoteClientModel.countDocuments({ mobile: '+15550190001' })).toBe(0);

            // Bot notified only once (for buffer enrollment)
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
        });

        it('mobile enrolled as promote cannot be re-enrolled as buffer', async () => {
            await insertUser({ mobile: '+15550200001' });

            const promResult = await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550200001', tgId: 'tg-xsvc-2' },
                'main-client-1',
            );
            expect(promResult).toBe(true);

            const bufResult = await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550200001', tgId: 'tg-xsvc-2' },
                'main-client-1',
            );
            expect(bufResult).toBe(false);

            expect(await PromoteClientModel.countDocuments({ mobile: '+15550200001' })).toBe(1);
            expect(await BufferClientModel.countDocuments({ mobile: '+15550200001' })).toBe(0);
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
        });

        it('batch promote enrollment skips users already enrolled as buffer', async () => {
            // 3 users: first 2 are already buffer clients, third is fresh
            await insertUser({ mobile: '+15550210001' });
            await insertUser({ mobile: '+15550210002' });
            await insertUser({ mobile: '+15550210003' });
            await insertBufferClient({ mobile: '+15550210001', clientId: 'main-client-1' });
            await insertBufferClient({ mobile: '+15550210002', clientId: 'main-client-1' });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                // goodIds includes the buffer mobiles
                ['+15550210001', '+15550210002'],
                [{ clientId: 'main-client-1', totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            // Only 1 created (the fresh one)
            expect(result.createdCount).toBe(1);
            expect(result.createdEntries[0]).toContain('+15550210003');
        });

        it('batch buffer enrollment skips users already enrolled as promote', async () => {
            await insertUser({ mobile: '+15550220001' });
            await insertUser({ mobile: '+15550220002' });
            await insertUser({ mobile: '+15550220003' });
            await insertPromoteClient({ mobile: '+15550220001', clientId: 'main-client-1' });
            await insertPromoteClient({ mobile: '+15550220002', clientId: 'main-client-1' });

            const result = await (bufferService as any).addNewUserstoBufferClientsDynamic(
                [],
                ['+15550220001', '+15550220002'],
                [{ clientId: 'main-client-1', totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(1);
            expect(result.createdEntries[0]).toContain('+15550220003');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // existsByMobile METHOD TESTS
    // ═══════════════════════════════════════════════════════════════════════

    describe('existsByMobile', () => {

        it('promote: returns true when mobile exists', async () => {
            await insertPromoteClient({ mobile: '+15550230001' });
            expect(await promoteService.existsByMobile('+15550230001')).toBe(true);
        });

        it('promote: returns false when mobile does not exist', async () => {
            expect(await promoteService.existsByMobile('+15550240001')).toBe(false);
        });

        it('buffer: returns true when mobile exists', async () => {
            await insertBufferClient({ mobile: '+15550250001' });
            expect(await bufferService.existsByMobile('+15550250001')).toBe(true);
        });

        it('buffer: returns false when mobile does not exist', async () => {
            expect(await bufferService.existsByMobile('+15550260001')).toBe(false);
        });

        it('promote: returns true for inactive promote client', async () => {
            await insertPromoteClient({ mobile: '+15550270001', status: 'inactive' });
            expect(await promoteService.existsByMobile('+15550270001')).toBe(true);
        });

        it('buffer: returns true for inactive buffer client', async () => {
            await insertBufferClient({ mobile: '+15550280001', status: 'inactive' });
            expect(await bufferService.existsByMobile('+15550280001')).toBe(true);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // NOTIFICATION GUARD (bot notification only fires on true creation)
    // ═══════════════════════════════════════════════════════════════════════

    describe('Notification Guard', () => {

        it('promote: no bot notification when enrollment is skipped', async () => {
            await insertPromoteClient({ mobile: '+15550290001', clientId: 'main-client-1' });

            await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550290001', tgId: 'tg-notif-1' },
                'main-client-1',
            );

            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('buffer: no bot notification when enrollment is skipped', async () => {
            await insertBufferClient({ mobile: '+15550300001', clientId: 'main-client-1' });

            await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550300001', tgId: 'tg-notif-2' },
                'main-client-1',
            );

            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('promote: single notification for single enrollment in batch of 3', async () => {
            // 2 already enrolled, 1 fresh
            await insertUser({ mobile: '+15550310001' });
            await insertUser({ mobile: '+15550310002' });
            await insertUser({ mobile: '+15550310003' });
            await insertPromoteClient({ mobile: '+15550310001', clientId: 'main-client-1' });
            await insertBufferClient({ mobile: '+15550310002', clientId: 'main-client-1' });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                ['+15550310001', '+15550310002'],
                [{ clientId: 'main-client-1', totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(1);
            // Exactly 1 notification — not 3
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ENROLLMENT DOCUMENT CORRECTNESS
    // ═══════════════════════════════════════════════════════════════════════

    describe('Enrollment Document Correctness', () => {

        it('promote: enrolled doc has correct warmup fields', async () => {
            await insertUser({ mobile: '+15550320001', session: 'user-session-abc' });

            await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550320001', tgId: 'tg-doc-1' },
                'main-client-1',
            );

            const doc = await PromoteClientModel.findOne({ mobile: '+15550320001' }).lean();
            expect(doc).toBeTruthy();
            expect(doc!.warmupPhase).toBe('enrolled');
            expect(doc!.clientId).toBe('main-client-1');
            expect(doc!.status).toBe('active');
            expect(doc!.enrolledAt).toBeTruthy();
            expect(doc!.warmupJitter).toBeDefined();
            expect(typeof doc!.warmupJitter).toBe('number');
        });

        it('buffer: enrolled doc has correct warmup fields', async () => {
            await insertUser({ mobile: '+15550330001', session: 'user-session-def' });

            await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550330001', tgId: 'tg-doc-2' },
                'main-client-1',
            );

            const doc = await BufferClientModel.findOne({ mobile: '+15550330001' }).lean();
            expect(doc).toBeTruthy();
            expect(doc!.warmupPhase).toBe('enrolled');
            expect(doc!.clientId).toBe('main-client-1');
            expect(doc!.status).toBe('active');
            expect(doc!.enrolledAt).toBeTruthy();
            expect(doc!.warmupJitter).toBeDefined();
            expect(typeof doc!.warmupJitter).toBe('number');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // EDGE CASES
    // ═══════════════════════════════════════════════════════════════════════

    describe('Edge Cases', () => {

        it('promote: user with 2FA password is rejected (not enrolled)', async () => {
            mockGetClient.mockResolvedValueOnce({
                client: {},
                hasPassword: jest.fn().mockResolvedValue(true),
            });

            const result = await (promoteService as any).createPromoteClientFromUser(
                { mobile: '+15550340001', tgId: 'tg-edge-1' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(await PromoteClientModel.countDocuments({ mobile: '+15550340001' })).toBe(0);
            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('buffer: user with 2FA password is rejected (not enrolled)', async () => {
            mockGetClient.mockResolvedValueOnce({
                client: {},
                hasPassword: jest.fn().mockResolvedValue(true),
            });

            const result = await (bufferService as any).createBufferClientFromUser(
                { mobile: '+15550350001', tgId: 'tg-edge-2' },
                'main-client-1',
            );

            expect(result).toBe(false);
            expect(await BufferClientModel.countDocuments({ mobile: '+15550350001' })).toBe(0);
            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });

        it('promote: totalNeeded=0 results in no enrollments', async () => {
            await insertUser({ mobile: '+15550360001' });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 0, windowNeeds: [], totalActive: 0, totalNeededForCount: 0, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
            expect(result.attemptedCount).toBe(0);
        });

        it('promote: no eligible users results in zero enrollments', async () => {
            // No users in DB at all
            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 5, windowNeeds: [], totalActive: 0, totalNeededForCount: 5, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });

        it('promote: users with twoFA=true are not eligible candidates', async () => {
            await insertUser({ mobile: '+15550380001', twoFA: true });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });

        it('promote: expired users are not eligible candidates', async () => {
            await insertUser({ mobile: '+15550390001', expired: true });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });

        it('promote: recently active users are not eligible (lastActive filter)', async () => {
            // lastActive is recent — should be excluded by the 3-month cutoff
            await insertUser({ mobile: '+15550400001', lastActive: '2026-04-30' });

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });

        it('promote: users with too few chats are not eligible', async () => {
            await insertUser({ mobile: '+15550410001', totalChats: 50 }); // needs > 150

            const result = await (promoteService as any).addNewUserstoPromoteClientsDynamic(
                [],
                [],
                [{ clientId: 'main-client-1', totalNeeded: 1, windowNeeds: [], totalActive: 0, totalNeededForCount: 1, calculationReason: 'test', priority: 1 }],
                new Map(),
            );

            expect(result.createdCount).toBe(0);
        });
    });
});
