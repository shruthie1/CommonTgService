import { UsersService } from '../users.service';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { UserSchema } from '../schemas/user.schema';
import { Api } from 'telegram/tl';
import bigInt from 'big-integer';

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return {
        ...actual,
        sleep: jest.fn(() => Promise.resolve()),
    };
});

describe('UsersService', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    test('create stores the signup session once and does not create an immediate backup session', async () => {
        const modelInstances: any[] = [];

        const MockUserModel: any = function MockUserModel(this: any, doc: any) {
            Object.assign(this, doc);
            this.save = jest.fn().mockResolvedValue({ ...doc });
            modelInstances.push(this);
        };

        MockUserModel.updateMany = jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        });

        const telegramService = {
            getActiveClientSetup: jest.fn(() => null),
            createNewSession: jest.fn(),
        };
        const clientsService = {
            updateClientSession: jest.fn(),
        };
        const botsService = {
            sendMessageByCategory: jest.fn().mockResolvedValue(undefined),
        };

        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getCallLogStats: jest.fn().mockResolvedValue({ chats: [] }),
            getTopPrivateChats: jest.fn().mockResolvedValue({ items: [] }),
            getContacts: jest.fn().mockResolvedValue({ users: [] }),
            getchatId: jest.fn(),
            client: { invoke: jest.fn() },
        } as any);
        const unregisterSpy = jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

        const bufferClientService = {
            markAsInactive: jest.fn().mockResolvedValue(null),
        };
        const promoteClientService = {
            markAsInactive: jest.fn().mockResolvedValue(null),
        };

        const service = new UsersService(
            MockUserModel,
            telegramService as any,
            clientsService as any,
            botsService as any,
            bufferClientService as any,
            promoteClientService as any,
        );

        await service.create({
            mobile: '91999990001',
            session: 'signup-session',
            firstName: 'User',
            lastName: '',
            username: 'user1',
            tgId: 'tg-1',
            twoFA: false,
            password: null,
            expired: false,
            channels: 0, personalChats: 0, totalChats: 0, contacts: 0, msgs: 0,
            photoCount: 0, videoCount: 0, movieCount: 0,
            ownPhotoCount: 0, otherPhotoCount: 0, ownVideoCount: 0, otherVideoCount: 0,
            lastActive: '2026-04-11',
            calls: { totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0 },
        } as any);

        await jest.advanceTimersByTimeAsync(5000);

        expect(modelInstances).toHaveLength(1);
        expect(modelInstances[0].save).toHaveBeenCalledTimes(1);
        expect(telegramService.createNewSession).not.toHaveBeenCalled();
        expect(unregisterSpy).toHaveBeenCalledWith('91999990001');
    });
});

// ─── Real-Mongo backed coverage ──────────────────────────────────────────────
describe('UsersService (real Mongo)', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let model: any;
    let telegramService: any;
    let clientsService: any;
    let botsService: any;
    let bufferClientService: any;
    let promoteClientService: any;
    let service: UsersService;

    let userSeq = 0;

    // mobile values MUST canonicalize: ^[1-9]\d{10,14}$ (11-15 digits)
    async function seedUser(overrides: Record<string, any> = {}) {
        const n = ++userSeq;
        const mobile = overrides.mobile ?? `9199990${String(100000 + n).slice(-6)}`;
        const doc: Record<string, any> = {
            session: `sess-${n}-${Math.random().toString(36).slice(2)}`,
            tgId: `tg-${n}-${Math.random().toString(36).slice(2)}`,
            firstName: 'First',
            lastName: 'Last',
            username: `user${n}`,
            ...overrides,
            mobile,
        };
        return model.create(doc);
    }

    beforeAll(async () => {
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'usersSvcExt' }).asPromise();
        model = connection.model('UserSvcExtModel', UserSchema);
        await model.init();
        // The users collection stores one doc PER SESSION, so a mobile legitimately
        // appears in multiple docs (see expireAccount docs). The schema's unique
        // index on mobile contradicts that; drop it for the test so we can seed the
        // real multi-session shape expireAccount/toggleStar/updateMany operate on.
        await model.collection.dropIndex('mobile_1').catch(() => undefined);
    });

    afterAll(async () => {
        if (connection) { await connection.dropDatabase(); await connection.close(); }
        if (mongod) await mongod.stop();
    });

    beforeEach(async () => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        jest.clearAllMocks();
        await model.deleteMany({});

        telegramService = {
            getActiveClientSetup: jest.fn(() => null),
            getOwnAccountMobiles: jest.fn(async () => []),
            getOwnAccountTgIds: jest.fn(async () => []),
            createNewSession: jest.fn(),
        };
        clientsService = { updateClientSession: jest.fn() };
        botsService = { sendMessageByCategory: jest.fn().mockResolvedValue(undefined) };
        bufferClientService = { markAsInactive: jest.fn().mockResolvedValue(null) };
        promoteClientService = { markAsInactive: jest.fn().mockResolvedValue(null) };

        service = new UsersService(
            model,
            telegramService as any,
            clientsService as any,
            botsService as any,
            bufferClientService as any,
            promoteClientService as any,
        );
    });

    // ── expireAccount ───────────────────────────────────────────────────────
    describe('expireAccount', () => {
        test('marks all docs for a mobile expired + cascades to buffer/promote', async () => {
            const mobile = '919999000001';
            // The users collection stores one doc per session; insert two raw docs
            // for the same mobile (bypassing the unique-mobile index) to prove
            // updateMany marks ALL of them, not just one.
            await model.collection.insertOne({ mobile, session: 's-a', tgId: 't-a', expired: false });
            await model.collection.insertOne({ mobile, session: 's-b', tgId: 't-b', expired: false });

            await service.expireAccount(mobile, 'lost');

            const docs = await model.find({ mobile });
            expect(docs.length).toBe(2);
            expect(docs.every((d: any) => d.expired === true)).toBe(true);
            expect(bufferClientService.markAsInactive).toHaveBeenCalledWith(mobile, 'lost');
            expect(promoteClientService.markAsInactive).toHaveBeenCalledWith(mobile, 'lost');
        });

        test('updateMany throw is swallowed (does not throw)', async () => {
            jest.spyOn(model, 'updateMany').mockReturnValueOnce({ exec: () => Promise.reject(new Error('db')) } as any);
            await expect(service.expireAccount('919999000002')).resolves.toBeUndefined();
            // cascade still attempted
            expect(bufferClientService.markAsInactive).toHaveBeenCalled();
        });

        test('cascade errors are swallowed', async () => {
            bufferClientService.markAsInactive.mockRejectedValueOnce(new Error('buf'));
            promoteClientService.markAsInactive.mockRejectedValueOnce(new Error('prm'));
            await expect(service.expireAccount('919999000003')).resolves.toBeUndefined();
        });
    });

    // ── create ──────────────────────────────────────────────────────────────
    describe('create', () => {
        test('branch A: activeClientSetup matches → updateClientSession, no save', async () => {
            const mobile = '919999000010';
            telegramService.getActiveClientSetup.mockReturnValue({ newMobile: mobile, clientId: 'c1' });
            const r = await service.create({ mobile, session: 'sess-x', username: 'u', firstName: 'F' } as any);
            expect(r).toBeUndefined();
            expect(clientsService.updateClientSession).toHaveBeenCalledWith('sess-x', mobile);
            expect(await model.findOne({ mobile })).toBeNull();
        });

        test('branch B: normal → bot message + save + schedules scoring', async () => {
            const scoreSpy = jest.spyOn(service, 'computeRelationshipScore').mockResolvedValue(undefined);
            const mobile = '919999000011';
            const saved = await service.create({
                mobile, session: 'sess-y', tgId: 'tg-y', username: 'uu', firstName: 'F', password: 'pw',
            } as any);
            expect(saved).toBeTruthy();
            expect(botsService.sendMessageByCategory).toHaveBeenCalled();
            const doc = await model.findOne({ mobile });
            expect(doc).toBeTruthy();
            scoreSpy.mockRestore();
        });
    });

    // ── top ─────────────────────────────────────────────────────────────────
    describe('top', () => {
        test('total===0 early return', async () => {
            const r = await service.top({});
            expect(r.total).toBe(0);
            expect(r.totalPages).toBe(0);
            expect(r.users).toEqual([]);
        });

        test('all filter branches + pagination', async () => {
            await seedUser({ relationships: { score: 100, bestScore: 100, top: [] }, twoFA: false, gender: 'female', starred: true, calls: { totalCalls: 10, incoming: 5, outgoing: 5, video: 2, audio: 3 }, photoCount: 20, videoCount: 5 });
            await seedUser({ relationships: { score: 50, bestScore: 50, top: [] }, twoFA: true, gender: 'male', starred: false, calls: { totalCalls: 1, incoming: 0, outgoing: 1, video: 0, audio: 1 }, photoCount: 1, videoCount: 0 });
            await seedUser({ relationships: { score: 10, bestScore: 10, top: [] }, expired: true });

            const r = await service.top({ page: 1, limit: 1, minScore: 1, minCalls: 5, minPhotos: 5, minVideos: 1, excludeTwoFA: true, gender: 'female', starred: true });
            expect(r.total).toBe(1);
            expect(r.users.length).toBe(1);
            expect((r.users[0] as any).gender).toBe('female');
        });

        test('excludedMobiles path excludes own-account users', async () => {
            telegramService.getOwnAccountMobiles.mockResolvedValue(['919999000099']);
            await seedUser({ mobile: '919999000099', relationships: { score: 80, bestScore: 80, top: [] } });
            await seedUser({ mobile: '919999000098', relationships: { score: 70, bestScore: 70, top: [] } });
            const r = await service.top({});
            expect(r.total).toBe(1);
            expect((r.users[0] as any).mobile).toBe('919999000098');
        });

        test('getOwnAccountMobiles throw is swallowed', async () => {
            telegramService.getOwnAccountMobiles.mockRejectedValue(new Error('x'));
            await seedUser({ relationships: { score: 5, bestScore: 5, top: [] } });
            const r = await service.top({});
            expect(r.total).toBe(1);
        });
    });

    // ── leaderboard ───────────────────────────────────────────────────────────
    describe('leaderboard', () => {
        test('field aspect (msgs) with stats rounding', async () => {
            await seedUser({ msgs: 100 });
            await seedUser({ msgs: 50 });
            const r = await service.leaderboard({ aspect: 'msgs' });
            expect(r.ranked.length).toBe(2);
            expect(r.stats.highest).toBe(100);
            expect(r.stats.average).toBe(75);
            expect(r.stats.withValue).toBe(2);
        });

        test('computed aspect (totalMedia)', async () => {
            await seedUser({ photoCount: 10, videoCount: 5, otherPhotoCount: 2 });
            const r = await service.leaderboard({ aspect: 'totalMedia' });
            expect(r.stats.highest).toBe(17);
        });

        test('computed aspect (engagement)', async () => {
            await seedUser({ msgs: 10, totalChats: 2, contacts: 5 });
            const r = await service.leaderboard({ aspect: 'engagement', limit: 5 });
            expect(r.ranked.length).toBe(1);
        });

        test('recency aspect', async () => {
            await seedUser({ lastActive: '2026-05-01' });
            await seedUser({ lastActive: '' });
            const r = await service.leaderboard({ aspect: 'recency' });
            expect(r.stats.highest).toBe(0);
            expect(r.stats.average).toBe(0);
            expect(r.ranked.length).toBe(1);
        });

        test('unknown aspect → BadRequestException', async () => {
            await expect(service.leaderboard({ aspect: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
        });

        test('excludedMobiles applied in match', async () => {
            telegramService.getOwnAccountMobiles.mockResolvedValue(['919999000099']);
            await seedUser({ mobile: '919999000099', msgs: 999 });
            await seedUser({ mobile: '919999000098', msgs: 5 });
            const r = await service.leaderboard({ aspect: 'msgs' });
            expect(r.stats.withValue).toBe(1);
            expect(r.stats.highest).toBe(5);
        });
    });

    // ── findAll / findAllSorted ─────────────────────────────────────────────
    describe('findAll / findAllSorted', () => {
        test('findAll returns docs', async () => {
            await seedUser(); await seedUser();
            expect((await service.findAll()).length).toBe(2);
        });

        test('findAllSorted without sort', async () => {
            await seedUser({ expired: false });
            await seedUser({ expired: true });
            const r = await service.findAllSorted();
            expect(r.length).toBe(1); // expired excluded by default query
        });

        test('findAllSorted with sort', async () => {
            await seedUser({ msgs: 1 });
            await seedUser({ msgs: 9 });
            const r = await service.findAllSorted(100, 0, { msgs: -1 });
            expect((r[0] as any).msgs).toBe(9);
        });
    });

    // ── summary ─────────────────────────────────────────────────────────────
    describe('summary', () => {
        test('aggregates totals + genderBreakdown', async () => {
            await seedUser({ gender: 'female', msgs: 10, contacts: 5, totalChats: 3, lastActive: '2026-05-01', starred: true, twoFA: true, calls: { totalCalls: 2, incoming: 1, outgoing: 1, video: 0, audio: 1 }, relationships: { score: 5, bestScore: 5, top: [] } });
            await seedUser({ gender: 'male', msgs: 20, expired: true });
            const r = await service.summary();
            expect(r.total).toBe(2);
            expect(r.totalMsgs).toBe(30);
            expect(r.genderBreakdown.female).toBe(1);
            expect(r.genderBreakdown.male).toBe(1);
            expect(r.starred).toBe(1);
        });

        test('empty collection fallback', async () => {
            const r = await service.summary();
            expect(r.total).toBe(0);
            expect(r.avgMsgs).toBe(0);
            expect(r.genderBreakdown).toEqual({});
        });
    });

    // ── paginated ─────────────────────────────────────────────────────────────
    describe('paginated', () => {
        test('total===0 path', async () => {
            const r = await service.paginated({ filter: 'all' });
            expect(r.total).toBe(0);
            expect(r.totalPages).toBe(0);
        });

        test('filter active + pagination', async () => {
            await seedUser({ lastActive: '2026-05-01' });
            await seedUser({ lastActive: '2026-04-01' });
            const r = await service.paginated({ filter: 'active', page: 1, limit: 1, sortBy: 'lastActive', sortOrder: 'asc' });
            expect(r.total).toBe(2);
            expect(r.users.length).toBe(1);
            expect(r.totalPages).toBe(2);
        });

        test('filter starred', async () => {
            await seedUser({ starred: true });
            const r = await service.paginated({ filter: 'starred' });
            expect(r.total).toBe(1);
        });

        test('filter expired', async () => {
            await seedUser({ expired: true });
            const r = await service.paginated({ filter: 'expired' });
            expect(r.total).toBe(1);
        });

        test('filter withCalls', async () => {
            await seedUser({ calls: { totalCalls: 5, incoming: 1, outgoing: 4, video: 0, audio: 1 } });
            const r = await service.paginated({ filter: 'withCalls' });
            expect(r.total).toBe(1);
        });

        test('search path (trimmed)', async () => {
            await seedUser({ firstName: 'Zaphod', tgId: 'tg-search-1' });
            const r = await service.paginated({ search: '  Zaphod  ' });
            expect(r.total).toBe(1);
        });
    });

    // ── findOne / update / updateByFilter / toggleStar / delete ───────────────
    describe('findOne', () => {
        test('found returns toJSON', async () => {
            await seedUser({ tgId: 'fo-1' });
            const r = await service.findOne('fo-1');
            expect(r.tgId).toBe('fo-1');
        });
        test('not found → NotFound', async () => {
            await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('update', () => {
        test('found + mobile canonicalization', async () => {
            await seedUser({ tgId: 'up-1', mobile: '919999000020' });
            const r = await service.update('up-1', { mobile: '+919999000021', firstName: 'New' } as any);
            expect(r.mobile).toBe('919999000021');
            expect(r.firstName).toBe('New');
        });
        test('not found → NotFound', async () => {
            await expect(service.update('nope', { firstName: 'x' } as any)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('updateByFilter', () => {
        test('matched returns modifiedCount', async () => {
            await seedUser({ gender: 'female', starred: false });
            const n = await service.updateByFilter({ gender: 'female' } as any, { starred: true } as any);
            expect(n).toBe(1);
        });
        test('no match → NotFound', async () => {
            await expect(service.updateByFilter({ gender: 'zzz' } as any, { starred: true } as any)).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('toggleStar', () => {
        test('toggles on then off', async () => {
            await seedUser({ mobile: '919999000030', starred: false });
            const a = await service.toggleStar('919999000030');
            expect(a.starred).toBe(true);
            const b = await service.toggleStar('919999000030');
            expect(b.starred).toBe(false);
        });
        test('not found → NotFound', async () => {
            await expect(service.toggleStar('919999000031')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    describe('delete', () => {
        test('found → expireAccount cascade', async () => {
            await seedUser({ tgId: 'del-1', mobile: '919999000040' });
            await service.delete('del-1');
            const doc = await model.findOne({ mobile: '919999000040' });
            expect(doc.expired).toBe(true);
            expect(bufferClientService.markAsInactive).toHaveBeenCalled();
            expect(promoteClientService.markAsInactive).toHaveBeenCalled();
        });
        test('not found → NotFound', async () => {
            await expect(service.delete('nope')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ── search ──────────────────────────────────────────────────────────────
    describe('search', () => {
        test('regex fields + mobile canonicalization', async () => {
            await seedUser({ firstName: 'Alice', mobile: '919999000050' });
            const r = await service.search({ firstName: 'Ali', mobile: '+919999000050' } as any);
            expect(r.length).toBe(1);
        });

        test('regex special chars escaped', async () => {
            await seedUser({ firstName: 'a.b(c)', tgId: 'esc-1' });
            const r = await service.search({ firstName: 'a.b(c)' } as any);
            expect(r.length).toBe(1);
        });

        test('invalid mobile → BadRequest', async () => {
            await expect(service.search({ mobile: 'garbage' } as any)).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    // ── topRelationships ──────────────────────────────────────────────────────
    describe('topRelationships', () => {
        test('total===0 path', async () => {
            const r = await service.topRelationships({});
            expect(r.total).toBe(0);
            expect(r.totalPages).toBe(0);
        });

        test('populated + filters', async () => {
            await seedUser({ relationships: { score: 10, bestScore: 100, top: [] }, twoFA: false, gender: 'female' });
            await seedUser({ relationships: { score: 10, bestScore: 5, top: [] }, twoFA: true, gender: 'male' });
            const r = await service.topRelationships({ minScore: 50, excludeTwoFA: true, gender: 'female' });
            expect(r.total).toBe(1);
        });

        test('excludedMobiles applied', async () => {
            telegramService.getOwnAccountMobiles.mockResolvedValue(['919999000099']);
            await seedUser({ mobile: '919999000099', relationships: { score: 1, bestScore: 90, top: [] } });
            await seedUser({ mobile: '919999000098', relationships: { score: 1, bestScore: 90, top: [] } });
            const r = await service.topRelationships({});
            expect(r.total).toBe(1);
        });
    });

    // ── getUserRelationships ──────────────────────────────────────────────────
    describe('getUserRelationships', () => {
        test('found', async () => {
            await seedUser({ mobile: '919999000060', relationships: { score: 5, bestScore: 5, top: [] } });
            const r: any = await service.getUserRelationships('919999000060');
            expect(r.mobile).toBe('919999000060');
        });
        test('not found → NotFound', async () => {
            await expect(service.getUserRelationships('919999000061')).rejects.toBeInstanceOf(NotFoundException);
        });
    });

    // ── canonicalMobile via public method ─────────────────────────────────────
    describe('canonicalMobile', () => {
        test('invalid mobile → BadRequest', async () => {
            await expect(service.toggleStar('garbage')).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    // ── aggregateSort ─────────────────────────────────────────────────────────
    describe('aggregateSort', () => {
        async function seedRich() {
            await seedUser({
                mobile: '919999000070',
                relationships: {
                    score: 100, bestScore: 100,
                    top: [
                        { chatId: 'a', name: 'A', username: null, phone: null, messages: 100, mediaCount: 10, voiceCount: 5, intimateMessageCount: 8, negativeKeywordCount: 0, calls: { total: 4, incoming: 2, videoCalls: 1, avgDuration: 60, totalDuration: 240, meaningfulCalls: 3 }, commonChats: 2, isMutualContact: true, lastMessageDate: null, score: 50 },
                        { chatId: 'b', name: 'B', username: null, phone: null, messages: 40, mediaCount: 4, voiceCount: 1, intimateMessageCount: 2, negativeKeywordCount: 0, calls: { total: 1, incoming: 1, videoCalls: 0, avgDuration: 30, totalDuration: 30, meaningfulCalls: 0 }, commonChats: 1, isMutualContact: false, lastMessageDate: null, score: 20 },
                    ],
                },
                ownPhotoCount: 5, otherPhotoCount: 3, ownVideoCount: 2, otherVideoCount: 1, movieCount: 4,
                photoCount: 0, videoCount: 0,
                calls: {
                    totalCalls: 5, incoming: 3, outgoing: 2, video: 1, audio: 4,
                    chats: [
                        { totalDuration: 240, longestCall: 120, missed: 1, totalMessages: 50, averageDuration: 60 },
                        { totalDuration: 30, longestCall: 30, missed: 0, totalMessages: 10, averageDuration: 30 },
                    ],
                } as any,
            });
        }

        test('reduce field (intimateTotal)', async () => {
            await seedRich();
            const r = await service.aggregateSort('intimateTotal');
            expect(r.length).toBe(1);
        });

        test('arrayElemAt field (privateMsgsBestContact)', async () => {
            await seedRich();
            const r = await service.aggregateSort('privateMsgsBestContact');
            expect(r.length).toBe(1);
        });

        test('$let/$cond field (totalPhotos uses split when >0)', async () => {
            await seedRich();
            const r = await service.aggregateSort('totalPhotos');
            expect(r.length).toBe(1);
        });

        test('totalVideos + totalMedia computed', async () => {
            await seedRich();
            expect((await service.aggregateSort('totalVideos')).length).toBe(1);
            expect((await service.aggregateSort('totalMedia')).length).toBe(1);
        });

        test('$size field (callPartners / relMutualContacts)', async () => {
            await seedRich();
            expect((await service.aggregateSort('callPartners')).length).toBe(1);
            expect((await service.aggregateSort('relMutualContacts')).length).toBe(1);
        });

        test('calls.chats reduce fields', async () => {
            await seedRich();
            for (const f of ['totalCallDuration', 'longestCall', 'missedCalls', 'privateMsgsCallPartners', 'avgCallDuration']) {
                expect((await service.aggregateSort(f)).length).toBe(1);
            }
        });

        test('more rel reduce/arrayElemAt fields', async () => {
            await seedRich();
            for (const f of ['privateMsgsTopContacts', 'privateMediaTopContacts', 'privateVoiceTotal', 'relTopIntimate', 'relTopMedia', 'relTopVoice', 'relCommonChats', 'relTopCalls', 'relMeaningfulCalls']) {
                expect((await service.aggregateSort(f)).length).toBe(1);
            }
        });

        test('unknown field → BadRequest', async () => {
            await expect(service.aggregateSort('nope')).rejects.toBeInstanceOf(BadRequestException);
        });

        test('coerceDateOperands via createdAt range query', async () => {
            await seedRich();
            const r = await service.aggregateSort('intimateTotal', -1, 20, 0, { createdAt: { $gte: '2000-01-01T00:00:00.000Z' } } as any);
            expect(r.length).toBe(1);
        });
    });

    // ── compositeRank ─────────────────────────────────────────────────────────
    describe('compositeRank', () => {
        async function seedComposite() {
            await seedUser({
                mobile: '919999000080', msgs: 100, contacts: 20,
                calls: { totalCalls: 5, incoming: 2, outgoing: 3, video: 1, audio: 4, chats: [{ x: 1 }] } as any,
                relationships: { score: 50, bestScore: 50, top: [{ chatId: 'a', name: 'A', username: null, phone: null, messages: 50, mediaCount: 10, voiceCount: 5, intimateMessageCount: 8, negativeKeywordCount: 0, calls: { total: 2, incoming: 1, videoCalls: 0, avgDuration: 30, totalDuration: 60, meaningfulCalls: 2 }, commonChats: 0, isMutualContact: false, lastMessageDate: null, score: 30 }] },
            });
            await seedUser({ mobile: '919999000081', msgs: 0, contacts: 0, calls: { totalCalls: 0, incoming: 0, outgoing: 0, video: 0, audio: 0 } as any, relationships: { score: 0, bestScore: 0, top: [] } });
        }

        test('empty signals → BadRequest', async () => {
            await expect(service.compositeRank([])).rejects.toBeInstanceOf(BadRequestException);
        });

        test('unknown signal → BadRequest', async () => {
            await expect(service.compositeRank([{ field: 'nope' }])).rejects.toBeInstanceOf(BadRequestException);
        });

        test('single valid signal excludes all-zero users', async () => {
            await seedComposite();
            const r = await service.compositeRank([{ field: 'relScore' }]);
            expect(r.length).toBe(1);
            expect(r[0].mobile).toBe('919999000080');
        });

        test('multi-signal with custom + default weights', async () => {
            await seedComposite();
            const r = await service.compositeRank([
                { field: 'intimate', weight: 5 },
                { field: 'voice' },
                { field: 'media', weight: -3 }, // invalid weight → falls back to default
                { field: 'calls' },
                { field: 'videoCalls' },
                { field: 'meaningfulCalls' },
                { field: 'callPartners' },
                { field: 'msgs' },
                { field: 'contacts' },
            ]);
            expect(r.length).toBe(1);
        });
    });

    // ── executeQuery ──────────────────────────────────────────────────────────
    describe('executeQuery', () => {
        test('null query → BadRequest', async () => {
            await expect(service.executeQuery(null as any)).rejects.toBeInstanceOf(BadRequestException);
        });

        test('valid query with sort/limit/skip', async () => {
            await seedUser({ msgs: 1 });
            await seedUser({ msgs: 9 });
            const r = await service.executeQuery({ msgs: { $gte: 0 } } as any, { msgs: -1 }, 1, 0);
            expect(r.length).toBe(1);
            expect((r[0] as any).msgs).toBe(9);
        });

        test('createdAt range string coerced ($and nesting + excludedMobiles)', async () => {
            telegramService.getOwnAccountMobiles.mockResolvedValue(['919999000099']);
            await seedUser({ mobile: '919999000098', msgs: 5 });
            const r = await service.executeQuery({ $and: [{ msgs: { $gte: 0 } }], createdAt: { $gte: '2000-01-01T00:00:00.000Z' } } as any);
            expect(r.length).toBe(1);
        });

        test('error path → InternalServerError', async () => {
            jest.spyOn(model, 'find').mockImplementationOnce(() => { throw new Error('boom'); });
            await expect(service.executeQuery({ msgs: 1 } as any)).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });

    // ── computeRelationshipScore ──────────────────────────────────────────────
    describe('computeRelationshipScore', () => {
        function makeApiUser(id: string, opts: { bot?: boolean; first?: string; username?: string; phone?: string } = {}) {
            const u = new Api.User({
                id: bigInt(id),
                firstName: opts.first ?? 'Cand',
                accessHash: bigInt(0),
            } as any);
            (u as any).bot = opts.bot ?? false;
            (u as any).username = opts.username;
            (u as any).phone = opts.phone;
            return u;
        }

        function buildFakeClient(overrides: any = {}) {
            const candUser = makeApiUser('111', { first: 'Lover', username: 'lover', phone: '999' });
            const topPeers = new Api.contacts.TopPeers({
                categories: [
                    new Api.TopPeerCategoryPeers({
                        category: new Api.TopPeerCategoryCorrespondents(),
                        count: 1,
                        peers: [new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('111') }), rating: 1 })],
                    }),
                ],
                chats: [],
                users: [candUser],
            });

            const fake: any = {
                getMe: jest.fn(async () => ({ id: { toString: () => 'self1' } })),
                getContacts: jest.fn(async () => ({ users: [{ id: { toString: () => '111' }, mutualContact: true }] })),
                getchatId: jest.fn(async () => new Api.PeerUser({ userId: bigInt('111') })),
                getChatCallHistory: jest.fn(async () => ({
                    totalCalls: 4, incoming: 2, outgoing: 2, videoCalls: 1, audioCalls: 3,
                    totalDuration: 240, averageDuration: 60,
                    calls: [{ durationSeconds: 60 }, { durationSeconds: 10 }],
                })),
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) return topPeers;
                        if (req instanceof Api.messages.GetSearchCounters) {
                            return [{ count: 10 }, { count: 4 }, { count: 2 }, { count: 6 }];
                        }
                        if (req instanceof Api.messages.GetCommonChats) {
                            return { chats: [{ id: bigInt('555') }] };
                        }
                        if (req instanceof Api.messages.Search) return { count: 1 };
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () {
                        yield { isUser: true, entity: makeApiUser('222', { first: 'Dialog' }) };
                    }),
                    getEntity: jest.fn(async () => ({ bot: false })),
                    getMessages: jest.fn(async () => ({ total: 100, 0: { date: Math.floor(Date.now() / 1000) } })),
                },
                ...overrides,
            };
            return fake;
        }

        test('happy path persists scores + cleans up unregistered client', async () => {
            const mobile = '919999000090';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });

            const fake = buildFakeClient();
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            const getSpy = jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            const unregSpy = jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);

            await service.computeRelationshipScore(mobile);

            const doc = await model.findOne({ mobile });
            expect(doc.relationships.score).toBeGreaterThan(0);
            expect(doc.relationships.top.length).toBeGreaterThan(0);
            expect(getSpy).toHaveBeenCalled();
            expect(unregSpy).toHaveBeenCalledWith(mobile);
        });

        test('candidateMap.size===0 early return', async () => {
            const mobile = '919999000091';
            await seedUser({ mobile });
            const fake = buildFakeClient({
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) {
                            return new Api.contacts.TopPeers({ categories: [], chats: [], users: [] });
                        }
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () { /* nothing */ }),
                    getEntity: jest.fn(),
                    getMessages: jest.fn(),
                },
            });
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            const unregSpy = jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);

            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            // score untouched (early return before persist)
            expect(doc.relationships.score).toBe(0);
            expect(unregSpy).toHaveBeenCalled();
        });

        test('top-level catch: getClient rejects → no throw, no unregister (client null)', async () => {
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockRejectedValue(new Error('connect fail'));
            const unregSpy = jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await expect(service.computeRelationshipScore('919999000092')).resolves.toBeUndefined();
            expect(unregSpy).not.toHaveBeenCalled();
        });

        test('wasConnected=true → does not unregister', async () => {
            const mobile = '919999000093';
            await seedUser({ mobile });
            const fake = buildFakeClient();
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(true);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            const unregSpy = jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            expect(unregSpy).not.toHaveBeenCalled();
        });

        test('low message count chat is skipped', async () => {
            const mobile = '919999000094';
            await seedUser({ mobile });
            const fake = buildFakeClient();
            fake.client.getMessages = jest.fn(async () => ({ total: 2 })); // < 5 → skip
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            // no candidates survived enrichment → top empty, score 0
            expect(doc.relationships.score).toBe(0);
        });

        // ── ADDED: branch coverage for uncovered error / merge paths ──────────

        // line 648: getOwnAccountTgIds throwing → warn + continue
        test('getOwnAccountTgIds throw is swallowed (warns, continues)', async () => {
            const mobile = '919999000095';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });
            telegramService.getOwnAccountTgIds.mockRejectedValueOnce(new Error('tgids fail'));
            const fake = buildFakeClient();
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            // still scored despite the tgIds fetch failing
            const doc = await model.findOne({ mobile });
            expect(doc.relationships.score).toBeGreaterThan(0);
        });

        // line 690: GetTopPeers invoke throwing → warn, falls through to dialogs
        test('GetTopPeers failure falls back to iterDialogs candidates', async () => {
            const mobile = '919999000096';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });
            const fake = buildFakeClient({
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) throw new Error('top peers disabled');
                        if (req instanceof Api.messages.GetSearchCounters) {
                            return [{ count: 10 }, { count: 4 }, { count: 2 }, { count: 6 }];
                        }
                        if (req instanceof Api.messages.GetCommonChats) return { chats: [{ id: bigInt('555') }] };
                        if (req instanceof Api.messages.Search) return { count: 1 };
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () {
                        yield { isUser: true, entity: makeApiUser('222', { first: 'Dialog' }) };
                    }),
                    getEntity: jest.fn(async () => ({ bot: false })),
                    getMessages: jest.fn(async () => ({ total: 100, 0: { date: Math.floor(Date.now() / 1000) } })),
                },
            });
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            // dialog candidate (222) still scored
            expect(doc.relationships.score).toBeGreaterThan(0);
        });

        // line 705: candidate present in BOTH topPeers and dialogs → source='both'
        test('candidate from topPeers also seen in dialogs merges source=both', async () => {
            const mobile = '919999000097';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });
            const candUser = makeApiUser('111', { first: 'Lover', username: 'lover', phone: '999' });
            const topPeers = new Api.contacts.TopPeers({
                categories: [
                    new Api.TopPeerCategoryPeers({
                        category: new Api.TopPeerCategoryCorrespondents(),
                        count: 1,
                        peers: [new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('111') }), rating: 1 })],
                    }),
                ],
                chats: [],
                users: [candUser],
            });
            const fake = buildFakeClient({
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) return topPeers;
                        if (req instanceof Api.messages.GetSearchCounters) {
                            return [{ count: 10 }, { count: 4 }, { count: 2 }, { count: 6 }];
                        }
                        if (req instanceof Api.messages.GetCommonChats) return { chats: [{ id: bigInt('555') }] };
                        if (req instanceof Api.messages.Search) return { count: 1 };
                        return {};
                    }),
                    // iterDialogs yields the SAME user id (111) → existing → source='both'
                    iterDialogs: jest.fn(async function* () {
                        yield { isUser: true, entity: makeApiUser('111', { first: 'Lover' }) };
                    }),
                    getEntity: jest.fn(async () => ({ bot: false })),
                    getMessages: jest.fn(async () => ({ total: 100, 0: { date: Math.floor(Date.now() / 1000) } })),
                },
            });
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            expect(doc.relationships.top.length).toBe(1);
            expect(doc.relationships.score).toBeGreaterThan(0);
        });

        // line 720: iterDialogs throwing → warn, still proceeds with topPeers candidate
        test('iterDialogs failure is swallowed (topPeers candidate still scored)', async () => {
            const mobile = '919999000098';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });
            const fake = buildFakeClient();
            fake.client.iterDialogs = jest.fn(() => {
                // async generator that throws on first iteration
                return (async function* () { throw new Error('dialogs fail'); })();
            });
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            // topPeers candidate (111) survived
            expect(doc.relationships.score).toBeGreaterThan(0);
        });

        // line 863: searchKeyword invoke throwing → returns 0 (catch branch)
        test('keyword Search failure returns 0 (chat still scored)', async () => {
            const mobile = '919999000100';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });
            const fake = buildFakeClient({
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) {
                            const candUser = makeApiUser('111', { first: 'Lover', username: 'lover', phone: '999' });
                            return new Api.contacts.TopPeers({
                                categories: [
                                    new Api.TopPeerCategoryPeers({
                                        category: new Api.TopPeerCategoryCorrespondents(),
                                        count: 1,
                                        peers: [new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('111') }), rating: 1 })],
                                    }),
                                ],
                                chats: [],
                                users: [candUser],
                            });
                        }
                        if (req instanceof Api.messages.GetSearchCounters) {
                            return [{ count: 10 }, { count: 4 }, { count: 2 }, { count: 6 }];
                        }
                        if (req instanceof Api.messages.GetCommonChats) return { chats: [{ id: bigInt('555') }] };
                        // Keyword Search throws → searchKeyword catch returns 0
                        if (req instanceof Api.messages.Search) throw new Error('search blocked');
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () { /* none */ }),
                    getEntity: jest.fn(async () => ({ bot: false })),
                    getMessages: jest.fn(async () => ({ total: 100, 0: { date: Math.floor(Date.now() / 1000) } })),
                },
            });
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            // scored even though intimate/negative keyword searches all failed (counted 0)
            expect(doc.relationships.top.length).toBe(1);
        });

        // line 899: per-chat enrichment throwing → warn, chat skipped, others continue
        test('per-chat enrichment error is swallowed (getchatId throws)', async () => {
            const mobile = '919999000101';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });
            const fake = buildFakeClient();
            // getchatId throws inside the per-candidate try → hits chatError catch (line 899)
            fake.getchatId = jest.fn(async () => { throw new Error('peer resolve fail'); });
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            // candidate failed enrichment → no surviving candidates → score 0
            expect(doc.relationships.score).toBe(0);
        });
    });

    // ── create: background scoring catch (line 123) ───────────────────────────
    describe('create background scoring catch', () => {
        test('computeRelationshipScore rejection in setTimeout is logged, not thrown', async () => {
            jest.useFakeTimers();
            try {
                const mobile = '919999000110';
                const scoreSpy = jest
                    .spyOn(service, 'computeRelationshipScore')
                    .mockRejectedValue(new Error('bg scoring boom'));
                const errSpy = jest.spyOn((service as any).logger, 'error');

                await service.create({
                    mobile, session: 'sess-bg', tgId: 'tg-bg', username: 'ubg', firstName: 'F',
                } as any);

                // fire the scheduled setTimeout(…, 5000) and let the rejected promise settle
                await jest.advanceTimersByTimeAsync(5000);

                expect(scoreSpy).toHaveBeenCalledWith(mobile);
                expect(errSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Background scoring failed'),
                    expect.any(Error),
                );
                scoreSpy.mockRestore();
            } finally {
                jest.useRealTimers();
            }
        });
    });

    // ── constructor forwardRef callbacks (lines 35,37,44,46) ──────────────────
    // The `@Inject(forwardRef(() => X))` decorators store a lazy arrow that Nest's
    // DI container invokes only while resolving the circular dependency graph.
    // A directly-constructed UsersService never triggers them, so we resolve the
    // exact same arrows Nest would call from the reflected inject metadata and
    // invoke them — proving they resolve to the real provider classes.
    describe('forwardRef inject metadata', () => {
        test('each forwardRef callback resolves its provider class', () => {
            // SELF_DECLARED_DEPS_METADATA = 'self:paramtypes' (see @nestjs/common constants)
            const selfDeps: Array<{ index: number; param: any }> =
                Reflect.getMetadata('self:paramtypes', UsersService) || [];
            const refs = selfDeps
                .map((d) => d.param)
                .filter((p) => p && typeof p.forwardRef === 'function');

            // 5 forwardRef params: TelegramService, ClientService, BotsService,
            // BufferClientService, PromoteClientService
            expect(refs.length).toBe(5);
            for (const ref of refs) {
                const resolved = ref.forwardRef();
                expect(typeof resolved).toBe('function'); // resolves to a class
            }
        });
    });

    // ── coerceDateOperands: direct string-equality on a date field (line 379) ─
    describe('coerceDateOperands direct equality', () => {
        test('createdAt as a bare ISO string is coerced to a Date and matches', async () => {
            const u = await seedUser({ msgs: 7 });
            // exact createdAt of the seeded doc, passed as a plain string (not a range op)
            const createdAtIso = new Date((u as any).createdAt).toISOString();
            const r = await service.executeQuery({ createdAt: createdAtIso } as any);
            expect(r.length).toBe(1);
            expect((r[0] as any).msgs).toBe(7);
        });

        test('createdAt range with a non-range operator is preserved', async () => {
            const u = await seedUser({ msgs: 11 });
            // $exists is NOT in RANGE_OPS → kept verbatim (covers the false side of RANGE_OPS.has)
            const r = await service.executeQuery({ createdAt: { $exists: true } } as any);
            expect(r.length).toBe(1);
            void u;
        });

        test('nested $or branch is walked by coerceDateOperands', async () => {
            const u = await seedUser({ msgs: 12 });
            const createdAtIso = new Date((u as any).createdAt).toISOString();
            const r = await service.executeQuery({ $or: [{ createdAt: createdAtIso }] } as any);
            expect(r.length).toBe(1);
        });
    });

    // ── executeQuery: skip-only branch (line 1319) ────────────────────────────
    describe('executeQuery skip branch', () => {
        test('skip without limit skips the right number of docs', async () => {
            await seedUser({ msgs: 1 });
            await seedUser({ msgs: 2 });
            const all = await service.executeQuery({ msgs: { $gte: 0 } } as any, { msgs: 1 });
            expect(all.length).toBe(2);
            const skipped = await service.executeQuery({ msgs: { $gte: 0 } } as any, { msgs: 1 }, undefined, 1);
            expect(skipped.length).toBe(1);
            expect((skipped[0] as any).msgs).toBe(2);
        });
    });

    // ── expireAccount: non-Error throwables hit the String(error) side ────────
    describe('expireAccount non-Error throwables', () => {
        test('updateMany rejecting a string is stringified (not .message)', async () => {
            jest.spyOn(model, 'updateMany').mockReturnValueOnce({ exec: () => Promise.reject('plain-string-err') } as any);
            await expect(service.expireAccount('919999000201')).resolves.toBeUndefined();
        });

        test('cascade rejecting non-Error values is stringified', async () => {
            bufferClientService.markAsInactive.mockRejectedValueOnce('buf-str');
            promoteClientService.markAsInactive.mockRejectedValueOnce(12345);
            await expect(service.expireAccount('919999000202')).resolves.toBeUndefined();
        });
    });

    // ── canonicalMobile: non-Error thrown by canonicalizeMobile (line 989) ────
    describe('canonicalMobile non-Error', () => {
        test('empty mobile → BadRequest (covers error message extraction)', async () => {
            await expect(service.toggleStar('')).rejects.toBeInstanceOf(BadRequestException);
        });
    });

    // ── create: username/password ternary variants (line 115) ─────────────────
    describe('create message ternaries', () => {
        test('no username + no password → uses firstName, omits password line', async () => {
            const scoreSpy = jest.spyOn(service, 'computeRelationshipScore').mockResolvedValue(undefined);
            const mobile = '919999000210';
            await service.create({ mobile, session: 's', tgId: 'tg-np', firstName: 'OnlyFirst' } as any);
            const msg = botsService.sendMessageByCategory.mock.calls[0][1];
            expect(msg).toContain('OnlyFirst');
            expect(msg).not.toContain('Password');
            scoreSpy.mockRestore();
        });
    });

    // ── leaderboard: empty-stats fallback path (lines 317,320,322,323,324) ────
    describe('leaderboard empty stats fallback', () => {
        test('no docs with a positive value → stats default to zeros', async () => {
            // a doc whose msgs are 0 is filtered out by the $gt:0 stage → stats[] empty
            await seedUser({ msgs: 0 });
            const r = await service.leaderboard({ aspect: 'msgs' });
            expect(r.ranked).toEqual([]);
            expect(r.stats).toEqual({ highest: 0, average: 0, withValue: 0 });
        });
    });

    // ── summary: gender null bucket + empty genderBreakdown array (line 463) ──
    describe('summary gender fallbacks', () => {
        test('user with no gender lands in the "unknown" bucket', async () => {
            await seedUser({ gender: undefined, msgs: 3 });
            const r = await service.summary();
            expect(r.genderBreakdown.unknown).toBe(1);
        });
    });

    // ── computeRelationshipScore: defensive-default branches ──────────────────
    // Covers candidate field fallbacks (lastName absent, username/phone null,
    // 'Unknown' name fallback), GetSearchCounters '?? 0' fallbacks, and the
    // meaningfulCalls ternary (no per-call array → averageDuration>30 path).
    describe('computeRelationshipScore defensive defaults', () => {
        function makeBareUser(id: string) {
            // No firstName/lastName/username/phone → name falls back to 'Unknown',
            // username/phone fall back to null.
            const u = new Api.User({ id: bigInt(id), accessHash: bigInt(0) } as any);
            (u as any).bot = false;
            return u;
        }

        test('bare candidate + missing counters + averageDuration meaningfulCalls path', async () => {
            const mobile = '919999000220';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });

            const bareUser = makeBareUser('111');
            const topPeers = new Api.contacts.TopPeers({
                categories: [
                    new Api.TopPeerCategoryPeers({
                        category: new Api.TopPeerCategoryCorrespondents(),
                        count: 1,
                        peers: [new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('111') }), rating: 1 })],
                    }),
                ],
                chats: [],
                users: [bareUser],
            });

            const fake: any = {
                getMe: jest.fn(async () => ({ id: { toString: () => 'self1' } })),
                // contacts has no 'users' key in the expected shape → mutual loop guarded
                getContacts: jest.fn(async () => ({ users: [{ id: { toString: () => '111' }, mutualContact: false }] })),
                getchatId: jest.fn(async () => new Api.PeerUser({ userId: bigInt('111') })),
                // call history with NO per-call array → meaningfulCalls uses averageDuration>30 branch
                getChatCallHistory: jest.fn(async () => ({
                    totalCalls: 3, incoming: 1, outgoing: 2, videoCalls: 0, audioCalls: 3,
                    totalDuration: 200, averageDuration: 45, calls: undefined,
                })),
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) return topPeers;
                        // counters returns empty array → photoCount/etc fall back to ?? 0
                        if (req instanceof Api.messages.GetSearchCounters) return [];
                        if (req instanceof Api.messages.GetCommonChats) return { chats: [] };
                        // Search returns object with no .count → ?? 0
                        if (req instanceof Api.messages.Search) return {};
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () { /* none */ }),
                    getEntity: jest.fn(async () => ({ bot: false })),
                    // getMessages returns object with no .total → ?? 0 ... but then <5 skip.
                    // give >=5 so the candidate survives to exercise the fallbacks.
                    getMessages: jest.fn(async () => ({ total: 10 })),
                },
            };

            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);

            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            expect(doc.relationships.top.length).toBe(1);
            // name fell back to 'Unknown', username/phone null
            expect(doc.relationships.top[0].name).toBe('Unknown');
            expect(doc.relationships.top[0].username).toBeNull();
            expect(doc.relationships.top[0].phone).toBeNull();
        });

        test('getContacts without users key + getMessages missing total are tolerated', async () => {
            const mobile = '919999000221';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });

            const candUser = new Api.User({ id: bigInt('111'), firstName: 'C', accessHash: bigInt(0) } as any);
            (candUser as any).bot = false;
            const topPeers = new Api.contacts.TopPeers({
                categories: [
                    new Api.TopPeerCategoryPeers({
                        category: new Api.TopPeerCategoryCorrespondents(),
                        count: 1,
                        peers: [new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('111') }), rating: 1 })],
                    }),
                ],
                chats: [],
                users: [candUser],
            });

            const fake: any = {
                getMe: jest.fn(async () => ({ id: { toString: () => 'self1' } })),
                // contacts result missing 'users' property entirely → guarded branch
                getContacts: jest.fn(async () => ({})),
                getchatId: jest.fn(async () => new Api.PeerUser({ userId: bigInt('111') })),
                getChatCallHistory: jest.fn(async () => ({
                    totalCalls: 0, incoming: 0, outgoing: 0, videoCalls: 0, audioCalls: 0,
                    totalDuration: 0, averageDuration: 0, calls: [],
                })),
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) return topPeers;
                        if (req instanceof Api.messages.GetSearchCounters) return [{ count: 5 }];
                        if (req instanceof Api.messages.GetCommonChats) return { chats: [] };
                        if (req instanceof Api.messages.Search) return { count: 0 };
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () { /* none */ }),
                    getEntity: jest.fn(async () => ({ bot: false })),
                    // getMessages returns lastMsg without .date → lastMessageDate stays null
                    getMessages: jest.fn(async () => ({ total: 7, 0: {} })),
                },
            };

            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);

            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            expect(doc.relationships.top.length).toBe(1);
            expect(doc.relationships.top[0].lastMessageDate ?? null).toBeNull();
        });

        test('candidate filtered out when getEntity reports a bot', async () => {
            const mobile = '919999000222';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });
            const candUser = new Api.User({ id: bigInt('111'), firstName: 'C', accessHash: bigInt(0) } as any);
            (candUser as any).bot = false;
            const topPeers = new Api.contacts.TopPeers({
                categories: [
                    new Api.TopPeerCategoryPeers({
                        category: new Api.TopPeerCategoryCorrespondents(),
                        count: 1,
                        peers: [new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('111') }), rating: 1 })],
                    }),
                ],
                chats: [],
                users: [candUser],
            });
            const fake: any = {
                getMe: jest.fn(async () => ({ id: { toString: () => 'self1' } })),
                getContacts: jest.fn(async () => ({ users: [] })),
                getchatId: jest.fn(async () => new Api.PeerUser({ userId: bigInt('111') })),
                getChatCallHistory: jest.fn(async () => ({ totalCalls: 0, incoming: 0, outgoing: 0, videoCalls: 0, audioCalls: 0, totalDuration: 0, averageDuration: 0, calls: [] })),
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) return topPeers;
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () { /* none */ }),
                    // getEntity reports a bot → candidate skipped via `continue`
                    getEntity: jest.fn(async () => ({ bot: true })),
                    getMessages: jest.fn(async () => ({ total: 100 })),
                },
            };
            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);
            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            expect(doc.relationships.top.length).toBe(0);
        });

        test('bot users in topPeers and dialogs are excluded; self/excluded ids skipped', async () => {
            const mobile = '919999000223';
            await seedUser({ mobile, relationships: { score: 0, bestScore: 0, top: [] } });

            const botUser = new Api.User({ id: bigInt('888'), firstName: 'Bot', accessHash: bigInt(0) } as any);
            (botUser as any).bot = true; // excluded from userMap
            const realUser = new Api.User({ id: bigInt('111'), firstName: 'Real', accessHash: bigInt(0) } as any);
            (realUser as any).bot = false;

            const topPeers = new Api.contacts.TopPeers({
                categories: [
                    new Api.TopPeerCategoryPeers({
                        category: new Api.TopPeerCategoryCorrespondents(),
                        count: 4,
                        peers: [
                            // self id → skipped
                            new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('999') }), rating: 1 }),
                            // excluded id 777000 → skipped
                            new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('777000') }), rating: 1 }),
                            // bot id present in peers but not in userMap → userMap.get miss → skip
                            new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('888') }), rating: 1 }),
                            // real candidate
                            new Api.TopPeer({ peer: new Api.PeerUser({ userId: bigInt('111') }), rating: 1 }),
                        ],
                    }),
                ],
                chats: [],
                users: [botUser, realUser],
            });

            const fake: any = {
                getMe: jest.fn(async () => ({ id: { toString: () => '999' } })), // selfId = 999
                getContacts: jest.fn(async () => ({ users: [] })),
                getchatId: jest.fn(async () => new Api.PeerUser({ userId: bigInt('111') })),
                getChatCallHistory: jest.fn(async () => ({ totalCalls: 0, incoming: 0, outgoing: 0, videoCalls: 0, audioCalls: 0, totalDuration: 0, averageDuration: 0, calls: [] })),
                client: {
                    invoke: jest.fn(async (req: any) => {
                        if (req instanceof Api.contacts.GetTopPeers) return topPeers;
                        if (req instanceof Api.messages.GetSearchCounters) return [{ count: 1 }];
                        if (req instanceof Api.messages.GetCommonChats) return { chats: [] };
                        if (req instanceof Api.messages.Search) return { count: 0 };
                        return {};
                    }),
                    iterDialogs: jest.fn(async function* () {
                        // a bot user in dialogs → skipped
                        yield { isUser: true, entity: (() => { const b = new Api.User({ id: bigInt('777'), firstName: 'B', accessHash: bigInt(0) } as any); (b as any).bot = true; return b; })() };
                        // self in dialogs → skipped
                        yield { isUser: true, entity: (() => { const s = new Api.User({ id: bigInt('999'), firstName: 'S', accessHash: bigInt(0) } as any); (s as any).bot = false; return s; })() };
                        // a non-user dialog → skipped
                        yield { isUser: false, entity: null };
                    }),
                    getEntity: jest.fn(async () => ({ bot: false })),
                    getMessages: jest.fn(async () => ({ total: 100, 0: { date: Math.floor(Date.now() / 1000) } })),
                },
            };

            jest.spyOn(connectionManager, 'hasClient').mockReturnValue(false);
            jest.spyOn(connectionManager, 'getClient').mockResolvedValue(fake as any);
            jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue(undefined as any);

            await service.computeRelationshipScore(mobile);
            const doc = await model.findOne({ mobile });
            // only the single real candidate (111) survived
            expect(doc.relationships.top.length).toBe(1);
            expect(doc.relationships.top[0].chatId).toBe('111');
        });
    });
});
