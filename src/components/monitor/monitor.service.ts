import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AnalyticsPgError, AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { CacheState, ConcurrencyGate, SnapshotCache, SnapshotResult, SnapshotSource, SnapshotStore, SwrCache, TtlCache } from './monitor-cache';
import {
  addBuckets,
  Credit,
  dailyClientByDate,
  DailyClientRow,
  distinctDms,
  dmsByChannel,
  dmsByDate,
  DmsDayRow,
  DmRow,
  mergeMobiles,
  MobileRow,
  PayRow,
  rankChannels,
  revenueBy,
  revenueByClientDay,
  sumDailyClient,
  sumDmsDays,
  toCredit,
} from './monitor-merge';
import {
  ByFamily,
  byFamily,
  byFamilyOfDate,
  dmsFamilyByDate,
  dmsFamilyDays,
  dmsFamilyRows,
  FamSend,
  FamSplit,
  Family,
  sendsByFamily,
  sendsByFamilyDate,
} from './monitor-family';
import {
  buildPromotions,
  funnelOrigins,
  extrasFromToday,
  heartbeatJoins,
  histBounds,
  PromoWindow,
  promoWindows,
  readBatch,
  redisBatch,
  rowsFromHist,
  rowsFromSends,
  RouteState,
  SpamState,
} from './monitor-promotions';
import {
  buildReactions,
  reactDaily,
  ReactLive,
  reactRedisBatch,
  reactRowsFromHist,
  reactRowsFromToday,
  ReactWindow,
  readReactBatch,
  readRestrictedChannels,
  restrictedChannelsPipeline,
  yesterdayTotals,
} from './monitor-reactions';
import {
  bufferPoolPipeline,
  CohortRow,
  flattenCohort,
  mapTtfp,
  MONGO_MAX_TIME_MS,
  promotePoolPipeline,
  firstPayRowsPipeline,
  FirstPayRow,
  ttfpBuckets,
  userCohortPipeline,
} from './monitor-mongo';
import {
  channelDmsHistSql,
  channelSendsHistSql,
  channelSendsTodaySql,
  dailyClientSql,
  dmRowsSql,
  dmsByDaySql,
  mobilesSql,
  paidChatsSql,
  paidOriginSql,
  paymentRowsSql,
  promoMobilesHistSql,
  promoMobilesTodaySql,
  promoSendsSql,
  routedColumnsSql,
  routedDailySql,
  sendsHourlySql,
  sendsLiveSql,
  SqlQuery,
} from './monitor-sql';
import {
  addDays,
  clientDaysRange,
  DateRange,
  datesBetween,
  DAY_MS,
  istDate,
  istDayStart,
  istHour,
  MonitorPeriod,
  resolvePeriod,
} from './monitor-time';
import { FAMILY_DMS_FROM, historyNotes, maskMobile, maskPayload, num, ratio, REVENUE_HISTORY_FROM, withTimeout } from './monitor-util';

export const MONITOR_REDIS = 'MONITOR_REDIS';

/**
 * Redis commands the monitor uses: SMEMBERS + MGET (live view, read-only) and, optionally, GET / SET
 * on its own `monitor::snapshot::<name>` keys (last response snapshots, so a restart serves at once).
 */
export interface MonitorRedis {
  smembers(key: string): Promise<string[]>;
  mget(keys: string[]): Promise<Array<string | null>>;
  get?(key: string): Promise<string | null>;
  set?(key: string, value: string, mode: 'EX', ttlSec: number): Promise<unknown>;
  /** Read-only batch (one round trip): results in order, null for a failed command. Optional. */
  readPipeline?(cmds: Array<[RedisReadCmd, string, ...Array<string | number>]>): Promise<unknown[]>;
}

/** Read-only commands only (ZCOUNT for the reactions::hourly / floods windows). */
export type RedisReadCmd = 'hgetall' | 'hlen' | 'zcard' | 'zcount';

export const PG_TIMEOUT_MS = 10_500;
export const MONGO_TIMEOUT_MS = 10_000;
export const LIVE_REDIS_DEADLINE_MS = 2_000;
/** Today's part: served fresh for 60 s, then stale-while-revalidate. */
export const TODAY_FRESH_MS = 60_000;
/** A today value older than this is not served even as stale (refresh failing for 15 min). */
export const TODAY_MAX_STALE_MS = 15 * 60_000;
/** Closed-day history: valid until the next IST midnight, refreshed in the background after 10 min (late sink rows, 00:35 IST rollup). */
export const HISTORY_FRESH_MS = 10 * 60_000;
/** Pool counts (Mongo bufferClients + promoteClients, ~750 docs): fresh for 10 min. */
export const POOL_FRESH_MS = 10 * 60_000;
/** History depth: the 30d period's current + previous windows. */
export const HISTORY_DAYS = 60;
/** Channels whose closed-day sends are fetched (stable all day: ranked by history DMs). */
export const CHANNEL_CANDIDATES = 40;
export const LIVE_TTL_MS = 5_000;
/** activeChannels.reactRestricted counts: served for up to 1 h, then refreshed in the background. */
export const RESTRICTED_FRESH_MS = 60 * 60_000;
/** Whole responses: served fresh for 60 s, then served at once while one background rebuild runs (same IST day). */
export const SNAPSHOT_FRESH_MS = TODAY_FRESH_MS;
/** Redis key prefix of the persisted snapshots (one key per page: fleet:today, detail:all:7, client:<id>:30, ...). */
export const SNAPSHOT_KEY_PREFIX = 'monitor::snapshot::';
/** Redis TTL of a snapshot: 36 h, so a boot can tell the monitor was used since yesterday. */
export const SNAPSHOT_TTL_SEC = 36 * 3600;
/** Boot prewarm delay (the app finishes starting first). Negative = no prewarm. */
export const PREWARM_DELAY_MS = 5_000;
/** After each IST midnight the day's snapshots are rebuilt once, this long after 00:00. */
export const MIDNIGHT_PREWARM_AFTER_MS = 2 * 60_000;
/** Pages rebuilt by the prewarm (they share every fleet-wide part). */
export const PREWARM_PAGES = ['fleet:today', 'fleet:7d', 'fleet:30d', 'detail:all:7', 'detail:all:30'] as const;
/** @deprecated kept for callers of the old names; see TODAY_FRESH_MS. */
export const FLEET_TTL_MS = TODAY_FRESH_MS;
export const CLIENT_TTL_MS = TODAY_FRESH_MS;
export const HEARTBEAT_INDEX_KEY = 'heartbeat::index';
export const LIVE_SVCS = ['tg-aut', 'promote'] as const;
export type LiveSvc = (typeof LIVE_SVCS)[number];

/** Paid chats: closed days are fixed once written (late sink rows aside), so up to 30 days are kept. */
export const PAID_HIST_KEYS = 30;
/** Max chat ids sent to the one userData username lookup per request. */
export const PAID_ENRICH_MAX = 1000;

/** One chat credited on the requested IST day (one row per clientId + chatId). */
export interface PaidChat {
  clientId: string;
  chatId: string;
  profile: string;
  username: string | null;
  credits: number;
  amount: number;
  ownerAmount: number;
  cheatFlagged: boolean;
  firstCreditAt: string;
  lastCreditAt: string;
}

export interface PaidChatsResponse {
  date: string;
  tz: 'Asia/Kolkata';
  clientId: string | null;
  asOf: number;
  source: 'payment_event';
  chats: PaidChat[];
  totals: { chats: number; credits: number; amount: number; ownerAmount: number };
  notes: string[];
}

interface PaidChatPgRow {
  client_id: string;
  chat_id: string;
  persona_id: string | null;
  credits: unknown;
  amount: unknown;
  owner_amount: unknown;
  cheat_flagged: boolean | null;
  first_at: Date | string;
  last_at: Date | string;
}

const isoOf = (v: Date | string) => new Date(v as any).toISOString();

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
  /** Additive (2026-10-29): the sends/DMs split by family; merged fields above are the sums (plus rows with no family). */
  byFamily?: ByFamily;
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
  /** Additive (2026-10-29): sends/DMs per family for this client. */
  byFamily?: ByFamily;
}

/**
 * How the response was served (additive). history/today = worst state over the parts used ('miss' =
 * this request waited for a load, 'stale' = served the previous value while one background refresh
 * runs, 'hit' = fresh); null when the response has no part of that kind. ageSec / historyAgeSec = age
 * of the oldest part served.
 */
export interface CacheInfo {
  history: CacheState | null;
  today: CacheState | null;
  ageSec: number | null;
  historyAgeSec: number | null;
  /** Whole-response snapshot (additive): 'hit' fresh, 'stale' served while one rebuild runs, 'miss' built for this request. */
  snapshot?: CacheState;
  /** Where the served snapshot came from: 'memory', 'store' (Redis, e.g. after a restart) or 'build'. */
  snapshotSource?: SnapshotSource;
  /** Seconds since the served snapshot was built (its generatedAt). */
  snapshotAgeSec?: number;
}

/** clientId of the fleet-wide detail (/monitor/fleet/detail). */
export const FLEET_DETAIL_ID = 'all';

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
    ...(m.byFamily ? { byFamily: m.byFamily } : {}),
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
  cache: CacheInfo;
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
  /** Member of heartbeat::index (the process registered itself); false = expected from the clients collection only. */
  indexed: boolean;
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
  /** Additive (2026-10-29): the process is in heartbeat::index (false = listed from the clients collection only). */
  indexed?: boolean;
  [k: string]: unknown;
}

type Part = 'history' | 'today';

interface CacheTrack {
  state: CacheState;
  at: number;
}

class Ctx {
  /** true = a background snapshot rebuild: stale parts are refreshed and awaited, at background priority. */
  constructor(readonly background = false) {}
  notes: string[] = [];
  timings: Record<string, number> = {};
  history: CacheTrack | null = null;
  today: CacheTrack | null = null;

  track(kind: Part, state: CacheState, at: number): void {
    const cur = this[kind];
    const rank = { hit: 0, stale: 1, miss: 2 } as const;
    if (!cur) this[kind] = { state, at };
    else this[kind] = { state: rank[state] > rank[cur.state] ? state : cur.state, at: Math.min(at, cur.at) };
  }

  merge(info: CacheInfo, now: number): void {
    if (info.history) this.track('history', info.history, now - (info.historyAgeSec ?? 0) * 1000);
    if (info.today) this.track('today', info.today, now - (info.ageSec ?? 0) * 1000);
  }

  cache(now: number): CacheInfo {
    const age = (t: CacheTrack | null) => (t ? Math.max(0, Math.round((now - t.at) / 1000)) : null);
    return { history: this.history?.state ?? null, today: this.today?.state ?? null, ageSec: age(this.today), historyAgeSec: age(this.history) };
  }
}

/** What a cached part holds: its value, the instant its load started, and its component timings. */
interface Loaded<T> {
  value: T;
  asOf: number;
  timings: Record<string, number>;
}

/** Today parts carry the instant they were read up to. */
interface AsOf<T> {
  asOf: number;
  rows: T;
}

/**
 * The served copy of a page snapshot. A snapshot served later than its build ('hit' / 'stale') has
 * its part ages advanced by the snapshot's age and its part states re-derived from those ages
 * (today parts fresh for 60 s, history for 10 min). Additive: snapshot, snapshotSource, snapshotAgeSec.
 */
export function withSnapshotCache<T extends { cache: CacheInfo }>(r: SnapshotResult<T>, now: number): T {
  const ageSec = Math.max(0, Math.round((now - r.at) / 1000));
  const c: CacheInfo = r.value?.cache ?? { history: null, today: null, ageSec: null, historyAgeSec: null };
  const snapshot = { snapshot: r.state, snapshotSource: r.source, snapshotAgeSec: ageSec };
  if (r.state === 'miss') return { ...r.value, cache: { ...c, ...snapshot } };
  const age = (a: number | null) => (a === null ? null : a + ageSec);
  const state = (s: CacheState | null, a: number | null, freshMs: number): CacheState | null =>
    s === null ? null : a !== null && a * 1000 < freshMs ? 'hit' : 'stale';
  const todayAge = age(c.ageSec);
  const histAge = age(c.historyAgeSec);
  return {
    ...r.value,
    cache: {
      history: state(c.history, histAge, HISTORY_FRESH_MS),
      today: state(c.today, todayAge, TODAY_FRESH_MS),
      ageSec: todayAge,
      historyAgeSec: histAge,
      ...snapshot,
    },
  };
}

/** Postgres paid-chats row -> API row (username filled in later). */
export function toPaidChat(r: PaidChatPgRow): PaidChat {
  const clientId = String(r.client_id);
  return {
    clientId,
    chatId: String(r.chat_id),
    profile: r.persona_id ? String(r.persona_id) : clientId.replace(/\d+$/, ''),
    username: null,
    credits: num(r.credits),
    amount: num(r.amount),
    ownerAmount: num(r.owner_amount),
    cheatFlagged: r.cheat_flagged === true,
    firstCreditAt: isoOf(r.first_at),
    lastCreditAt: isoOf(r.last_at),
  };
}

/** Live state from a heartbeat payload, measured on the CMS clock (live-state.md §6). */
export function classifyHeartbeat(
  payload: Record<string, unknown> | null,
  now: number,
): { state: LiveItem['state']; ageSec: number | null; clockSkew: boolean } {
  if (!payload) return { state: 'no-heartbeat', ageSec: null, clockSkew: false };
  // tg-platform heartbeat envelope v1 stamps `ts` (Date.now()); `at` kept for older writers.
  const at = Number(payload.ts ?? payload.at);
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

type Pool = Map<string, { total: number; eligible: number; harsh: number; promoteActive: number }>;

@Injectable()
export class MonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorService.name);
  private readonly historyCache = new SwrCache<Loaded<any>>({
    freshMs: HISTORY_FRESH_MS,
    maxKeys: 300,
    onBackgroundError: (key, err) => this.logger.warn(`monitor history refresh ${key} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`),
  });
  private readonly todayCache = new SwrCache<Loaded<any>>({
    freshMs: TODAY_FRESH_MS,
    maxStaleMs: TODAY_MAX_STALE_MS,
    maxKeys: 300,
    onBackgroundError: (key, err) => this.logger.warn(`monitor today refresh ${key} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`),
  });
  /** Closed-day parts that never change once the day is closed: loaded once per IST day. */
  private readonly dailyCache = new SwrCache<Loaded<any>>({ freshMs: Number.POSITIVE_INFINITY, maxKeys: 20 });
  /** Pool counts (bufferClients/promoteClients snapshots): refreshed every 10 min. */
  private readonly poolCache = new SwrCache<Loaded<any>>({
    freshMs: POOL_FRESH_MS,
    maxStaleMs: TODAY_MAX_STALE_MS * 2,
    maxKeys: 5,
    onBackgroundError: (key, err) => this.logger.warn(`monitor pool refresh ${key} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`),
  });
  /** clients collection (names, promote flag): changes rarely, so a stale copy is always served while it refreshes. */
  private readonly metaCache = new SwrCache<Loaded<any>>({
    freshMs: TODAY_FRESH_MS,
    maxKeys: 3,
    onBackgroundError: (key, err) => this.logger.warn(`monitor clients refresh ${key} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`),
  });
  private readonly liveCache = new TtlCache<LiveSnapshot>(LIVE_TTL_MS, 2);
  /** Paid chats per closed IST day (fleet-wide rows; clientId filters in memory). */
  private readonly paidHistCache = new SwrCache<Loaded<PaidChat[]>>({
    freshMs: HISTORY_FRESH_MS,
    maxKeys: PAID_HIST_KEYS,
    onBackgroundError: (key, err) => this.logger.warn(`monitor paid-chats refresh ${key} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`),
  });
  /** Paid chats of today: fresh 60 s, then stale-while-revalidate (never older than 15 min). */
  private readonly paidTodayCache = new SwrCache<Loaded<PaidChat[]>>({
    freshMs: TODAY_FRESH_MS,
    maxStaleMs: TODAY_MAX_STALE_MS,
    maxKeys: 2,
    onBackgroundError: (key, err) => this.logger.warn(`monitor paid-chats refresh ${key} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`),
  });
  /** Whole responses per page, persisted to Redis (monitor::snapshot::<page>) when the client supports GET/SET. */
  private readonly snapshots: SnapshotCache<any>;
  /** Boot prewarm delay; negative disables the prewarm (and the midnight rebuild). */
  prewarmDelayMs = PREWARM_DELAY_MS;
  private prewarmTimer: NodeJS.Timeout | null = null;
  private prewarming: Promise<void> | null = null;
  /** The module's Postgres pool has 2 connections: viewers use both, background refreshes one. */
  private readonly pgGate = new ConcurrencyGate(2, 1);
  /** activeChannels reaction-restricted counts (unindexed scan, ~0.6 s): refreshed at most hourly. */
  private readonly restrictedCache = new SwrCache<Loaded<any>>({ freshMs: RESTRICTED_FRESH_MS, maxKeys: 2 });

  constructor(
    private readonly pg: AnalyticsPgReader,
    @InjectConnection() private readonly connection: Connection,
    @Inject(MONITOR_REDIS) private readonly redis: MonitorRedis,
  ) {
    const store: SnapshotStore | null =
      typeof redis?.get === 'function' && typeof redis?.set === 'function'
        ? { get: (k) => redis.get!(k), set: (k, v, mode, ttl) => redis.set!(k, v, mode, ttl) }
        : null;
    this.snapshots = new SnapshotCache<any>({
      freshMs: SNAPSHOT_FRESH_MS,
      day: (t) => istDate(t),
      store,
      keyPrefix: SNAPSHOT_KEY_PREFIX,
      ttlSec: SNAPSHOT_TTL_SEC,
      maxKeys: 100,
      // a page with a failed section is served to its caller but never cached or persisted
      complete: (v) => !(v?.notes ?? []).some((n: unknown) => typeof n === 'string' && / unavailable: /.test(n)),
      onError: (what, err) => this.logger.warn(`monitor snapshot ${what} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`),
    });
  }

  // ---------------------------------------------------------------- snapshots + prewarm

  onModuleInit(): void {
    if (this.prewarmDelayMs < 0) return;
    // last snapshots of the fleet pages from Redis (one GET each, 500 ms deadline), not awaited
    void this.snapshots.preload(PREWARM_PAGES).catch(() => undefined);
    this.schedulePrewarm(this.prewarmDelayMs, 'boot');
  }

  onModuleDestroy(): void {
    if (this.prewarmTimer) clearTimeout(this.prewarmTimer);
    this.prewarmTimer = null;
  }

  private schedulePrewarm(delayMs: number, reason: string): void {
    if (this.prewarmTimer) clearTimeout(this.prewarmTimer);
    this.prewarmTimer = setTimeout(() => {
      this.prewarmTimer = null;
      void this.prewarm(reason).finally(() => {
        const now = Date.now();
        this.schedulePrewarm(istDayStart(addDays(istDate(now), 1)) - now + MIDNIGHT_PREWARM_AFTER_MS, 'midnight');
      });
    }, Math.max(0, delayMs));
    this.prewarmTimer.unref?.();
  }

  /**
   * Rebuilds the fleet pages once, one after another, at background priority (one Postgres slot), so
   * the first viewer after a restart or after IST midnight is served at once. Runs only when the
   * monitor was used in the last 36 h (a fleet:today snapshot exists in Redis). Returns the pages built.
   */
  async prewarm(reason = 'manual'): Promise<string[]> {
    if (this.prewarming) {
      await this.prewarming;
      return [];
    }
    const built: string[] = [];
    this.prewarming = (async () => {
      try {
        if (!(await this.snapshots.storedDay('fleet:today'))) {
          this.logger.log(`monitor prewarm (${reason}) skipped: no recent snapshot (monitor unused in the last 36 h)`);
          return;
        }
        const t = Date.now();
        for (const page of PREWARM_PAGES) {
          try {
            await this.snapshots.refresh(page, (bg) => this.buildPage(page, bg));
            built.push(page);
          } catch (err) {
            this.logger.warn(`monitor prewarm ${page} failed: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
          }
        }
        this.logger.log(`monitor prewarm (${reason}): ${built.length}/${PREWARM_PAGES.length} pages in ${Date.now() - t} ms`);
      } finally {
        this.prewarming = null;
      }
    })();
    await this.prewarming;
    return built;
  }

  private buildPage(page: string, background: boolean): Promise<any> {
    const now = Date.now();
    const [kind, a, b] = page.split(':');
    if (kind === 'fleet') return this.buildFleet(a as MonitorPeriod, now, background);
    if (kind === 'detail') return this.buildDetail(null, Number(b) as 7 | 30, now, background);
    if (kind === 'promotions') return this.buildPromotions(a as PromoWindow, b === '*' ? null : b, now, background);
    if (kind === 'reactions') return this.buildReactions(a as ReactWindow, b === '*' ? null : b, now, background);
    if (kind === 'funnel') return this.buildFunnel(a as MonitorPeriod, b === '*' ? null : b, now, background);
    return this.buildDetail(a, Number(b) as 7 | 30, now, background);
  }

  /** Serves a page from its snapshot; `cache` describes the parts behind it plus the snapshot itself. */
  private async snap<T extends { cache: CacheInfo }>(page: string): Promise<T> {
    const r: SnapshotResult<T> = await this.snapshots.get(page, (bg) => this.buildPage(page, bg));
    return withSnapshotCache(r, Date.now());
  }

  // ---------------------------------------------------------------- data access

  private async pgRows<T = any>(q: SqlQuery, timings: Record<string, number>, background: boolean): Promise<T[]> {
    const queued = Date.now();
    return this.pgGate.run(background, async () => {
      const t = Date.now();
      if (t - queued >= 50) timings[`pg.${q.name}.queue`] = t - queued;
      let err: AnalyticsPgError | undefined;
      try {
        const rows = await withTimeout(this.pg.query<T>(q.sql, q.params, (e) => (err = e)), PG_TIMEOUT_MS, q.name);
        if (!rows) throw new Error(`${err?.kind ?? 'query'}: ${err?.message ?? 'no rows'}`);
        return rows;
      } finally {
        timings[`pg.${q.name}`] = Date.now() - t;
      }
    });
  }

  private async mongoAgg<T = any>(collection: string, pipeline: object[], name: string, timings: Record<string, number>): Promise<T[]> {
    const t = Date.now();
    try {
      const cursor = this.connection
        .collection(collection)
        .aggregate(pipeline as any[], { maxTimeMS: MONGO_MAX_TIME_MS, readPreference: 'secondaryPreferred' } as any);
      return (await withTimeout(cursor.toArray(), MONGO_TIMEOUT_MS, name)) as T[];
    } finally {
      timings[name] = Date.now() - t;
    }
  }

  private async mongoFind<T = any>(collection: string, filter: object, projection: object, name: string, timings: Record<string, number>): Promise<T[]> {
    const t = Date.now();
    try {
      const cursor = this.connection
        .collection(collection)
        .find(filter as any, { projection, maxTimeMS: MONGO_MAX_TIME_MS, readPreference: 'secondaryPreferred' } as any);
      return (await withTimeout(cursor.toArray(), MONGO_TIMEOUT_MS, name)) as T[];
    } finally {
      timings[name] = Date.now() - t;
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

  /**
   * One cached part. Keys carry the IST date, and every entry expires at the next IST midnight, so
   * yesterday's "today" and the closed-day history computed before midnight are never served after it.
   */
  private async part<T>(
    ctx: Ctx,
    kind: Part,
    key: string,
    load: (now: number, timings: Record<string, number>, background: boolean) => Promise<T>,
    cacheOverride?: SwrCache<Loaded<any>>,
  ): Promise<Loaded<T>> {
    const now = Date.now();
    const today = istDate(now);
    const cache = cacheOverride ?? (kind === 'history' ? this.historyCache : this.todayCache);
    const r = await cache.get(
      `${today}|${key}`,
      async (background) => {
        const asOf = Date.now();
        const timings: Record<string, number> = {};
        const value = await load(asOf, timings, background || ctx.background);
        return { value, asOf, timings };
      },
      istDayStart(addDays(today, 1)),
      { refresh: ctx.background },
    );
    ctx.track(kind, r.state, r.at);
    Object.assign(ctx.timings, r.value.timings);
    return r.value as Loaded<T>;
  }

  // ---- shared parts (fleet-wide; pages filter in memory)

  private historyStart(today: string): number {
    return istDayStart(addDays(today, -HISTORY_DAYS));
  }

  private payHist(ctx: Ctx): Promise<Credit[]> {
    return this.part<Credit[]>(ctx, 'history', 'pay_hist', async (now, t, bg) => {
      const today = istDate(now);
      const rows = await this.pgRows<PayRow>(paymentRowsSql('pay_hist', this.historyStart(today), istDayStart(today)), t, bg);
      return rows.map(toCredit);
    }).then((l) => l.value);
  }

  private payToday(ctx: Ctx): Promise<AsOf<Credit[]>> {
    return this.part<Credit[]>(ctx, 'today', 'pay_today', async (now, t, bg) => {
      const rows = await this.pgRows<PayRow>(paymentRowsSql('pay_today', istDayStart(istDate(now))), t, bg);
      return rows.map(toCredit);
    }).then((l) => ({ asOf: l.asOf, rows: l.value }));
  }

  private dcHist(ctx: Ctx): Promise<DailyClientRow[]> {
    return this.part<DailyClientRow[]>(ctx, 'history', 'dc_hist', (now, t, bg) => {
      const today = istDate(now);
      return this.pgRows(dailyClientSql('dc_hist', addDays(today, -HISTORY_DAYS), addDays(today, -1)), t, bg);
    }).then((l) => l.value);
  }

  private dcToday(ctx: Ctx): Promise<DailyClientRow[]> {
    return this.part<DailyClientRow[]>(ctx, 'today', 'dc_today', (now, t, bg) => {
      const today = istDate(now);
      return this.pgRows(dailyClientSql('dc_today', today, today), t, bg);
    }).then((l) => l.value);
  }

  /**
   * Which route counters (ROUTED_COLUMNS, tg-platform 2026-10-29) exist on daily_client / daily_mobile:
   * one information_schema read, cached like history (re-read every 10 min, so the columns are picked
   * up within 10 min of the tg-platform deploy that adds them).
   */
  private routedColumns(ctx: Ctx): Promise<{ client: string[]; mobile: string[] }> {
    return this.part<{ client: string[]; mobile: string[] }>(ctx, 'history', 'routed_columns', async (_now, t, bg) => {
      const rows = await this.pgRows<{ t: string; c: string }>(routedColumnsSql(), t, bg);
      return {
        client: rows.filter((r) => r.t === 'daily_client').map((r) => r.c).sort(),
        mobile: rows.filter((r) => r.t === 'daily_mobile').map((r) => r.c).sort(),
      };
    }).then((l) => l.value);
  }

  private dmsHist(ctx: Ctx): Promise<DmsDayRow[]> {
    return this.part<DmsDayRow[]>(ctx, 'history', 'dms_hist', (now, t, bg) => {
      const today = istDate(now);
      return this.pgRows(dmsByDaySql(this.historyStart(today), istDayStart(today)), t, bg);
    }).then((l) => l.value);
  }

  private dmRowsYday(ctx: Ctx): Promise<DmRow[]> {
    return this.part<DmRow[]>(ctx, 'history', 'dm_rows_yday', (now, t, bg) => {
      const today0 = istDayStart(istDate(now));
      return this.pgRows(dmRowsSql('dm_rows_yday', today0 - DAY_MS, today0), t, bg);
    }).then((l) => l.value);
  }

  private dmRowsToday(ctx: Ctx): Promise<AsOf<DmRow[]>> {
    return this.part<DmRow[]>(ctx, 'today', 'dm_rows_today', (now, t, bg) =>
      this.pgRows(dmRowsSql('dm_rows_today', istDayStart(istDate(now))), t, bg),
    ).then((l) => ({ asOf: l.asOf, rows: l.value }));
  }

  /** Today per (client, hour) + yesterday up to the same time per (client, hour), cut = asOf - 24 h. */
  private sendsLive(ctx: Ctx): Promise<AsOf<any[]>> {
    return this.part<any[]>(ctx, 'today', 'sends_live', (now, t, bg) =>
      this.pgRows(sendsLiveSql({ start: istDayStart(istDate(now)), end: now }, now - DAY_MS), t, bg),
    ).then((l) => ({ asOf: l.asOf, rows: l.value }));
  }

  private sendsYdayHourly(ctx: Ctx): Promise<any[]> {
    return this.part<any[]>(ctx, 'history', 'sends_yday_hourly', (now, t, bg) => {
      const today0 = istDayStart(istDate(now));
      return this.pgRows(sendsHourlySql({ start: today0 - DAY_MS, end: today0 }), t, bg);
    }).then((l) => l.value);
  }

  private mobilesHist(ctx: Ctx, from: string): Promise<MobileRow[]> {
    return this.part<MobileRow[]>(ctx, 'history', `mobiles_hist:${from}`, (now, t, bg) =>
      this.pgRows(mobilesSql('mobiles_hist', from, addDays(istDate(now), -1)), t, bg),
    ).then((l) => l.value);
  }

  private mobilesToday(ctx: Ctx): Promise<MobileRow[]> {
    return this.part<MobileRow[]>(ctx, 'today', 'mobiles_today', (now, t, bg) => {
      const today = istDate(now);
      return this.pgRows(mobilesSql('mobiles_today', today, today), t, bg);
    }).then((l) => l.value);
  }

  private clientMeta(ctx: Ctx): Promise<ClientMeta[]> {
    return this.part<ClientMeta[]>(ctx, 'today', 'clients', async (_now, t) => {
      const rows = await this.mongoFind<any>('clients', {}, { _id: 0, clientId: 1, name: 1, promoteRepl: 1 }, 'mongo.clients', t);
      return rows
        .filter((r) => r.clientId)
        .map((r) => ({ clientId: String(r.clientId), name: r.name ?? null, promote: !!r.promoteRepl }));
    }, this.metaCache).then((l) => l.value);
  }

  /** userData cohorts per (client, IST day) for the closed history days. */
  private cohortsHist(ctx: Ctx): Promise<CohortRow[]> {
    return this.part<CohortRow[]>(ctx, 'history', 'cohorts_hist', async (now, t) => {
      const today = istDate(now);
      return flattenCohort(
        await this.mongoAgg('userData', userCohortPipeline({ start: this.historyStart(today), end: istDayStart(today) }), 'mongo.userData_cohorts_hist', t),
      );
    }).then((l) => l.value);
  }

  /** Today's userData cohorts per (client, IST day, hour). */
  private cohortsToday(ctx: Ctx): Promise<CohortRow[]> {
    return this.part<CohortRow[]>(ctx, 'today', 'cohorts_today', async (now, t) =>
      flattenCohort(
        await this.mongoAgg('userData', userCohortPipeline({ start: istDayStart(istDate(now)), end: now, byHour: true }), 'mongo.userData_cohorts_today', t),
      ),
    ).then((l) => l.value);
  }

  private cohortsYdayHourly(ctx: Ctx): Promise<CohortRow[]> {
    return this.part<CohortRow[]>(ctx, 'history', 'cohorts_yday_hourly', async (now, t) => {
      const today0 = istDayStart(istDate(now));
      return flattenCohort(
        await this.mongoAgg('userData', userCohortPipeline({ start: today0 - DAY_MS, end: today0, byHour: true }), 'mongo.userData_hourly_yday', t),
      );
    }).then((l) => l.value);
  }

  /** Yesterday 00:00 → same time yesterday, first payment before that cut too. */
  private cohortsYdayCut(ctx: Ctx): Promise<CohortRow[]> {
    return this.part<CohortRow[]>(ctx, 'today', 'cohorts_yday_cut', async (now, t) => {
      const cut = now - DAY_MS;
      const start = istDayStart(istDate(now)) - DAY_MS;
      return flattenCohort(
        await this.mongoAgg('userData', userCohortPipeline({ start, end: cut, paidBefore: cut }), 'mongo.userData_cohorts_yday_same_time', t),
      );
    }).then((l) => l.value);
  }

  private pool(ctx: Ctx): Promise<Pool> {
    return this.part<Pool>(ctx, 'history', 'pool', (now, t) => this.poolByClient(now, istDate(now), t), this.poolCache).then((l) => l.value);
  }

  private async poolByClient(now: number, today: string, t: Record<string, number>): Promise<Pool> {
    const [buf, prom] = await Promise.all([
      this.mongoAgg('bufferClients', bufferPoolPipeline(now, today), 'mongo.bufferClients_pool', t),
      this.mongoAgg('promoteClients', promotePoolPipeline(), 'mongo.promoteClients_pool', t),
    ]);
    const out: Pool = new Map();
    const get = (id: string) => {
      if (!out.has(id)) out.set(id, { total: 0, eligible: 0, harsh: 0, promoteActive: 0 });
      return out.get(id)!;
    };
    for (const b of buf) if (b._id) Object.assign(get(b._id), { total: num(b.total), eligible: num(b.eligible), harsh: num(b.harsh) });
    for (const p of prom) if (p._id) get(p._id).promoteActive = num(p.active);
    return out;
  }

  // ---------------------------------------------------------------- fleet

  async fleet(period: MonitorPeriod): Promise<FleetResponse> {
    return this.snap<FleetResponse>(`fleet:${period}`);
  }

  async buildFleet(period: MonitorPeriod, now: number, background = false): Promise<FleetResponse> {
    const ctx = new Ctx(background);
    const w = resolvePeriod(period, now);
    const sparkFrom = addDays(w.today, -6);
    const intraday = !w.wholeDays;

    const [meta, payH, payT, dcH, dmsH, dmY, dmT, live, cohH, cohT, cohY, pool] = await Promise.all([
      this.section('clients', ctx, () => this.clientMeta(ctx)),
      this.section('revenue', ctx, () => this.payHist(ctx)),
      this.section('revenue_today', ctx, () => this.payToday(ctx)),
      w.wholeDays ? this.section('sends', ctx, () => this.dcHist(ctx)) : null,
      w.wholeDays ? this.section('dms', ctx, () => this.dmsHist(ctx)) : null,
      intraday ? this.section('dms', ctx, () => this.dmRowsYday(ctx)) : null,
      intraday ? this.section('dms_today', ctx, () => this.dmRowsToday(ctx)) : null,
      intraday ? this.section('sends', ctx, () => this.sendsLive(ctx)) : null,
      w.wholeDays ? this.section('conversion', ctx, () => this.cohortsHist(ctx)) : null,
      intraday ? this.section('conversion', ctx, () => this.cohortsToday(ctx)) : null,
      intraday ? this.section('conversion', ctx, () => this.cohortsYdayCut(ctx)) : null,
      this.section('pool', ctx, () => this.pool(ctx)),
    ]);

    // ---- revenue (today: today's rows vs yesterday's rows up to the same time)
    type Rev = ReturnType<typeof revenueBy>;
    let rev: Rev | null = null;
    let revPrev: Rev | null = null;
    if (intraday) {
      if (payT) rev = revenueBy(payT.rows, w.cur.start, payT.asOf);
      if (payH) revPrev = revenueBy(payH, w.prev.start, (payT?.asOf ?? now) - DAY_MS);
    } else if (payH) {
      rev = revenueBy(payH, w.cur.start, w.cur.end);
      revPrev = revenueBy(payH, w.prev.start, w.prev.end);
    }

    // ---- sends + new users
    type Sends = ReturnType<typeof sumDailyClient>;
    let sends: Sends | null = null;
    let sendsPrev: Sends | null = null;
    let famSends: FamSplit<FamSend> | null = null;
    let famSendsPrev: FamSplit<FamSend> | null = null;
    if (dcH) {
      sends = sumDailyClient(dcH, w.range.from, w.range.to);
      sendsPrev = sumDailyClient(dcH, w.prevRange.from, w.prevRange.to);
      famSends = sendsByFamily(dcH, 'namespace', (r) => r.d >= w.range.from && r.d <= w.range.to);
      famSendsPrev = sendsByFamily(dcH, 'namespace', (r) => r.d >= w.prevRange.from && r.d <= w.prevRange.to);
    } else if (live) {
      const isToday = (r: any) => r.today === true || r.today === 't';
      famSends = sendsByFamily(live.rows, 'service', isToday);
      famSendsPrev = sendsByFamily(live.rows, 'service', (r) => !isToday(r));
      const cur = new Map<string, any>();
      const prev = new Map<string, any>();
      for (const r of live.rows) {
        const id = r.client_id ?? '';
        const into = r.today === true || r.today === 't' ? cur : prev;
        const e = into.get(id) ?? { sent: 0, delivered: 0, banned: 0, new_users: 0 };
        e.sent += num(r.sent);
        e.delivered += num(r.delivered);
        e.banned += num(r.banned);
        into.set(id, e);
      }
      const asRows = (m: Map<string, any>) => [...m].map(([client_id, v]) => ({ d: w.today, client_id: client_id || null, ...v }));
      sends = sumDailyClient(asRows(cur), w.today, w.today);
      sendsPrev = sumDailyClient(asRows(prev), w.today, w.today);
    }

    // ---- DMs
    type Dms = { byClient: Map<string, number>; total: number };
    let dms: Dms | null = null;
    let dmsPrev: Dms | null = null;
    let famDms: FamSplit<number> | null = null;
    let famDmsPrev: FamSplit<number> | null = null;
    if (dmsH) {
      dms = sumDmsDays(dmsH, w.range.from, w.range.to);
      dmsPrev = sumDmsDays(dmsH, w.prevRange.from, w.prevRange.to);
      famDms = dmsFamilyDays(dmsH, w.range.from, w.range.to);
      famDmsPrev = dmsFamilyDays(dmsH, w.prevRange.from, w.prevRange.to);
    } else {
      if (dmT) {
        dms = distinctDms(dmT.rows);
        famDms = dmsFamilyRows(dmT.rows);
      }
      if (dmY) {
        dmsPrev = distinctDms(dmY, (dmT?.asOf ?? now) - DAY_MS);
        famDmsPrev = dmsFamilyRows(dmY, (dmT?.asOf ?? now) - DAY_MS);
      }
    }

    // ---- conversion cohorts (current / previous)
    let cohortCur: CohortRow[] | null = null;
    let cohortPrev: CohortRow[] | null = null;
    if (cohH) {
      cohortCur = cohH.filter((r) => r.d >= w.range.from && r.d <= w.range.to);
      cohortPrev = cohH.filter((r) => r.d >= w.prevRange.from && r.d <= w.prevRange.to);
    } else {
      cohortCur = cohT;
      cohortPrev = cohY;
    }

    // ---- spark: today-6 .. today (today partial)
    const sparkDates = datesBetween(sparkFrom, w.today);
    const sparkOk = !!payH && !!payT;
    const sparkBy = sparkOk ? revenueByClientDay([...payH!, ...payT!.rows]) : new Map<string, Map<string, number>>();

    const conv = (rows: CohortRow[] | null | undefined, id?: string): number | null => {
      if (!rows) return null;
      const sel = id === undefined ? rows : rows.filter((c) => c.c === id);
      return ratio(
        sel.reduce((s, c) => s + c.same, 0),
        sel.reduce((s, c) => s + c.n, 0),
      );
    };
    const cohortN = (rows: CohortRow[] | null | undefined, id?: string): number | null =>
      rows ? rows.filter((c) => id === undefined || c.c === id).reduce((s, c) => s + c.n, 0) : null;
    const nuCur = (id?: string): number | null =>
      w.wholeDays ? (sends ? (id === undefined ? sends.total : sends.byClient.get(id))?.newUsers ?? 0 : null) : cohortN(cohortCur, id);
    const nuPrev = (id?: string): number | null =>
      w.wholeDays ? (sendsPrev ? (id === undefined ? sendsPrev.total : sendsPrev.byClient.get(id))?.newUsers ?? 0 : null) : cohortN(cohortPrev, id);

    // userData docs are swept after 30 days idle: a previous window starting before that horizon
    // has only sparse survivors, so its conversion is unknown (null), never 0.
    const prevSwept = w.prevRange.from < addDays(w.today, -29);
    const prevCohorts = prevSwept ? null : cohortPrev;

    const metaBy = new Map((meta ?? []).map((m) => [m.clientId, m]));
    const ids = new Set<string>([...metaBy.keys()]);
    for (const m of [rev?.byClient, sends?.byClient, dms?.byClient]) for (const k of m?.keys() ?? []) if (k) ids.add(k);
    for (const c of cohortCur ?? []) if (c.c) ids.add(c.c);

    const clients: FleetClientRow[] = [...ids].map((id) => {
      const r = rev?.byClient.get(id);
      const s = sends?.byClient.get(id);
      const revenue = rev ? (r?.revenue ?? 0) : null;
      const payers = rev ? (r?.payers ?? 0) : null;
      const p = pool?.get(id);
      const rp = revPrev?.byClient.get(id);
      return {
        clientId: id,
        name: metaBy.get(id)?.name ?? null,
        revenue,
        payers,
        newUsers: nuCur(id),
        conversion: conv(cohortCur, id),
        avgTicket: ratio(revenue, payers, 1),
        sends: sends ? (s?.sent ?? 0) : null,
        sendSuccess: sends ? (s?.delivered ?? 0) : null,
        banned: sends ? (s?.banned ?? 0) : null,
        dms: dms ? (dms.byClient.get(id) ?? 0) : null,
        pool: pool ? { buffersEligible: p?.eligible ?? 0, buffersTotal: p?.total ?? 0, promoteActive: p?.promoteActive ?? 0 } : null,
        spark: sparkOk ? sparkDates.map((dt) => sparkBy.get(id)?.get(dt) ?? 0) : null,
        previous: {
          revenue: revPrev ? (rp?.revenue ?? 0) : null,
          payers: revPrev ? (rp?.payers ?? 0) : null,
          newUsers: nuPrev(id),
          conversion: conv(prevCohorts, id),
        },
        byFamily: byFamily(famSends, famDms, id),
      };
    });
    clients.sort((a, b) => (b.revenue ?? -1) - (a.revenue ?? -1) || a.clientId.localeCompare(b.clientId));

    const totals = (r: Rev | null, s: Sends | null, d: Dms | null, cohorts: CohortRow[] | null, nu: number | null, fam: ByFamily): Metrics => {
      const revenue = r ? r.total.revenue : null;
      const gross = r ? r.total.gross : null;
      const payers = r ? r.total.payers : null;
      return {
        revenue,
        grossRevenue: gross,
        flaggedRevenue: revenue === null || gross === null ? null : gross - revenue,
        payers,
        newUsers: nu,
        conversion: conv(cohorts),
        avgTicket: ratio(revenue, payers, 1),
        sends: s ? s.total.sent : null,
        sendSuccess: s ? s.total.delivered : null,
        banned: s ? s.total.banned : null,
        dms: d ? d.total : null,
        byFamily: fam,
      };
    };

    const notes = [...historyNotes([w.range, w.prevRange]), ...ctx.notes];
    if (intraday) {
      const cutAt = (live?.asOf ?? payT?.asOf ?? now) - DAY_MS;
      notes.push(
        `previous = yesterday 00:00 to ${new Date(cutAt + 19_800_000).toISOString().slice(11, 16)} IST; today's sends come from promotion_send and new users/conversion from Mongo userData.`,
      );
    }
    notes.push(
      `byFamily splits sends/DMs into tg-aut and promote; rows without a family (promotion_send/conversion_event before 2026-10-25) count only in the merged numbers.`,
    );
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
      fleet: totals(rev, sends, dms, cohortCur, nuCur(), byFamily(famSends, famDms)),
      previous: totals(revPrev, sendsPrev, dmsPrev, prevCohorts, nuPrev(), byFamily(famSendsPrev, famDmsPrev)),
      clients,
      notes,
      timingsMs: ctx.timings,
      cache: ctx.cache(Date.now()),
    };
  }

  // ---------------------------------------------------------------- client

  async client(clientId: string, days: 7 | 30): Promise<any> {
    return this.snap(`client:${clientId}:${days}`);
  }

  /** Same shape as client detail, aggregated over every client (clientId 'all'). */
  async fleetDetail(days: 7 | 30): Promise<any> {
    return this.snap(`detail:all:${days}`);
  }

  async buildClient(clientId: string, days: 7 | 30, now: number): Promise<any> {
    return this.buildDetail(clientId, days, now);
  }

  async buildFleetDetail(days: 7 | 30, now: number): Promise<any> {
    return this.buildDetail(null, days, now);
  }

  /** Client detail for one client, or for the whole fleet when `scope` is null. */
  private async buildDetail(scope: string | null, days: 7 | 30, now: number, background = false): Promise<any> {
    const ctx = new Ctx(background);
    const fleetScope = scope === null;
    const clientId = scope ?? FLEET_DETAIL_ID;
    const r = clientDaysRange(days, now);
    const today = r.to;
    const yday = addDays(today, -1);
    const today0 = istDayStart(today);
    const yday0 = today0 - DAY_MS;
    const inScope = (c: string | null) => fleetScope || c === scope;

    const [meta, fleet, payH, payT, dcH, dcT, dmsH, dmT, ydayHourly, live, mobH, mobT, channelRows, cohH, cohT, cohYH, ttfp, pool] = await Promise.all([
      this.section('clients', ctx, () => this.clientMeta(ctx)),
      this.section('summary', ctx, () => this.buildFleet(days === 7 ? '7d' : '30d', now, background)),
      this.section('payments', ctx, () => this.payHist(ctx)),
      this.section('payments_today', ctx, () => this.payToday(ctx)),
      this.section('daily_client', ctx, () => this.dcHist(ctx)),
      this.section('daily_client_today', ctx, () => this.dcToday(ctx)),
      this.section('dms', ctx, () => this.dmsHist(ctx)),
      this.section('dms_today', ctx, () => this.dmRowsToday(ctx)),
      this.section('hourly_sends', ctx, () => this.sendsYdayHourly(ctx)),
      this.section('hourly_sends_today', ctx, () => this.sendsLive(ctx)),
      this.section('mobiles', ctx, () => this.mobilesHist(ctx, r.from)),
      this.section('mobiles_today', ctx, () => this.mobilesToday(ctx)),
      this.section('channels', ctx, () => this.topChannels(scope, r.from, r.start, today, ctx)),
      this.section('conversion', ctx, () => this.cohortsHist(ctx)),
      this.section('conversion_today', ctx, () => this.cohortsToday(ctx)),
      this.section('hourly_new_users', ctx, () => this.cohortsYdayHourly(ctx)),
      this.section('time_to_first_pay', ctx, () => this.timeToFirstPay(scope, r.start, ctx)),
      this.section('pool', ctx, () => this.pool(ctx)),
    ]);
    if (fleet) ctx.merge(fleet.cache, Date.now());

    const scoped = (cs: Credit[]) => cs.filter((c) => inScope(c.client));
    const histCredits = payH ? scoped(payH).filter((c) => c.ms >= Math.min(r.start, yday0)) : null;
    const todayCredits = payT ? scoped(payT.rows) : null;
    const credits = histCredits && todayCredits ? [...histCredits, ...todayCredits] : null;
    const inRange = credits?.filter((c) => c.ms >= r.start && c.ms < now) ?? null;
    const creditsOf = (date: string) => (date === today ? todayCredits : histCredits);

    // ---- daily: closed days from history parts, today from today parts
    const dcBy = new Map([...(dcH ? dailyClientByDate(dcH, scope) : []), ...(dcT ? dailyClientByDate(dcT, scope) : [])]);
    const dmsBy = dmsH ? dmsByDate(dmsH, scope) : new Map<string, number>();
    const dmsToday = dmT ? distinctDms(dmT.rows.filter((x) => inScope(x.client_id))).total : null;
    const famDcBy = new Map([...(dcH ? sendsByFamilyDate(dcH, scope) : []), ...(dcT ? sendsByFamilyDate(dcT, scope) : [])]);
    const famDmsBy = dmsH ? dmsFamilyByDate(dmsH, scope) : null;
    const famDmsToday = dmT ? dmsFamilyRows(dmT.rows, Number.POSITIVE_INFINITY, (x) => inScope(x.client_id)).total : null;
    const cohortBy = new Map<string, { n: number; same: number }>();
    for (const x of [...(cohH ?? []), ...(cohT ?? [])]) {
      if (!inScope(x.c)) continue;
      const e = cohortBy.get(x.d) ?? { n: 0, same: 0 };
      e.n += x.n;
      e.same += x.same;
      cohortBy.set(x.d, e);
    }
    const daily = datesBetween(r.from, r.to).map((date) => {
      const isToday = date === today;
      const dayCredits = creditsOf(date)?.filter((c) => istDate(c.ms) === date) ?? null;
      const dcOk = isToday ? !!dcT : !!dcH;
      const dc = dcBy.get(date);
      const co = cohortBy.get(date);
      const coOk = isToday ? !!cohT : !!cohH;
      return {
        date,
        revenue: dayCredits ? dayCredits.reduce((s, c) => s + c.revenue, 0) : null,
        grossRevenue: dayCredits ? dayCredits.reduce((s, c) => s + c.gross, 0) : null,
        payers: dayCredits ? new Set(dayCredits.filter((c) => c.clean).map((c) => c.chat)).size : null,
        newUsers: dcOk ? (dc?.newUsers ?? 0) : null,
        conversion: coOk ? ratio(co?.same ?? 0, co?.n ?? 0) : null,
        sends: dcOk ? (dc?.sent ?? 0) : null,
        sendSuccess: dcOk ? (dc?.delivered ?? 0) : null,
        banned: dcOk ? (dc?.banned ?? 0) : null,
        dms: isToday ? dmsToday : dmsH ? (dmsBy.get(date) ?? 0) : null,
        byFamily: byFamilyOfDate(
          dcOk ? famDcBy : null,
          isToday ? (famDmsToday ? new Map([[date, famDmsToday]]) : null) : famDmsBy,
          date,
        ),
      };
    });

    // ---- hourly today / yesterday
    const sendsHourBy = new Map<string, number>();
    for (const x of ydayHourly ?? []) if (inScope(x.client_id)) sendsHourBy.set(`${yday}:${num(x.h)}`, (sendsHourBy.get(`${yday}:${num(x.h)}`) ?? 0) + num(x.sent));
    for (const x of live?.rows ?? []) {
      if (!(x.today === true || x.today === 't') || !inScope(x.client_id)) continue;
      sendsHourBy.set(`${today}:${num(x.h)}`, (sendsHourBy.get(`${today}:${num(x.h)}`) ?? 0) + num(x.sent));
    }
    const nuHourBy = new Map<string, number>();
    for (const c of [...(cohYH ?? []), ...(cohT ?? [])]) if (inScope(c.c)) nuHourBy.set(`${c.d}:${c.h}`, (nuHourBy.get(`${c.d}:${c.h}`) ?? 0) + c.n);
    const hourly = (date: string) => {
      const isToday = date === today;
      const dayCredits = creditsOf(date)?.filter((c) => istDate(c.ms) === date) ?? null;
      const sendsOk = isToday ? !!live : !!ydayHourly;
      const nuOk = isToday ? !!cohT : !!cohYH;
      return Array.from({ length: 24 }, (_, hour) => {
        const hc = dayCredits?.filter((c) => istHour(c.ms) === hour) ?? null;
        return {
          hour,
          revenue: hc ? hc.reduce((s, c) => s + c.revenue, 0) : null,
          payers: hc ? new Set(hc.filter((c) => c.clean).map((c) => c.chat)).size : null,
          newUsers: nuOk ? (nuHourBy.get(`${date}:${hour}`) ?? 0) : null,
          sends: sendsOk ? (sendsHourBy.get(`${date}:${hour}`) ?? 0) : null,
        };
      });
    };

    // ---- distributions over the page range (credited = clean credits under ₹1,000)
    const clean = inRange?.filter((c) => c.clean) ?? [];
    const amount = inRange
      ? AMOUNT_BUCKETS.map((b) => {
          const inB = clean.filter((c) => c.amount >= b.lo && c.amount < b.hi);
          return { bucket: b.bucket, count: inB.length, revenue: inB.reduce((s, c) => s + c.revenue, 0) };
        })
      : null;
    const hourOfDay = inRange
      ? Array.from({ length: 24 }, (_, hour) => {
          const hc = clean.filter((c) => istHour(c.ms) === hour);
          return { hour, revenue: hc.reduce((s, c) => s + c.revenue, 0), payers: new Set(hc.map((c) => c.chat)).size };
        })
      : null;
    let repeat: { oneTime: number; repeat: number; repeatRevenueShare: number | null } | null = null;
    if (inRange) {
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
    if (ttfp) {
      const m = mapTtfp(ttfp);
      timeToFirstPay = m.buckets;
      if (m.negative) ctx.notes.push(`timeToFirstPay: ${m.negative} first payment(s) predate their userData doc (doc recreated) and are excluded.`);
    }

    // ---- mobiles, channels, pool
    const mobileRows = mobH && mobT ? mergeMobiles([...mobH, ...mobT], scope) : null;
    if (mobH && !mobT) ctx.notes.push('mobiles unavailable: today part failed');
    const mobiles = mobileRows
      ? mobileRows.map((m) => ({
          mobile: maskMobile(m.mobile),
          ...(fleetScope ? { clientId: m.client_id ?? null } : {}),
          newUsers: m.new_users,
          sends: m.sent,
          sendSuccess: m.delivered,
          banned: m.banned,
          dms: m.dms,
          firstDay: m.first_day,
          lastDay: m.last_day,
          family: m.family,
        }))
      : null;
    let channels: Array<{ title: string; sends: number; dms: number; dmPerSend: number | null }> | null = null;
    if (channelRows) {
      const titles = (await this.section('channel_titles', ctx, () => this.channelTitles(channelRows.map((c) => c.channel_id), ctx))) ?? new Map();
      channels = channelRows.map((c) => ({
        title: titles.get(c.channel_id) ?? `channel …${c.channel_id.slice(-4)}`,
        sends: c.sent,
        dms: c.dms,
        dmPerSend: ratio(c.dms, c.sent),
      }));
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
      cache: ctx.cache(Date.now()),
    };
  }

  /**
   * time-to-first-pay buckets. Closed days: one fleet-wide full scan of userData per IST day (no
   * firstPaidAt index; a closed day's firstPaidAt values do not change), filtered per page in memory.
   * Today: only the chats with a credit row today (pay_today), through the chatId index.
   */
  private async timeToFirstPay(scope: string | null, start: number, ctx: Ctx): Promise<Array<{ _id: number | string; n: number }>> {
    const [hist, today] = await Promise.all([
      this.part<FirstPayRow[]>(
        ctx,
        'history',
        'ttfp_hist',
        (now, t) => {
          const today0 = istDayStart(istDate(now));
          return this.mongoAgg('userData', firstPayRowsPipeline(this.historyStart(istDate(now)), today0), 'mongo.userData_ttfp_hist', t);
        },
        this.dailyCache,
      ),
      this.part<FirstPayRow[]>(ctx, 'today', 'ttfp_today', async (now, t, bg) => {
        const pay = await this.payToday(new Ctx(bg));
        const chats = [...new Set(pay.rows.map((c) => c.chat))];
        if (!chats.length) return [];
        return this.mongoAgg('userData', firstPayRowsPipeline(istDayStart(istDate(now)), now, chats), 'mongo.userData_ttfp_today', t);
      }),
    ]);
    const today0 = istDayStart(istDate(Date.now()));
    return addBuckets(ttfpBuckets(hist.value, scope, start, today0), ttfpBuckets(today.value, scope, today0, Number.POSITIVE_INFINITY));
  }

  /**
   * Top 20 channels by attributed DMs over the page range: closed days (fleet: daily_channel; one
   * client: conversion_event) cached until midnight + today's DMs from the shared today rows. Sends:
   * closed days for the 40 channels with the most closed-day DMs (a set that is stable all day, so
   * its cache key does not churn) + today's sends for the same set; a channel that enters the top 20
   * from outside that set is fetched separately.
   */
  private async topChannels(
    scope: string | null,
    from: string,
    start: number,
    today: string,
    ctx: Ctx,
  ): Promise<Array<{ channel_id: string; sent: number; dms: number }>> {
    const today0 = istDayStart(today);
    const key = scope ?? '*';
    const [hist, dmT] = await Promise.all([
      this.part<any[]>(ctx, 'history', `channels_dms_hist:${key}:${from}`, (_now, t, bg) =>
        this.pgRows(channelDmsHistSql(scope, from, today, start, today0), t, bg),
      ),
      this.dmRowsToday(ctx),
    ]);
    const histDms = new Map<string, number>(hist.value.map((x) => [String(x.channel_id), num(x.dms)]));
    const top = rankChannels(histDms, dmsByChannel(dmT.rows, scope), 20);
    if (!top.length) return [];
    const candidates = rankChannels(histDms, new Map(), CHANNEL_CANDIDATES).map((c) => c.channel_id).sort();
    const cand = new Set(candidates);
    const extra = top.map((c) => c.channel_id).filter((id) => !cand.has(id)).sort();

    const sendsHist = (ids: string[]) =>
      this.part<any[]>(ctx, 'history', `channels_sends_hist:${key}:${from}:${ids.join(',')}`, (_now, t, bg) =>
        this.pgRows(channelSendsHistSql(scope, ids, from, today, start, today0), t, bg),
      );
    const sendsToday = (ids: string[]) =>
      this.part<any[]>(ctx, 'today', `channels_sends_today:${key}:${ids.join(',')}`, (now, t, bg) =>
        this.pgRows(channelSendsTodaySql(scope, ids, istDayStart(istDate(now))), t, bg),
      );
    const [h1, h2, t1, t2] = await Promise.all([
      candidates.length ? sendsHist(candidates) : null,
      extra.length ? sendsHist(extra) : null,
      candidates.length ? sendsToday(candidates) : null,
      extra.length ? sendsToday(extra) : null,
    ]);
    const sentBy = new Map<string, number>();
    for (const part of [h1, h2, t1, t2]) {
      for (const x of part?.value ?? []) sentBy.set(String(x.channel_id), (sentBy.get(String(x.channel_id)) ?? 0) + num(x.sent));
    }
    return top.map((t) => ({ channel_id: t.channel_id, dms: t.dms, sent: sentBy.get(t.channel_id) ?? 0 }));
  }

  /** Channel titles from activeChannels, then channels; ids tried as stored and without/with the -100 prefix. Cached like history. */
  private async channelTitles(ids: string[], ctx: Ctx): Promise<Map<string, string>> {
    const key = [...ids].sort().join(',');
    const loaded = await this.part<Array<[string, string]>>(ctx, 'history', `titles:${key}`, async (_now, t) => {
      const variants = (id: string) => {
        const bare = id.replace(/^-100/, '');
        return [...new Set([id, bare, `-100${bare}`])];
      };
      const all = [...new Set(ids.flatMap(variants))];
      const out = new Map<string, string>();
      for (const coll of ['activeChannels', 'channels']) {
        const missing = ids.filter((id) => !out.has(id));
        if (!missing.length) break;
        const rows = await this.mongoFind<any>(coll, { channelId: { $in: all } }, { _id: 0, channelId: 1, title: 1 }, `mongo.${coll}_titles`, t);
        const byId = new Map(rows.filter((x) => x.title).map((x) => [String(x.channelId), String(x.title)]));
        for (const id of missing) {
          const title = variants(id).map((v) => byId.get(v)).find(Boolean);
          if (title) out.set(id, title);
        }
      }
      return [...out];
    });
    return new Map(loaded.value);
  }

  // ---------------------------------------------------------------- paid chats

  /**
   * Chats credited on IST day `date` (already validated by the controller): one row per
   * (clientId, chatId) from Postgres payment_event_owner, newest last credit first. Postgres
   * failure = 503, never an empty list. Usernames come from ONE userData find per request
   * (chatId_Profile index prefix); a Mongo failure only drops usernames (note added).
   */
  async paidChats(date: string, clientId: string | null): Promise<PaidChatsResponse> {
    const now = Date.now();
    const today = istDate(now);
    const isToday = date === today;
    const cache = isToday ? this.paidTodayCache : this.paidHistCache;
    let loaded: Loaded<PaidChat[]>;
    try {
      const r = await cache.get(
        date,
        async (background) => {
          const asOf = Date.now();
          const timings: Record<string, number> = {};
          const rows = await this.pgRows<PaidChatPgRow>(paidChatsSql(istDayStart(date), istDayStart(addDays(date, 1))), timings, background);
          return { value: rows.map(toPaidChat), asOf, timings };
        },
        isToday ? istDayStart(addDays(today, 1)) : Number.POSITIVE_INFINITY,
      );
      loaded = r.value;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 200);
      this.logger.warn(`monitor paid-chats ${date} failed: ${msg}`);
      throw new ServiceUnavailableException(`paid chats unavailable: ${msg}`);
    }
    const chats = loaded.value.filter((c) => clientId === null || c.clientId === clientId).map((c) => ({ ...c }));
    const notes: string[] = [];
    if (date === REVENUE_HISTORY_FROM) notes.push('payment_event starts 2026-10-04 02:02 IST; earlier credits of that day are not recorded.');
    await this.addUsernames(chats, notes);
    const totals = { chats: chats.length, credits: 0, amount: 0, ownerAmount: 0 };
    for (const c of chats) {
      totals.credits += c.credits;
      totals.amount += c.amount;
      totals.ownerAmount += c.ownerAmount;
    }
    return { date, tz: 'Asia/Kolkata', clientId, asOf: loaded.asOf, source: 'payment_event', chats, totals, notes };
  }

  private async addUsernames(chats: PaidChat[], notes: string[]): Promise<void> {
    if (!chats.length) return;
    const ids = [...new Set(chats.map((c) => c.chatId))].slice(0, PAID_ENRICH_MAX);
    let docs: Array<{ chatId?: string; profile?: string; clientId?: string; username?: string }>;
    try {
      docs = await this.mongoFind('userData', { chatId: { $in: ids } }, { _id: 0, chatId: 1, profile: 1, clientId: 1, username: 1 }, 'mongo.userData_paid_usernames', {});
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 200);
      this.logger.warn(`monitor paid-chats usernames failed: ${msg}`);
      notes.push(`usernames unavailable: ${msg}`);
      return;
    }
    const byClient = new Map<string, string>();
    const byProfile = new Map<string, string>();
    for (const d of docs) {
      const u = typeof d.username === 'string' ? d.username.trim() : '';
      if (!u || !d.chatId) continue;
      if (d.clientId) byClient.set(`${d.clientId}|${d.chatId}`, u);
      if (d.profile) byProfile.set(`${d.profile}|${d.chatId}`, u);
    }
    for (const c of chats) {
      c.username = byClient.get(`${c.clientId}|${c.chatId}`) ?? byProfile.get(`${c.profile}|${c.chatId}`) ?? null;
    }
  }


  // ---------------------------------------------------------------- promotions (design-v2 P1)

  /**
   * Promotion health per family / client / mobile. Snapshot per (window, client); every Postgres part
   * is shared fleet-wide (client filter in memory). Postgres failure of the sends part = 503, never an
   * empty page (a stale snapshot is still served while it refreshes).
   */
  async promotions(window: PromoWindow, client: string | null): Promise<any> {
    try {
      return await this.snap(`promotions:${window}:${client ?? '*'}`);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const msg = String((err as Error)?.message ?? err).slice(0, 200);
      this.logger.warn(`monitor promotions ${window} failed: ${msg}`);
      throw new ServiceUnavailableException(`promotions unavailable: ${msg}`);
    }
  }

  /** promotion_send per (current?, service, client, mobile, error type) for today / 24h. */
  private promoSends(ctx: Ctx, window: 'today' | '24h'): Promise<any[]> {
    return this.part<any[]>(ctx, 'today', `promo_sends:${window}`, (now, t, bg) => {
      const w = promoWindows(window, now);
      return this.pgRows(promoSendsSql(w.cur, w.prev), t, bg);
    }).then((l) => l.value);
  }

  /** daily_mobile per (current?, namespace, client, mobile) over the 7d / 30d windows. */
  private promoHist(ctx: Ctx, window: '7d' | '30d', routed: string[]): Promise<any[]> {
    return this.part<any[]>(ctx, 'history', `promo_mobiles_hist:${window}:${routed.join(',')}`, (now, t, bg) => {
      const b = histBounds(promoWindows(window, now));
      return this.pgRows(promoMobilesHistSql(b.prevFrom, b.curFrom, b.to, routed), t, bg);
    }).then((l) => l.value);
  }

  private promoMobilesToday(ctx: Ctx, routed: string[]): Promise<any[]> {
    return this.part<any[]>(ctx, 'today', `promo_mobiles_today:${routed.join(',')}`, (now, t, bg) =>
      this.pgRows(promoMobilesTodaySql(istDate(now), routed), t, bg),
    ).then((l) => l.value);
  }

  /** Active promote mobiles per client (promoteClients, ~750 docs), refreshed like the pool counts. */
  private promoteAssigned(ctx: Ctx): Promise<Array<{ mobile: string; clientId: string | null }>> {
    return this.part<Array<{ mobile: string; clientId: string | null }>>(
      ctx,
      'history',
      'promote_assigned',
      async (_now, t) => {
        const rows = await this.mongoFind<any>('promoteClients', { status: 'active' }, { _id: 0, mobile: 1, clientId: 1 }, 'mongo.promoteClients_assigned', t);
        return rows.filter((r) => r.mobile).map((r) => ({ mobile: String(r.mobile), clientId: r.clientId ? String(r.clientId) : null }));
      },
      this.poolCache,
    ).then((l) => l.value);
  }

  /** One read-only Redis pipeline: spam state of every mobile + route keys of promote mobiles. */
  private async redisAccountState(
    mobiles: string[],
    promote: Set<string>,
    ctx: Ctx,
  ): Promise<{ spam: Map<string, SpamState | null>; route: Map<string, RouteState> } | null> {
    if (typeof this.redis?.readPipeline !== 'function') {
      ctx.notes.push('spam/route state not read: Redis pipeline not configured.');
      return null;
    }
    if (!mobiles.length) return { spam: new Map(), route: new Map() };
    const cmds = redisBatch(mobiles, promote);
    const t = Date.now();
    try {
      const results = await withTimeout(this.redis.readPipeline(cmds), LIVE_REDIS_DEADLINE_MS, 'redis account state');
      return readBatch(mobiles, promote, results);
    } finally {
      ctx.timings['redis.account_state'] = Date.now() - t;
    }
  }

  async buildPromotions(window: PromoWindow, client: string | null, now: number, background = false): Promise<any> {
    const ctx = new Ctx(background);
    const w = promoWindows(window, now);
    const routed = await this.section('routed_columns', ctx, () => this.routedColumns(ctx));
    const routedCols = routed?.mobile ?? [];
    const intraday = w.intraday;

    const sendsP: Promise<any[]> = intraday ? this.promoSends(ctx, window as 'today' | '24h') : this.promoHist(ctx, window as '7d' | '30d', routedCols);
    const [sendRows, extraRows, meta, dmsH, dmY, dmT, assigned, live] = await Promise.all([
      sendsP.catch((err) => {
        const msg = String((err as Error)?.message ?? err).slice(0, 200);
        throw new ServiceUnavailableException(`promotion sends unavailable: ${msg}`);
      }),
      intraday ? this.section('mobiles_today', ctx, () => this.promoMobilesToday(ctx, routedCols)) : null,
      this.section('clients', ctx, () => this.clientMeta(ctx)),
      intraday ? null : this.section('dms', ctx, () => this.dmsHist(ctx)),
      intraday ? this.section('dms', ctx, () => this.dmRowsYday(ctx)) : null,
      intraday ? this.section('dms_today', ctx, () => this.dmRowsToday(ctx)) : null,
      this.section('assigned', ctx, () => this.promoteAssigned(ctx)),
      this.section('heartbeats', ctx, async () => (await this.liveCache.get('all', () => this.loadLive())).value),
    ]);

    const rows = intraday ? rowsFromSends(sendRows) : rowsFromHist(sendRows, routedCols);

    // DMs per family (conversion_event.service)
    let dmsCur: FamSplit<number> | null = null;
    let dmsPrev: FamSplit<number> | null = null;
    if (!intraday) {
      if (dmsH) {
        dmsCur = dmsFamilyDays(dmsH, w.range.from, w.range.to);
        dmsPrev = dmsFamilyDays(dmsH, w.previousRange.from, w.previousRange.to);
      }
    } else if (window === 'today') {
      if (dmT) dmsCur = dmsFamilyRows(dmT.rows);
      if (dmY) dmsPrev = dmsFamilyRows(dmY, (dmT?.asOf ?? now) - DAY_MS);
    } else if (dmT && dmY) {
      const from = dmT.asOf - DAY_MS;
      dmsCur = dmsFamilyRows([...dmY.filter((r) => new Date(r.ts).getTime() >= from), ...dmT.rows]);
    }

    // Redis spam + route state for every mobile on the page (unmasked here, masked in the body)
    // a client-scoped page also reads the other clients' mobiles: its fleet block uses the same rules
    const inScope = (_c: string | null) => true;
    const mobiles = new Set<string>();
    const promote = new Set<string>();
    for (const r of rows) {
      if (!r.cur || !r.mobile || !r.family || !inScope(r.clientId)) continue;
      mobiles.add(r.mobile);
      if (r.family === 'promote') promote.add(r.mobile);
    }
    for (const a of assigned ?? []) {
      if (!inScope(a.clientId)) continue;
      mobiles.add(a.mobile);
      promote.add(a.mobile);
    }
    const acct = await this.section('redis_state', ctx, () => this.redisAccountState([...mobiles].sort(), promote, ctx));

    const entries = (live?.entries ?? []).map((e) => ({ svc: e.svc, clientId: e.clientId, payload: e.payload as Record<string, any> | null, state: classifyHeartbeat(e.payload, now).state }));
    const inputs = {
      w,
      rows,
      extra: extraRows ? extrasFromToday(extraRows, routedCols) : null,
      dms: { cur: dmsCur, prev: dmsPrev },
      spam: acct?.spam ?? null,
      route: acct?.route ?? null,
      heartbeats: live ? heartbeatJoins(entries) : null,
      assigned: assigned ?? null,
      names: new Map((meta ?? []).map((m) => [m.clientId, m.name])),
      routedCols,
      client,
    };
    const body = buildPromotions(inputs);
    if (client !== null && meta && !meta.some((m) => m.clientId === client)) ctx.notes.push(`clientId ${client} is not in the clients collection.`);
    // client-scoped: the unscoped totals of the same parts (in memory), for "client · fleet" comparisons
    let fleet: { both: unknown; families: Record<Family, { totals: unknown }> } | undefined;
    if (client !== null) {
      const f = buildPromotions({ ...inputs, client: null });
      fleet = { both: f.both, families: { 'tg-aut': { totals: f.families['tg-aut'].totals }, promote: { totals: f.families.promote.totals } } };
    }
    return {
      generatedAt: new Date(now).toISOString(),
      ...body,
      ...(fleet ? { fleet } : {}),
      notes: [...body.notes, ...ctx.notes],
      timingsMs: ctx.timings,
      cache: ctx.cache(Date.now()),
    };
  }

  // ---------------------------------------------------------------- reactions (reactions-tab design §4)

  /**
   * Reaction outcomes per family, client and masked mobile. 503 when the daily_mobile part fails (a
   * stale snapshot is still served while it refreshes); Redis / Mongo failures null their block + a note.
   */
  async reactions(window: ReactWindow, client: string | null): Promise<any> {
    try {
      return await this.snap(`reactions:${window}:${client ?? '*'}`);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const msg = String((err as Error)?.message ?? err).slice(0, 200);
      this.logger.warn(`monitor reactions ${window} failed: ${msg}`);
      throw new ServiceUnavailableException(`reactions unavailable: ${msg}`);
    }
  }

  /** activeChannels flagged reaction-restricted: total + newly flagged per IST day over 30 days. */
  private restrictedChannels(ctx: Ctx): Promise<{ total: number; byDay: Array<{ day: string; n: number }> }> {
    return this.part<{ total: number; byDay: Array<{ day: string; n: number }> }>(
      ctx,
      'history',
      'react_restricted_channels',
      async (now, t) => {
        const since = new Date(istDayStart(addDays(istDate(now), -29)));
        return readRestrictedChannels(await this.mongoAgg('activeChannels', restrictedChannelsPipeline(since), 'mongo.activeChannels_react_restricted', t));
      },
      this.restrictedCache,
    ).then((l) => l.value);
  }

  /** One read-only Redis pipeline: ZCOUNT hourly/floods, HGETALL state, HLEN restricted per mobile. */
  private async redisReactionState(mobiles: string[], now: number, ctx: Ctx): Promise<Map<string, ReactLive>> {
    if (typeof this.redis?.readPipeline !== 'function') throw new Error('Redis pipeline not configured');
    if (!mobiles.length) return new Map();
    const t = Date.now();
    try {
      const results = await withTimeout(this.redis.readPipeline(reactRedisBatch(mobiles, now)), LIVE_REDIS_DEADLINE_MS, 'redis reaction state');
      return readReactBatch(mobiles, results, now);
    } finally {
      ctx.timings['redis.reaction_state'] = Date.now() - t;
    }
  }

  async buildReactions(window: ReactWindow, client: string | null, now: number, background = false): Promise<any> {
    const ctx = new Ctx(background);
    const w = promoWindows(window, now);
    const intraday = w.intraday;
    const routed = await this.section('routed_columns', ctx, () => this.routedColumns(ctx));
    const routedCols = routed?.mobile ?? [];

    const mobileP: Promise<any[]> = intraday ? this.promoMobilesToday(ctx, routedCols) : this.promoHist(ctx, window as '7d' | '30d', routedCols);
    const [mobileRows, dcH, meta, assigned, live, restricted] = await Promise.all([
      mobileP.catch((err) => {
        const msg = String((err as Error)?.message ?? err).slice(0, 200);
        throw new ServiceUnavailableException(`reaction counts unavailable: ${msg}`);
      }),
      this.section('daily_client', ctx, () => this.dcHist(ctx)),
      this.section('clients', ctx, () => this.clientMeta(ctx)),
      this.section('assigned', ctx, () => this.promoteAssigned(ctx)),
      this.section('heartbeats', ctx, async () => (await this.liveCache.get('all', () => this.loadLive())).value),
      this.section('restricted_channels', ctx, () => this.restrictedChannels(ctx)),
    ]);
    const rows = intraday ? reactRowsFromToday(mobileRows, w.today) : reactRowsFromHist(mobileRows);

    // mobiles listed even with no reactions: active promote mobiles + live tg-aut mobiles
    const entries = (live?.entries ?? []).map((e) => ({ svc: e.svc, clientId: e.clientId, payload: e.payload as Record<string, any> | null, state: classifyHeartbeat(e.payload, now).state }));
    const known: Array<{ family: Family; clientId: string | null; mobile: string }> = (assigned ?? []).map((a) => ({ family: 'promote' as Family, clientId: a.clientId, mobile: a.mobile }));
    for (const e of entries) {
      const m = e.payload?.mobile;
      if (e.svc === 'tg-aut' && m && /^\d{6,}$/.test(String(m)) && (e.state === 'live' || e.state === 'stopping')) known.push({ family: 'tg-aut', clientId: e.clientId, mobile: String(m) });
    }

    // Redis live state for every mobile on the page (fleet-wide: the fleet block uses it too)
    const mobiles = new Set<string>();
    for (const r of rows) if (r.cur && r.mobile && r.family) mobiles.add(r.mobile);
    for (const k of known) mobiles.add(k.mobile);
    const reactLive = await this.section('redis_reactions', ctx, () => this.redisReactionState([...mobiles].sort(), now, ctx));

    const body = buildReactions({
      w,
      rows,
      yesterday: intraday && dcH ? yesterdayTotals(dcH, addDays(w.today, -1), client) : null,
      daily: !intraday && dcH ? reactDaily(dcH, w.range.from, w.range.to, client) : null,
      live: reactLive,
      heartbeats: live ? heartbeatJoins(entries) : null,
      known,
      names: new Map((meta ?? []).map((m) => [m.clientId, m.name])),
      restrictedChannels: restricted,
      client,
      now,
    });
    if (client !== null && meta && !meta.some((m) => m.clientId === client)) ctx.notes.push(`clientId ${client} is not in the clients collection.`);
    return {
      generatedAt: new Date(now).toISOString(),
      ...body,
      notes: [...body.notes, ...ctx.notes],
      timingsMs: ctx.timings,
      cache: ctx.cache(Date.now()),
    };
  }

  // ---------------------------------------------------------------- funnel (design-v2 P3)

  async funnel(period: MonitorPeriod, client: string | null): Promise<any> {
    return this.snap(`funnel:${period}:${client ?? '*'}`);
  }

  /**
   * First attributed DM service of every chat that paid in the history window ('t' direct, 'p' routed),
   * keyed chat|client. History-cached (re-read every 10 min); chat ids stay inside the service.
   */
  private paidOrigin(ctx: Ctx): Promise<Map<string, string | null>> {
    return this.part<Array<[string, string | null]>>(ctx, 'history', 'paid_origin', async (now, t, bg) => {
      const from = this.historyStart(istDate(now));
      const dmFrom = Math.max(from, istDayStart(FAMILY_DMS_FROM));
      const rows = await this.pgRows<{ chat_id: string; client_id: string; service: string | null }>(paidOriginSql(dmFrom, from), t, bg);
      return rows.map((r) => [`${r.chat_id}|${r.client_id}`, r.service ?? null] as [string, string | null]);
    }).then((l) => new Map(l.value));
  }

  /** Route counters per (day, client) when the columns exist: closed days (history) or today. */
  private routedDaily(ctx: Ctx, kind: 'hist' | 'today', cols: string[]): Promise<any[]> {
    if (kind === 'hist') {
      return this.part<any[]>(ctx, 'history', `routed_hist:${cols.join(',')}`, (now, t, bg) => {
        const today = istDate(now);
        return this.pgRows(routedDailySql('routed_hist', addDays(today, -HISTORY_DAYS), addDays(today, -1), cols), t, bg);
      }).then((l) => l.value);
    }
    return this.part<any[]>(ctx, 'today', `routed_today:${cols.join(',')}`, (now, t, bg) => {
      const today = istDate(now);
      return this.pgRows(routedDailySql('routed_today', today, today, cols), t, bg);
    }).then((l) => l.value);
  }

  async buildFunnel(period: MonitorPeriod, client: string | null, now: number, background = false): Promise<any> {
    const ctx = new Ctx(background);
    const w = resolvePeriod(period, now);
    const intraday = !w.wholeDays;
    const days: 7 | 30 = period === '30d' ? 30 : 7;
    const routed = await this.section('routed_columns', ctx, () => this.routedColumns(ctx));
    const routedCols = routed?.client ?? [];
    const [fleet, payH, payT, origin, dmsH, dmY, dmT, dcH, dcT, routedRows, detail] = await Promise.all([
      this.section('summary', ctx, () => this.snap<FleetResponse>(`fleet:${period}`)),
      this.section('revenue', ctx, () => this.payHist(ctx)),
      intraday ? this.section('revenue_today', ctx, () => this.payToday(ctx)) : null,
      this.section('paid_origin', ctx, () => this.paidOrigin(ctx)),
      w.wholeDays ? this.section('dms', ctx, () => this.dmsHist(ctx)) : null,
      intraday ? this.section('dms', ctx, () => this.dmRowsYday(ctx)) : null,
      intraday ? this.section('dms_today', ctx, () => this.dmRowsToday(ctx)) : null,
      w.wholeDays ? this.section('daily_client', ctx, () => this.dcHist(ctx)) : null,
      intraday ? this.section('daily_client_today', ctx, () => this.dcToday(ctx)) : null,
      routedCols.length ? this.section('routed', ctx, () => this.routedDaily(ctx, intraday ? 'today' : 'hist', routedCols)) : null,
      w.wholeDays ? this.section('detail', ctx, () => this.snap<any>(client ? `client:${client}:${days}` : `detail:all:${days}`)) : null,
    ]);
    if (fleet) ctx.merge(fleet.cache, Date.now());
    if (detail) ctx.merge(detail.cache, Date.now());
    const inScope = (c: string | null) => client === null || c === client;

    // DMs per family: direct = tg-aut ('t'), routed = promote ('p')
    let dmsCur: FamSplit<number> | null = null;
    let dmsPrev: FamSplit<number> | null = null;
    if (dmsH) {
      dmsCur = dmsFamilyDays(dmsH, w.range.from, w.range.to);
      dmsPrev = dmsFamilyDays(dmsH, w.prevRange.from, w.prevRange.to);
    } else {
      if (dmT) dmsCur = dmsFamilyRows(dmT.rows);
      if (dmY) dmsPrev = dmsFamilyRows(dmY, (dmT?.asOf ?? now) - DAY_MS);
    }

    // credits of the window (current / previous)
    const curCredits = intraday ? (payT ? payT.rows.filter((c) => c.ms >= w.cur.start && c.ms < payT.asOf) : null) : payH ? payH.filter((c) => c.ms >= w.cur.start && c.ms < w.cur.end) : null;
    const prevEnd = intraday ? (payT?.asOf ?? now) - DAY_MS : w.prev.end;
    const prevCredits = payH ? payH.filter((c) => c.ms >= w.prev.start && c.ms < prevEnd) : null;

    const fleetRow = (f: FleetResponse | null) =>
      !f ? null : client === null ? { cur: f.fleet, prev: f.previous } : (() => {
        const r = f.clients.find((c) => c.clientId === client);
        return r ? { cur: r, prev: r.previous } : { cur: null, prev: null };
      })();
    const fr = fleetRow(fleet);

    const origins = (credits: Credit[] | null, split: FamSplit<number> | null, newUsers: number | null, id: string | null) =>
      funnelOrigins(credits, split, newUsers, origin, id);

    const totals = fr?.cur
      ? { newUsers: fr.cur.newUsers, payers: fr.cur.payers, revenue: fr.cur.revenue, conversion: fr.cur.conversion }
      : { newUsers: null, payers: null, revenue: null, conversion: null };
    const previous = fr?.prev
      ? { newUsers: fr.prev.newUsers, payers: fr.prev.payers, revenue: fr.prev.revenue, conversion: fr.prev.conversion }
      : null;

    // incoming promote DMs (daily_client promote-clients new_users) + route counters
    const dcRows = (dcH ?? dcT ?? []).filter((r) => r.d >= w.range.from && r.d <= w.range.to && inScope(r.client_id));
    const incoming = dcH || dcT ? dcRows.filter((r) => r.namespace === 'promote-clients').reduce((s, r) => s + num(r.ns_new_users), 0) : null;
    let routedOut: Record<string, number | null> | null = null;
    if (routedRows) {
      const sel = routedRows.filter((r) => r.d >= w.range.from && r.d <= w.range.to && inScope(r.client_id));
      const sumOf = (c: string) => (routedCols.includes(c) ? sel.reduce((s, r) => s + num(r[c]), 0) : null);
      const sent = sumOf('routes_sent');
      const reached = sumOf('routed_reached');
      routedOut = {
        routesSent: sent,
        routedReached: reached,
        routeCallsOk: sumOf('route_calls_ok'),
        routeCallsFailed: sumOf('route_calls_failed'),
        reachRate: sent === null || reached === null ? null : ratio(reached, sent),
      };
    }

    const ids = fleet ? fleet.clients.map((c) => c.clientId).filter((id) => inScope(id)) : [];
    const clients = (fleet?.clients ?? [])
      .filter((c) => ids.includes(c.clientId))
      .map((c) => ({
        clientId: c.clientId,
        name: c.name,
        newUsers: c.newUsers,
        payers: c.payers,
        revenue: c.revenue,
        conversion: c.conversion,
        previous: c.previous,
        byOrigin: origins(curCredits, dmsCur, c.newUsers, c.clientId),
      }));

    const daily = detail
      ? (detail.daily as any[]).map((d) => ({
          date: d.date,
          newUsers: d.newUsers,
          payers: d.payers,
          revenue: d.revenue,
          conversion: d.conversion,
          dms: d.dms,
          dmsByFamily: d.byFamily ? { 'tg-aut': d.byFamily['tg-aut'].dms, promote: d.byFamily.promote.dms } : null,
        }))
      : null;

    // client-scoped: fleet totals + origins from the same parts, for "client · fleet" comparisons
    const fleetBlock =
      client !== null && fleet
        ? {
            totals: { newUsers: fleet.fleet.newUsers, payers: fleet.fleet.payers, revenue: fleet.fleet.revenue, conversion: fleet.fleet.conversion },
            byOrigin: origins(curCredits, dmsCur, fleet.fleet.newUsers, null),
          }
        : undefined;

    const notes = [...historyNotes([w.range, w.prevRange]), ...ctx.notes];
    notes.push('byOrigin: direct = first attributed DM from a tg-aut promotion (service t), routed = from a promote account (service p); payers/revenue by origin are attributed only (chats with an attributed DM since 2026-10-25), the rest is unattributed.');
    notes.push('byOrigin newUsers: direct/routed = attributed DMs of that origin; unattributed = newUsers minus both (floored at 0).');
    if (!routedCols.includes('routes_sent')) notes.push('routed: history starts when counters ship (daily_client route columns not present yet).');
    if (intraday) notes.push('timeToFirstPay / repeat are 7d/30d only (null for today); payer origins refresh every 10 min.');
    if (client !== null && fleet && !fleet.clients.some((c) => c.clientId === client)) notes.push(`clientId ${client} has no row in /monitor/fleet for ${period}.`);

    return {
      generatedAt: new Date(now).toISOString(),
      period,
      clientId: client,
      range: w.range,
      previousRange: w.prevRange,
      totals,
      previous,
      byOrigin: origins(curCredits, dmsCur, totals.newUsers, client),
      previousByOrigin: origins(prevCredits, dmsPrev, previous?.newUsers ?? null, client),
      incomingPromoteDms: incoming,
      routed: routedOut,
      clients,
      daily,
      ttfp: detail?.distributions?.timeToFirstPay ?? null,
      repeat: detail?.distributions?.repeat ?? null,
      ...(fleetBlock ? { fleet: fleetBlock } : {}),
      notes,
      timingsMs: ctx.timings,
      cache: ctx.cache(Date.now()),
    };
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
        const item: LiveItem = { ...masked, svc: e.svc, clientId: e.clientId, state: c.state, ageSec: c.ageSec, indexed: e.indexed };
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
    const ctx = new Ctx();
    const meta = await this.section('clients', ctx, () => this.clientMeta(ctx));
    const redisPart = async () => {
      const members = await this.redis.smembers(HEARTBEAT_INDEX_KEY);
      const indexed = new Set(members ?? []);
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
      return keyList.map((k, i) => {
        const e = keys.get(k)!;
        return { ...e, indexed: indexed.has(`${e.svc}::${e.clientId}`), raw: values[i] ?? null };
      });
    };
    const rows = await withTimeout(redisPart(), LIVE_REDIS_DEADLINE_MS, 'redis heartbeat read');
    const entries: LiveEntry[] = rows.map((r) => {
      if (r.raw === null) return { svc: r.svc, clientId: r.clientId, payload: null, indexed: r.indexed };
      try {
        const parsed = JSON.parse(r.raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { svc: r.svc, clientId: r.clientId, payload: parsed, indexed: r.indexed };
      } catch {
        /* fall through */
      }
      return { svc: r.svc, clientId: r.clientId, payload: { at: null }, parseError: true, indexed: r.indexed };
    });
    entries.sort((a, b) => a.svc.localeCompare(b.svc) || a.clientId.localeCompare(b.clientId));
    return { entries, notes: ctx.notes };
  }
}
