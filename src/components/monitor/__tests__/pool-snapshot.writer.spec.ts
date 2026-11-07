import { Logger } from '@nestjs/common';
import { MonitorService, Pool, PoolCounts } from '../monitor.service';
import { bufferPoolPipeline, promotePoolPipeline, WARMING_PHASES } from '../monitor-mongo';
import { POOL_SNAPSHOT_FLAG, POOL_SNAPSHOT_SQL, PoolSnapshotWriter, poolSnapshotEnabled, poolSnapshotRows } from '../pool-snapshot.writer';

const counts = (c: Partial<PoolCounts>): PoolCounts => ({
  total: 0, eligible: 0, harsh: 0, warming: 0, promoteActive: 0, promoteTotal: 0, promoteHarsh: 0, promoteWarming: 0, ...c,
});

/** Mongo $group output as poolByClient receives it (two clients + unassigned in both collections). */
const BUF = [
  { _id: 'alpha1', total: 10, eligible: 2, harsh: 3, warming: 4 },
  { _id: 'beta1', total: 4, eligible: 1, harsh: 0, warming: 1 },
  { _id: null, total: 7, eligible: 0, harsh: 1, warming: 5 },
];
const PROM = [
  { _id: 'alpha1', active: 12, total: 13, harsh: 1, warming: 0 },
  { _id: null, active: 0, total: 9, harsh: 2, warming: 9 },
];

function monitorFromMongo(buf: any[] = BUF, prom: any[] = PROM) {
  const connection = {
    collection: (coll: string) => ({
      aggregate: () => ({ toArray: async () => (coll === 'bufferClients' ? buf : coll === 'promoteClients' ? prom : []) }),
      find: () => ({ toArray: async () => [] }),
    }),
  };
  const pg = { isEnabled: () => true, query: jest.fn(async () => []) };
  return new MonitorService(pg as any, connection as any, { smembers: jest.fn(), mget: jest.fn() } as any);
}

function pgMock(result: (sql: string, params: unknown[]) => { rows?: any[]; error?: any }) {
  return {
    isEnabled: jest.fn(() => true),
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      const r = result(sql, params);
      if (r.error) {
        onError?.(r.error);
        return undefined;
      }
      return r.rows;
    }),
  };
}

describe('pool_snapshot writer', () => {
  const env = process.env[POOL_SNAPSHOT_FLAG];
  let warn: jest.SpyInstance;
  beforeEach(() => {
    delete process.env[POOL_SNAPSHOT_FLAG];
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    if (env === undefined) delete process.env[POOL_SNAPSHOT_FLAG];
    else process.env[POOL_SNAPSHOT_FLAG] = env;
  });

  it('builds one b and one p row per client plus unassigned (client_id \'\') from the monitor poolByClient counts', async () => {
    const pool = await monitorFromMongo().poolSnapshot();
    expect(poolSnapshotRows(pool)).toEqual([
      { pool: 'b', client_id: '', total: 7, eligible: 0, harsh: 1, active: 0, warming: 5 },
      { pool: 'b', client_id: 'alpha1', total: 10, eligible: 2, harsh: 3, active: 0, warming: 4 },
      { pool: 'b', client_id: 'beta1', total: 4, eligible: 1, harsh: 0, active: 0, warming: 1 },
      { pool: 'p', client_id: '', total: 9, eligible: 0, harsh: 2, active: 0, warming: 9 },
      { pool: 'p', client_id: 'alpha1', total: 13, eligible: 0, harsh: 1, active: 12, warming: 0 },
      // beta1 has buffers but no promote accounts: a true all-zero row
      { pool: 'p', client_id: 'beta1', total: 0, eligible: 0, harsh: 0, active: 0, warming: 0 },
    ]);
  });

  it('pool pipelines count warming (enrolled..maturing, missing phase = enrolled) and promote total/harsh', () => {
    expect(WARMING_PHASES).toEqual(['enrolled', 'settling', 'identity', 'growing', 'maturing']);
    const buf = (bufferPoolPipeline(Date.parse('2026-11-07T00:00:00Z'), '2026-11-07')[0] as any).$group;
    const prom = (promotePoolPipeline()[0] as any).$group;
    const warming = { $sum: { $cond: [{ $in: [{ $ifNull: ['$warmupPhase', ''] }, ['', ...WARMING_PHASES]] }, 1, 0] } };
    expect(buf.warming).toEqual(warming);
    expect(prom).toEqual({
      _id: '$clientId',
      active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
      total: { $sum: 1 },
      harsh: { $sum: { $cond: [{ $eq: ['$spamStatus', 'harsh'] }, 1, 0] } },
      warming,
    });
  });

  it('writes all rows in ONE idempotent INSERT (ts_hour = date_trunc hour, ON CONFLICT DO NOTHING)', async () => {
    const pg = pgMock((_sql, params) => ({ rows: (params[0] as string[]).map(() => ({ inserted: 1 })) }));
    const writer = new PoolSnapshotWriter(monitorFromMongo(), pg as any);
    await expect(writer.run()).resolves.toEqual({ status: 'written', rows: 6, inserted: 6 });
    expect(pg.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pg.query.mock.calls[0];
    expect(sql).toBe(POOL_SNAPSHOT_SQL);
    expect(sql).toMatch(/INSERT INTO pool_snapshot \(ts_hour, pool, client_id, total, eligible, harsh, active, warming\)/);
    expect(sql).toContain("date_trunc('hour', now())");
    expect(sql).toContain('ON CONFLICT (ts_hour, pool, client_id) DO NOTHING');
    expect(params).toEqual([
      ['b', 'b', 'b', 'p', 'p', 'p'],
      ['', 'alpha1', 'beta1', '', 'alpha1', 'beta1'],
      [7, 10, 4, 9, 13, 0],
      [0, 2, 1, 0, 0, 0],
      [1, 3, 0, 2, 1, 0],
      [0, 0, 0, 0, 12, 0],
      [5, 4, 1, 9, 0, 0],
    ]);
  });

  it('a second call in the same hour inserts nothing (conflict) and is still a success', async () => {
    const pg = pgMock(() => ({ rows: [] }));
    const writer = new PoolSnapshotWriter(monitorFromMongo(), pg as any);
    await expect(writer.run()).resolves.toEqual({ status: 'written', rows: 6, inserted: 0 });
  });

  it('a Postgres error is swallowed and logged once; nothing is retried', async () => {
    const pg = pgMock(() => ({ error: { kind: 'query', code: '57014', message: 'canceling statement due to statement timeout' } }));
    const writer = new PoolSnapshotWriter(monitorFromMongo(), pg as any);
    await expect(writer.run()).resolves.toEqual({ status: 'failed', reason: 'query 57014: canceling statement due to statement timeout' });
    expect(pg.query).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('this hour is a gap');
  });

  it('a missing pool_snapshot table (42P01) is skipped with a log', async () => {
    const pg = pgMock(() => ({ error: { kind: 'query', code: '42P01', message: 'relation "pool_snapshot" does not exist' } }));
    const writer = new PoolSnapshotWriter(monitorFromMongo(), pg as any);
    await expect(writer.run()).resolves.toEqual({ status: 'skipped', reason: 'pool_snapshot missing' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('does not exist');
  });

  it('a failing pool computation never throws and writes nothing', async () => {
    const monitor = { poolSnapshot: jest.fn().mockRejectedValue(new Error('mongo down')) };
    const pg = pgMock(() => ({ rows: [] }));
    const writer = new PoolSnapshotWriter(monitor as any, pg as any);
    await expect(writer.run()).resolves.toEqual({ status: 'failed', reason: 'pool counts unavailable: mongo down' });
    expect(pg.query).not.toHaveBeenCalled();
  });

  it('flag POOL_SNAPSHOT_ENABLED: default on, off values skip without touching Mongo or Postgres', async () => {
    expect(poolSnapshotEnabled({})).toBe(true);
    expect(poolSnapshotEnabled({ [POOL_SNAPSHOT_FLAG]: 'true' })).toBe(true);
    for (const off of ['0', 'false', 'no', 'OFF']) expect(poolSnapshotEnabled({ [POOL_SNAPSHOT_FLAG]: off })).toBe(false);
    process.env[POOL_SNAPSHOT_FLAG] = 'false';
    const monitor = { poolSnapshot: jest.fn() };
    const pg = pgMock(() => ({ rows: [] }));
    await expect(new PoolSnapshotWriter(monitor as any, pg as any).run()).resolves.toEqual({ status: 'skipped', reason: 'POOL_SNAPSHOT_ENABLED is off' });
    expect(monitor.poolSnapshot).not.toHaveBeenCalled();
    expect(pg.query).not.toHaveBeenCalled();
  });

  it('ANALYTICS_DB_URL unset: skipped, no pool computation', async () => {
    const monitor = { poolSnapshot: jest.fn() };
    const pg = { isEnabled: () => false, query: jest.fn() };
    await expect(new PoolSnapshotWriter(monitor as any, pg as any).run()).resolves.toEqual({ status: 'skipped', reason: 'ANALYTICS_DB_URL not set' });
    expect(monitor.poolSnapshot).not.toHaveBeenCalled();
  });

  it('an empty pool map writes nothing', async () => {
    const pg = pgMock(() => ({ rows: [] }));
    const monitor = { poolSnapshot: jest.fn().mockResolvedValue(new Map() as Pool) };
    await expect(new PoolSnapshotWriter(monitor as any, pg as any).run()).resolves.toEqual({ status: 'skipped', reason: 'no rows' });
    expect(pg.query).not.toHaveBeenCalled();
    expect(poolSnapshotRows(new Map([['x', counts({ total: 1 })]]))).toHaveLength(2);
  });
});
