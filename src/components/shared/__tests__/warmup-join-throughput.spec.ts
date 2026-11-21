/**
 * Warm-up + join throughput (owner 2026-11-21): warm-up must progress every day and spares supply
 * must cover demand. Red/green for every branch added that day:
 *   - warm-up run: due slot steps first, longest-waiting first; cap = due / runs left today;
 *     `warmup-health kind=run` summary; `kind=join_delegated`; `kind=stuck` (3 reasons).
 *   - join sweep: only growing (+ later phases below the floor) are picked, fairest first;
 *     `join-sweep kind=select` with pendingSkipped; bounded round (`kind=round budgetStop=true`)
 *     that rotates served mobiles to the back; a sweep during a round is deferred and topped up.
 *
 * Real MongoDB (memory server) + real BufferClientService; only Telegram externals are mocked.
 */
import { Connection, Model } from 'mongoose';
import { BufferClient, BufferClientSchema } from '../../buffer-clients/schemas/buffer-client.schema';
import { BufferClientService } from '../../buffer-clients/buffer-client.service';
import { WarmupPhase } from '../base-client.service';
import { JoinRequestSchema } from '../../join-requests/join-request.schema';
import {
    MongoTestContext, startMongo, stopMongo,
    makeBufferClientData, resetCounter,
    mockBotsService, mockActiveChannelsService, mockChannelsService, mockSessionService,
} from '../../__tests__/api-test-helpers';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import * as channelInfoModule from '../../../utils/telegram-utils/channelinfo';

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
jest.mock('../../../utils/isPermanentError', () => ({
    __esModule: true,
    default: jest.fn(() => false),
}));

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe('warm-up + join throughput (2026-11-21)', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let BufferClientModel: Model<BufferClient>;
    let service: BufferClientService;
    let activeChannelsService: ReturnType<typeof mockActiveChannelsService>;
    let channelsService: any;
    let telegramService: any;
    let logs: string[];

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('warmup-join-throughput-test');
        connection = ctx.connection;
        BufferClientModel = connection.model<BufferClient>('BufferClientThroughput', BufferClientSchema);
        await BufferClientModel.init();
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    beforeEach(() => {
        resetCounter();
        activeChannelsService = mockActiveChannelsService();
        channelsService = mockChannelsService();
        channelsService.getActiveChannels = jest.fn().mockResolvedValue([]);
        telegramService = { hasActiveClientSetup: jest.fn(() => false), tryJoiningChannel: jest.fn(async () => undefined), getChannelInfo: jest.fn(async () => ({ ids: [] })) };
        service = new BufferClientService(
            BufferClientModel as any,
            telegramService,
            { search: jest.fn(async () => []), update: jest.fn(async () => 1) } as any,
            activeChannelsService as any,
            {
                findAll: jest.fn(async () => [{ clientId: 'test-client-1', mobile: '15559999999' }]),
                getActiveClientAssignment: jest.fn(async () => null),
            } as any,
            channelsService as any,
            { findAll: jest.fn(async () => []), existsByMobile: jest.fn(async () => false), model: connection.model<any>('PromoteForThroughput', BufferClientSchema) } as any,
            mockSessionService() as any,
            mockBotsService() as any,
        );
        jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
        logs = [];
        const logger = (service as any).logger;
        for (const level of ['log', 'warn']) {
            jest.spyOn(logger, level).mockImplementation((...args: unknown[]) => { logs.push(String(args[0])); });
        }
    });

    afterEach(async () => {
        await BufferClientModel.deleteMany({});
        jest.restoreAllMocks();
    });

    const line = (prefix: string) => logs.filter((l) => l.startsWith(prefix));

    async function seed(mobile: string, fields: Record<string, unknown>) {
        await service.create(makeBufferClientData({ mobile, status: 'active', clientId: 'test-client-1' }));
        await BufferClientModel.collection.updateOne({ mobile }, { $set: { warmupJitter: 0, ...fields } });
    }

    const identityDone = (ago: number) => {
        const t = new Date(Date.now() - ago);
        return { privacyUpdatedAt: t, twoFASetAt: t, otherAuthsRemovedAt: t, profilePicsDeletedAt: t, nameBioUpdatedAt: t, usernameUpdatedAt: t };
    };

    const runWarmup = () => (service as any).runWarmupMaintenance({ otherPoolMobiles: async () => [], enrolAfterWarmup: jest.fn(async () => undefined) });

    // ── warm-up run ────────────────────────────────────────────────────────────

    describe('warm-up run', () => {
        it('sizes the cap from the due backlog over the runs left (20 due, last run -> 20 processed; old cap was 8)', async () => {
            for (let i = 0; i < 20; i++) {
                await seed(`1557100${String(i).padStart(4, '0')}`, { warmupPhase: WarmupPhase.ENROLLED, enrolledAt: new Date(Date.now() - (3 + i) * DAY) });
            }
            jest.spyOn(service as any, 'getWarmupRunsLeftToday').mockReturnValue(1);
            const processed: string[] = [];
            jest.spyOn(service, 'processClient').mockImplementation((async (doc: any) => { processed.push(doc.mobile); return { updateCount: 1, updateSummary: 'set_privacy' }; }) as any);

            await runWarmup();

            expect(processed).toHaveLength(20);
            // Longest-waiting first: enrolled 22 days ago (i = 19) goes first.
            expect(processed[0]).toBe('15571000019');
            expect(processed[19]).toBe('15571000000');
            expect(line('warmup-health kind=run')).toEqual([
                'warmup-health kind=run pool=buffer eligible=20 due=20 cap=20 runsLeft=1 mutated=20 failed=0 skipped=0 skippedCap=0 skippedSensitive=0 skippedOrganic=0 skippedHealthCap=0 skippedHealthBusy=0 skippedHealthRecent=0 organic=0 dbOnly=0 joinDelegated=0 joinNotQueued=0 byPhase=settling:20',
            ]);
        });

        it('first run of the day spreads the backlog: 40 due, 4 runs left -> cap 10, the rest counted as skippedCap', async () => {
            for (let i = 0; i < 40; i++) {
                await seed(`1557200${String(i).padStart(4, '0')}`, { warmupPhase: WarmupPhase.ENROLLED, enrolledAt: new Date(Date.now() - (3 + i) * HOUR * 24) });
            }
            jest.spyOn(service as any, 'getWarmupRunsLeftToday').mockReturnValue(4);
            jest.spyOn(service, 'processClient').mockResolvedValue({ updateCount: 1, updateSummary: 'set_privacy' } as any);

            await runWarmup();

            expect(service.processClient).toHaveBeenCalledTimes(10);
            expect(line('warmup-health kind=run')[0]).toContain('eligible=40 due=40 cap=10 runsLeft=4 mutated=10 failed=0 skipped=30 skippedCap=30');
        });

        it('puts a due slot step ahead of higher-phase non-slot work (growing join_channels goes after)', async () => {
            await seed('15573000001', { warmupPhase: WarmupPhase.GROWING, channels: 20, enrolledAt: new Date(Date.now() - 20 * DAY), ...identityDone(10 * DAY) });
            await seed('15573000002', { warmupPhase: WarmupPhase.ENROLLED, enrolledAt: new Date(Date.now() - 3 * DAY) });
            jest.spyOn(service as any, 'getWarmupRunsLeftToday').mockReturnValue(4);
            const order: string[] = [];
            jest.spyOn(service, 'processClient').mockImplementation((async (doc: any) => { order.push(doc.mobile); return { updateCount: 0 }; }) as any);

            await runWarmup();

            expect(order).toEqual(['15573000002', '15573000001']);
        });

        it('logs join_delegated for growing accounts and how many are not in the join queue', async () => {
            await seed('15574000001', { warmupPhase: WarmupPhase.GROWING, channels: 20, enrolledAt: new Date(Date.now() - 20 * DAY), ...identityDone(10 * DAY) });
            await seed('15574000002', { warmupPhase: WarmupPhase.GROWING, channels: 30, enrolledAt: new Date(Date.now() - 20 * DAY), ...identityDone(10 * DAY) });
            (service as any).joinChannelMap.set('15574000002', [{ channelId: 'c', username: 'c', canSendMsgs: true }]);

            await runWarmup();

            expect(line('warmup-health kind=join_delegated')).toEqual([
                'warmup-health kind=join_delegated pool=buffer accounts=2 queued=1 notQueued=1 joinBusy=false next=join-sweep',
            ]);
        });

        it('logs kind=stuck step_overdue for a due step not done >48 h after it became due (failure path)', async () => {
            // privacy 6 days ago -> set_2fa due 4 days ago.
            await seed('15575000001', { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(Date.now() - 8 * DAY), privacyUpdatedAt: new Date(Date.now() - 6 * DAY) });
            jest.spyOn(service, 'processClient').mockResolvedValue({ updateCount: 0 } as any);

            await runWarmup();

            expect(line('warmup-health kind=stuck')).toEqual([
                'warmup-health kind=stuck pool=buffer mobile=••••0001 phase=settling action=set_2fa reason=step_overdue days=4.0',
            ]);
            expect(line('warmup-health kind=run')[0]).toContain('mutated=0 failed=1');
        });

        it('does not log stuck for a step due less than 48 h ago, or one done this run', async () => {
            await seed('15575000002', { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(Date.now() - 8 * DAY), privacyUpdatedAt: new Date(Date.now() - 3 * DAY) }); // due 1 day ago, fails
            await seed('15575000003', { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(Date.now() - 8 * DAY), privacyUpdatedAt: new Date(Date.now() - 7 * DAY) }); // due 5 days ago, done
            jest.spyOn(service, 'processClient').mockImplementation((async (doc: any) => ({ updateCount: doc.mobile === '15575000003' ? 1 : 0 })) as any);

            await runWarmup();

            expect(line('warmup-health kind=stuck')).toEqual([]);
        });

        it('logs kind=stuck below_floor_past_deadline for growing > 30 days below the floor, and keeps it in growing', async () => {
            await seed('15576000001', { warmupPhase: WarmupPhase.GROWING, channels: 50, enrolledAt: new Date(Date.now() - 50 * DAY), ...identityDone(30 * DAY) });
            const actions: string[] = [];
            jest.spyOn(service, 'processClient').mockImplementation((async (_doc: any, _c: any, action: any) => { actions.push(`${action.phase}:${action.action}`); return { updateCount: 0 }; }) as any);

            await runWarmup();

            expect(actions).toEqual(['growing:join_channels']);
            expect(line('warmup-health kind=stuck')).toEqual([
                'warmup-health kind=stuck pool=buffer mobile=••••0001 phase=growing action=join_channels reason=below_floor_past_deadline channels=50 floor=200 days=36.0',
            ]);
        });

        it('logs kind=stuck no_channel_growth when a join_channels account has not gained a channel in >48 h', () => {
            const doc: any = { mobile: '15577000001', channels: 40, warmupPhase: WarmupPhase.GROWING, enrolledAt: new Date(Date.now() - 20 * DAY), warmupJitter: 0 };
            const entry = { doc, warmupAction: { phase: WarmupPhase.GROWING, action: 'join_channels', organicIntensity: 'light' } };
            const t0 = Date.now();
            expect((service as any).logWarmupStuck([entry], [], t0)).toBe(0);
            expect((service as any).logWarmupStuck([entry], [], t0 + 47 * HOUR)).toBe(0);
            expect((service as any).logWarmupStuck([entry], [], t0 + 49 * HOUR)).toBe(1);
            expect(line('warmup-health kind=stuck')).toEqual([
                'warmup-health kind=stuck pool=buffer mobile=••••0001 phase=growing action=join_channels reason=no_channel_growth channels=40 days=2.0',
            ]);
            // Growth resets the clock.
            expect((service as any).logWarmupStuck([{ ...entry, doc: { ...doc, channels: 45 } }], [], t0 + 60 * HOUR)).toBe(0);
        });
    });

    describe('warm-up run review fixes (2026-11-22)', () => {
        it('a full cap never blocks DB-only phase changes: identity -> growing (join eligible) and maturing -> ready', async () => {
            for (let i = 0; i < 8; i++) {
                await seed(`1558100${String(i).padStart(4, '0')}`, { warmupPhase: WarmupPhase.ENROLLED, enrolledAt: new Date(Date.now() - (3 + i) * DAY) });
            }
            // DB identity, every identity step done, past the growing threshold -> growing/join_channels.
            await seed('15582000001', { warmupPhase: WarmupPhase.IDENTITY, channels: 0, enrolledAt: new Date(Date.now() - 20 * DAY), ...identityDone(5 * DAY) });
            // Maturing, photo done, past the ready threshold, above the floor -> advance_to_ready.
            await seed('15582000002', { warmupPhase: WarmupPhase.MATURING, channels: 260, enrolledAt: new Date(Date.now() - 40 * DAY), ...identityDone(20 * DAY), profilePicsUpdatedAt: new Date(Date.now() - 10 * DAY) });
            jest.spyOn(service as any, 'getWarmupRunsLeftToday').mockReturnValue(4);
            const real = service.processClient.bind(service);
            jest.spyOn(service, 'processClient').mockImplementation((async (doc: any, client: any, action: any) => {
                if (action.action === 'set_privacy') return { updateCount: 1, updateSummary: 'set_privacy' };
                return real(doc, client, action);
            }) as any);

            await runWarmup();

            const idDoc: any = await BufferClientModel.collection.findOne({ mobile: '15582000001' });
            const matDoc: any = await BufferClientModel.collection.findOne({ mobile: '15582000002' });
            expect(idDoc.warmupPhase).toBe(WarmupPhase.GROWING);
            expect(matDoc.warmupPhase).toBe(WarmupPhase.READY);
            const eligible = await BufferClientModel.find({ status: 'active', channels: { $lt: 350 }, ...(service as any).getJoinCapacityEligibilityFilter() }).lean();
            expect(eligible.map((d: any) => d.mobile)).toContain('15582000001');
            expect(line('warmup-health kind=run')[0]).toContain('due=8 cap=8 runsLeft=4 mutated=8 failed=0 skipped=0 skippedCap=0');
            expect(line('warmup-health kind=run')[0]).toContain('dbOnly=2');
        });

        it('skipped= counts every skipped action, by kind (cap, health-check busy)', async () => {
            for (let i = 0; i < 10; i++) {
                await seed(`1558300${String(i).padStart(4, '0')}`, { warmupPhase: WarmupPhase.ENROLLED, enrolledAt: new Date(Date.now() - (3 + i) * DAY) });
            }
            jest.spyOn(service as any, 'getWarmupRunsLeftToday').mockReturnValue(4);
            jest.spyOn(service, 'processClient').mockResolvedValue({ updateCount: 1, updateSummary: 'set_privacy' } as any);

            await runWarmup();

            expect(line('warmup-health kind=run')[0]).toContain('due=10 cap=8 runsLeft=4 mutated=8 failed=0 skipped=2 skippedCap=2 skippedSensitive=0');
        });

        it('a session_rotated account busy in the join queue is counted as skippedHealthBusy', async () => {
            await seed('15583100001', { warmupPhase: WarmupPhase.SESSION_ROTATED, channels: 150, enrolledAt: new Date(Date.now() - 60 * DAY), ...identityDone(40 * DAY), profilePicsUpdatedAt: new Date(Date.now() - 30 * DAY) });
            (service as any).joinChannelMap.set('15583100001', [{ channelId: 'c', username: 'c', canSendMsgs: true }]);
            jest.spyOn(service, 'processClient').mockResolvedValue({ updateCount: 0 } as any);

            await runWarmup();

            expect(service.processClient).not.toHaveBeenCalled();
            expect(line('warmup-health kind=run')[0]).toContain('skipped=1 skippedCap=0 skippedSensitive=0 skippedOrganic=0 skippedHealthCap=0 skippedHealthBusy=1');
        });

        it('a failed sensitive step counts in full against the sensitive sub-cap: 15 due, 2 fail -> 13 attempts, 2 deferred', async () => {
            for (let i = 0; i < 15; i++) {
                // privacy done 5+i days ago -> set_2fa due; the oldest goes first.
                await seed(`1558400${String(i).padStart(4, '0')}`, { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(Date.now() - (10 + i) * DAY), privacyUpdatedAt: new Date(Date.now() - (5 + i) * HOUR * 24) });
            }
            jest.spyOn(service as any, 'getWarmupRunsLeftToday').mockReturnValue(1);
            let calls = 0;
            jest.spyOn(service, 'processClient').mockImplementation((async () => {
                calls++;
                return calls <= 2 ? { updateCount: 0 } : { updateCount: 1, updateSummary: 'set_2fa' };
            }) as any);

            await runWarmup();

            expect(calls).toBe(13);
            expect(line('warmup-health kind=run')[0]).toContain('due=15 cap=15 runsLeft=1 mutated=11 failed=2 skipped=2 skippedCap=0 skippedSensitive=2');
        });

        it('diagnoseWarmupPipeline simulates the real run: due-first order, DB-only past the cap, sensitive sub-cap', async () => {
            // 14 set_2fa due (sensitive) + 1 growing join_channels.
            for (let i = 0; i < 14; i++) {
                await seed(`1558500${String(i).padStart(4, '0')}`, { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(Date.now() - (10 + i) * DAY), privacyUpdatedAt: new Date(Date.now() - (5 + i) * DAY) });
            }
            await seed('15585100001', { warmupPhase: WarmupPhase.GROWING, channels: 20, enrolledAt: new Date(Date.now() - 20 * DAY), ...identityDone(10 * DAY) });
            jest.spyOn(service as any, 'getWarmupRunsLeftToday').mockReturnValue(1);

            const d: any = await service.diagnoseWarmupPipeline();

            expect(d.dueSlotActions).toBe(14);
            expect(d.effectiveUpdatesCap).toBe(14);
            expect(d.simulation.mutationsUsed).toBe(13);
            expect(d.simulation.totalSkippedSensitive).toBe(1);
            // Oldest due first; the join hand-off is still simulated.
            expect(d.top30WouldProcess[0].mobile).toBe('15585000013');
            expect(d.top30WouldProcess.map((e: any) => e.action)).toContain('join_channels');
        });
    });

    // ── join sweep ─────────────────────────────────────────────────────────────

    function stubTelegram(idsFor: (mobile: string) => string[] = () => []) {
        jest.spyOn(connectionManager, 'getClient').mockImplementation((async (mobile: string) => ({ client: { mobile } })) as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(channelInfoModule, 'channelInfo').mockImplementation((async (client: any) => ({
            ids: idsFor(client.mobile), canSendFalseCount: 0, canSendFalseChats: [],
        })) as any);
        activeChannelsService.getActiveChannels.mockResolvedValue([{ channelId: 'n1', username: 'n1', canSendMsgs: true }]);
    }

    describe('join sweep', () => {
        it('picks only growing and later-phase accounts below the floor; never enrolled/settling/identity', async () => {
            await seed('15578000001', { warmupPhase: WarmupPhase.ENROLLED, channels: 0 });
            await seed('15578000002', { warmupPhase: WarmupPhase.SETTLING, channels: 0 });
            await seed('15578000003', { warmupPhase: WarmupPhase.IDENTITY, channels: 0 });
            await seed('15578000004', { warmupPhase: WarmupPhase.GROWING, channels: 0 });
            await seed('15578000005', { warmupPhase: WarmupPhase.MATURING, channels: 150 });
            await seed('15578000006', { warmupPhase: WarmupPhase.MATURING, channels: 200 });
            await seed('15578000007', { warmupPhase: WarmupPhase.READY, channels: 199 });
            stubTelegram();

            await service.refillJoinQueue();

            // Recovery tier (ready below the floor) first, then warming accounts by fewest channels.
            expect([...(service as any).joinChannelMap.keys()]).toEqual(['15578000007', '15578000004', '15578000005']);
            expect(line('join-sweep kind=select')).toEqual([
                'join-sweep kind=select source=refill pool=buffer free=100 candidates=3 connects=3 picked=3 byPhase=growing:1,maturing:1,ready:1 capped=0 leave=0 pendingSkipped=0',
            ]);
        });

        it('sweep select line counts channels skipped for a pending join request', async () => {
            const JoinRequestModel = connection.model('JoinRequestThroughput', JoinRequestSchema, 'joinRequests_throughput');
            await JoinRequestModel.create({ mobile: '15579000001', channelId: 'pending1', pool: 'buffer', requestedAt: new Date() });
            await JoinRequestModel.create({ mobile: '15579000001', channelId: 'pending2', pool: 'buffer', requestedAt: new Date() });
            (service as any).joinRequestModel = JoinRequestModel;
            await seed('15579000001', { warmupPhase: WarmupPhase.GROWING, channels: 0 });
            stubTelegram();

            await service.joinchannelForBufferClients(true);

            const notIds = activeChannelsService.getActiveChannels.mock.calls[0][2] as string[];
            expect(notIds).toEqual(expect.arrayContaining(['pending1', 'pending2']));
            expect(line('join-sweep kind=select')).toEqual([
                'join-sweep kind=select source=sweep pool=buffer free=100 candidates=1 connects=1 picked=1 byPhase=growing:1 capped=0 leave=0 preserved=0 pendingSkipped=2',
            ]);
            await JoinRequestModel.deleteMany({});
        });

        it('a sweep during a join round is kept with its own arguments and run as a real sweep when the round ends', async () => {
            (service as any).isJoinChannelProcessing = true;
            const result = await service.joinchannelForBufferClients(false, 'test-client-1');
            expect(result).toContain('still processing');
            expect((service as any).pendingJoinSweep).toEqual({ skipExisting: false, clientId: 'test-client-1' });
            expect(line('join-sweep kind=deferred')).toEqual(['join-sweep kind=deferred pool=buffer reason=join_round_in_progress skipExisting=false clientId=test-client-1']);

            (service as any).isJoinChannelProcessing = false;
            (service as any).joinChannelMap.set('15579100001', [{ channelId: 'c', username: 'c', canSendMsgs: true }]);
            jest.spyOn(service as any, 'processJoinChannelSequentially').mockResolvedValue(undefined);
            const prepare = jest.spyOn(service as any, 'prepareJoinChannelRefresh').mockResolvedValue(new Set());
            const accounts = jest.spyOn(service as any, 'joinSweepAccounts').mockResolvedValue('swept');
            const refill = jest.spyOn(service, 'refillJoinQueue');
            jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);

            await (service as any).processJoinChannelInterval();

            expect(prepare).toHaveBeenCalledWith(false);
            expect(accounts.mock.calls[0][0]).toBe('test-client-1');
            expect(refill).not.toHaveBeenCalled();
            expect((service as any).pendingJoinSweep).toBeNull();
            expect(line('join-sweep kind=deferred_run')).toEqual(['join-sweep kind=deferred_run pool=buffer trigger=join_round_end skipExisting=false clientId=test-client-1 result="swept"']);
        });

        it('a deferred sweep is kept while a leave round still runs, then runs when the leave round ends', async () => {
            (service as any).pendingJoinSweep = { skipExisting: true, clientId: undefined };
            (service as any).isLeaveChannelProcessing = true;
            (service as any).joinChannelMap.set('15579110001', [{ channelId: 'c', username: 'c', canSendMsgs: true }]);
            jest.spyOn(service as any, 'processJoinChannelSequentially').mockResolvedValue(undefined);
            const sweep = jest.spyOn(service as any, 'runJoinSweep').mockResolvedValue('swept');
            jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);

            await (service as any).processJoinChannelInterval();

            expect(sweep).not.toHaveBeenCalled();
            expect((service as any).pendingJoinSweep).toEqual({ skipExisting: true, clientId: undefined });
            expect(line('join-sweep kind=deferred_kept')).toEqual(['join-sweep kind=deferred_kept pool=buffer trigger=join_round_end reason=leave_in_progress']);

            // The leave round ends (no join round running): the sweep runs now.
            (service as any).isLeaveChannelProcessing = false;
            (service as any).joinChannelMap.clear();
            (service as any).leaveChannelMap.set('15579110002', ['x']);
            jest.spyOn(service as any, 'processLeaveChannelSequentially').mockResolvedValue(undefined);
            jest.spyOn(service as any, 'scheduleNextLeaveRound').mockImplementation(() => undefined);

            await (service as any).processLeaveChannelInterval();

            expect(sweep).toHaveBeenCalledWith(true, undefined);
            expect((service as any).pendingJoinSweep).toBeNull();
            expect(line('join-sweep kind=deferred_run')[0]).toContain('trigger=leave_end');
        });

        it('holds the prepare lock while the deferred sweep runs: a cron sweep and a refill cannot run alongside it', async () => {
            (service as any).pendingJoinSweep = { skipExisting: true, clientId: undefined };
            const seen: Array<string | number> = [];
            jest.spyOn(service as any, 'prepareJoinChannelRefresh').mockImplementation(async () => {
                seen.push(await service.joinchannelForBufferClients(true));
                seen.push(await service.refillJoinQueue());
                return new Set();
            });
            jest.spyOn(service as any, 'joinSweepAccounts').mockResolvedValue('swept');

            expect(await (service as any).runDeferredJoinSweep('join_round_end')).toBe(true);

            expect(seen).toEqual(['Join-channel prepare already running, skipped', 0]);
            expect((service as any).isPrepareJoinChannelsProcessing).toBe(false);
        });

        it('a running sweep supersedes a pending one only when it covers its scope (all covers all; same client covers itself)', async () => {
            const run = (running: string | undefined, pendingClient: string | undefined) => {
                (service as any).isPrepareJoinChannelsProcessing = true;
                (service as any).runningJoinSweepScope = { clientId: running };
                (service as any).pendingJoinSweep = { skipExisting: true, clientId: pendingClient };
                return (service as any).runDeferredJoinSweep('join_round_end');
            };
            expect(await run(undefined, 'c1')).toBe(true);
            expect((service as any).pendingJoinSweep).toBeNull();
            expect(await run('c1', 'c1')).toBe(true);
            expect((service as any).pendingJoinSweep).toBeNull();
            expect(await run('c1', 'c2')).toBe(false);
            expect((service as any).pendingJoinSweep).toEqual({ skipExisting: true, clientId: 'c2' });
            expect(await run('c1', undefined)).toBe(false);
            expect((service as any).pendingJoinSweep).toEqual({ skipExisting: true, clientId: undefined });
            expect(line('join-sweep kind=deferred_superseded')).toHaveLength(2);
            expect(line('join-sweep kind=deferred_kept')).toEqual([
                'join-sweep kind=deferred_kept pool=buffer trigger=join_round_end reason=sweep_other_scope running=c1 pending=c2',
                'join-sweep kind=deferred_kept pool=buffer trigger=join_round_end reason=sweep_other_scope running=c1 pending=all',
            ]);
            (service as any).isPrepareJoinChannelsProcessing = false;
        });

        it('a client-scoped sweep keeps a pending sweep for another client; the lock scope is cleared after', async () => {
            (service as any).pendingJoinSweep = { skipExisting: false, clientId: 'other-client' };
            jest.spyOn(service as any, 'prepareJoinChannelRefresh').mockImplementation(async () => {
                expect((service as any).runningJoinSweepScope).toEqual({ clientId: 'test-client-1' });
                return new Set();
            });
            jest.spyOn(service as any, 'joinSweepAccounts').mockResolvedValue('swept');

            await service.joinchannelForBufferClients(true, 'test-client-1');

            expect((service as any).pendingJoinSweep).toEqual({ skipExisting: false, clientId: 'other-client' });
            expect((service as any).runningJoinSweepScope).toBeNull();
        });

        it('logs select_truncated when the candidate fetch returns the limit', async () => {
            (service as any).JOIN_CANDIDATE_FETCH_LIMIT = 2;
            for (let i = 0; i < 3; i++) await seed(`1557970000${i}`, { warmupPhase: WarmupPhase.GROWING, channels: i });
            stubTelegram();

            await service.refillJoinQueue();

            expect(line('join-sweep kind=select_truncated')).toEqual(['join-sweep kind=select_truncated limit=2']);
        });

        it('no select_truncated line below the limit', async () => {
            await seed('15579800001', { warmupPhase: WarmupPhase.GROWING, channels: 0 });
            stubTelegram();

            await service.refillJoinQueue();

            expect(line('join-sweep kind=select_truncated')).toEqual([]);
        });

        it('a full sweep supersedes a pending deferred one', async () => {
            (service as any).pendingJoinSweep = { skipExisting: false, clientId: 'x' };
            jest.spyOn(service as any, 'prepareJoinChannelRefresh').mockResolvedValue(new Set());
            jest.spyOn(service as any, 'joinSweepAccounts').mockResolvedValue('swept');

            await service.joinchannelForBufferClients(true);

            expect((service as any).pendingJoinSweep).toBeNull();
            expect(await (service as any).runDeferredJoinSweep('join_round_end')).toBe(false);
        });

        it('no deferred sweep -> no sweep or refill after the round', async () => {
            (service as any).joinChannelMap.set('15579200001', [{ channelId: 'c', username: 'c', canSendMsgs: true }]);
            jest.spyOn(service as any, 'processJoinChannelSequentially').mockResolvedValue(undefined);
            const refill = jest.spyOn(service, 'refillJoinQueue').mockResolvedValue(0);
            const sweep = jest.spyOn(service as any, 'runJoinSweep');
            const schedule = jest.spyOn(service as any, 'scheduleNextJoinRound').mockResolvedValue(undefined);

            await (service as any).processJoinChannelInterval();

            expect(refill).not.toHaveBeenCalled();
            expect(sweep).not.toHaveBeenCalled();
            expect(schedule).toHaveBeenCalledTimes(1);
        });

        it('refill connects at most the free slots and stops when the map is full', async () => {
            const map: Map<string, any[]> = (service as any).joinChannelMap;
            for (let i = 0; i < 98; i++) map.set(`1550000${String(i).padStart(4, '0')}`, [{ channelId: `q${i}`, username: `q${i}`, canSendMsgs: true }]);
            for (let i = 0; i < 5; i++) await seed(`1557950000${i}`, { warmupPhase: WarmupPhase.GROWING, channels: i });
            stubTelegram();

            const added = await service.refillJoinQueue();

            expect(added).toBe(2);
            expect((connectionManager.getClient as jest.Mock).mock.calls.map(([m]) => m)).toEqual(['15579500000', '15579500001']);
            expect(map.size).toBe(100);
            expect(line('join-sweep kind=select')[0]).toContain('free=2 candidates=5 connects=2 picked=2');

            // Full map: no candidates read, no connects.
            (connectionManager.getClient as jest.Mock).mockClear();
            expect(await service.refillJoinQueue()).toBe(0);
            expect(connectionManager.getClient).not.toHaveBeenCalled();
            expect(line('join-sweep kind=select')[1]).toContain('free=0 candidates=0 connects=0 picked=0');
        });

        it('recovery tier takes up to half the free slots (most channels first); the rest go to growing by fewest channels', async () => {
            const map: Map<string, any[]> = (service as any).joinChannelMap;
            for (let i = 0; i < 96; i++) map.set(`1550001${String(i).padStart(4, '0')}`, [{ channelId: `q${i}`, username: `q${i}`, canSendMsgs: true }]);
            await seed('15579600001', { warmupPhase: WarmupPhase.READY, channels: 100 });
            await seed('15579600002', { warmupPhase: WarmupPhase.SESSION_ROTATED, channels: 190 });
            await seed('15579600003', { warmupPhase: WarmupPhase.READY, channels: 150 });
            await seed('15579600004', { warmupPhase: WarmupPhase.GROWING, channels: 30 });
            await seed('15579600005', { warmupPhase: WarmupPhase.GROWING, channels: 0 });
            stubTelegram();

            await service.refillJoinQueue();

            // 4 free -> 2 recovery (190, 150), then growing 0, 30; ready 100 waits.
            expect((connectionManager.getClient as jest.Mock).mock.calls.map(([m]) => m))
                .toEqual(['15579600002', '15579600003', '15579600005', '15579600004']);
        });

        it('stops a round at the time budget, rotates served mobiles to the back, and logs the round', async () => {
            const map: Map<string, any[]> = (service as any).joinChannelMap;
            for (const m of ['15579300001', '15579300002', '15579300003']) map.set(m, [{ channelId: `c-${m}`, username: `u${m}`, canSendMsgs: true }]);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            let clock = 1_000_000;
            jest.spyOn(Date, 'now').mockImplementation(() => clock);
            telegramService.tryJoiningChannel.mockImplementation(async () => { clock += 151 * 60 * 1000; });

            await (service as any).processJoinChannelSequentially();

            expect(telegramService.tryJoiningChannel).toHaveBeenCalledTimes(1);
            // ...0001 was served and its queue emptied (removed); 0002/0003 lead the next round.
            expect([...map.keys()]).toEqual(['15579300002', '15579300003']);
            expect(line('join-sweep kind=round')[0]).toMatch(/^join-sweep kind=round pool=buffer picked=3 processed=1 byPhase=unknown:1 joined=1 requested=0 failed=0 capped=0 budgetStop=true elapsedMin=151 left=2$/);
        });

        it('rotation keeps a served mobile that still has channels queued, behind the unserved ones', async () => {
            const map: Map<string, any[]> = (service as any).joinChannelMap;
            const ch = (m: string, n: number) => Array.from({ length: n }, (_, i) => ({ channelId: `c-${m}-${i}`, username: `u${m}${i}`, canSendMsgs: true }));
            map.set('15579400001', ch('1', 10));
            map.set('15579400002', ch('2', 10));
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
            let clock = 1_000_000;
            jest.spyOn(Date, 'now').mockImplementation(() => clock);
            telegramService.tryJoiningChannel.mockImplementation(async () => { clock += 40 * 60 * 1000; });

            await (service as any).processJoinChannelSequentially();

            // 4 joins on ...0001 (40 min each) = 160 min >= 150: ...0002 not reached this round.
            expect(telegramService.tryJoiningChannel).toHaveBeenCalledTimes(4);
            expect([...map.keys()]).toEqual(['15579400002', '15579400001']);
            expect(line('join-sweep kind=round')[0]).toContain('processed=1');
            expect(line('join-sweep kind=round')[0]).toContain('budgetStop=true');
        });

        it('a round within budget processes everyone and reports budgetStop=false with join-request and failure counts', async () => {
            const map: Map<string, any[]> = (service as any).joinChannelMap;
            map.set('15579500001', [{ channelId: 'a', username: 'a', canSendMsgs: true }]);
            map.set('15579500002', [{ channelId: 'b', username: 'b', canSendMsgs: true }]);
            map.set('15579500003', [{ channelId: 'c', username: 'c', canSendMsgs: true }]);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
            jest.spyOn(service as any, 'recordJoinRequest').mockResolvedValue(undefined);
            telegramService.tryJoiningChannel
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(Object.assign(new Error('INVITE_REQUEST_SENT'), { errorMessage: 'INVITE_REQUEST_SENT' }))
                .mockRejectedValueOnce(new Error('network blip'));

            await (service as any).processJoinChannelSequentially();

            expect(line('join-sweep kind=round')[0]).toMatch(/processed=3 .*joined=1 requested=1 failed=1 capped=0 budgetStop=false/);
        });
    });
});
