/**
 * BotsService coverage spec.
 * Uses real MongoDB (mongodb-memory-server) for the Bot model.
 * Mocks ONLY axios (true external Telegram HTTP) and form-data is real.
 */
jest.mock('axios');
import axios from 'axios';
import { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { BotsService } from '../bots.service';
import { ChannelCategory } from '../channel-category.enum';
import { Bot, BotSchema, BotDocument } from '../schemas/bot.schema';
import { NotFoundException } from '@nestjs/common';

const mockedAxios = axios as jest.Mocked<typeof axios>;

let mongod: MongoMemoryServer;
let connection: Connection;
let model: any;
let service: BotsService;

const baseStats = {
  messagesSent: 0, photosSent: 0, videosSent: 0, documentsSent: 0,
  audiosSent: 0, voicesSent: 0, animationsSent: 0, stickersSent: 0, mediaGroupsSent: 0,
};

async function seedBot(overrides: Partial<Bot> = {}): Promise<BotDocument> {
  return model.create({
    token: `tok_${Math.random().toString(36).slice(2)}`,
    username: `bot_${Math.random().toString(36).slice(2)}`,
    category: ChannelCategory.PROM_LOGS2,
    channelId: '-100123',
    lastUsed: new Date(),
    stats: { ...baseStats },
    ...overrides,
  });
}

// Minimal ModuleRef mock — BotsService uses it only to lazily resolve deps for the
// daily health-check job, which these unit tests don't exercise.
const mockModuleRef = { get: jest.fn(), resolve: jest.fn() };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'botsSvc' }).asPromise();
  model = connection.model<BotDocument>('BotGroupA', BotSchema);
  process.env.clientId = 'testclient';
});

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await model.deleteMany({});
  service = new BotsService(model, mockModuleRef as any);
});

function axiosOk(data: any = { ok: true, result: { username: 'fetched_bot' } }) {
  return { data };
}

describe('BotsService - lifecycle / cache init', () => {
  test('onModuleInit initializes cache and starts periodic flush', async () => {
    // Capture the interval handle so we can clear it (avoid open handle / leaks).
    let captured: any;
    const realSetInterval = global.setInterval;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((fn: any, ms?: any) => {
      captured = realSetInterval(fn, ms);
      return captured;
    }) as any);
    await seedBot({ category: ChannelCategory.PROM_LOGS1 });
    await seedBot({ category: ChannelCategory.PROM_LOGS1 });
    await service.onModuleInit();
    expect(setIntervalSpy).toHaveBeenCalled();
    if (captured) clearInterval(captured);
    // category cache should be warm now → getBots returns from cache
    const bots = await service.getBots(ChannelCategory.PROM_LOGS1);
    expect(bots.length).toBe(2);
    setIntervalSpy.mockRestore();
  });

  test('periodic flush interval fires the flush callback which persists pending stats', async () => {
    const bot = await seedBot();
    // Warm a pending stat so the interval-driven flush has work to do.
    const cache = (service as any).cache;
    cache.set('pendingStats', { [bot._id.toString()]: { messagesSent: 2, lastUsed: new Date() } });

    // Capture the interval callback so we can drive it deterministically (Mongo I/O inside
    // the flush can't settle under fake timers).
    let intervalCb: (() => any) | undefined;
    const realSetInterval = global.setInterval;
    const spy = jest.spyOn(global, 'setInterval').mockImplementation(((fn: any, ms?: any) => {
      intervalCb = fn;
      return realSetInterval(() => {}, ms ?? 1e9); // harmless handle, never fires on its own
    }) as any);

    (service as any).startPeriodicFlush();
    expect(typeof intervalCb).toBe('function');
    // Invoke the captured interval body exactly as the timer would, then await its async flush.
    await intervalCb!();
    spy.mockRestore();

    const persisted = await model.findById(bot._id);
    expect(persisted.stats.messagesSent).toBeGreaterThanOrEqual(2);
  });

  test('initializeCache swallows errors gracefully', async () => {
    const badModel: any = { find: () => ({ lean: () => ({ exec: () => Promise.reject(new Error('db down')) }) }) };
    const svc = new BotsService(badModel, mockModuleRef as any);
    await expect((svc as any).initializeCache()).resolves.toBeUndefined();
  });
});

describe('BotsService - createBot', () => {
  test('creates bot successfully (valid token)', async () => {
    mockedAxios.get.mockResolvedValue(axiosOk());
    const bot = await service.createBot({
      token: 'valid_token_123456',
      category: ChannelCategory.PROM_LOGS2,
      channelId: '-100999',
    });
    expect(bot.username).toBe('fetched_bot');
    const inDb = await model.findOne({ token: 'valid_token_123456' });
    expect(inDb).toBeTruthy();
    // cache updated
    const cached = await service.getBots(ChannelCategory.PROM_LOGS2);
    expect(cached.some(b => b.token === 'valid_token_123456')).toBe(true);
  });

  test('throws on invalid token (getMe not ok)', async () => {
    mockedAxios.get.mockResolvedValue(axiosOk({ ok: false }));
    await expect(service.createBot({
      token: 'bad_token_123456', category: ChannelCategory.PROM_LOGS2, channelId: '-1',
    })).rejects.toThrow('Invalid bot token');
  });

  test('throws on token too short (fetchUsername early return)', async () => {
    await expect(service.createBot({
      token: 'short', category: ChannelCategory.PROM_LOGS2, channelId: '-1',
    })).rejects.toThrow('Invalid bot token');
  });

  test('fetchUsername handles axios throw → invalid token', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network'));
    await expect(service.createBot({
      token: 'errors_out_123456', category: ChannelCategory.PROM_LOGS2, channelId: '-1',
    })).rejects.toThrow('Invalid bot token');
  });

  test('inserts into a warm category cache and keeps it sorted by lastUsed', async () => {
    // Warm the category cache with an existing bot so createBot's push+sort comparator runs
    // across two entries (oldest-first ordering for failover fairness).
    const existing = await seedBot({ category: ChannelCategory.PROM_LOGS2, lastUsed: new Date(5000) });
    await service.getBots(ChannelCategory.PROM_LOGS2); // warms category cache
    mockedAxios.get.mockResolvedValue(axiosOk());

    const created = await service.createBot({
      token: 'fresh_token_abcdef', category: ChannelCategory.PROM_LOGS2, channelId: '-100777',
    });

    const cached = await service.getBots(ChannelCategory.PROM_LOGS2);
    expect(cached.length).toBe(2);
    // existing bot has the older lastUsed, so it must sort ahead of the freshly created one.
    expect(cached[0]._id.toString()).toBe(existing._id.toString());
    expect(cached.some(b => b._id.toString() === created._id.toString())).toBe(true);
  });

  test('throws on duplicate token', async () => {
    mockedAxios.get.mockResolvedValue(axiosOk());
    await seedBot({ token: 'dup_token_123456' });
    await expect(service.createBot({
      token: 'dup_token_123456', category: ChannelCategory.PROM_LOGS2, channelId: '-1',
    })).rejects.toThrow('already exists');
  });
});

describe('BotsService - getBots', () => {
  test('category cache miss then hit', async () => {
    await seedBot({ category: ChannelCategory.UNVDS });
    const miss = await service.getBots(ChannelCategory.UNVDS); // miss → db
    expect(miss.length).toBe(1);
    const hit = await service.getBots(ChannelCategory.UNVDS); // hit → cache
    expect(hit.length).toBe(1);
  });

  test('all bots cache miss then aggregate from category caches (hit)', async () => {
    await seedBot({ category: ChannelCategory.UNVDS });
    await seedBot({ category: ChannelCategory.PROM_LOGS1 });
    const all = await service.getBots(); // miss → db, populates category caches
    expect(all.length).toBe(2);
    const all2 = await service.getBots(); // now aggregated from caches
    expect(all2.length).toBe(2);
  });

  test('getBots() returns the COMPLETE set even when only one category cache is warm', async () => {
    // Real scenario: sendByCategoryWithFailover warms exactly one category at a time. A later
    // getBots() must not return only that warm category and silently omit the rest.
    await seedBot({ category: ChannelCategory.UNVDS });
    await seedBot({ category: ChannelCategory.PROM_LOGS1 });

    // Warm ONLY the UNVDS category cache (as a single-category fetch / failover would).
    const oneCat = await service.getBots(ChannelCategory.UNVDS);
    expect(oneCat.length).toBe(1);

    // Now ask for all bots — must be 2, not just the 1 warm-category bot.
    const all = await service.getBots();
    expect(all.length).toBe(2);
  });
});

describe('BotsService - getBotById', () => {
  test('cache miss → db → caches, then hit', async () => {
    const bot = await seedBot();
    const id = bot._id.toString();
    const miss = await service.getBotById(id);
    expect(miss._id.toString()).toBe(id);
    const hit = await service.getBotById(id);
    expect(hit._id.toString()).toBe(id);
  });

  test('throws NotFound for unknown id', async () => {
    const oid = new mongoose.Types.ObjectId().toString();
    await expect(service.getBotById(oid)).rejects.toBeInstanceOf(NotFoundException);
  });

  test('cache-miss fetch merges the bot into a populated category cache (sorts)', async () => {
    // Pre-warm the category cache via a different bot so the per-bot cache miss path
    // appends + sorts against an existing entry (the sort comparator runs with 2 elements).
    const older = await seedBot({ category: ChannelCategory.PROM_LOGS1, lastUsed: new Date(1000) });
    await service.getBots(ChannelCategory.PROM_LOGS1); // warms category:PROM_LOGS1 cache
    const newer = await seedBot({ category: ChannelCategory.PROM_LOGS1, lastUsed: new Date(9000) });

    // bot-level cache miss for `newer` -> fetched from DB and merged into the category cache.
    const fetched = await service.getBotById(newer._id.toString());
    expect(fetched._id.toString()).toBe(newer._id.toString());

    const cached = await service.getBots(ChannelCategory.PROM_LOGS1);
    expect(cached.length).toBe(2);
    expect(cached[0]._id.toString()).toBe(older._id.toString()); // older lastUsed sorts first
  });
});

describe('BotsService - updateBot / deleteBot', () => {
  test('updateBot updates and refreshes caches', async () => {
    const bot = await seedBot();
    const updated = await service.updateBot(bot._id.toString(), { channelId: '-100555' });
    expect(updated.channelId).toBe('-100555');
  });

  test('updateBot re-sorts a category cache holding multiple bots', async () => {
    // Two bots in the same category warmed into cache; updating one bumps its lastUsed,
    // exercising updateBot's filter+concat+sort comparator across multiple entries.
    const a = await seedBot({ category: ChannelCategory.UNVDS, lastUsed: new Date(1000) });
    const b = await seedBot({ category: ChannelCategory.UNVDS, lastUsed: new Date(2000) });
    await service.getBots(ChannelCategory.UNVDS); // warm category cache with both

    const updated = await service.updateBot(a._id.toString(), { channelId: '-100888' });
    expect(updated.channelId).toBe('-100888');

    const cached = await service.getBots(ChannelCategory.UNVDS);
    expect(cached.length).toBe(2);
    // `a` was just updated (lastUsed=now, newest) so it should sort last; `b` stays first.
    expect(cached[0]._id.toString()).toBe(b._id.toString());
    expect(cached[cached.length - 1]._id.toString()).toBe(a._id.toString());
  });

  test('deleteBot re-sorts the remaining bots in a multi-bot category cache', async () => {
    const a = await seedBot({ category: ChannelCategory.HTTP_FAILURES, lastUsed: new Date(1000) });
    const b = await seedBot({ category: ChannelCategory.HTTP_FAILURES, lastUsed: new Date(2000) });
    const c = await seedBot({ category: ChannelCategory.HTTP_FAILURES, lastUsed: new Date(3000) });
    await service.getBots(ChannelCategory.HTTP_FAILURES); // warm with three

    await service.deleteBot(b._id.toString());

    const cached = await service.getBots(ChannelCategory.HTTP_FAILURES);
    expect(cached.length).toBe(2);
    expect(cached.map(x => x._id.toString())).toEqual([a._id.toString(), c._id.toString()]);
  });

  test('updateBot throws NotFound', async () => {
    const oid = new mongoose.Types.ObjectId().toString();
    await expect(service.updateBot(oid, { channelId: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  test('deleteBot removes and updates cache', async () => {
    const bot = await seedBot();
    await service.getBotById(bot._id.toString()); // warm cache
    await service.deleteBot(bot._id.toString());
    expect(await model.findById(bot._id)).toBeNull();
  });

  test('deleteBot throws NotFound', async () => {
    const oid = new mongoose.Types.ObjectId().toString();
    await expect(service.deleteBot(oid)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BotsService - send by botId (executeSend* paths)', () => {
  test('sendMessageByBotId success → stats incremented', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendMessageByBotId(bot._id.toString(), 'hello', { parseMode: 'HTML' });
    expect(ok).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  test('sendMessageByBotId with allowServiceName=false', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendMessageByBotId(bot._id.toString(), 'plain', undefined, false);
    expect(ok).toBe(true);
  });

  test('executeSendMessage returns false when ok=false (logs description)', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: false, description: 'bad chat' }));
    const ok = await service.sendMessageByBotId(bot._id.toString(), 'hi');
    expect(ok).toBe(false);
  });

  test('executeSendMessage returns false when axios throws', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockRejectedValue(new Error('boom'));
    const ok = await service.sendMessageByBotId(bot._id.toString(), 'hi');
    expect(ok).toBe(false);
  });

  test('sendPhotoByBotId (buffer media) success', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendPhotoByBotId(bot._id.toString(), Buffer.from('img'), { caption: 'cap', parseMode: 'HTML' });
    expect(ok).toBe(true);
  });

  test('sendVideoByBotId (string media, with video options + thumbnail buffer)', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendVideoByBotId(bot._id.toString(), 'http://x/v.mp4', {
      duration: 10, width: 100, height: 100, supportsStreaming: true,
      disableNotification: true, replyToMessageId: 5, allowSendingWithoutReply: true,
      protectContent: true, hasSpoiler: true, thumbnail: Buffer.from('t'),
    } as any);
    expect(ok).toBe(true);
  });

  test('sendAudioByBotId (audio specific options + string thumbnail)', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendAudioByBotId(bot._id.toString(), Buffer.from('a'), {
      duration: 30, performer: 'X', title: 'Y', thumbnail: 'http://x/t.jpg',
    } as any);
    expect(ok).toBe(true);
  });

  test('sendDocumentByBotId (disableContentTypeDetection)', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendDocumentByBotId(bot._id.toString(), Buffer.from('d'), {
      disableContentTypeDetection: true,
    } as any);
    expect(ok).toBe(true);
  });

  test('sendVoiceByBotId (duration)', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendVoiceByBotId(bot._id.toString(), Buffer.from('v'), { duration: 5 } as any);
    expect(ok).toBe(true);
  });

  test('sendAnimationByBotId', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendAnimationByBotId(bot._id.toString(), Buffer.from('an'), { duration: 3, width: 10, height: 10 } as any);
    expect(ok).toBe(true);
  });

  test('sendStickerByBotId (emoji)', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendStickerByBotId(bot._id.toString(), Buffer.from('s'), { emoji: '🔥' } as any);
    expect(ok).toBe(true);
  });

  test('executeSendMedia returns false on ok=false', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: false, description: 'fail' }));
    const ok = await service.sendPhotoByBotId(bot._id.toString(), 'http://x/p.jpg');
    expect(ok).toBe(false);
  });

  test('executeSendMedia returns false on throw', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockRejectedValue(new Error('boom'));
    const ok = await service.sendPhotoByBotId(bot._id.toString(), 'http://x/p.jpg');
    expect(ok).toBe(false);
  });

  test('a failed Telegram send skips stat increments across every media type', async () => {
    // Operational outage: the bot token is revoked so every media send returns ok=false.
    // Each sendXxxByBotId must take its `if (success)` false branch and skip the stat bump.
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: false, description: 'bot was blocked' }));
    const id = bot._id.toString();

    expect(await service.sendVideoByBotId(id, 'http://x/v.mp4')).toBe(false);
    expect(await service.sendAudioByBotId(id, 'http://x/a.mp3')).toBe(false);
    expect(await service.sendDocumentByBotId(id, 'http://x/d.pdf')).toBe(false);
    expect(await service.sendVoiceByBotId(id, 'http://x/voice.ogg')).toBe(false);
    expect(await service.sendAnimationByBotId(id, 'http://x/anim.gif')).toBe(false);
    expect(await service.sendStickerByBotId(id, 'http://x/s.webp')).toBe(false);
    expect(await service.sendMessageByBotId(id, 'hi')).toBe(false);

    // No stats persisted because every send failed.
    const persisted = await model.findById(bot._id);
    expect(persisted.stats.videosSent).toBe(0);
    expect(persisted.stats.audiosSent).toBe(0);
    expect(persisted.stats.documentsSent).toBe(0);
    expect(persisted.stats.voicesSent).toBe(0);
    expect(persisted.stats.animationsSent).toBe(0);
    expect(persisted.stats.stickersSent).toBe(0);
  });
});

describe('BotsService - media group', () => {
  test('sendMediaGroupByBotId success (video + audio + buffer + thumbnail)', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendMediaGroupByBotId(bot._id.toString(), [
      { type: 'video', media: Buffer.from('v'), caption: 'c', parseMode: 'HTML', hasSpoiler: true, duration: 5, width: 1, height: 1, supportsStreaming: true, thumbnail: Buffer.from('t') },
      { type: 'audio', media: 'http://x/a.mp3', duration: 10, performer: 'P', title: 'T', extension: 'mp3' },
      { type: 'photo', media: Buffer.from('p') },
    ], { disableNotification: true, replyToMessageId: 1, allowSendingWithoutReply: true, protectContent: true });
    expect(ok).toBe(true);
  });

  test('sendMediaGroupByBotId with bare video/audio items and a no-extension buffer photo', async () => {
    // A simple album where the video/audio items omit all optional metadata, the photo is a
    // raw buffer with no extension, and the options object carries no flags. Exercises the
    // "absent option" (false) side of the per-item and album-level conditionals.
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendMediaGroupByBotId(bot._id.toString(), [
      { type: 'video', media: 'http://x/v.mp4' },        // no duration/width/height/streaming
      { type: 'audio', media: 'http://x/a.mp3' },        // no duration/performer/title
      { type: 'photo', media: Buffer.from('p') },        // buffer, no extension -> default ext
    ], {} as any); // options present but every flag falsy
    expect(ok).toBe(true);
  });

  test('sendMediaGroupByBotId returns false on ok=false', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: false, description: 'x' }));
    const ok = await service.sendMediaGroupByBotId(bot._id.toString(), [{ type: 'photo', media: 'http://x/p.jpg' }]);
    expect(ok).toBe(false);
  });

  test('sendMediaGroupByBotId returns false on throw', async () => {
    const bot = await seedBot();
    mockedAxios.post.mockRejectedValue(new Error('boom'));
    const ok = await service.sendMediaGroupByBotId(bot._id.toString(), [{ type: 'photo', media: 'http://x/p.jpg' }]);
    expect(ok).toBe(false);
  });
});

describe('BotsService - sendByCategoryWithFailover', () => {
  test('no bots in category → false', async () => {
    const ok = await service.sendMessageByCategory(ChannelCategory.SAVED_MESSAGES, 'hi');
    expect(ok).toBe(false);
  });

  test('all bots fail → false', async () => {
    await seedBot({ category: ChannelCategory.HTTP_FAILURES });
    await seedBot({ category: ChannelCategory.HTTP_FAILURES });
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: false, description: 'nope' }));
    const ok = await service.sendMessageByCategory(ChannelCategory.HTTP_FAILURES, 'hi');
    expect(ok).toBe(false);
  });

  test('first fails second succeeds → true (failover)', async () => {
    await seedBot({ category: ChannelCategory.UNAUTH_CALLS, lastUsed: new Date(1000) });
    await seedBot({ category: ChannelCategory.UNAUTH_CALLS, lastUsed: new Date(2000) });
    mockedAxios.post
      .mockResolvedValueOnce(axiosOk({ ok: false, description: 'fail' }))
      .mockResolvedValueOnce(axiosOk({ ok: true }));
    const ok = await service.sendMessageByCategory(ChannelCategory.UNAUTH_CALLS, 'hi');
    expect(ok).toBe(true);
  });

  test('category cache miss path inside failover then success', async () => {
    await seedBot({ category: ChannelCategory.CLIENT_PROMOTIONS_1 });
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    // service has empty cache → triggers db fetch inside failover
    const ok = await service.sendPhotoByCategory(ChannelCategory.CLIENT_PROMOTIONS_1, 'http://x/p.jpg');
    expect(ok).toBe(true);
  });

  test('other category senders route through failover', async () => {
    await seedBot({ category: ChannelCategory.CLIENT_PROMOTIONS_2 });
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    expect(await service.sendVideoByCategory(ChannelCategory.CLIENT_PROMOTIONS_2, 'u')).toBe(true);
    expect(await service.sendAudioByCategory(ChannelCategory.CLIENT_PROMOTIONS_2, 'u')).toBe(true);
    expect(await service.sendDocumentByCategory(ChannelCategory.CLIENT_PROMOTIONS_2, 'u')).toBe(true);
    expect(await service.sendVoiceByCategory(ChannelCategory.CLIENT_PROMOTIONS_2, 'u')).toBe(true);
    expect(await service.sendAnimationByCategory(ChannelCategory.CLIENT_PROMOTIONS_2, 'u')).toBe(true);
    expect(await service.sendStickerByCategory(ChannelCategory.CLIENT_PROMOTIONS_2, 'u')).toBe(true);
    expect(await service.sendMediaGroupByCategory(ChannelCategory.CLIENT_PROMOTIONS_2, [{ type: 'photo', media: 'u' }])).toBe(true);
  });
});

describe('BotsService - flushPendingStats', () => {
  test('no pending updates → early return', async () => {
    await expect((service as any).flushPendingStats()).resolves.toBeUndefined();
  });

  test('forced flush via maxPendingUpdates threshold writes to DB', async () => {
    const bot = await seedBot({ category: ChannelCategory.UNVDS });
    // Pre-seed cache pending stats to the threshold (99) so the next send (#100)
    // crosses maxPendingUpdates and forces a flush inside updateBotStats.
    const cache = (service as any).cache;
    const pending: Record<string, any> = {};
    for (let i = 0; i < 99; i++) {
      // Use valid ObjectId strings so the bulkWrite filter casts cleanly
      // (a bad cast throws and the whole bulkWrite is swallowed by the catch).
      pending[new mongoose.Types.ObjectId().toString()] = { messagesSent: 1, lastUsed: new Date() };
    }
    cache.set('pendingStats', pending);
    mockedAxios.post.mockResolvedValue(axiosOk({ ok: true }));
    const ok = await service.sendMessageByBotId(bot._id.toString(), 'm');
    expect(ok).toBe(true);
    // After forced flush the real bot's stat should be persisted to DB.
    const persisted = await model.findById(bot._id);
    expect(persisted.stats.messagesSent).toBeGreaterThanOrEqual(1);
  });

  test('flushPendingStats handles bulkWrite error', async () => {
    const cache = (service as any).cache;
    cache.set('pendingStats', { someId: { messagesSent: 1, photosSent: 2, videosSent: 1, documentsSent: 1, audiosSent: 1, voicesSent: 1, animationsSent: 1, stickersSent: 1, mediaGroupsSent: 1, lastUsed: new Date() } });
    const spy = jest.spyOn(model, 'bulkWrite').mockRejectedValueOnce(new Error('bulk fail'));
    await expect((service as any).flushPendingStats()).resolves.toBeUndefined();
    spy.mockRestore();
  });

  test('flushPendingStats writes only the touched stat fields (sparse update, no lastUsed)', async () => {
    // Realistic accrual: a bot only sent messages and photos in this window, with no lastUsed
    // recorded. The bulk $inc must include just those two fields and omit the $set for lastUsed,
    // exercising the false side of each per-field ternary.
    const bot = await seedBot({ stats: { ...baseStats } });
    const cache = (service as any).cache;
    cache.set('pendingStats', { [bot._id.toString()]: { messagesSent: 3, photosSent: 2 } });

    await (service as any).flushPendingStats();

    const updated = await model.findById(bot._id);
    expect(updated.stats.messagesSent).toBe(3);
    expect(updated.stats.photosSent).toBe(2);
    expect(updated.stats.videosSent).toBe(0); // untouched fields stay at zero
  });

  test('flushPendingStats writes all stat fields', async () => {
    const bot = await seedBot();
    const cache = (service as any).cache;
    cache.set('pendingStats', { [bot._id.toString()]: {
      messagesSent: 1, photosSent: 1, videosSent: 1, documentsSent: 1, audiosSent: 1,
      voicesSent: 1, animationsSent: 1, stickersSent: 1, mediaGroupsSent: 1, lastUsed: new Date(),
    } });
    await (service as any).flushPendingStats();
    const updated = await model.findById(bot._id);
    expect(updated.stats.messagesSent).toBe(1);
  });
});

describe('BotsService - getBotStatsByCategory', () => {
  test('aggregate (cache miss) then cache hit', async () => {
    await seedBot({ category: ChannelCategory.PROM_LOGS2, stats: { ...baseStats, messagesSent: 5 } });
    const stats = await service.getBotStatsByCategory(ChannelCategory.PROM_LOGS2);
    expect(stats.totalBots).toBe(1);
    expect(stats.totalMessagesSent).toBe(5);
    const cached = await service.getBotStatsByCategory(ChannelCategory.PROM_LOGS2);
    expect(cached.totalBots).toBe(1);
  });

  test('empty category returns default', async () => {
    const stats = await service.getBotStatsByCategory(ChannelCategory.VC_WARNINGS);
    expect(stats.totalBots).toBe(0);
  });
});

describe('BotsService - getDefaultExtension', () => {
  test('covers all branches', () => {
    const ext = (service as any).getDefaultExtension.bind(service);
    expect(ext('photo')).toBe('jpg');
    expect(ext('video')).toBe('mp4');
    expect(ext('audio')).toBe('mp3');
    expect(ext('document')).toBe('bin');
    expect(ext('weird')).toBe('dat');
  });
});

describe('BotsService - addMethodSpecificOptions videonote branch', () => {
  test('sendVideoNote with length and duration', () => {
    const FormData = require('form-data');
    const fd = new FormData();
    (service as any).addMethodSpecificOptions('sendVideoNote', { duration: 5, length: 100 }, fd);
    // no throw → branch covered
    expect(fd).toBeTruthy();
  });
});
