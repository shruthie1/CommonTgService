/**
 * Dynamic buffer supply — integration (real MongoDB memory server + real BufferClientService).
 *
 * 2026-10-24 incident: 6 clients sat at "healthyCount 20" with mostly harsh graduated accounts, so
 * enrolment never ran. Only Telegram-touching externals are stubbed (createBufferClientFromUser,
 * the users candidate query, sleep, bot notices).
 */
import { Connection, Model } from 'mongoose';
import { BufferClient, BufferClientSchema } from '../schemas/buffer-client.schema';
import { BufferClientService } from '../buffer-client.service';
import {
    MongoTestContext, startMongo, stopMongo, makeBufferClientData, resetCounter,
    mockBotsService, mockActiveChannelsService, mockChannelsService, mockSessionService,
} from '../../__tests__/api-test-helpers';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../../utils/bot-notice', () => ({
    sendBotNotice: jest.fn(() => Promise.resolve({ sent: true })),
}));

const DAY = 24 * 60 * 60 * 1000;

describe('buffer enrolment follows demand (integration)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let BufferClientModel: Model<BufferClient>;
    let service: BufferClientService;
    let usersService: any;
    let clientService: any;
    let createSpy: jest.SpyInstance;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('buffer-supply-integration');
        connection = ctx.connection;
        BufferClientModel = connection.model<BufferClient>('BufferClientSupply', BufferClientSchema);
        await BufferClientModel.init();
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    beforeEach(() => {
        resetCounter();
        delete process.env.BUFFER_SUPPLY_MODE;
        usersService = {
            search: jest.fn(async () => []),
            update: jest.fn(async () => 1),
            // 30 eligible candidate users.
            executeQuery: jest.fn(async () => Array.from({ length: 30 }, (_, i) => ({ mobile: `9188800${String(i).padStart(5, '0')}`, tgId: `tg-cand-${i}` }))),
            expireAccount: jest.fn(async () => undefined),
        };
        clientService = {
            findAll: jest.fn(async () => [
                { clientId: 'harsh-client', mobile: '15550000001' },
                { clientId: 'stocked-client', mobile: '15550000002' },
            ]),
            getActiveClientAssignment: jest.fn(async () => null),
        };
        const promoteClientService = {
            findAll: jest.fn(async () => []),
            existsByMobile: jest.fn(async () => false),
        };
        service = new BufferClientService(
            BufferClientModel as any,
            { hasActiveClientSetup: jest.fn(() => false) } as any,
            usersService,
            mockActiveChannelsService() as any,
            clientService,
            mockChannelsService() as any,
            promoteClientService as any,
            mockSessionService() as any,
            mockBotsService() as any,
        );
        createSpy = jest.spyOn(service as any, 'createBufferClientFromUser').mockResolvedValue(true);
    });

    afterEach(async () => {
        delete process.env.BUFFER_SUPPLY_MODE;
        await BufferClientModel.deleteMany({});
        jest.restoreAllMocks();
    });

    /** Graduated (READY), above the 200-channel floor, due — only the SpamBot state differs. */
    async function seedGraduated(clientId: string, count: number, spam: Record<string, unknown>, prefix: string) {
        const docs = Array.from({ length: count }, (_, i) => makeBufferClientData({
            mobile: `${prefix}${String(i).padStart(4, '0')}`,
            clientId,
            status: 'active',
            warmupPhase: 'ready',
            channels: 250,
            inUse: false,
            availableDate: '2026-01-01',
            enrolledAt: new Date(Date.now() - 60 * DAY), // schema default is now(): keep seeds out of the 7-day enrolment count
            ...spam,
        } as any));
        await BufferClientModel.insertMany(docs);
    }

    const enrolledFor = (clientId: string) => createSpy.mock.calls.filter((call) => call[1] === clientId).length;

    it('a client whose 20 graduated accounts are all harsh now enrols; a client with ample free stock does not', async () => {
        await seedGraduated('harsh-client', 20, { spamStatus: 'harsh', spamCheckedAt: new Date(), limitedUntil: null }, '1555100');
        await seedGraduated('stocked-client', 15, { spamStatus: 'free', spamCheckedAt: new Date(Date.now() - DAY), limitedUntil: null }, '1555200');

        await service.checkBufferClients();

        // Harsh accounts do not count: need = target 10 - 0 counted, inside the per-run budget of 10.
        expect(enrolledFor('harsh-client')).toBe(10);
        // 15 fresh-free graduates >= target 10 (no recent swaps) -> nothing to enrol.
        expect(enrolledFor('stocked-client')).toBe(0);
    });

    it('never-checked graduates do not hold the cap either', async () => {
        await seedGraduated('harsh-client', 20, {}, '1555300');
        await seedGraduated('stocked-client', 15, { spamStatus: 'free', spamCheckedAt: new Date(), limitedUntil: null }, '1555400');

        await service.checkBufferClients();

        expect(enrolledFor('harsh-client')).toBe(10);
        expect(enrolledFor('stocked-client')).toBe(0);
    });

    it('limited accounts count only when they lift inside the 30-day window', async () => {
        // 6 lift in 5 days (count), 4 lift in 45 days (do not), 10 harsh (do not): counted 6 -> need 4.
        await seedGraduated('harsh-client', 6, { spamStatus: 'limited', limitedUntil: new Date(Date.now() + 5 * DAY), spamCheckedAt: new Date() }, '1555500');
        await seedGraduated('harsh-client', 4, { spamStatus: 'limited', limitedUntil: new Date(Date.now() + 45 * DAY), spamCheckedAt: new Date() }, '1555510');
        await seedGraduated('harsh-client', 10, { spamStatus: 'harsh', spamCheckedAt: new Date() }, '1555520');
        await seedGraduated('stocked-client', 12, { spamStatus: 'free', spamCheckedAt: new Date(), limitedUntil: null }, '1555600');

        await service.checkBufferClients();

        expect(enrolledFor('harsh-client')).toBe(4);
        expect(enrolledFor('stocked-client')).toBe(0);
    });

    it('stops at the warmup engine ceiling: no enrolment once 46 accounts started warmup in 7 days', async () => {
        await seedGraduated('harsh-client', 20, { spamStatus: 'harsh', spamCheckedAt: new Date(), limitedUntil: null }, '1555700');
        // 46 recently-enrolled accounts on an unrelated client (inactive so they do not count as supply).
        await BufferClientModel.insertMany(Array.from({ length: 46 }, (_, i) => makeBufferClientData({
            mobile: `1555800${String(i).padStart(4, '0')}`, clientId: 'other', status: 'inactive', enrolledAt: new Date(Date.now() - DAY),
        } as any)));

        await service.checkBufferClients();

        expect(createSpy).not.toHaveBeenCalled();
    });

    it('sizes the target to the client\'s own swaps: 14 swaps in 14 days -> target 32', async () => {
        await seedGraduated('harsh-client', 20, { spamStatus: 'free', spamCheckedAt: new Date(), limitedUntil: null }, '1555900');
        // 14 ex-mains swapped out in the last 14 days (lastUsed), now inactive.
        await BufferClientModel.insertMany(Array.from({ length: 14 }, (_, i) => makeBufferClientData({
            mobile: `1556000${String(i).padStart(4, '0')}`, clientId: 'harsh-client', status: 'inactive', enrolledAt: new Date(Date.now() - 90 * DAY),
            lastUsed: new Date(Date.now() - (i + 1) * 0.9 * DAY),
        } as any)));
        await seedGraduated('stocked-client', 15, { spamStatus: 'free', spamCheckedAt: new Date(), limitedUntil: null }, '1556100');

        const plan = await service.buildBufferSupplyPlan(await clientService.findAll());
        const entry = plan.entries.find((e) => e.clientId === 'harsh-client')!;
        expect(entry).toMatchObject({ consumed: 14, target: 32, cap: 37, counted: 20, need: 12, allocated: 10 });
        expect(plan.entries.find((e) => e.clientId === 'stocked-client')).toMatchObject({ target: 10, need: 0, allocated: 0 });
        expect(plan.fleet).toMatchObject({ budget: 10, weeklyCeiling: 46 });
    });

    it('reports excluded accounts by reason and lists never-checked mobiles for a SpamBot check', async () => {
        await seedGraduated('harsh-client', 3, { spamStatus: 'harsh', spamCheckedAt: new Date() }, '1556200');
        await seedGraduated('harsh-client', 2, {}, '1556300');
        const plan = await service.buildBufferSupplyPlan([{ clientId: 'harsh-client' }]);
        const entry = plan.entries[0];
        expect(entry.excluded).toEqual({ harsh: 3, never_checked: 2 });
        expect(entry.needsSpamCheck.sort()).toEqual(['15563000000', '15563000001']);
        const table = service.buildSupplyPlanTable(plan)!;
        expect(table.columns).toContain('Harsh');
        expect(table.rows[0]).toEqual(['harsh-client', '0 (0f/0l/0w)', '3', '2', '0', '10/15', '10', '10']);
    });

    it('BUFFER_SUPPLY_MODE=legacy restores the old counting (harsh client stays blocked at 20/20)', async () => {
        process.env.BUFFER_SUPPLY_MODE = 'legacy';
        await seedGraduated('harsh-client', 20, { spamStatus: 'harsh', spamCheckedAt: new Date(), limitedUntil: null }, '1556400');

        await service.checkBufferClients();

        expect(enrolledFor('harsh-client')).toBe(0);
        const plan = await service.buildBufferSupplyPlan([{ clientId: 'harsh-client' }]);
        expect(plan).toMatchObject({ mode: 'legacy', invalidConfig: [] });
        expect(plan.entries[0]).toMatchObject({ counted: 20, cap: 20, allocated: 0 });
    });

    it('garbage config fails closed to the legacy behaviour', async () => {
        process.env.BUFFER_SUPPLY_MODE = 'dynamic';
        process.env.BUFFER_SUPPLY_MIN_TARGET = 'lots';
        try {
            await seedGraduated('harsh-client', 20, { spamStatus: 'harsh', spamCheckedAt: new Date(), limitedUntil: null }, '1556500');
            await service.checkBufferClients();
            expect(enrolledFor('harsh-client')).toBe(0);
            const plan = await service.buildBufferSupplyPlan([{ clientId: 'harsh-client' }]);
            expect(plan).toMatchObject({ mode: 'legacy', invalidConfig: ['BUFFER_SUPPLY_MIN_TARGET'] });
            expect(service.buildSupplyPlanTable(plan)!.title).toContain('bad config: BUFFER_SUPPLY_MIN_TARGET');
        } finally {
            delete process.env.BUFFER_SUPPLY_MIN_TARGET;
        }
    });
});
