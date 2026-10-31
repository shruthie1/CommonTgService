/**
 * IST (Asia/Kolkata, UTC+05:30, no DST) period math for the monitor endpoints.
 * All "dates" are IST calendar dates as 'YYYY-MM-DD'; all instants are epoch ms.
 */
export const IST_OFFSET_MS = 5.5 * 3600_000;
export const DAY_MS = 86_400_000;

export type MonitorPeriod = 'today' | '7d' | '30d';
export const MONITOR_PERIODS: MonitorPeriod[] = ['today', '7d', '30d'];

export interface DateRange {
  from: string;
  to: string;
}

export interface Window {
  start: number;
  end: number;
}

export interface PeriodWindows {
  period: MonitorPeriod;
  now: number;
  today: string;
  /** IST dates the current window covers (inclusive). */
  range: DateRange;
  /** IST dates the previous window covers (inclusive). */
  prevRange: DateRange;
  /** Current window [start, end) in epoch ms. */
  cur: Window;
  /** Previous window [start, end) in epoch ms. For `today` it ends at the same IST time yesterday. */
  prev: Window;
  /** true = whole IST days (7d/30d); false = intraday (today vs yesterday-same-time). */
  wholeDays: boolean;
}

/** IST calendar date of an instant. */
export function istDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** IST hour (0-23) of an instant. */
export function istHour(ms: number): number {
  return new Date(ms + IST_OFFSET_MS).getUTCHours();
}

/** Epoch ms of IST midnight starting `date`. */
export function istDayStart(date: string): number {
  return Date.parse(`${date}T00:00:00.000+05:30`);
}

export function addDays(date: string, n: number): string {
  const ms = Date.parse(`${date}T00:00:00.000Z`) + n * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inclusive list of IST dates from..to. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * - today: current = [IST today 00:00, now); previous = [IST yesterday 00:00, now - 24 h), i.e.
 *   yesterday up to the same IST time.
 * - 7d / 30d: the N COMPLETE IST days ending yesterday; previous = the N days before that. Whole
 *   days keep every source (daily_client is per day) on the same footing.
 */
export function resolvePeriod(period: MonitorPeriod, now: number): PeriodWindows {
  const today = istDate(now);
  const today0 = istDayStart(today);
  if (period === 'today') {
    const yday = addDays(today, -1);
    return {
      period,
      now,
      today,
      range: { from: today, to: today },
      prevRange: { from: yday, to: yday },
      cur: { start: today0, end: now },
      prev: { start: today0 - DAY_MS, end: now - DAY_MS },
      wholeDays: false,
    };
  }
  const n = period === '7d' ? 7 : 30;
  const from = addDays(today, -n);
  const to = addDays(today, -1);
  const prevFrom = addDays(today, -2 * n);
  const prevTo = addDays(today, -n - 1);
  return {
    period,
    now,
    today,
    range: { from, to },
    prevRange: { from: prevFrom, to: prevTo },
    cur: { start: istDayStart(from), end: today0 },
    prev: { start: istDayStart(prevFrom), end: istDayStart(from) },
    wholeDays: true,
  };
}

/** Client page: the last `days` IST days INCLUDING today (today partial). */
export function clientDaysRange(days: number, now: number): DateRange & { start: number; end: number } {
  const today = istDate(now);
  const from = addDays(today, -(days - 1));
  return { from, to: today, start: istDayStart(from), end: now };
}

/** Longest from..to range accepted (owner 2026-10-31). */
export const MAX_RANGE_DAYS = 31;
/** Earliest `from` accepted, in days before today IST (keeps the current window inside the in-memory history). */
export const RANGE_LOOKBACK_DAYS = 59;

/** 'intraday' = today only; 'days' = closed IST days only; 'mixed' = closed days plus today (partial). */
export type RangeKind = 'intraday' | 'days' | 'mixed';

export interface RangeWindows {
  now: number;
  today: string;
  /** Number of IST days in range (inclusive). */
  days: number;
  kind: RangeKind;
  range: DateRange;
  /** The same number of days immediately before `range`. */
  prevRange: DateRange;
  /** Current window [start, end): end = now when the range ends today. */
  cur: Window;
  /** Previous window [start, end): when the range ends today, its last day is cut at now - days. */
  prev: Window;
}

/** Inclusive number of days from..to. */
export function daysIn(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS) + 1;
}

/**
 * Generalises resolvePeriod to any from..to (IST, inclusive, already validated): current =
 * [istDayStart(from), min(now, istDayStart(to + 1))), previous = the same number of days before. When
 * `to` is today the previous window's last day is cut at the same IST time (now - days).
 * resolveRange(today, today) equals resolvePeriod('today'); resolveRange(today-7, today-1) equals '7d'.
 */
export function resolveRange(from: string, to: string, now: number): RangeWindows {
  const today = istDate(now);
  const days = daysIn(from, to);
  const prevRange = { from: addDays(from, -days), to: addDays(to, -days) };
  const endsToday = to === today;
  const kind: RangeKind = endsToday ? (from === today ? 'intraday' : 'mixed') : 'days';
  return {
    now,
    today,
    days,
    kind,
    range: { from, to },
    prevRange,
    cur: { start: istDayStart(from), end: endsToday ? now : istDayStart(addDays(to, 1)) },
    prev: { start: istDayStart(prevRange.from), end: endsToday ? now - days * DAY_MS : istDayStart(from) },
  };
}

/** The legacy preset a from..to range is identical to on `today` (same windows, same response), else null. */
export function presetOf(r: DateRange, today: string): MonitorPeriod | null {
  if (r.from === today && r.to === today) return 'today';
  const yday = addDays(today, -1);
  if (r.to !== yday) return null;
  if (r.from === addDays(today, -7)) return '7d';
  if (r.from === addDays(today, -30)) return '30d';
  return null;
}
