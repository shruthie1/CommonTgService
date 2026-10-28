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
