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

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn(async () => { ledger.push('sleep'); }) };
});
jest.mock('../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../utils/logbots', () => ({ notifbot: jest.fn(() => 'https://example.test/bot') }));
jest.mock('../../../utils/bot-notice', () => ({ sendBotNotice: jest.fn(async () => ({ ok: true })) }));
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
        joinSweepSleepsPerAccount: 1,       // D38 (owner-gated pacing)
        joinSweepErrorWipesQueues: false,   // D39
        manualBulkEnrolCapsFromZero: true,  // D10
    },
    promote: {
        operationalFloor: 230,
        minTotalClients: 12,
        clientProcessingDelay: 8000,
        leaveChannelInterval: 60000,
        maxNewClientsPerTrigger: 10,
        legacyHealthyCap: 30,
        autoEnrolDocExtras: ['lastActive'],
        setAsChecksOtherPool: true,         // M1
        setAsSleepsAfterChannelInfo: false,
        setAsRequiresClientId: false,
        removeCanonicalisesMobile: true,
        removeInvalidMobileIsBadRequest: true, // M2
        createKeepsCallerLifecycle: false,
        warmupRunHealthChecksSessionRotated: false,
        joinSweepExcludesPrimaryMobiles: false,
        joinSweepSleepsPerAccount: 4,
        joinSweepErrorWipesQueues: false,   // M11
        manualBulkEnrolCapsFromZero: true,
    },
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
        __resetEnrollmentLocks();
        await bufferModel.deleteMany({});
        await promoteModel.deleteMany({});

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

        test('join sweep: primary-mobile exclusion and per-account pacing (D37/D38)', async () => {
            const svc = h.services[pool];
            await h.models[pool].create(poolDoc(pool, { mobile: MAIN_MOBILE, warmupPhase: WarmupPhase.GROWING, channels: 50 }));
            await h.models[pool].create(poolDoc(pool, { mobile: '919100000011', warmupPhase: WarmupPhase.GROWING, channels: 60 }));
            jest.spyOn(svc, 'fetchJoinCandidates').mockResolvedValue([]);

            await svc[pool === 'buffer' ? 'joinchannelForBufferClients' : 'joinchannelForPromoteClients'](true);

            const connected = ledger.filter((e) => e.startsWith('getClient:')).map((e) => e.slice('getClient:'.length));
            expect(connected.includes(MAIN_MOBILE)).toBe(!want.joinSweepExcludesPrimaryMobiles);
            // Sleeps: 1 in prepareJoinChannelRefresh + per-account sleeps (the last account skips the
            // inter-account gap on buffer only) + 1 trailing settle sleep.
            const accounts = connected.length;
            const perAccount = want.joinSweepSleepsPerAccount;
            const expectedSleeps = pool === 'buffer'
                ? 1 + (accounts - 1) * perAccount + 1
                : 1 + accounts * perAccount + 1;
            expect(ledger.filter((e) => e === 'sleep').length).toBe(expectedSleeps);
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
            expect(needs.map((n: any) => [n.clientId, n.totalNeeded])).toEqual([[CLIENT_ID, 3]]);
            if (want.manualBulkEnrolCapsFromZero) {
                expect(counted).toBeUndefined();
                expect(caps).toBeUndefined();
            }
        });
    });
});
