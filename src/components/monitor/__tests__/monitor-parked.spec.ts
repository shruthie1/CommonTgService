import { BadRequestException } from '@nestjs/common';
import { buildFacts, foldParked, loadParked, ParkedRow, rowFacts, swapIndex, UserDataLite } from '../monitor-parked';
import { parkedPaidSql } from '../monitor-sql';
import { MonitorController } from '../monitor.controller';
import { MonitorService } from '../monitor.service';

const H = 3600_000;
const DAY = 24 * H;
const REP = Date.UTC(2026, 10, 12, 10, 0, 0);
const UNTIL = REP + 3 * DAY;
/** 24-hex ObjectId string created at `ms` (second precision). */
const oid = (ms: number) => Math.floor(ms / 1000).toString(16).padStart(8, '0') + '0000000000000000';
const r = (over: Partial<ParkedRow> = {}): ParkedRow => ({ chatId: 'c1', persona: 'p', clientId: 'p1', app: 'promote', status: 'replied', repliedAt: new Date(REP), preExisting: false, ...over });

type Credit = { chat_id: string; persona_id: string; ts: number; amount: number; fake?: boolean };

/** Answers parkedPaidSql as Postgres would over payment_event_owner (owner_amount 0 for a fake-marked chat). */
function fakePgAnswer(params: unknown[], credits: Credit[]) {
  const [chats, personas, reps, until] = params as [string[], string[], string[], string];
  const fakeChats = new Set(credits.filter((c) => c.fake).map((c) => c.chat_id));
  const out: Array<{ i: string; paid_rs: string; paid_count: number }> = [];
  chats.forEach((chat, k) => {
    const hits = credits.filter((c) => c.chat_id === chat && c.persona_id === personas[k] && c.ts > Date.parse(reps[k]) && c.ts < Date.parse(until) && c.amount > 0 && c.amount < 1000);
    if (hits.length) out.push({ i: String(k + 1), paid_rs: String(hits.reduce((a, c) => a + (fakeChats.has(c.chat_id) ? 0 : c.amount), 0)), paid_count: hits.length });
  });
  return out;
}

const WRITES = ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'bulkWrite', 'drop', 'createIndex'];

/** Fake Mongo connection over in-memory collections; every write method is a jest.fn that must stay uncalled. */
function fakeConnection(data: Record<string, any[]>, fail = false) {
  const writes: jest.Mock[] = [];
  const pipelines: object[][] = [];
  const finds: Array<{ coll: string; filter: any; sort?: any; limit?: number }> = [];
  const match = (doc: any, filter: any): boolean =>
    Object.entries(filter).every(([k, v]: [string, any]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('$in' in v) return v.$in.includes(doc[k]);
        if ('$gte' in v) return doc[k] >= v.$gte && doc[k] < v.$lt;
        if ('$gt' in v) return doc[k] > v.$gt && doc[k] <= v.$lte;
      }
      return doc[k] === v;
    });
  const connection = {
    collection: (name: string) => {
      const coll: any = {
        find: (filter: any) => {
          const rec: { coll: string; filter: any; sort?: any; limit?: number } = { coll: name, filter };
          finds.push(rec);
          const cursor: any = {
            sort: (sort: any) => ((rec.sort = sort), cursor),
            limit: (n: number) => ((rec.limit = n), cursor),
            toArray: async () => {
              if (fail) throw new Error('mongo down');
              let xs = (data[name] ?? []).filter((d) => match(d, filter));
              if (rec.sort) {
                const [[f, dir]] = Object.entries(rec.sort) as [[string, number]];
                xs = [...xs].filter((d) => d[f] !== undefined).sort((a, b) => (a[f] < b[f] ? -dir : a[f] > b[f] ? dir : 0));
              }
              return rec.limit ? xs.slice(0, rec.limit) : xs;
            },
          };
          return cursor;
        },
        aggregate: (pipeline: any[]) => {
          pipelines.push(pipeline);
          return {
            toArray: async () => {
              if (fail) throw new Error('mongo down');
              const m = pipeline.find((s) => s.$match)?.$match ?? {};
              const g = pipeline.find((s) => s.$group).$group;
              const field = String(g.min.$min).slice(1);
              const xs = (data[name] ?? []).filter((d) => match(d, m)).map((d) => d[field]).filter((x) => x !== undefined);
              return xs.length ? [{ _id: null, min: xs.reduce((a, b) => (a < b ? a : b)) }] : [];
            },
          };
        },
      };
      for (const w of WRITES) {
        const fn = jest.fn(() => {
          throw new Error(`write ${w} on ${name}`);
        });
        writes.push(fn);
        coll[w] = fn;
      }
      return coll;
    },
  };
  return { connection, writes, pipelines, finds };
}

function fakePg(credits: Credit[] | 'fail') {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      calls.push({ sql, params });
      if (credits === 'fail') {
        onError?.({ kind: 'connect', message: 'connect ETIMEDOUT' });
        return undefined;
      }
      return fakePgAnswer(params, credits);
    }),
  };
}

const redis = { smembers: jest.fn(async () => []), mget: jest.fn(async (k: string[]) => k.map(() => null)) };

describe('rowFacts (ported from the parked-follow-through skill)', () => {
  it('new user: msgCount of the row created after the reply, not the max over persona rows', () => {
    const rows: UserDataLite[] = [
      { _id: oid(REP - DAY), profile: 'p', msgCount: 7 },
      { _id: oid(REP + 60_000), profile: 'p', msgCount: 0 },
    ];
    expect(rowFacts(r(), rows).moved).toBe(false);
    rows[1].msgCount = 2;
    const f = rowFacts(r(), rows);
    expect(f.moved).toBe(true);
    expect(f.moveAt).toBe(REP + 60_000);
  });

  it('already-user: msgCount of the newest persona row (by lastMsgTimeStamp) against msgCountAtReply', () => {
    const rows: UserDataLite[] = [
      { _id: oid(REP - 9e6), profile: 'p', msgCount: 9, lastMsgTimeStamp: REP - 5e6 },
      { _id: oid(REP - 8e6), profile: 'p', msgCount: 3, lastMsgTimeStamp: REP + 5e5 },
    ];
    expect(rowFacts(r({ preExisting: true, msgCountAtReply: 3 }), rows).moved).toBe(false);
    rows[1].msgCount = 4;
    const f = rowFacts(r({ preExisting: true, msgCountAtReply: 3, reachedAt: new Date(REP + 20 * 60_000) }), rows);
    expect(f.moved).toBe(true);
    expect(f.moveAt).toBe(REP + 20 * 60_000);
  });

  it('landed fallback = clientId of the newest persona row (stored reachedClientId wins when present)', () => {
    const rows: UserDataLite[] = [
      { _id: oid(REP), profile: 'p', msgCount: 1, clientId: 'p1', lastMsgTimeStamp: REP + 1 },
      { _id: oid(REP), profile: 'p', msgCount: 1, clientId: 'p2', lastMsgTimeStamp: REP + 2 },
      { _id: oid(REP), profile: 'other', clientId: 'o1', lastMsgTimeStamp: REP + 9 },
    ];
    expect(rowFacts(r(), rows).landed).toBe('p2');
    expect(rowFacts(r({ reachedClientId: null }), rows).landed).toBeNull();
    expect(rowFacts(r({ reachedClientId: 'p3' }), rows).landed).toBe('p3');
  });

  it('paid: Postgres credits of the same persona after the reply and before until, amount > 0; 0 for a fake-marked chat', async () => {
    const credits: Credit[] = [
      { chat_id: 'c1', persona_id: 'p', ts: REP - 1, amount: 50 },
      { chat_id: 'c1', persona_id: 'p', ts: REP + 1, amount: 100 },
      { chat_id: 'c1', persona_id: 'p', ts: UNTIL + 1, amount: 200 },
      { chat_id: 'c1', persona_id: 'p', ts: REP + 2, amount: 0 },
      { chat_id: 'c1', persona_id: 'other', ts: REP + 3, amount: 300 },
      { chat_id: 'c2', persona_id: 'p', ts: REP + 1, amount: 100, fake: true },
      { chat_id: 'c1', persona_id: 'p', ts: REP + 4, amount: 1000 }, // owner rule 8: never a real credit
    ];
    const rows = [r(), r({ chatId: 'c2' })];
    const data = { parkedChats: rows, userData: [{ _id: oid(REP), chatId: 'c2', profile: 'x', fakePaymentAt: new Date(REP) }], accountRoleEvents: [] };
    const { connection } = fakeConnection(data);
    const io = {
      find: (c: string, f: object) => connection.collection(c).find(f).toArray(),
      first: async () => null,
      pg: async (q: any) => fakePgAnswer(q.params, credits) as any[],
    };
    const L = await loadParked(io, { filter: { status: 'replied' }, until: UNTIL, now: UNTIL, paidSql: parkedPaidSql, coverage: true });
    expect(L.facts.map((f) => f.paid)).toEqual([
      { paidRs: 100, paidCount: 1 },
      { paidRs: 0, paidCount: 1 },
    ]);
    expect(L.facts.map((f) => f.fake)).toEqual([false, true]);
  });
});

describe('parkedPaidSql', () => {
  it('SQL snapshot: unnest with ordinality, persona-matched, (replied_at, until), 0 < amount < 1000, owner_amount', () => {
    const q = parkedPaidSql([{ chatId: 'c1', persona: 'p', repliedAt: REP }], UNTIL);
    expect(q.name).toBe('parked_paid');
    expect(q.sql).toBe(`/* monitor.parked_paid */ SELECT r.i, sum(p.owner_amount)::bigint AS paid_rs, count(*)::int AS paid_count
FROM unnest($1::text[], $2::text[], $3::timestamptz[]) WITH ORDINALITY AS r(chat_id, persona, replied_at, i)
JOIN payment_event_owner p ON p.chat_id = r.chat_id AND p.persona_id = r.persona
WHERE p.ts > r.replied_at AND p.ts < $4::timestamptz AND p.amount > 0 AND p.amount < 1000
GROUP BY r.i`);
    expect(q.params).toEqual([['c1'], ['p'], ['2026-11-12T10:00:00.000Z'], '2026-11-15T10:00:00.000Z']);
  });
});

describe('loadParked chunking', () => {
  it('reads userData in $in chunks of 1,000 chat ids and keeps facts aligned with rows', async () => {
    const n = 2001;
    const rows = Array.from({ length: n }, (_, i) => r({ chatId: `c${i}` }));
    const sizes: number[] = [];
    const io = {
      find: async (c: string, f: any) => {
        if (c === 'parkedChats') return rows;
        if (c === 'userData') {
          sizes.push(f.chatId.$in.length);
          return f.chatId.$in.includes('c2000') ? [{ _id: oid(REP + 60_000), chatId: 'c2000', profile: 'p', msgCount: 1 }] : [];
        }
        return [];
      },
      first: async () => null,
      pg: async (q: any) => {
        expect(q.params[0]).toHaveLength(n);
        return [{ i: String(n), paid_rs: '75', paid_count: 1 }];
      },
    };
    const L = await loadParked(io as any, { filter: {}, until: UNTIL, now: UNTIL, paidSql: parkedPaidSql, coverage: false });
    expect(sizes).toEqual([1000, 1000, 1]);
    expect(L.facts).toHaveLength(n);
    expect(L.facts[n - 1]).toMatchObject({ chatId: 'c2000', moved: true, paid: { paidRs: 75, paidCount: 1 } });
    expect(L.facts[0]).toMatchObject({ moved: false, paid: { paidRs: 0, paidCount: 0 } });
    expect(L.coverage).toBeNull();
  });
});

describe('foldParked', () => {
  const NOW = REP + 3 * DAY;
  const rows: ParkedRow[] = [
    r({ chatId: 'a', clientId: 'k1', app: 'promote' }), // new, moved after 30 min, landed k2
    r({ chatId: 'b', clientId: 'k1', app: 'promote', preExisting: true, msgCountAtReply: 5, reachedAt: new Date(REP + 90 * 60_000) }), // already, moved 90 min
    r({ chatId: 'c', clientId: 'k1', app: 'promote' }), // not moved, swap within 24 h
    r({ chatId: 'a', clientId: 'k1', app: 'promote', repliedAt: new Date(REP + H) }), // second reply to chat a: its row predates it (not moved); money counted once
    r({ chatId: 'd', clientId: 't1', app: 'tg-aut', repliedAt: new Date(NOW - H) }), // too recent for a cohort
  ];
  const ud = new Map<string, UserDataLite[]>([
    ['a', [{ _id: oid(REP + 30 * 60_000), profile: 'p', msgCount: 2, clientId: 'k2', lastMsgTimeStamp: REP + 2 * H }]],
    ['b', [{ _id: oid(REP - DAY), profile: 'p', msgCount: 6, clientId: 'k1', lastMsgTimeStamp: REP + 2 * H, fakePaymentAt: new Date() }]],
  ]);
  const swaps = swapIndex([{ clientId: 'k1', at: new Date(REP + 2 * H) }, { clientId: 'k1', at: new Date(REP - DAY) }]);
  const paid = [{ paidRs: 150, paidCount: 1 }, undefined, undefined, { paidRs: 100, paidCount: 1 }, { paidRs: 50, paidCount: 1 }];
  const facts = buildFacts(rows, ud, swaps, REP - 2 * DAY, paid, NOW);

  it('totals, per app and per client with distinct paid/fake chats and the earliest reply per chat for money', () => {
    const f = foldParked(facts, null);
    expect(f.totals).toEqual({
      replied: 5,
      moved: 2,
      newReplied: 4,
      newMoved: 1,
      alreadyReplied: 1,
      alreadyMoved: 1,
      paidChats: 2,
      paidRs: 200,
      fakeChats: 1,
      medianMoveMin: 60,
      cohortNoSwap24h: { replied: 0, moved: 0 },
      cohortSwap24h: { replied: 4, moved: 2 },
      landedOtherClient: 1,
    });
    expect(f.byApp.promote.replied).toBe(4);
    expect(f.byApp['tg-aut']).toMatchObject({ replied: 1, moved: 0, paidRs: 50, cohortSwap24h: { replied: 0, moved: 0 }, cohortNoSwap24h: { replied: 0, moved: 0 } });
    expect(f.clients.map((c) => [c.clientId, c.app, c.replied, c.paidRs])).toEqual([
      ['k1', 'promote', 4, 150],
      ['t1', 'tg-aut', 1, 50],
    ]);
  });

  it('client scope filters facts; unknown money (Postgres down) gives null money fields', () => {
    expect(foldParked(facts, 't1').totals.replied).toBe(1);
    const down = buildFacts(rows, ud, swaps, REP - 2 * DAY, null, NOW);
    const f = foldParked(down, null);
    expect(f.totals.paidRs).toBeNull();
    expect(f.totals.paidChats).toBeNull();
    expect(f.totals.moved).toBe(2);
  });
});

describe('MonitorService.parked / parkedChat', () => {
  const NOW = Date.parse('2026-11-14T12:00:00.000Z'); // 17:30 IST
  const data = () => ({
    parkedChats: [
      { clientId: 'k1', app: 'promote', chatId: '111', persona: 'p', status: 'replied', repliedAt: new Date(NOW - 2 * H), preExisting: false, createdAt: new Date(NOW - 3 * DAY), gcAt: new Date(NOW + 11 * DAY), sentHandle: '@main', replyText: 'hi', variant: 't1' },
      { clientId: 'k1', app: 'promote', chatId: '222', persona: 'p', status: 'skipped', createdAt: new Date(NOW - 3 * H), gcAt: new Date(NOW + 14 * DAY - 3 * H) },
      { clientId: 'k2', app: 'tg-aut', chatId: '333', persona: 'q', status: 'replied', repliedAt: new Date(NOW - 3 * H), preExisting: false, createdAt: new Date(NOW - 3 * H), gcAt: new Date(NOW + 14 * DAY - 3 * H) },
    ],
    userData: [{ _id: oid(NOW - H), chatId: '111', profile: 'p', msgCount: 3, clientId: 'k1', lastMsgTimeStamp: NOW - H }],
    accountRoleEvents: [{ clientId: 'k1', event: 'became_main', at: new Date(NOW - 5 * DAY) }, { clientId: 'k1', event: 'became_main', at: new Date(NOW - H) }],
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('serves Mongo facts and money; never calls a write method or a $out/$merge stage', async () => {
    const { connection, writes, pipelines } = fakeConnection(data());
    const pg = fakePg([{ chat_id: '111', persona_id: 'p', ts: NOW - H, amount: 150 }]);
    const svc = new MonitorService(pg as any, connection as any, redis as any);
    const res = await svc.parked({ from: '2026-11-14', to: '2026-11-14' }, null);
    expect(res.totals).toMatchObject({ replied: 2, moved: 1, paidChats: 1, paidRs: 150, medianMoveMin: 60 });
    expect(res.coverage).toEqual({ parkedFrom: new Date(NOW - 3 * DAY).toISOString(), swapHistoryFrom: new Date(NOW - 5 * DAY).toISOString(), withNewFields: 1, rows: 2 });
    expect(res.notes).toEqual(['1 of 2 rows predate the 2026-11-15 fields: landing client falls back to the newest userData row.']);
    expect(pg.calls[0].sql).toMatch(/^\/\* monitor\.parked_paid \*\//);
    const chat = await svc.parkedChat('111');
    expect(chat.rows).toEqual([
      expect.objectContaining({ clientId: 'k1', status: 'replied', moved: true, paidRs: 150, paidCount: 1, sentHandle: '@main', replyText: 'hi', variant: 't1', fake: false }),
    ]);
    for (const w of writes) expect(w).not.toHaveBeenCalled();
    expect(JSON.stringify(pipelines)).not.toMatch(/\$out|\$merge/);
  });

  it('Postgres down: money null and a note; the Mongo part still serves', async () => {
    const { connection } = fakeConnection(data());
    const svc = new MonitorService(fakePg('fail') as any, connection as any, redis as any);
    const res = await svc.parked({ from: '2026-11-14', to: '2026-11-14' }, 'k1');
    expect(res.totals).toMatchObject({ replied: 1, moved: 1, paidChats: null, paidRs: null }); // client k1 only
    expect(res.notes.some((n: string) => /^Money unavailable \(Postgres\)/.test(n))).toBe(true);
    const chat = await svc.parkedChat('111');
    expect(chat.rows[0]).toMatchObject({ moved: true, paidRs: null, paidCount: null });
    expect(chat.notes).toHaveLength(1);
  });

  it('range route: coverage minimums are sort+limit(1) reads, became_main is bounded to (first reply, last reply + 24 h] and the clients', async () => {
    const { connection, finds, pipelines } = fakeConnection(data());
    const svc = new MonitorService(fakePg([]) as any, connection as any, redis as any);
    await svc.parked({ from: '2026-11-14', to: '2026-11-14' }, null);
    expect(pipelines).toEqual([]);
    expect(finds.filter((f) => f.limit === 1).map((f) => [f.coll, f.sort])).toEqual([
      ['parkedChats', { gcAt: 1 }],
      ['accountRoleEvents', { at: 1 }],
    ]);
    const ev = finds.find((f) => f.coll === 'accountRoleEvents' && f.limit === undefined)!;
    expect(ev.filter).toEqual({
      event: 'became_main',
      clientId: { $in: ['k1', 'k2'] },
      at: { $gt: new Date(NOW - 3 * H), $lte: new Date(NOW - 2 * H + DAY) },
    });
  });

  it('one cache entry serves two client filters (one Mongo + one Postgres load)', async () => {
    const { connection, finds } = fakeConnection(data());
    const pg = fakePg([{ chat_id: '111', persona_id: 'p', ts: NOW - H, amount: 150 }]);
    const svc = new MonitorService(pg as any, connection as any, redis as any);
    const a = await svc.parked({ from: '2026-11-14', to: '2026-11-14' }, 'k1');
    const b = await svc.parked({ from: '2026-11-14', to: '2026-11-14' }, 'k2');
    expect(a.totals).toMatchObject({ replied: 1, paidRs: 150 });
    expect(b.totals).toMatchObject({ replied: 1, paidRs: 0 });
    expect(a.clients.map((c) => c.clientId)).toEqual(['k1']);
    expect(b.clients.map((c) => c.clientId)).toEqual(['k2']);
    expect(finds.filter((f) => f.coll === 'parkedChats' && f.limit === undefined)).toHaveLength(1);
    expect(pg.calls).toHaveLength(1);
  });

  it('chat route: no coverage reads, no swap read, cached 30 s per chat', async () => {
    const { connection, finds, pipelines } = fakeConnection(data());
    const pg = fakePg([]);
    const svc = new MonitorService(pg as any, connection as any, redis as any);
    await svc.parkedChat('111');
    await svc.parkedChat('111');
    expect(pipelines).toEqual([]);
    expect(finds.filter((f) => f.limit === 1 || f.coll === 'accountRoleEvents')).toEqual([]);
    expect(finds.filter((f) => f.coll === 'parkedChats')).toHaveLength(1);
    jest.setSystemTime(NOW + 31_000);
    await svc.parkedChat('111');
    expect(finds.filter((f) => f.coll === 'parkedChats')).toHaveLength(2);
    await svc.parkedChat('333');
    expect(finds.filter((f) => f.coll === 'parkedChats')).toHaveLength(3);
  });

  it('chat route: a slow Postgres read times out to money null + note (background lane, short timeout)', async () => {
    const { connection } = fakeConnection(data());
    const pg = { isEnabled: () => true, query: jest.fn(() => new Promise(() => undefined)) };
    const svc = new MonitorService(pg as any, connection as any, redis as any);
    svc.parkedChatPgTimeoutMs = 30;
    const chat = await svc.parkedChat('111');
    expect(chat.rows[0]).toMatchObject({ moved: true, paidRs: null });
    expect(chat.notes[0]).toMatch(/^Money unavailable \(Postgres\)/);
  });

  it('Mongo down: 503', async () => {
    const { connection } = fakeConnection(data(), true);
    const svc = new MonitorService(fakePg([]) as any, connection as any, redis as any);
    await expect(svc.parked({ from: '2026-11-14', to: '2026-11-14' }, null)).rejects.toThrow(/parked unavailable/);
  });

  it('controller: default range = today IST, bad chat id = 400', () => {
    const svc = { parked: jest.fn(), parkedChat: jest.fn() };
    const c = new MonitorController(svc as any);
    c.parked(undefined, undefined, undefined);
    expect(svc.parked).toHaveBeenCalledWith({ from: '2026-11-14', to: '2026-11-14' }, null);
    expect(() => c.parkedChat('abc')).toThrow(BadRequestException);
  });
});
