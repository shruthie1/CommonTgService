/**
 * Pool onboarding parity harness (docs/design/2026-10-27-pool-onboarding-unification.md, M0).
 *
 * Both pool services run through the SAME fixtures against a real (in-memory) Mongo. Every
 * per-pool difference is written down in CURRENT below, so a step that changes behaviour shows up
 * as a one-line diff there and a step that is meant to be a pure refactor must leave it untouched.
 *
 * The Telegram ledger records every Telegram-facing call (connect, hasPassword, channelInfo,
 * getChannelInfo, unregister) and every pacing sleep, in order. Refactor steps must keep it
 * byte-identical per pool.
 */
const ledger: string[] = [];
/** Every pacing value requested via ClientHelperUtils.gaussianRandom, as `mean/sd/min/max`. */
const pacing: string[] = [];
/** Every sleep duration requested, in order. */
const sleepMs: unknown[] = [];

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn(async (ms?: unknown) => { ledger.push('sleep'); sleepMs.push(ms); }) };
});
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/bot') }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(async () => ({ ok: true })) }));
jest.mock('../organic-activity', () => ({
    performOrganicActivity: jest.fn(async (_client: unknown, intensity: string) => { ledger.push(`organic:${intensity}`); }),
}));
jest.mock('../../Telegram/utils/connection-manager', () => ({
    connectionManager: {
        getClient: jest.fn(),
        unregisterClient: jest.fn(async (mobile: string) => { ledger.push(`unregister:${mobile}`); }),
        shutdown: jest.fn(async () => undefined),
    },
}));
jest.mock('../../../utils/telegram-utils/channelinfo', () => {
    const actual = jest.requireActual('../../../utils/telegram-utils/channelinfo');
    return { ...actual, channelInfo: jest.fn() };
});

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BufferClientService } from '../../buffer-clients/buffer-client.service';
import { PromoteClientService } from '../../promote-clients/promote-client.service';
import { BufferClientSchema } from '../../buffer-clients/schemas/buffer-client.schema';
import { PromoteClientSchema } from '../../promote-clients/schemas/promote-client.schema';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import { channelInfo } from '../../../utils/telegram-utils/channelinfo';
import { WarmupPhase } from '../base-client.service';
import { __resetEnrollmentLocks } from '../enrollment-lock';
import { ClientHelperUtils } from '../client-helper.utils';

type Pool = 'buffer' | 'promote';

/**
 * Today's per-pool behaviour. Each key is one tracker row (ID in the comment). A behaviour step
 * flips exactly the keys it owns; a refactor step flips none.
 */
export const CURRENT = {
    buffer: {
        operationalFloor: 200,              // D16
        minTotalClients: 10,                // D16
        clientProcessingDelay: 10000,       // D16 (owner-gated pacing)
        leaveChannelInterval: 120000,       // D16 (owner-gated pacing)
        maxNewClientsPerTrigger: 10,
        legacyHealthyCap: 20,               // D13
        autoEnrolDocExtras: [] as string[], // D18
        setAsChecksOtherPool: true,         // D6
        setAsSleepsAfterChannelInfo: true,  // D6/M1 note: buffer setAs sleeps 5-10s after channelInfo
        setAsRequiresClientId: true,        // D8
        removeCanonicalisesMobile: true,    // D23 (the schema setter also canonicalises query values)
        removeInvalidMobileIsBadRequest: true, // D23
        createKeepsCallerLifecycle: false,  // D21 (deferred to master-plan W-E)
        warmupRunHealthChecksSessionRotated: true, // D32/D34 (owner-gated)
        joinSweepExcludesPrimaryMobiles: true,     // D37
        joinSweepSleepsPerAccount: 4,       // D38, Q3 2026-10-27 (was 1; 3 promote sleeps + gap, gap after the last too)
        joinSweepErrorWipesQueues: false,   // D39
        manualBulkEnrolCapsFromZero: false, // D10 (M12 commit)
        warmupRunHealthCheckConnects: 20,   // owner 2026-10-27: per-run cap on health-check connects
    },
    promote: {
        operationalFloor: 230,
        minTotalClients: 12,
        clientProcessingDelay: 10000,       // Q3 2026-10-27 (was 8000)
        leaveChannelInterval: 120000,       // Q3 2026-10-27 (was 60000)
        maxNewClientsPerTrigger: 10,
        legacyHealthyCap: 30,
        autoEnrolDocExtras: ['lastActive'],
        setAsChecksOtherPool: true,         // M1
        setAsSleepsAfterChannelInfo: true,  // Q3 2026-10-27 (was false)
        setAsRequiresClientId: false,
        removeCanonicalisesMobile: true,
        removeInvalidMobileIsBadRequest: true, // M2
        createKeepsCallerLifecycle: false,
        warmupRunHealthChecksSessionRotated: true, // Q2 2026-10-27 (was false)
        joinSweepExcludesPrimaryMobiles: false,
        joinSweepSleepsPerAccount: 4,
        joinSweepErrorWipesQueues: false,   // M11
        manualBulkEnrolCapsFromZero: false, // D10 (M12 commit)
        warmupRunHealthCheckConnects: 4,    // Q2 2026-10-27: promote share of the per-run cap (was 0)
    },
};

const SETAS_PERMANENT_ERROR: Record<Pool, { message: string; status: number }> = {
    buffer: { message: 'USER_DEACTIVATED_BAN', status: 500 },
    promote: { message: 'USER_DEACTIVATED_BAN', status: 500 },
};

const MAIN_MOBILE = '919000000001';
const CLIENT_ID = 'c1';

interface Harness {
    buffer: BufferClientService;
    promote: PromoteClientService;
    models: Record<Pool, Model<any>>;
    services: Record<Pool, any>;
    users: Array<Record<string, any>>;
    usersService: any;
    telegramService: any;
    clients: Array<{ clientId: string; mobile: string }>;
}

describe('pool onboarding parity (buffer vs promote)', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let bufferModel: Model<any>;
    let promoteModel: Model<any>;
    let h: Harness;

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        const realGaussian = ClientHelperUtils.gaussianRandom.bind(ClientHelperUtils);
        jest.spyOn(ClientHelperUtils, 'gaussianRandom').mockImplementation((...args: number[]) => {
            pacing.push(args.join('/'));
            return (realGaussian as (...a: number[]) => number)(...args);
        });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'poolParity' }).asPromise();
        bufferModel = connection.model('ParityBuffer', BufferClientSchema);
        promoteModel = connection.model('ParityPromote', PromoteClientSchema);
        await bufferModel.init();
        await promoteModel.init();
    }, 60_000);

    afterAll(async () => {
        if (connection) { await connection.dropDatabase(); await connection.close(); }
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        ledger.length = 0;
        pacing.length = 0;
        sleepMs.length = 0;
        __resetEnrollmentLocks();
        await bufferModel.deleteMany({});
        await promoteModel.deleteMany({});
        await connection.collection('poolEnrolmentClaims').deleteMany({});

        const users: Array<Record<string, any>> = [];
        const clients = [{ clientId: CLIENT_ID, mobile: MAIN_MOBILE }];
        const usersService = {
            search: jest.fn(async (q: { mobile?: string }) => users.filter((u) => !q.mobile || u.mobile === q.mobile)),
            executeQuery: jest.fn(async (q: any, _sort: any, limit?: number) => {
                const nin: string[] = q?.mobile?.$nin || [];
                return users
                    .filter((u) => !nin.includes(u.mobile) && !u.expired && !u.twoFA)
                    .sort((a, b) => String(a.tgId).localeCompare(String(b.tgId)))
                    .slice(0, limit ?? users.length);
            }),
            expireAccount: jest.fn(async () => undefined),
            update: jest.fn(async () => 1),
        };
        const telegramService = {
            hasActiveClientSetup: jest.fn(() => false),
            getActiveClientSetupMobiles: jest.fn(() => []),
            getChannelInfo: jest.fn(async (mobile: string) => { ledger.push(`getChannelInfo:${mobile}`); return { ids: ['a', 'b', 'c'] }; }),
        };
        const clientService = {
            findAll: jest.fn(async () => clients),
            getActiveClientAssignment: jest.fn(async () => null),
        };
        const botsService = { sendMessageByCategory: jest.fn(async () => undefined) };
        const deps = (other: any) => [telegramService, usersService, {}, clientService, {}, other, {}, botsService] as const;

        // Wire the two services to each other the way Nest's forwardRef does.
        const bufferRef: any = {};
        const promoteRef: any = {};
        const buffer = new BufferClientService(bufferModel as any, ...(deps(promoteRef) as unknown as [any, any, any, any, any, any, any, any]));
        const promote = new PromoteClientService(promoteModel as any, ...(deps(bufferRef) as unknown as [any, any, any, any, any, any, any, any]));
        Object.setPrototypeOf(bufferRef, buffer); Object.setPrototypeOf(promoteRef, promote);
        for (const svc of [buffer, promote] as any[]) {
            jest.spyOn(svc, 'sendAccountNotice').mockResolvedValue(true);
        }

        (connectionManager.getClient as jest.Mock).mockImplementation(async (mobile: string) => {
            ledger.push(`getClient:${mobile}`);
            return {
                client: { mobile },
                hasPassword: jest.fn(async () => { ledger.push(`hasPassword:${mobile}`); return users.find((u) => u.mobile === mobile)?.foreign2FA === true; }),
            };
        });
        (channelInfo as jest.Mock).mockImplementation(async (client: { mobile: string }) => {
            ledger.push(`channelInfo:${client.mobile}`);
            return { chatsArrayLength: 3, canSendTrueCount: 3, canSendFalseCount: 0, ids: ['a', 'b', 'c'], canSendFalseChats: [] };
        });

        h = {
            buffer, promote,
            models: { buffer: bufferModel, promote: promoteModel },
            services: { buffer, promote },
            users, usersService, telegramService, clients,
        };
    });

    const addUser = (mobile: string, extra: Record<string, unknown> = {}) => {
        h.users.push({ mobile, tgId: `tg-${mobile}`, session: `sess-${mobile}`, expired: false, twoFA: false, ...extra });
    };
    const other = (pool: Pool): Pool => (pool === 'buffer' ? 'promote' : 'buffer');
    const autoEnrol = (pool: Pool, need = 1) => {
        const needs = [{ clientId: CLIENT_ID, totalNeeded: need, windowNeeds: [], totalActive: 0, totalNeededForCount: need, calculationReason: 'test', priority: 1 }];
        return pool === 'buffer'
            ? h.buffer.addNewUserstoBufferClientsDynamic([], [], needs)
            : h.promote.addNewUserstoPromoteClientsDynamic([], [], needs);
    };
    const setAs = (pool: Pool, mobile: string) => (pool === 'buffer'
        ? h.buffer.setAsBufferClient(mobile, CLIENT_ID)
        : h.promote.setAsPromoteClient(mobile, CLIENT_ID));
    const poolDoc = (pool: Pool, extra: Record<string, unknown> = {}) => ({
        tgId: `tg-${extra.mobile}`, session: `sess-${extra.mobile}`, lastActive: 'default', availableDate: '2026-10-01',
        channels: 50, clientId: CLIENT_ID, status: 'active', warmupPhase: WarmupPhase.SETTLING, ...extra,
    });

    describe('cross-pool invariants (both pools at once)', () => {
        test('M1: concurrent setAsBufferClient + setAsPromoteClient for one mobile leaves exactly one pool doc', async () => {
            addUser('919100000020');
            // Barrier: neither connect returns until both calls have passed their up-front checks,
            // which is the real race (the Telegram round-trip sits between check and write).
            const base = (connectionManager.getClient as jest.Mock).getMockImplementation()!;
            let arrived = 0;
            let release!: () => void;
            const bothArrived = new Promise<void>((resolve) => { release = resolve; });
            (connectionManager.getClient as jest.Mock).mockImplementation(async (mobile: string, opts: unknown) => {
                arrived += 1;
                if (arrived === 2) release();
                await bothArrived;
                return base(mobile, opts);
            });
            const results = await Promise.allSettled([setAs('buffer', '919100000020'), setAs('promote', '919100000020')]);
            expect(arrived).toBe(2);
            const docs = (await h.models.buffer.countDocuments({ mobile: '919100000020' }))
                + (await h.models.promote.countDocuments({ mobile: '919100000020' }));
            expect(docs).toBe(1);
            const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
            expect(rejected).toHaveLength(1);
            expect(rejected[0].reason).toMatchObject({ status: 400 });
        });
    });

    describe('M12 promote enrolment budget', () => {
        test('scheduled promote run hands the batch no more than the weekly engine budget', async () => {
            const svc: any = h.promote;
            // 45 enrolled in the last 7 days (all inactive so they do not count as healthy supply):
            // weekly ceiling 46 -> 1 slot left this week.
            await h.models.promote.insertMany(Array.from({ length: 45 }, (_, i) => poolDoc('promote', {
                mobile: `9195000${String(i).padStart(5, '0')}`, status: 'inactive', enrolledAt: new Date(Date.now() - 864e5),
            })));
            jest.spyOn(svc, 'processClient').mockResolvedValue({ updateCount: 0 });
            jest.spyOn(svc, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'test', priority: 1 });
            const dyn = jest.spyOn(svc, 'addNewUserstoPromoteClientsDynamic').mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
            jest.spyOn(svc, 'sendPromoteCheckSummaryNotification').mockResolvedValue(undefined);

            await svc._checkPromoteClientsInternal();

            const needs = dyn.mock.calls[0][2] as any[];
            expect(needs.reduce((sum, n) => sum + n.totalNeeded, 0)).toBe(1);
        });

        test('with budget to spare the scheduled promote run is unchanged (need 3 -> 3)', async () => {
            const svc: any = h.promote;
            jest.spyOn(svc, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'test', priority: 1 });
            const dyn = jest.spyOn(svc, 'addNewUserstoPromoteClientsDynamic').mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
            jest.spyOn(svc, 'sendPromoteCheckSummaryNotification').mockResolvedValue(undefined);
            await svc._checkPromoteClientsInternal();
            expect((dyn.mock.calls[0][2] as any[]).map((n) => n.totalNeeded)).toEqual([3]);
        });
    });

    describe.each(['buffer', 'promote'] as Pool[])('%s', (pool) => {
        const want = CURRENT[pool];

        test('config values (D13/D16)', () => {
            const svc = h.services[pool];
            expect(svc.config.operationalChannelThreshold).toBe(want.operationalFloor);
            expect(svc.config.minTotalClients).toBe(want.minTotalClients);
            expect(svc.config.clientProcessingDelay).toBe(want.clientProcessingDelay);
            expect(svc.config.leaveChannelInterval).toBe(want.leaveChannelInterval);
            expect(svc.config.maxNewClientsPerTrigger).toBe(want.maxNewClientsPerTrigger);
            expect(svc[pool === 'buffer' ? 'MAX_HEALTHY_BUFFER_CLIENTS_PER_CLIENT' : 'MAX_HEALTHY_PROMOTE_CLIENTS_PER_CLIENT']).toBe(want.legacyHealthyCap);
        });

        test('auto-enrol: Telegram ledger, pacing and stored fields (D4/D18/D25)', async () => {
            addUser('919100000001');
            const result = await autoEnrol(pool);
            expect(result.createdCount).toBe(1);
            expect(ledger).toEqual([
                'getClient:919100000001', 'hasPassword:919100000001', 'channelInfo:919100000001',
                'sleep', 'unregister:919100000001', 'sleep',
            ]);
            const doc = await h.models[pool].findOne({ mobile: '919100000001' }).lean<any>();
            expect(doc).toMatchObject({
                tgId: 'tg-919100000001', session: 'sess-919100000001', clientId: CLIENT_ID, channels: 3,
                status: 'active', message: 'Enrolled for warmup', warmupPhase: WarmupPhase.ENROLLED, lastUsed: null,
            });
            expect(doc.enrolledAt).toBeInstanceOf(Date);
            expect(typeof doc.warmupJitter).toBe('number');
            const extras = ['lastActive'].filter((k) => k in doc && doc[k] !== undefined);
            expect(extras).toEqual(want.autoEnrolDocExtras);
            if (pool === 'promote') expect(Number.isNaN(Date.parse(doc.lastActive))).toBe(false);
        });

        test('auto-enrol: a foreign 2FA is probed, flagged on users and skipped (D4)', async () => {
            addUser('919100000002', { foreign2FA: true });
            const result = await autoEnrol(pool);
            expect(result.createdCount).toBe(0);
            expect(ledger).toEqual(['getClient:919100000002', 'hasPassword:919100000002', 'unregister:919100000002', 'sleep']);
            expect(h.usersService.update).toHaveBeenCalledWith('tg-919100000002', { twoFA: true });
            expect(await h.models[pool].countDocuments({})).toBe(0);
        });

        test('auto-enrol: a mobile already in the other pool is skipped with no Telegram call (D5)', async () => {
            addUser('919100000003');
            await h.models[other(pool)].create(poolDoc(other(pool), { mobile: '919100000003' }));
            const result = await autoEnrol(pool);
            expect(result.createdCount).toBe(0);
            expect(ledger.filter((e) => !e.startsWith('sleep'))).toEqual([]);
            expect(await h.models[pool].countDocuments({})).toBe(0);
        });

        test('auto-enrol: permanent Telegram error retires the source user (D24, characterisation)', async () => {
            addUser('919100000030');
            (channelInfo as jest.Mock).mockImplementationOnce(async (client: { mobile: string }) => {
                ledger.push(`channelInfo:${client.mobile}`);
                throw new Error('SESSION_REVOKED');
            });
            const result = await autoEnrol(pool);
            expect(result).toEqual({ createdCount: 0, attemptedCount: 1, createdEntries: [] });
            expect(ledger).toEqual(['getClient:919100000030', 'hasPassword:919100000030', 'channelInfo:919100000030', 'unregister:919100000030', 'sleep']);
            expect(h.usersService.expireAccount).toHaveBeenCalledTimes(1);
            expect(h.usersService.expireAccount.mock.calls[0][0]).toBe('919100000030');
            expect(await h.models[pool].countDocuments({})).toBe(0);
        });

        test('auto-enrol: other pool lands during the Telegram round-trip -> re-check under the lock skips the write (D5, characterisation)', async () => {
            addUser('919100000031');
            (channelInfo as jest.Mock).mockImplementationOnce(async (client: { mobile: string }) => {
                ledger.push(`channelInfo:${client.mobile}`);
                await h.models[other(pool)].create(poolDoc(other(pool), { mobile: '919100000031' }));
                return { chatsArrayLength: 3, canSendTrueCount: 3, canSendFalseCount: 0, ids: ['a'], canSendFalseChats: [] };
            });
            const result = await autoEnrol(pool);
            expect(result.createdCount).toBe(0);
            expect(ledger).toEqual(['getClient:919100000031', 'hasPassword:919100000031', 'channelInfo:919100000031', 'sleep', 'unregister:919100000031', 'sleep']);
            expect(await h.models[pool].countDocuments({})).toBe(0);
            expect(h.services[pool].sendAccountNotice).not.toHaveBeenCalled();
        });

        test('auto-enrol: success notice (characterisation)', async () => {
            addUser('919100000032');
            await autoEnrol(pool);
            const notice = (h.services[pool].sendAccountNotice as jest.Mock).mock.calls[0][0];
            expect(notice.title).toBe(pool === 'buffer' ? 'Buffer enrolled' : 'Promote enrolled');
            expect(notice.fields.map((f: any) => [f.label, f.value])).toEqual([
                ['Client ID', CLIENT_ID], ['Mobile', '919100000032'], ['Available date', expect.any(String)],
                ['Channels', 3], ['Warmup phase', WarmupPhase.ENROLLED], ['Source TG ID', 'tg-919100000032'],
            ]);
        });

        test('enrolment batch: per-client cap projection and candidate order (D1/D13, characterisation)', async () => {
            for (const m of ['919300000003', '919300000001', '919300000002']) addUser(m);
            const needs = [{ clientId: CLIENT_ID, totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 't', priority: 1 }];
            const counted = new Map([[CLIENT_ID, want.legacyHealthyCap - 1]]);
            const result = pool === 'buffer'
                ? await h.buffer.addNewUserstoBufferClientsDynamic([], ['919300000001'], needs, counted)
                : await h.promote.addNewUserstoPromoteClientsDynamic([], ['919300000001'], needs, counted);
            expect(result.createdEntries).toEqual([{ clientId: CLIENT_ID, mobile: '919300000002' }]);
            const [query, sort, limit] = h.usersService.executeQuery.mock.calls[0];
            expect(query).toEqual({ mobile: { $nin: ['919300000001'] }, expired: false, twoFA: false, lastActive: { $lt: expect.any(String) }, totalChats: { $gt: 150 } });
            expect(sort).toEqual({ tgId: 1 });
            expect(limit).toBe(8);
        });

        test('setAs*: Telegram ledger and pacing (D6)', async () => {
            addUser('919100000004');
            await setAs(pool, '919100000004');
            expect(ledger).toEqual(want.setAsSleepsAfterChannelInfo
                ? ['getClient:919100000004', 'getChannelInfo:919100000004', 'sleep', 'unregister:919100000004']
                : ['getClient:919100000004', 'getChannelInfo:919100000004', 'unregister:919100000004']);
            const doc = await h.models[pool].findOne({ mobile: '919100000004' }).lean<any>();
            expect(doc).toMatchObject({ warmupPhase: WarmupPhase.ENROLLED, clientId: CLIENT_ID, status: 'active', channels: 3 });
        });

        test('setAs*: messages, stored doc, pacing values and errors (D8/D9, characterisation)', async () => {
            const B = pool === 'buffer';
            await expect(setAs(pool, '919100000060')).rejects.toMatchObject({ message: B ? 'user not found' : 'User not found', status: 400 });
            addUser('919100000061', { session: '  ' });
            await expect(setAs(pool, '919100000061')).rejects.toMatchObject({
                message: `User session missing; cannot create ${B ? 'BufferClient' : 'PromoteClient'}`, status: 400 });
            addUser('919100000062');
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000062' }));
            await expect(setAs(pool, '919100000062')).rejects.toMatchObject({
                message: B ? 'BufferClient already exist' : 'PromoteClient already exists', status: 409 });

            addUser('919100000063');
            pacing.length = 0;
            expect(await setAs(pool, '919100000063')).toBe(B ? 'Client enrolled as buffer successfully' : 'Client enrolled as promote successfully');
            const doc = await h.models[pool].findOne({ mobile: '919100000063' }).lean<any>();
            expect(doc).toMatchObject({
                tgId: 'tg-919100000063', session: 'sess-919100000063', availableDate: expect.any(String), channels: 3,
                clientId: CLIENT_ID, status: 'active', message: 'Enrolled for warmup', lastUsed: null, warmupPhase: WarmupPhase.ENROLLED,
            });
            expect(doc.lastActive).toBe(B ? undefined : 'default');
            expect(pacing).toEqual(['7500/1250/5000/10000', '3.5/2/0/7']); // pacing sleep (both pools since Q3), then warmup jitter

            // Permanent Telegram error: source user retired with the pool's reason, HTTP error rethrown.
            addUser('919100000064');
            (h.telegramService.getChannelInfo as jest.Mock).mockImplementationOnce(async () => { throw Object.assign(new Error('USER_DEACTIVATED_BAN'), { errorMessage: 'USER_DEACTIVATED_BAN' }); });
            const err = await setAs(pool, '919100000064').catch((e) => e);
            expect(err.constructor.name).toBe('HttpException');
            expect(h.usersService.expireAccount).toHaveBeenCalledWith('919100000064', B ? 'Permanent error during buffer enrollment' : 'Permanent error during promote enrollment');
            expect({ message: err.message, status: err.status }).toEqual(SETAS_PERMANENT_ERROR[pool]);
            expect(await h.models[pool].countDocuments({ mobile: '919100000064' })).toBe(0);

            // A plain error (no errorMessage): the HTTP message carries the parseError prefix, which only buffer passes.
            addUser('919100000067');
            (h.telegramService.getChannelInfo as jest.Mock).mockImplementationOnce(async () => { throw new Error('boom'); });
            const plain = await setAs(pool, '919100000067').catch((e) => e);
            expect(String(plain.message)).toMatch(/ :: boom$/);
            expect(String(plain.message).includes(' - Failed to set as Buffer Client 919100000067 :: ')).toBe(B);
        });

        test('setAs*: clientId omitted (D8, characterisation)', async () => {
            h.clients.push({ clientId: 'c2', mobile: '919000000002' });
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000065', clientId: CLIENT_ID }));
            addUser('919100000066');
            await (pool === 'buffer' ? h.buffer.setAsBufferClient('919100000066', undefined as any) : h.promote.setAsPromoteClient('919100000066'));
            const doc = await h.models[pool].findOne({ mobile: '919100000066' }).lean<any>();
            // buffer: the controller requires clientId; the service stores what it is given. promote: fewest active -> c2.
            expect(doc.clientId ?? null).toBe(pool === 'buffer' ? null : 'c2');
        });

        test('setAs*: a mobile already in the other pool (D6)', async () => {
            addUser('919100000005');
            await h.models[other(pool)].create(poolDoc(other(pool), { mobile: '919100000005' }));
            const attempt = setAs(pool, '919100000005');
            if (want.setAsChecksOtherPool) {
                await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
                expect(ledger).toEqual([]);
                expect(await h.models[pool].countDocuments({ mobile: '919100000005' })).toBe(0);
            } else {
                await attempt;
                expect(await h.models[pool].countDocuments({ mobile: '919100000005' })).toBe(1);
            }
        });

        test('setAs*: the live main mobile is refused (D6)', async () => {
            addUser(MAIN_MOBILE);
            await expect(setAs(pool, MAIN_MOBILE)).rejects.toBeInstanceOf(BadRequestException);
            expect(ledger).toEqual([]);
        });

        test('remove(): "+"-prefixed mobile (D23)', async () => {
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000006' }));
            const attempt = h.services[pool].remove('+919100000006');
            if (want.removeCanonicalisesMobile) {
                await attempt;
                expect(await h.models[pool].countDocuments({ mobile: '919100000006' })).toBe(0);
                const { sendBotNotice } = jest.requireMock('../../../utils/bot-notice');
                const mobiles = (sendBotNotice as jest.Mock).mock.calls
                    .flatMap((c: any[]) => c[1].fields).filter((f: any) => f.label === 'Mobile').map((f: any) => f.value);
                expect(mobiles).toEqual(['919100000006']);
            } else {
                await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
                expect(await h.models[pool].countDocuments({ mobile: '919100000006' })).toBe(1);
            }
        });

        test('remove(): malformed mobile error class (D23)', async () => {
            const attempt = h.services[pool].remove('12ab');
            if (want.removeInvalidMobileIsBadRequest) {
                await expect(attempt).rejects.toMatchObject({ status: 400 });
            } else {
                await expect(attempt).rejects.not.toMatchObject({ status: 400 });
            }
        });

        test('M13: a live claim held by the other pool\'s process blocks every enrolment write (D5/D6)', async () => {
            const otherCollection = other(pool) === 'buffer' ? 'bufferClients' : 'promoteClients';
            const claims = connection.collection('poolEnrolmentClaims');
            for (const m of ['919100000030', '919100000031', '919100000032']) {
                await claims.insertOne({ mobile: m, pool: otherCollection, at: new Date() });
            }
            addUser('919100000030');
            addUser('919100000031');
            const auto = await autoEnrol(pool);
            expect(auto.createdCount).toBe(0);
            await expect(setAs(pool, '919100000031')).rejects.toMatchObject({ status: 400 });
            await expect(h.services[pool].create(poolDoc(pool, { mobile: '919100000032' }))).rejects.toMatchObject({ status: 400 });
            expect(await h.models[pool].countDocuments({})).toBe(0);
            // The other process's claims are untouched (never deleted, never taken over while live).
            expect(await claims.countDocuments({ pool: otherCollection })).toBe(3);
        });

        test('M13: an own-pool enrolment leaves a released (not deleted) claim', async () => {
            addUser('919100000033');
            expect((await autoEnrol(pool)).createdCount).toBe(1);
            const claim = await connection.collection('poolEnrolmentClaims').findOne({ mobile: '919100000033' });
            expect(claim).toMatchObject({ pool: pool === 'buffer' ? 'bufferClients' : 'promoteClients' });
            expect((claim as any).at.getTime()).toBe(0);
        });

        test('updateStatus / markAs*: stored fields and notices (D43, characterisation)', async () => {
            const label = pool === 'buffer' ? 'Buffer' : 'Promote';
            const bots = (h.services[pool] as any).botsService.sendMessageByCategory as jest.Mock;
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000040', inUse: true }));

            await h.services[pool].markAsInactive('919100000040', 'gone');
            let doc = await h.models[pool].findOne({ mobile: '919100000040' }).lean<any>();
            expect(doc).toMatchObject({ status: 'inactive', inUse: false, message: 'gone' });
            expect(bots.mock.calls).toEqual([[ 'ACCOUNT_NOTIFICATIONS', {
                title: `${label} status`,
                fields: [
                    { label: 'Mobile', value: '919100000040' },
                    { label: 'New status', value: 'inactive', code: false },
                    { label: 'Reason', value: 'gone', code: false },
                ],
            } ]]);

            // Idempotent: already inactive or missing -> no write, no notice.
            bots.mockClear();
            expect(await h.services[pool].markAsInactive('919100000040', 'again')).toMatchObject({ message: 'gone' });
            expect(await h.services[pool].markAsInactive('919100000049', 'none')).toBeNull();
            expect(bots).not.toHaveBeenCalled();

            await h.services[pool].markAsActive('919100000040');
            doc = await h.models[pool].findOne({ mobile: '919100000040' }).lean<any>();
            expect(doc).toMatchObject({ status: 'active', inUse: false, message: 'Account is functioning properly' });

            // updateStatus without a message keeps the stored message and notices '-'.
            bots.mockClear();
            await h.services[pool].updateStatus('919100000040', 'active');
            doc = await h.models[pool].findOne({ mobile: '919100000040' }).lean<any>();
            expect(doc.message).toBe('Account is functioning properly');
            expect(bots.mock.calls[0][1].fields[2]).toEqual({ label: 'Reason', value: '-', code: false });

            // Failure: error notice, then rethrow.
            bots.mockClear();
            await expect(h.services[pool].updateStatus('919100000048', 'inactive', 'x')).rejects.toBeDefined();
            expect(bots.mock.calls).toHaveLength(1);
            expect(bots.mock.calls[0][1]).toMatchObject({
                severity: 'error', title: 'Status failed',
                fields: [
                    { label: 'Mobile', value: '919100000048' },
                    { label: 'Attempted status', value: 'inactive', code: false },
                    { label: 'Reason', value: 'x', code: false },
                    { label: 'Error', code: false },
                ],
            });
        });

        const nameBioClient = (overrides: Record<string, unknown> = {}) => ({
            clientId: CLIENT_ID, dbcoll: 'c1', firstNames: ['Asha', 'Bina'], bufferLastNames: ['Bk'], promoteLastNames: ['Pk'],
            bios: ['hello'], profilePics: [], ...overrides,
        }) as any;
        const nameBioTelegram = (opts: { getMeError?: Error } = {}) => {
            (connectionManager.getClient as jest.Mock).mockImplementation(async (mobile: string) => {
                ledger.push(`getClient:${mobile}`);
                return {
                    getMe: jest.fn(async () => { if (opts.getMeError) throw opts.getMeError; ledger.push('getMe'); return { firstName: 'Old' }; }),
                    client: {
                        invoke: jest.fn(async (req: any) => {
                            const name = req?.className || req?.constructor?.name;
                            if (name === 'users.GetFullUser') { ledger.push('GetFullUser'); return { users: [{ lastName: '' }], fullUser: { about: '' } }; }
                            ledger.push(`${name}:${JSON.stringify({ firstName: req.firstName, lastName: req.lastName, about: req.about })}`);
                            return true;
                        }),
                    },
                };
            });
        };

        test('updateNameAndBio: Telegram ledger, pool surname and stored fields (D30, characterisation)', async () => {
            nameBioTelegram();
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000050', warmupPhase: WarmupPhase.IDENTITY }));
            const doc = await h.models[pool].findOne({ mobile: '919100000050' });
            const surname = pool === 'buffer' ? 'Bk' : 'Pk';
            const count = await h.services[pool].updateNameAndBio(doc as any, nameBioClient(), 0);
            expect(count).toBe(2);
            const stored = await h.models[pool].findOne({ mobile: '919100000050' }).lean<any>();
            expect(stored.assignedLastName).toBe(surname);
            expect(stored.assignedBio).toBe('hello');
            expect(['Asha', 'Bina']).toContain(stored.assignedFirstName);
            expect(stored.nameBioUpdatedAt).toBeInstanceOf(Date);
            expect(stored).toMatchObject({ failedUpdateAttempts: 0, lastUpdateFailure: null });
            expect(ledger).toEqual([
                'getClient:919100000050', 'organic:medium', 'getMe', 'sleep', 'GetFullUser',
                'organic:medium', `account.UpdateProfile:${JSON.stringify({ firstName: stored.assignedFirstName, lastName: surname })}`, 'sleep',
                'organic:light', 'sleep', `account.UpdateProfile:${JSON.stringify({ about: 'hello' })}`,
                'sleep', 'unregister:919100000050',
            ]);
        });

        test('updateNameAndBio: persona taken in the other pool is not reused (D30, characterisation)', async () => {
            nameBioTelegram();
            const surname = pool === 'buffer' ? 'Bk' : 'Pk';
            for (const first of ['Asha', 'Bina']) {
                ledger.length = 0;
                await h.models.buffer.deleteMany({}); await h.models.promote.deleteMany({});
                await h.models[other(pool)].create(poolDoc(other(pool), {
                    mobile: '919100000052', assignedFirstName: first, assignedLastName: surname, assignedBio: 'hello', assignedProfilePics: [],
                }));
                await h.models[pool].create(poolDoc(pool, { mobile: '919100000051', warmupPhase: WarmupPhase.IDENTITY }));
                const doc = await h.models[pool].findOne({ mobile: '919100000051' });
                await h.services[pool].updateNameAndBio(doc as any, nameBioClient(), 0);
                const stored = await h.models[pool].findOne({ mobile: '919100000051' }).lean<any>();
                expect(stored.assignedFirstName).toBe(first === 'Asha' ? 'Bina' : 'Asha');
            }
        });

        test('updateNameAndBio: a Telegram error counts a failure and still unregisters (D30, characterisation)', async () => {
            nameBioTelegram({ getMeError: new Error('boom') });
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000053', warmupPhase: WarmupPhase.IDENTITY }));
            const doc = await h.models[pool].findOne({ mobile: '919100000053' });
            expect(await h.services[pool].updateNameAndBio(doc as any, nameBioClient(), 2)).toBe(0);
            const stored = await h.models[pool].findOne({ mobile: '919100000053' }).lean<any>();
            expect(stored.failedUpdateAttempts).toBe(3);
            expect(stored.lastUpdateFailure).toBeInstanceOf(Date);
            expect(stored.status).toBe('active');
            expect(ledger).toEqual(['getClient:919100000053', 'organic:medium', 'unregister:919100000053']);
        });

        test('updateNameAndBio: no persona pool on the client marks the step done (D30, characterisation)', async () => {
            nameBioTelegram();
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000054', warmupPhase: WarmupPhase.IDENTITY }));
            const doc = await h.models[pool].findOne({ mobile: '919100000054' });
            expect(await h.services[pool].updateNameAndBio(doc as any, nameBioClient({ firstNames: [], bufferLastNames: [], promoteLastNames: [], bios: [] }), 0)).toBe(1);
            expect(ledger).toEqual(['getClient:919100000054', 'organic:medium', 'getMe', 'sleep', 'sleep', 'unregister:919100000054']);
        });

        test('create(): caller-supplied lifecycle fields (D21)', async () => {
            const rotatedAt = new Date('2026-09-01T00:00:00Z');
            await h.services[pool].create({
                ...poolDoc(pool, { mobile: '919100000007' }),
                warmupPhase: WarmupPhase.SESSION_ROTATED,
                sessionRotatedAt: rotatedAt,
            });
            const doc = await h.models[pool].findOne({ mobile: '919100000007' }).lean<any>();
            if (want.createKeepsCallerLifecycle) {
                expect(doc.warmupPhase).toBe(WarmupPhase.SESSION_ROTATED);
                expect(new Date(doc.sessionRotatedAt).toISOString()).toBe(rotatedAt.toISOString());
            } else {
                expect(doc.warmupPhase).toBe(WarmupPhase.ENROLLED);
                expect(doc.sessionRotatedAt).toBeNull();
            }
        });

        test('warmup run: which phases enter the loop (D32/D34)', async () => {
            const svc = h.services[pool];
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000008', warmupPhase: WarmupPhase.SESSION_ROTATED, channels: 300 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000009', warmupPhase: WarmupPhase.READY, channels: 300 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000010', warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(Date.now() - 3 * 864e5) }));
            const health = jest.spyOn(svc, 'performHealthCheck').mockResolvedValue({ passed: true, performed: true });
            const processed = jest.spyOn(svc, 'processClient').mockResolvedValue({ updateCount: 0 });
            jest.spyOn(svc, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 0, windowNeeds: [], totalActive: 0, totalNeededForCount: 0, calculationReason: 'test', priority: 1 });
            jest.spyOn(svc, pool === 'buffer' ? 'addNewUserstoBufferClientsDynamic' : 'addNewUserstoPromoteClientsDynamic').mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
            jest.spyOn(svc, pool === 'buffer' ? 'sendBufferCheckSummaryNotification' : 'sendPromoteCheckSummaryNotification').mockResolvedValue(undefined);

            await svc[pool === 'buffer' ? '_checkBufferClientsInternal' : '_checkPromoteClientsInternal']();

            const processedMobiles = processed.mock.calls.map((c: any[]) => c[0].mobile).sort();
            const healthMobiles = health.mock.calls.map((c: any[]) => c[0]);
            if (want.warmupRunHealthChecksSessionRotated) {
                expect(healthMobiles).toEqual(['919100000008']);
                expect(processedMobiles).toEqual(['919100000008', '919100000010']);
            } else {
                expect(healthMobiles).toEqual([]);
                expect(processedMobiles).toEqual(['919100000010']);
            }
            expect(ledger.filter((e) => !e.startsWith('sleep'))).toEqual([]);
        });

        test('warmup run: health-check connects capped per run, the rest deferred oldest-checked-first (owner 2026-10-27)', async () => {
            const svc = h.services[pool];
            const day = 24 * 60 * 60 * 1000;
            const now = Date.now();
            // 24 session_rotated accounts all due a check: 4 never checked, then lastChecked 30..11 days ago.
            const mobiles: string[] = [];
            for (let i = 0; i < 24; i++) {
                const mobile = `9191000002${String(i).padStart(2, '0')}`;
                mobiles.push(mobile);
                await h.models[pool].create(poolDoc(pool, {
                    mobile, warmupPhase: WarmupPhase.SESSION_ROTATED, channels: 300, enrolledAt: new Date(now - 40 * day),
                    sessionRotatedAt: new Date(now - 20 * day), lastChecked: i < 4 ? null : new Date(now - (34 - i) * day),
                }));
            }
            jest.spyOn(svc, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 0, windowNeeds: [], totalActive: 0, totalNeededForCount: 0, calculationReason: 'test', priority: 1 });
            jest.spyOn(svc, pool === 'buffer' ? 'addNewUserstoBufferClientsDynamic' : 'addNewUserstoPromoteClientsDynamic').mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
            jest.spyOn(svc, pool === 'buffer' ? 'sendBufferCheckSummaryNotification' : 'sendPromoteCheckSummaryNotification').mockResolvedValue(undefined);
            const run = async () => {
                ledger.length = 0;
                await svc[pool === 'buffer' ? '_checkBufferClientsInternal' : '_checkPromoteClientsInternal']();
                return ledger.filter((e) => e.startsWith('getClient:')).map((e) => e.slice('getClient:'.length));
            };

            const cap = want.warmupRunHealthCheckConnects;
            const first = await run();
            // Never-checked first, then oldest lastChecked: the newest-checked accounts wait.
            expect(first).toEqual(mobiles.slice(0, cap));
            const second = await run();
            // Checked accounts are no longer due; the deferred ones go next run (nothing starves).
            expect(second).toEqual(mobiles.slice(cap, cap * 2));
        });

        test('join sweep: primary-mobile exclusion and per-account pacing (D37/D38)', async () => {
            const svc = h.services[pool];
            await h.models[pool].create(poolDoc(pool, { mobile: MAIN_MOBILE, warmupPhase: WarmupPhase.GROWING, channels: 50 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000011', warmupPhase: WarmupPhase.GROWING, channels: 60 }));
            jest.spyOn(svc, 'fetchJoinCandidates').mockResolvedValue([]);

            await svc[pool === 'buffer' ? 'joinchannelForBufferClients' : 'joinchannelForPromoteClients'](true);

            const connected = ledger.filter((e) => e.startsWith('getClient:')).map((e) => e.slice('getClient:'.length));
            expect(connected.includes(MAIN_MOBILE)).toBe(!want.joinSweepExcludesPrimaryMobiles);
            // Sleeps: 1 in prepareJoinChannelRefresh + per-account sleeps (both pools gap after the
            // last account too since Q3) + 1 trailing settle sleep.
            const accounts = connected.length;
            const perAccount = want.joinSweepSleepsPerAccount;
            const expectedSleeps = 1 + accounts * perAccount + 1;
            expect(ledger.filter((e) => e === 'sleep').length).toBe(expectedSleeps);
        });

        test('join sweep + refill: golden trace of Telegram calls, sleeps, draws, timers and writes (D36/D37/D40, characterisation)', async () => {
            const svc = h.services[pool];
            const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.5);
            const timers: number[] = [];
            jest.spyOn(svc, 'createTimeout').mockImplementation(((_cb: unknown, ms: number) => { timers.push(ms); return undefined; }) as any);
            const fetchCalls: unknown[] = [];
            jest.spyOn(svc, 'fetchJoinCandidates').mockImplementation(async (...args: any[]) => {
                fetchCalls.push(args);
                return [{ channelId: `ch-${args[0]}`, username: `u${args[0]}`, title: 't', participantsCount: 5000, canSendMsgs: true }];
            });
            (channelInfo as jest.Mock).mockImplementation(async (client: { mobile: string }) => {
                ledger.push(`channelInfo:${client.mobile}`);
                if (client.mobile === '919100000072') throw Object.assign(new Error('USER_DEACTIVATED_BAN'), { errorMessage: 'USER_DEACTIVATED_BAN' });
                if (client.mobile === '919100000071') {
                    return { chatsArrayLength: 12, canSendTrueCount: 0, canSendFalseCount: 12, ids: Array.from({ length: 70 }, (_, i) => `c${i}`), canSendFalseChats: Array.from({ length: 12 }, (_, i) => `l${i}`) };
                }
                return { chatsArrayLength: 3, canSendTrueCount: 3, canSendFalseCount: 0, ids: ['a', 'b', 'c'], canSendFalseChats: [] };
            });
            await h.models[pool].create(poolDoc(pool, { mobile: MAIN_MOBILE, warmupPhase: WarmupPhase.GROWING, channels: 50 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000070', warmupPhase: WarmupPhase.GROWING, channels: 60 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000071', warmupPhase: WarmupPhase.GROWING, channels: 70 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000072', warmupPhase: WarmupPhase.GROWING, channels: 80 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000073', warmupPhase: WarmupPhase.SESSION_ROTATED, channels: 150 }));

            const snapshot = async (result: unknown) => {
                const docs = await h.models[pool].find({}, { _id: 0, mobile: 1, channels: 1, status: 1 }).sort({ mobile: 1 }).lean();
                const out = {
                    result, ledger: [...ledger], sleepMs: [...sleepMs], gaussian: [...pacing], timers: [...timers],
                    fetchCalls: fetchCalls.map((c: any) => [c[0], c[1], c[2]]),
                    joinQueue: [...svc.joinChannelMap.keys()].sort(), leaveQueue: [...svc.leaveChannelMap.keys()].sort(), docs,
                };
                ledger.length = 0; sleepMs.length = 0; pacing.length = 0; timers.length = 0; fetchCalls.length = 0;
                return out;
            };
            try {
                ledger.length = 0; sleepMs.length = 0; pacing.length = 0;
                const sweep = await snapshot(await svc[pool === 'buffer' ? 'joinchannelForBufferClients' : 'joinchannelForPromoteClients'](true));
                svc.joinChannelMap.clear(); svc.leaveChannelMap.clear();
                await h.models[pool].updateOne({ mobile: '919100000070' }, { $set: { channels: 60 } });
                const refill = await snapshot(await svc.refillJoinQueue());
                const trace = { sweep, refill };
                const file = require('path').join(__dirname, 'fixtures', `join-sweep-trace.${pool}.json`);
                if (process.env.CAPTURE_JOIN_TRACE) require('fs').writeFileSync(file, JSON.stringify(trace, null, 2) + '\n');
                expect(JSON.parse(JSON.stringify(trace))).toEqual(JSON.parse(require('fs').readFileSync(file, 'utf8')));
            } finally {
                rnd.mockRestore();
            }
        });

        test('warmup run: golden trace of selection, order, health checks, enrolment call and summary (D32/D34/M9, characterisation)', async () => {
            const svc = h.services[pool];
            const B = pool === 'buffer';
            const day = 24 * 60 * 60 * 1000;
            const now = Date.now();
            const mk = (mobile: string, extra: Record<string, unknown>) => h.models[pool].create(poolDoc(pool, { mobile, ...extra }));
            await mk('919100000080', { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(now - 5 * day) });
            await mk('919100000081', { warmupPhase: WarmupPhase.ENROLLED, enrolledAt: new Date(now - 3 * day) });
            await mk('919100000082', { warmupPhase: WarmupPhase.GROWING, channels: 120, enrolledAt: new Date(now - 10 * day) });
            await mk('919100000083', { warmupPhase: WarmupPhase.READY, channels: 300, enrolledAt: new Date(now - 30 * day) });
            await mk('919100000084', { warmupPhase: WarmupPhase.SESSION_ROTATED, channels: 300, enrolledAt: new Date(now - 30 * day) });
            await mk('919100000085', { warmupPhase: WarmupPhase.SETTLING, inUse: true, enrolledAt: new Date(now - 5 * day) });
            await mk('919100000086', { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(now - 5 * day) });
            await h.models[pool].collection.updateOne({ mobile: '919100000086' }, { $unset: { warmupPhase: '' } });
            await mk(MAIN_MOBILE, { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(now - 5 * day) });
            await mk('919100000087', { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(now - 5 * day), lastUpdateAttempt: new Date(now - 60 * 1000) });
            await mk('919100000088', { warmupPhase: WarmupPhase.SETTLING, enrolledAt: new Date(now - 5 * day), clientId: 'unknown-client' });

            const processed: unknown[] = [];
            jest.spyOn(svc, 'processClient').mockImplementation((async (doc: any, client: any, action: any) => {
                processed.push([doc.mobile, client.clientId, action.action]);
                return { updateCount: 1, updateSummary: `did ${action.action}` };
            }) as any);
            const health: string[] = [];
            jest.spyOn(svc, 'performHealthCheck').mockImplementation((async (mobile: string) => { health.push(mobile); return { passed: true }; }) as any);
            const enrolCalls: unknown[] = [];
            jest.spyOn(svc, B ? 'addNewUserstoBufferClientsDynamic' : 'addNewUserstoPromoteClientsDynamic').mockImplementation((async (...args: any[]) => {
                enrolCalls.push({
                    first: args[0], goodIds: [...args[1]].sort(),
                    needs: args[2].map((n: any) => [n.clientId, n.totalNeeded, n.priority]),
                    counted: args[3] ? [...args[3].entries()].sort() : null,
                    caps: args[4] ? [...args[4].entries()].sort() : null,
                });
                return { createdCount: 2, attemptedCount: 3, createdEntries: [{ clientId: CLIENT_ID, mobile: 'new' }] };
            }) as any);
            const summaries: unknown[] = [];
            jest.spyOn(svc, B ? 'sendBufferCheckSummaryNotification' : 'sendPromoteCheckSummaryNotification').mockImplementation((async (...args: any[]) => {
                summaries.push(args.slice(0, 5));
            }) as any);

            ledger.length = 0; sleepMs.length = 0; pacing.length = 0;
            await svc[B ? '_checkBufferClientsInternal' : '_checkPromoteClientsInternal']();
            const docs = await h.models[pool].find({}, { _id: 0, mobile: 1, warmupPhase: 1, status: 1 }).sort({ mobile: 1 }).lean();
            const trace = { processed, health, enrolCalls, summaries, ledger: [...ledger], sleepMs: [...sleepMs], gaussian: [...pacing], docs };
            const file = require('path').join(__dirname, 'fixtures', `warmup-run-trace.${pool}.json`);
            if (process.env.CAPTURE_WARMUP_TRACE) require('fs').writeFileSync(file, JSON.stringify(trace, null, 2) + '\n');
            expect(JSON.parse(JSON.stringify(trace))).toEqual(JSON.parse(require('fs').readFileSync(file, 'utf8')));
        });

        test('join sweep: an unexpected error and the queued joins of other accounts (D39)', async () => {
            const svc = h.services[pool];
            svc.joinChannelMap.set('919100000012', [{ channelId: 'x' }]);
            jest.spyOn(svc, 'findPrioritizedJoinCandidates').mockRejectedValue(new Error('mongo blip'));

            await expect(svc[pool === 'buffer' ? 'joinchannelForBufferClients' : 'joinchannelForPromoteClients'](true)).rejects.toThrow();

            expect(svc.joinChannelMap.has('919100000012')).toBe(!want.joinSweepErrorWipesQueues);
            expect(svc.isPrepareJoinChannelsProcessing).toBe(false);
        });

        test('healthy-for-cap floor (D14)', () => {
            const svc = h.services[pool];
            const fn = (svc[pool === 'buffer' ? 'isHealthyBufferClientForCap' : 'isHealthyPromoteClientForCap'] as Function).bind(svc);
            const now = Date.now();
            expect(fn({ warmupPhase: WarmupPhase.SESSION_ROTATED, channels: want.operationalFloor }, now)).toBe(true);
            expect(fn({ warmupPhase: WarmupPhase.SESSION_ROTATED, channels: want.operationalFloor - 1 }, now)).toBe(false);
            expect(fn({ warmupPhase: WarmupPhase.SETTLING, failedUpdateAttempts: 3 }, now)).toBe(false);
            expect(fn({ warmupPhase: WarmupPhase.SETTLING, failedUpdateAttempts: 0 }, now)).toBe(true);
        });

        test('manual bulk enrol: per-client cap counted from zero (D10)', async () => {
            const svc = h.services[pool];
            for (let i = 0; i < 3; i++) addUser(`91920000000${i}`);
            jest.spyOn(svc, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'test', priority: 1 });
            const dyn = jest.spyOn(svc, pool === 'buffer' ? 'addNewUserstoBufferClientsDynamic' : 'addNewUserstoPromoteClientsDynamic')
                .mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });

            await svc[pool === 'buffer' ? 'addNewUserstoBufferClients' : 'addNewUserstoPromoteClients']([], [], [CLIENT_ID]);

            const [, , needs, counted, caps] = dyn.mock.calls[0] as any[];
            if (want.manualBulkEnrolCapsFromZero) {
                expect(needs.map((n: any) => [n.clientId, n.totalNeeded])).toEqual([[CLIENT_ID, 3]]);
                expect(counted).toBeUndefined();
                expect(caps).toBeUndefined();
            } else {
                // Same plan as the scheduled run: live counts (and buffer's dynamic caps) are passed.
                expect(counted).toBeInstanceOf(Map);
                if (pool === 'buffer') expect(caps).toBeInstanceOf(Map);
                expect(needs.every((n: any) => n.clientId === CLIENT_ID && n.totalNeeded > 0)).toBe(true);
            }
        });

        test('manual bulk enrol: a client already at its cap gets nothing (D10, red/green)', async () => {
            const svc = h.services[pool];
            const cap = pool === 'buffer' ? 60 : want.legacyHealthyCap;
            await h.models[pool].insertMany(Array.from({ length: cap }, (_, i) => poolDoc(pool, {
                mobile: `9194000${String(i).padStart(5, '0')}`, warmupPhase: WarmupPhase.SETTLING,
            })));
            jest.spyOn(svc, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({ totalNeeded: 3, windowNeeds: [], totalActive: 0, totalNeededForCount: 3, calculationReason: 'test', priority: 1 });
            const dyn = jest.spyOn(svc, pool === 'buffer' ? 'addNewUserstoBufferClientsDynamic' : 'addNewUserstoPromoteClientsDynamic')
                .mockResolvedValue({ createdCount: 0, attemptedCount: 0, createdEntries: [] });
            await svc[pool === 'buffer' ? 'addNewUserstoBufferClients' : 'addNewUserstoPromoteClients']([], [], [CLIENT_ID]);
            const passed = dyn.mock.calls.length === 0 ? 0 : (dyn.mock.calls[0][2] as any[]).reduce((sum, n) => sum + n.totalNeeded, 0);
            const capOf = dyn.mock.calls.length === 0 ? cap : ((dyn.mock.calls[0][4] as Map<string, number> | undefined)?.get(CLIENT_ID) ?? want.legacyHealthyCap);
            const counted = dyn.mock.calls.length === 0 ? cap : ((dyn.mock.calls[0][3] as Map<string, number> | undefined)?.get(CLIENT_ID) ?? 0);
            // Whatever reaches the batch must not be able to push the client past its cap.
            expect(Math.min(passed, Math.max(0, capOf - counted))).toBe(0);
        });
    });
});
