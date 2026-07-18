/**
 * ChannelsService coverage spec — real MongoDB (mongodb-memory-server).
 * Mocks ../../utils so getBotsServiceInstance is controllable.
 */
const mockSendMessageByCategory = jest.fn();
let mockBotsInstance: any = { sendMessageByCategory: mockSendMessageByCategory };

jest.mock('../../../utils', () => ({
  getBotsServiceInstance: () => mockBotsInstance,
}));

import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ChannelsService } from '../channels.service';
import { Channel, ChannelSchema, ChannelDocument } from '../schemas/channel.schema';

let mongod: MongoMemoryServer;
let connection: Connection;
let model: any;
let service: ChannelsService;

async function seed(overrides: Partial<Channel> = {}) {
  return model.create({
    channelId: `ch_${Math.random().toString(36).slice(2)}`,
    title: 'Test Channel',
    username: `user_${Math.random().toString(36).slice(2)}`,
    canSendMsgs: true,
    participantsCount: 2000,
    ...overrides,
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'channelsSvc' }).asPromise();
  model = connection.model<ChannelDocument>('ChannelGroupA', ChannelSchema);
});

afterAll(async () => {
  if (connection) { await connection.dropDatabase(); await connection.close(); }
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockBotsInstance = { sendMessageByCategory: mockSendMessageByCategory };
  await model.deleteMany({});
  service = new ChannelsService(model);
});

describe('ChannelsService - CRUD', () => {
  test('create', async () => {
    const c = await service.create({ channelId: 'c1', title: 'T', canSendMsgs: true, participantsCount: 1, private: false, forbidden: false } as any);
    expect(c.channelId).toBe('c1');
  });

  test('findAll returns documents', async () => {
    await seed(); await seed();
    const all = await service.findAll();
    expect(all.length).toBe(2);
  });

  test('findOne returns json when found, undefined when missing', async () => {
    const ch = await seed({ channelId: 'find-me' });
    const found = await service.findOne('find-me');
    expect(found.channelId).toBe('find-me');
    const missing = await service.findOne('nope');
    expect(missing).toBeUndefined();
  });

  test('update upserts', async () => {
    await seed({ channelId: 'upd-1' });
    const updated = await service.update('upd-1', { participantsCount: 999 } as any);
    expect(updated.participantsCount).toBe(999);
    // upsert path
    const created = await service.update('new-via-upsert', { title: 'X' } as any);
    expect(created.channelId).toBe('new-via-upsert');
  });

  test('createMultiple upserts and returns message', async () => {
    const r = await service.createMultiple([
      { channelId: 'm1', title: 'A', canSendMsgs: true, participantsCount: 100 } as any,
      { channelId: 'm2', username: 'b', restricted: true } as any,
    ]);
    expect(r).toBe('Channels Saved');
    expect(await model.countDocuments({})).toBe(2);
  });

  test('createMultiple throws on empty array', async () => {
    await expect(service.createMultiple([])).rejects.toBeInstanceOf(BadRequestException);
  });

  test('createMultiple throws when a dto lacks channelId', async () => {
    await expect(service.createMultiple([{ title: 'no id' } as any])).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ChannelsService - remove', () => {
  test('remove sends bot notification and deletes', async () => {
    await seed({ channelId: 'rm-1' });
    await service.remove('rm-1');
    expect(mockSendMessageByCategory).toHaveBeenCalled();
    expect(await model.findOne({ channelId: 'rm-1' })).toBeNull();
  });

  test('remove works when no bots service instance', async () => {
    mockBotsInstance = null;
    await seed({ channelId: 'rm-2' });
    await service.remove('rm-2');
    expect(await model.findOne({ channelId: 'rm-2' })).toBeNull();
  });
});

describe('ChannelsService - search / getChannels / executeQuery / getActiveChannels', () => {
  test('search returns matching channels', async () => {
    await seed({ channelId: 's1', restricted: true });
    const r = await service.search({ restricted: true });
    expect(r.length).toBe(1);
  });

  test('getChannels filters and sorts', async () => {
    await seed({ channelId: 'g1', title: 'nice group', username: 'nicegroup', participantsCount: 5000, canSendMsgs: true, broadcast: false, restricted: false });
    const r = await service.getChannels(10, 0, ['nice'], ['someid']);
    expect(Array.isArray(r)).toBe(true);
  });

  test('getChannels returns [] on query error', async () => {
    const spy = jest.spyOn(model, 'find').mockImplementationOnce(() => { throw new Error('boom'); });
    const r = await service.getChannels(10, 0, [], []);
    expect(r).toEqual([]);
    spy.mockRestore();
  });

  test('executeQuery with sort and limit', async () => {
    await seed({ channelId: 'q1', participantsCount: 10 });
    await seed({ channelId: 'q2', participantsCount: 20 });
    const r = await service.executeQuery({}, { participantsCount: -1 }, 1);
    expect(r.length).toBe(1);
  });

  test('executeQuery without query throws BadRequest (wrapped as 500)', async () => {
    await expect(service.executeQuery(null as any)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  test('getActiveChannels runs aggregation pipeline', async () => {
    await seed({ channelId: 'a1', title: 'cool chat', username: 'coolchat', participantsCount: 5000, canSendMsgs: true });
    const r = await service.getActiveChannels(10, 0, []);
    expect(Array.isArray(r)).toBe(true);
  });

  test('getActiveChannels returns [] on aggregation error', async () => {
    const spy = jest.spyOn(model, 'aggregate').mockImplementationOnce(() => { throw new Error('agg fail'); });
    const r = await service.getActiveChannels(10, 0, []);
    expect(r).toEqual([]);
    spy.mockRestore();
  });
});

describe('ChannelsService - executeQuery branch matrix', () => {
  test('executeQuery with sort but no limit returns all matches sorted', async () => {
    await seed({ channelId: 'es1', participantsCount: 10 });
    await seed({ channelId: 'es2', participantsCount: 30 });
    await seed({ channelId: 'es3', participantsCount: 20 });
    const r = await service.executeQuery({}, { participantsCount: -1 });
    expect(r.map((c: any) => c.participantsCount)).toEqual([30, 20, 10]);
  });

  test('executeQuery with limit but no sort caps the result set', async () => {
    await seed({ channelId: 'el1' });
    await seed({ channelId: 'el2' });
    await seed({ channelId: 'el3' });
    const r = await service.executeQuery({}, undefined, 2);
    expect(r.length).toBe(2);
  });

  test('executeQuery with neither sort nor limit returns every match', async () => {
    await seed({ channelId: 'en1', restricted: true });
    await seed({ channelId: 'en2', restricted: true });
    const r = await service.executeQuery({ restricted: true });
    expect(r.length).toBe(2);
  });

  test('executeQuery wraps DB errors as InternalServerError', async () => {
    const spy = jest.spyOn(model, 'find').mockImplementationOnce(() => { throw new Error('db down'); });
    await expect(service.executeQuery({ a: 1 })).rejects.toBeInstanceOf(InternalServerErrorException);
    spy.mockRestore();
  });
});

describe('ChannelsService - getChannels real filtering', () => {
  test('matches keyword, excludes blacklist words, and honors notIds', async () => {
    // Should match: title contains the keyword, no blacklisted word, sendable.
    await seed({ channelId: 'gc-match', title: 'lovely chat', username: 'lovelychat', participantsCount: 5000, canSendMsgs: true, broadcast: false, restricted: false });
    // Should be excluded: title contains a blacklisted word ('crypto').
    await seed({ channelId: 'gc-black', title: 'lovely crypto', username: 'lovelycrypto', participantsCount: 9000, canSendMsgs: true, broadcast: false, restricted: false });
    // Should be excluded: broadcast channel (can't post).
    await seed({ channelId: 'gc-broad', title: 'lovely news', username: 'lovelynews', participantsCount: 9000, canSendMsgs: true, broadcast: true, restricted: false });

    const r = await service.getChannels(50, 0, ['lovely'], ['someExcludedName']);
    const ids = r.map((c: any) => c.channelId);
    expect(ids).toContain('gc-match');
    expect(ids).not.toContain('gc-black');
    expect(ids).not.toContain('gc-broad');
  });

  test('uses default args (limit=50, skip=0, keywords=[], notIds=[]) when called bare', async () => {
    // A caller relying on the method defaults — exercises the default-parameter branches.
    await seed({ channelId: 'def-1', title: 'plain group', username: 'plaingroup', participantsCount: 4000, canSendMsgs: true, broadcast: false, restricted: false });
    const r = await service.getChannels();
    expect(Array.isArray(r)).toBe(true);
  });

  test('getActiveChannels uses default args when called bare', async () => {
    await seed({ channelId: 'gac-def', title: 'cool chat', username: 'coolchat', participantsCount: 5000, canSendMsgs: true });
    const r = await service.getActiveChannels();
    expect(Array.isArray(r)).toBe(true);
  });

  test('skip/limit paginate the sorted result', async () => {
    await seed({ channelId: 'pg1', title: 'lovely a', username: 'lovelya', participantsCount: 100, canSendMsgs: true, broadcast: false, restricted: false });
    await seed({ channelId: 'pg2', title: 'lovely b', username: 'lovelyb', participantsCount: 300, canSendMsgs: true, broadcast: false, restricted: false });
    await seed({ channelId: 'pg3', title: 'lovely c', username: 'lovelyc', participantsCount: 200, canSendMsgs: true, broadcast: false, restricted: false });
    const page = await service.getChannels(1, 1, ['lovely'], []);
    // sorted by participantsCount desc → [300, 200, 100]; skip 1, limit 1 → the 200 one
    expect(page.length).toBe(1);
    expect((page[0] as any).participantsCount).toBe(200);
  });
});
