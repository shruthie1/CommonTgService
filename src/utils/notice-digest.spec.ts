import {
  buildDigestNotice,
  DIGEST_ALIVE_KEY,
  DIGEST_LIST_CAP,
  DIGEST_MAX_AGE_MS,
  DIGEST_QUIET_MS,
  NoticeDigestFlusher,
  pushDigestEntries,
} from './notice-digest';
import type { DigestRedis } from './notice-digest';

/** In-memory Redis with just the commands the digest uses (RENAME of a missing key throws, like Redis). */
class FakeRedis implements DigestRedis {
  kv = new Map<string, string>();
  lists = new Map<string, string[]>();
  ttls = new Map<string, number>();
  failMulti = false;

  async set(key: string, value: string, ...args: any[]) {
    if (args.includes('NX') && (this.kv.has(key) || this.lists.has(key))) return null;
    this.kv.set(key, value);
    const ex = args.indexOf('EX');
    if (ex >= 0) this.ttls.set(key, args[ex + 1]);
    return 'OK';
  }
  async scan(_cursor: string, ...args: any[]): Promise<[string, string[]]> {
    const pattern = String(args[args.indexOf('MATCH') + 1]);
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return ['0', [...this.kv.keys(), ...this.lists.keys()].filter((k) => re.test(k))];
  }
  async rename(from: string, to: string) {
    const list = this.lists.get(from);
    if (!list) throw new Error('ERR no such key');
    this.lists.delete(from);
    this.lists.set(to, list);
    return 'OK';
  }
  async lrange(key: string, start: number, stop: number) {
    const l = this.lists.get(key) ?? [];
    return l.slice(start, stop === -1 ? undefined : stop + 1);
  }
  async lindex(key: string, index: number) {
    const l = this.lists.get(key) ?? [];
    return (index < 0 ? l[l.length + index] : l[index]) ?? null;
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) {
      if (this.kv.delete(k)) n++;
      if (this.lists.delete(k)) n++;
    }
    return n;
  }
  multi() {
    const ops: Array<() => void> = [];
    const tx: any = {
      rpush: (key: string, ...v: string[]) => { ops.push(() => this.lists.set(key, [...(this.lists.get(key) ?? []), ...v])); return tx; },
      ltrim: (key: string, s: number) => { ops.push(() => { const l = this.lists.get(key) ?? []; this.lists.set(key, s < 0 ? l.slice(s) : l.slice(s)); }); return tx; },
      expire: (key: string, sec: number) => { ops.push(() => this.ttls.set(key, sec)); return tx; },
      exec: async () => {
        if (this.failMulti) return [[new Error('boom'), null]] as any;
        ops.forEach((op) => op());
        return ops.map(() => [null, 1]) as any;
      },
    };
    return tx;
  }
  push(key: string, entry: object) {
    this.lists.set(key, [...(this.lists.get(key) ?? []), JSON.stringify(entry)]);
  }
}

const LIST = 'notice-digest::CLIENT_UPDATES::tg-aut-user-stats';
const T0 = 1_800_000_000_000;
const entry = (clientId: string, row: Record<string, string | number>, at = T0, extra: object = {}) => ({ clientId, at, title: 'User stats', row, ...extra });

function makeFlusher(redis: FakeRedis, send = jest.fn().mockResolvedValue(true), known = (c: string) => c === 'CLIENT_UPDATES') {
  const log = { warn: jest.fn(), error: jest.fn() };
  return { flusher: new NoticeDigestFlusher(() => redis, send, known, log), send, log };
}

describe('NoticeDigestFlusher', () => {
  it('N entries become ONE message with N rows, after the quiet period', async () => {
    const redis = new FakeRedis();
    for (const c of ['b1', 'a1', 'c1']) redis.push(LIST, entry(c, { Users: 10, Conversion: '5%' }));
    const { flusher, send } = makeFlusher(redis);

    expect(await flusher.runOnce(T0 + 60_000)).toBe(0); // still arriving: not due
    expect(send).not.toHaveBeenCalled();
    expect(await flusher.runOnce(T0 + DIGEST_QUIET_MS + 1)).toBe(1);

    expect(send).toHaveBeenCalledTimes(1);
    const [category, input] = send.mock.calls[0];
    expect(category).toBe('CLIENT_UPDATES');
    expect(input.title).toBe('User stats');
    expect(input.tables[0].columns).toEqual(['Client (3)', 'Users', 'Conversion']);
    expect(input.summary).toBeUndefined(); // the count lives in the header, not a "3 clients" line
    expect(input.tables[0].rows).toEqual([['a1', 10, '5%'], ['b1', 10, '5%'], ['c1', 10, '5%']]);
    expect(input.tables[0].numeric).toEqual([1]);
    expect(input.footer).toBeUndefined(); // no entry count / ISO time window under the table
    expect(redis.lists.has(LIST)).toBe(false);
    expect(redis.kv.get(DIGEST_ALIVE_KEY)).toBeDefined();
    expect(redis.ttls.get(DIGEST_ALIVE_KEY)).toBe(900);
  });

  it('flushes a list whose oldest entry reached the max age even if entries keep arriving', async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { N: 1 }, T0));
    redis.push(LIST, entry('b1', { N: 2 }, T0 + DIGEST_MAX_AGE_MS - 1000));
    const { flusher, send } = makeFlusher(redis);
    expect(await flusher.runOnce(T0 + DIGEST_MAX_AGE_MS)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('two flushers racing on one list send exactly once', async () => {
    const redis = new FakeRedis();
    for (const c of ['a1', 'b1']) redis.push(LIST, entry(c, { N: 1 }));
    const send = jest.fn().mockResolvedValue(true);
    const one = makeFlusher(redis, send).flusher;
    const two = makeFlusher(redis, send).flusher;
    const now = T0 + DIGEST_QUIET_MS + 1;
    const [a, b] = await Promise.all([one.runOnce(now), two.runOnce(now)]);
    expect(a + b).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('entries arriving mid-flush land in a fresh list and are not lost', async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { N: 1 }));
    const send = jest.fn(async () => {
      redis.push(LIST, entry('late1', { N: 9 }, T0 + DIGEST_QUIET_MS + 5)); // arrives while sending
      return true;
    });
    const { flusher } = makeFlusher(redis, send as any);
    await flusher.runOnce(T0 + DIGEST_QUIET_MS + 1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(redis.lists.get(LIST)!.map((l) => JSON.parse(l).clientId)).toEqual(['late1']);
    await flusher.runOnce(T0 + 2 * DIGEST_QUIET_MS + 10);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('unknown category: put back once, dropped (and logged) on the second failure', async () => {
    const redis = new FakeRedis();
    const key = 'notice-digest::NOPE::k';
    redis.push(key, entry('a1', { N: 1 }));
    const { flusher, send, log } = makeFlusher(redis);
    await flusher.runOnce(T0 + DIGEST_QUIET_MS + 1);
    expect(send).not.toHaveBeenCalled();
    expect(JSON.parse(redis.lists.get(key)![0]).retry).toBe(1);
    await flusher.runOnce(T0 + 2 * DIGEST_QUIET_MS + 2);
    expect(redis.lists.has(key)).toBe(false);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('dropped 1 entries'));
  });

  it('a failing send is retried once on the next run, then dropped', async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { N: 1 }));
    const { flusher, send } = makeFlusher(redis, jest.fn().mockResolvedValue(false));
    await flusher.runOnce(T0 + DIGEST_QUIET_MS + 1);
    expect(redis.lists.get(LIST)).toHaveLength(1);
    await flusher.runOnce(T0 + 2 * DIGEST_QUIET_MS + 2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(redis.lists.has(LIST)).toBe(false);
  });

  it('finishes an orphaned drain (crash after RENAME) once its lock window has passed', async () => {
    const redis = new FakeRedis();
    redis.push(`${LIST}::flushing::${T0}`, entry('a1', { N: 1 }));
    const { flusher, send } = makeFlusher(redis);
    expect(await flusher.runOnce(T0 + 10_000)).toBe(0); // owner may still be working
    expect(await flusher.runOnce(T0 + 200_000)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(redis.lists.size).toBe(0);
  });

  it('never throws: a corrupt entry is skipped, a Redis failure is logged', async () => {
    const redis = new FakeRedis();
    redis.lists.set(LIST, ['not json', JSON.stringify(entry('a1', { N: 1 }))]);
    const { flusher, send } = makeFlusher(redis);
    expect(await flusher.runOnce(T0 + DIGEST_QUIET_MS + 1)).toBe(1);
    expect(send.mock.calls[0][1].tables[0].rows).toEqual([['a1', 1]]);

    const broken = new NoticeDigestFlusher(() => { throw new Error('redis down'); }, send, () => true, { warn: jest.fn(), error: jest.fn() });
    await expect(broken.runOnce()).resolves.toBe(0);
  });
});

describe('one row per client, per-list quiet window, send-before-delete', () => {
  it("merge 'sum' adds a client's counters into ONE row; strings keep the newest value", async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { Joined: 1, Failed: 0, 'Last error': '' }, T0, { merge: 'sum' }));
    redis.push(LIST, entry('a1', { Joined: 0, Failed: 1, 'Last error': '@x: CHANNELS_TOO_MUCH' }, T0 + 1, { merge: 'sum' }));
    redis.push(LIST, entry('b1', { Joined: 1, Failed: 0, 'Last error': '' }, T0 + 2, { merge: 'sum' }));
    const { flusher, send } = makeFlusher(redis);
    expect(await flusher.runOnce(T0 + DIGEST_QUIET_MS + 10)).toBe(1);
    const input = send.mock.calls[0][1];
    expect(input.tables[0].rows).toEqual([['a1', 1, 1, '@x: CHANNELS_TOO_MUCH'], ['b1', 1, 0, '']]);
  });

  it('orders rows by sortBy descending, else by the first numeric column', async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { Messages: 900, Users: 50 }, T0, { sortBy: 'Users' }));
    redis.push(LIST, entry('b1', { Messages: 100, Users: 200 }, T0 + 1, { sortBy: 'Users' }));
    redis.push(LIST, entry('c1', { Messages: 500, Users: 120 }, T0 + 2, { sortBy: 'Users' }));
    const { flusher, send } = makeFlusher(redis);
    await flusher.runOnce(T0 + DIGEST_QUIET_MS + 10);
    expect(send.mock.calls[0][1].tables[0].rows.map((r: unknown[]) => r[0])).toEqual(['b1', 'c1', 'a1']);

    const n = buildDigestNotice([entry('a1', { Status: 'ok', Left: 1 }), entry('b1', { Status: 'ok', Left: 7 })]);
    expect(n.tables![0].rows.map((r) => r[0])).toEqual(['b1', 'a1']);
  });

  it("default 'last': a client's newer snapshot replaces the older one (never summed)", async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { Users: 10 }, T0));
    redis.push(LIST, entry('a1', { Users: 12 }, T0 + 1));
    const { flusher, send } = makeFlusher(redis);
    await flusher.runOnce(T0 + DIGEST_QUIET_MS + 10);
    expect(send.mock.calls[0][1].tables[0].rows).toEqual([['a1', 12]]);
  });

  it('a list with quietMs waits that long (capped at the max age) before posting', async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { Left: 3 }, T0, { quietMs: 30 * 60 * 1000 }));
    const { flusher, send } = makeFlusher(redis);
    expect(await flusher.runOnce(T0 + DIGEST_QUIET_MS + 10)).toBe(0);
    expect(await flusher.runOnce(T0 + 30 * 60 * 1000)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('the drained batch is deleted only after the send: a crash mid-send leaves it for the orphan path', async () => {
    const redis = new FakeRedis();
    redis.push(LIST, entry('a1', { N: 1 }));
    const send = jest.fn().mockImplementation(async () => { throw new Error('process died'); });
    const { flusher } = makeFlusher(redis, send);
    let seenDuringSend = false;
    send.mockImplementation(async () => {
      seenDuringSend = [...redis.lists.keys()].some((k) => k.includes('::flushing::'));
      return true;
    });
    await flusher.runOnce(T0 + DIGEST_QUIET_MS + 10);
    expect(seenDuringSend).toBe(true);
    expect(redis.lists.size).toBe(0);
  });
});

describe('buildDigestNotice / pushDigestEntries', () => {
  it('caps the table at 20 columns and keeps first-seen order', () => {
    const row = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i}`, i]));
    const n = buildDigestNotice([entry('a1', row)]);
    expect(n.tables![0].columns).toHaveLength(20);
    expect(n.tables![0].columns.slice(0, 3)).toEqual(['Client (1)', 'c0', 'c1']);
  });

  it('pushDigestEntries queues in one MULTI with cap and TTL, and reports failure instead of throwing', async () => {
    const redis = new FakeRedis();
    expect(await pushDigestEntries(redis, 'CLIENT_UPDATES', 'join-results', [
      { clientId: 'a1', title: 'Channel join results', row: { Channel: '@x', Result: 'joined' } },
      { clientId: 'b1', title: 'Channel join results', row: { Channel: '@x', Result: 'failed' } },
    ])).toBe(true);
    expect(redis.lists.get('notice-digest::CLIENT_UPDATES::join-results')).toHaveLength(2);
    expect(redis.ttls.get('notice-digest::CLIENT_UPDATES::join-results')).toBe(86400);
    redis.failMulti = true;
    expect(await pushDigestEntries(redis, 'CLIENT_UPDATES', 'join-results', [{ clientId: 'a', title: 't', row: {} }])).toBe(false);
    expect(await pushDigestEntries(redis, 'bad key', 'k', [{ clientId: 'a', title: 't', row: {} }])).toBe(false);
    expect(DIGEST_LIST_CAP).toBe(2000);
  });
});
