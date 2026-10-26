import { Injectable, Logger } from '@nestjs/common';
import { ChannelCategory } from '../bots/channel-category.enum';
import type { RichNotificationInput } from '../../utils/rich-message';
import { tryGetBotsServiceInstance } from '../../utils/bot.service.instance';
import { AnalyticsPgError, AnalyticsPgReader } from './analytics-pg.reader';

/** Alert when yesterday's promotion_send rows fall below this share of the trailing 7-day median. */
export const PROMOTION_SEND_MIN_MEDIAN_RATIO = 0.5;
export const ANALYTICS_HEALTH_TRAILING_DAYS = 7;
/** An unreachable Postgres is re-probed this many times, this far apart, before alerting. */
export const PROBE_RETRIES = 3;
export const PROBE_RETRY_DELAY_MS = 60_000;
/** Ops alert channel for the analytics health check (review item L8). */
export const ANALYTICS_HEALTH_CATEGORY = ChannelCategory.CLIENT_UPDATES;
/** SQLSTATE undefined_table. */
const UNDEFINED_TABLE = '42P01';
/** SQLSTATE undefined_function: analytics_daily_parity() not installed (maintain.sql not applied). */
const UNDEFINED_FUNCTION = '42883';

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface AnalyticsHealthInput {
  /** IST day checked ("YYYY-MM-DD", yesterday). */
  day: string;
  /** ANALYTICS_DB_URL unset: nothing to check, no alert. */
  disabled?: boolean;
  /** Postgres unreachable / a probe failed for a reason other than a missing table. Counts are then ignored. */
  pgError?: string;
  /** Tables that do not exist (SQLSTATE 42P01); their own checks are skipped. */
  missingTables?: string[];
  promotionSendRows?: number;
  /** promotion_send rows for each of the ANALYTICS_HEALTH_TRAILING_DAYS days before `day`. */
  trailingPromotionSendRows?: number[];
  dailyClientRows?: number;
  dailyMobileRows?: number;
  /**
   * Rows of `analytics_daily_parity(day)` (one per mismatch). Undefined when not available (function
   * missing, 42883, or a table it reads missing, 42P01, which has its own message).
   */
  parityRows?: AnalyticsParityRow[];
}

export interface AnalyticsParityRow {
  check_name: string;
  client_id?: string | null;
  namespace?: string | null;
  counter?: string | null;
  expected?: string | number | null;
  actual?: string | number | null;
}

/**
 * Parity mismatches per check kind. Every kind counts, `client_vs_mobile` included: daily_mobile has
 * full coverage from 2026-10-23 and only yesterday is checked.
 */
export function summariseParity(input: AnalyticsHealthInput): Map<string, { rows: number; clients: Set<string> }> {
  const out = new Map<string, { rows: number; clients: Set<string> }>();
  for (const r of input.parityRows ?? []) {
    const kind = String(r.check_name ?? 'unknown');
    const entry = out.get(kind) ?? { rows: 0, clients: new Set<string>() };
    entry.rows += 1;
    if (r.client_id) entry.clients.add(String(r.client_id));
    out.set(kind, entry);
  }
  return out;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Pure decision: the list of problems for the checked day (empty = healthy or skipped). */
export function decideAnalyticsHealth(input: AnalyticsHealthInput): string[] {
  if (input.disabled) return [];
  if (input.pgError !== undefined) return [`Postgres unreachable: ${input.pgError}`];
  const missing = new Set(input.missingTables ?? []);
  const problems: string[] = [...missing].map((t) => `${t} table is missing (${UNDEFINED_TABLE})`);
  if (!missing.has('promotion_send')) {
    const sends = input.promotionSendRows ?? 0;
    const med = median(input.trailingPromotionSendRows ?? []);
    if (sends === 0) {
      problems.push('promotion_send has 0 rows');
    } else if (med > 0 && sends < PROMOTION_SEND_MIN_MEDIAN_RATIO * med) {
      problems.push(
        `promotion_send has ${sends} rows, below ${PROMOTION_SEND_MIN_MEDIAN_RATIO * 100}% of the trailing ${ANALYTICS_HEALTH_TRAILING_DAYS}-day median ${med}`,
      );
    }
  }
  if (!missing.has('daily_client') && (input.dailyClientRows ?? 0) === 0) problems.push('daily_client has 0 rows');
  if (!missing.has('daily_mobile') && (input.dailyMobileRows ?? 0) === 0) problems.push('daily_mobile has 0 rows');
  for (const [kind, { rows, clients }] of summariseParity(input)) {
    problems.push(`daily parity ${kind}: ${rows} mismatched row(s) across ${clients.size} client(s)`);
  }
  return problems;
}

/** IST calendar day `offsetDays` from the IST day containing `now`. */
export function istDay(now: number, offsetDays = 0): string {
  return new Date(now + IST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

export type AnalyticsHealthNotifier = (input: RichNotificationInput) => Promise<boolean>;
type Probe<T> = { rows: T[] } | { error: AnalyticsPgError };

/**
 * Daily Postgres analytics health check (CMS scheduler, ~02:30 IST; the scheduler's run-claim makes
 * it once per day fleet-wide): read-only counts for YESTERDAY (IST) through the shared
 * AnalyticsPgReader pool; a Telegram notice when anything is off.
 */
@Injectable()
export class AnalyticsHealthCheck {
  private readonly logger = new Logger(AnalyticsHealthCheck.name);
  /** Overridable in tests; default = BotsService.sendMessageByCategory (best-effort). */
  notify: AnalyticsHealthNotifier = async (input) => {
    const bots = tryGetBotsServiceInstance();
    if (!bots) {
      this.logger.error(`Analytics health alert not sent (BotsService not ready): ${input.details}`);
      return false;
    }
    return bots.sendMessageByCategory(ANALYTICS_HEALTH_CATEGORY, input);
  };
  /** Overridable in tests. */
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  constructor(private readonly pg: AnalyticsPgReader) {}

  /** One query with ITS OWN error (never shared reader state). */
  private async probe<T>(sql: string, params: unknown[]): Promise<Probe<T>> {
    let error: AnalyticsPgError | undefined;
    const rows = await this.pg.query<T>(sql, params, (e) => {
      error = e;
    });
    if (rows) return { rows };
    return { error: error ?? { kind: 'query', message: 'unknown error' } };
  }

  async collect(now = Date.now()): Promise<AnalyticsHealthInput> {
    const day = istDay(now, -1);
    const first = istDay(now, -1 - ANALYTICS_HEALTH_TRAILING_DAYS);
    const today = istDay(now, 0);
    const input: AnalyticsHealthInput = { day, missingTables: [] };
    /** undefined = continue with this table's rows; otherwise the input to return now. */
    const failed = (table: string, error: AnalyticsPgError): AnalyticsHealthInput | undefined => {
      if (error.kind === 'disabled') return { day, disabled: true };
      if (error.code === UNDEFINED_TABLE) {
        input.missingTables!.push(table);
        return undefined;
      }
      return { day, pgError: `${error.message}${error.code ? ` [${error.code}]` : ''}` };
    };

    const sends = await this.probe<{ d: string; n: string }>(
      `SELECT to_char((ts AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS d, count(*)::bigint AS n
         FROM promotion_send
        WHERE ts >= $1::timestamptz AND ts < $2::timestamptz
        GROUP BY 1`,
      [`${first}T00:00:00+05:30`, `${today}T00:00:00+05:30`],
    );
    if ('error' in sends) {
      const stop = failed('promotion_send', sends.error);
      if (stop) return stop;
    } else {
      const byDay = new Map(sends.rows.map((r) => [String(r.d), Number(r.n) || 0]));
      input.promotionSendRows = byDay.get(day) ?? 0;
      input.trailingPromotionSendRows = [];
      for (let i = ANALYTICS_HEALTH_TRAILING_DAYS; i >= 1; i -= 1) {
        input.trailingPromotionSendRows.push(byDay.get(istDay(now, -1 - i)) ?? 0);
      }
    }

    const dc = await this.probe<{ n: string }>('SELECT count(*)::bigint AS n FROM daily_client WHERE day = $1::date', [day]);
    if ('error' in dc) {
      const stop = failed('daily_client', dc.error);
      if (stop) return stop;
    } else {
      input.dailyClientRows = Number(dc.rows[0]?.n) || 0;
    }

    const dm = await this.probe<{ n: string }>('SELECT count(*)::bigint AS n FROM daily_mobile WHERE day = $1::date', [day]);
    if ('error' in dm) {
      const stop = failed('daily_mobile', dm.error);
      if (stop) return stop;
    } else {
      input.dailyMobileRows = Number(dm.rows[0]?.n) || 0;
    }

    // analytics_daily_parity (analytics/maintain.sql): one row per counter where daily_client,
    // daily_mobile and promotion_send disagree for `day`. Missing function = skipped quietly.
    const parity = await this.probe<AnalyticsParityRow>('SELECT * FROM analytics_daily_parity($1::date)', [day]);
    if ('error' in parity) {
      if (parity.error.code === UNDEFINED_FUNCTION || parity.error.code === UNDEFINED_TABLE) {
        this.logger.log(`Analytics daily parity skipped for ${day}: ${parity.error.message} [${parity.error.code}]`);
      } else {
        const stop = failed('analytics_daily_parity', parity.error);
        if (stop) return stop;
      }
    } else {
      input.parityRows = parity.rows;
    }
    return input;
  }

  /**
   * Runs the check; returns the problems found (alert sent when non-empty). ANALYTICS_DB_URL unset =
   * logged and skipped. An unreachable Postgres is re-probed PROBE_RETRIES times before alerting.
   */
  async run(now = Date.now()): Promise<string[]> {
    let input = await this.collect(now);
    for (let attempt = 1; input.pgError !== undefined && attempt <= PROBE_RETRIES; attempt += 1) {
      this.logger.warn(
        `Analytics health probe failed for ${input.day} (${input.pgError}); retry ${attempt}/${PROBE_RETRIES} in ${PROBE_RETRY_DELAY_MS / 1000}s`,
      );
      await this.sleep(PROBE_RETRY_DELAY_MS);
      input = await this.collect(now);
    }
    if (input.disabled) {
      this.logger.log(`Analytics health check skipped for ${input.day}: ANALYTICS_DB_URL not set`);
      return [];
    }
    const problems = decideAnalyticsHealth(input);
    if (!problems.length) {
      this.logger.log(
        `Analytics health OK for ${input.day}: promotion_send=${input.promotionSendRows} daily_client=${input.dailyClientRows} daily_mobile=${input.dailyMobileRows ?? 'n/a'} parity_rows=${input.parityRows?.length ?? 'n/a'}`,
      );
      return problems;
    }
    this.logger.warn(`Analytics health FAILED for ${input.day}: ${problems.join('; ')}`);
    await this.notify({
      severity: 'error',
      title: 'Analytics Postgres health check failed',
      summary: `IST day ${input.day}`,
      fields: [
        { label: 'promotion_send', value: String(input.promotionSendRows ?? 'n/a') },
        { label: '7-day median', value: String(median(input.trailingPromotionSendRows ?? [])) },
        { label: 'daily_client', value: String(input.dailyClientRows ?? 'n/a') },
        { label: 'daily_mobile', value: String(input.dailyMobileRows ?? 'n/a') },
        { label: 'parity mismatches', value: String(input.parityRows?.length ?? 'n/a') },
      ],
      details: problems,
    }).catch((err) => {
      this.logger.error(`Analytics health alert failed to send: ${(err as Error)?.message ?? err}`);
      return false;
    });
    return problems;
  }
}
