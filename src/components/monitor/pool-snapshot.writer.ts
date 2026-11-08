import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsPgError, AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { MonitorService, Pool } from './monitor.service';

/**
 * Hourly account-pool snapshot into Postgres `pool_snapshot` (tg-platform/analytics/
 * upgrade-2026-11-07-bounded-history.sql; nightly rollup to daily_pool / monthly_pool in history.sql).
 *
 * - Values: the monitor's own pool counts (MonitorService.poolSnapshot = poolByClient, same cache).
 * - One row per pool ('b' buffer, 'p' promote) x clientId; client_id '' = no clientId.
 * - One INSERT per hour, ts_hour = date_trunc('hour', now()), ON CONFLICT DO NOTHING (idempotent).
 * - The CMS scheduler runs it under its run-claim, so one CMS process writes per hour.
 * - Never throws: any failure is logged once and the hour is a gap (no retry).
 * - Flag POOL_SNAPSHOT_ENABLED (read on every run; default ON, '0'/'false'/'no'/'off' = OFF).
 *   A missing table (SQLSTATE 42P01) is skipped with a log.
 *
 * Column sources (pool 'b' = bufferClients, 'p' = promoteClients):
 *   total, harsh, warming, active (status 'active'): both pools. eligible: 'b' only (the buffer swap
 *   gates); 'p' has no eligibility definition, written 0 (no source; no reader uses it).
 */
export const POOL_SNAPSHOT_FLAG = 'POOL_SNAPSHOT_ENABLED';

export interface PoolSnapshotRow {
  pool: 'b' | 'p';
  client_id: string;
  total: number;
  eligible: number;
  harsh: number;
  active: number;
  warming: number;
}

export type PoolSnapshotOutcome =
  | { status: 'written'; rows: number; inserted: number }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

export function poolSnapshotEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[POOL_SNAPSHOT_FLAG];
  if (v === undefined || v.trim() === '') return true;
  return !['0', 'false', 'no', 'off'].includes(v.trim().toLowerCase());
}

/**
 * Both pools for every key of the pool map (a clientId with accounts in either collection, plus ''
 * when any account has no clientId). A client with no accounts in one pool gets a true all-zero row.
 */
export function poolSnapshotRows(pool: Pool): PoolSnapshotRow[] {
  const rows: PoolSnapshotRow[] = [];
  const ids = [...pool.keys()].sort();
  for (const id of ids) {
    const c = pool.get(id)!;
    rows.push({ pool: 'b', client_id: id, total: c.total, eligible: c.eligible, harsh: c.harsh, active: c.active, warming: c.warming });
  }
  for (const id of ids) {
    const c = pool.get(id)!;
    // promote eligible: no source (no promote eligibility definition) and never read; written 0
    rows.push({ pool: 'p', client_id: id, total: c.promoteTotal, eligible: 0, harsh: c.promoteHarsh, active: c.promoteActive, warming: c.promoteWarming });
  }
  return rows;
}

export const POOL_SNAPSHOT_SQL = `/* cms.pool_snapshot */
INSERT INTO pool_snapshot (ts_hour, pool, client_id, total, eligible, harsh, active, warming)
SELECT date_trunc('hour', now()), r.pool, r.client_id, r.total, r.eligible, r.harsh, r.active, r.warming
  FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[])
       AS r(pool, client_id, total, eligible, harsh, active, warming)
ON CONFLICT (ts_hour, pool, client_id) DO NOTHING
RETURNING 1 AS inserted`;

@Injectable()
export class PoolSnapshotWriter {
  private readonly logger = new Logger(PoolSnapshotWriter.name);

  constructor(
    private readonly monitor: MonitorService,
    private readonly pg: AnalyticsPgReader,
  ) {}

  async run(): Promise<PoolSnapshotOutcome> {
    try {
      return await this.write();
    } catch (err) {
      const reason = `unexpected: ${String((err as Error)?.message ?? err).slice(0, 200)}`;
      this.logger.warn(`pool_snapshot ${reason}; this hour is a gap`);
      return { status: 'failed', reason };
    }
  }

  private async write(): Promise<PoolSnapshotOutcome> {
    if (!poolSnapshotEnabled()) return { status: 'skipped', reason: `${POOL_SNAPSHOT_FLAG} is off` };
    if (!this.pg.isEnabled()) return { status: 'skipped', reason: 'ANALYTICS_DB_URL not set' };

    let pool: Pool;
    try {
      pool = await this.monitor.poolSnapshot();
    } catch (err) {
      const reason = `pool counts unavailable: ${String((err as Error)?.message ?? err).slice(0, 200)}`;
      this.logger.warn(`pool_snapshot ${reason}; this hour is a gap`);
      return { status: 'failed', reason };
    }
    const rows = poolSnapshotRows(pool);
    if (!rows.length) {
      this.logger.warn('pool_snapshot: no pool rows (empty bufferClients and promoteClients?); nothing written');
      return { status: 'skipped', reason: 'no rows' };
    }

    let error: AnalyticsPgError | undefined;
    const res = await this.pg.query<{ inserted: number }>(
      POOL_SNAPSHOT_SQL,
      [
        rows.map((r) => r.pool),
        rows.map((r) => r.client_id),
        rows.map((r) => r.total),
        rows.map((r) => r.eligible),
        rows.map((r) => r.harsh),
        rows.map((r) => r.active),
        rows.map((r) => r.warming),
      ],
      (e) => (error = e),
    );
    if (res === undefined) {
      const e = error as AnalyticsPgError | undefined;
      if (e?.code === '42P01') {
        this.logger.warn('pool_snapshot table does not exist (apply upgrade-2026-11-07-bounded-history.sql); skipped');
        return { status: 'skipped', reason: 'pool_snapshot missing' };
      }
      const reason = `${e?.kind ?? 'query'}${e?.code ? ` ${e.code}` : ''}: ${String(e?.message ?? 'unknown').slice(0, 200)}`;
      this.logger.warn(`pool_snapshot insert failed (${reason}); this hour is a gap`);
      return { status: 'failed', reason };
    }
    this.logger.log(`pool_snapshot: ${res.length}/${rows.length} rows inserted`);
    return { status: 'written', rows: rows.length, inserted: res.length };
  }
}
