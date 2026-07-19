// Mock true externals used by maintenance + remove paths. Hoisted by jest.
const mockSendMessageByCategory = jest.fn();
let mockBotsInstance: any = { sendMessageByCategory: mockSendMessageByCategory };
jest.mock('../../../utils', () => ({
  getBotsServiceInstance: () => mockBotsInstance,
}));
const mockFetchWithTimeout = jest.fn();
jest.mock('../../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: any[]) => mockFetchWithTimeout(...args),
}));
jest.mock('../../../utils/logbots', () => ({
  notifbot: () => 'https://api.telegram.org/botX/sendMessage?chat_id=1',
}));

import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ActiveChannelsService } from '../active-channels.service';
import { ActiveChannel, ActiveChannelSchema, ActiveChannelDocument } from '../schemas/active-channel.schema';

function execQuery<T>(result: T) {
  return {
    exec: jest.fn(async () => result),
  };
}

describe('ActiveChannelsService channel-state persistence', () => {
  test('createMultiple updates canonical identity/live state and preserves bans', async () => {
    const bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
    const service = new ActiveChannelsService({ bulkWrite } as any, {} as any);

    await service.createMultiple([
      {
        channelId: '123',
        title: 'adult chat',
        username: 'adult_chat',
        participantsCount: 1200,
        megagroup: true,
        broadcast: false,
        canSendMsgs: true,
        private: false,
        forbidden: false,
        banned: false,
        bannedAt: null,
      },
    ]);

    expect(bulkWrite).toHaveBeenCalledWith(expect.any(Array), { ordered: false });
    const operation = (bulkWrite.mock.calls as any)[0][0][0].updateOne.update[0].$set;
    expect(operation.title).toEqual({ $literal: 'adult chat' });
    expect(operation.username).toEqual({ $literal: 'adult_chat' });
    expect(operation.participantsCount).toEqual({ $literal: 1200 });
    expect(operation.private).toEqual({ $literal: false });
    expect(operation.broadcast).toEqual({ $literal: false });
    expect(operation.banned).toEqual(expect.any(Object));
    expect(operation.forbidden).toEqual(expect.any(Object));
    expect(operation.canSendMsgs).toEqual(expect.objectContaining({ $cond: expect.any(Array) }));
  });

  test('getActiveChannels does not run a legacy data migration before selecting candidates', async () => {
    const updateMany = jest.fn(() => execQuery({ modifiedCount: 2 }));
    const aggregate = jest.fn(() => execQuery([]));
    const service = new ActiveChannelsService({ updateMany, aggregate } as any, {} as any);

    await service.getActiveChannels(25, 0, []);

    expect(updateMany).not.toHaveBeenCalled();
    expect(aggregate).toHaveBeenCalled();
  });
});

// ─── Real-Mongo backed coverage ──────────────────────────────────────────────
describe('ActiveChannelsService (real Mongo)', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let model: any;
  let promoteStub: any;
  let service: ActiveChannelsService;

  async function seed(overrides: Partial<ActiveChannel> = {}) {
    return model.create({
      channelId: `ac_${Math.random().toString(36).slice(2)}`,
      title: 'Active Channel',
      username: `u_${Math.random().toString(36).slice(2)}`,
      canSendMsgs: true,
      participantsCount: 2000,
      availableMsgs: ['m1', 'm2'],
      ...overrides,
    });
  }

  // Insert a raw document bypassing schema strictness (the promote engine writes
  // fields like successMsgCount / failureMsgCount that aren't in
  // the Mongoose schema; .create() would strip them).
  async function seedRaw(doc: Record<string, any>) {
    return model.collection.insertOne({
      channelId: `acr_${Math.random().toString(36).slice(2)}`,
      title: 'Active Channel',
      username: `ur_${Math.random().toString(36).slice(2)}`,
      canSendMsgs: true,
      participantsCount: 2000,
      availableMsgs: ['m1', 'm2'],
      ...doc,
    });
  }

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'activeChannelsSvc' }).asPromise();
    model = connection.model<ActiveChannelDocument>('ActiveChannelGroupA', ActiveChannelSchema);
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBotsInstance = { sendMessageByCategory: mockSendMessageByCategory };
    await model.deleteMany({});
    promoteStub = { findOne: jest.fn().mockResolvedValue({ promo1: 'a', promo2: 'b' }) };
    service = new ActiveChannelsService(model, promoteStub);
  });

  describe('create', () => {
    test('creates with available messages', async () => {
      const c = await service.create({ channelId: 'c1', title: 'T' } as any);
      expect(c.channelId).toBe('c1');
      expect((c as any).availableMsgs).toEqual(['promo1', 'promo2']);
    });

    test('throws BadRequest when channelId missing', async () => {
      await expect(service.create({ title: 'no id' } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll / findOne / update', () => {
    test('findAll', async () => {
      await seed(); await seed();
      expect((await service.findAll()).length).toBe(2);
    });

    test('findOne returns null when missing, doc when found', async () => {
      await seed({ channelId: 'fo-1' });
      expect(await service.findOne('fo-1')).toBeTruthy();
      expect(await service.findOne('missing')).toBeNull();
    });

    test('findOne throws BadRequest when no channelId', async () => {
      await expect(service.findOne('')).rejects.toBeInstanceOf(BadRequestException);
    });

    test('update strips _id and upserts', async () => {
      await seed({ channelId: 'up-1' });
      const r = await service.update('up-1', { participantsCount: 50, _id: 'x' } as any);
      expect(r.participantsCount).toBe(50);
    });

    test('runtime-style updates cannot override a durable ban without explicit unban', async () => {
      await seed({ channelId: 'up-ban', banned: true, bannedAt: 123, canSendMsgs: false });
      const stillBanned = await service.update('up-ban', { canSendMsgs: true } as any);
      expect(stillBanned.banned).toBe(true);
      expect(stillBanned.canSendMsgs).toBe(false);

      const unbanned = await service.update('up-ban', { banned: false, canSendMsgs: true } as any);
      expect(unbanned.banned).toBe(false);
      expect(unbanned.bannedAt).toBeNull();
      expect(unbanned.canSendMsgs).toBe(false);
      expect(unbanned.lastHydrationStatus).toBe('needs_hydration');
      expect(unbanned.lastHydrationReason).toBe('operator_unbanned');
    });

    test('live refresh can clear private, but cannot clear forbidden', async () => {
      await seed({
        channelId: 'up-durable-block',
        private: true,
        forbidden: true,
        canSendMsgs: false,
      });

      const stillBlocked = await service.update('up-durable-block', {
        private: false,
        forbidden: false,
        canSendMsgs: true,
      } as any);

      expect(stillBlocked.private).toBe(false);
      expect(stillBlocked.forbidden).toBe(true);
      expect(stillBlocked.canSendMsgs).toBe(false);
    });

    test('update throws BadRequest with empty channelId', async () => {
      await expect(service.update('', { participantsCount: 1 } as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    test('update throws BadRequest when no fields to update', async () => {
      await expect(service.update('any', { foo: undefined } as any)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('available msgs add/remove', () => {
    test('addToAvailableMsgs', async () => {
      await seed({ channelId: 'am-1', availableMsgs: ['a'] });
      const r = await service.addToAvailableMsgs('am-1', 'b');
      expect(r.availableMsgs).toEqual(expect.arrayContaining(['a', 'b']));
    });

    test('removeFromAvailableMsgs', async () => {
      await seed({ channelId: 'rm-1', availableMsgs: ['a', 'b'] });
      const r = await service.removeFromAvailableMsgs('rm-1', 'a');
      expect(r.availableMsgs).toEqual(['b']);
    });

    test('addToAvailableMsgs throws BadRequest on missing args', async () => {
      await expect(service.addToAvailableMsgs('', 'x')).rejects.toBeInstanceOf(BadRequestException);
    });

    test('removeFromAvailableMsgs throws BadRequest on missing args', async () => {
      await expect(service.removeFromAvailableMsgs('c', '')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    test('sends notification + deletes', async () => {
      await seed({ channelId: 'del-1' });
      await service.remove('del-1');
      expect(mockSendMessageByCategory).toHaveBeenCalled();
      expect(await model.findOne({ channelId: 'del-1' })).toBeNull();
    });

    test('works when no bots instance', async () => {
      mockBotsInstance = null;
      await seed({ channelId: 'del-2' });
      await service.remove('del-2');
      expect(await model.findOne({ channelId: 'del-2' })).toBeNull();
    });

    test('throws BadRequest when no channelId', async () => {
      await expect(service.remove('')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('search / createMultiple / executeQuery', () => {
    test('search returns matches', async () => {
      await seed({ channelId: 'se-1', canSendMsgs: false });
      expect((await service.search({ canSendMsgs: false })).length).toBe(1);
    });

    test('search throws BadRequest on empty filter', async () => {
      await expect(service.search({})).rejects.toBeInstanceOf(BadRequestException);
    });

    test('search REJECTS injected Mongo operators (NoSQL injection guard)', async () => {
      // Express parses ?title[$ne]=__none__ into { title: { $ne: '__none__' } }. Passed raw to
      // Model.find() this returns the WHOLE collection (operator injection / filter bypass).
      await seed({ channelId: 'inj-1', title: 'real' });
      await seed({ channelId: 'inj-2', title: 'also-real' });
      await expect(service.search({ title: { $ne: '__none__' } } as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    test('search rejects a top-level $where/$expr operator key', async () => {
      await seed({ channelId: 'inj-3' });
      await expect(service.search({ $where: 'true' } as any))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    test('createMultiple upserts', async () => {
      const r = await service.createMultiple([
        { channelId: 'cm-1', title: 'A' } as any,
        { channelId: 'cm-2', canSendMsgs: false } as any,
      ]);
      expect(r).toContain('2 channels');
    });

    test('createMultiple refreshes identity without clearing an existing ban', async () => {
      await seedRaw({
        channelId: 'cm-banned',
        banned: true,
        bannedAt: 1234,
        title: 'Old title',
        username: 'old_user',
        participantsCount: 100,
      });

      await service.createMultiple([{
        channelId: 'cm-banned',
        title: 'Fresh title',
        username: 'fresh_user',
        participantsCount: 1500,
        canSendMsgs: true,
      }]);

      const refreshed = await model.collection.findOne({ channelId: 'cm-banned' });
      expect(refreshed.banned).toBe(true);
      expect(refreshed.bannedAt).toBe(1234);
      expect(refreshed.canSendMsgs).toBe(false);
      expect(refreshed.title).toBe('Fresh title');
      expect(refreshed.username).toBe('fresh_user');
      expect(refreshed.participantsCount).toBe(1500);
    });

    test('createMultiple keeps forbidden channels unsendable while refreshing live identity', async () => {
      await seedRaw({
        channelId: 'cm-forbidden',
        forbidden: true,
        canSendMsgs: false,
        title: 'Old title',
      });

      await service.createMultiple([{
        channelId: 'cm-forbidden',
        title: 'Fresh title',
        canSendMsgs: true,
        private: false,
        broadcast: false,
      }]);

      const refreshed = await model.collection.findOne({ channelId: 'cm-forbidden' });
      expect(refreshed.forbidden).toBe(true);
      expect(refreshed.canSendMsgs).toBe(false);
      expect(refreshed.title).toBe('Fresh title');
    });

    test('createMultiple throws on empty', async () => {
      await expect(service.createMultiple([])).rejects.toBeInstanceOf(BadRequestException);
    });

    test('createMultiple throws when dto missing channelId', async () => {
      await expect(service.createMultiple([{ title: 'x' } as any])).rejects.toBeInstanceOf(BadRequestException);
    });

    test('executeQuery with sort/limit/skip', async () => {
      await seed({ channelId: 'eq-1', participantsCount: 10 });
      await seed({ channelId: 'eq-2', participantsCount: 20 });
      const r = await service.executeQuery({ canSendMsgs: true }, { participantsCount: -1 }, 1, 0);
      expect(r.length).toBe(1);
    });

    test('executeQuery throws BadRequest on empty query', async () => {
      await expect(service.executeQuery({})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('analytics', () => {
    test('aggregates analytics with canonical facets', async () => {
      await seedRaw({ channelId: 'an-1', successMsgCount: 10, failureMsgCount: 2, deletedCount: 1, participantsCount: 12000, freeformDeletedCount: 1, followUpDeletedCount: 1, canSendMsgs: false, lastHydrationReason: 'write_forbidden' });
      await seedRaw({ channelId: 'an-2', successMsgCount: 5, failureMsgCount: 5, participantsCount: 1500, banned: true, availableMsgs: [] });
      const a = await service.analytics();
      expect(a.overview.total).toBe(2);
      expect(a.messages.totalSent).toBe(15);
      expect(a.restrictions.totalFreeformDeletions).toBe(1);
      expect(Array.isArray(a.successRateDistribution)).toBe(true);
      expect(Array.isArray(a.topBySuccess)).toBe(true);
    });

    test('analytics handles empty collection (default fallbacks)', async () => {
      const a = await service.analytics();
      expect(a.overview.total).toBe(0);
      expect(a.messages.successRate).toBe(0);
    });
  });

  describe('paginated', () => {
    test('empty result returns zeros', async () => {
      const r = await service.paginated({ filter: 'all' });
      expect(r.total).toBe(0);
      expect(r.totalPages).toBe(0);
    });

    test('filter can_send + pagination + asc sort', async () => {
      await seed({ channelId: 'p1', canSendMsgs: true, successMsgCount: 1 } as any);
      await seed({ channelId: 'p2', canSendMsgs: true, successMsgCount: 2 } as any);
      const r = await service.paginated({ filter: 'can_send', page: 1, limit: 1, sortOrder: 'asc', sortBy: 'successMsgCount' });
      expect(r.total).toBe(2);
      expect(r.channels.length).toBe(1);
      expect(r.totalPages).toBe(2);
    });

    test('filter banned (banned or forbidden)', async () => {
      await seed({ channelId: 'p4', banned: true });
      await seed({ channelId: 'p5', forbidden: true });
      const r = await service.paginated({ filter: 'banned' });
      expect(r.total).toBe(2);
    });

    // 'temp_banned' filter removed — tempBan was a dead flag never set true.

    test('filter unsendable excludes terminal channel states', async () => {
      await seed({ channelId: 'p7', canSendMsgs: false });
      await seed({ channelId: 'p7-banned', canSendMsgs: false, banned: true });
      await seed({ channelId: 'p7-private', canSendMsgs: false, private: true });
      const r = await service.paginated({ filter: 'unsendable' });
      expect(r.total).toBe(1);
    });

    test('filter exhausted', async () => {
      await seed({ channelId: 'p8', availableMsgs: [] });
      const r = await service.paginated({ filter: 'exhausted' });
      expect(r.total).toBe(1);
    });

    test('filter high_deleted', async () => {
      await seed({ channelId: 'p9', deletedCount: 40 } as any);
      const r = await service.paginated({ filter: 'high_deleted' });
      expect(r.total).toBe(1);
    });

    test('search term path', async () => {
      await seed({ channelId: 'searchable-id', title: 'Unique Topic' });
      const r = await service.paginated({ search: 'Unique' });
      expect(r.total).toBe(1);
    });

    test('filter=banned + search keeps BOTH constraints (search must not drop the banned filter)', async () => {
      // The search $or previously overwrote the banned $or, returning unbanned channels too.
      await seed({ channelId: 'b-alpha', banned: true, title: 'alpha banned' });
      await seed({ channelId: 'ok-alpha', banned: false, forbidden: false, title: 'alpha healthy' });
      const r = await service.paginated({ filter: 'banned', search: 'alpha' });
      expect(r.total).toBe(1); // only the banned 'alpha', not the healthy one
    });

    test('search term with regex metacharacters is matched literally (no ReDoS / over-match)', async () => {
      await seed({ channelId: 'lit-1', title: 'a.b.c' });
      await seed({ channelId: 'lit-2', title: 'axbxc' });
      // "a.b.c" must match the literal title only, not the regex-wildcard 'axbxc'.
      const r = await service.paginated({ search: 'a.b.c' });
      expect(r.total).toBe(1);
    });
  });

  describe('maintenance ops (fetchWithTimeout mocked)', () => {
    test('resetMessageDeletionCounters', async () => {
      mockFetchWithTimeout.mockResolvedValue(undefined);
      await seed({ channelId: 'w1', banned: false, freeformDeletedCount: 5 } as any);
      await service.resetMessageDeletionCounters();
      const c = await model.findOne({ channelId: 'w1' });
      expect(c.freeformDeletedCount).toBe(0);
      expect(mockFetchWithTimeout).toHaveBeenCalled();
    });

    test('resetMessageDeletionCounters error wrapped', async () => {
      mockFetchWithTimeout.mockRejectedValue(new Error('net'));
      await expect(service.resetMessageDeletionCounters()).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    test('resetAvailableMsgs refills sparse channels', async () => {
      mockFetchWithTimeout.mockResolvedValue(undefined);
      await seed({ channelId: 'av-1', availableMsgs: [] });
      await service.resetAvailableMsgs();
      const c = await model.findOne({ channelId: 'av-1' });
      expect(c.availableMsgs.length).toBeGreaterThan(0);
    });

    test('updateBannedChannels', async () => {
      mockFetchWithTimeout.mockResolvedValue(undefined);
      await seed({ channelId: 'b-1', banned: true, freeformDeletedCount: 3 } as any);
      await service.updateBannedChannels();
      const c = await model.findOne({ channelId: 'b-1' });
      expect(c.freeformDeletedCount).toBe(0);
    });

    test('updateBannedChannels error wrapped', async () => {
      mockFetchWithTimeout.mockRejectedValue(new Error('net'));
      await expect(service.updateBannedChannels()).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('getAvailableMessages NotFound handling', () => {
    test('returns [] when promoteMsgsService throws NotFound', async () => {
      promoteStub.findOne.mockRejectedValue(new NotFoundException('none'));
      const c = await service.create({ channelId: 'nf-1', title: 'T' } as any);
      expect((c as any).availableMsgs).toEqual([]);
    });

    test('returns [] when error has 404 status', async () => {
      promoteStub.findOne.mockRejectedValue({ status: 404 });
      const c = await service.create({ channelId: 'nf-2', title: 'T' } as any);
      expect((c as any).availableMsgs).toEqual([]);
    });

    test('rethrows non-404 errors (wrapped)', async () => {
      promoteStub.findOne.mockRejectedValue(new Error('db down'));
      await expect(service.create({ channelId: 'nf-3', title: 'T' } as any)).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('autoHealChannels', () => {
    test('heals expired reactRestricted', async () => {
      const oldDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await seed({ channelId: 'h1', reactRestricted: true, reactRestrictedAt: oldDate } as any);
      const r = await service.autoHealChannels();
      expect(r.reactRestrictedHealed).toBe(1);
      const c1 = await model.findOne({ channelId: 'h1' });
      expect(c1.reactRestricted).toBe(false);
      // tempBan healing was removed (dead flag); the return no longer carries tempBanHealed.
      expect((r as Record<string, unknown>).tempBanHealed).toBeUndefined();
    });

    test('does not heal recent restrictions', async () => {
      await seed({ channelId: 'h3', reactRestricted: true, reactRestrictedAt: new Date() } as any);
      const r = await service.autoHealChannels();
      expect(r.reactRestrictedHealed).toBe(0);
    });
  });

  describe('incrementClientsJoined', () => {
    test('increments and swallows errors', async () => {
      await seed({ channelId: 'inc-1', clientsJoined: 0 } as any);
      await service.incrementClientsJoined('inc-1');
      const c = await model.findOne({ channelId: 'inc-1' });
      expect(c.clientsJoined).toBe(1);
      // error path: bad model call should not throw
      const spy = jest.spyOn(model, 'updateOne').mockRejectedValueOnce(new Error('x'));
      await expect(service.incrementClientsJoined('inc-1')).resolves.toBeUndefined();
      spy.mockRestore();
    });
  });

  describe('getActiveChannels (real)', () => {
    test('returns candidates via aggregation', async () => {
      await seed({ channelId: 'ga-1', title: 'cool one', username: 'coolone', participantsCount: 5000, canSendMsgs: true, successMsgCount: 1, deletedCount: 0 } as any);
      const r = await service.getActiveChannels(10, 0, []);
      expect(Array.isArray(r)).toBe(true);
    });

    test('error path wrapped via handleError', async () => {
      const spy = jest.spyOn(model, 'aggregate').mockImplementationOnce(() => { throw new Error('agg'); });
      await expect(service.getActiveChannels(10, 0, [])).rejects.toBeInstanceOf(InternalServerErrorException);
      spy.mockRestore();
    });
  });
});
