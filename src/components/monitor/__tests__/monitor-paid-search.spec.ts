import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { likeContains, paidChatIdsSql, paidChatsSearchSql } from '../monitor-sql';
import { istDayStart } from '../monitor-time';
import { escapeRegExp } from '../monitor-util';
import { MonitorController, parsePaidSearchLimit, parsePaidSearchQ } from '../monitor.controller';
import { MonitorService } from '../monitor.service';

// 2026-11-14 15:42:10 IST
const NOW = Date.parse('2026-11-14T10:12:10.000Z');
const FROM = '2026-10-03T18:30:00.000Z'; // 2026-10-04 00:00 IST

type Credit = { client_id: string; chat_id: string; persona_id: string; ts: string; amount: number; cheat?: boolean };
const ist = (s: string) => new Date(Date.parse(`${s}+05:30`)).toISOString();
const istDay = (t: number) => new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);

/** LIKE '%x%' with backslash escapes -> JS predicate, case-insensitive (ILIKE). */
function ilike(pattern: string): (v: string) => boolean {
  const inner = pattern.slice(1, -1);
  let lit = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '\\') lit += inner[++i];
    else if (inner[i] === '%' || inner[i] === '_') throw new Error(`unescaped wildcard in ${pattern}`);
    else lit += inner[i];
  }
  return (v) => v.toLowerCase().includes(lit.toLowerCase());
}

/** Fake Postgres answering paid_chat_ids and paid_chats_search the way Postgres would. */
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
      const from = Date.parse(params[0] as string);
      const live = credits.filter((c) => Date.parse(c.ts) >= from && c.amount > 0);
      if (/^\/\* monitor\.paid_chat_ids \*\//.test(sql)) return [...new Set(live.map((c) => c.chat_id))].map((chat_id) => ({ chat_id }));
      expect(sql).toMatch(/^\/\* monitor\.paid_chats_search \*\//);
      const [, pattern, ids, exact, limit] = params as [string, string, string[], string | null, number];
      const m = ilike(pattern);
      const groups = new Map<string, any>();
      for (const c of live) {
        if (!(m(c.chat_id) || m(c.client_id) || m(c.persona_id) || ids.includes(c.chat_id))) continue;
        const t = Date.parse(c.ts);
        const day = istDay(t);
        const k = `${c.client_id}|${c.chat_id}|${day}`;
        const g = groups.get(k) ?? { client_id: c.client_id, chat_id: c.chat_id, day, persona_id: c.persona_id, credits: 0, amount: 0, owner_amount: 0, cheat_flagged: false, first_at: null, last_at: null };
        g.credits += 1;
        g.amount += c.amount;
        g.owner_amount += c.cheat ? 0 : c.amount;
        g.cheat_flagged = g.cheat_flagged || !!c.cheat;
        g.first_at = g.first_at === null || t < g.first_at.getTime() ? new Date(t) : g.first_at;
        g.last_at = g.last_at === null || t > g.last_at.getTime() ? new Date(t) : g.last_at;
        groups.set(k, g);
      }
      return [...groups.values()]
        .sort((a, b) => Number(b.chat_id === exact) - Number(a.chat_id === exact) || b.last_at.getTime() - a.last_at.getTime())
        .slice(0, limit)
        .map((g) => ({ ...g, amount: String(g.amount), owner_amount: String(g.owner_amount) }));
    }),
  };
}

/** Fake Mongo userData: honours chatId $in and the username $regex of the search find. */
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
            return userData.filter((d) => {
              if (filter.chatId?.$in && !filter.chatId.$in.includes(d.chatId)) return false;
              if (filter.username && !new RegExp(filter.username.$regex, filter.username.$options).test(d.username ?? '')) return false;
              return true;
            });
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

describe('paid-chats search SQL + escaping', () => {
  it('likeContains escapes LIKE wildcards and backslash', () => {
    expect(likeContains('ab')).toBe('%ab%');
    expect(likeContains('a%b_c\\d')).toBe('%a\\%b\\_c\\\\d%');
  });

  it('escapeRegExp makes metacharacters literal', () => {
    const src = escapeRegExp('a.b*(c)[d]+?^$|\\');
    expect(new RegExp(src).test('a.b*(c)[d]+?^$|\\')).toBe(true);
    expect(new RegExp(escapeRegExp('a.b')).test('axb')).toBe(false);
  });

  it('search groups per (client, chat, IST day), all clients, from 2026-10-04, exact chat id first', () => {
    const s = paidChatsSearchSql(istDayStart('2026-10-04'), '%ab%', ['1'], '123', 101);
    expect(s.sql).toMatch(/FROM payment_event_owner/);
    expect(s.sql).toMatch(/GROUP BY client_id, chat_id, to_char\(\(ts AT TIME ZONE 'Asia\/Kolkata'\), 'YYYY-MM-DD'\)/);
    expect(s.sql).toMatch(/ORDER BY \(chat_id = \$4::text\) IS TRUE DESC, max\(ts\) DESC/);
    expect(s.sql).not.toMatch(/client_id = \$/);
    expect(s.params).toEqual([FROM, '%ab%', ['1'], '123', 101]);
    expect(paidChatIdsSql(istDayStart('2026-10-04')).params).toEqual([FROM]);
  });
});

describe('MonitorService.searchPaidChats', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  const CREDITS: Credit[] = [
    // same chat, two IST days -> two rows
    { client_id: 'alpha1', chat_id: '5551234', persona_id: 'alpha', ts: ist('2026-10-05T09:00:00.000'), amount: 100 },
    { client_id: 'alpha1', chat_id: '5551234', persona_id: 'alpha', ts: ist('2026-10-05T10:00:00.000'), amount: 50 },
    { client_id: 'alpha1', chat_id: '5551234', persona_id: 'alpha', ts: ist('2026-11-12T23:59:59.999'), amount: 200 },
    // same chat on another client, another day
    { client_id: 'beta2', chat_id: '5551234', persona_id: 'beta', ts: ist('2026-11-13T00:00:00.000'), amount: 250, cheat: true },
    // chat id containing the digits, newer: listed after the exact hit
    { client_id: 'gamma1', chat_id: '9555123477', persona_id: 'gamma', ts: ist('2026-11-14T12:00:00.000'), amount: 75 },
    // matched by username only
    { client_id: 'gamma1', chat_id: '7007', persona_id: 'gamma', ts: ist('2026-11-01T12:00:00.000'), amount: 60 },
    // same chat id on another client whose userData username does not match
    { client_id: 'delta1', chat_id: '7007', persona_id: 'delta', ts: ist('2026-11-02T12:00:00.000'), amount: 40 },
    // non-credit row (amount <= 0) never listed
    { client_id: 'alpha1', chat_id: '8008', persona_id: 'alpha', ts: ist('2026-11-03T12:00:00.000'), amount: -100 },
  ];
  const USERS = [
    { chatId: '7007', profile: 'gamma', clientId: 'gamma1', username: 'Moon_Rider' },
    { chatId: '7007', profile: 'delta', clientId: 'delta1', username: 'someone_else' },
    { chatId: '5551234', profile: 'alpha', clientId: 'alpha1', username: 'payer_a' },
  ];

  it('digits: exact chat id rows first, one row per (client, chat, IST day), with date', async () => {
    const { svc } = build(CREDITS, USERS);
    const r = await svc.searchPaidChats('5551234', 100);
    expect(r).toMatchObject({ q: '5551234', tz: 'Asia/Kolkata', from: '2026-10-04', source: 'payment_event', truncated: false, notes: [] });
    expect(r.chats.map((c) => `${c.clientId}|${c.chatId}|${c.date}`)).toEqual([
      'beta2|5551234|2026-11-13',
      'alpha1|5551234|2026-11-12',
      'alpha1|5551234|2026-10-05',
      'gamma1|9555123477|2026-11-14',
    ]);
    const oct5 = r.chats[2];
    expect(oct5).toMatchObject({ profile: 'alpha', username: 'payer_a', credits: 2, amount: 150, ownerAmount: 150, cheatFlagged: false });
    expect(oct5.firstCreditAt).toBe(ist('2026-10-05T09:00:00.000'));
    expect(r.chats[0]).toMatchObject({ cheatFlagged: true, ownerAmount: 0, amount: 250 });
  });

  it('username match is case-insensitive and stays with its own client', async () => {
    const { svc, finds } = build(CREDITS, USERS);
    const r = await svc.searchPaidChats('moon', 100);
    expect(r.chats.map((c) => `${c.clientId}|${c.chatId}|${c.username}`)).toEqual(['gamma1|7007|Moon_Rider']);
    const f = finds.find((x) => x.filter.username);
    expect(f.coll).toBe('userData');
    expect(f.filter.chatId.$in.sort()).toEqual(['5551234', '7007', '9555123477']);
    expect(f.filter.username).toEqual({ $regex: 'moon', $options: 'i' });
  });

  it('client id and persona match case-insensitively across clients', async () => {
    const { svc } = build(CREDITS, USERS);
    expect((await svc.searchPaidChats('DELTA', 100)).chats.map((c) => c.clientId)).toEqual(['delta1']);
    expect((await svc.searchPaidChats('gamma', 100)).chats.map((c) => c.chatId)).toEqual(['9555123477', '7007']);
  });

  it('regex and LIKE metacharacters are literal', async () => {
    const { svc, pg, finds } = build(CREDITS, USERS);
    const r = await svc.searchPaidChats('.*', 100);
    expect(r.chats).toEqual([]);
    expect(finds.find((x) => x.filter.username).filter.username.$regex).toBe('\\.\\*');
    expect(pg.calls[pg.calls.length - 1].params[1]).toBe('%.*%');
    const r2 = await svc.searchPaidChats('a_', 100);
    expect(r2.chats).toEqual([]);
    expect(pg.calls[pg.calls.length - 1].params[1]).toBe('%a\\_%');
  });

  it('truncated when more rows match than limit', async () => {
    const { svc, pg } = build(CREDITS, USERS);
    const r = await svc.searchPaidChats('5551234', 2);
    expect(r.truncated).toBe(true);
    expect(r.chats).toHaveLength(2);
    expect(pg.calls[pg.calls.length - 1].params[4]).toBe(3);
  });

  it('paid chat ids are loaded once per 60 s', async () => {
    const { svc, pg } = build(CREDITS, USERS);
    await svc.searchPaidChats('moon', 100);
    await svc.searchPaidChats('alpha', 100);
    expect(pg.calls.filter((c) => /paid_chat_ids/.test(c.sql))).toHaveLength(1);
  });

  it('Mongo failure: Postgres fields still searched, note added', async () => {
    const { svc } = build(CREDITS, 'fail');
    const r = await svc.searchPaidChats('gamma', 100);
    expect(r.chats.map((c) => c.chatId)).toEqual(['9555123477', '7007']);
    expect(r.notes.some((n) => n.startsWith('username search unavailable: mongo down'))).toBe(true);
    expect((await svc.searchPaidChats('moon', 100)).chats).toEqual([]);
  });

  it('Postgres failure = 503, never an empty list', async () => {
    const { svc } = build('fail');
    const err = await svc.searchPaidChats('5551234', 100).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(String(err.message)).toMatch(/paid chat search unavailable/);
  });
});

describe('paid-chats search params', () => {
  it('q: trimmed, leading @ stripped, 2-64 chars', () => {
    expect(parsePaidSearchQ('  @Moon ')).toBe('Moon');
    expect(parsePaidSearchQ('ab')).toBe('ab');
    for (const bad of [undefined, '', ' ', 'a', '@a', ' @ ', 'x'.repeat(65)]) expect(() => parsePaidSearchQ(bad)).toThrow();
  });

  it('limit: default 100, integer 1-200', () => {
    expect(parsePaidSearchLimit(undefined)).toBe(100);
    expect(parsePaidSearchLimit('')).toBe(100);
    expect(parsePaidSearchLimit('200')).toBe(200);
    expect(parsePaidSearchLimit('1')).toBe(1);
    for (const bad of ['0', '201', '-1', '1.5', 'abc']) expect(() => parsePaidSearchLimit(bad)).toThrow();
  });
});

describe('GET /monitor/paid-chats/search over HTTP', () => {
  let app: INestApplication;
  const svc = {
    searchPaidChats: jest.fn(async (q: string, limit: number) => ({ q, limit, chats: [] })),
    paidChats: jest.fn(async () => ({ route: 'paidChats' })),
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

  it('resolves to searchPaidChats with cleaned q + default limit', async () => {
    const res = await request(app.getHttpServer()).get('/monitor/paid-chats/search?q=%20%40Moon%20');
    expect(res.status).toBe(200);
    expect(svc.searchPaidChats).toHaveBeenCalledWith('Moon', 100);
    expect(svc.paidChats).not.toHaveBeenCalled();
    expect(svc.client).not.toHaveBeenCalled();
  });

  it('passes limit', async () => {
    await request(app.getHttpServer()).get('/monitor/paid-chats/search?q=5551234&limit=20');
    expect(svc.searchPaidChats).toHaveBeenCalledWith('5551234', 20);
  });

  it('declared before client/:clientId', () => {
    const proto = MonitorController.prototype as any;
    const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    const paths = names.map((n) => Reflect.getMetadata('path', proto[n]));
    expect(paths.indexOf('paid-chats/search')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('paid-chats/search')).toBeLessThan(paths.indexOf('client/:clientId'));
  });

  it.each([
    ['missing q', '/monitor/paid-chats/search'],
    ['short q', '/monitor/paid-chats/search?q=a'],
    ['only @', '/monitor/paid-chats/search?q=%40a'],
    ['limit too big', '/monitor/paid-chats/search?q=ab&limit=201'],
    ['limit zero', '/monitor/paid-chats/search?q=ab&limit=0'],
    ['limit not a number', '/monitor/paid-chats/search?q=ab&limit=x'],
  ])('%s = 400', async (_n, url) => {
    const res = await request(app.getHttpServer()).get(url);
    expect(res.status).toBe(400);
    expect(svc.searchPaidChats).not.toHaveBeenCalled();
  });

  it('service 503 passes through', async () => {
    svc.searchPaidChats.mockRejectedValueOnce(new ServiceUnavailableException('paid chat search unavailable: x'));
    const res = await request(app.getHttpServer()).get('/monitor/paid-chats/search?q=ab');
    expect(res.status).toBe(503);
  });
});
