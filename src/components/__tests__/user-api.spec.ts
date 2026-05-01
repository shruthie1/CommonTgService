/**
 * Users API integration tests.
 *
 * Real MongoDB (memory-server), real service logic.
 * External deps (Telegram, bots, clients, connection-manager) are mocked.
 */
import {
    MongoTestContext,
    startMongo,
    stopMongo,
    createUserModel,
    makeUserData,
    resetCounter,
    mockTelegramService,
    mockBotsService,
} from './api-test-helpers';
import { UsersService } from '../users/users.service';
import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';

// Mock telegram/Helpers sleep to be instant
jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));

// Mock connection-manager to avoid real TG connections
jest.mock('../Telegram/utils/connection-manager', () => ({
    connectionManager: {
        hasClient: jest.fn(() => false),
        getClient: jest.fn().mockRejectedValue(new Error('mocked: no TG connection')),
        unregisterClient: jest.fn().mockResolvedValue(undefined),
    },
}));

describe('Users API', () => {
    let ctx: MongoTestContext;
    let userModel: Model<UserDocument>;
    let service: UsersService;
    let telegramService: any;
    let botsService: ReturnType<typeof mockBotsService>;
    const mockClientService = { updateClientSession: jest.fn() };

    beforeAll(async () => {
        ctx = await startMongo('user-api-test');
        userModel = createUserModel(ctx.connection);
        await userModel.ensureIndexes();
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    beforeEach(async () => {
        await userModel.deleteMany({});
        resetCounter();
        telegramService = {
            ...mockTelegramService(),
            getOwnAccountMobiles: jest.fn().mockResolvedValue([]),
            getOwnAccountTgIds: jest.fn().mockResolvedValue([]),
        } as any;
        botsService = mockBotsService();
        service = new UsersService(
            userModel,
            telegramService as any,
            mockClientService as any,
            botsService as any,
        );
    });

    // ─── CREATE ──────────────────────────────────────────────────────────────

    describe('create', () => {
        it('should create a user with all fields', async () => {
            const data = makeUserData();
            const result = await service.create(data);
            expect(result).toBeDefined();
            expect(result.mobile).toBe(data.mobile);
            expect(result.tgId).toBe(data.tgId);
            expect(result.firstName).toBe(data.firstName);
            expect(result.channels).toBe(data.channels);
        });

        it('should create with minimal required fields and apply defaults', async () => {
            const data = { mobile: '+15559000001', session: 'sess-min', tgId: 'tg-min', firstName: 'Min' };
            const result = await service.create(data as any);
            expect(result).toBeDefined();
            // twoFA has no Mongoose-level default — only a class-level default that applies when DTO is instantiated
            // When saving raw data without DTO instantiation, it's undefined
            expect(result.expired).toBe(false);
            expect(result.starred).toBe(false);
            expect(result.calls).toEqual({ totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0 });
            expect(result.relationships).toEqual({ score: 0, bestScore: 0, computedAt: null, top: [] });
        });

        it('should reject duplicate mobile', async () => {
            const data = makeUserData();
            await service.create(data);
            await expect(service.create({ ...makeUserData(), mobile: data.mobile }))
                .rejects.toThrow(/duplicate key|E11000/);
        });

        it('should reject duplicate tgId', async () => {
            const data = makeUserData();
            await service.create(data);
            await expect(service.create({ ...makeUserData(), tgId: data.tgId }))
                .rejects.toThrow(/duplicate key|E11000/);
        });

        it('should send bot notification on normal create', async () => {
            await service.create(makeUserData());
            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
        });

        it('should call updateClientSession when activeClientSetup matches', async () => {
            const data = makeUserData();
            telegramService.getActiveClientSetup = jest.fn(() => ({
                newMobile: data.mobile,
                clientId: 'client-x',
            }));
            const result = await service.create(data);
            expect(result).toBeUndefined();
            expect(mockClientService.updateClientSession).toHaveBeenCalledWith(data.session, data.mobile);
            expect(botsService.sendMessageByCategory).not.toHaveBeenCalled();
        });
    });

    // ─── FIND ONE ────────────────────────────────────────────────────────────

    describe('findOne', () => {
        it('should find a user by tgId', async () => {
            const data = makeUserData();
            await service.create(data);
            const found = await service.findOne(data.tgId);
            expect(found.mobile).toBe(data.mobile);
            expect(found.tgId).toBe(data.tgId);
        });

        it('should throw NotFoundException for missing tgId', async () => {
            await expect(service.findOne('nonexistent'))
                .rejects.toThrow(NotFoundException);
        });

        it('should return JSON without _id', async () => {
            const data = makeUserData();
            await service.create(data);
            const found = await service.findOne(data.tgId);
            expect((found as any)._id).toBeUndefined();
        });
    });

    // ─── FIND ALL ────────────────────────────────────────────────────────────

    describe('findAll / findAllSorted', () => {
        it('should return all users with default limit', async () => {
            await service.create(makeUserData());
            await service.create(makeUserData());
            const all = await service.findAll();
            expect(all).toHaveLength(2);
        });

        it('should respect limit and skip', async () => {
            for (let i = 0; i < 5; i++) await service.create(makeUserData());
            const page = await service.findAll(2, 1);
            expect(page).toHaveLength(2);
        });

        it('should sort by specified field', async () => {
            await service.create(makeUserData({ msgs: 100 }));
            await service.create(makeUserData({ msgs: 50 }));
            await service.create(makeUserData({ msgs: 200 }));
            const sorted = await service.findAllSorted(10, 0, { msgs: -1 });
            expect(sorted[0].msgs).toBe(200);
            expect(sorted[1].msgs).toBe(100);
            expect(sorted[2].msgs).toBe(50);
        });

        it('should exclude own account mobiles', async () => {
            const own = makeUserData();
            const other = makeUserData();
            await service.create(own);
            await service.create(other);
            telegramService.getOwnAccountMobiles = jest.fn().mockResolvedValue([own.mobile]);
            const result = await service.findAllSorted(100, 0);
            expect(result).toHaveLength(1);
            expect(result[0].mobile).toBe(other.mobile);
        });
    });

    // ─── UPDATE ──────────────────────────────────────────────────────────────

    describe('update', () => {
        it('should update and return the updated doc', async () => {
            const data = makeUserData();
            await service.create(data);
            const updated = await service.update(data.tgId, { firstName: 'NewName' });
            expect(updated.firstName).toBe('NewName');
            expect(updated.tgId).toBe(data.tgId);
        });

        it('should persist the update in DB', async () => {
            const data = makeUserData();
            await service.create(data);
            await service.update(data.tgId, { channels: 999 });
            const found = await service.findOne(data.tgId);
            expect(found.channels).toBe(999);
        });

        it('should throw NotFoundException for missing tgId', async () => {
            await expect(service.update('nonexistent', { firstName: 'X' }))
                .rejects.toThrow(NotFoundException);
        });

        it('should update boolean fields', async () => {
            const data = makeUserData({ twoFA: false });
            await service.create(data);
            const updated = await service.update(data.tgId, { twoFA: true });
            expect(updated.twoFA).toBe(true);
        });

        it('should update expired flag (soft delete via update)', async () => {
            const data = makeUserData();
            await service.create(data);
            const updated = await service.update(data.tgId, { expired: true });
            expect(updated.expired).toBe(true);
        });

        it('should not affect other fields when updating one field', async () => {
            const data = makeUserData({ firstName: 'Original', msgs: 42 });
            await service.create(data);
            const updated = await service.update(data.tgId, { firstName: 'Changed' });
            expect(updated.firstName).toBe('Changed');
            expect(updated.msgs).toBe(42);
        });
    });

    // ─── DELETE (expire) ─────────────────────────────────────────────────────

    describe('delete (expire)', () => {
        it('should set expired to true', async () => {
            const data = makeUserData();
            await service.create(data);
            await service.delete(data.tgId);
            const found = await service.findOne(data.tgId);
            expect(found.expired).toBe(true);
        });

        it('should throw NotFoundException for missing tgId', async () => {
            await expect(service.delete('nonexistent'))
                .rejects.toThrow(NotFoundException);
        });

        it('should not actually remove the document', async () => {
            const data = makeUserData();
            await service.create(data);
            await service.delete(data.tgId);
            const count = await userModel.countDocuments({});
            expect(count).toBe(1);
        });
    });

    // ─── TOGGLE STAR ─────────────────────────────────────────────────────────

    describe('toggleStar', () => {
        it('should toggle from false to true', async () => {
            const data = makeUserData();
            await service.create(data);
            const result = await service.toggleStar(data.mobile);
            expect(result).toEqual({ mobile: data.mobile, starred: true });
        });

        it('should toggle from true back to false', async () => {
            const data = makeUserData({ starred: true } as any);
            await service.create(data);
            const result = await service.toggleStar(data.mobile);
            expect(result).toEqual({ mobile: data.mobile, starred: false });
        });

        it('should throw NotFoundException for missing mobile', async () => {
            await expect(service.toggleStar('+10000000000'))
                .rejects.toThrow(NotFoundException);
        });

        it('should persist the toggle', async () => {
            const data = makeUserData();
            await service.create(data);
            await service.toggleStar(data.mobile);
            const found = await service.findOne(data.tgId);
            expect(found.starred).toBe(true);
        });
    });

    // ─── SEARCH ──────────────────────────────────────────────────────────────

    describe('search', () => {
        it('should find by tgId', async () => {
            const data = makeUserData();
            await service.create(data);
            const results = await service.search({ tgId: data.tgId });
            expect(results).toHaveLength(1);
            expect(results[0].tgId).toBe(data.tgId);
        });

        it('should find by mobile', async () => {
            const data = makeUserData();
            await service.create(data);
            const results = await service.search({ mobile: data.mobile });
            expect(results).toHaveLength(1);
        });

        it('should do partial match on firstName (case-insensitive)', async () => {
            await service.create(makeUserData({ firstName: 'Alexandra' }));
            await service.create(makeUserData({ firstName: 'Alex' }));
            await service.create(makeUserData({ firstName: 'Bob' }));
            const results = await service.search({ firstName: 'alex' });
            expect(results).toHaveLength(2);
        });

        it('should return empty for no matches', async () => {
            await service.create(makeUserData());
            const results = await service.search({ tgId: 'nonexistent' });
            expect(results).toHaveLength(0);
        });

        it('should exclude own account mobiles when no mobile filter', async () => {
            const own = makeUserData();
            const other = makeUserData();
            await service.create(own);
            await service.create(other);
            telegramService.getOwnAccountMobiles = jest.fn().mockResolvedValue([own.mobile]);
            const results = await service.search({});
            expect(results).toHaveLength(1);
            expect(results[0].mobile).toBe(other.mobile);
        });

        it('should NOT exclude own mobiles when mobile filter is present', async () => {
            const own = makeUserData();
            await service.create(own);
            telegramService.getOwnAccountMobiles = jest.fn().mockResolvedValue([own.mobile]);
            const results = await service.search({ mobile: own.mobile });
            expect(results).toHaveLength(1);
        });
    });

    // ─── EXECUTE QUERY ───────────────────────────────────────────────────────

    describe('executeQuery', () => {
        it('should query with a filter', async () => {
            await service.create(makeUserData({ channels: 50 }));
            await service.create(makeUserData({ channels: 200 }));
            const results = await service.executeQuery({ channels: { $gte: 100 } });
            expect(results).toHaveLength(1);
            expect(results[0].channels).toBe(200);
        });

        it('should support sort', async () => {
            await service.create(makeUserData({ msgs: 10 }));
            await service.create(makeUserData({ msgs: 30 }));
            await service.create(makeUserData({ msgs: 20 }));
            const results = await service.executeQuery({}, { msgs: 1 });
            expect(results[0].msgs).toBe(10);
            expect(results[2].msgs).toBe(30);
        });

        it('should support limit and skip', async () => {
            for (let i = 0; i < 5; i++) await service.create(makeUserData());
            const results = await service.executeQuery({}, undefined, 2, 1);
            expect(results).toHaveLength(2);
        });
    });

    // ─── UPDATE BY FILTER ────────────────────────────────────────────────────

    describe('updateByFilter', () => {
        it('should update all matching docs', async () => {
            await service.create(makeUserData({ gender: 'male' }));
            await service.create(makeUserData({ gender: 'male' }));
            await service.create(makeUserData({ gender: 'female' }));
            const count = await service.updateByFilter({ gender: 'male' }, { channels: 999 } as any);
            expect(count).toBe(2);
            const results = await service.executeQuery({ channels: 999 });
            expect(results).toHaveLength(2);
        });

        it('should throw NotFoundException if no docs match', async () => {
            await expect(service.updateByFilter({ tgId: 'nope' }, { channels: 1 } as any))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ─── GET USER RELATIONSHIPS ──────────────────────────────────────────────

    describe('getUserRelationships', () => {
        it('should return user with relationship fields', async () => {
            const data = makeUserData();
            await service.create(data);
            const result = await service.getUserRelationships(data.mobile);
            expect(result.mobile).toBe(data.mobile);
            expect(result.relationships).toBeDefined();
            expect(result.relationships.score).toBe(0);
            expect(result.relationships.top).toEqual([]);
        });

        it('should throw NotFoundException for missing mobile', async () => {
            await expect(service.getUserRelationships('+10000000000'))
                .rejects.toThrow(NotFoundException);
        });

        it('should only select specific fields', async () => {
            const data = makeUserData();
            await service.create(data);
            const result = await service.getUserRelationships(data.mobile);
            // Should have these fields
            expect(result.mobile).toBeDefined();
            expect(result.firstName).toBeDefined();
            expect(result.tgId).toBeDefined();
            expect(result.relationships).toBeDefined();
            // Should NOT have session (excluded by .select)
            expect((result as any).session).toBeUndefined();
            expect((result as any).channels).toBeUndefined();
        });
    });

    // ─── TOP / TOP-INTERACTED ────────────────────────────────────────────────

    describe('top (top-interacted)', () => {
        it('should return paginated results', async () => {
            for (let i = 0; i < 5; i++) {
                const data = makeUserData();
                await service.create(data);
                await userModel.updateOne({ tgId: data.tgId }, { $set: { 'relationships.score': (i + 1) * 10 } });
            }
            const result = await service.top({ page: 1, limit: 2 });
            expect(result.users).toHaveLength(2);
            expect(result.total).toBe(5);
            expect(result.totalPages).toBe(3);
            expect(result.page).toBe(1);
            expect(result.limit).toBe(2);
        });

        it('should filter by minScore', async () => {
            const d1 = makeUserData();
            const d2 = makeUserData();
            await service.create(d1);
            await service.create(d2);
            await userModel.updateOne({ tgId: d1.tgId }, { $set: { 'relationships.score': 50 } });
            await userModel.updateOne({ tgId: d2.tgId }, { $set: { 'relationships.score': 5 } });
            const result = await service.top({ minScore: 30 });
            expect(result.users).toHaveLength(1);
            expect(result.users[0].tgId).toBe(d1.tgId);
        });

        it('should exclude expired users', async () => {
            const data = makeUserData();
            await service.create(data);
            await userModel.updateOne({ tgId: data.tgId }, { $set: { expired: true, 'relationships.score': 100 } });
            const result = await service.top({});
            expect(result.users).toHaveLength(0);
        });

        it('should exclude twoFA users when excludeTwoFA is true', async () => {
            const d1 = makeUserData({ twoFA: true });
            const d2 = makeUserData({ twoFA: false });
            await service.create(d1);
            await service.create(d2);
            const result = await service.top({ excludeTwoFA: true });
            expect(result.users).toHaveLength(1);
            expect(result.users[0].twoFA).toBe(false);
        });

        it('should return empty for no matches', async () => {
            const result = await service.top({ minScore: 999 });
            expect(result).toEqual({ users: [], total: 0, page: 1, limit: 20, totalPages: 0 });
        });

        it('should sort by relationships.score descending', async () => {
            const d1 = makeUserData();
            const d2 = makeUserData();
            await service.create(d1);
            await service.create(d2);
            await userModel.updateOne({ tgId: d1.tgId }, { $set: { 'relationships.score': 30 } });
            await userModel.updateOne({ tgId: d2.tgId }, { $set: { 'relationships.score': 80 } });
            const result = await service.top({});
            expect(result.users[0].tgId).toBe(d2.tgId);
            expect(result.users[1].tgId).toBe(d1.tgId);
        });
    });

    // ─── TOP RELATIONSHIPS ───────────────────────────────────────────────────

    describe('topRelationships', () => {
        it('should filter by bestScore > minScore', async () => {
            const d1 = makeUserData();
            const d2 = makeUserData();
            await service.create(d1);
            await service.create(d2);
            await userModel.updateOne({ tgId: d1.tgId }, { $set: { 'relationships.bestScore': 80 } });
            await userModel.updateOne({ tgId: d2.tgId }, { $set: { 'relationships.bestScore': 5 } });
            const result = await service.topRelationships({ minScore: 50 });
            expect(result.users).toHaveLength(1);
        });

        it('should filter by gender', async () => {
            const d1 = makeUserData({ gender: 'female' });
            const d2 = makeUserData({ gender: 'male' });
            await service.create(d1);
            await service.create(d2);
            await userModel.updateMany({}, { $set: { 'relationships.bestScore': 10 } });
            const result = await service.topRelationships({ gender: 'female' });
            expect(result.users).toHaveLength(1);
            expect(result.users[0].gender).toBe('female');
        });
    });

    // ─── AGGREGATE SORT ──────────────────────────────────────────────────────

    describe('aggregateSort', () => {
        it('should sort by intimateTotal computed field', async () => {
            const d1 = makeUserData();
            const d2 = makeUserData();
            await service.create(d1);
            await service.create(d2);
            await userModel.updateOne({ tgId: d1.tgId }, {
                $set: { 'relationships.top': [{ intimateMessageCount: 10 }, { intimateMessageCount: 5 }] },
            });
            await userModel.updateOne({ tgId: d2.tgId }, {
                $set: { 'relationships.top': [{ intimateMessageCount: 100 }] },
            });
            const result = await service.aggregateSort('intimateTotal', -1, 10, 0);
            expect(result).toHaveLength(2);
            expect(result[0].tgId).toBe(d2.tgId);
        });

        it('should throw BadRequestException for unknown field', async () => {
            await expect(service.aggregateSort('unknownField', -1))
                .rejects.toThrow(/Unknown computed field/);
        });

        it('should respect limit and skip', async () => {
            for (let i = 0; i < 5; i++) await service.create(makeUserData());
            const result = await service.aggregateSort('intimateTotal', -1, 2, 1);
            expect(result).toHaveLength(2);
        });
    });

    // ─── SCHEMA DEFAULTS ─────────────────────────────────────────────────────

    describe('schema defaults', () => {
        it('should have timestamps', async () => {
            const data = makeUserData();
            await service.create(data);
            const raw = await userModel.findOne({ tgId: data.tgId }).lean();
            expect((raw as any).createdAt).toBeInstanceOf(Date);
            expect((raw as any).updatedAt).toBeInstanceOf(Date);
        });

        it('should default calls to zeroes', async () => {
            const data = makeUserData();
            delete data.calls;
            await service.create(data);
            const found = await service.findOne(data.tgId);
            expect(found.calls).toEqual({ totalCalls: 0, outgoing: 0, incoming: 0, video: 0, audio: 0 });
        });

        it('should default relationships to empty', async () => {
            const data = makeUserData();
            await service.create(data);
            const found = await service.findOne(data.tgId);
            expect(found.relationships).toEqual({ score: 0, bestScore: 0, computedAt: null, top: [] });
        });
    });
});
