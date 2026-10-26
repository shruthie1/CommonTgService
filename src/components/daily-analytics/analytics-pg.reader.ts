import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

const QUERY_TIMEOUT_MS = 10_000;
const LOG_INTERVAL_MS = 60_000;

/**
 * Read-only access to the Postgres analytics store (tg-platform/analytics/schema.sql).
 *
 * Safety rules (copied from the tg-platform sink):
 *  - enabled only when ANALYTICS_DB_URL is set. It is read lazily on every call, not in the
 *    constructor, because ConfigurationInit copies the Mongo `configuration` doc into process.env
 *    during module init (no whitelist, existing env wins).
 *  - `pg` is required lazily; a missing module disables the reader instead of crashing.
 *  - bounded connect / query / statement timeouts, small pool, and a pool 'error' handler (an
 *    idle-client error would otherwise crash the process).
 *  - any failure resolves to `undefined` (logged at most once a minute); the caller turns that into
 *    an explicit error (DailyAnalyticsService: 503). `query` never throws.
 */
/**
 * Why one `query` call returned undefined. kind 'disabled' = ANALYTICS_DB_URL unset; 'unavailable' =
 * the pg module could not load; 'query' = the query or connection failed (`code` = SQLSTATE such as
 * '42P01' for a missing table, or a Node socket code such as 'ECONNREFUSED').
 */
export interface AnalyticsPgError {
  kind: 'disabled' | 'unavailable' | 'query';
  message: string;
  code?: string;
}

@Injectable()
export class AnalyticsPgReader implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsPgReader.name);
  private pool: any;
  private poolUrl?: string;
  private lastLogAt = 0;

  isEnabled(): boolean {
    return !!process.env.ANALYTICS_DB_URL;
  }

  private getPool(): any | undefined {
    const url = process.env.ANALYTICS_DB_URL;
    if (!url) return undefined;
    if (this.pool && this.poolUrl === url) return this.pool;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg');
      const pool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
        max: 2,
        connectionTimeoutMillis: QUERY_TIMEOUT_MS,
        query_timeout: QUERY_TIMEOUT_MS,
        statement_timeout: QUERY_TIMEOUT_MS,
        idleTimeoutMillis: 30_000,
      });
      pool.on('error', (err: Error) => this.logOnce('pool error', err));
      const old = this.pool;
      this.pool = pool;
      this.poolUrl = url;
      if (old) old.end().catch(() => undefined);
      return pool;
    } catch (err) {
      this.logOnce('module unavailable', err);
      return undefined;
    }
  }

  private logOnce(what: string, err: unknown): void {
    const now = Date.now();
    if (now - this.lastLogAt < LOG_INTERVAL_MS) return;
    this.lastLogAt = now;
    this.logger.warn(`Analytics Postgres ${what}: ${(err as Error)?.message ?? err}`);
  }

  /**
   * Rows, or `undefined` when PG is not configured or the query failed (caller reports the error).
   * `onError` receives THIS call's failure (per call, so concurrent requests never see each
   * other's error).
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    onError?: (error: AnalyticsPgError) => void,
  ): Promise<T[] | undefined> {
    const pool = this.getPool();
    if (!pool) {
      onError?.(
        this.isEnabled()
          ? { kind: 'unavailable', message: 'pg module unavailable' }
          : { kind: 'disabled', message: 'ANALYTICS_DB_URL not set' },
      );
      return undefined;
    }
    try {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    } catch (err) {
      this.logOnce('query failed', err);
      const code = (err as { code?: unknown })?.code;
      onError?.({
        kind: 'query',
        message: (err as Error)?.message ?? String(err),
        code: typeof code === 'string' ? code : undefined,
      });
      return undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;
    if (pool) await pool.end().catch(() => undefined);
  }
}
