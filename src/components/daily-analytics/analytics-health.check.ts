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
/** SQLSTATE invalid_schema_name / insufficient_privilege: pg_cron not installed or not readable. */
const INVALID_SCHEMA = '3F000';
const INSUFFICIENT_PRIVILEGE = '42501';
/** pg_cron job name scheduled by tg-platform analytics/history.sql. */
export const HISTORY_CRON_JOB = 'analytics-history';
/** Alert when the last analytics-history run started longer ago than this (nightly job + slack). */
export const HISTORY_JOB_MAX_AGE_MS = 26 * 60 * 60 * 1000;
/**
 * A guardrail condition that persists is re-sent only after this many IST days (a weekly reminder);
 * a new or escalated condition (new key) is sent at once. Keeps known multi-week noise (a table over
 * budget until its retention catches up) from paging every night.
 */
export const HISTORY_REALERT_DAYS = 7;

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
  /**
   * Bounded-history guardrails (tg-platform analytics/history.sql). Each is undefined when its function,
   * table or the pg_cron schema is missing (older DB): that probe is skipped quietly.
   */
  /** `analytics_size_check(ist_today())` rows (levels info / warn / critical). */
  sizeRows?: AnalyticsSizeRow[];
  /** analytics_rollup_ledger rows with status mismatch/error written by the last run (max run_at). */
  ledgerRows?: AnalyticsLedgerRow[];
  /** Last `analytics-history` pg_cron run; `null` = job exists but has never run. */
  historyJob?: AnalyticsCronRun | null;
  /** The ledger exists but cron.job has no `analytics-history` row. */
  historyJobMissing?: boolean;
  /** Epoch ms the check ran at (cron staleness is measured from it). */
  checkedAt?: number;
}

export interface AnalyticsSizeRow {
  level: string;
  subject: string;
  detail: string;
}

export interface AnalyticsLedgerRow {
  step: string;
  period_start: string;
  status: string;
  detail?: string | null;
}

export interface AnalyticsCronRun {
  status: string;
  start_time: string | Date;
  return_message?: string | null;
}

/** One guardrail condition. `key` identifies the condition across nights (no numbers that drift daily). */
export interface HistoryFinding {
  key: string;
  kind: 'size' | 'ledger' | 'job';
  level: 'warn' | 'critical';
  text: string;
  /** Ledger only: grouping fields for the compact summary. */
  step?: string;
  status?: string;
  period?: string;
}

/** Condition key -> IST day it was last alerted. Persisted by the caller (controlPlaneJobRuns). */
export type HistoryAlertState = Record<string, string>;

export interface AnalyticsHealthResult {
  /** Problems alerted this run (existing checks + compact guardrail lines); empty = no message. */
  problems: string[];
  /** Guardrail conditions present this run that were already alerted recently (not re-sent). */
  suppressed: string[];
  /** State to persist and pass back on the next run. */
  historyAlerts: HistoryAlertState;
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

/** Detail text with every number replaced, so a condition keeps one key while its figures drift. */
function stableDetail(detail: string): string {
  return detail.replace(/\d+(?:[.:\-T]\d+)*/g, '#');
}

function toIso(v: string | Date | undefined | null): string {
  if (v === undefined || v === null) return 'n/a';
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
}

/** Pure decision: bounded-history guardrail conditions (empty = healthy, or the probes were skipped). */
export function decideHistoryFindings(input: AnalyticsHealthInput): HistoryFinding[] {
  const out: HistoryFinding[] = [];
  for (const r of input.sizeRows ?? []) {
    const level = String(r.level ?? '');
    if (level !== 'warn' && level !== 'critical') continue; // 'info' (>= 300 MB, the target) is not an alert
    const subject = String(r.subject ?? '');
    const detail = String(r.detail ?? '');
    out.push({ key: `size:${level}:${subject}:${stableDetail(detail)}`, kind: 'size', level, text: `size ${level} ${subject}: ${detail}` });
  }
  for (const r of input.ledgerRows ?? []) {
    const status = String(r.status ?? '');
    if (status !== 'mismatch' && status !== 'error') continue;
    const step = String(r.step ?? '');
    const period = String(r.period_start ?? '');
    out.push({
      key: `ledger:${status}:${step}:${period}`,
      kind: 'ledger',
      level: 'warn',
      text: `ledger ${status} ${step} ${period}: ${r.detail ?? ''}`,
      step,
      status,
      period,
    });
  }
  if (input.historyJobMissing) {
    out.push({ key: 'job:missing', kind: 'job', level: 'critical', text: `pg_cron job ${HISTORY_CRON_JOB} is not scheduled` });
  } else if (input.historyJob === null) {
    out.push({ key: 'job:never', kind: 'job', level: 'critical', text: `${HISTORY_CRON_JOB} has never run` });
  } else if (input.historyJob) {
    const job = input.historyJob;
    const started = toIso(job.start_time);
    const startedMs = new Date(job.start_time).getTime();
    if (String(job.status) === 'failed') {
      // Keyed by the run, so every failed night is its own alert.
      out.push({
        key: `job:failed:${started}`,
        kind: 'job',
        level: 'critical',
        text: `${HISTORY_CRON_JOB} last run failed (started ${started}): ${String(job.return_message ?? '').slice(0, 300)}`,
      });
    }
    const now = input.checkedAt ?? Date.now();
    if (Number.isFinite(startedMs) && now - startedMs > HISTORY_JOB_MAX_AGE_MS) {
      out.push({
        key: `job:stale:${started}`,
        kind: 'job',
        level: 'critical',
        text: `${HISTORY_CRON_JOB} has not run in ${HISTORY_JOB_MAX_AGE_MS / 3_600_000} h (last start ${started}, ${job.status})`,
      });
    }
  }
  return out;
}

function istDayIndex(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

/**
 * Pure dedupe. A condition alerted on IST day D is not re-sent until D + HISTORY_REALERT_DAYS while it
 * persists; a condition that clears is forgotten, so its return alerts again. Generic: no date or table
 * exceptions; known multi-week noise is simply sent once, then weekly.
 */
export function dedupeHistoryFindings(
  findings: HistoryFinding[],
  previous: HistoryAlertState | undefined,
  today: string,
): { alert: HistoryFinding[]; suppressed: HistoryFinding[]; state: HistoryAlertState } {
  const alert: HistoryFinding[] = [];
  const suppressed: HistoryFinding[] = [];
  const state: HistoryAlertState = {};
  for (const f of findings) {
    if (f.key in state) continue; // same condition twice in one run
    const last = previous?.[f.key];
    if (last && /^\d{4}-\d{2}-\d{2}$/.test(last) && istDayIndex(today) - istDayIndex(last) < HISTORY_REALERT_DAYS) {
      suppressed.push(f);
      state[f.key] = last;
    } else {
      alert.push(f);
      state[f.key] = today;
    }
  }
  return { alert, suppressed, state };
}

/** Compact lines for one message: ledger rows grouped per (status, step) with their period range. */
export function summariseHistoryFindings(findings: HistoryFinding[]): string[] {
  const lines: string[] = [];
  const ledger = new Map<string, { status: string; step: string; periods: string[]; sample: string }>();
  for (const f of findings) {
    if (f.kind !== 'ledger') {
      lines.push(f.text);
      continue;
    }
    const k = `${f.status}|${f.step}`;
    const g = ledger.get(k) ?? { status: f.status!, step: f.step!, periods: [], sample: f.text };
    g.periods.push(f.period!);
    ledger.set(k, g);
  }
  for (const g of ledger.values()) {
    const p = [...g.periods].sort();
    const range = p.length === 1 ? p[0] : `${p[0]}..${p[p.length - 1]}`;
    const sample = g.sample.replace(/^ledger \S+ \S+ \S+: /, '').slice(0, 200);
    lines.push(`ledger ${g.status}: ${g.step} ${p.length} period(s) ${range}${sample ? ` (e.g. ${sample})` : ''}`);
  }
  return lines;
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

    // Bounded-history guardrails (tg-platform analytics/history.sql, applied 2026-11-07). Missing function,
    // table or pg_cron schema = that probe is skipped quietly (older DB); other errors = unreachable.
    input.checkedAt = now;
    const skippable = (e: AnalyticsPgError, extra: string[] = []) =>
      e.code === UNDEFINED_FUNCTION || e.code === UNDEFINED_TABLE || (e.code !== undefined && extra.includes(e.code));
    const size = await this.probe<AnalyticsSizeRow>('SELECT level, subject, detail FROM analytics_size_check(ist_today())', []);
    if ('error' in size) {
      if (skippable(size.error)) {
        this.logger.log(`Analytics size check skipped: ${size.error.message} [${size.error.code}]`);
      } else {
        const stop = failed('analytics_size_check', size.error);
        if (stop) return stop;
      }
    } else {
      input.sizeRows = size.rows;
    }

    // The last run = the newest run_at: one nightly run writes every ledger row in one transaction (now()).
    const ledger = await this.probe<AnalyticsLedgerRow>(
      `SELECT step, to_char(period_start, 'YYYY-MM-DD') AS period_start, status, detail
         FROM analytics_rollup_ledger
        WHERE run_at = (SELECT max(run_at) FROM analytics_rollup_ledger)
          AND status IN ('mismatch', 'error')
        ORDER BY step, period_start`,
      [],
    );
    let historyInstalled = false;
    if ('error' in ledger) {
      if (skippable(ledger.error)) {
        this.logger.log(`Analytics rollup ledger check skipped: ${ledger.error.message} [${ledger.error.code}]`);
      } else {
        const stop = failed('analytics_rollup_ledger', ledger.error);
        if (stop) return stop;
      }
    } else {
      historyInstalled = true;
      input.ledgerRows = ledger.rows;
    }

    if (historyInstalled) {
      const job = await this.probe<{ jobid: string; status: string | null; start_time: string | Date | null; return_message: string | null }>(
        `SELECT j.jobid, r.status, r.start_time, r.return_message
           FROM cron.job j
           LEFT JOIN LATERAL (
                SELECT d.status, d.start_time, d.return_message
                  FROM cron.job_run_details d
                 WHERE d.jobid = j.jobid
                 ORDER BY d.start_time DESC
                 LIMIT 1) r ON true
          WHERE j.jobname = $1`,
        [HISTORY_CRON_JOB],
      );
      if ('error' in job) {
        if (skippable(job.error, [INVALID_SCHEMA, INSUFFICIENT_PRIVILEGE])) {
          this.logger.log(`Analytics ${HISTORY_CRON_JOB} job check skipped: ${job.error.message} [${job.error.code}]`);
        } else {
          const stop = failed('cron.job_run_details', job.error);
          if (stop) return stop;
        }
      } else if (!job.rows.length) {
        input.historyJobMissing = true;
      } else {
        const r = job.rows[0];
        input.historyJob = r.start_time ? { status: String(r.status), start_time: r.start_time, return_message: r.return_message } : null;
      }
    }
    return input;
  }

  /**
   * Runs the check with no dedupe state; returns the problems alerted (alert sent when non-empty).
   * The scheduler uses runWithState so guardrail conditions are not re-sent every night.
   */
  async run(now = Date.now()): Promise<string[]> {
    return (await this.runWithState(now, {})).problems;
  }

  /**
   * Runs the check; ONE message for everything new (existing checks + bounded-history guardrails).
   * `previous` = the historyAlerts returned by the last completed run. ANALYTICS_DB_URL unset = logged
   * and skipped. An unreachable Postgres is re-probed PROBE_RETRIES times before alerting.
   */
  async runWithState(now = Date.now(), previous: HistoryAlertState = {}): Promise<AnalyticsHealthResult> {
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
      return { problems: [], suppressed: [], historyAlerts: previous };
    }
    const base = decideAnalyticsHealth(input);
    // Unreachable: the guardrail probes did not run, so keep the previous state untouched.
    const findings = input.pgError !== undefined ? [] : decideHistoryFindings(input);
    const today = istDay(now, 0);
    const dedupe =
      input.pgError !== undefined
        ? { alert: [], suppressed: [], state: previous }
        : dedupeHistoryFindings(findings, previous, today);
    const historyLines = summariseHistoryFindings(dedupe.alert);
    const suppressed = summariseHistoryFindings(dedupe.suppressed);
    if (suppressed.length) {
      this.logger.log(`Analytics history guardrails already reported (re-sent after ${HISTORY_REALERT_DAYS} d): ${suppressed.join('; ')}`);
    }
    const problems = [...base, ...historyLines];
    if (!problems.length) {
      this.logger.log(
        `Analytics health OK for ${input.day}: promotion_send=${input.promotionSendRows} daily_client=${input.dailyClientRows} daily_mobile=${input.dailyMobileRows ?? 'n/a'} parity_rows=${input.parityRows?.length ?? 'n/a'} size_rows=${input.sizeRows?.length ?? 'n/a'} ledger_bad=${input.ledgerRows?.length ?? 'n/a'} history_job=${input.historyJob?.status ?? (input.historyJob === null ? 'never' : 'n/a')}`,
      );
      return { problems, suppressed, historyAlerts: dedupe.state };
    }
    this.logger.warn(`Analytics health FAILED for ${input.day}: ${problems.join('; ')}`);
    const critical = dedupe.alert.some((f) => f.level === 'critical');
    const fields = base.length
      ? [
          { label: 'promotion_send', value: String(input.promotionSendRows ?? 'n/a') },
          { label: '7-day median', value: String(median(input.trailingPromotionSendRows ?? [])) },
          { label: 'daily_client', value: String(input.dailyClientRows ?? 'n/a') },
          { label: 'daily_mobile', value: String(input.dailyMobileRows ?? 'n/a') },
          { label: 'parity mismatches', value: String(input.parityRows?.length ?? 'n/a') },
        ]
      : [];
    if (historyLines.length) {
      fields.push(
        { label: 'size warn/critical', value: String(dedupe.alert.filter((f) => f.kind === 'size').length) },
        { label: 'ledger mismatch/error', value: String(dedupe.alert.filter((f) => f.kind === 'ledger').length) },
        { label: `${HISTORY_CRON_JOB} last run`, value: input.historyJob ? `${input.historyJob.status} ${toIso(input.historyJob.start_time)}` : input.historyJobMissing ? 'not scheduled' : input.historyJob === null ? 'never' : 'n/a' },
      );
    }
    if (dedupe.suppressed.length) fields.push({ label: 'already reported', value: String(dedupe.suppressed.length) });
    const sent = await this.notify({
      severity: critical ? 'critical' : 'error',
      title: base.length ? 'Analytics Postgres health check failed' : 'Analytics history guardrails',
      summary: `IST day ${input.day}`,
      fields,
      details: problems,
    }).catch((err) => {
      this.logger.error(`Analytics health alert failed to send: ${(err as Error)?.message ?? err}`);
      return false;
    });
    // Not delivered: do not mark the new conditions as alerted, so the next run sends them again.
    const historyAlerts = { ...dedupe.state };
    if (sent !== true) {
      for (const f of dedupe.alert) {
        if (previous[f.key]) historyAlerts[f.key] = previous[f.key];
        else delete historyAlerts[f.key];
      }
    }
    return { problems, suppressed, historyAlerts };
  }
}
