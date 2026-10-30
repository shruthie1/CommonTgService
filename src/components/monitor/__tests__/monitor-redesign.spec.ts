/**
 * Monitor redesign (design-v2, 2026-10-29): P0 live `indexed`, P2 byFamily (merged numbers unchanged),
 * P1 GET /monitor/promotions, P3 GET /monitor/funnel.
 */
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { dmsFamilyDays, familyOf, sendsByFamily } from '../monitor-family';
import { dmsByDate, mergeMobiles, sumDmsDays } from '../monitor-merge';
import { looksLimited, parseSpam, promoWindows } from '../monitor-promotions';
import { dailyClientSql, dmsByDaySql, mobilesSql, paidOriginSql, promoMobilesHistSql, promoSendsSql, routedDailySql, sendsLiveSql } from '../monitor-sql';
import { MonitorController, parseWindow } from '../monitor.controller';
import { MonitorService } from '../monitor.service';

const NOW = Date.parse('2026-10-28T10:12:10.000Z'); // 15:42:10 IST
const DAY = 86_400_000;
const TODAY0 = Date.parse('2026-10-27T18:30:00.000Z');
const ist = (s: string) => new Date(Date.parse(`${s}+05:30`));
const nameOf = (sql: string) => (sql.match(/^\/\* monitor\.([a-z_]+) \*\//) ?? [])[1] ?? '?';

type PgHandler = (name: string, sql: string, params: unknown[]) => any[] | undefined;

function build(pgH: PgHandler, mongoH: (coll: string, op: string, arg: any) => any[], redis: any) {
  const calls: Array<{ name: string; sql: string; params: unknown[] }> = [];
  const pg = {
    isEnabled: () => true,
    query: jest.fn(async (sql: string, params: unknown[], onError?: (e: any) => void) => {
      calls.push({ name: nameOf(sql), sql, params });
      const rows = pgH(nameOf(sql), sql, params);
      if (rows === undefined) onError?.({ kind: 'query', message: 'connect ECONNREFUSED' });
      return rows;
    }),
  };
  const connection = {
    collection: (coll: string) => ({
      aggregate: (p: any) => ({ toArray: async () => mongoH(coll, 'aggregate', p) }),
      find: (f: any) => ({ toArray: async () => mongoH(coll, 'find', f) }),
    }),
  };
  const svc = new MonitorService(pg as any, connection as any, redis);
  svc.prewarmDelayMs = -1;
  return { svc, calls };
}

const CLIENTS = [
  { clientId: 'alpha1', name: 'Alpha', promoteRepl: 'https://p' },
  { clientId: 'beta1', name: 'Beta', promoteRepl: '' },
];
const PROMOTE_ACTIVE = [
  { mobile: '919876540001', clientId: 'alpha1' },
  { mobile: '919876540002', clientId: 'alpha1' },
];

function mongo(coll: string, op: string, arg: any): any[] {
  if (coll === 'clients') return CLIENTS;
  if (coll === 'promoteClients' && op === 'find') {
    expect(arg).toEqual({ status: 'active' });
    return PROMOTE_ACTIVE;
  }
  if (coll === 'promoteClients') return [{ _id: 'alpha1', active: 2 }];
  return [];
}

const ts = (s: string) => ist(s).toISOString();
const SENDS = [
  { cur: true, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: null, sent: '300', delivered: '6', banned: '0', failed: '0', last_ts: ts('2026-10-28T15:00:00') },
  { cur: true, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: 'FLOOD', sent: '10', delivered: '0', banned: '0', failed: '10', last_ts: ts('2026-10-28T15:10:00') },
  { cur: true, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: 'PEER_FLOOD', sent: '3', delivered: '0', banned: '0', failed: '3', last_ts: ts('2026-10-28T14:00:00') },
  { cur: true, service: 't', client_id: 'alpha1', mobile: '919811110000', error_type: null, sent: '100', delivered: '80', banned: '15', failed: '0', last_ts: ts('2026-10-28T15:30:00') },
  { cur: true, service: 't', client_id: 'beta1', mobile: '919822220000', error_type: null, sent: '40', delivered: '40', banned: '0', failed: '0', last_ts: ts('2026-10-28T12:00:00') },
  { cur: true, service: null, client_id: null, mobile: '919833330000', error_type: null, sent: '5', delivered: '5', banned: '0', failed: '0', last_ts: ts('2026-10-28T09:00:00') },
  { cur: false, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: null, sent: '200', delivered: '150', banned: '0', failed: '0', last_ts: ts('2026-10-27T15:00:00') },
];
const dm = (client_id: string | null, conversion_id: string, at: Date, service: string | null) => ({ client_id, channel_id: '777', conversion_id, ts: at, service });

function pgToday(name: string): any[] | undefined {
  switch (name) {
    case 'promo_sends':
      return SENDS;
    case 'promo_mobiles_today':
      return [{ namespace: 'promote-clients', client_id: 'alpha1', mobile: '919876540001', profile: 'alpha', new_users: '4' }];
    case 'dm_rows_today':
      return [
        dm('alpha1', 't:1', ist('2026-10-28T08:00:00'), 't'),
        dm('alpha1', 't:2', ist('2026-10-28T09:00:00'), 't'),
        dm('alpha1', 'p:1', ist('2026-10-28T10:00:00'), 'p'),
        dm(null, 'x:1', ist('2026-10-28T10:00:00'), null),
      ];
    case 'dm_rows_yday':
      return [dm('alpha1', 't:y1', ist('2026-10-27T08:00:00'), 't'), dm('alpha1', 'p:y1', ist('2026-10-27T20:00:00'), 'p')];
    default:
      return [];
  }
}

function pipelineRedis(opts: { fail?: boolean } = {}) {
  const hb = (o: object) => JSON.stringify({ v: 1, ts: NOW - 10_000, ...o });
  return {
    smembers: jest.fn(async () => ['promote::alpha1', 'tg-aut::alpha1']),
    mget: jest.fn(async (keys: string[]) =>
      keys.map((k) => {
        if (k === 'heartbeat::promote::alpha1') return hb({ mobiles: [{ mobile: '••••0001', connected: true, health: 'ok' }] });
        if (k === 'heartbeat::tg-aut::alpha1') return hb({ mobile: '919811110000', telegramReady: true, promotions: { runnerStatus: 'running', failStreak: 0, lastAnyAgeSec: 120 } });
        return null;
      }),
    ),
    readPipeline: jest.fn(async (cmds: Array<[string, string]>) => {
      if (opts.fail) throw new Error('ECONNRESET');
      return cmds.map(([cmd, key]) => {
        if (cmd === 'hgetall') {
          if (key === 'tg::acct::919822220000') return { spamStatus: 'limited', daysLeft: '3', limitedUntil: 'null', spamCheckedAt: String(NOW - 60_000) };
          return {};
        }
        return cmd === 'hlen' ? 2 : 1;
      });
    }),
  };
}

// ---------------------------------------------------------------- P0

describe('P0 /monitor/live indexed', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('indexed = member of heartbeat::index; clients-collection-only processes are indexed:false', async () => {
    const { svc } = build(() => [], mongo, pipelineRedis());
    const r = await svc.live('all');
    const by = (s: string, id: string) => r.items.find((i) => i.svc === s && i.clientId === id)!;
    expect(by('tg-aut', 'alpha1').indexed).toBe(true);
    expect(by('promote', 'alpha1').indexed).toBe(true);
    expect(by('tg-aut', 'beta1')).toMatchObject({ indexed: false, state: 'no-heartbeat' });
  });
});

// ---------------------------------------------------------------- P2

describe('P2 SQL: family columns keep every existing contract', () => {
  it('dailyClientSql groups by namespace and adds failed; sums over namespaces = old per-(day, client) row', () => {
    const qy = dailyClientSql('dc_hist', '2026-10-01', '2026-10-27');
    expect(qy.sql).toContain('GROUP BY day, client_id, namespace');
    expect(qy.sql).toContain('coalesce(sum(failed), 0) AS failed');
    expect(qy.sql).toContain("namespace = 'tg-aut'");
    expect(qy.params).toEqual(['2026-10-01', '2026-10-27']);
  });

  it('dmsByDaySql: merged rows via GROUPING SETS, per-service rows flagged g = 0', () => {
    const qy = dmsByDaySql(TODAY0 - 7 * DAY, TODAY0);
    expect(qy.sql).toContain('GROUPING SETS ((1, 2), (1, 2, 3))');
    expect(qy.sql).toContain('GROUPING(service) AS g');
    expect(qy.sql).toContain("FROM conversion_event\nWHERE kind = 'dm'");
  });

  it('sendsLiveSql / mobilesSql add service / namespace without changing params', () => {
    const live = sendsLiveSql({ start: TODAY0, end: NOW }, NOW - DAY);
    expect(live.sql).toContain('GROUP BY 1, 2, 3, 4');
    expect(live.sql).toContain(", service,");
    expect(live.params).toHaveLength(4);
    expect(mobilesSql('mobiles_hist', '2026-10-21', '2026-10-27').sql).toContain('GROUP BY mobile, client_id, namespace');
  });
});

describe('P2 merges: per-service DM rows never double the merged counts', () => {
  const rows = [
    { d: '2026-10-26', client_id: 'alpha1', g: 1, dms: '7' },
    { d: '2026-10-26', client_id: 'alpha1', service: 't', g: 0, dms: '5' },
    { d: '2026-10-26', client_id: 'alpha1', service: 'p', g: 0, dms: '2' },
    { d: '2026-10-26', client_id: null, g: 1, dms: '1' },
    { d: '2026-10-26', client_id: null, service: null, g: 0, dms: '1' },
  ];
  it('sumDmsDays / dmsByDate read merged rows only', () => {
    expect(sumDmsDays(rows, '2026-10-20', '2026-10-27').total).toBe(8);
    expect(sumDmsDays(rows, '2026-10-20', '2026-10-27').byClient.get('alpha1')).toBe(7);
    expect(dmsByDate(rows, null).get('2026-10-26')).toBe(8);
  });
  it('dmsFamilyDays reads the per-service rows; NULL service is unattributed', () => {
    const f = dmsFamilyDays(rows, '2026-10-20', '2026-10-27');
    expect(f.total).toEqual({ 'tg-aut': 5, promote: 2 });
    expect(f.unattributed).toBe(1);
  });
  it('familyOf maps the three namings', () => {
    expect(['tg-aut', 't', 'promote-clients', 'p', 'promote', null, 'x'].map(familyOf)).toEqual(['tg-aut', 'tg-aut', 'promote', 'promote', 'promote', null, null]);
  });
  it('sendsByFamily sums to the merged total when every row has a family', () => {
    const dc = [
      { d: '2026-10-22', client_id: 'a', namespace: 'tg-aut', sent: 700, delivered: 600, banned: 50, failed: 1 },
      { d: '2026-10-22', client_id: 'a', namespace: 'promote-clients', sent: 100, delivered: 50, banned: 5, failed: 3 },
    ];
    const f = sendsByFamily(dc, 'namespace');
    expect(f.total['tg-aut'].sent + f.total.promote.sent).toBe(800);
    expect(f.byClient.get('a')!.promote).toEqual({ sent: 100, delivered: 50, banned: 5, failed: 3 });
  });
  it('mergeMobiles: family = namespace with the most sends', () => {
    const base = { new_users: 0, dms: 0, delivered: 0, banned: 0, first_day: '2026-10-22', last_day: '2026-10-22' };
    const out = mergeMobiles(
      [
        { ...base, mobile: '1', client_id: 'a', namespace: 'tg-aut', sent: 5 },
        { ...base, mobile: '1', client_id: 'a', namespace: 'promote-clients', sent: 9 },
        { ...base, mobile: '2', client_id: 'a', namespace: 'tg-aut', sent: 0, new_users: 3 },
      ],
      'a',
    );
    expect(out.map((m) => [m.mobile, m.family, m.sent])).toEqual([
      ['1', 'promote', 14],
      ['2', 'tg-aut', 0],
    ]);
  });
});

const DC_HIST = [
  { d: '2026-10-22', client_id: 'alpha1', namespace: 'tg-aut', sent: '700', delivered: '600', banned: '50', failed: '1', new_users: '300', ns_new_users: '300' },
  { d: '2026-10-22', client_id: 'alpha1', namespace: 'promote-clients', sent: '100', delivered: '50', banned: '5', failed: '3', new_users: '0', ns_new_users: '12' },
];
const DMS_HIST = [
  { d: '2026-10-26', client_id: 'alpha1', g: 1, dms: '7' },
  { d: '2026-10-26', client_id: 'alpha1', service: 't', g: 0, dms: '5' },
  { d: '2026-10-26', client_id: 'alpha1', service: 'p', g: 0, dms: '2' },
];
const PAY_HIST = [
  { client_id: 'alpha1', ts: ist('2026-10-27T09:00:00'), chat_id: 'c6', amount: 200, owner_amount: 200, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-27T09:30:00'), chat_id: 'c7', amount: 100, owner_amount: 100, cheat_flagged: false },
  { client_id: 'alpha1', ts: ist('2026-10-27T20:00:00'), chat_id: 'c8', amount: 999, owner_amount: 999, cheat_flagged: false },
];

function pgHist(name: string): any[] | undefined {
  switch (name) {
    case 'dc_hist':
      return DC_HIST;
    case 'dms_hist':
      return DMS_HIST;
    case 'pay_hist':
      return PAY_HIST;
    case 'mobiles_hist':
      return [
        { mobile: '919876540001', client_id: 'alpha1', namespace: 'promote-clients', new_users: 0, dms: 4, sent: 90, delivered: 40, banned: 1, first_day: '2026-10-22', last_day: '2026-10-27' },
        { mobile: '919876540001', client_id: 'alpha1', namespace: 'tg-aut', new_users: 2, dms: 0, sent: 10, delivered: 9, banned: 0, first_day: '2026-10-22', last_day: '2026-10-27' },
      ];
    case 'paid_origin':
      return [
        { chat_id: 'c6', client_id: 'alpha1', service: 't' },
        { chat_id: 'c7', client_id: 'alpha1', service: 'p' },
      ];
    default:
      return [];
  }
}

describe('P2 byFamily on fleet / detail', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('7d: merged sends/DMs unchanged; byFamily splits them and sums back', async () => {
    const { svc } = build(pgHist, mongo, pipelineRedis());
    const r = await svc.buildFleet('7d', NOW);
    expect(r.fleet).toMatchObject({ sends: 800, sendSuccess: 650, banned: 55, dms: 7, newUsers: 300 });
    expect(r.fleet.byFamily).toEqual({
      'tg-aut': { sends: 700, sendSuccess: 600, banned: 50, failed: 1, dms: 5 },
      promote: { sends: 100, sendSuccess: 50, banned: 5, failed: 3, dms: 2 },
    });
    const a = r.clients.find((c) => c.clientId === 'alpha1')!;
    expect(a.dms).toBe(7);
    expect(a.byFamily!.promote.sends).toBe(100);
    expect(r.clients.find((c) => c.clientId === 'beta1')!.byFamily!['tg-aut']).toEqual({ sends: 0, sendSuccess: 0, banned: 0, failed: 0, dms: 0 });
  });

  it('today: byFamily from promotion_send.service and conversion_event.service', async () => {
    const pg = (n: string) =>
      n === 'sends_live'
        ? [
            { client_id: 'alpha1', today: true, h: 15, service: 't', sent: '60', delivered: '50', banned: '5', failed: '2' },
            { client_id: 'alpha1', today: true, h: 15, service: 'p', sent: '40', delivered: '30', banned: '10', failed: '0' },
            { client_id: 'alpha1', today: false, h: 9, service: 'p', sent: '90', delivered: '70', banned: '10', failed: '0' },
          ]
        : pgToday(n);
    const { svc } = build(pg, mongo, pipelineRedis());
    const r = await svc.buildFleet('today', NOW);
    expect(r.fleet).toMatchObject({ sends: 100, sendSuccess: 80, banned: 15, dms: 4 });
    expect(r.fleet.byFamily!['tg-aut']).toEqual({ sends: 60, sendSuccess: 50, banned: 5, failed: 2, dms: 2 });
    expect(r.fleet.byFamily!.promote).toEqual({ sends: 40, sendSuccess: 30, banned: 10, failed: 0, dms: 1 });
    expect(r.previous.byFamily!.promote.sends).toBe(90);
    expect(r.previous.byFamily!.promote.dms).toBe(0); // p:y1 is after the same-time cut
  });

  it('fleet detail: daily[].byFamily and mobiles[].family', async () => {
    const { svc } = build(pgHist, mongo, pipelineRedis());
    const r = await svc.buildFleetDetail(7, NOW);
    const d22 = r.daily.find((d: any) => d.date === '2026-10-22');
    expect(d22.sends).toBe(800);
    expect(d22.byFamily.promote).toMatchObject({ sends: 100, failed: 3 });
    expect(r.daily.find((d: any) => d.date === '2026-10-26').byFamily).toMatchObject({ 'tg-aut': { dms: 5 }, promote: { dms: 2 } });
    expect(r.daily.find((d: any) => d.date === '2026-10-26').dms).toBe(7);
    expect(r.mobiles[0]).toMatchObject({ mobile: '••••0001', sends: 100, family: 'promote' });
  });
});

// ---------------------------------------------------------------- P1

describe('P1 promotions: pure rules', () => {
  it('window bounds: today = IST midnight vs yesterday same time; 24h = rolling; 7d = closed days', () => {
    expect(promoWindows('today', NOW)).toMatchObject({ cur: { start: TODAY0, end: NOW }, prev: { start: TODAY0 - DAY, end: NOW - DAY }, intraday: true });
    expect(promoWindows('24h', NOW)).toMatchObject({ cur: { start: NOW - DAY, end: NOW }, prev: { start: NOW - 2 * DAY, end: NOW - DAY }, intraday: true });
    expect(promoWindows('7d', NOW)).toMatchObject({ range: { from: '2026-10-21', to: '2026-10-27' }, previousRange: { from: '2026-10-14', to: '2026-10-20' }, intraday: false });
  });
  it('looksLimited: 50 sends today / 200 otherwise, < 5% delivered, or spam limited/harsh', () => {
    expect(looksLimited('today', 50, 2, null)).toBe(true);
    expect(looksLimited('today', 49, 0, null)).toBe(false);
    expect(looksLimited('7d', 199, 0, null)).toBe(false);
    expect(looksLimited('7d', 200, 9, null)).toBe(true);
    expect(looksLimited('7d', 200, 10, null)).toBe(false);
    expect(looksLimited('today', 3, 3, 'harsh')).toBe(true);
    expect(looksLimited('today', 3, 3, 'free')).toBe(false);
  });
  it("parseSpam: 'null' strings are null, ms timestamps become ISO", () => {
    expect(parseSpam({ spamStatus: 'limited', daysLeft: '3', limitedUntil: 'null', spamCheckedAt: String(NOW) })).toEqual({
      status: 'limited',
      daysLeft: 3,
      limitedUntil: null,
      checkedAt: new Date(NOW).toISOString(),
    });
    expect(parseSpam({})).toBeNull();
  });
  it('promoSendsSql: one partition-pruned scan, count(*) only, no client filter', () => {
    const w = promoWindows('today', NOW);
    const qy = promoSendsSql(w.cur, w.prev);
    expect(qy.sql).toMatch(/^\/\* monitor\.promo_sends \*\/ SELECT/);
    expect(qy.sql).not.toMatch(/count\(distinct/i);
    expect(qy.sql).not.toMatch(/client_id\s*=/);
    expect(qy.params).toEqual([new Date(TODAY0).toISOString(), new Date(TODAY0 - DAY).toISOString(), new Date(NOW).toISOString(), new Date(NOW - DAY).toISOString()]);
    expect(promoMobilesHistSql('2026-10-14', '2026-10-21', '2026-10-27', ['routes_sent']).sql).toContain('coalesce(sum(routes_sent), 0) AS routes_sent');
    expect(promoMobilesHistSql('2026-10-14', '2026-10-21', '2026-10-27').sql).not.toContain('routes_sent');
    expect(routedDailySql('routed_hist', 'a', 'b', ['bogus; DROP', 'routed_reached']).sql).not.toContain('bogus');
    expect(paidOriginSql(TODAY0, TODAY0).sql).not.toMatch(/client_id\s*=/);
  });
});

describe('P1 GET /monitor/promotions (service)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('today: families, clients, masked mobiles, top error, limited, idle, spam, route, heartbeat, engine', async () => {
    const redis = pipelineRedis();
    const { svc, calls } = build(pgToday, mongo, redis);
    const r = await svc.promotions('today', null);
    const p = r.families.promote;
    expect(p.totals).toMatchObject({ sent: 313, delivered: 6, failed: 13, dms: 1, mobilesSending: 1, mobilesLimited: 1, incomingDms: 4, routesSent: null });
    expect(p.previous).toMatchObject({ sent: 200, delivered: 150 });
    const m1 = p.mobiles.find((m: any) => m.mobile === '••••0001');
    expect(m1).toMatchObject({
      clientId: 'alpha1',
      profile: 'alpha',
      sent: 313,
      newDms: 4,
      topError: { type: 'FLOOD', count: 10 },
      looksLimited: true,
      idle: false,
      heartbeat: { connected: true, health: 'ok' },
      route24h: { pending: 2, backlog: 1, mainReplies: 1 },
      lastSendAt: ts('2026-10-28T15:10:00'),
    });
    expect(p.mobiles.find((m: any) => m.mobile === '••••0002')).toMatchObject({ sent: 0, idle: true, looksLimited: false });
    expect(p.clients).toEqual([expect.objectContaining({ clientId: 'alpha1', name: 'Alpha', mobilesAssigned: 2, sent: 313 })]);

    const t = r.families['tg-aut'];
    expect(t.totals).toMatchObject({ sent: 140, delivered: 120, banned: 15, dms: 2, mobilesLimited: 1 });
    expect(t.mobiles.find((m: any) => m.clientId === 'beta1')).toMatchObject({ mobile: '••••0000', looksLimited: true, spam: { status: 'limited', daysLeft: 3 } });
    expect(t.clients.find((c: any) => c.clientId === 'alpha1').engine).toMatchObject({ runnerStatus: 'running', failStreak: 0, lastAnyAgeSec: 120 });
    expect(r.both).toMatchObject({ sent: 453, dms: 3 });
    expect(r.unattributed).toEqual({ sends: 5, dms: 1 });

    expect(redis.readPipeline).toHaveBeenCalledTimes(1);
    const sendCalls = calls.filter((c) => c.name === 'promo_sends');
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].params).toEqual([new Date(TODAY0).toISOString(), new Date(TODAY0 - DAY).toISOString(), new Date(NOW).toISOString(), new Date(NOW - DAY).toISOString()]);
    const json = JSON.stringify(r);
    for (const full of ['919876540001', '919876540002', '919811110000', '919822220000']) expect(json).not.toContain(full);
    expect(r.notes.join(' ')).toContain('history starts when counters ship');
    expect(r.notes.join(' ')).not.toContain('unavailable');

    // a second call is served from the snapshot (no new Postgres / Redis work)
    const before = calls.length;
    await svc.promotions('today', null);
    expect(calls.length).toBe(before);
  });

  it('client filter keeps only that client; 24h uses rolling bounds', async () => {
    const { svc, calls } = build(pgToday, mongo, pipelineRedis());
    const b = await svc.promotions('today', 'beta1');
    expect(b.families.promote.totals.sent).toBe(0);
    expect(b.families.promote.mobiles).toEqual([]);
    expect(b.families['tg-aut'].totals.sent).toBe(40);
    expect(b.unattributed).toBeNull();
    const d = await svc.promotions('24h', null);
    const p = calls.filter((c) => c.name === 'promo_sends').map((c) => c.params);
    expect(p[p.length - 1]).toEqual([new Date(NOW - DAY).toISOString(), new Date(NOW - 2 * DAY).toISOString(), new Date(NOW).toISOString(), new Date(NOW - DAY).toISOString()]);
    expect(d.families.promote.previous.dms).toBeNull();
  });

  it('Postgres failure of the sends = 503, never an empty page', async () => {
    const { svc } = build((n) => (n === 'promo_sends' ? undefined : pgToday(n)), mongo, pipelineRedis());
    const err = await svc.promotions('today', null).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(String(err.message)).toMatch(/promotion sends unavailable/);
  });

  it('Redis down: spam/route null + a note; the rest is served', async () => {
    const { svc } = build(pgToday, mongo, pipelineRedis({ fail: true }));
    const r = await svc.promotions('today', null);
    expect(r.families.promote.totals.sent).toBe(313);
    expect(r.families.promote.mobiles[0].spam).toBeNull();
    expect(r.families.promote.mobiles[0].route24h).toBeNull();
    expect(r.notes.join(' ')).toMatch(/redis_state unavailable: ECONNRESET/);
  });

  it('7d: daily_mobile over both windows in one statement; routed columns read only when present', async () => {
    const hist = [
      { cur: true, namespace: 'promote-clients', client_id: 'alpha1', mobile: '919876540001', profile: 'alpha', sent: '900', delivered: '700', banned: '20', failed: '5', new_users: '30', last_day: '2026-10-27', routes_sent: '25', routed_reached: '9' },
      { cur: false, namespace: 'promote-clients', client_id: 'alpha1', mobile: '919876540001', profile: 'alpha', sent: '800', delivered: '600', banned: '20', failed: '5', new_users: '20', last_day: '2026-10-20', routes_sent: '0', routed_reached: '0' },
    ];
    const withCols = (n: string) =>
      n === 'routed_columns'
        ? [
            { t: 'daily_mobile', c: 'routed_reached' },
            { t: 'daily_mobile', c: 'routes_sent' },
          ]
        : n === 'promo_mobiles_hist'
          ? hist
          : pgHist(n);
    const a = build(withCols, mongo, pipelineRedis());
    const r = await a.svc.promotions('7d', null);
    const q = a.calls.find((c) => c.name === 'promo_mobiles_hist')!;
    expect(q.params).toEqual(['2026-10-14', '2026-10-21', '2026-10-27']);
    expect(q.sql).toContain('AS routes_sent');
    expect(r.families.promote.totals).toMatchObject({ sent: 900, incomingDms: 30, routesSent: 25, routedReached: 9, dms: 2 });
    expect(r.families.promote.previous).toMatchObject({ sent: 800, incomingDms: 20 });
    expect(r.notes.join(' ')).not.toContain('history starts when counters ship');
    expect(a.calls.some((c) => c.name === 'promo_sends')).toBe(false);

    const b = build((n) => (n === 'promo_mobiles_hist' ? hist.map(({ routes_sent: _s, routed_reached: _r, ...x }) => x) : pgHist(n)), mongo, pipelineRedis());
    const r2 = await b.svc.promotions('7d', null);
    expect(b.calls.find((c) => c.name === 'promo_mobiles_hist')!.sql).not.toContain('routes_sent');
    expect(r2.families.promote.totals.routesSent).toBeNull();
    expect(r2.notes.join(' ')).toContain('history starts when counters ship');
  });
});

// ---------------------------------------------------------------- P3

describe('route columns absent on live Postgres (EXPLAIN 2026-10-29: 42703 "column routes_sent does not exist")', () => {
  const ROUTE_RE = /\b(routes_sent|routed_reached|route_calls_ok|route_calls_failed|routed_users)\b/;
  /** Live schema today: the catalog read finds no route column; any query naming one fails. */
  const liveSchema = (base: (n: string) => any[] | undefined) => (n: string, sql: string) => {
    if (n === 'routed_columns') return [];
    if (ROUTE_RE.test(sql)) return undefined;
    return base(n);
  };
  const routeSql = (calls: Array<{ name: string; sql: string }>) =>
    calls.filter((c) => c.name !== 'routed_columns' && ROUTE_RE.test(c.sql)).map((c) => c.name);

  it('today: promo_mobiles_today has no route column and the page is served', async () => {
    const { svc, calls } = build(liveSchema(pgToday), mongo, pipelineRedis());
    const r = await svc.promotions('today', null);
    const q = calls.find((c) => c.name === 'promo_mobiles_today');
    expect(q).toBeDefined();
    expect(routeSql(calls)).toEqual([]);
    expect(r.families.promote.totals).toMatchObject({ sent: 313, incomingDms: 4, routesSent: null, routedReached: null });
    expect(r.notes.join(' ')).not.toMatch(/unavailable/);
  });

  it.each(['7d', '30d'] as const)('%s: promo_mobiles_hist has no route column and the page is served', async (w) => {
    const { svc, calls } = build(liveSchema(pgHist), mongo, pipelineRedis());
    const r = await svc.promotions(w, null);
    expect(calls.find((c) => c.name === 'promo_mobiles_hist')).toBeDefined();
    expect(routeSql(calls)).toEqual([]);
    expect(r.families).toBeDefined();
    expect(r.families.promote.totals.routesSent).toBeNull();
    expect(r.notes.join(' ')).not.toMatch(/unavailable/);
    expect(r.notes.join(' ')).toContain('history starts when counters ship');
  });

  it('funnel 7d: no route query at all, routed null', async () => {
    const { svc, calls } = build(liveSchema(pgHist), mongo, pipelineRedis());
    const r = await svc.funnel('7d', null);
    expect(routeSql(calls)).toEqual([]);
    expect(r.routed).toBeNull();
    expect(r.notes.join(' ')).not.toMatch(/routed_\w+ unavailable/);
  });
});

describe('P3 GET /monitor/funnel (service)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('7d: totals from the fleet page, byOrigin from DM service + first-DM origin of payers', async () => {
    const { svc, calls } = build(pgHist, mongo, pipelineRedis());
    const r = await svc.funnel('7d', null);
    expect(r.totals).toMatchObject({ newUsers: 300, payers: 3, revenue: 1299 });
    expect(r.byOrigin).toEqual({
      direct: { newUsers: 5, payers: 1, revenue: 200 },
      routed: { newUsers: 2, payers: 1, revenue: 100 },
      unattributed: { newUsers: 293, payers: 1, revenue: 999 },
    });
    expect(r.incomingPromoteDms).toBe(12);
    expect(r.routed).toBeNull();
    expect(r.notes.join(' ')).toContain('history starts when counters ship');
    expect(r.notes.join(' ')).toContain('attributed only');
    expect(r.clients.find((c: any) => c.clientId === 'alpha1').byOrigin.direct).toEqual({ newUsers: 5, payers: 1, revenue: 200 });
    expect(r.daily).toHaveLength(7);
    expect(r.daily.find((d: any) => d.date === '2026-10-26').dmsByFamily).toEqual({ 'tg-aut': 5, promote: 2 });
    expect(r.ttfp).not.toBeNull();
    expect(calls.filter((c) => c.name === 'paid_origin')).toHaveLength(1);
    expect(calls.some((c) => c.name.startsWith('routed_') && c.name !== 'routed_columns')).toBe(false);
    expect(JSON.stringify(r)).not.toContain('"c6"');
  });

  it('routed counters summed when the columns exist; today has no ttfp', async () => {
    const pg = (n: string, sql: string) => {
      if (n === 'routed_columns') return ['routes_sent', 'routed_reached', 'route_calls_ok', 'route_calls_failed'].map((c) => ({ t: 'daily_client', c }));
      if (n === 'routed_today') {
        expect(sql).toContain("namespace = 'promote-clients'");
        return [{ d: '2026-10-28', client_id: 'alpha1', routes_sent: '10', routed_reached: '4', route_calls_ok: '3', route_calls_failed: '1' }];
      }
      if (n === 'dc_today') return [{ d: '2026-10-28', client_id: 'alpha1', namespace: 'promote-clients', sent: 0, delivered: 0, banned: 0, failed: 0, new_users: 0, ns_new_users: '6' }];
      return pgToday(n);
    };
    const { svc } = build(pg, mongo, pipelineRedis());
    const r = await svc.funnel('today', 'alpha1');
    // routed_users column absent: the per-user fields are null; the old per-message ratio moved to reachPerRouteMessage (2026-10-30)
    expect(r.routed).toEqual({
      routesSent: 10, routedReached: 4, routeCallsOk: 3, routeCallsFailed: 1,
      routedUsers: null, reachRate: null, reachPerRouteMessage: 0.4, reachAlert: null,
    });
    expect(r.notes.join(' ')).toContain('null until daily_client has the routed_users column');
    expect(r.incomingPromoteDms).toBe(6);
    expect(r.byOrigin.direct.newUsers).toBe(2);
    expect(r.byOrigin.routed.newUsers).toBe(1);
    expect(r.ttfp).toBeNull();
    expect(r.daily).toBeNull();
    expect(r.clients.map((c: any) => c.clientId)).toEqual(['alpha1']);
  });
});

// ---------------------------------------------------------------- routed_users (2026-10-30)

describe('routedUsers / reachRate / reachAlert (tg-platform routed_users, 2026-10-30)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const ALL = ['routes_sent', 'routed_reached', 'route_calls_ok', 'route_calls_failed', 'routed_users'];
  const hist = (rows: Array<{ client: string; mobile: string; users: number; reached: number }>) =>
    rows.map((x) => ({
      cur: true, namespace: 'promote-clients', client_id: x.client, mobile: x.mobile, profile: 'p', sent: '900', delivered: '700',
      banned: '0', failed: '0', new_users: '30', last_day: '2026-10-27', routes_sent: String(x.users * 3), routed_reached: String(x.reached),
      routed_users: String(x.users),
    }));
  const promoPg = (rows: any[], cols = ALL) => (n: string) =>
    n === 'routed_columns' ? cols.map((c) => ({ t: 'daily_mobile', c })) : n === 'promo_mobiles_hist' ? rows : pgHist(n);

  it('promotions 7d: routedUsers + reachRate on totals and clients; reachAlert only at >= 50 users and < 50% reach', async () => {
    const rows = hist([
      { client: 'alpha1', mobile: '919876540001', users: 40, reached: 10 },
      { client: 'alpha1', mobile: '919876540002', users: 20, reached: 9 }, // alpha1: 60 users, 19 reached = 0.3167 -> alert
      { client: 'beta1', mobile: '919876540003', users: 49, reached: 1 }, // beta1: < 50 users -> no alert
      { client: 'gamma1', mobile: '919876540004', users: 80, reached: 40 }, // gamma1: exactly 0.5 -> no alert
    ]);
    const { svc, calls } = build(promoPg(rows), mongo, pipelineRedis());
    const r = await svc.promotions('7d', null);
    expect(calls.find((c) => c.name === 'promo_mobiles_hist')!.sql).toContain('coalesce(sum(routed_users), 0) AS routed_users');
    const t = r.families.promote.totals;
    expect(t).toMatchObject({ routedUsers: 189, routedReached: 60, routesSent: 567 });
    expect(t.reachRate).toBeCloseTo(60 / 189, 4);
    const by = (id: string) => r.families.promote.clients.find((c: any) => c.clientId === id);
    expect(by('alpha1')).toMatchObject({ routedUsers: 60, routedReached: 19, reachRate: 0.3167, reachAlert: true });
    expect(by('beta1')).toMatchObject({ routedUsers: 49, reachAlert: false });
    expect(by('gamma1')).toMatchObject({ routedUsers: 80, reachRate: 0.5, reachAlert: false });
    expect(r.families['tg-aut'].clients.every((c: any) => !('reachAlert' in c))).toBe(true);
    expect(r.notes.join(' ')).toContain('reachRate = routedReached / routedUsers');
  });

  it('promotions: routedUsers 0 -> reachRate null, no alert', async () => {
    const rows = hist([{ client: 'alpha1', mobile: '919876540001', users: 0, reached: 3 }]);
    const { svc } = build(promoPg(rows), mongo, pipelineRedis());
    const r = await svc.promotions('7d', null);
    const c = r.families.promote.clients.find((x: any) => x.clientId === 'alpha1');
    expect(c).toMatchObject({ routedUsers: 0, reachRate: null, reachAlert: false });
  });

  it('promotions: route columns present but routed_users absent -> never named in SQL; fields null; a note', async () => {
    const rows = hist([{ client: 'alpha1', mobile: '919876540001', users: 60, reached: 3 }]).map(({ routed_users: _u, ...x }) => x);
    const { svc, calls } = build(promoPg(rows, ALL.slice(0, 4)), mongo, pipelineRedis());
    const r = await svc.promotions('7d', null);
    expect(calls.some((c) => c.name !== 'routed_columns' && /routed_users/.test(c.sql))).toBe(false);
    expect(r.families.promote.totals).toMatchObject({ routesSent: 180, routedUsers: null, reachRate: null });
    expect(r.families.promote.clients.find((x: any) => x.clientId === 'alpha1').reachAlert).toBeNull();
    expect(r.notes.join(' ')).toContain('null until daily_mobile has the routed_users column');
  });

  it('funnel today: routedUsers summed, reachRate per user, reachPerRouteMessage, reachAlert', async () => {
    const pg = (n: string) => {
      if (n === 'routed_columns') return ALL.map((c) => ({ t: 'daily_client', c }));
      if (n === 'routed_today') return [
        { d: '2026-10-28', client_id: 'alpha1', routes_sent: '300', routed_reached: '20', route_calls_ok: '3', route_calls_failed: '1', routed_users: '80' },
      ];
      return pgToday(n);
    };
    const { svc, calls } = build(pg, mongo, pipelineRedis());
    const r = await svc.funnel('today', 'alpha1');
    expect(calls.find((c) => c.name === 'routed_today')!.sql).toContain('AS routed_users');
    expect(r.routed).toEqual({
      routesSent: 300, routedReached: 20, routeCallsOk: 3, routeCallsFailed: 1,
      routedUsers: 80, reachRate: 0.25, reachPerRouteMessage: 0.0667, reachAlert: true,
    });
  });
});

// ---------------------------------------------------------------- controller

describe('monitor controller: promotions + funnel', () => {
  it('parseWindow accepts today|24h|7d|30d only', () => {
    expect(parseWindow(undefined)).toBe('today');
    expect(parseWindow('24h')).toBe('24h');
    expect(() => parseWindow('90d')).toThrow();
  });

  it('both routes are declared before client/:clientId', () => {
    const proto = MonitorController.prototype as any;
    const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    const paths = names.map((n) => Reflect.getMetadata('path', proto[n]));
    for (const p of ['promotions', 'funnel']) {
      expect(paths.indexOf(p)).toBeGreaterThanOrEqual(0);
      expect(paths.indexOf(p)).toBeLessThan(paths.indexOf('client/:clientId'));
    }
  });

  describe('over HTTP', () => {
    let app: INestApplication;
    const svc = {
      promotions: jest.fn(async (window: string, client: string | null) => ({ window, client })),
      funnel: jest.fn(async (period: string, client: string | null) => ({ period, client })),
      client: jest.fn(async () => ({ route: 'client' })),
    };
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ controllers: [MonitorController], providers: [{ provide: MonitorService, useValue: svc }] }).compile();
      app = moduleRef.createNestApplication({ logger: false });
      await app.init();
    });
    afterAll(async () => app.close());

    it('resolve to their handlers with parsed params', async () => {
      const a = await request(app.getHttpServer()).get('/monitor/promotions?window=7d&client=alpha1');
      expect(a.status).toBe(200);
      expect(a.body).toEqual({ window: '7d', client: 'alpha1' });
      const b = await request(app.getHttpServer()).get('/monitor/funnel');
      expect(b.body).toEqual({ period: 'today', client: null });
      expect(svc.client).not.toHaveBeenCalled();
    });

    it.each([
      ['/monitor/promotions?window=90d'],
      ['/monitor/promotions?client=a%20b'],
      ['/monitor/funnel?period=24h'],
      ['/monitor/funnel?client=x:y'],
    ])('%s = 400', async (url) => {
      expect((await request(app.getHttpServer()).get(url)).status).toBe(400);
    });
  });
});
