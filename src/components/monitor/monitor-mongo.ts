/**
 * Read-only Mongo aggregations for the monitor (aggregate/find only, maxTimeMS-bounded,
 * secondaryPreferred). Pipelines are plain functions so specs can assert their shape.
 */
import { Types } from 'mongoose';

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

/**
 * Pool depth per clientId. eligible mirrors the CMS handleSetupClient gates as in
 * scripts/buffer-analysis/10-census.cjs (approximation: omits the "not current main" and "users doc
 * not expired" checks).
 */
export function bufferPoolPipeline(now: number, todayIst: string, clientId?: string): object[] {
  const nowDate = new Date(now);
  return [
    ...(clientId ? [{ $match: { clientId } }] : []),
    {
      $group: {
        _id: '$clientId',
        total: { $sum: 1 },
        harsh: { $sum: { $cond: [{ $eq: ['$spamStatus', 'harsh'] }, 1, 0] } },
        eligible: {
          $sum: {
            $cond: [
              {
                $and: [
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
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ];
}

export function promotePoolPipeline(clientId?: string): object[] {
  return [
    ...(clientId ? [{ $match: { clientId } }] : []),
    { $group: { _id: '$clientId', active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } },
  ];
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
