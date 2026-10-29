import { BadRequestException, INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { paidChatsSql } from '../monitor-sql';
import { istDayStart } from '../monitor-time';
import { MonitorController, parsePaidDate } from '../monitor.controller';
import { MonitorService } from '../monitor.service';

// 2026-10-28 15:42:10 IST
const NOW = Date.parse('2026-10-28T10:12:10.000Z');
const D0 = '2026-10-27T18:30:00.000Z'; // 2026-10-28 00:00 IST
const D1 = '2026-10-28T18:30:00.000Z'; // 2026-10-29 00:00 IST

type Credit = { client_id: string; chat_id: string; persona_id: string; ts: string; amount: number; cheat?: boolean };

/**
 * Fake Postgres: holds raw payment_event_owner credits and answers the paid_chats statement the way
 * Postgres would (range on ts, amount > 0, GROUP BY client_id, chat_id, ORDER BY max(ts) DESC).
 */
function fakePg(credits: Credit[] | 'fail') {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      calls.push({ sql, params });
      if (credits === 'fail') {
        onError?.({ kind: 'query', message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' });
        return undefined;
      }
      expect(sql).toMatch(/^\/\* monitor\.paid_chats \*\//);
      const [start, end] = params as [string, string];
      const groups = new Map<string, any>();
      for (const c of credits) {
        const t = Date.parse(c.ts);
        if (t < Date.parse(start) || t >= Date.parse(end) || c.amount <= 0) continue;
        const k = `${c.client_id}|${c.chat_id}`;
        const g = groups.get(k) ?? { client_id: c.client_id, chat_id: c.chat_id, persona_id: c.persona_id, credits: 0, amount: 0, owner_amount: 0, cheat_flagged: false, first_at: null, last_at: null };
        g.credits += 1;
        g.amount += c.amount;
        g.owner_amount += c.cheat ? 0 : c.amount;
        g.cheat_flagged = g.cheat_flagged || !!c.cheat;
        g.first_at = g.first_at === null || t < g.first_at.getTime() ? new Date(t) : g.first_at;
        g.last_at = g.last_at === null || t > g.last_at.getTime() ? new Date(t) : g.last_at;
        groups.set(k, g);
      }
      // pg returns bigint sums as strings
      return [...groups.values()]
        .sort((a, b) => b.last_at.getTime() - a.last_at.getTime())
        .map((g) => ({ ...g, amount: String(g.amount), owner_amount: String(g.owner_amount) }));
    }),
  };
}

function build(credits: Credit[] | 'fail', userData: any[] | 'fail' = []) {
  const pg = fakePg(credits);
  const finds: any[] = [];
  const connection = {
    collection: (coll: string) => ({
      find: (filter: any, opts: any) => {
        finds.push({ coll, filter, opts });
        return {
          toArray: async () => {
            if (userData === 'fail') throw new Error('mongo down');
            return userData;
          },
        };
      },
      aggregate: () => ({ toArray: async () => [] }),
    }),
  };
  const redis = { smembers: jest.fn(async () => []), mget: jest.fn(async (k: string[]) => k.map(() => null)) };
  const svc = new MonitorService(pg as any, connection as any, redis);
  return { svc, pg, finds };
}

const ist = (s: string) => new Date(Date.parse(`${s}+05:30`)).toISOString();

describe('paidChatsSql', () => {
  it('IST day bounds: 2026-10-28 = [2026-10-27T18:30Z, 2026-10-28T18:30Z), grouped per client + chat', () => {
    const q = paidChatsSql(istDayStart('2026-10-28'), istDayStart('2026-10-29'));
    expect(q.params).toEqual([D0, D1]);
    expect(q.sql).toMatch(/^\/\* monitor\.paid_chats \*\//);
    expect(q.sql).toContain('FROM payment_event_owner');
    expect(q.sql).toContain('ts >= $1::timestamptz AND ts < $2::timestamptz AND amount > 0');
    expect(q.sql).toContain('GROUP BY client_id, chat_id\n');
  });
});

describe('parsePaidDate', () => {
  it.each(['', undefined, '2026-1-28', '28-10-2026', '2026-10-28T00:00', '2026-02-30', "2026-10-28' OR 1=1"])('rejects %p', (d) => {
    expect(() => parsePaidDate(d as any, NOW)).toThrow(BadRequestException);
  });
  it('rejects days before 2026-10-04 and after today IST', () => {
    expect(() => parsePaidDate('2026-10-03', NOW)).toThrow(BadRequestException);
    expect(() => parsePaidDate('2026-10-29', NOW)).toThrow(BadRequestException);
  });
  it('accepts 2026-10-04 .. today IST (today follows IST, not UTC)', () => {
    expect(parsePaidDate('2026-10-04', NOW)).toBe('2026-10-04');
    expect(parsePaidDate('2026-10-28', NOW)).toBe('2026-10-28');
    // 2026-10-28T19:00Z is already 2026-10-29 00:30 IST
    expect(parsePaidDate('2026-10-29', Date.parse('2026-10-28T19:00:00.000Z'))).toBe('2026-10-29');
  });
});

describe('MonitorService.paidChats', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  const CREDITS: Credit[] = [
    // many credits on one chat -> one row
    { client_id: 'alpha1', chat_id: '1001', persona_id: 'alpha', ts: ist('2026-10-28T09:00:00.000'), amount: 100 },
    { client_id: 'alpha1', chat_id: '1001', persona_id: 'alpha', ts: ist('2026-10-28T11:30:00.000'), amount: 200 },
    { client_id: 'alpha1', chat_id: '1001', persona_id: 'alpha', ts: ist('2026-10-28T12:00:00.000'), amount: 50 },
    // same chat on a second client -> its own row
    { client_id: 'alpha2', chat_id: '1001', persona_id: 'alpha', ts: ist('2026-10-28T10:00:00.000'), amount: 150 },
    // cheat-flagged chat: listed, owner amount 0
    { client_id: 'beta1', chat_id: '2002', persona_id: 'beta', ts: ist('2026-10-28T13:00:00.000'), amount: 300, cheat: true },
    // 1 ms before IST midnight of the 28th: belongs to the 27th only
    { client_id: 'beta1', chat_id: '3003', persona_id: 'beta', ts: ist('2026-10-27T23:59:59.999'), amount: 99 },
    // exactly IST midnight of the 29th: not on the 28th
    { client_id: 'beta1', chat_id: '4004', persona_id: 'beta', ts: ist('2026-10-29T00:00:00.000'), amount: 77 },
  ];

  it('one row per (clientId, chatId) for the IST day, totals over the rows, newest first', async () => {
    const { svc, pg } = build(CREDITS, [{ chatId: '1001', profile: 'alpha', clientId: 'alpha1', username: 'fake_user' }]);
    const r = await svc.paidChats('2026-10-28', null);
    expect(pg.calls[0].params).toEqual([D0, D1]);
    expect(r.chats.map((c) => `${c.clientId}|${c.chatId}`)).toEqual(['beta1|2002', 'alpha1|1001', 'alpha2|1001']);
    const a1 = r.chats.find((c) => c.clientId === 'alpha1')!;
    expect(a1).toEqual({
      clientId: 'alpha1',
      chatId: '1001',
      profile: 'alpha',
      username: 'fake_user',
      credits: 3,
      amount: 350,
      ownerAmount: 350,
      cheatFlagged: false,
      firstCreditAt: ist('2026-10-28T09:00:00.000'),
      lastCreditAt: ist('2026-10-28T12:00:00.000'),
    });
    // userData row has clientId alpha1 only; alpha2 falls back to the persona row (same profile + chat)
    expect(r.chats.find((c) => c.clientId === 'alpha2')!.username).toBe('fake_user');
    expect(r.chats.find((c) => c.clientId === 'beta1')).toMatchObject({ cheatFlagged: true, amount: 300, ownerAmount: 0, username: null });
    expect(r.totals).toEqual({ chats: 3, credits: 5, amount: 800, ownerAmount: 500 });
    expect(r).toMatchObject({ date: '2026-10-28', tz: 'Asia/Kolkata', clientId: null, source: 'payment_event', notes: [] });
  });

  it('credit 1 ms before IST midnight is on the previous day only', async () => {
    const { svc } = build(CREDITS);
    const prev = await svc.paidChats('2026-10-27', null);
    expect(prev.chats.map((c) => c.chatId)).toEqual(['3003']);
    const day = await svc.paidChats('2026-10-28', null);
    expect(day.chats.map((c) => c.chatId)).not.toContain('3003');
  });

  it('clientId filters in memory; one Postgres query serves every filter of a day', async () => {
    const { svc, pg } = build(CREDITS);
    const r = await svc.paidChats('2026-10-28', 'alpha2');
    expect(r.chats).toHaveLength(1);
    expect(r.totals).toEqual({ chats: 1, credits: 1, amount: 150, ownerAmount: 150 });
    expect(r.clientId).toBe('alpha2');
    await svc.paidChats('2026-10-28', 'beta1');
    expect(pg.calls).toHaveLength(1);
  });

  it('usernames come from ONE userData find by chatId (index prefix), only for the listed chats', async () => {
    const { svc, finds } = build(CREDITS);
    await svc.paidChats('2026-10-28', null);
    expect(finds).toHaveLength(1);
    expect(finds[0].coll).toBe('userData');
    expect(finds[0].filter).toEqual({ chatId: { $in: ['2002', '1001'] } });
  });

  it('a Mongo failure keeps the rows and adds a note (usernames null)', async () => {
    const { svc } = build(CREDITS, 'fail');
    const r = await svc.paidChats('2026-10-28', null);
    expect(r.chats).toHaveLength(3);
    expect(r.chats.every((c) => c.username === null)).toBe(true);
    expect(r.notes.join(' ')).toMatch(/usernames unavailable: mongo down/);
  });

  it('a day with no credits = empty list, no Mongo call', async () => {
    const { svc, finds } = build([]);
    const r = await svc.paidChats('2026-10-20', null);
    expect(r.chats).toEqual([]);
    expect(r.totals).toEqual({ chats: 0, credits: 0, amount: 0, ownerAmount: 0 });
    expect(finds).toHaveLength(0);
  });

  it('Postgres failure = 503, never an empty list', async () => {
    const { svc } = build('fail');
    const err = await svc.paidChats('2026-10-28', null).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(String(err.message)).toMatch(/paid chats unavailable: query: connect ECONNREFUSED/);
  });
});

describe('GET /monitor/paid-chats over HTTP', () => {
  let app: INestApplication;
  const svc = {
    paidChats: jest.fn(async (date: string, clientId: string | null) => ({ date, clientId, chats: [] })),
    client: jest.fn(async (clientId: string) => ({ route: 'client', clientId })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MonitorController],
      providers: [{ provide: MonitorService, useValue: svc }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('resolves to paidChats (not client/:clientId) with date + clientId', async () => {
    const res = await request(app.getHttpServer()).get('/monitor/paid-chats?date=2026-10-20&clientId=alpha1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: '2026-10-20', clientId: 'alpha1', chats: [] });
    expect(svc.paidChats).toHaveBeenCalledWith('2026-10-20', 'alpha1');
    expect(svc.client).not.toHaveBeenCalled();
  });

  it('declared before client/:clientId', () => {
    const proto = MonitorController.prototype as any;
    const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    const paths = names.map((n) => Reflect.getMetadata('path', proto[n]));
    expect(paths.indexOf('paid-chats')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('paid-chats')).toBeLessThan(paths.indexOf('client/:clientId'));
  });

  it.each([
    ['missing date', '/monitor/paid-chats'],
    ['bad date', '/monitor/paid-chats?date=yesterday'],
    ['before 2026-10-04', '/monitor/paid-chats?date=2026-10-03'],
    ['future date', '/monitor/paid-chats?date=2999-01-01'],
    ['bad clientId', '/monitor/paid-chats?date=2026-10-20&clientId=a%20b'],
  ])('%s = 400', async (_n, url) => {
    const res = await request(app.getHttpServer()).get(url);
    expect(res.status).toBe(400);
    expect(svc.paidChats).not.toHaveBeenCalled();
  });

  it('service 503 passes through', async () => {
    svc.paidChats.mockRejectedValueOnce(new ServiceUnavailableException('paid chats unavailable: x'));
    const res = await request(app.getHttpServer()).get('/monitor/paid-chats?date=2026-10-20');
    expect(res.status).toBe(503);
  });
});
