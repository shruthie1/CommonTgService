/**
 * Parked follow-through (GET /monitor/parked, /monitor/parked/chat/:chatId), pure. The parked responder
 * (tg-platform @tg/parked) replies to DMs on rotated-out accounts of apps promote and tg-aut and writes one
 * parkedChats row per reply. This file turns those rows plus userData, accountRoleEvents and Postgres money
 * into per-row facts and per-app / per-client stats. No I/O here: the service passes a ParkedIO.
 *
 * Rules (ported from the parked-follow-through skill, 2026-11-15):
 *  - moved, new user (preExisting false): a persona userData row created (ObjectId time) after repliedAt has
 *    its own msgCount > 0; moveAt = the earliest such creation.
 *  - moved, already-user (preExisting true): msgCount of the NEWEST persona row (by lastMsgTimeStamp, as
 *    ParkedChatsRepository.readUserDataCounts picks it) > msgCountAtReply; moveAt = reachedAt when set.
 *  - landed client: stored reachedClientId (rows from 2026-11-15), else the clientId of the newest persona row.
 *  - swap cohorts: a 'became_main' accountRoleEvents row of the replying client in (repliedAt, repliedAt + 24 h].
 *    Known only for replies at least 24 h old and on/after the start of the swap history.
 *  - fake chat: any userData row of the chat (any persona) has fakePaymentAt.
 *  - money: Postgres payment_event_owner only (parkedPaidSql). owner_amount is already 0 for fake-marked chats.
 * Counting: replied/moved count parkedChats rows; paidChats/fakeChats count distinct chats; paidRs counts each
 * chat + persona once per group (its earliest reply in the group, the widest window), so two replies to the
 * same chat never add the same payment twice.
 */
import { SqlQuery } from './monitor-sql';

export const PARKED_APPS = ['promote', 'tg-aut'] as const;
export type ParkedApp = (typeof PARKED_APPS)[number];
const DAY_MS = 86_400_000;
/** parkedChats rows are collected 14 days after insert (gcAt). */
export const PARKED_GC_DAYS = 14;
/** Mongo $in chunk for the userData read (chatId_Profile index prefix). */
export const PARKED_CHAT_CHUNK = 1000;

export interface ParkedRow {
  clientId: string;
  app: string;
  chatId: string;
  persona: string;
  status?: string;
  episodeId?: string;
  repliedAt?: Date | string | null;
  msgCountAtReply?: number;
  preExisting?: boolean;
  reachedAt?: Date | string | null;
  createdAt?: Date | string | null;
  /** Rows from the 2026-11-15 tg-platform build on; often missing on older rows. */
  sentHandle?: string;
  sentMainMobile?: string | null;
  variant?: string;
  replyText?: string;
  reachedClientId?: string | null;
}

export interface UserDataLite {
  _id?: unknown;
  chatId?: string;
  profile?: string;
  msgCount?: number;
  clientId?: string;
  fakePaymentAt?: unknown;
  lastMsgTimeStamp?: unknown;
}

export interface RoleEvent {
  clientId?: string;
  at?: Date | string | number;
}

export interface PaidFact {
  paidRs: number;
  paidCount: number;
}

export interface RowFacts {
  rep: number;
  fake: boolean;
  moved: boolean;
  moveAt: number | null;
  landed: string | null;
}

export interface ParkedFact extends RowFacts {
  clientId: string;
  app: string;
  chatId: string;
  persona: string;
  preExisting: boolean;
  newFields: boolean;
  /** null = Postgres unavailable. */
  paid: PaidFact | null;
  /** true/false = a new main within 24 h after the reply; null = unknown (too recent or before swap history). */
  swap24: boolean | null;
}

export interface Cohort {
  replied: number;
  moved: number;
}

export interface ParkedStats {
  replied: number;
  moved: number;
  newReplied: number;
  newMoved: number;
  alreadyReplied: number;
  alreadyMoved: number;
  paidChats: number | null;
  paidRs: number | null;
  fakeChats: number;
  medianMoveMin: number | null;
  cohortNoSwap24h: Cohort;
  cohortSwap24h: Cohort;
  landedOtherClient: number;
}

export interface ParkedCoverage {
  parkedFrom: string | null;
  swapHistoryFrom: string | null;
  withNewFields: number;
  rows: number;
}

export interface ParkedFold {
  totals: ParkedStats;
  byApp: Record<ParkedApp, ParkedStats>;
  clients: Array<{ clientId: string; app: string } & ParkedStats>;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const tsMs = (v: unknown): number => {
  const ms = v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : v;
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : -Infinity;
};
const msOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const t = tsMs(v);
  return t === -Infinity ? null : t;
};

/** Creation time of an ObjectId (driver object or 24-hex string); null otherwise. */
export function oidMs(id: unknown): number | null {
  if (id && typeof (id as any).getTimestamp === 'function') return (id as any).getTimestamp().getTime();
  const s = typeof id === 'string' ? id : id && typeof (id as any).toHexString === 'function' ? (id as any).toHexString() : null;
  return s && /^[0-9a-f]{24}$/i.test(s) ? parseInt(s.slice(0, 8), 16) * 1000 : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-row facts. `all` = every userData row of the chat (any persona). */
export function rowFacts(r: ParkedRow, all: UserDataLite[]): RowFacts {
  const rep = tsMs(r.repliedAt);
  const own = all.filter((d) => d.profile === r.persona);
  const fake = all.some((d) => d.fakePaymentAt !== null && d.fakePaymentAt !== undefined);
  const newest = (rows: UserDataLite[]) =>
    rows.reduce<UserDataLite | null>((best, d) => (best === null || tsMs(d.lastMsgTimeStamp) >= tsMs(best.lastMsgTimeStamp) ? d : best), null);
  let moved = false;
  let moveAt: number | null = null;
  if (!r.preExisting) {
    const created = own
      .map((d) => ({ d, at: oidMs(d._id) }))
      .filter((x) => num(x.d.msgCount) > 0 && x.at !== null && x.at > rep)
      .map((x) => x.at as number);
    moved = created.length > 0;
    if (moved) moveAt = Math.min(...created);
  } else {
    const row = newest(own);
    moved = row !== null && num(row.msgCount) > (r.msgCountAtReply ?? 0);
    if (moved) moveAt = msOrNull(r.reachedAt);
  }
  const landed =
    'reachedClientId' in r
      ? (r.reachedClientId ?? null)
      : (newest(own.filter((d) => typeof d.clientId === 'string' && d.clientId !== ''))?.clientId ?? null);
  return { rep, fake, moved, moveAt, landed };
}

/** became_main instants per clientId, ascending. */
export function swapIndex(events: RoleEvent[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const e of events) {
    const at = msOrNull(e.at);
    if (!e.clientId || at === null) continue;
    (out.get(e.clientId) ?? out.set(e.clientId, []).get(e.clientId)!).push(at);
  }
  for (const xs of out.values()) xs.sort((a, b) => a - b);
  return out;
}

/** Swap cohort of one reply: null when the reply is under 24 h old or before the swap history starts. */
export function swapWithin24h(swaps: Map<string, number[]>, clientId: string, rep: number, historyStart: number | null, now: number): boolean | null {
  if (historyStart === null || rep < historyStart || rep + DAY_MS > now) return null;
  return (swaps.get(clientId) ?? []).some((t) => t > rep && t <= rep + DAY_MS);
}

/**
 * Facts for every row. `paid[i]` belongs to rows[i] (undefined = no payment); `paid` null = Postgres down.
 */
export function buildFacts(
  rows: ParkedRow[],
  userDataByChat: Map<string, UserDataLite[]>,
  swaps: Map<string, number[]>,
  historyStart: number | null,
  paid: Array<PaidFact | undefined> | null,
  now: number,
): ParkedFact[] {
  return rows.map((r, i) => {
    const f = rowFacts(r, userDataByChat.get(String(r.chatId)) ?? []);
    return {
      ...f,
      clientId: r.clientId,
      app: r.app,
      chatId: String(r.chatId),
      persona: r.persona,
      preExisting: r.preExisting === true,
      newFields: 'sentHandle' in r && r.sentHandle !== undefined,
      paid: paid === null ? null : (paid[i] ?? { paidRs: 0, paidCount: 0 }),
      swap24: swapWithin24h(swaps, r.clientId, f.rep, historyStart, now),
    };
  });
}

function emptyStats(): ParkedStats {
  return {
    replied: 0,
    moved: 0,
    newReplied: 0,
    newMoved: 0,
    alreadyReplied: 0,
    alreadyMoved: 0,
    paidChats: 0,
    paidRs: 0,
    fakeChats: 0,
    medianMoveMin: null,
    cohortNoSwap24h: { replied: 0, moved: 0 },
    cohortSwap24h: { replied: 0, moved: 0 },
    landedOtherClient: 0,
  };
}

/** Stats of one group of facts (see the counting rule at the top). */
export function statsOf(facts: ParkedFact[]): ParkedStats {
  const s = emptyStats();
  const mins: number[] = [];
  const fakes = new Set<string>();
  const money = new Map<string, { rep: number; paid: PaidFact }>();
  let moneyKnown = true;
  for (const f of facts) {
    s.replied += 1;
    if (f.moved) s.moved += 1;
    if (f.preExisting) {
      s.alreadyReplied += 1;
      if (f.moved) s.alreadyMoved += 1;
    } else {
      s.newReplied += 1;
      if (f.moved) s.newMoved += 1;
    }
    if (f.fake) fakes.add(f.chatId);
    if (f.moved && f.moveAt !== null) mins.push((f.moveAt - f.rep) / 60_000);
    if (f.moved && f.landed && f.landed !== f.clientId) s.landedOtherClient += 1;
    if (f.swap24 !== null) {
      const c = f.swap24 ? s.cohortSwap24h : s.cohortNoSwap24h;
      c.replied += 1;
      if (f.moved) c.moved += 1;
    }
    if (f.paid === null) moneyKnown = false;
    else {
      const k = `${f.chatId}|${f.persona}`;
      const prev = money.get(k);
      if (!prev || f.rep < prev.rep) money.set(k, { rep: f.rep, paid: f.paid });
    }
  }
  s.fakeChats = fakes.size;
  const m = median(mins);
  s.medianMoveMin = m === null ? null : Math.round(m);
  if (!moneyKnown) {
    s.paidChats = null;
    s.paidRs = null;
  } else {
    const paidChats = new Set<string>();
    let rs = 0;
    for (const [k, v] of money) {
      if (v.paid.paidRs > 0) paidChats.add(k.slice(0, k.lastIndexOf('|')));
      rs += v.paid.paidRs;
    }
    s.paidChats = paidChats.size;
    s.paidRs = rs;
  }
  return s;
}

/** Totals, per app and per client (replied desc, then clientId). `client` null = every client. */
export function foldParked(facts: ParkedFact[], client: string | null): ParkedFold {
  const scoped = client === null ? facts : facts.filter((f) => f.clientId === client);
  const byApp = {} as Record<ParkedApp, ParkedStats>;
  for (const app of PARKED_APPS) byApp[app] = statsOf(scoped.filter((f) => f.app === app));
  const groups = new Map<string, ParkedFact[]>();
  for (const f of scoped) {
    const k = `${f.app}\u0000${f.clientId}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(f);
  }
  const clients = [...groups.entries()]
    .map(([k, fs]) => {
      const [app, clientId] = k.split('\u0000');
      return { clientId, app, ...statsOf(fs) };
    })
    .sort((a, b) => b.replied - a.replied || a.clientId.localeCompare(b.clientId) || a.app.localeCompare(b.app));
  return { totals: statsOf(scoped), byApp, clients };
}

export function coverageOf(rows: ParkedRow[], parkedFrom: number | null, swapHistoryFrom: number | null): ParkedCoverage {
  return {
    parkedFrom: parkedFrom === null ? null : new Date(parkedFrom).toISOString(),
    swapHistoryFrom: swapHistoryFrom === null ? null : new Date(swapHistoryFrom).toISOString(),
    withNewFields: rows.filter((r) => 'sentHandle' in r && r.sentHandle !== undefined).length,
    rows: rows.length,
  };
}

/** Coverage notes for a window [start, end). */
export function coverageNotes(c: ParkedCoverage, start: number, moneyDown: string | null): string[] {
  const notes: string[] = [];
  if (c.parkedFrom && Date.parse(c.parkedFrom) > start) {
    notes.push(`parkedChats keeps ${PARKED_GC_DAYS} days: replies before ${c.parkedFrom} are gone.`);
  }
  if (!c.swapHistoryFrom) notes.push('No became_main history: swap cohorts are empty.');
  else if (Date.parse(c.swapHistoryFrom) > start) notes.push(`Swap history starts ${c.swapHistoryFrom}: earlier replies stay out of the swap cohorts.`);
  if (c.rows > c.withNewFields) {
    notes.push(`${c.rows - c.withNewFields} of ${c.rows} rows predate the 2026-11-15 fields: landing client falls back to the newest userData row.`);
  }
  if (moneyDown) notes.push(`Money unavailable (Postgres): ${moneyDown}`);
  return notes;
}

// ---------------------------------------------------------------- loading (I/O injected)

export interface ParkedIO {
  find<T = any>(collection: string, filter: object, projection: object, name: string): Promise<T[]>;
  /** First document by `sort` (find().sort().limit(1)); null when none. */
  first<T = any>(collection: string, filter: object, sort: Record<string, 1 | -1>, projection: object, name: string): Promise<T | null>;
  /** Throws when Postgres fails. */
  pg<T = any>(q: SqlQuery): Promise<T[]>;
}

export interface ParkedLoaded {
  /** Every row the filter matched (any status). */
  all: ParkedRow[];
  /** Replied rows; facts[i] belongs to rows[i]. */
  rows: ParkedRow[];
  facts: ParkedFact[];
  /** null when loaded with `coverage: false` (chat route). */
  coverage: { parkedFrom: number | null; swapHistoryFrom: number | null } | null;
  /** Postgres error text; null = money loaded. */
  moneyDown: string | null;
}

export const PARKED_ROW_PROJECTION = {
  _id: 0,
  clientId: 1,
  app: 1,
  chatId: 1,
  persona: 1,
  status: 1,
  repliedAt: 1,
  preExisting: 1,
  msgCountAtReply: 1,
  reachedAt: 1,
  reachedClientId: 1,
  sentHandle: 1,
  sentMainMobile: 1,
  variant: 1,
  replyText: 1,
};

export interface ParkedLoadOpts {
  /** parkedChats filter. The range route's {status, repliedAt} has no matching index (indexes: episodeId+status,
   *  clientId+status+reachedAt+repliedAt, gcAt TTL); the scan is accepted: ~5k docs (14-day gcAt), <= 4 ms (2026-11-15).
   *  The chat route's {chatId} scans the same ~5k docs and is cached 30 s per chat by the service. */
  filter: object;
  /** Money counts credits before this instant. */
  until: number;
  now: number;
  paidSql: (rows: Array<{ chatId: string; persona: string; repliedAt: number }>, until: number) => SqlQuery;
  /** false = no coverage minimums and no swap cohorts (chat route). */
  coverage: boolean;
}

/**
 * Read-only loads: parkedChats rows matching `filter`, userData of their chats (chunks of PARKED_CHAT_CHUNK),
 * became_main events of their clients in (first reply, last reply + 24 h], the two coverage minimums (cheap, see
 * below) when asked, then money from Postgres. A Postgres failure leaves money null.
 */
export async function loadParked(io: ParkedIO, o: ParkedLoadOpts): Promise<ParkedLoaded> {
  const [rows, parkedFirst, swapFirst] = await Promise.all([
    io.find<ParkedRow>('parkedChats', o.filter, PARKED_ROW_PROJECTION, 'mongo.parkedChats'),
    // Oldest row still kept = smallest gcAt (TTL index gcAt_1) - PARKED_GC_DAYS; one index entry read.
    o.coverage ? io.first<{ gcAt?: unknown }>('parkedChats', {}, { gcAt: 1 }, { _id: 0, gcAt: 1 }, 'mongo.parkedChats_from') : null,
    // accountRoleEvents has no {event, at} or {at} index (indexes 2026-11-15: mobile+at, clientId+at, opId+event+mobile):
    // this sorts a collection scan of ~1k docs (explain: 976 examined, 0 ms). Fine while the collection stays small.
    o.coverage ? io.first<{ at?: unknown }>('accountRoleEvents', { event: 'became_main' }, { at: 1 }, { _id: 0, at: 1 }, 'mongo.accountRoleEvents_from') : null,
  ]);
  const replied = rows.filter((r) => r.status === 'replied' && msOrNull(r.repliedAt) !== null);
  const chatIds = [...new Set(replied.map((r) => String(r.chatId)))];
  const clientIds = [...new Set(replied.map((r) => r.clientId))];
  const ud = new Map<string, UserDataLite[]>();
  for (let i = 0; i < chatIds.length; i += PARKED_CHAT_CHUNK) {
    const part = chatIds.slice(i, i + PARKED_CHAT_CHUNK);
    const docs = await io.find<UserDataLite>(
      'userData',
      { chatId: { $in: part } },
      { _id: 1, chatId: 1, profile: 1, msgCount: 1, clientId: 1, fakePaymentAt: 1, lastMsgTimeStamp: 1 },
      'mongo.userData_parked',
    );
    for (const d of docs) {
      const k = String(d.chatId);
      (ud.get(k) ?? ud.set(k, []).get(k)!).push(d);
    }
  }
  let events: RoleEvent[] = [];
  if (o.coverage && clientIds.length) {
    // Only swaps that can fall in some reply's (repliedAt, repliedAt + 24 h]; index clientId_1_at_-1_id_-1.
    const reps = replied.map((r) => tsMs(r.repliedAt));
    const lo = new Date(Math.min(...reps));
    const hi = new Date(Math.max(...reps) + DAY_MS);
    events = await io.find<RoleEvent>(
      'accountRoleEvents',
      { event: 'became_main', clientId: { $in: clientIds }, at: { $gt: lo, $lte: hi } },
      { _id: 0, clientId: 1, at: 1 },
      'mongo.accountRoleEvents_parked',
    );
  }
  let paid: Array<PaidFact | undefined> | null = [];
  let moneyDown: string | null = null;
  if (replied.length) {
    try {
      const pgRows = await io.pg<{ i: number | string; paid_rs: number | string; paid_count: number | string }>(
        o.paidSql(replied.map((r) => ({ chatId: String(r.chatId), persona: r.persona, repliedAt: tsMs(r.repliedAt) })), o.until),
      );
      paid = [];
      for (const p of pgRows) paid[Number(p.i) - 1] = { paidRs: Number(p.paid_rs) || 0, paidCount: Number(p.paid_count) || 0 };
    } catch (err) {
      paid = null;
      moneyDown = String((err as Error)?.message ?? err).slice(0, 200);
    }
  }
  const historyStart = o.coverage ? msOrNull(swapFirst?.at) : null;
  const gc = msOrNull(parkedFirst?.gcAt);
  return {
    all: rows,
    rows: replied,
    facts: buildFacts(replied, ud, swapIndex(events), historyStart, paid, o.now),
    coverage: o.coverage ? { parkedFrom: gc === null ? null : gc - PARKED_GC_DAYS * DAY_MS, swapHistoryFrom: historyStart } : null,
    moneyDown,
  };
}

/** One chat's rows (GET /monitor/parked/chat/:chatId), newest reply first; unreplied rows carry no facts. */
export function chatRows(loaded: ParkedLoaded) {
  const rows = loaded.all;
  const byRow = new Map<ParkedRow, ParkedFact>();
  loaded.rows.forEach((r, i) => byRow.set(r, loaded.facts[i]));
  return rows
    .map((r) => {
      const f = byRow.get(r);
      return {
        clientId: r.clientId,
        app: r.app,
        persona: r.persona,
        status: r.status ?? null,
        repliedAt: r.repliedAt ? new Date(r.repliedAt as any).toISOString() : null,
        ...(r.variant !== undefined ? { variant: r.variant } : {}),
        ...(r.sentHandle !== undefined ? { sentHandle: r.sentHandle } : {}),
        ...(r.replyText !== undefined ? { replyText: r.replyText } : {}),
        preExisting: r.preExisting === true,
        moved: f ? f.moved : false,
        moveAt: f && f.moveAt !== null ? new Date(f.moveAt).toISOString() : null,
        landedClientId: f ? f.landed : null,
        paidRs: f ? (f.paid ? f.paid.paidRs : null) : 0,
        paidCount: f ? (f.paid ? f.paid.paidCount : null) : 0,
        fake: f ? f.fake : false,
      };
    })
    .sort((a, b) => (b.repliedAt ?? '').localeCompare(a.repliedAt ?? ''));
}
