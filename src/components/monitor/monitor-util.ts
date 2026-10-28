import { DateRange } from './monitor-time';

/** Masks a phone number to its last 4 digits: '••••1234'. Empty/absent stays null. */
export function maskMobile(m: unknown): string | null {
  if (m === null || m === undefined || m === '') return null;
  const s = String(m);
  return `••••${s.slice(-4)}`;
}

/** pg returns bigint/numeric as strings. */
export function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** numerator / denominator rounded to 4 dp, null when the denominator is 0 or unknown. */
export function ratio(numerator: number | null, denominator: number | null, dp = 4): number | null {
  if (numerator === null || denominator === null || !denominator) return null;
  return round(numerator / denominator, dp);
}

/**
 * Conversion over several days: sum of same-day first payers / sum of new users (never an average
 * of daily ratios).
 */
export function pooledConversion(days: Array<{ newUsers: number; sameDayPayers: number }>): number | null {
  let n = 0;
  let p = 0;
  for (const d of days) {
    n += d.newUsers;
    p += d.sameDayPayers;
  }
  return ratio(p, n);
}

/** Rejects after `ms` with a labelled error. The underlying work is not cancelled. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

export const DMS_ATTRIBUTION_FROM = '2026-10-26';
/** payment_event starts 2026-10-03 20:32Z = 2026-10-04 02:02 IST. */
export const REVENUE_HISTORY_FROM = '2026-10-04';
export const DAILY_MOBILE_FROM = '2026-10-10';

/** Data-history notes for every range the response covers. */
export function historyNotes(ranges: DateRange[], opts: { mobiles?: boolean } = {}): string[] {
  const notes: string[] = [];
  const earliest = ranges.reduce((m, r) => (r.from < m ? r.from : m), '9999-12-31');
  if (earliest < DMS_ATTRIBUTION_FROM) {
    notes.push(
      `Per-client attribution of DMs and sends begins ${DMS_ATTRIBUTION_FROM}; DMs before it are only in fleet totals (unattributed).`,
    );
  }
  if (earliest < REVENUE_HISTORY_FROM) {
    notes.push('Revenue history begins 2026-10-03 20:32Z (2026-10-04 IST); earlier days show 0 revenue, not no revenue.');
  }
  if (opts.mobiles && earliest < DAILY_MOBILE_FROM) {
    notes.push(`Per-mobile rows (daily_mobile) begin ${DAILY_MOBILE_FROM}.`);
  }
  return notes;
}

const MOBILE_KEYS = new Set(['mobile']);

/**
 * Deep copy of a heartbeat payload with every field named `mobile` masked to its last 4 digits.
 * Promote payload v1 lists mobiles as `mobiles[].m`; those are masked too.
 */
export function maskPayload(value: unknown, depth = 0, parentKey = ''): unknown {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((v) => maskPayload(v, depth + 1, parentKey));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (MOBILE_KEYS.has(k) || (parentKey === 'mobiles' && k === 'm')) {
        out[k] = Array.isArray(v) ? v.map(maskMobile) : maskMobile(v);
      } else {
        out[k] = maskPayload(v, depth + 1, k);
      }
    }
    return out;
  }
  return value;
}
