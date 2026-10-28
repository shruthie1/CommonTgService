/**
 * Lightweight monitor (2026-10-28): SWR cache, Postgres gate, and history + today merges that must
 * give the same numbers as one query over the whole range.
 */
import { ConcurrencyGate, SnapshotCache, SnapshotStore, SwrCache } from '../monitor-cache';
import { DmRow, MobileRow, dmsByChannel, mergeMobiles, rankChannels, revenueBy, sumDmsDays, toCredit } from '../monitor-merge';
import { ttfpBuckets } from '../monitor-mongo';
import { addDays, istDate, istDayStart } from '../monitor-time';

const flush = () => new Promise((r) => setImmediate(r));

describe('SwrCache', () => {
  let now = 0;
  const cache = () => new SwrCache<number>({ freshMs: 60_000, maxStaleMs: 15 * 60_000, maxKeys: 3, now: () => now });
  beforeEach(() => (now = 1_000_000));

  it('hit within freshMs; stale after it is served at once while ONE background refresh runs', async () => {
    const c = cache();
    let loads = 0;
    let release!: () => void;
    const load = jest.fn(async (bg: boolean) => {
      loads++;
      if (bg) await new Promise<void>((r) => (release = r));
      return loads;
    });
    expect(await c.get('k', load)).toMatchObject({ value: 1, state: 'miss' });
    now += 59_000;
    expect(await c.get('k', load)).toMatchObject({ value: 1, state: 'hit' });
    now += 2_000;
    const [a, b] = await Promise.all([c.get('k', load), c.get('k', load)]);
    expect([a.state, b.state, a.value, b.value]).toEqual(['stale', 'stale', 1, 1]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1][0]).toBe(true); // background
    release();
    await flush();
    expect(await c.get('k', load)).toMatchObject({ value: 2, state: 'hit' });
  });

  it('a miss waits for the load and shares one in-flight load', async () => {
    const c = cache();
    const load = jest.fn(async () => 7);
    const r = await Promise.all([c.get('k', load), c.get('k', load), c.get('k', load)]);
    expect(r.map((x) => x.value)).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never serves an entry past expiresAt (IST midnight) or older than maxStaleMs', async () => {
    const c = cache();
    const midnight = istDayStart(addDays(istDate(now), 1));
    await c.get('k', async () => 1, midnight);
    now = midnight;
    expect(await c.get('k', async () => 2, midnight + 86_400_000)).toMatchObject({ value: 2, state: 'miss' });
    now += 16 * 60_000;
    expect(await c.get('k', async () => 3)).toMatchObject({ value: 3, state: 'miss' });
  });

  it('a failed background refresh keeps the old value; LRU evicts past maxKeys', async () => {
    const errors: string[] = [];
    const c = new SwrCache<number>({ freshMs: 10, maxKeys: 2, now: () => now, onBackgroundError: (k) => errors.push(k) });
    await c.get('a', async () => 1);
    now += 20;
    expect((await c.get('a', async () => Promise.reject(new Error('x')))).value).toBe(1);
    await flush();
    expect(errors).toEqual(['a']);
    expect((await c.get('a', async () => 9)).state).toBe('stale');
    await c.get('b', async () => 2);
    await c.get('c', async () => 3);
    expect(c.size).toBe(2);
  });
});

describe('SwrCache refresh mode (background snapshot rebuild)', () => {
  let now = 1_000_000;
  beforeEach(() => (now = 1_000_000));

  it('a stale entry is refreshed and awaited (background priority) instead of served; a failed refresh falls back to it', async () => {
    const errors: string[] = [];
    const c = new SwrCache<number>({ freshMs: 60_000, now: () => now, onBackgroundError: (k) => errors.push(k) });
    await c.get('k', async () => 1);
    now += 61_000;
    const load = jest.fn(async (bg: boolean) => (bg ? 2 : -1));
    expect(await c.get('k', load, undefined, { refresh: true })).toMatchObject({ value: 2, state: 'hit' });
    expect(load).toHaveBeenCalledWith(true);
    now += 61_000;
    expect(await c.get('k', async () => Promise.reject(new Error('down')), undefined, { refresh: true })).toMatchObject({ value: 2, state: 'stale' });
    expect(errors).toEqual(['k']);
    // a miss in refresh mode loads at background priority too
    const miss = jest.fn(async (bg: boolean) => (bg ? 5 : -1));
    expect(await c.get('other', miss, undefined, { refresh: true })).toMatchObject({ value: 5, state: 'miss' });
  });
});

describe('SnapshotCache', () => {
  let now = Date.parse('2026-10-28T10:00:00.000Z'); // 15:30 IST
  const day = (t: number) => istDate(t);
  function memStore() {
    const data = new Map<string, string>();
    const sets: Array<{ key: string; mode: string; ttl: number; bytes: number }> = [];
    const store: SnapshotStore & { data: Map<string, string>; sets: typeof sets; gets: number } = {
      data,
      sets,
      gets: 0,
      get: async (k) => {
        store.gets++;
        return data.get(k) ?? null;
      },
      set: async (k, v, mode, ttl) => {
        sets.push({ key: k, mode, ttl, bytes: v.length });
        data.set(k, v);
        return 'OK';
      },
    };
    return store;
  }
  const mk = (store?: SnapshotStore, extra: Record<string, unknown> = {}) =>
    new SnapshotCache<any>({ freshMs: 60_000, day, store, now: () => now, complete: (v) => !v.degraded, ...extra });
  beforeEach(() => (now = Date.parse('2026-10-28T10:00:00.000Z')));

  it('fresh = served without a build; stale = served at once while ONE background rebuild runs', async () => {
    const c = mk();
    let n = 0;
    let release!: () => void;
    const build = jest.fn(async (bg: boolean) => {
      n++;
      if (bg) await new Promise<void>((r) => (release = r));
      return { n };
    });
    expect(await c.get('fleet:today', build)).toMatchObject({ value: { n: 1 }, state: 'miss', source: 'build' });
    now += 59_000;
    expect(await c.get('fleet:today', build)).toMatchObject({ value: { n: 1 }, state: 'hit', source: 'memory' });
    now += 16 * 60_000; // long idle: still served at once
    const [a, b] = await Promise.all([c.get('fleet:today', build), c.get('fleet:today', build)]);
    expect([a.state, b.state, a.value.n, b.value.n]).toEqual(['stale', 'stale', 1, 1]);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[1][0]).toBe(true);
    release();
    await flush();
    expect(await c.get('fleet:today', build)).toMatchObject({ value: { n: 2 }, state: 'hit' });
  });

  it('never serves a snapshot on another IST day, and never joins a build started before midnight', async () => {
    const c = mk();
    now = Date.parse('2026-10-28T18:25:00.000Z'); // 23:55 IST
    await c.get('p', async () => ({ d: day(now) }));
    now = Date.parse('2026-10-28T18:29:30.000Z'); // stale → background rebuild that hangs past midnight
    let release!: () => void;
    await c.get('p', () => new Promise((r) => (release = () => r({ d: '2026-10-28' }))));
    now = Date.parse('2026-10-28T18:30:10.000Z'); // 00:00:10 IST
    const r = await c.get('p', async () => ({ d: day(now) }));
    expect(r).toMatchObject({ state: 'miss', value: { d: '2026-10-29' } });
    release();
    await flush();
    expect((await c.get('p', async () => ({ d: 'x' }))).value).toEqual({ d: '2026-10-29' });
  });

  it('a degraded build is returned to its caller but never cached or persisted', async () => {
    const store = memStore();
    const c = mk(store);
    expect((await c.get('p', async () => ({ degraded: true }))).value).toEqual({ degraded: true });
    expect(store.sets).toEqual([]);
    expect(await c.get('p', async () => ({ ok: 1 }))).toMatchObject({ value: { ok: 1 }, state: 'miss' });
    now += 61_000; // stale; the rebuild is degraded → the good snapshot stays
    await c.get('p', async () => ({ degraded: true }));
    await flush();
    expect((await c.get('p', async () => ({ degraded: true }))).value).toEqual({ ok: 1 });
  });

  it('persists each complete build (SET EX 36 h) and a new process serves it from the store without building', async () => {
    const store = memStore();
    await mk(store).get('fleet:today', async () => ({ revenue: 600 }));
    await flush();
    expect(store.sets).toEqual([{ key: 'monitor::snapshot::fleet:today', mode: 'EX', ttl: 36 * 3600, bytes: expect.any(Number) }]);
    now += 30_000;
    const restarted = mk(store);
    const build = jest.fn(async () => ({ revenue: 999 }));
    expect(await restarted.get('fleet:today', build)).toMatchObject({ value: { revenue: 600 }, state: 'hit', source: 'store' });
    expect(build).not.toHaveBeenCalled();
    now += 60_000; // the restored snapshot goes stale like any other: served, rebuilt once in the background
    expect(await restarted.get('fleet:today', build)).toMatchObject({ value: { revenue: 600 }, state: 'stale', source: 'store' });
    await flush();
    expect(build).toHaveBeenCalledTimes(1);
    expect(await restarted.get('fleet:today', build)).toMatchObject({ value: { revenue: 999 }, state: 'hit', source: 'memory' });
    expect(await restarted.storedDay('fleet:today')).toBe('2026-10-28');
  });

  it('the store is read once per (day, page), shared by concurrent callers; yesterday / broken / slow entries are ignored', async () => {
    const store = memStore();
    store.data.set('monitor::snapshot::a', JSON.stringify({ v: 1, day: '2026-10-27', at: now - 86_400_000, value: { old: 1 } }));
    store.data.set('monitor::snapshot::b', '{not json');
    const c = mk(store);
    const build = jest.fn(async () => ({ fresh: 1 }));
    await Promise.all([c.get('a', build), c.get('a', build)]);
    expect(store.gets).toBe(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect((await c.get('b', build)).value).toEqual({ fresh: 1 });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const hanging = mk({ get: () => new Promise(() => undefined), set: async () => 'OK' });
      const p = hanging.get('c', async () => ({ built: 1 }));
      await jest.advanceTimersByTimeAsync(501);
      expect((await p).value).toEqual({ built: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('snapshots above maxBytes stay in memory only', async () => {
    const store = memStore();
    const errors: string[] = [];
    const c = mk(store, { maxBytes: 100, onError: (w: string) => errors.push(w) });
    await c.get('big', async () => ({ s: 'x'.repeat(200) }));
    await flush();
    expect(store.sets).toEqual([]);
    expect(errors).toEqual(['persist big']);
  });
});

describe('ConcurrencyGate', () => {
  it('runs at most `limit`; queued foreground work goes before queued background work; background uses one slot', async () => {
    const gate = new ConcurrencyGate(2, 1);
    const order: string[] = [];
    const releases: Array<() => void> = [];
    const job = (name: string, bg: boolean) =>
      gate.run(bg, () => {
        order.push(name);
        return new Promise<void>((r) => releases.push(r));
      });
    const all = [job('bg1', true), job('bg2', true), job('fg1', false)];
    await flush();
    expect(order).toEqual(['bg1', 'fg1']); // bg2 waits: one background slot
    all.push(job('fg2', false));
    releases.shift()!(); // bg1 done
    await flush();
    expect(order).toEqual(['bg1', 'fg1', 'fg2']); // foreground first
    expect(gate.pending).toBe(1);
    releases.shift()!();
    await flush();
    expect(order).toEqual(['bg1', 'fg1', 'fg2', 'bg2']);
    releases.splice(0).forEach((r) => r());
    await Promise.all(all);
  });
});

// ---- history + today = the whole range, on a seeded fixture
function rng(seed: number) {
  return () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}
const DAY = 86_400_000;
const TODAY = '2026-10-28';
const T0 = istDayStart(TODAY);
const START = istDayStart(addDays(TODAY, -6)); // a 7-day page incl. today

describe('history + today merges equal one whole-range computation', () => {
  const r = rng(42);
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const dms: DmRow[] = Array.from({ length: 600 }, (_, i) => ({
    client_id: pick(['a1', 'b1', 'c1', null]),
    channel_id: pick(['100', '20', '3', '4000', '55', null]),
    conversion_id: `cv${i}`,
    ts: new Date(START + Math.floor(r() * 7 * DAY - 1)),
  }));
  const isToday = (d: DmRow) => new Date(d.ts).getTime() >= T0;

  it('channel DMs: daily_channel-style per-day cells + today raw rank like one distinct over the range', () => {
    // rollup semantics: count(DISTINCT conversion_id) per (IST day, channel) on closed days
    const cells = new Map<string, Set<string>>();
    for (const d of dms.filter((x) => !isToday(x) && x.channel_id)) {
      const k = `${istDate(new Date(d.ts).getTime())}|${d.channel_id}`;
      if (!cells.has(k)) cells.set(k, new Set());
      cells.get(k)!.add(d.conversion_id);
    }
    const hist = new Map<string, number>();
    for (const [k, v] of cells) hist.set(k.split('|')[1], (hist.get(k.split('|')[1]) ?? 0) + v.size);
    const merged = rankChannels(hist, dmsByChannel(dms.filter(isToday), null), 20);
    const whole = rankChannels(dmsByChannel(dms, null), new Map(), 20);
    expect(merged).toEqual(whole);
    expect(merged.reduce((s, x) => s + x.dms, 0)).toBe(dms.filter((d) => d.channel_id).length);
  });

  it('DMs per client: Σ per-day distinct = distinct over the range', () => {
    const perDay = new Map<string, Set<string>>();
    for (const d of dms) {
      const k = `${istDate(new Date(d.ts).getTime())}|${d.client_id ?? ''}`;
      if (!perDay.has(k)) perDay.set(k, new Set());
      perDay.get(k)!.add(d.conversion_id);
    }
    const rows = [...perDay].map(([k, v]) => ({ d: k.split('|')[0], client_id: k.split('|')[1] || null, dms: v.size }));
    const s = sumDmsDays(rows, istDate(START), TODAY);
    expect(s.total).toBe(new Set(dms.map((d) => d.conversion_id)).size);
    expect(s.byClient.get('a1')).toBe(new Set(dms.filter((d) => d.client_id === 'a1').map((d) => d.conversion_id)).size);
  });

  it('revenue: closed-day credits + today credits = one range; payers distinct across the split', () => {
    const pays = Array.from({ length: 300 }, () => ({
      client_id: pick(['a1', 'b1', null]),
      ts: new Date(START + Math.floor(r() * 7 * DAY - 1)),
      chat_id: pick(['x1', 'x2', 'x3', 'x4', 'x5', 'x6']),
      amount: pick([50, 99, 150, 999, 1000, 1500]),
      owner_amount: pick([0, 50, 99]),
      cheat_flagged: r() < 0.1,
    }));
    const credits = pays.map(toCredit);
    const hist = credits.filter((c) => c.ms < T0);
    const today = credits.filter((c) => c.ms >= T0);
    const merged = revenueBy([...hist, ...today], START, T0 + DAY);
    // reference: the former SQL semantics
    const ref = (cl: string | null) => {
      const xs = pays.filter((p) => cl === null || p.client_id === cl);
      return {
        revenue: xs.reduce((s, p) => s + (p.amount < 1000 ? p.owner_amount : 0), 0),
        gross: xs.reduce((s, p) => s + p.amount, 0),
        payers: new Set(xs.filter((p) => p.amount < 1000 && !p.cheat_flagged).map((p) => p.chat_id)).size,
      };
    };
    expect(merged.total).toEqual(ref(null));
    expect(merged.byClient.get('a1')).toEqual(ref('a1'));
  });

  it('mobiles: closed-day group + today group = one group over the range (owner = client on the latest day)', () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(istDate(START), i));
    const daily = Array.from({ length: 120 }, () => ({
      day: pick(days),
      mobile: pick(['9100', '9200', '9300', '9400']),
      client_id: pick(['a1', 'b1']),
      new_users: Math.floor(r() * 5),
      sent: Math.floor(r() * 20),
    }));
    const group = (rows: typeof daily): MobileRow[] => {
      const m = new Map<string, MobileRow>();
      for (const d of rows) {
        const k = `${d.mobile}|${d.client_id}`;
        const e = m.get(k) ?? { mobile: d.mobile, client_id: d.client_id, new_users: 0, dms: 0, sent: 0, delivered: 0, banned: 0, first_day: d.day, last_day: d.day };
        e.new_users = Number(e.new_users) + d.new_users;
        e.sent = Number(e.sent) + d.sent;
        if (d.day < e.first_day) e.first_day = d.day;
        if (d.day > e.last_day) e.last_day = d.day;
        m.set(k, e);
      }
      return [...m.values()];
    };
    const merged = mergeMobiles([...group(daily.filter((d) => d.day < TODAY)), ...group(daily.filter((d) => d.day === TODAY))], null);
    const whole = mergeMobiles(group(daily), null);
    expect(merged).toEqual(whole);
    // reference owner: the client of the latest day row (ties: larger client id)
    for (const m of whole) {
      const rows = daily.filter((d) => d.mobile === m.mobile).sort((a, b) => (a.day + a.client_id < b.day + b.client_id ? 1 : -1));
      expect(m.client_id).toBe(rows[0].client_id);
      expect(m.sent).toBe(rows.reduce((s, d) => s + d.sent, 0));
    }
  });

  it('time-to-first-pay: bucketing first-pay rows in memory = the $bucket pipeline', () => {
    const rows = [
      { c: 'a1', fp: T0 - DAY, mins: -5 }, // doc recreated after payment
      { c: 'a1', fp: T0 - DAY, mins: 0 },
      { c: 'a1', fp: T0 - DAY, mins: 9.99 },
      { c: 'a1', fp: T0 - DAY, mins: 10 },
      { c: 'b1', fp: T0 - DAY, mins: 4320 },
      { c: 'a1', fp: START - 1, mins: 1 }, // before the page
      { c: 'a1', fp: T0 + 1, mins: 130 }, // today
    ];
    const sort = (x: Array<{ _id: number | string; n: number }>) => [...x].sort((a, b) => String(a._id).localeCompare(String(b._id)));
    expect(sort(ttfpBuckets(rows, null, START, T0))).toEqual(sort([{ _id: -1e15, n: 1 }, { _id: 0, n: 2 }, { _id: 10, n: 1 }, { _id: 4320, n: 1 }]));
    expect(ttfpBuckets(rows, 'b1', START, T0)).toEqual([{ _id: 4320, n: 1 }]);
    expect(ttfpBuckets(rows, 'a1', T0, Infinity)).toEqual([{ _id: 120, n: 1 }]);
  });
});
