/**
 * Fixture parts for the from..to range tests (design 2026-10-31) and the legacy-response pin. Postgres
 * handlers answer by query name and honour the date/ts params of the queries the range code reads per
 * range; Mongo userData cohorts are computed from a small list of users (created / first paid).
 * Plain module (not a spec): the same file builds the legacy golden on the pre-change code.
 */
import { MonitorService } from '../monitor.service';

export const NOW = Date.parse('2026-10-31T10:00:00.000Z'); // 15:30 IST
export const DAY = 86_400_000;
export const ist = (s: string) => Date.parse(`${s}+05:30`);
const nameOf = (sql: string) => (sql.match(/^\/\* monitor\.([a-z_]+) \*\//) ?? [])[1] ?? '?';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
const TODAY = '2026-10-31';
const YDAY = '2026-10-30';

export const CLIENTS = [
  { clientId: 'alpha1', name: 'Alpha', promoteRepl: 'https://p' },
  { clientId: 'beta1', name: 'Beta', promoteRepl: '' },
  { clientId: 'gamma1', name: 'Gamma', promoteRepl: '' },
];
const PROMOTE_ACTIVE = [
  { mobile: '919876540001', clientId: 'alpha1' },
  { mobile: '919876540002', clientId: 'alpha1' },
];

// ---- payment_event credits
const pay = (client_id: string | null, at: string, chat_id: string, amount: number, cheat = false) => ({
  client_id,
  ts: new Date(ist(at)),
  chat_id,
  amount,
  owner_amount: amount,
  cheat_flagged: cheat,
});
export const PAY_HIST = days('2026-09-25', YDAY).flatMap((d) => [
  pay('alpha1', `${d}T10:00:00`, `a-${d}-1`, 100),
  pay('alpha1', `${d}T12:00:00`, 'a-rep', 50),
  pay('alpha1', `${d}T20:00:00`, `a-${d}-2`, 250),
  pay('beta1', `${d}T09:00:00`, `b-${d}`, 350),
  ...(d === '2026-10-20' ? [pay('beta1', `${d}T13:00:00`, 'b-big', 1200), pay('beta1', `${d}T14:00:00`, 'b-cheat', 600, true)] : []),
]);
export const PAY_TODAY = [pay('alpha1', `${TODAY}T08:00:00`, 'a-t1', 100), pay('alpha1', `${TODAY}T15:00:00`, 'a-t2', 600), pay('beta1', `${TODAY}T11:00:00`, 'b-t1', 200)];

// ---- daily_client
const dc = (d: string, client_id: string, namespace: string, sent: number, new_users: number, ns_new_users = new_users) => ({
  d,
  client_id,
  namespace,
  sent: String(sent),
  delivered: String(Math.round(sent * 0.9)),
  banned: String(Math.round(sent * 0.05)),
  failed: '1',
  new_users: String(new_users),
  ns_new_users: String(ns_new_users),
  reactions_success: '4',
  reactions_restricted: '1',
  reactions_failed: '0',
  reactions_floods: '1',
});
export const DC_ROWS = days('2026-09-25', TODAY).flatMap((d) => {
  const k = d === TODAY ? 0.2 : 1;
  return [dc(d, 'alpha1', 'tg-aut', 100 * k, 40 * k), dc(d, 'alpha1', 'promote-clients', 50 * k, 0, 6), dc(d, 'beta1', 'tg-aut', 30 * k, 10 * k)];
});

// ---- conversion_event DMs
export const DMS_HIST = days('2026-10-20', YDAY).flatMap((d) => [
  { d, client_id: 'alpha1', g: 1, dms: '3' },
  { d, client_id: 'alpha1', service: 't', g: 0, dms: '2' },
  { d, client_id: 'alpha1', service: 'p', g: 0, dms: '1' },
  { d, client_id: 'beta1', g: 1, dms: '1' },
  { d, client_id: 'beta1', service: 't', g: 0, dms: '1' },
  { d, client_id: null, g: 1, dms: '1' },
  { d, client_id: null, service: null, g: 0, dms: '1' },
]);
const dmr = (client_id: string | null, conversion_id: string, at: string, service: string | null) => ({ client_id, channel_id: '777', conversion_id, ts: new Date(ist(at)), service });
export const DM_TODAY = [dmr('alpha1', 't:1', `${TODAY}T08:00:00`, 't'), dmr('alpha1', 'p:1', `${TODAY}T10:00:00`, 'p'), dmr('beta1', 't:2', `${TODAY}T11:00:00`, 't')];
export const DM_YDAY = [dmr('alpha1', 'y:1', `${YDAY}T09:00:00`, 't'), dmr('alpha1', 'y:2', `${YDAY}T20:00:00`, 'p')];

// ---- daily_mobile per day
const dmob = (d: string, namespace: string, client_id: string, mobile: string, sent: number, new_users: number, profile: string | null) => ({
  d,
  namespace,
  client_id,
  mobile,
  profile,
  sent: String(sent),
  delivered: String(Math.round(sent / 2)),
  banned: '1',
  failed: '2',
  new_users: String(new_users),
  reactions_success: '5',
  reactions_restricted: '1',
  reactions_failed: '1',
  reactions_floods: d.endsWith('5') ? '2' : '0',
});
export const MOBILE_DAYS = days('2026-10-10', YDAY).flatMap((d) => [
  dmob(d, 'promote-clients', 'alpha1', '919876540001', 100, 3, d < '2026-10-20' ? 'alpha' : 'alpha2'),
  dmob(d, 'tg-aut', 'alpha1', '919811110000', 40, 7, null),
  ...(d >= '2026-10-15' ? [dmob(d, 'tg-aut', 'beta1', '919822220000', 20, 2, 'beta')] : []),
]);
const sums = ['sent', 'delivered', 'banned', 'failed', 'new_users', 'reactions_success', 'reactions_restricted', 'reactions_failed', 'reactions_floods'];
/** promo_mobiles_hist as Postgres computes it: params [prevFrom, curFrom, to]. */
export function promoHistRows(params: unknown[]): any[] {
  const [prevFrom, curFrom, to] = params as string[];
  const out = new Map<string, any>();
  for (const r of MOBILE_DAYS) {
    if (r.d < prevFrom || r.d > to) continue;
    const cur = r.d >= curFrom;
    const k = `${cur}|${r.namespace}|${r.client_id}|${r.mobile}`;
    const a = out.get(k) ?? { cur, namespace: r.namespace, client_id: r.client_id, mobile: r.mobile, profile: null, last_day: null, ...Object.fromEntries(sums.map((c) => [c, 0])) };
    for (const c of sums) a[c] += Number((r as any)[c]);
    if (r.profile && (a.profile === null || r.profile > a.profile)) a.profile = r.profile;
    if (a.last_day === null || r.d > a.last_day) a.last_day = r.d;
    out.set(k, a);
  }
  return [...out.values()].map((a) => ({ ...a, ...Object.fromEntries(sums.map((c) => [c, String(a[c])])) }));
}
const PROMO_SENDS = [
  { cur: true, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: null, sent: '30', delivered: '20', banned: '0', failed: '0', last_ts: new Date(ist(`${TODAY}T15:00:00`)).toISOString() },
  { cur: true, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: 'FLOOD', sent: '5', delivered: '0', banned: '0', failed: '5', last_ts: new Date(ist(`${TODAY}T15:10:00`)).toISOString() },
  { cur: true, service: 't', client_id: 'beta1', mobile: '919822220000', error_type: null, sent: '9', delivered: '9', banned: '0', failed: '0', last_ts: new Date(ist(`${TODAY}T12:00:00`)).toISOString() },
  { cur: false, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: null, sent: '80', delivered: '60', banned: '0', failed: '0', last_ts: new Date(ist(`${YDAY}T15:00:00`)).toISOString() },
];
const PROMO_MOBILES_TODAY = [
  { namespace: 'promote-clients', client_id: 'alpha1', mobile: '919876540001', profile: 'alpha2', new_users: '4', reactions_success: '2', reactions_restricted: '0', reactions_failed: '0', reactions_floods: '0' },
  { namespace: 'tg-aut', client_id: 'beta1', mobile: '919822220000', profile: 'beta', new_users: '1', reactions_success: '1', reactions_restricted: '0', reactions_failed: '1', reactions_floods: '0' },
];

const between = <T extends { d: string }>(rows: T[], from: unknown, to: unknown): T[] => rows.filter((r) => r.d >= String(from) && r.d <= String(to));
const inTs = <T extends { ts: Date }>(rows: T[], start: unknown, end?: unknown) =>
  rows.filter((r) => r.ts.getTime() >= Date.parse(String(start)) && (end === undefined || r.ts.getTime() < Date.parse(String(end))));

export function pgFixture(name: string, _sql: string, params: unknown[]): any[] | undefined {
  switch (name) {
    case 'pay_hist':
      return inTs(PAY_HIST, params[0], params[1]);
    case 'pay_today':
      return inTs(PAY_TODAY, params[0]);
    case 'dc_hist':
    case 'dc_today':
      return between(DC_ROWS, params[0], params[1]);
    case 'dms_hist':
      return DMS_HIST.filter((r) => ist(`${r.d}T00:00:00`) >= Date.parse(String(params[0])) && ist(`${r.d}T00:00:00`) < Date.parse(String(params[1])));
    case 'dm_rows_today':
      return DM_TODAY;
    case 'dm_rows_yday':
      return DM_YDAY;
    case 'sends_live':
      return [
        { client_id: 'alpha1', today: true, h: 9, service: 't', sent: '10', delivered: '9', banned: '1', failed: '0' },
        { client_id: 'beta1', today: true, h: 14, service: 'p', sent: '6', delivered: '5', banned: '0', failed: '1' },
        { client_id: 'alpha1', today: false, h: 9, service: 't', sent: '7', delivered: '7', banned: '0', failed: '0' },
      ];
    case 'sends_yday_hourly':
      return [
        { client_id: 'alpha1', h: 9, sent: '12' },
        { client_id: 'beta1', h: 14, sent: '4' },
      ];
    case 'mobiles_hist':
    case 'mobiles_today':
      return between(MOBILE_DAYS, params[0], params[1]).map((r) => ({
        mobile: r.mobile,
        client_id: r.client_id,
        namespace: r.namespace,
        new_users: r.namespace === 'tg-aut' ? r.new_users : '0',
        dms: r.namespace === 'promote-clients' ? r.new_users : '0',
        sent: r.sent,
        delivered: r.delivered,
        banned: r.banned,
        first_day: r.d,
        last_day: r.d,
      }));
    case 'promo_mobile_days':
      return between(MOBILE_DAYS, params[0], params[1]);
    case 'promo_mobiles_hist':
      return promoHistRows(params);
    case 'promo_mobiles_today':
      return PROMO_MOBILES_TODAY;
    case 'promo_sends':
      return PROMO_SENDS;
    case 'paid_origin':
      return [
        { chat_id: 'a-rep', client_id: 'alpha1', service: 't' },
        { chat_id: 'b-t1', client_id: 'beta1', service: 'p' },
      ];
    default:
      return [];
  }
}

// ---- Mongo: userData cohorts from users { c, created, paid }
const USERS = days('2026-09-25', TODAY).flatMap((d) => [
  ...[0, 1, 2, 3].map((i) => ({ c: 'alpha1', created: ist(`${d}T${String(9 + i).padStart(2, '0')}:00:00`), paid: i === 0 ? ist(`${d}T14:00:00`) : null })),
  { c: 'beta1', created: ist(`${d}T10:30:00`), paid: d === TODAY ? ist(`${d}T12:00:00`) : null },
  { c: 'beta1', created: ist(`${d}T16:30:00`), paid: null },
]);
const istD = (ms: number) => new Date(ms + 19_800_000).toISOString().slice(0, 10);
const istH = (ms: number) => new Date(ms + 19_800_000).getUTCHours();

function cohorts(p: any[]): any[] {
  const m = p[0].$match._id;
  const start = m.$gte.getTimestamp().getTime();
  const end = m.$lt.getTimestamp().getTime();
  const byHour = !!p[1].$project.h.$hour;
  const and = p[1].$project.pd.$cond[0].$and as any[];
  const paidBefore = and.length > 1 ? and[1].$lt[1] : null;
  const out = new Map<string, any>();
  for (const u of USERS) {
    if (u.created < start || u.created >= end || u.created >= NOW) continue;
    const d = istD(u.created);
    const h = byHour ? istH(u.created) : null;
    const k = `${u.c}|${d}|${h}`;
    const e = out.get(k) ?? { _id: { c: u.c, d, ...(h === null ? {} : { h }) }, n: 0, same: 0 };
    e.n += 1;
    if (u.paid !== null && u.paid <= NOW && (paidBefore === null || u.paid < paidBefore) && istD(u.paid) === d) e.same += 1;
    out.set(k, e);
  }
  return [...out.values()];
}

export function mongoFixture(coll: string, op: string, arg: any): any[] {
  if (coll === 'clients') return CLIENTS;
  if (coll === 'promoteClients' && op === 'find') return PROMOTE_ACTIVE;
  if (coll === 'promoteClients') return [{ _id: 'alpha1', active: 2 }];
  if (coll === 'bufferClients') return [{ _id: 'alpha1', total: 5, eligible: 3, harsh: 0 }];
  if (coll === 'userData' && op === 'aggregate' && arg?.[2]?.$group) return cohorts(arg);
  return [];
}

export function redisFixture(store?: Map<string, string>) {
  const hb = (o: object) => JSON.stringify({ v: 1, ts: NOW - 10_000, ...o });
  return {
    smembers: async () => ['promote::alpha1', 'tg-aut::alpha1'],
    mget: async (keys: string[]) =>
      keys.map((k) => {
        if (k === 'heartbeat::promote::alpha1') return hb({ mobiles: [{ mobile: '••••0001', connected: true, health: 'ok' }] });
        if (k === 'heartbeat::tg-aut::alpha1') return hb({ mobile: '919811110000', telegramReady: true });
        return null;
      }),
    readPipeline: async (cmds: Array<[string, string]>) => cmds.map(([cmd]) => (cmd === 'hgetall' ? {} : 0)),
    ...(store
      ? {
          get: async (k: string) => store.get(k) ?? null,
          set: async (k: string, v: string) => {
            store.set(k, v);
            return 'OK';
          },
        }
      : {}),
  };
}

export function buildService(opts: { store?: Map<string, string>; pg?: typeof pgFixture } = {}) {
  const calls: Array<{ name: string; params: unknown[] }> = [];
  const handler = opts.pg ?? pgFixture;
  const pg = {
    isEnabled: () => true,
    query: async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      calls.push({ name: nameOf(sql), params });
      const rows = handler(nameOf(sql), sql, params);
      if (rows === undefined) onError?.({ kind: 'query', message: 'connect ECONNREFUSED' });
      return rows;
    },
  };
  const connection = {
    collection: (coll: string) => ({
      aggregate: (p: any) => ({ toArray: async () => mongoFixture(coll, 'aggregate', p) }),
      find: (f: any) => ({ toArray: async () => mongoFixture(coll, 'find', f) }),
    }),
  };
  const svc = new MonitorService(pg as any, connection as any, redisFixture(opts.store) as any);
  svc.prewarmDelayMs = -1;
  return { svc, calls };
}

/** Responses of every legacy param the pin covers, each from a fresh service; timings dropped (wall-clock). */
export async function legacyResponses(): Promise<Record<string, unknown>> {
  const cases: Array<[string, (s: MonitorService) => Promise<any>]> = [
    ['fleet?period=today', (s) => s.fleet('today')],
    ['fleet?period=7d', (s) => s.fleet('7d')],
    ['fleet?period=30d', (s) => s.fleet('30d')],
    ['fleet/detail?days=7', (s) => s.fleetDetail(7)],
    ['client/alpha1?days=30', (s) => s.client('alpha1', 30)],
    ['funnel?period=7d', (s) => s.funnel('7d', null)],
    ['funnel?period=today&client=alpha1', (s) => s.funnel('today', 'alpha1')],
    ['promotions?window=today', (s) => s.promotions('today', null)],
    ['promotions?window=7d&client=alpha1', (s) => s.promotions('7d', 'alpha1')],
    ['promotions?window=24h', (s) => s.promotions('24h', null)],
    ['reactions?window=7d', (s) => s.reactions('7d', null)],
    ['reactions?window=today&client=alpha1', (s) => s.reactions('today', 'alpha1')],
  ];
  const out: Record<string, unknown> = {};
  for (const [k, fn] of cases) {
    const { svc } = buildService();
    const r = await fn(svc);
    out[k] = JSON.parse(JSON.stringify(r, (key, v) => (key === 'timingsMs' ? undefined : v)));
  }
  return out;
}
