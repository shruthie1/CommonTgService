/**
 * Monitor enrichments (2026-11-15): persona-keyed paid origin, rest flag, per-client previous ban rate,
 * dead channels, attribution per day, multi-client payers and possible double credits.
 */
import {
  attributionDays,
  attributionFirstDay,
  deadChannelsOf,
  deadChannelWindow,
  paymentOverlaps,
  restFlags,
} from '../monitor-enrich';
import { Credit } from '../monitor-merge';
import { attributionDailySql, deadChannelsSql, paidOriginSql, restMobilesSql } from '../monitor-sql';
import { MonitorService } from '../monitor.service';

const NOW = Date.parse('2026-11-15T06:00:00.000Z'); // 11:30 IST
const ist = (s: string) => new Date(Date.parse(`${s}+05:30`));
const nameOf = (sql: string) => (sql.match(/^\/\* monitor\.([a-z_]+) \*\//) ?? [])[1] ?? '?';
type PgHandler = (name: string, params: unknown[]) => any[] | undefined;

function build(pgH: PgHandler) {
  const calls: Array<{ name: string; sql: string; params: unknown[] }> = [];
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      calls.push({ name: nameOf(sql), sql, params });
      const rows = pgH(nameOf(sql), params);
      if (rows === undefined) onError?.({ kind: 'query', message: 'connect ECONNREFUSED' });
      return rows;
    }),
  };
  const mongo = (coll: string) => {
    if (coll === 'clients') return [{ clientId: 'alpha1', name: 'Alpha' }, { clientId: 'alpha2', name: 'Alpha 2' }];
    if (coll === 'activeChannels') return [{ channelId: '-100555', title: 'Dead One' }];
    return [];
  };
  const connection = {
    collection: (coll: string) => ({
      aggregate: () => ({ toArray: async () => mongo(coll) }),
      find: () => ({ toArray: async () => mongo(coll) }),
    }),
  };
  const redis = {
    smembers: jest.fn(async () => []),
    mget: jest.fn(async (keys: string[]) => keys.map(() => null)),
    readPipeline: jest.fn(async (cmds: Array<[string, string]>) => cmds.map(([cmd]) => (cmd === 'hgetall' ? {} : 0))),
  };
  const svc = new MonitorService(pg as any, connection as any, redis as any);
  svc.prewarmDelayMs = -1;
  return { svc, calls };
}

const credit = (chat: string, client: string | null, at: string, amount: number): Credit => ({
  chat,
  client,
  ms: ist(at).getTime(),
  amount,
  revenue: amount < 1000 ? amount : 0,
  gross: amount,
  clean: amount < 1000,
});

describe('SQL builders', () => {
  it('paid origin joins the DM by persona, not by client', () => {
    const o = paidOriginSql(Date.parse('2026-10-24T18:30:00Z'), Date.parse('2026-09-15T18:30:00Z'));
    expect(o.sql).toContain('c.profile = p.persona_id');
    expect(o.sql).not.toMatch(/c\.client_id\s*=\s*p\.client_id/);
    expect(o.params).toEqual(['2026-10-24T18:30:00.000Z', '2026-09-15T18:30:00.000Z']);
  });

  it('rest: one closed day, summed per mobile, rule as typed params (bigint sum vs 0.3 needs the casts)', () => {
    const q = restMobilesSql('2026-11-14');
    expect(q.sql).toContain('FROM daily_mobile');
    expect(q.sql).toContain('WHERE day = $1::date');
    expect(q.sql).toContain('GROUP BY mobile');
    expect(q.sql).toContain('HAVING sum(sent) >= $2::int AND sum(banned) > $3::numeric * sum(sent)');
    expect(q.params).toEqual(['2026-11-14', 20, 0.3]);
  });

  it('dead channels: daily_channel day range, delivered >= 200 and 0 DMs, summary kept with no dead row', () => {
    const q = deadChannelsSql('2026-10-16', '2026-11-14');
    expect(q.sql).toContain('FROM daily_channel WHERE day BETWEEN $1::date AND $2::date');
    expect(q.sql).toContain('delivered >= $3 AND dms = 0');
    expect(q.sql).toContain('LEFT JOIN LATERAL');
    expect(q.params).toEqual(['2026-10-16', '2026-11-14', 200, 50]);
  });

  it('attribution: same persona DM within the lookback before the payment; revenue under ₹1,000', () => {
    const q = attributionDailySql('2026-11-02', '2026-11-14', Date.parse('2026-11-01T18:30:00Z'), Date.parse('2026-11-14T18:30:00Z'));
    expect(q.sql).toContain('c.profile = p.persona_id');
    expect(q.sql).toContain('c.ts <= p.ts AND c.ts >= p.ts - make_interval(days => $5)');
    expect(q.sql).toContain('amount > 0 AND amount < 1000');
    expect(q.sql).toContain('FROM payment_event_owner');
    expect(q.params).toEqual(['2026-11-02', '2026-11-14', '2026-11-01T18:30:00.000Z', '2026-11-14T18:30:00.000Z', 30]);
  });
});

describe('pure folds', () => {
  it('restFlags keeps only rows over the rule', () => {
    const m = restFlags(
      [
        { mobile: '911', sent: '40', banned: '13' }, // 32.5 %
        { mobile: '912', sent: '19', banned: '19' }, // too few sends
        { mobile: '913', sent: '100', banned: '30' }, // exactly 30 %: not above
      ],
      '2026-11-14',
    );
    expect([...m.keys()]).toEqual(['911']);
    expect(m.get('911')).toEqual({ day: '2026-11-14', sent: 40, banned: 13, banRate: 0.325 });
  });

  it('deadChannelsOf: summary, share, titles, fallback title; no dead row = count 0', () => {
    const rows = [
      { total_sent: '1000', n: '2', dead_sent: '450', dead_delivered: '420', channel_id: '555', sent: '250', delivered: '230' },
      { total_sent: '1000', n: '2', dead_sent: '450', dead_delivered: '420', channel_id: '-1001234', sent: '200', delivered: '190' },
    ];
    const d = deadChannelsOf(rows, new Map([['555', 'Dead One']]), '2026-10-16', '2026-11-14');
    expect(d).toMatchObject({ count: 2, sends: 450, delivered: 420, totalSends: 1000, shareOfSends: 0.45, days: 30, minDelivered: 200 });
    expect(d.channels).toEqual([
      { title: 'Dead One', sends: 250, delivered: 230 },
      { title: 'channel …1234', sends: 200, delivered: 190 },
    ]);
    const none = deadChannelsOf([{ total_sent: '1000', n: '0', dead_sent: '0', dead_delivered: '0', channel_id: null }], new Map(), 'a', 'b');
    expect(none).toMatchObject({ count: 0, sends: 0, shareOfSends: 0, channels: [] });
    expect(deadChannelWindow('2026-11-15')).toEqual({ from: '2026-10-16', to: '2026-11-14' });
  });

  it('attributionFirstDay: retention minus lookback, never before the table start + lookback', () => {
    expect(attributionFirstDay('2026-11-15')).toBe('2026-11-02');
    expect(attributionFirstDay('2026-12-20')).toBe('2026-11-18');
  });

  it('attributionDays: per day in range, client scope, shares', () => {
    const rows = [
      { d: '2026-11-13', client_id: 'alpha1', new_users: '100', dms: '50', revenue: '1000', revenue_dm: '700' },
      { d: '2026-11-13', client_id: 'alpha2', new_users: '100', dms: '30', revenue: '0', revenue_dm: '0' },
      { d: '2026-11-14', client_id: null, new_users: '0', dms: '4', revenue: '0', revenue_dm: '0' },
      { d: '2026-11-01', client_id: 'alpha1', new_users: '9', dms: '9', revenue: '9', revenue_dm: '9' },
    ];
    expect(attributionDays(rows, '2026-11-02', '2026-11-14', null)).toEqual([
      { date: '2026-11-13', newUsers: 200, dmUsers: 80, newUserChannelShare: 0.4, revenue: 1000, revenueWithDm: 700, revenueDmShare: 0.7 },
      { date: '2026-11-14', newUsers: 0, dmUsers: 4, newUserChannelShare: null, revenue: 0, revenueWithDm: 0, revenueDmShare: null },
    ]);
    expect(attributionDays(rows, '2026-11-02', '2026-11-14', 'alpha2')).toEqual([
      { date: '2026-11-13', newUsers: 100, dmUsers: 30, newUserChannelShare: 0.3, revenue: 0, revenueWithDm: 0, revenueDmShare: null },
    ]);
  });

  it('paymentOverlaps: multi-client chats and consecutive same-amount credits within 120 s', () => {
    const cs = [
      credit('c1', 'alpha1', '2026-11-14T10:00:00', 50),
      credit('c1', 'alpha2', '2026-11-14T10:01:00', 50), // cross-client pair (60 s)
      credit('c1', 'alpha2', '2026-11-14T10:05:00', 50), // 240 s after: not a pair
      credit('c2', 'alpha1', '2026-11-14T11:00:00', 100),
      credit('c2', 'alpha1', '2026-11-14T11:02:00', 100), // same client, 120 s: pair
      credit('c2', 'alpha1', '2026-11-14T11:02:30', 200), // other amount
      credit('c3', 'alpha2', '2026-11-14T12:00:00', 30),
    ];
    expect(paymentOverlaps(cs, null)).toEqual({ multiClientChats: 1, doublePairs: 2, crossClientPairs: 1, doubleAmount: 150, windowSec: 120 });
    expect(paymentOverlaps(cs, 'alpha2')).toEqual({ multiClientChats: 1, doublePairs: 1, crossClientPairs: 1, doubleAmount: 50, windowSec: 120 });
    expect(paymentOverlaps([], null)).toEqual({ multiClientChats: 0, doublePairs: 0, crossClientPairs: 0, doubleAmount: 0, windowSec: 120 });
  });
});

// ---------------------------------------------------------------- service

const ts = (s: string) => ist(s).toISOString();
const SENDS = [
  { cur: true, service: 't', client_id: 'alpha1', mobile: '919811110001', error_type: null, sent: '50', delivered: '30', banned: '20', failed: '20', last_ts: ts('2026-11-15T10:00:00') },
  { cur: true, service: 't', client_id: 'alpha1', mobile: '919811110002', error_type: null, sent: '50', delivered: '50', banned: '0', failed: '0', last_ts: ts('2026-11-15T10:30:00') },
  { cur: false, service: 't', client_id: 'alpha1', mobile: '919811110001', error_type: null, sent: '100', delivered: '90', banned: '10', failed: '10', last_ts: ts('2026-11-14T10:00:00') },
];

function pgPromo(rest: 'ok' | 'fail'): PgHandler {
  return (name) => {
    if (name === 'promo_sends') return SENDS;
    if (name === 'rest_mobiles') return rest === 'fail' ? undefined : [{ mobile: '919811110001', sent: '60', banned: '30' }];
    return [];
  };
}

describe('promotions: rest flag and per-client previous', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('rest flag on the mobile flagged yesterday, masked; previous per client; rule note', async () => {
    const { svc, calls } = build(pgPromo('ok'));
    const r = await svc.promotions('today', null);
    const t = r.families['tg-aut'];
    expect(t.mobiles.find((m: any) => m.mobile === '••••0001').rest).toEqual({ day: '2026-11-14', sent: 60, banned: 30, banRate: 0.5 });
    expect(t.mobiles.find((m: any) => m.mobile === '••••0002').rest).toBeNull();
    expect(t.clients.find((c: any) => c.clientId === 'alpha1').previous).toEqual({ sent: 100, delivered: 90, banned: 10, deliveryRate: 0.9, banRate: 0.1 });
    expect(t.clients.find((c: any) => c.clientId === 'alpha1').banRate).toBe(0.2);
    expect(calls.find((c) => c.name === 'rest_mobiles')!.params).toEqual(['2026-11-14', 20, 0.3]);
    expect(r.notes.join(' ')).toContain('mobiles[].rest');
    expect(JSON.stringify(r)).not.toContain('919811110001');
  });

  it('rest SQL failure: page still served, rest left out (UI hides the badge)', async () => {
    const { svc } = build(pgPromo('fail'));
    const r = await svc.promotions('today', null);
    expect(r.families['tg-aut'].mobiles).toHaveLength(2);
    expect('rest' in r.families['tg-aut'].mobiles[0]).toBe(false);
  });
});

describe('fleet detail: dead channels', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const pg: PgHandler = (name) =>
    name === 'dead_channels'
      ? [{ total_sent: '2000', n: '1', dead_sent: '300', dead_delivered: '250', channel_id: '-100555', sent: '300', delivered: '250' }]
      : [];

  it('fleet scope: deadChannels over the last 30 closed days with titles; client scope: no field', async () => {
    const { svc, calls } = build(pg);
    const f = await svc.buildFleetDetail(7, NOW);
    expect(f.deadChannels).toMatchObject({ from: '2026-10-16', to: '2026-11-14', count: 1, sends: 300, totalSends: 2000, shareOfSends: 0.15 });
    expect(f.deadChannels.channels).toEqual([{ title: 'Dead One', sends: 300, delivered: 250 }]);
    expect(calls.find((c) => c.name === 'dead_channels')!.params).toEqual(['2026-10-16', '2026-11-14', 200, 50]);
    const c = await svc.buildClient('alpha1', 7, NOW);
    expect('deadChannels' in c).toBe(false);
  });
});

describe('funnel: attribution per day and payment overlaps', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const PAY = [
    { client_id: 'alpha1', ts: ist('2026-11-13T09:00:00'), chat_id: 'c1', amount: 50, owner_amount: 50, cheat_flagged: false },
    { client_id: 'alpha2', ts: ist('2026-11-13T09:01:00'), chat_id: 'c1', amount: 50, owner_amount: 50, cheat_flagged: false },
  ];
  const ATTR = [
    { d: '2026-11-13', client_id: 'alpha1', new_users: '10', dms: '5', revenue: '50', revenue_dm: '50' },
    { d: '2026-11-13', client_id: 'alpha2', new_users: '10', dms: '1', revenue: '50', revenue_dm: '0' },
    { d: '2026-11-02', client_id: 'alpha1', new_users: '10', dms: '5', revenue: '0', revenue_dm: '0' },
  ];
  const pg: PgHandler = (name) => (name === 'pay_hist' ? PAY : name === 'attribution_daily' ? ATTR : []);

  it('7d: attribution rows of the range only; overlaps of the window credits; one attribution read', async () => {
    const { svc, calls } = build(pg);
    const r = await svc.funnel('7d', null);
    expect(r.attribution).toEqual({
      from: '2026-11-02',
      lookbackDays: 30,
      daily: [{ date: '2026-11-13', newUsers: 20, dmUsers: 6, newUserChannelShare: 0.3, revenue: 100, revenueWithDm: 50, revenueDmShare: 0.5 }],
    });
    expect(r.paymentOverlaps).toEqual({ multiClientChats: 1, doublePairs: 1, crossClientPairs: 1, doubleAmount: 50, windowSec: 120 });
    const q = calls.filter((c) => c.name === 'attribution_daily');
    expect(q).toHaveLength(1);
    expect(q[0].params.slice(0, 2)).toEqual(['2026-11-02', '2026-11-14']);
    expect(JSON.stringify(r)).not.toContain('"c1"');
  });

  it('client scope filters attribution; attribution SQL failure = attribution null, page served', async () => {
    const { svc } = build(pg);
    const r = await svc.funnel('7d', 'alpha2');
    expect(r.attribution.daily).toEqual([{ date: '2026-11-13', newUsers: 10, dmUsers: 1, newUserChannelShare: 0.1, revenue: 50, revenueWithDm: 0, revenueDmShare: 0 }]);
    const b = build((n) => (n === 'attribution_daily' ? undefined : pg(n, [])));
    const r2 = await b.svc.funnel('7d', null);
    expect(r2.attribution).toBeNull();
    expect(r2.totals).toBeDefined();
  });

  it('today: no attribution read (closed days only)', async () => {
    const { svc, calls } = build(pg);
    const r = await svc.funnel('today', null);
    expect(r.attribution).toBeNull();
    expect(calls.some((c) => c.name === 'attribution_daily')).toBe(false);
  });
});
