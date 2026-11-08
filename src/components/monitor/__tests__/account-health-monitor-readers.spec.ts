// Account split reader switch, S2 accountHealth (tg-platform docs/design/2026-11-07-account-collection-split.md,
// "Reader switch (implementation)"): R11 monitor pool counts (harsh / eligible per client, buffer + promote) and R12
// /monitor/promotions spam state (Redis tg::acct). Flag ACCOUNT_HEALTH_READ off | shadow | on (+ _READERS).
// Plain fakes, no Mongo, no Redis.
import { MonitorService } from '../monitor.service';
import { accountFacetReadStats, flushAccountFacetShadowReads, resetAccountFacetReadStats } from '../../shared/account-facet-read';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TODAY = '2026-11-08';

type Docs = Record<string, Record<string, unknown>>;

function makeService(o: {
  bufGroup?: any[];
  bufRows?: any[];
  promGroup?: any[];
  promRows?: any[];
  health?: Docs;
  healthError?: boolean;
  redisResults?: unknown[];
}) {
  const aggregates: Array<{ coll: string; pipeline: any[] }> = [];
  const healthFind = jest.fn((filter: any) => ({
    toArray: async () => {
      if (o.healthError) throw new Error('boom');
      return (filter?._id?.$in ?? []).filter((id: string) => o.health?.[id]).map((id: string) => ({ _id: id, ...o.health![id] }));
    },
  }));
  const collection = jest.fn((coll: string) => {
    if (coll === 'accountHealth') return { find: healthFind };
    return {
      aggregate: (pipeline: any[]) => {
        aggregates.push({ coll, pipeline });
        const grouped = pipeline.some((s) => s.$group);
        const rows = coll === 'bufferClients' ? (grouped ? o.bufGroup : o.bufRows) : grouped ? o.promGroup : o.promRows;
        return { toArray: async () => rows ?? [] };
      },
      find: () => ({ toArray: async () => [] }),
    };
  });
  const redis = {
    smembers: jest.fn(async () => []),
    mget: jest.fn(async (k: string[]) => k.map(() => null)),
    readPipeline: jest.fn(async () => o.redisResults ?? []),
  };
  const svc: any = new MonitorService({ isEnabled: () => false, query: jest.fn() } as any, { collection } as any, redis as any);
  svc.prewarmDelayMs = -1;
  return { svc, collection, healthFind, aggregates };
}

const saved = { read: process.env.ACCOUNT_HEALTH_READ, readers: process.env.ACCOUNT_HEALTH_READ_READERS };
beforeEach(() => {
  delete process.env.ACCOUNT_HEALTH_READ;
  delete process.env.ACCOUNT_HEALTH_READ_READERS;
  resetAccountFacetReadStats();
});
afterAll(() => {
  for (const [k, v] of [['ACCOUNT_HEALTH_READ', saved.read], ['ACCOUNT_HEALTH_READ_READERS', saved.readers]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

// ---------------------------------------------------------------- R11

describe('R11 monitor pool counts (harsh / eligible)', () => {
  const now = Date.now();
  const A = '919000000111'; // buffer c1, free 2 d ago, eligible
  const B = '919000000112'; // buffer c1, harsh 1 h ago
  const C = '919000000113'; // buffer c1, never checked, eligible, no facet doc
  const P = '919000000114'; // promote c1, free 2 d ago
  const at = (ms: number) => new Date(ms);
  // the $group output today's pipeline gives for these rows
  const bufGroup = [{ _id: 'c1', total: 3, harsh: 1, warming: 0, eligible: 2, active: 2 }];
  const promGroup = [{ _id: 'c1', active: 1, total: 1, harsh: 0, warming: 0 }];
  // the per-row pipeline: Mongo-computed old flags (h harsh, sg spam gates, g other gates, w warming, a active)
  const bufRows = [
    { c: 'c1', m: A, s: 'free', lu: null, at: at(now - 2 * DAY), h: false, sg: true, g: true, a: true, w: false },
    { c: 'c1', m: B, s: 'harsh', lu: null, at: at(now - HOUR), h: true, sg: false, g: true, a: true, w: false },
    { c: 'c1', m: C, h: false, sg: true, g: true, a: false, w: false },
  ];
  const promRows = [{ c: 'c1', m: P, s: 'free', lu: null, at: at(now - 2 * DAY), h: false, a: true, w: false }];
  const newerHarsh = (): Docs => ({
    [A]: { spamStatus: 'harsh', verdictAt: at(now - HOUR), spamCheckedAt: at(now - HOUR) },
    [P]: { spamStatus: 'harsh', verdictAt: at(now - HOUR), spamCheckedAt: at(now - HOUR) },
  });
  const run = (svc: any) => svc.poolByClient(now, TODAY, {});
  const counts = (pool: Map<string, any>) => pool.get('c1');
  const OLD = { total: 3, eligible: 2, harsh: 1, warming: 0, active: 2, promoteActive: 1, promoteTotal: 1, promoteHarsh: 0, promoteWarming: 0 };

  it('off (default): old $group counts, accountHealth never touched, no per-row read', async () => {
    const { svc, collection, healthFind, aggregates } = makeService({ bufGroup, promGroup, bufRows, promRows, health: newerHarsh() });
    expect(counts(await run(svc))).toEqual(OLD);
    expect(healthFind).not.toHaveBeenCalled();
    expect(collection.mock.calls.map((c) => c[0])).not.toContain('accountHealth');
    expect(aggregates.every((a) => a.pipeline.some((s) => s.$group))).toBe(true);
  });

  it('off via _READERS without R11', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    process.env.ACCOUNT_HEALTH_READ_READERS = 'R7,R12';
    const { svc, healthFind } = makeService({ bufGroup, promGroup, bufRows, promRows, health: newerHarsh() });
    expect(counts(await run(svc))).toEqual(OLD);
    expect(healthFind).not.toHaveBeenCalled();
  });

  it('shadow: old counts returned; background compare counts the newer facet verdicts', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    const { svc, healthFind } = makeService({ bufGroup, promGroup, bufRows, promRows, health: newerHarsh() });
    expect(counts(await run(svc))).toEqual(OLD);
    await svc.poolHealthShadow;
    await flushAccountFacetShadowReads();
    expect(healthFind).toHaveBeenCalledTimes(1);
    expect(healthFind.mock.calls[0][0]._id.$in.sort()).toEqual([A, B, C, P].sort());
    const s = accountFacetReadStats().health.R11;
    expect(s.newerInHealth).toBe(2);
    expect(s.missingInHealth).toBe(2);
  });

  it('on: a newer facet verdict wins (A and P harsh); one batched accountHealth read', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { svc, healthFind } = makeService({ bufGroup, promGroup, bufRows, promRows, health: newerHarsh() });
    expect(counts(await run(svc))).toEqual({ ...OLD, harsh: 2, eligible: 1, promoteHarsh: 1 });
    expect(healthFind).toHaveBeenCalledTimes(1);
  });

  it('on: no facet docs gives exactly the old counts (row flags computed by Mongo)', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { svc } = makeService({ bufGroup, promGroup, bufRows, promRows, health: {} });
    expect(counts(await run(svc))).toEqual(OLD);
  });

  it('on: equal verdict time with a different status keeps the pool value', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const health: Docs = { [A]: { spamStatus: 'harsh', verdictAt: at(now - 2 * DAY), spamCheckedAt: at(now - 2 * DAY) } };
    const { svc } = makeService({ bufGroup, promGroup, bufRows, promRows, health });
    expect(counts(await run(svc))).toEqual(OLD);
    expect(accountFacetReadStats().health.R11.mismatch).toBe(1);
  });

  it('on: a newer free verdict lifts a harsh pool row (only for scanned rows; harsh rest by the last verdict)', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const health: Docs = { [B]: { spamStatus: 'free', verdictAt: at(now - 10 * 60_000), spamCheckedAt: at(now - 10 * 60_000) } };
    const { svc } = makeService({ bufGroup, promGroup, bufRows, promRows, health });
    expect(counts(await run(svc))).toEqual({ ...OLD, harsh: 0, eligible: 3 });
  });

  it('on: accountHealth read error falls back to the old counts, never throws', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const { svc } = makeService({ bufGroup, promGroup, bufRows, promRows, health: newerHarsh(), healthError: true });
    expect(counts(await run(svc))).toEqual(OLD);
    expect(accountFacetReadStats().health.R11.readError).toBe(1);
  });
});

// ---------------------------------------------------------------- R12

describe('R12 /monitor/promotions spam state (tg::acct)', () => {
  const M1 = '919000000121';
  const M2 = '919000000122'; // no tg::acct hash (expired)
  const ctx = () => ({ notes: [] as string[], timings: {} as Record<string, number> });
  const redisFree = (checkedAt: number) => ({ spamStatus: 'free', daysLeft: '-1', limitedUntil: 'null', spamCheckedAt: String(checkedAt) });
  const run = (svc: any) => svc.redisAccountState([M1, M2], new Set<string>(), ctx());

  it('off (default): tg::acct values, accountHealth never touched', async () => {
    const checked = Date.now() - 2 * HOUR;
    const { svc, collection, healthFind } = makeService({
      redisResults: [redisFree(checked), null],
      health: { [M1]: { spamStatus: 'limited', verdictAt: new Date(Date.now() - HOUR), limitedUntil: new Date(Date.now() + 2 * DAY) } },
    });
    const out = await run(svc);
    expect(out.spam.get(M1)).toEqual({ status: 'free', daysLeft: -1, limitedUntil: null, checkedAt: new Date(checked).toISOString() });
    expect(out.spam.get(M2)).toBeNull();
    expect(healthFind).not.toHaveBeenCalled();
    expect(collection.mock.calls.map((c) => c[0])).not.toContain('accountHealth');
  });

  it('shadow: tg::acct values returned; compare counted in the background', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'shadow';
    const checked = Date.now() - 2 * HOUR;
    const { svc, healthFind } = makeService({
      redisResults: [redisFree(checked), null],
      health: { [M1]: { spamStatus: 'limited', verdictAt: new Date(Date.now() - HOUR), limitedUntil: new Date(Date.now() + 2 * DAY) } },
    });
    const out = await run(svc);
    expect(out.spam.get(M1)?.status).toBe('free');
    await flushAccountFacetShadowReads();
    expect(healthFind).toHaveBeenCalledTimes(1);
    expect(accountFacetReadStats().health.R12.newerInHealth).toBe(1);
  });

  it('on: a newer facet verdict replaces tg::acct (daysLeft unknown); one batched read', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const verdict = Date.now() - HOUR;
    const until = Date.now() + 2 * DAY;
    const { svc, healthFind } = makeService({
      redisResults: [redisFree(Date.now() - 2 * HOUR), null],
      health: { [M1]: { spamStatus: 'limited', verdictAt: new Date(verdict), spamCheckedAt: new Date(verdict), limitedUntil: new Date(until) } },
    });
    const out = await run(svc);
    expect(out.spam.get(M1)).toEqual({ status: 'limited', daysLeft: null, limitedUntil: new Date(until).toISOString(), checkedAt: new Date(verdict).toISOString() });
    expect(healthFind).toHaveBeenCalledTimes(1);
  });

  it('on: equal verdict time with another status keeps tg::acct', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const checked = Date.now() - 2 * HOUR;
    const { svc } = makeService({
      redisResults: [redisFree(checked), null],
      health: { [M1]: { spamStatus: 'harsh', verdictAt: new Date(checked), spamCheckedAt: new Date(checked) } },
    });
    expect((await run(svc)).spam.get(M1)?.status).toBe('free');
  });

  it('on: missing facet doc keeps tg::acct; read error keeps tg::acct', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const checked = Date.now() - 2 * HOUR;
    const a = makeService({ redisResults: [redisFree(checked), null], health: {} });
    expect((await run(a.svc)).spam.get(M1)?.status).toBe('free');
    const b = makeService({ redisResults: [redisFree(checked), null], health: { [M1]: { spamStatus: 'harsh', verdictAt: new Date() } }, healthError: true });
    const out = await run(b.svc);
    expect(out.spam.get(M1)?.status).toBe('free');
    expect(out.spam.get(M2)).toBeNull();
  });

  it('on: no tg::acct + facet verdict tg::acct would have expired = no state; still-live harsh = harsh', async () => {
    process.env.ACCOUNT_HEALTH_READ = 'on';
    const old = Date.now() - 3 * DAY;
    const free = makeService({ redisResults: [null, null], health: { [M1]: { spamStatus: 'free', verdictAt: new Date(old) } } });
    expect((await run(free.svc)).spam.get(M1)).toBeNull();
    const harsh = makeService({ redisResults: [null, null], health: { [M1]: { spamStatus: 'harsh', verdictAt: new Date(old) } } });
    expect((await run(harsh.svc)).spam.get(M1)?.status).toBe('harsh');
  });
});
