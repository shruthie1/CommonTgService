import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AnalyticsPgError, AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { TtlCache } from './monitor-cache';
import {
  bufferPoolPipeline,
  CohortRow,
  flattenCohort,
  mapTtfp,
  MONGO_MAX_TIME_MS,
  promotePoolPipeline,
  timeToFirstPayPipeline,
  userCohortPipeline,
} from './monitor-mongo';
import {
  clientChannelSendsSql,
  clientDailyClientSql,
  clientDmsDailySql,
  clientMobilesSql,
  clientPaymentsSql,
  clientSendsHourlySql,
  clientTopDmChannelsSql,
  fleetDailyClientSql,
  fleetDmsSql,
  fleetRevenueSql,
  fleetSendsIntradaySql,
  fleetSparkSql,
  Scope,
  SqlQuery,
} from './monitor-sql';
import {
  addDays,
  clientDaysRange,
  DateRange,
  datesBetween,
  istDate,
  istDayStart,
  istHour,
  MonitorPeriod,
  resolvePeriod,
} from './monitor-time';
import { historyNotes, maskMobile, maskPayload, num, ratio, withTimeout } from './monitor-util';

export const MONITOR_REDIS = 'MONITOR_REDIS';

/** The two read-only Redis commands the live view needs. */
export interface MonitorRedis {
  smembers(key: string): Promise<string[]>;
  mget(keys: string[]): Promise<Array<string | null>>;
}

export const PG_TIMEOUT_MS = 10_500;
export const MONGO_TIMEOUT_MS = 10_000;
export const LIVE_REDIS_DEADLINE_MS = 2_000;
export const FLEET_TTL_MS = 60_000;
export const CLIENT_TTL_MS = 60_000;
export const LIVE_TTL_MS = 5_000;
export const HEARTBEAT_INDEX_KEY = 'heartbeat::index';
export const LIVE_SVCS = ['tg-aut', 'promote'] as const;
export type LiveSvc = (typeof LIVE_SVCS)[number];

export interface Metrics {
  revenue: number | null;
  grossRevenue: number | null;
  flaggedRevenue: number | null;
  payers: number | null;
  newUsers: number | null;
  conversion: number | null;
  avgTicket: number | null;
  sends: number | null;
  sendSuccess: number | null;
  banned: number | null;
  dms: number | null;
}

export interface FleetClientRow {
  clientId: string;
  name: string | null;
  revenue: number | null;
  payers: number | null;
  newUsers: number | null;
  conversion: number | null;
  avgTicket: number | null;
  sends: number | null;
  sendSuccess: number | null;
  banned: number | null;
  dms: number | null;
  pool: { buffersEligible: number; buffersTotal: number; promoteActive: number } | null;
  spark: number[] | null;
  previous: { revenue: number | null; payers: number | null; newUsers: number | null; conversion: number | null };
}

/** clientId of the fleet-wide detail (/monitor/fleet/detail). Not a valid client cache key (has '*'). */
export const FLEET_DETAIL_ID = 'all';
const FLEET_DETAIL_KEY = '*fleet*';

/** The fleet row of a /monitor/fleet response in the shape of a per-client summary row. */
export function fleetSummaryRow(f: FleetResponse): FleetClientRow & { grossRevenue: number | null; flaggedRevenue: number | null } {
  const pools = f.clients.map((c) => c.pool);
  const sparks = f.clients.map((c) => c.spark);
  const pool = pools.length && pools.every((p) => p)
    ? pools.reduce(
        (a, p) => ({
          buffersEligible: a.buffersEligible + p!.buffersEligible,
          buffersTotal: a.buffersTotal + p!.buffersTotal,
          promoteActive: a.promoteActive + p!.promoteActive,
        }),
        { buffersEligible: 0, buffersTotal: 0, promoteActive: 0 },
      )
    : null;
  const spark = sparks.length && sparks.every((x) => x)
    ? sparks[0]!.map((_, i) => sparks.reduce((s, x) => s + (x![i] ?? 0), 0))
    : null;
  const m = f.fleet;
  return {
    clientId: FLEET_DETAIL_ID,
    name: 'All clients',
    revenue: m.revenue,
    grossRevenue: m.grossRevenue,
    flaggedRevenue: m.flaggedRevenue,
    payers: m.payers,
    newUsers: m.newUsers,
    conversion: m.conversion,
    avgTicket: m.avgTicket,
    sends: m.sends,
    sendSuccess: m.sendSuccess,
    banned: m.banned,
    dms: m.dms,
    pool,
    spark,
    previous: { revenue: f.previous.revenue, payers: f.previous.payers, newUsers: f.previous.newUsers, conversion: f.previous.conversion },
  };
}

export interface FleetResponse {
  generatedAt: string;
  period: MonitorPeriod;
  range: DateRange;
  previousRange: DateRange;
  fleet: Metrics;
  previous: Metrics;
  clients: FleetClientRow[];
  notes: string[];
  timingsMs: Record<string, number>;
}

export interface ClientMeta {
  clientId: string;
  name: string | null;
  promote: boolean;
}

interface LiveEntry {
  svc: LiveSvc;
  clientId: string;
  payload: Record<string, unknown> | null;
  parseError?: boolean;
}

interface LiveSnapshot {
  entries: LiveEntry[];
  notes: string[];
}

export interface LiveItem {
  svc: LiveSvc;
  clientId: string;
  state: 'live' | 'stopping' | 'stale' | 'no-heartbeat';
  ageSec: number | null;
  clockSkew?: boolean;
  [k: string]: unknown;
}

type Ctx = { notes: string[]; timings: Record<string, number> };

/** Live state from a heartbeat payload, measured on the CMS clock (live-state.md §6). */
export function classifyHeartbeat(
  payload: Record<string, unknown> | null,
  now: number,
): { state: LiveItem['state']; ageSec: number | null; clockSkew: boolean } {
  if (!payload) return { state: 'no-heartbeat', ageSec: null, clockSkew: false };
  const at = Number(payload.at);
  if (!Number.isFinite(at) || at <= 0) return { state: 'stale', ageSec: null, clockSkew: false };
  const clockSkew = at > now + 5_000;
  const ageSec = Math.max(0, Math.round((now - at) / 1000));
  const interval = Number(payload.intervalSec) > 0 ? Number(payload.intervalSec) : 30;
  if (payload.status === 'stopping' && ageSec <= 120) return { state: 'stopping', ageSec, clockSkew };
  if (ageSec <= 2 * interval + 10) return { state: 'live', ageSec, clockSkew };
  return { state: 'stale', ageSec, clockSkew };
}

const AMOUNT_BUCKETS: Array<{ bucket: string; lo: number; hi: number }> = [
  { bucket: '<100', lo: 0, hi: 100 },
  { bucket: '100-199', lo: 100, hi: 200 },
  { bucket: '200-299', lo: 200, hi: 300 },
  { bucket: '300-499', lo: 300, hi: 500 },
  { bucket: '500-999', lo: 500, hi: 1000 },
];

interface PayRow {
  ts: Date | string;
  chat_id: string;
  amount: number | string;
  owner_amount: number | string;
  cheat_flagged: boolean | null;
}

/** Owner revenue rule on one raw credit row. */
function credit(r: PayRow): { ms: number; chat: string; amount: number; revenue: number; gross: number; clean: boolean } {
  const amount = num(r.amount);
  const under = amount < 1000;
  return {
    ms: new Date(r.ts).getTime(),
    chat: String(r.chat_id),
    amount,
    gross: amount,
    revenue: under ? num(r.owner_amount) : 0,
    clean: under && r.cheat_flagged !== true,
  };
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);
  private readonly fleetCache = new TtlCache<FleetResponse>(FLEET_TTL_MS, 10);
  private readonly clientCache = new TtlCache<any>(CLIENT_TTL_MS, 100);
  private readonly liveCache = new TtlCache<LiveSnapshot>(LIVE_TTL_MS, 2);
  private readonly metaCache = new TtlCache<ClientMeta[]>(FLEET_TTL_MS, 1);

  constructor(
    private readonly pg: AnalyticsPgReader,
    @InjectConnection() private readonly connection: Connection,
    @Inject(MONITOR_REDIS) private readonly redis: MonitorRedis,
  ) {}

  // ---------------------------------------------------------------- data access

  private async pgRows<T = any>(q: SqlQuery, ctx: Ctx): Promise<T[]> {
    const t = Date.now();
    let err: AnalyticsPgError | undefined;
    try {
      const rows = await withTimeout(this.pg.query<T>(q.sql, q.params, (e) => (err = e)), PG_TIMEOUT_MS, q.name);
      if (!rows) throw new Error(`${err?.kind ?? 'query'}: ${err?.message ?? 'no rows'}`);
      return rows;
    } finally {
      ctx.timings[q.name] = Date.now() - t;
    }
  }

  private async mongoAgg<T = any>(collection: string, pipeline: object[], name: string, ctx: Ctx): Promise<T[]> {
    const t = Date.now();
    try {
      const cursor = this.connection
        .collection(collection)
        .aggregate(pipeline as any[], { maxTimeMS: MONGO_MAX_TIME_MS, readPreference: 'secondaryPreferred' } as any);
      return (await withTimeout(cursor.toArray(), MONGO_TIMEOUT_MS, name)) as T[];
    } finally {
      ctx.timings[name] = Date.now() - t;
    }
  }

  private async mongoFind<T = any>(collection: string, filter: object, projection: object, name: string, ctx: Ctx): Promise<T[]> {
    const t = Date.now();
    try {
      const cursor = this.connection
        .collection(collection)
        .find(filter as any, { projection, maxTimeMS: MONGO_MAX_TIME_MS, readPreference: 'secondaryPreferred' } as any);
      return (await withTimeout(cursor.toArray(), MONGO_TIMEOUT_MS, name)) as T[];
    } finally {
      ctx.timings[name] = Date.now() - t;
    }
  }

  /** Runs one section; a failure becomes null + a note, never a failed page. */
  private async section<T>(name: string, ctx: Ctx, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 200);
      ctx.notes.push(`${name} unavailable: ${msg}`);
      this.logger.warn(`monitor ${name} failed: ${msg}`);
      return null;
    }
  }

  private async clientMeta(ctx: Ctx): Promise<ClientMeta[]> {
    const hit = await this.metaCache.get('clients', async () => {
      const rows = await this.mongoFind<any>('clients', {}, { _id: 0, clientId: 1, name: 1, promoteRepl: 1 }, 'mongo.clients', ctx);
      return rows
        .filter((r) => r.clientId)
        .map((r) => ({ clientId: String(r.clientId), name: r.name ?? null, promote: !!r.promoteRepl }));
    });
    return hit.value;
  }

  // ---------------------------------------------------------------- fleet

  async fleet(period: MonitorPeriod): Promise<FleetResponse> {
    return (await this.fleetCache.get(period, () => this.buildFleet(period, Date.now()))).value;
  }

  async buildFleet(period: MonitorPeriod, now: number): Promise<FleetResponse> {
    const ctx: Ctx = { notes: [], timings: {} };
    const w = resolvePeriod(period, now);
    const sparkFrom = addDays(w.today, -6);

    const [meta, rev, spark, sendRows, dmsRows, cohorts, pool] = await Promise.all([
      this.section('clients', ctx, () => this.clientMeta(ctx)),
      this.section('revenue', ctx, () => this.pgRows(fleetRevenueSql(w.cur, w.prev), ctx)),
      this.section('spark', ctx, () => this.pgRows(fleetSparkSql(istDayStart(sparkFrom)), ctx)),
      this.section('sends', ctx, () =>
        this.pgRows(
          w.wholeDays
            ? fleetDailyClientSql(w.range.from, w.range.to, w.prevRange.from, w.prevRange.to)
            : fleetSendsIntradaySql(w.cur, w.prev),
          ctx,
        ),
      ),
      this.section('dms', ctx, () => this.pgRows(fleetDmsSql(w.cur, w.prev), ctx)),
      this.section('conversion', ctx, () => this.fleetCohorts(w, ctx)),
      this.section('pool', ctx, () => this.poolByClient(now, w.today, undefined, ctx)),
    ]);

    // ---- per-client maps
    const revBy = new Map<string, any>();
    let revTotal: any = null;
    for (const r of rev ?? []) {
      if (num(r.is_total) === 1) revTotal = r;
      else if (r.client_id) revBy.set(r.client_id, r);
    }
    const dmsBy = new Map<string, any>();
    let dmsTotal: any = null;
    for (const r of dmsRows ?? []) {
      if (num(r.is_total) === 1) dmsTotal = r;
      else if (r.client_id) dmsBy.set(r.client_id, r);
    }
    const sendsBy = new Map<string, any>((sendRows ?? []).filter((r) => r.client_id).map((r) => [r.client_id, r]));
    const sparkBy = new Map<string, Map<string, number>>();
    for (const r of spark ?? []) {
      if (!r.client_id) continue;
      if (!sparkBy.has(r.client_id)) sparkBy.set(r.client_id, new Map());
      sparkBy.get(r.client_id)!.set(r.d, num(r.revenue));
    }
    const sparkDates = datesBetween(sparkFrom, w.today);

    // newUsers: whole days from daily_client (tg-aut namespace); intraday from Mongo userData cohorts.
    const nuCur = (id: string | null): number | null => {
      if (w.wholeDays) return sendRows ? num(sendsBy.get(id)?.new_users) : null;
      return cohorts ? cohorts.cur.filter((c) => c.c === id).reduce((s, c) => s + c.n, 0) : null;
    };
    const nuPrev = (id: string | null): number | null => {
      if (w.wholeDays) return sendRows ? num(sendsBy.get(id)?.prev_new_users) : null;
      return cohorts ? cohorts.prev.filter((c) => c.c === id).reduce((s, c) => s + c.n, 0) : null;
    };
    const conv = (rows: CohortRow[] | undefined, id?: string): number | null => {
      if (!rows) return null;
      const sel = id === undefined ? rows : rows.filter((c) => c.c === id);
      return ratio(
        sel.reduce((s, c) => s + c.same, 0),
        sel.reduce((s, c) => s + c.n, 0),
      );
    };

    // userData docs are swept after 30 days idle: a previous window starting before that horizon
    // has only sparse survivors, so its conversion is unknown (null), never 0.
    const prevSwept = w.prevRange.from < addDays(w.today, -29);
    const prevCohorts = prevSwept ? undefined : cohorts?.prev;

    const metaBy = new Map((meta ?? []).map((m) => [m.clientId, m]));
    const ids = new Set<string>([...metaBy.keys(), ...revBy.keys(), ...sendsBy.keys(), ...dmsBy.keys()]);
    for (const c of cohorts?.cur ?? []) if (c.c) ids.add(c.c);

    const clients: FleetClientRow[] = [...ids].map((id) => {
      const r = revBy.get(id);
      const s = sendsBy.get(id);
      const d = dmsBy.get(id);
      const revenue = rev ? num(r?.revenue) : null;
      const payers = rev ? num(r?.payers) : null;
      const p = pool?.get(id);
      return {
        clientId: id,
        name: metaBy.get(id)?.name ?? null,
        revenue,
        payers,
        newUsers: nuCur(id),
        conversion: conv(cohorts?.cur, id),
        avgTicket: ratio(revenue, payers, 1),
        sends: sendRows ? num(s?.sent) : null,
        sendSuccess: sendRows ? num(s?.delivered) : null,
        banned: sendRows ? num(s?.banned) : null,
        dms: dmsRows ? num(d?.dms) : null,
        pool: pool ? { buffersEligible: p?.eligible ?? 0, buffersTotal: p?.total ?? 0, promoteActive: p?.promoteActive ?? 0 } : null,
        spark: spark ? sparkDates.map((dt) => sparkBy.get(id)?.get(dt) ?? 0) : null,
        previous: {
          revenue: rev ? num(r?.prev_revenue) : null,
          payers: rev ? num(r?.prev_payers) : null,
          newUsers: nuPrev(id),
          conversion: conv(prevCohorts, id),
        },
      };
    });
    clients.sort((a, b) => (b.revenue ?? -1) - (a.revenue ?? -1) || a.clientId.localeCompare(b.clientId));

    const sumSends = (k: string): number | null => (sendRows ? sendRows.reduce((s, r) => s + num(r[k]), 0) : null);
    const allCohort = (rows?: CohortRow[]) => (rows ? rows.reduce((s, c) => s + c.n, 0) : null);
    const totals = (prefix: '' | 'prev_'): Metrics => {
      const revenue = rev ? num(revTotal?.[`${prefix}revenue`]) : null;
      const gross = rev ? num(revTotal?.[`${prefix}gross`]) : null;
      const payers = rev ? num(revTotal?.[`${prefix}payers`]) : null;
      const cur = prefix === '';
      return {
        revenue,
        grossRevenue: gross,
        flaggedRevenue: revenue === null ? null : gross - revenue,
        payers,
        newUsers: w.wholeDays ? sumSends(`${prefix}new_users`) : allCohort(cur ? cohorts?.cur : cohorts?.prev),
        conversion: conv(cur ? cohorts?.cur : prevCohorts),
        avgTicket: ratio(revenue, payers, 1),
        sends: sumSends(`${prefix}sent`),
        sendSuccess: sumSends(`${prefix}delivered`),
        banned: sumSends(`${prefix}banned`),
        dms: dmsRows ? num(dmsTotal?.[`${prefix}dms`]) : null,
      };
    };

    const notes = [...historyNotes([w.range, w.prevRange]), ...ctx.notes];
    if (!w.wholeDays) {
      notes.push(
        `previous = yesterday 00:00 to ${new Date(w.prev.end + 19_800_000).toISOString().slice(11, 16)} IST; today's sends come from promotion_send and new users/conversion from Mongo userData.`,
      );
    }
    if (prevSwept) {
      notes.push(
        'previous.conversion is null: the previous window is older than ~30 days and userData docs are swept after 30 days idle. Current-window days older than ~30 days may also undercount.',
      );
    }
    return {
      generatedAt: new Date(now).toISOString(),
      period,
      range: w.range,
      previousRange: w.prevRange,
      fleet: totals(''),
      previous: totals('prev_'),
      clients,
      notes,
      timingsMs: ctx.timings,
    };
  }

  /** Mongo userData cohorts for the current and previous windows of a period. */
  private async fleetCohorts(w: ReturnType<typeof resolvePeriod>, ctx: Ctx): Promise<{ cur: CohortRow[]; prev: CohortRow[] }> {
    if (w.wholeDays) {
      const rows = flattenCohort(
        await this.mongoAgg('userData', userCohortPipeline({ start: w.prev.start, end: w.cur.end }), 'mongo.userData_cohorts', ctx),
      );
      return {
        cur: rows.filter((r) => r.d >= w.range.from && r.d <= w.range.to),
        prev: rows.filter((r) => r.d >= w.prevRange.from && r.d <= w.prevRange.to),
      };
    }
    const [cur, prev] = await Promise.all([
      this.mongoAgg('userData', userCohortPipeline({ start: w.cur.start, end: w.cur.end }), 'mongo.userData_cohorts_today', ctx),
      this.mongoAgg(
        'userData',
        userCohortPipeline({ start: w.prev.start, end: w.prev.end, paidBefore: w.prev.end }),
        'mongo.userData_cohorts_yday_same_time',
        ctx,
      ),
    ]);
    return { cur: flattenCohort(cur), prev: flattenCohort(prev) };
  }

  private async poolByClient(
    now: number,
    today: string,
    clientId: string | undefined,
    ctx: Ctx,
  ): Promise<Map<string, { total: number; eligible: number; harsh: number; promoteActive: number }>> {
    const [buf, prom] = await Promise.all([
      this.mongoAgg('bufferClients', bufferPoolPipeline(now, today, clientId), 'mongo.bufferClients_pool', ctx),
      this.mongoAgg('promoteClients', promotePoolPipeline(clientId), 'mongo.promoteClients_pool', ctx),
    ]);
    const out = new Map<string, { total: number; eligible: number; harsh: number; promoteActive: number }>();
    const get = (id: string) => {
      if (!out.has(id)) out.set(id, { total: 0, eligible: 0, harsh: 0, promoteActive: 0 });
      return out.get(id)!;
    };
    for (const b of buf) if (b._id) Object.assign(get(b._id), { total: num(b.total), eligible: num(b.eligible), harsh: num(b.harsh) });
    for (const p of prom) if (p._id) get(p._id).promoteActive = num(p.active);
    return out;
  }

  // ---------------------------------------------------------------- client

  async client(clientId: string, days: 7 | 30): Promise<any> {
    return (await this.clientCache.get(`${clientId}:${days}`, () => this.buildClient(clientId, days, Date.now()))).value;
  }

  /** Same shape as client detail, aggregated over every client (clientId 'all'). */
  async fleetDetail(days: 7 | 30): Promise<any> {
    return (await this.clientCache.get(`${FLEET_DETAIL_KEY}:${days}`, () => this.buildFleetDetail(days, Date.now()))).value;
  }

  async buildClient(clientId: string, days: 7 | 30, now: number): Promise<any> {
    return this.buildDetail(clientId, days, now);
  }

  async buildFleetDetail(days: 7 | 30, now: number): Promise<any> {
    return this.buildDetail(null, days, now);
  }

  /** Client detail for one client, or for the whole fleet when `scope` is null. */
  private async buildDetail(scope: Scope, days: 7 | 30, now: number): Promise<any> {
    const ctx: Ctx = { notes: [], timings: {} };
    const fleetScope = scope === null;
    const clientId = scope ?? FLEET_DETAIL_ID;
    const mongoClient = scope ?? undefined;
    const r = clientDaysRange(days, now);
    const today = r.to;
    const yday = addDays(today, -1);
    const yday0 = istDayStart(yday);
    const payStart = Math.min(r.start, yday0);
    const tag = fleetScope ? 'fleet' : 'client';

    const [meta, fleet, payRows, dcRows, dmsRows, psHourly, mobileRows, channelRows, cohortDaily, cohortHourly, ttfpRows, pool] =
      await Promise.all([
        this.section('clients', ctx, () => this.clientMeta(ctx)),
        this.section('summary', ctx, () => this.fleet(days === 7 ? '7d' : '30d')),
        this.section('payments', ctx, () => this.pgRows<PayRow>(clientPaymentsSql(scope, payStart), ctx)),
        this.section('daily_client', ctx, () => this.pgRows(clientDailyClientSql(scope, r.from), ctx)),
        this.section('dms', ctx, () => this.pgRows(clientDmsDailySql(scope, r.start), ctx)),
        this.section('hourly_sends', ctx, () => this.pgRows(clientSendsHourlySql(scope, yday0), ctx)),
        this.section('mobiles', ctx, () => this.pgRows(clientMobilesSql(scope, r.from), ctx)),
        this.section('channels', ctx, () => this.topChannels(scope, r.start, { from: r.from, today, todayStart: istDayStart(today) }, ctx)),
        this.section('conversion', ctx, async () =>
          flattenCohort(
            await this.mongoAgg('userData', userCohortPipeline({ start: r.start, end: now, clientId: mongoClient }), `mongo.userData_cohorts_${tag}`, ctx),
          ),
        ),
        this.section('hourly_new_users', ctx, async () =>
          flattenCohort(
            await this.mongoAgg(
              'userData',
              userCohortPipeline({ start: yday0, end: now, clientId: mongoClient, byHour: true }),
              `mongo.userData_hourly_${tag}`,
              ctx,
            ),
          ),
        ),
        this.section('time_to_first_pay', ctx, () =>
          this.mongoAgg('userData', timeToFirstPayPipeline(mongoClient, r.start, now), `mongo.userData_ttfp_${tag}`, ctx),
        ),
        this.section('pool', ctx, () => this.poolByClient(now, today, mongoClient, ctx)),
      ]);

    const credits = (payRows ?? []).map(credit);
    const inRange = credits.filter((c) => c.ms >= r.start && c.ms < now);

    // ---- daily
    const dcBy = new Map((dcRows ?? []).map((x) => [x.d, x]));
    const dmsBy = new Map((dmsRows ?? []).map((x) => [x.d, num(x.dms)]));
    // fleet cohorts have one row per (client, day): pool numerators and denominators per day.
    const cohortBy = new Map<string, { n: number; same: number }>();
    for (const x of cohortDaily ?? []) {
      const e = cohortBy.get(x.d) ?? { n: 0, same: 0 };
      e.n += x.n;
      e.same += x.same;
      cohortBy.set(x.d, e);
    }
    const daily = datesBetween(r.from, r.to).map((date) => {
      const dayCredits = inRange.filter((c) => istDate(c.ms) === date);
      const revenue = payRows ? dayCredits.reduce((s, c) => s + c.revenue, 0) : null;
      const dc = dcBy.get(date);
      const co = cohortBy.get(date);
      return {
        date,
        revenue,
        grossRevenue: payRows ? dayCredits.reduce((s, c) => s + c.gross, 0) : null,
        payers: payRows ? new Set(dayCredits.filter((c) => c.clean).map((c) => c.chat)).size : null,
        newUsers: dcRows ? num(dc?.new_users) : null,
        conversion: cohortDaily ? ratio(co?.same ?? 0, co?.n ?? 0) : null,
        sends: dcRows ? num(dc?.sent) : null,
        sendSuccess: dcRows ? num(dc?.delivered) : null,
        banned: dcRows ? num(dc?.banned) : null,
        dms: dmsRows ? (dmsBy.get(date) ?? 0) : null,
      };
    });

    // ---- hourly today / yesterday
    const sendsHourBy = new Map((psHourly ?? []).map((x) => [`${x.d}:${num(x.h)}`, num(x.sent)]));
    const nuHourBy = new Map<string, number>();
    for (const c of cohortHourly ?? []) nuHourBy.set(`${c.d}:${c.h}`, (nuHourBy.get(`${c.d}:${c.h}`) ?? 0) + c.n);
    const hourly = (date: string) =>
      Array.from({ length: 24 }, (_, hour) => {
        const hc = credits.filter((c) => istDate(c.ms) === date && istHour(c.ms) === hour);
        return {
          hour,
          revenue: payRows ? hc.reduce((s, c) => s + c.revenue, 0) : null,
          payers: payRows ? new Set(hc.filter((c) => c.clean).map((c) => c.chat)).size : null,
          newUsers: cohortHourly ? (nuHourBy.get(`${date}:${hour}`) ?? 0) : null,
          sends: psHourly ? (sendsHourBy.get(`${date}:${hour}`) ?? 0) : null,
        };
      });

    // ---- distributions over the page range (credited = clean credits under ₹1,000)
    const clean = inRange.filter((c) => c.clean);
    const amount = payRows
      ? AMOUNT_BUCKETS.map((b) => {
          const inB = clean.filter((c) => c.amount >= b.lo && c.amount < b.hi);
          return { bucket: b.bucket, count: inB.length, revenue: inB.reduce((s, c) => s + c.revenue, 0) };
        })
      : null;
    const hourOfDay = payRows
      ? Array.from({ length: 24 }, (_, hour) => {
          const hc = clean.filter((c) => istHour(c.ms) === hour);
          return { hour, revenue: hc.reduce((s, c) => s + c.revenue, 0), payers: new Set(hc.map((c) => c.chat)).size };
        })
      : null;
    let repeat: { oneTime: number; repeat: number; repeatRevenueShare: number | null } | null = null;
    if (payRows) {
      const byChat = new Map<string, { days: Set<string>; revenue: number }>();
      for (const c of clean) {
        const e = byChat.get(c.chat) ?? { days: new Set<string>(), revenue: 0 };
        e.days.add(istDate(c.ms));
        e.revenue += c.revenue;
        byChat.set(c.chat, e);
      }
      let one = 0;
      let rep = 0;
      let repRev = 0;
      let totRev = 0;
      for (const e of byChat.values()) {
        totRev += e.revenue;
        if (e.days.size > 1) {
          rep += 1;
          repRev += e.revenue;
        } else one += 1;
      }
      repeat = { oneTime: one, repeat: rep, repeatRevenueShare: ratio(repRev, totRev) };
    }
    let timeToFirstPay: Array<{ bucket: string; count: number }> | null = null;
    if (ttfpRows) {
      const m = mapTtfp(ttfpRows);
      timeToFirstPay = m.buckets;
      if (m.negative) ctx.notes.push(`timeToFirstPay: ${m.negative} first payment(s) predate their userData doc (doc recreated) and are excluded.`);
    }

    // ---- mobiles, channels, pool
    const mobiles = mobileRows
      ? mobileRows.map((m) => ({
          mobile: maskMobile(m.mobile),
          ...(fleetScope ? { clientId: m.client_id ?? null } : {}),
          newUsers: num(m.new_users),
          sends: num(m.sent),
          sendSuccess: num(m.delivered),
          banned: num(m.banned),
          dms: num(m.dms),
          firstDay: m.first_day,
          lastDay: m.last_day,
        }))
      : null;
    let channels: Array<{ title: string; sends: number; dms: number; dmPerSend: number | null }> | null = null;
    if (channelRows) {
      const titles = (await this.section('channel_titles', ctx, () => this.channelTitles(channelRows.map((c) => String(c.channel_id)), ctx))) ?? new Map();
      channels = channelRows.map((c) => {
        const id = String(c.channel_id);
        return {
          title: titles.get(id) ?? `channel …${id.slice(-4)}`,
          sends: num(c.sent),
          dms: num(c.dms),
          dmPerSend: ratio(num(c.dms), num(c.sent)),
        };
      });
    }
    const poolAll = { eligible: 0, total: 0, harsh: 0, promoteActive: 0 };
    for (const v of pool?.values() ?? []) {
      poolAll.eligible += v.eligible;
      poolAll.total += v.total;
      poolAll.harsh += v.harsh;
      poolAll.promoteActive += v.promoteActive;
    }
    const p = fleetScope ? poolAll : pool?.get(clientId);
    const metaRow = fleetScope ? undefined : meta?.find((m) => m.clientId === clientId);
    const summary = fleetScope
      ? fleet
        ? fleetSummaryRow(fleet)
        : null
      : (fleet?.clients.find((c) => c.clientId === clientId) ?? null);

    const notes = [...historyNotes([r, ...(fleet ? [fleet.previousRange] : [])], { mobiles: true }), ...ctx.notes];
    if (!fleetScope && meta && !metaRow) notes.push(`clientId ${clientId} is not in the clients collection.`);
    notes.push(`daily covers ${r.from}..${r.to} IST; the last row (today) is partial. summary = ${days} complete IST days ending yesterday (same row as /monitor/fleet?period=${days}d${fleetScope ? ', fleet totals' : ''}).`);
    if (fleetScope) {
      notes.push('channels = top 20 fleet-wide by attributed DMs (conversion_event, incl. DMs without a client before 2026-10-26); channels with sends but no DMs are not listed.');
      notes.push('mobiles = top 20 accounts fleet-wide by tg-aut new users; clientId = the client that owned the mobile on its last day in range.');
    } else {
      notes.push('channels = top 20 by attributed DMs (conversion_event); channels with sends but no DMs are not listed.');
    }
    notes.push('mobiles[].dms = first DMs to that account as a promote account (daily_mobile promote-clients new_users), not attributed conversion_event DMs.');

    return {
      clientId,
      name: fleetScope ? 'All clients' : (metaRow?.name ?? null),
      generatedAt: new Date(now).toISOString(),
      days,
      range: { from: r.from, to: r.to },
      summary,
      daily,
      hourly: { today: hourly(today), yesterday: hourly(yday) },
      distributions: { amount, hourOfDay, timeToFirstPay, repeat },
      mobiles,
      channels,
      pool: pool ? { buffersEligible: p?.eligible ?? 0, buffersTotal: p?.total ?? 0, harsh: p?.harsh ?? 0, promoteActive: p?.promoteActive ?? 0 } : null,
      notes,
      timingsMs: ctx.timings,
    };
  }

  /** Top channels by attributed DMs, then their sends (client: promotion_send index; fleet: daily_channel + today raw). */
  private async topChannels(
    clientId: Scope,
    start: number,
    days: { from: string; today: string; todayStart: number },
    ctx: Ctx,
  ): Promise<Array<{ channel_id: string; sent: number; dms: number }>> {
    const top = await this.pgRows(clientTopDmChannelsSql(clientId, start), ctx);
    if (!top.length) return [];
    const ids = top.map((t) => String(t.channel_id));
    const sends = await this.pgRows(clientChannelSendsSql(clientId, start, ids, clientId === null ? days : undefined), ctx);
    const rolledTo = sends.find((x) => x.rolled_to)?.rolled_to;
    const yday = addDays(days.today, -1);
    if (clientId === null && rolledTo && rolledTo < yday) {
      ctx.notes.push(`channels[].sends: daily_channel is rolled up only to ${rolledTo}; sends for ${addDays(rolledTo, 1)}..${yday} are missing.`);
    }
    const sentBy = new Map(sends.map((x) => [String(x.channel_id), num(x.sent)]));
    return top.map((t) => ({ channel_id: String(t.channel_id), dms: num(t.dms), sent: sentBy.get(String(t.channel_id)) ?? 0 }));
  }

  /** Channel titles from activeChannels, then channels; ids tried as stored and without/with the -100 prefix. */
  private async channelTitles(ids: string[], ctx: Ctx): Promise<Map<string, string>> {
    const variants = (id: string) => {
      const bare = id.replace(/^-100/, '');
      return [...new Set([id, bare, `-100${bare}`])];
    };
    const all = [...new Set(ids.flatMap(variants))];
    const out = new Map<string, string>();
    for (const coll of ['activeChannels', 'channels']) {
      const missing = ids.filter((id) => !out.has(id));
      if (!missing.length) break;
      const rows = await this.mongoFind<any>(coll, { channelId: { $in: all } }, { _id: 0, channelId: 1, title: 1 }, `mongo.${coll}_titles`, ctx);
      const byId = new Map(rows.filter((x) => x.title).map((x) => [String(x.channelId), String(x.title)]));
      for (const id of missing) {
        const t = variants(id).map((v) => byId.get(v)).find(Boolean);
        if (t) out.set(id, t);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- live

  async live(svc: LiveSvc | 'all'): Promise<{
    generatedAt: string;
    redis: 'ok' | 'unavailable';
    stale: boolean;
    cacheAgeSec: number | null;
    items: LiveItem[];
    notes: string[];
  }> {
    let redis: 'ok' | 'unavailable' = 'ok';
    let stale = false;
    const notes: string[] = [];
    let hit = undefined as { value: LiveSnapshot; at: number } | undefined;
    try {
      hit = await this.liveCache.get('all', () => this.loadLive());
    } catch (err) {
      redis = 'unavailable';
      stale = true;
      hit = this.liveCache.last('all');
      notes.push(`redis unavailable: ${String((err as Error)?.message ?? err).slice(0, 160)}${hit ? '; serving last snapshot' : ''}`);
    }
    const now = Date.now();
    const items: LiveItem[] = (hit?.value.entries ?? [])
      .filter((e) => svc === 'all' || e.svc === svc)
      .map((e) => {
        const c = classifyHeartbeat(e.payload, now);
        const masked = (e.payload ? maskPayload(e.payload) : {}) as Record<string, unknown>;
        const item: LiveItem = { ...masked, svc: e.svc, clientId: e.clientId, state: c.state, ageSec: c.ageSec };
        if (c.clockSkew) item.clockSkew = true;
        if (e.parseError) item.parseError = true;
        return item;
      });
    return {
      generatedAt: new Date(now).toISOString(),
      redis,
      stale,
      cacheAgeSec: hit ? Math.max(0, Math.round((now - hit.at) / 1000)) : null,
      items,
      notes: [...(hit?.value.notes ?? []), ...notes],
    };
  }

  /** One SMEMBERS + one MGET within a 2 s deadline. Throws on Redis failure (caller serves the last snapshot). */
  private async loadLive(): Promise<LiveSnapshot> {
    const ctx: Ctx = { notes: [], timings: {} };
    const meta = await this.section('clients', ctx, () => this.clientMeta(ctx));
    const redisPart = async () => {
      const members = await this.redis.smembers(HEARTBEAT_INDEX_KEY);
      const keys = new Map<string, { svc: LiveSvc; clientId: string }>();
      const add = (svc: string, clientId: string) => {
        if (!(LIVE_SVCS as readonly string[]).includes(svc) || !clientId) return;
        keys.set(`heartbeat::${svc}::${clientId}`, { svc: svc as LiveSvc, clientId });
      };
      for (const m of meta ?? []) {
        add('tg-aut', m.clientId);
        if (m.promote) add('promote', m.clientId);
      }
      for (const member of members ?? []) {
        const i = member.indexOf('::');
        if (i > 0) add(member.slice(0, i), member.slice(i + 2));
      }
      const keyList = [...keys.keys()];
      const values = keyList.length ? await this.redis.mget(keyList) : [];
      return keyList.map((k, i) => ({ ...keys.get(k)!, raw: values[i] ?? null }));
    };
    const rows = await withTimeout(redisPart(), LIVE_REDIS_DEADLINE_MS, 'redis heartbeat read');
    const entries: LiveEntry[] = rows.map((r) => {
      if (r.raw === null) return { svc: r.svc, clientId: r.clientId, payload: null };
      try {
        const parsed = JSON.parse(r.raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { svc: r.svc, clientId: r.clientId, payload: parsed };
      } catch {
        /* fall through */
      }
      return { svc: r.svc, clientId: r.clientId, payload: { at: null }, parseError: true };
    });
    entries.sort((a, b) => a.svc.localeCompare(b.svc) || a.clientId.localeCompare(b.clientId));
    return { entries, notes: ctx.notes };
  }
}

