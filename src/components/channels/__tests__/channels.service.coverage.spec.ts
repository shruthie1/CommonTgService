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
import { BadRequestException } from '@nestjs/common';
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

// getActiveChannels always calls getFleetPrior()/buildConversionAwareSortStages() now
// (conversion-aware sort, spec 2026-08-01) — stub them so the aggregation pipeline
// actually runs instead of hitting the fail-open catch on every call.
function channelIntelligenceReadServiceStub() {
  return {
    getFleetPrior: jest.fn(async () => ({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 })),
    buildConversionAwareSortStages: jest.fn(() => [
      { $addFields: { sortScore: { $rand: {} } } },
    ]),
    buildRandomOnlySortStages: jest.fn(() => [
      { $addFields: { sortScore: { $rand: {} } } },
    ]),
    getExcludedChannelIds: jest.fn(async () => new Set<string>()),
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockBotsInstance = { sendMessageByCategory: mockSendMessageByCategory };
  await model.deleteMany({});
  service = new ChannelsService(model, channelIntelligenceReadServiceStub() as any);
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

  test('update changes an existing row and never creates one', async () => {
    await seed({ channelId: 'upd-1' });
    const updated = await service.update('upd-1', { participantsCount: 999 } as any);
    expect(updated.participantsCount).toBe(999);
    const missing = await service.update('new-via-upsert', { title: 'X' } as any);
    expect(missing).toBeNull();
    expect(await model.countDocuments({ channelId: 'new-via-upsert' })).toBe(0);
  });

  test('createMultiple upserts and returns message', async () => {
    const r = await service.createMultiple([
      { channelId: 'm1', title: 'A', canSendMsgs: true, participantsCount: 100 } as any,
      { channelId: 'm2', username: 'b', canSendMsgs: false } as any,
    ]);
    expect(r).toBe('Channels Saved');
    expect(await model.countDocuments({})).toBe(2);
  });

  test('createMultiple: live refresh clears legacy banned/forbidden but an operator ban survives atomically', async () => {
    await seed({ channelId: 'bulk-banned', banned: true, bannedAt: 1700000000000, canSendMsgs: false, title: 'Old banned' });
    await seed({ channelId: 'bulk-forbidden', forbidden: true, canSendMsgs: false, title: 'Old forbidden' });
    await seed({ channelId: 'bulk-legacy-banned', banned: true, canSendMsgs: false, title: 'Old legacy' });

    await service.createMultiple([
      { channelId: 'bulk-banned', title: 'Fresh banned', canSendMsgs: true, private: false, broadcast: false } as any,
      { channelId: 'bulk-forbidden', title: 'Fresh forbidden', canSendMsgs: true, private: false, broadcast: false } as any,
      { channelId: 'bulk-legacy-banned', title: 'Fresh legacy', canSendMsgs: true, private: false, broadcast: false } as any,
    ]);

    await expect(model.findOne({ channelId: 'bulk-banned' }).lean().exec()).resolves.toEqual(
      expect.objectContaining({ banned: true, canSendMsgs: false, title: 'Fresh banned' }),
    );
    await expect(model.findOne({ channelId: 'bulk-forbidden' }).lean().exec()).resolves.toEqual(
      expect.objectContaining({ forbidden: false, canSendMsgs: true, title: 'Fresh forbidden' }),
    );
    await expect(model.findOne({ channelId: 'bulk-legacy-banned' }).lean().exec()).resolves.toEqual(
      expect.objectContaining({ banned: false, canSendMsgs: true, title: 'Fresh legacy' }),
    );
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

describe('ChannelsService - search / getActiveChannels', () => {
  test('search returns matching channels', async () => {
    await seed({ channelId: 's1', canSendMsgs: false });
    const r = await service.search({ canSendMsgs: false });
    expect(r.length).toBe(1);
  });

  test('getActiveChannels runs aggregation pipeline', async () => {
    await seed({ channelId: 'a1', title: 'cool chat', username: 'coolchat', participantsCount: 5000, canSendMsgs: true });
    const r = await service.getActiveChannels(10, 0, []);
    expect(Array.isArray(r)).toBe(true);
  });

  test('getActiveChannels FAILS OPEN: conversion sort error falls back to random-only selection (spec test #6)', async () => {
    await model.create({ channelId: 'chfo-1', title: 'ch fallback', username: 'chfallback', participantsCount: 5000, canSendMsgs: true, banned: false, forbidden: false, private: false, broadcast: false } as any);
    // First aggregate (conversion sort) throws; second (random-only fallback) runs for real.
    const spy = jest.spyOn(model, 'aggregate').mockImplementationOnce(() => { throw new Error('lookup blew up'); });
    const r = await service.getActiveChannels(10, 0, []);
    expect(Array.isArray(r)).toBe(true);
    expect(r.some((c: any) => c.channelId === 'chfo-1')).toBe(true); // returned via fallback, not starved
    expect(spy).toHaveBeenCalledTimes(2); // conversion sort (threw) + random-only fallback
    spy.mockRestore();
  });

  test('getActiveChannels returns [] only when BOTH sorts fail', async () => {
    // Every aggregate call throws (conversion sort AND random-only fallback) => outer catch returns [].
    const spy = jest.spyOn(model, 'aggregate').mockImplementation(() => { throw new Error('agg fail'); });
    const r = await service.getActiveChannels(10, 0, []);
    expect(r).toEqual([]);
    spy.mockRestore();
  });
});

describe('ChannelsService - getActiveChannels defaults', () => {
  test('getActiveChannels uses default args when called bare', async () => {
    await seed({ channelId: 'gac-def', title: 'cool chat', username: 'coolchat', participantsCount: 5000, canSendMsgs: true });
    const r = await service.getActiveChannels();
    expect(Array.isArray(r)).toBe(true);
  });

});
