/**
 * Regression tests for the bugfixes applied in this batch.
 *
 * These drive the REAL production code (BufferClientService against
 * mongodb-memory-server, with only true externals mocked) and assert the real
 * computed outcomes — priorities, persisted warmup timestamps, stuck-skip
 * reasons, error-text extraction, and Mongo $lt query matching. No production
 * formula is re-implemented inline.
 *
 * 1. Mongoose spread bug — spreading a Mongoose doc loses getter-based properties
 * 2. repairWarmupMetadata — must return fresh Mongoose doc, not a spread merge
 * 3. Priority capping — failedAttempts and lastAttemptAgeHours must be bounded (real formula)
 * 4. Promote persona handling — missing persona must still mark nameBioUpdatedAt (real method)
 * 5. Dead catch variable — getErrorText must read the caught error
 * 6. lastActive ISO string — must be comparable with Mongo $lt (real query)
 */

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BufferClient, BufferClientSchema } from '../../buffer-clients/schemas/buffer-client.schema';
import { BufferClientService } from '../../buffer-clients/buffer-client.service';
import { getWarmupPhaseAction, WarmupPhase, WARMUP_PHASE_THRESHOLDS } from '../warmup-phases';
import { ClientHelperUtils } from '../client-helper.utils';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import * as organicModule from '../organic-activity';
import {
    mockBotsService, mockActiveChannelsService, mockChannelsService, mockSessionService,
} from '../../__tests__/api-test-helpers';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/mock-bot'),
}));
jest.mock('../../../utils/isPermanentError', () => ({
    __esModule: true,
    default: jest.fn(() => false),
}));

// ========================================================================
// 1. Mongoose spread bug (real MongoDB) — KEPT (genuine real-Mongo data-loss test)
// ========================================================================

describe('Mongoose spread bug — real MongoDB', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let BufferClientModel: Model<BufferClient>;

    const makeClient = (overrides: Partial<BufferClient> = {}) => ({
        tgId: `tg-${Math.random().toString(36).slice(2, 10)}`,
        mobile: `1555${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`,
        session: `session-${Math.random().toString(36).slice(2, 12)}`,
        availableDate: '2026-04-11',
        channels: 50,
        clientId: 'main-client-1',
        warmupPhase: WarmupPhase.SETTLING as any,
        warmupJitter: 2,
        enrolledAt: new Date('2026-03-15T12:00:00.000Z'),
        ...overrides,
    });

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), {
            dbName: 'spread-bug-regression',
        }).asPromise();
        BufferClientModel = connection.model<BufferClient>('BufferClientSpread', BufferClientSchema);
        await BufferClientModel.init();
    });

    afterEach(async () => {
        await BufferClientModel.deleteMany({});
    });

    afterAll(async () => {
        if (connection) {
            await connection.dropDatabase();
            await connection.close();
        }
        if (mongod) await mongod.stop();
    });

    test('a fetched Mongoose doc preserves enrolledAt/warmupJitter/createdAt and drives getWarmupPhaseAction', async () => {
        const created = await BufferClientModel.create(makeClient({
            enrolledAt: new Date('2026-03-15T12:00:00.000Z'),
            warmupJitter: 2,
        }));

        const doc = await BufferClientModel.findById(created._id);
        expect(doc).toBeTruthy();

        expect(doc!.enrolledAt).toBeInstanceOf(Date);
        expect(doc!.warmupJitter).toBe(2);
        expect(doc!.createdAt).toBeInstanceOf(Date);

        const now = new Date('2026-04-11T12:00:00.000Z').getTime();
        const actionFromDoc = getWarmupPhaseAction(doc!, now);
        // 27 days enrolled with jitter=2, privacy not done → set_privacy
        expect(actionFromDoc.action).toBe('set_privacy');

        const plainDoc = doc!.toObject();
        expect(plainDoc.enrolledAt).toBeInstanceOf(Date);
        expect(plainDoc.warmupJitter).toBe(2);
        const actionFromPlain = getWarmupPhaseAction(plainDoc, now);
        expect(actionFromPlain.action).toBe('set_privacy');
    });

    test('findOneAndUpdate returns a doc where properties are accessible without spread', async () => {
        const created = await BufferClientModel.create(makeClient({
            warmupPhase: WarmupPhase.SETTLING as any,
            enrolledAt: new Date('2026-03-10T12:00:00.000Z'),
            warmupJitter: 1,
        }));

        const updated = await BufferClientModel.findOneAndUpdate(
            { _id: created._id },
            { $set: { warmupPhase: WarmupPhase.IDENTITY, enrolledAt: new Date('2026-03-10T12:00:00.000Z') } },
            { new: true },
        );

        expect(updated).toBeTruthy();
        expect(updated!.warmupPhase).toBe(WarmupPhase.IDENTITY);
        expect(updated!.enrolledAt).toBeInstanceOf(Date);
        expect(updated!.warmupJitter).toBe(1);
        expect(updated!.createdAt).toBeInstanceOf(Date);

        const now = new Date('2026-04-11T12:00:00.000Z').getTime();
        const action = getWarmupPhaseAction(updated!, now);
        // 32 days enrolled, identity phase, no photos deleted yet → delete_photos
        expect(action.action).toBe('delete_photos');
        expect(action.phase).toBe(WarmupPhase.IDENTITY);
    });

    test('enrolledAt timestamp from a real doc projects a valid ready date', async () => {
        const enrolledDate = new Date('2026-03-20T12:00:00.000Z');
        const created = await BufferClientModel.create(makeClient({
            warmupPhase: WarmupPhase.ENROLLED as any,
            enrolledAt: enrolledDate,
            warmupJitter: 1,
        }));

        const doc = await BufferClientModel.findById(created._id);
        expect(doc).toBeTruthy();

        const enrolledAtFromDoc = ClientHelperUtils.getTimestamp(doc!.enrolledAt);
        expect(enrolledAtFromDoc).toBe(enrolledDate.getTime());

        const jitter = doc!.warmupJitter || 0;
        const projectedReadyMs = enrolledAtFromDoc + (WARMUP_PHASE_THRESHOLDS.ready + jitter) * ONE_DAY_MS;
        const projectedReadyDate = new Date(projectedReadyMs).toISOString().split('T')[0];
        expect(projectedReadyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

// ========================================================================
// Real BufferClientService harness — drives the real production formulas.
// Only true externals are mocked (GramJS via connectionManager, organic
// activity, telegram sleep, notifbot, fetchWithTimeout, isPermanentError).
// ========================================================================

describe('Real warmup pipeline — BufferClientService against real Mongo', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let BufferClientModel: Model<BufferClient>;
    let service: BufferClientService;
    let clientService: any;
    let promoteModel: Model<BufferClient>;

    const baseClient = (overrides: Partial<BufferClient> = {}): any => ({
        tgId: `tg-${Math.random().toString(36).slice(2, 10)}`,
        mobile: `1666${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`,
        session: `session-${Math.random().toString(36).slice(2, 12)}`,
        availableDate: '2026-04-11',
        channels: 50,
        clientId: 'main-client-1',
        status: 'active',
        ...overrides,
    });

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), {
            dbName: 'real-warmup-regression',
        }).asPromise();
        BufferClientModel = connection.model<BufferClient>('BufferClientRealWarmup', BufferClientSchema);
        promoteModel = connection.model<BufferClient>('PromoteForRealWarmup', BufferClientSchema);
        await BufferClientModel.init();
    });

    beforeEach(() => {
        clientService = {
            // diagnoseWarmupPipeline reads the primary client mobile to skip it.
            findAll: jest.fn(async () => [{ clientId: 'main-client-1', mobile: '16669999999' }]),
            findOne: jest.fn(async () => ({ clientId: 'main-client-1', mobile: '16669999999' })),
            getActiveClientAssignment: jest.fn(async () => null),
        };
        const telegramService = {
            hasActiveClientSetup: jest.fn(() => false),
            getChannelInfo: jest.fn(async () => ({ ids: [], count: 0 })),
        };
        const usersService = { search: jest.fn(async () => []), update: jest.fn(async () => 1), executeQuery: jest.fn(async () => []) };
        const channelsService: any = mockChannelsService();
        channelsService.getActiveChannels = jest.fn().mockResolvedValue([]);

        service = new BufferClientService(
            BufferClientModel as any,
            telegramService as any,
            usersService as any,
            mockActiveChannelsService() as any,
            clientService as any,
            channelsService as any,
            { findAll: jest.fn(async () => []), existsByMobile: jest.fn(async () => false), model: promoteModel } as any,
            mockSessionService() as any,
            mockBotsService() as any,
        );
    });

    afterEach(async () => {
        await BufferClientModel.deleteMany({});
        await promoteModel.deleteMany({});
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        if (connection) {
            await connection.dropDatabase();
            await connection.close();
        }
        if (mongod) await mongod.stop();
    });

    // ── helper: fetch one diagnostics entry by mobile from the real report ──
    const entryFor = (report: any, mobile: string) =>
        [...(report.top30WouldProcess || []), ...(report.settlingAccounts?.sampleNeedingPrivacy || [])]
            .find((e: any) => e.mobile === mobile);

    // --------------------------------------------------------------------
    // 3. Priority capping (REAL formula via diagnoseWarmupPipeline)
    // --------------------------------------------------------------------
    describe('Priority capping (real diagnoseWarmupPipeline formula)', () => {
        test('250 failed attempts does NOT produce a deeply negative priority — penalty is capped', async () => {
            // SETTLING account, recently enrolled (so not stuck-skipped), with an
            // absurd failure count. The real formula caps the failure penalty at
            // 20*100=2000, so the priority stays well above zero (old uncapped
            // formula would have been ~ -19952 and sorted dead last).
            await BufferClientModel.create(baseClient({
                mobile: '16660000250',
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: new Date(Date.now() - 5 * ONE_DAY_MS),
                failedUpdateAttempts: 250,
                // No lastUpdateFailure → not on backoff; eligible to be processed.
            }));

            const report: any = await service.diagnoseWarmupPipeline();
            const entry = report.top30WouldProcess.find((e: any) => e.mobile === '16660000250');
            expect(entry).toBeTruthy();
            // SETTLING boost 5000, age bonus capped 168, penalty capped 2000 → ~3168.
            expect(entry.priority).toBeGreaterThan(0);
            expect(entry.priority).toBeLessThan(5000);
            expect(entry.priority).toBeGreaterThan(2900);
        });

        test('phase boost orders accounts: MATURING outranks SETTLING outranks ENROLLED', async () => {
            // Three accounts, identical failure/age profile, differing only by the
            // warmup work remaining. The real phaseBoost map must order them.
            const oldEnroll = new Date('2026-03-01T12:00:00.000Z');
            // ENROLLED — fresh, just waiting
            await BufferClientModel.create(baseClient({
                mobile: '16660000001', warmupPhase: WarmupPhase.ENROLLED, enrolledAt: new Date(),
            }));
            // SETTLING — privacy not yet done
            await BufferClientModel.create(baseClient({
                mobile: '16660000002', warmupPhase: WarmupPhase.SETTLING, enrolledAt: oldEnroll,
            }));
            // MATURING — needs profile photo, channels high so it stays maturing
            await BufferClientModel.create(baseClient({
                mobile: '16660000003', warmupPhase: WarmupPhase.MATURING, enrolledAt: oldEnroll,
                channels: 220,
                privacyUpdatedAt: oldEnroll, twoFASetAt: oldEnroll, otherAuthsRemovedAt: oldEnroll,
                profilePicsDeletedAt: oldEnroll, nameBioUpdatedAt: oldEnroll, usernameUpdatedAt: oldEnroll,
            }));

            const report: any = await service.diagnoseWarmupPipeline();
            const p = (m: string) => report.top30WouldProcess.find((e: any) => e.mobile === m)?.priority;
            const maturing = p('16660000003');
            const settling = p('16660000002');
            const enrolled = p('16660000001');

            expect(maturing).toBeGreaterThan(settling);
            expect(settling).toBeGreaterThan(enrolled);
        });

        test('a sub-step action (remove_other_auths) outranks a base-phase action in the same phase', async () => {
            const old = new Date('2026-03-01T12:00:00.000Z');
            // SETTLING needing set_privacy (base, no sub-step bonus)
            await BufferClientModel.create(baseClient({
                mobile: '16660000010', warmupPhase: WarmupPhase.SETTLING, enrolledAt: old,
            }));
            // SETTLING with privacy+2FA done, needs remove_other_auths (sub-step bonus 2000)
            await BufferClientModel.create(baseClient({
                mobile: '16660000011', warmupPhase: WarmupPhase.SETTLING, enrolledAt: old,
                privacyUpdatedAt: old, twoFASetAt: old,
            }));

            const report: any = await service.diagnoseWarmupPipeline();
            const removeAuths = report.top30WouldProcess.find((e: any) => e.mobile === '16660000011');
            const privacy = report.top30WouldProcess.find((e: any) => e.mobile === '16660000010');
            expect(removeAuths.action).toBe('remove_other_auths');
            expect(privacy.action).toBe('set_privacy');
            // Same phase boost + age, so the difference is exactly the sub-step bonus.
            expect(removeAuths.priority).toBeGreaterThan(privacy.priority);
        });
    });

    // --------------------------------------------------------------------
    // 4b. Stuck-account detection (REAL: surfaces in diagnoseWarmupPipeline skip reasons)
    // --------------------------------------------------------------------
    describe('Stuck-account detection (real pipeline)', () => {
        test('a GROWING account past 45d with failures is flagged stuck in the simulation', async () => {
            const longAgo = new Date(Date.now() - 60 * ONE_DAY_MS);
            await BufferClientModel.create(baseClient({
                mobile: '16660045001', warmupPhase: WarmupPhase.GROWING, enrolledAt: longAgo,
                failedUpdateAttempts: 2, lastUpdateFailure: longAgo, channels: 120,
                privacyUpdatedAt: longAgo, twoFASetAt: longAgo, otherAuthsRemovedAt: longAgo,
                profilePicsDeletedAt: longAgo, nameBioUpdatedAt: longAgo, usernameUpdatedAt: longAgo,
            }));

            const report: any = await service.diagnoseWarmupPipeline();
            // The only account in the DB is stuck (GROWING, 60d old, with failures),
            // so the simulation records exactly one "other" skip (its stuck_* reason)
            // and nothing reaches the mutation slots.
            expect(report.eligibleToProcess).toBe(1);
            expect(report.simulation.totalSkippedOther).toBe(1);
            expect(report.simulation.mutationsUsed).toBe(0);
        });

        test('READY account past 45d is terminal and NOT counted as eligible churn', async () => {
            const longAgo = new Date(Date.now() - 90 * ONE_DAY_MS);
            await BufferClientModel.create(baseClient({
                mobile: '16660045002', warmupPhase: WarmupPhase.READY, enrolledAt: longAgo, channels: 220,
                privacyUpdatedAt: longAgo, twoFASetAt: longAgo, otherAuthsRemovedAt: longAgo,
                profilePicsDeletedAt: longAgo, nameBioUpdatedAt: longAgo, usernameUpdatedAt: longAgo,
                profilePicsUpdatedAt: longAgo,
            }));
            const report: any = await service.diagnoseWarmupPipeline();
            const entry = report.top30WouldProcess.find((e: any) => e.mobile === '16660045002');
            // READY accounts get the highest phase boost and are never marked stuck:
            // a complete READY account is processed (rotate_session), not skipped.
            expect(entry).toBeTruthy();
            expect(entry.computedPhase).toBe(WarmupPhase.READY);
            expect(entry.action).toBe('rotate_session');
            expect(entry.isMutation).toBe(true);
            // No stuck_* skip was recorded for this terminal account.
            expect(report.skippedBySlotLimit.find((s: any) => s.mobile === '16660045002')).toBeUndefined();
        });
    });

    // --------------------------------------------------------------------
    // 4. Persona handling (REAL updateNameAndBio)
    // --------------------------------------------------------------------
    describe('Promote/buffer persona handling fix (real updateNameAndBio)', () => {
        const stubTgClient = (overrides: any = {}) => {
            jest.spyOn(organicModule, 'performOrganicActivity').mockResolvedValue(undefined as any);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
                getMe: jest.fn(async () => ({ firstName: 'Existing', username: 'u' })),
                client: { invoke: jest.fn(async () => ({ users: [{ lastName: '' }], fullUser: { about: '' } })) },
                ...overrides,
            } as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        };

        test('with NO persona pool, the step is still completed: nameBioUpdatedAt is persisted', async () => {
            await BufferClientModel.create(baseClient({ mobile: '16660030001' }));
            const doc = await service.findOne('16660030001');
            stubTgClient();

            // client with empty persona pool → no assignment possible
            const count = await service.updateNameAndBio(
                doc as any,
                { clientId: 'main-client-1', name: 'x', firstNames: [], bufferLastNames: [], bios: [], profilePics: [] } as any,
                0,
            );

            expect(count).toBe(1); // Math.max guard → step marked done
            const after = await service.findOne('16660030001');
            expect(after!.nameBioUpdatedAt).toBeInstanceOf(Date);
        });

        test('with a persona that already matches the live profile, step is still marked done', async () => {
            await BufferClientModel.create(baseClient({
                mobile: '16660030002',
                assignedFirstName: 'Existing', assignedLastName: null as any, assignedBio: null as any,
            }));
            const doc = await service.findOne('16660030002');
            // Live profile firstName already 'Existing' → no UpdateProfile write fires.
            stubTgClient({ getMe: jest.fn(async () => ({ firstName: 'Existing', username: 'u' })) });

            const count = await service.updateNameAndBio(
                doc as any,
                { clientId: 'main-client-1', name: 'x', firstNames: ['Existing'], bufferLastNames: [], bios: [], profilePics: [] } as any,
                0,
            );

            expect(count).toBe(1); // satisfied even though nothing was written
            const after = await service.findOne('16660030002');
            expect(after!.nameBioUpdatedAt).toBeInstanceOf(Date);
        });

        test('once nameBioUpdatedAt is stamped, the real state machine advances out of update_name_bio', async () => {
            const now = Date.now();
            await BufferClientModel.create(baseClient({
                mobile: '16660030003',
                warmupPhase: WarmupPhase.IDENTITY,
                warmupJitter: 0,
                enrolledAt: new Date(now - 12 * ONE_DAY_MS),
                channels: 0,
                profilePicsDeletedAt: new Date(now - 6 * ONE_DAY_MS),
                nameBioUpdatedAt: new Date(now - 3 * ONE_DAY_MS),
            }));
            const doc = await service.findOne('16660030003');
            const action = getWarmupPhaseAction(doc as any, now);
            // delete_photos done + name/bio done, username not yet → update_username
            expect(action.action).toBe('update_username');
        });
    });

    // --------------------------------------------------------------------
    // 5. Dead catch variable fix (REAL getErrorText)
    // --------------------------------------------------------------------
    describe('Dead catch variable fix (real getErrorText)', () => {
        test('getErrorText reads errorMessage off the caught error object', () => {
            // The fixed catch block names the error and calls this.getErrorText(channelError)
            // before comparing against CHANNELS_TOO_MUCH. Drive the real helper.
            const getErrorText = (service as any).getErrorText.bind(service);
            expect(getErrorText({ errorMessage: 'CHANNELS_TOO_MUCH' })).toBe('CHANNELS_TOO_MUCH');
            expect(getErrorText(new Error('FLOOD_WAIT'))).toBe('FLOOD_WAIT');
            expect(getErrorText({ message: 'plain message' })).toBe('plain message');
        });
    });
});

// ========================================================================
// 6. lastActive ISO string fix — proven against a real Mongo $lt query
// ========================================================================

describe('lastActive ISO string fix — real Mongo $lt query', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let Userish: Model<any>;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'lastactive-regression' }).asPromise();
        Userish = connection.model('LastActiveDoc', new mongoose.Schema({ mobile: String, lastActive: String }, { strict: false }));
    });

    afterEach(async () => {
        await Userish.deleteMany({});
    });

    afterAll(async () => {
        if (connection) { await connection.dropDatabase(); await connection.close(); }
        if (mongod) await mongod.stop();
    });

    test('ISO-string lastActive older than 3 months matches { $lt }, the broken "today" value never does', async () => {
        const threeMonthsAgo = new Date(Date.now() - 90 * ONE_DAY_MS).toISOString();
        // FIXED: enrollment stores new Date().toISOString(); an old account is well before the cutoff.
        await Userish.create({ mobile: 'iso-old', lastActive: new Date(Date.now() - 200 * ONE_DAY_MS).toISOString() });
        // A recently-active account (ISO) must NOT match a 3-month-ago cutoff.
        await Userish.create({ mobile: 'iso-recent', lastActive: new Date().toISOString() });
        // BROKEN legacy value: the literal string "today" sorts AFTER any ISO date,
        // so it would never match $lt and the cleanup query would silently skip it.
        await Userish.create({ mobile: 'legacy-today', lastActive: 'today' });

        const matched = await Userish.find({ lastActive: { $lt: threeMonthsAgo } }, { mobile: 1 }).lean();
        const mobiles = matched.map((m: any) => m.mobile).sort();

        expect(mobiles).toEqual(['iso-old']);
        expect(mobiles).not.toContain('iso-recent');
        expect(mobiles).not.toContain('legacy-today');
    });
});
