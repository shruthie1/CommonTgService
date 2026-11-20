/**
 * Owner decisions 2026-11-20 (channels cleanup), real MongoDB (mongodb-memory-server):
 *  - channels.update / activeChannels.update never upsert (`channel-update kind=no_row`).
 *  - The operator-ban guard (banned + bannedAt) is evaluated inside the single write, so it is
 *    atomic (`channel-update kind=skip reason=banned`); banned and bannedAt are kept.
 *  - channels.createMultiple stamps createdAt on insert only.
 *  - channels.remove deletes only the exact channelId; a blank id deletes nothing.
 *  - search maps min/maxParticipantsCount to a participantsCount range.
 */
jest.mock('../../../utils', () => ({ getBotsServiceInstance: () => null }));

import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { UpdateChannelDto } from '../dto/update-channel.dto';
import { SearchChannelDto } from '../dto/search-channel.dto';
import { UpdateActiveChannelDto } from '../../active-channels/dto/update-active-channel.dto';
import { ChannelsService } from '../channels.service';
import { ChannelSchema } from '../schemas/channel.schema';
import { ActiveChannelsService } from '../../active-channels/active-channels.service';
import { ActiveChannelSchema } from '../../active-channels/schemas/active-channel.schema';

let mongod: MongoMemoryServer;
let connection: Connection;
let channels: any;
let active: any;
let channelsService: ChannelsService;
let activeService: ActiveChannelsService;
let warn: jest.SpyInstance;

const BANNED_AT = 1_700_000_000_000;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'channelsNoUpsert' }).asPromise();
  channels = connection.model('ChannelNoUpsert', ChannelSchema);
  active = connection.model('ActiveChannelNoUpsert', ActiveChannelSchema);
});

afterAll(async () => {
  if (connection) { await connection.dropDatabase(); await connection.close(); }
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await channels.deleteMany({});
  await active.deleteMany({});
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  channelsService = new ChannelsService(channels, {} as any);
  activeService = new ActiveChannelsService(active, {} as any, {} as any);
});

afterEach(() => warn.mockRestore());

const warned = () => warn.mock.calls.map((c) => String(c[0]));
const raw = (model: any, channelId: string) => model.collection.findOne({ channelId });

describe('ChannelsService.update', () => {
  test('absent row: no upsert, returns null, logs no_row (CHANNEL_PRIVATE stub path)', async () => {
    const result = await channelsService.update('1000123', { private: true } as any);
    expect(result).toBeNull();
    expect(await channels.countDocuments({})).toBe(0);
    expect(warned()).toContain('channel-update kind=no_row channel=0123');
  });

  test('absent row with canSendMsgs=true: still no upsert, logs no_row (not banned)', async () => {
    const result = await channelsService.update('1000124', { canSendMsgs: true, title: 'x' } as any);
    expect(result).toBeNull();
    expect(await channels.countDocuments({})).toBe(0);
    expect(warned()).toEqual(['channel-update kind=no_row channel=0124']);
  });

  test('existing row: fields set, nameDenied recomputed from the stored title when only username changes', async () => {
    await channels.collection.insertOne({ channelId: '2001', title: 'crypto signals', username: 'a', nameDenied: true });
    const updated: any = await channelsService.update('2001', { username: 'nice_chat', participantsCount: 5 } as any);
    expect(updated.username).toBe('nice_chat');
    const row = await raw(channels, '2001');
    expect(row.participantsCount).toBe(5);
    expect(row.nameDenied).toBe(true); // stored title still hits the deny-list
    expect(row.updatedAt).toBeInstanceOf(Date);

    await channelsService.update('2001', { title: 'friends' } as any);
    expect((await raw(channels, '2001')).nameDenied).toBe(false);
    expect(warned()).toEqual([]);
  });

  test('private=true forces canSendMsgs=false on an existing row', async () => {
    await channels.collection.insertOne({ channelId: '2002', title: 't', canSendMsgs: true });
    await channelsService.update('2002', { private: true } as any);
    const row = await raw(channels, '2002');
    expect(row.private).toBe(true);
    expect(row.canSendMsgs).toBe(false);
    expect(row).not.toHaveProperty('nameDenied'); // name untouched -> no recompute
  });

  test('operator-banned row: canSendMsgs=true is refused, other fields still land, ban kept, logs skip', async () => {
    await channels.collection.insertOne({ channelId: '3001', title: 'old', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    const result: any = await channelsService.update('3001', { canSendMsgs: true, title: 'new title' } as any);
    const row = await raw(channels, '3001');
    expect(row.canSendMsgs).toBe(false);
    expect(row.title).toBe('new title');
    expect(row.banned).toBe(true);
    expect(row.bannedAt).toBe(BANNED_AT);
    expect(result.canSendMsgs).toBe(false);
    expect(warned()).toEqual(['channel-update kind=skip reason=banned channel=3001']);
  });

  test('operator-banned row: banned=false alone cannot lift the ban, logs skip', async () => {
    await channels.collection.insertOne({ channelId: '3002', title: 't', banned: true, bannedAt: BANNED_AT });
    const result: any = await channelsService.update('3002', { banned: false } as any);
    const row = await raw(channels, '3002');
    expect(row.banned).toBe(true);
    expect(row.bannedAt).toBe(BANNED_AT);
    expect(result).not.toBeNull();
    expect(warned()).toEqual(['channel-update kind=skip reason=banned channel=3002']);
  });

  test('legacy banned without bannedAt is not an operator ban: canSendMsgs=true lands', async () => {
    await channels.collection.insertOne({ channelId: '3003', title: 't', canSendMsgs: false, banned: true, bannedAt: null });
    await channelsService.update('3003', { canSendMsgs: true } as any);
    expect((await raw(channels, '3003')).canSendMsgs).toBe(true);
    expect(warned()).toEqual([]);
  });

  test('one atomic write: no read before it, guard evaluated inside the pipeline', async () => {
    await channels.collection.insertOne({ channelId: '3004', title: 't', canSendMsgs: false });
    const findOne = jest.spyOn(channels, 'findOne');
    const findOneAndUpdate = jest.spyOn(channels, 'findOneAndUpdate');
    await channelsService.update('3004', { canSendMsgs: true } as any);
    expect(findOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ channelId: '3004' });
    expect(JSON.stringify(findOneAndUpdate.mock.calls[0][1])).toContain('$cond');
    expect((await raw(channels, '3004')).canSendMsgs).toBe(true);
    findOne.mockRestore();
    findOneAndUpdate.mockRestore();
  });

  test('operator-banned row: bannedAt=null alone cannot clear the marker; the next live refresh keeps it unsendable', async () => {
    await channels.collection.insertOne({ channelId: '3007', title: 't', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    await channelsService.update('3007', { bannedAt: null } as any);
    let row = await raw(channels, '3007');
    expect(row.banned).toBe(true);
    expect(row.bannedAt).toBe(BANNED_AT);
    expect(warned()).toEqual(['channel-update kind=skip reason=banned channel=3007']);
    // Next sendability refresh (discovery) must not restore canSendMsgs.
    await channelsService.createMultiple([{ channelId: '3007', title: 't', canSendMsgs: true }] as any);
    row = await raw(channels, '3007');
    expect(row.canSendMsgs).toBe(false);
    expect(row.bannedAt).toBe(BANNED_AT);
  });

  test('operator-banned row: PATCH DTO defaults (banned false, bannedAt null, private false) keep the ban', async () => {
    await channels.collection.insertOne({ channelId: '3008', title: 't', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    await channelsService.update('3008', { title: 'renamed', banned: false, bannedAt: null, private: false, forbidden: false, reactRestricted: false } as any);
    const row = await raw(channels, '3008');
    expect(row.title).toBe('renamed');
    expect(row.banned).toBe(true);
    expect(row.bannedAt).toBe(BANNED_AT);
    expect(row.canSendMsgs).toBe(false);
    await channelsService.createMultiple([{ channelId: '3008', canSendMsgs: true }] as any);
    expect((await raw(channels, '3008')).canSendMsgs).toBe(false);
  });

  test('values are cast by the schema (pipeline writes skip Mongoose casting)', async () => {
    await channels.collection.insertOne({ channelId: '3009', title: 't', participantsCount: 1 });
    await channelsService.update('3009', { participantsCount: '500', canSendMsgs: 'true', username: null } as any);
    const row = await raw(channels, '3009');
    expect(row.participantsCount).toBe(500);
    expect(row.canSendMsgs).toBe(true);
    expect(row.username).toBeNull();
    const found = (await channelsService.search({ minParticipantsCount: '400' } as any)).map((c: any) => c.channelId);
    expect(found).toEqual(['3009']);
    await expect(channelsService.update('3009', { participantsCount: 'abc' } as any)).rejects.toThrow();
    expect((await raw(channels, '3009')).participantsCount).toBe(500);
  });

  test('empty update writes nothing and reports a missing row', async () => {
    await channels.collection.insertOne({ channelId: '3005', title: 't' });
    expect(await channelsService.update('3005', { bogus: 1 } as any)).not.toBeNull();
    expect(await channelsService.update('3006', {} as any)).toBeNull();
    expect(warned()).toEqual(['channel-update kind=no_row channel=3006']);
    expect(await channels.countDocuments({})).toBe(1);
  });
});

describe('ChannelsService.createMultiple createdAt', () => {
  test('a new row gets createdAt; an existing row keeps its createdAt or its absence', async () => {
    const kept = new Date('2024-01-01T00:00:00Z');
    await channels.collection.insertOne({ channelId: '4001', title: 'legacy no createdAt' });
    await channels.collection.insertOne({ channelId: '4002', title: 'has createdAt', createdAt: kept });
    const before = Date.now();
    await channelsService.createMultiple([
      { channelId: '4001', title: 'a' },
      { channelId: '4002', title: 'b' },
      { channelId: '4003', title: 'c' },
    ] as any);
    expect(await raw(channels, '4001')).not.toHaveProperty('createdAt');
    expect((await raw(channels, '4002')).createdAt).toEqual(kept);
    const inserted = await raw(channels, '4003');
    expect(inserted.createdAt).toBeInstanceOf(Date);
    expect(inserted.createdAt.getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect(inserted.updatedAt).toBeInstanceOf(Date);
  });
});

describe('ChannelsService.remove', () => {
  test('deletes only the exact channelId, never a row that shares the username', async () => {
    await channels.collection.insertMany([
      { channelId: '5001', username: 'dup', title: 'a' },
      { channelId: '5002', username: 'dup', title: 'b' },
    ]);
    expect(await channelsService.remove('5002')).toBe(true);
    expect(await channelsService.remove('5002')).toBe(false);
    expect(await channels.countDocuments({ channelId: '5001' })).toBe(1);
    expect(await channels.countDocuments({ channelId: '5002' })).toBe(0);
  });

  test('a blank channelId deletes nothing', async () => {
    await channels.collection.insertOne({ channelId: '', title: 'odd blank row' });
    await channelsService.remove('');
    await channelsService.remove(undefined as any);
    expect(await channels.countDocuments({})).toBe(1);
    expect(warned()).toEqual(['channel-dead kind=skip reason=no_channel_id', 'channel-dead kind=skip reason=no_channel_id']);
  });
});

describe('ChannelsService.search', () => {
  test('min/maxParticipantsCount become a participantsCount range; blank or junk bounds are ignored', async () => {
    await channels.collection.insertMany([
      { channelId: '6001', title: 'a', participantsCount: 100 },
      { channelId: '6002', title: 'b', participantsCount: 1000 },
      { channelId: '6003', title: 'c', participantsCount: 5000 },
    ]);
    const ids = async (q: any) => (await channelsService.search(q)).map((c: any) => c.channelId).sort();
    expect(await ids({ minParticipantsCount: '500' })).toEqual(['6002', '6003']);
    expect(await ids({ maxParticipantsCount: '1000' })).toEqual(['6001', '6002']);
    expect(await ids({ minParticipantsCount: '500', maxParticipantsCount: '2000' })).toEqual(['6002']);
    expect(await ids({ minParticipantsCount: '', maxParticipantsCount: 'abc' })).toEqual(['6001', '6002', '6003']);
    expect(await ids({ title: 'c' })).toEqual(['6003']);
  });
});

describe('ActiveChannelsService.update', () => {
  test('absent row: no upsert, returns null, logs no_row', async () => {
    expect(await activeService.update('7001', { private: true } as any)).toBeNull();
    expect(await activeService.update('7002', { canSendMsgs: true } as any)).toBeNull();
    expect(await active.countDocuments({})).toBe(0);
    expect(warned()).toEqual([
      'channel-update kind=no_row collection=activeChannels channel=7001',
      'channel-update kind=no_row collection=activeChannels channel=7002',
    ]);
  });

  test('operator-banned row: canSendMsgs=true refused atomically, other fields land, ban kept, logs skip', async () => {
    await active.collection.insertOne({ channelId: '7101', title: 'old', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    const result: any = await activeService.update('7101', { canSendMsgs: true, participantsCount: 42 } as any);
    const row = await raw(active, '7101');
    expect(row.canSendMsgs).toBe(false);
    expect(row.participantsCount).toBe(42);
    expect(row.banned).toBe(true);
    expect(row.bannedAt).toBe(BANNED_AT);
    expect(result.canSendMsgs).toBe(false);
    expect(warned()).toEqual(['channel-update kind=skip reason=banned collection=activeChannels channel=7101']);
  });

  test('unbanned row: canSendMsgs=true lands in one write on the exact channelId', async () => {
    await active.collection.insertOne({ channelId: '7201', title: 't', canSendMsgs: false });
    const findOneAndUpdate = jest.spyOn(active, 'findOneAndUpdate');
    const findOne = jest.spyOn(active, 'findOne');
    await activeService.update('7201', { canSendMsgs: true } as any);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(findOne).not.toHaveBeenCalled();
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ channelId: '7201' });
    expect((await raw(active, '7201')).canSendMsgs).toBe(true);
    expect(warned()).toEqual([]);
    findOneAndUpdate.mockRestore();
    findOne.mockRestore();
  });

  test('operator-banned row: bannedAt=null without an explicit unban keeps the marker; next refresh stays unsendable', async () => {
    await active.collection.insertOne({ channelId: '7202', title: 't', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    await activeService.update('7202', { bannedAt: null, participantsCount: '77' } as any);
    let row = await raw(active, '7202');
    expect(row.bannedAt).toBe(BANNED_AT);
    expect(row.participantsCount).toBe(77);
    expect(warned()).toEqual(['channel-update kind=skip reason=banned collection=activeChannels channel=7202']);
    await activeService.createMultiple([{ channelId: '7202', title: 't', canSendMsgs: true }] as any);
    row = await raw(active, '7202');
    expect(row.canSendMsgs).toBe(false);
    expect(row.banned).toBe(true);
  });

  test('explicit banned=false is still the unban path on a banned row', async () => {
    await active.collection.insertOne({ channelId: '7301', title: 't', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    await activeService.update('7301', { banned: false } as any);
    const row = await raw(active, '7301');
    expect(row.banned).toBe(false);
    expect(row.bannedAt).toBeNull();
    expect(row.canSendMsgs).toBe(false);
    expect(row.lastHydrationStatus).toBe('needs_hydration');
  });

  test('CHANNEL_PRIVATE on an existing row sets private and clears sendability', async () => {
    await active.collection.insertOne({ channelId: '7401', title: 't', canSendMsgs: true });
    await activeService.update('7401', { private: true } as any);
    const row = await raw(active, '7401');
    expect(row.private).toBe(true);
    expect(row.canSendMsgs).toBe(false);
  });
});

// Same pipe options as main.ts: the HTTP PATCH body is transformed into the Update DTO.
const pipe = new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true } });
const asPatch = (metatype: any, body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype });

describe('HTTP PATCH bodies carry only the fields sent (PartialType copied create-DTO defaults)', () => {
  test('Update DTOs have no inherited defaults', async () => {
    expect({ ...(await asPatch(UpdateActiveChannelDto, { title: 'x' })) }).toEqual({ title: 'x' });
    expect({ ...(await asPatch(UpdateChannelDto, { title: 'x' })) }).toEqual({ title: 'x' });
  });

  test('activeChannels: a title-only PATCH keeps an operator ban through the next refresh; explicit banned=false still unbans', async () => {
    await active.collection.insertOne({ channelId: '8001', title: 't', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    await activeService.update('8001', await asPatch(UpdateActiveChannelDto, { title: 'renamed' }));
    await activeService.createMultiple([{ channelId: '8001', title: 'renamed', canSendMsgs: true }] as any);
    let row = await raw(active, '8001');
    expect(row.title).toBe('renamed');
    expect(row.banned).toBe(true);
    expect(row.bannedAt).toBe(BANNED_AT);
    expect(row.canSendMsgs).toBe(false);

    await activeService.update('8001', await asPatch(UpdateActiveChannelDto, { banned: false }));
    row = await raw(active, '8001');
    expect(row.banned).toBe(false);
    expect(row.bannedAt).toBeNull();
  });

  test('channels: a title-only PATCH does not reset private', async () => {
    await channels.collection.insertOne({ channelId: '8002', title: 't', private: true, canSendMsgs: false });
    await channelsService.update('8002', await asPatch(UpdateChannelDto, { title: 'renamed' }));
    const row = await raw(channels, '8002');
    expect(row.title).toBe('renamed');
    expect(row.private).toBe(true);
  });
});

describe('ActiveChannelsService.update rules read cast values', () => {
  test("private: 'true' with canSendMsgs: 'true' stores private true and canSendMsgs false", async () => {
    await active.collection.insertOne({ channelId: '8101', title: 't', canSendMsgs: false });
    await activeService.update('8101', { private: 'true', canSendMsgs: 'true' } as any);
    const row = await raw(active, '8101');
    expect(row.private).toBe(true);
    expect(row.canSendMsgs).toBe(false);
  });

  test("banned: 'true' becomes a durable operator ban (bannedAt set)", async () => {
    await active.collection.insertOne({ channelId: '8102', title: 't', canSendMsgs: true });
    await activeService.update('8102', { banned: 'true' } as any);
    const row = await raw(active, '8102');
    expect(row.banned).toBe(true);
    expect(typeof row.bannedAt).toBe('number');
    expect(row.canSendMsgs).toBe(false);
  });

  test("canSendMsgs: 'true' on an operator-banned row is refused and logged", async () => {
    await active.collection.insertOne({ channelId: '8103', title: 't', canSendMsgs: false, banned: true, bannedAt: BANNED_AT });
    await activeService.update('8103', { canSendMsgs: 'true' } as any);
    expect((await raw(active, '8103')).canSendMsgs).toBe(false);
    expect(warned()).toEqual(['channel-update kind=skip reason=banned collection=activeChannels channel=8103']);
  });
});

describe('ActiveChannelsService.remove validates the normalized key', () => {
  test("'  ' and '-100' delete nothing, even with a legacy blank-id row", async () => {
    await active.collection.insertOne({ channelId: '', title: 'legacy blank' });
    await expect(activeService.remove('  ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(activeService.remove('-100')).rejects.toBeInstanceOf(BadRequestException);
    expect(await active.countDocuments({})).toBe(1);
  });

  test('exact id: true when deleted, false when absent', async () => {
    await active.collection.insertOne({ channelId: '8201', title: 't' });
    expect(await activeService.remove('-1008201')).toBe(true);
    expect(await activeService.remove('8201')).toBe(false);
  });
});

describe('blank normalized keys never reach a write', () => {
  test("update('  ' | '-100') is rejected in both services and a legacy blank-id row is untouched", async () => {
    await channels.collection.insertOne({ channelId: '', title: 'legacy blank', private: false });
    await active.collection.insertOne({ channelId: '', title: 'legacy blank', banned: true, bannedAt: BANNED_AT });
    for (const id of ['  ', '-100']) {
      await expect(channelsService.update(id, { private: true } as any)).rejects.toBeInstanceOf(BadRequestException);
      await expect(activeService.update(id, { banned: false } as any)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect((await raw(channels, '')).private).toBe(false);
    const a = await raw(active, '');
    expect(a.banned).toBe(true);
    expect(a.bannedAt).toBe(BANNED_AT);
  });
});

describe('GET /channels/search bounds through the HTTP pipe', () => {
  const asQuery = (q: Record<string, unknown>) => pipe.transform(q, { type: 'query', metatype: SearchChannelDto });
  test('blank and whitespace bounds are ignored; explicit 0 is a bound', async () => {
    await channels.collection.insertMany([
      { channelId: '9001', title: 'a', participantsCount: 0 },
      { channelId: '9002', title: 'b', participantsCount: 1000 },
    ]);
    const ids = async (q: any) => (await channelsService.search(await asQuery(q))).map((c: any) => c.channelId).sort();
    expect(await ids({ maxParticipantsCount: '' })).toEqual(['9001', '9002']);
    expect(await ids({ maxParticipantsCount: '  ', minParticipantsCount: ' ' })).toEqual(['9001', '9002']);
    expect(await ids({ maxParticipantsCount: '0' })).toEqual(['9001']);
    expect(await ids({ minParticipantsCount: '500' })).toEqual(['9002']);
  });
});

