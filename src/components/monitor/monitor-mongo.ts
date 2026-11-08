/**
 * Read-only Mongo aggregations for the monitor (aggregate/find only, maxTimeMS-bounded,
 * secondaryPreferred). Pipelines are plain functions so specs can assert their shape.
 */
import { Types } from 'mongoose';
import { WarmupPhase } from '../shared/warmup-phases';

export const MONGO_MAX_TIME_MS = 8_000;
const DAY_MS = 86_400_000;

export function oidAt(ms: number): Types.ObjectId {
  return Types.ObjectId.createFromTime(Math.floor(ms / 1000));
}

/**
 * userData cohorts: docs CREATED (ObjectId time) in [start, end), grouped by clientId, IST day and
 * optionally IST hour. `same` = first payment (firstPaidAt, epoch ms) on the creation IST day and,
 * when `paidBefore` is set, before that instant (yesterday-same-time comparisons).
 */
export function userCohortPipeline(o: {
  start: number;
  end: number;
  clientId?: string;
  paidBefore?: number;
  byHour?: boolean;
}): object[] {
  const created = { $toDate: '$_id' };
  const paidCond: object[] = [{ $gt: ['$firstPaidAt', 0] }];
  if (o.paidBefore) paidCond.push({ $lt: ['$firstPaidAt', o.paidBefore] });
  const match: Record<string, unknown> = { _id: { $gte: oidAt(o.start), $lt: oidAt(o.end) } };
  if (o.clientId) match.clientId = o.clientId;
  return [
    { $match: match },
    {
      $project: {
        _id: 0,
        c: '$clientId',
        d: { $dateToString: { date: created, format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
        h: o.byHour ? { $hour: { date: created, timezone: 'Asia/Kolkata' } } : { $literal: null },
        pd: {
          $cond: [
            { $and: paidCond },
            { $dateToString: { date: { $toDate: '$firstPaidAt' }, format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
            null,
          ],
        },
      },
    },
    {
      $group: {
        _id: { c: '$c', d: '$d', h: '$h' },
        n: { $sum: 1 },
        same: { $sum: { $cond: [{ $eq: ['$pd', '$d'] }, 1, 0] } },
      },
    },
  ];
}

export interface CohortRow {
  c: string | null;
  d: string;
  h: number | null;
  n: number;
  same: number;
}

export function flattenCohort(rows: Array<{ _id: { c?: string; d: string; h?: number }; n: number; same: number }>): CohortRow[] {
  return rows.map((r) => ({
    c: r._id.c ?? null,
    d: r._id.d,
    h: r._id.h ?? null,
    n: Number(r.n) || 0,
    same: Number(r.same) || 0,
  }));
}

/** Accounts whose spamStatus is 'harsh'. */
const HARSH_COND = { $eq: ['$spamStatus', 'harsh'] };
const HARSH_SUM = { $sum: { $cond: [HARSH_COND, 1, 0] } };

/**
 * Accounts still warming up (enrolled..maturing; a missing or empty warmupPhase counts as enrolled).
 * Same phase list as shared/warmup-phases.ts isAccountWarmingUp.
 */
export const WARMING_PHASES: string[] = [
  WarmupPhase.ENROLLED,
  WarmupPhase.SETTLING,
  WarmupPhase.IDENTITY,
  WarmupPhase.GROWING,
  WarmupPhase.MATURING,
];
const WARMING_COND = { $in: [{ $ifNull: ['$warmupPhase', ''] }, ['', ...WARMING_PHASES]] };
const WARMING_SUM = { $sum: { $cond: [WARMING_COND, 1, 0] } };

/**
 * Pool depth per clientId. eligible mirrors the CMS handleSetupClient gates as in
 * scripts/buffer-analysis/10-census.cjs (approximation: omits the "not current main" and "users doc
 * not expired" checks).
 */
export function bufferPoolPipeline(now: number, todayIst: string, clientId?: string): object[] {
  return [
    ...(clientId ? [{ $match: { clientId } }] : []),
    {
      $group: {
        _id: '$clientId',
        total: { $sum: 1 },
        harsh: HARSH_SUM,
        warming: WARMING_SUM,
        // status 'active': the same expression as promotePoolPipeline (pool_snapshot 'b' active)
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        eligible: {
          $sum: {
            $cond: [{ $and: eligibleConds(now, todayIst) }, 1, 0],
          },
        },
      },
    },
  ];
}

/** The eligible gates in order; [5] and [6] are the spam gates (harsh rest 30 d on spamCheckedAt, limit lifted). */
function eligibleConds(now: number, todayIst: string): object[] {
  const nowDate = new Date(now);
  return [
    { $eq: ['$status', 'active'] },
    { $ne: ['$inUse', true] },
    { $eq: ['$warmupPhase', 'session_rotated'] },
    { $gte: [{ $ifNull: ['$channels', 0] }, 200] },
    { $lte: ['$createdAt', new Date(now - 15 * DAY_MS)] },
    {
      $or: [
        { $ne: ['$spamStatus', 'harsh'] },
        { $lte: [{ $ifNull: ['$spamCheckedAt', new Date(0)] }, new Date(now - 30 * DAY_MS)] },
      ],
    },
    { $not: [{ $gt: [{ $ifNull: ['$limitedUntil', new Date(0)] }, nowDate] }] },
    { $lte: ['$availableDate', todayIst] },
  ];
}

export function promotePoolPipeline(clientId?: string): object[] {
  return [
    ...(clientId ? [{ $match: { clientId } }] : []),
    {
      $group: {
        _id: '$clientId',
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        // total / harsh / warming: same definitions as the buffer pipeline (pool_snapshot 'p' rows)
        total: { $sum: 1 },
        harsh: HARSH_SUM,
        warming: WARMING_SUM,
      },
    },
  ];
}

// ---------------------------------------------------------------- R11 (account split reader switch)

/**
 * R11, ACCOUNT_HEALTH_READ shadow / on only: one small row per pool doc (every doc the $group pipelines count, same
 * $match) with the spam fields and the old flags COMPUTED BY MONGO from the same expressions as bufferPoolPipeline:
 * h = harsh, sg = the two spam gates of eligible, g = the other eligible gates, a = status active, w = warming. A row whose accountHealth
 * verdict does not win keeps these flags, so on mode with no winning facet doc gives exactly the $group counts.
 */
export function bufferPoolRowsPipeline(now: number, todayIst: string, clientId?: string): object[] {
  const conds = eligibleConds(now, todayIst);
  return [
    ...(clientId ? [{ $match: { clientId } }] : []),
    {
      $project: {
        _id: 0,
        c: '$clientId',
        m: '$mobile',
        s: '$spamStatus',
        lu: '$limitedUntil',
        at: '$spamCheckedAt',
        h: HARSH_COND,
        sg: { $and: [conds[5], conds[6]] },
        g: { $and: [...conds.slice(0, 5), conds[7]] },
        a: { $eq: ['$status', 'active'] },
        w: WARMING_COND,
      },
    },
  ];
}

/** R11 promote rows (as bufferPoolRowsPipeline): a = status active, h = harsh, w = warming. */
export function promotePoolRowsPipeline(clientId?: string): object[] {
  return [
    ...(clientId ? [{ $match: { clientId } }] : []),
    {
      $project: {
        _id: 0,
        c: '$clientId',
        m: '$mobile',
        s: '$spamStatus',
        lu: '$limitedUntil',
        at: '$spamCheckedAt',
        h: HARSH_COND,
        a: { $eq: ['$status', 'active'] },
        w: WARMING_COND,
      },
    },
  ];
}

export interface PoolHealthRow {
  c?: unknown;
  m?: unknown;
  s?: unknown;
  lu?: unknown;
  at?: unknown;
  h?: boolean;
  sg?: boolean;
  g?: boolean;
  a?: boolean;
  w?: boolean;
}

/** The health facts R11 counts from (a view of shared/account-facet-read; only source matters beyond these). */
export interface PoolHealthVerdict {
  spamStatus: string | null;
  limitedUntilMs: number | null;
  verdictAtMs: number | null;
  source: 'pool' | 'accountHealth';
}

/**
 * R11 on: rows -> the $group output shapes ({_id, total, harsh, warming, eligible, active} buffer; {_id, active, total, harsh,
 * warming} promote). `verdicts[i]` belongs to rows[i]; a pool-sourced (or missing) verdict keeps the Mongo flags h / sg.
 * A winning accountHealth verdict decides harsh and the spam gates with today's rules: harsh rest 30 d anchored on the
 * LAST verdict (verdictAt; as R3 / R4, C17 not adopted), limit lifted when limitedUntil <= now. Every row is counted
 * (the row set is the $group's), so a verdict moves a row between buckets; it never adds or removes a row.
 */
export function poolCountsFromRows(
  kind: 'buffer' | 'promote',
  rows: PoolHealthRow[],
  verdicts: Array<PoolHealthVerdict | undefined>,
  now: number,
): Array<Record<string, unknown>> {
  const out = new Map<unknown, Record<string, unknown> & { total: number; harsh: number; warming: number }>();
  rows.forEach((r, i) => {
    const key = r.c ?? null;
    let g = out.get(key);
    if (!g) {
      g = kind === 'buffer' ? { _id: key, total: 0, harsh: 0, warming: 0, eligible: 0, active: 0 } : { _id: key, active: 0, total: 0, harsh: 0, warming: 0 };
      out.set(key, g);
    }
    const v = verdicts[i];
    const facet = v?.source === 'accountHealth';
    const harsh = facet ? v!.spamStatus === 'harsh' : r.h === true;
    g.total++;
    if (harsh) g.harsh++;
    if (r.w === true) g.warming++;
    if (r.a === true) (g.active as number)++;
    if (kind === 'promote') return;
    const spamGates = facet
      ? (!harsh || (v!.verdictAtMs ?? 0) <= now - 30 * DAY_MS) && !((v!.limitedUntilMs ?? 0) > now)
      : r.sg === true;
    if (r.g === true && spamGates) (g.eligible as number)++;
  });
  return [...out.values()];
}

export const TTFP_BUCKETS = ['<10m', '10-30m', '30m-2h', '2-24h', '1-3d', '3d+'] as const;

/** Minutes from userData creation to firstPaidAt, for first payments in [start, end); clientId omitted = fleet. */
export function timeToFirstPayPipeline(clientId: string | undefined, start: number, end: number): object[] {
  return [
    { $match: { ...(clientId ? { clientId } : {}), firstPaidAt: { $gte: start, $lt: end } } },
    { $project: { _id: 0, mins: { $divide: [{ $subtract: ['$firstPaidAt', { $toLong: { $toDate: '$_id' } }] }, 60000] } } },
    {
      $bucket: {
        groupBy: '$mins',
        boundaries: [-1e15, 0, 10, 30, 120, 1440, 4320, 1e15],
        default: 'other',
        output: { n: { $sum: 1 } },
      },
    },
  ];
}

/**
 * First payments in [start, end) as small rows {c: clientId, fp: firstPaidAt, mins: minutes since the
 * doc was created}, every client (pages filter and bucket in memory, see ttfpBuckets).
 * `chats` given: only those chatIds, so the query walks the chatId_Profile index instead of scanning
 * the collection (userData has no firstPaidAt index). Used for today with the chats that have a
 * credit row today (prod 2026-10-28: equal buckets for today and 7 d, fleet and sowmya2; 30 d missed
 * 3 of 1,984 first payments that have no credit row, so closed days keep the full scan, once a day).
 */
export function firstPayRowsPipeline(start: number, end: number, chats?: string[]): object[] {
  return [
    { $match: { ...(chats ? { chatId: { $in: chats } } : {}), firstPaidAt: { $gte: start, $lt: end } } },
    { $project: { _id: 0, c: '$clientId', fp: '$firstPaidAt', mins: { $divide: [{ $subtract: ['$firstPaidAt', { $toLong: { $toDate: '$_id' } }] }, 60000] } } },
  ];
}

export interface FirstPayRow {
  c?: string | null;
  fp: number;
  mins: number;
}

const TTFP_BOUNDARIES = [-1e15, 0, 10, 30, 120, 1440, 4320, 1e15];

/** Same output as timeToFirstPayPipeline's $bucket, from first-pay rows: one scope, fp in [start, end). */
export function ttfpBuckets(rows: FirstPayRow[], scope: string | null, start: number, end: number): Array<{ _id: number | string; n: number }> {
  const m = new Map<number | string, number>();
  for (const r of rows) {
    if (scope !== null && r.c !== scope) continue;
    const fp = Number(r.fp);
    if (!(fp >= start && fp < end)) continue;
    const mins = Number(r.mins);
    let id: number | string = 'other';
    for (let i = 0; i < TTFP_BOUNDARIES.length - 1; i++) {
      if (mins >= TTFP_BOUNDARIES[i] && mins < TTFP_BOUNDARIES[i + 1]) {
        id = TTFP_BOUNDARIES[i];
        break;
      }
    }
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return [...m].map(([_id, n]) => ({ _id, n }));
}

const TTFP_BY_LOWER: Record<string, string> = {
  '0': '<10m',
  '10': '10-30m',
  '30': '30m-2h',
  '120': '2-24h',
  '1440': '1-3d',
  '4320': '3d+',
};

/** $bucket output -> fixed 6 buckets; negative ages (doc recreated after payment) are counted apart. */
export function mapTtfp(rows: Array<{ _id: number | string; n: number }>): {
  buckets: Array<{ bucket: string; count: number }>;
  negative: number;
} {
  const counts = new Map<string, number>(TTFP_BUCKETS.map((b) => [b, 0]));
  let negative = 0;
  for (const r of rows) {
    const label = TTFP_BY_LOWER[String(r._id)];
    if (label) counts.set(label, (counts.get(label) ?? 0) + Number(r.n || 0));
    else negative += Number(r.n || 0);
  }
  return { buckets: TTFP_BUCKETS.map((b) => ({ bucket: b, count: counts.get(b) ?? 0 })), negative };
}
