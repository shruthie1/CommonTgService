/**
 * Reactions tab (reactions-tab design 2026-10-29): GET /monitor/reactions, and the `fleet` comparison
 * blocks added to /monitor/promotions and /monitor/funnel when a client is selected.
 */
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { isSilent, reactRedisBatch, readReactBatch, REACT_LIMITS } from '../monitor-reactions';
import { dailyClientSql, promoMobilesHistSql, promoMobilesTodaySql } from '../monitor-sql';
import { MonitorController, parseReactWindow } from '../monitor.controller';
import { MonitorService } from '../monitor.service';

const NOW = Date.parse('2026-10-28T10:12:10.000Z'); // 15:42:10 IST
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
  const mongoCalls: Array<{ coll: string; op: string; arg: any }> = [];
  const connection = {
    collection: (coll: string) => ({
      aggregate: (p: any) => ({
        toArray: async () => {
          mongoCalls.push({ coll, op: 'aggregate', arg: p });
          return mongoH(coll, 'aggregate', p);
        },
      }),
      find: (f: any) => ({
        toArray: async () => {
          mongoCalls.push({ coll, op: 'find', arg: f });
          return mongoH(coll, 'find', f);
        },
      }),
    }),
  };
  const svc = new MonitorService(pg as any, connection as any, redis);
  svc.prewarmDelayMs = -1;
  return { svc, calls, mongoCalls };
}

const CLIENTS = [
  { clientId: 'alpha1', name: 'Alpha', promoteRepl: 'https://p' },
  { clientId: 'beta1', name: 'Beta', promoteRepl: '' },
];
const PROMOTE_ACTIVE = [
  { mobile: '919876540001', clientId: 'alpha1' },
  { mobile: '919876540002', clientId: 'alpha1' },
];
const RESTRICTED = [{ total: [{ n: 869 }], byDay: [{ _id: '2026-10-27', n: 23 }, { _id: '2026-10-28', n: 5 }] }];

function mongo(opts: { failActive?: boolean } = {}) {
  return (coll: string, op: string, arg: any): any[] => {
    if (coll === 'clients') return CLIENTS;
    if (coll === 'promoteClients' && op === 'find') return PROMOTE_ACTIVE;
    if (coll === 'activeChannels') {
      if (opts.failActive) throw new Error('mongo timeout');
      return RESTRICTED;
    }
    return [];
  };
}

const R = (s: number, r: number, f: number, fl: number) => ({ reactions_success: String(s), reactions_restricted: String(r), reactions_failed: String(f), reactions_floods: String(fl) });

/** today's daily_mobile rows (promo_mobiles_today) */
const TODAY_ROWS = [
  { namespace: 'promote-clients', client_id: 'alpha1', mobile: '919876540001', profile: 'alpha', new_users: '4', ...R(1000, 100, 10, 3) },
  { namespace: 'tg-aut', client_id: 'alpha1', mobile: '919811110000', profile: 'alpha', new_users: '9', ...R(700, 300, 0, 2) },
  { namespace: 'tg-aut', client_id: 'beta1', mobile: '919822220000', profile: 'beta', new_users: '1', ...R(300, 0, 0, 0) },
];
/** dc_hist rows (closed days) */
const DC_HIST = [
  { d: '2026-10-27', client_id: 'alpha1', namespace: 'tg-aut', sent: '0', delivered: '0', banned: '0', failed: '0', new_users: '0', ns_new_users: '0', ...R(2400, 600, 0, 5) },
  { d: '2026-10-27', client_id: 'beta1', namespace: 'tg-aut', sent: '0', delivered: '0', banned: '0', failed: '0', new_users: '0', ns_new_users: '0', ...R(600, 0, 0, 0) },
  { d: '2026-10-27', client_id: 'alpha1', namespace: 'promote-clients', sent: '0', delivered: '0', banned: '0', failed: '0', new_users: '0', ns_new_users: '0', ...R(2000, 200, 0, 1) },
  { d: '2026-10-22', client_id: 'alpha1', namespace: 'promote-clients', sent: '0', delivered: '0', banned: '0', failed: '0', new_users: '0', ns_new_users: '0', ...R(1000, 0, 0, 0) },
  { d: '2026-10-20', client_id: 'alpha1', namespace: 'promote-clients', sent: '0', delivered: '0', banned: '0', failed: '0', new_users: '0', ns_new_users: '0', ...R(500, 0, 0, 0) },
];
/** promo_mobiles_hist rows for 7d (cur = 10-21..10-27, prev = 10-14..10-20); cur sums match DC_HIST */
const HIST_ROWS = [
  { cur: true, namespace: 'promote-clients', client_id: 'alpha1', mobile: '919876540001', profile: 'alpha', sent: '900', delivered: '700', banned: '90', failed: '5', new_users: '30', last_day: '2026-10-27', ...R(3000, 200, 0, 1) },
  { cur: true, namespace: 'tg-aut', client_id: 'alpha1', mobile: '919811110000', profile: 'alpha', sent: '100', delivered: '80', banned: '10', failed: '0', new_users: '30', last_day: '2026-10-27', ...R(2400, 600, 0, 5) },
  { cur: true, namespace: 'tg-aut', client_id: 'beta1', mobile: '919822220000', profile: 'beta', sent: '0', delivered: '0', banned: '0', failed: '0', new_users: '0', last_day: '2026-10-27', ...R(600, 0, 0, 0) },
  { cur: false, namespace: 'promote-clients', client_id: 'alpha1', mobile: '919876540001', profile: 'alpha', sent: '800', delivered: '600', banned: '20', failed: '5', new_users: '20', last_day: '2026-10-20', ...R(500, 0, 0, 0) },
];

function pg(name: string): any[] | undefined {
  switch (name) {
    case 'promo_mobiles_today':
      return TODAY_ROWS;
    case 'promo_mobiles_hist':
      return HIST_ROWS;
    case 'dc_hist':
      return DC_HIST;
    default:
      return [];
  }
}

/** heartbeats: promote alpha1 (masked mobiles) and tg-aut alpha1 + beta1 (raw mobile) */
function reactRedis(opts: { fail?: boolean } = {}) {
  const hb = (o: object) => JSON.stringify({ v: 1, ts: NOW - 10_000, ...o });
  const pipe: Array<Array<[string, string, ...any[]]>> = [];
  return {
    pipe,
    smembers: jest.fn(async () => ['promote::alpha1', 'tg-aut::alpha1', 'tg-aut::beta1']),
    mget: jest.fn(async (keys: string[]) =>
      keys.map((k) => {
        if (k === 'heartbeat::promote::alpha1') return hb({ mobiles: [{ mobile: '••••0001', connected: true, health: 'ok' }, { mobile: '••••0002', connected: true, health: 'ok' }] });
        if (k === 'heartbeat::tg-aut::alpha1') return hb({ mobile: '919811110000', telegramReady: true });
        if (k === 'heartbeat::tg-aut::beta1') return hb({ mobile: '919822220000', telegramReady: true });
        return null;
      }),
    ),
    readPipeline: jest.fn(async (cmds: Array<[string, string, ...any[]]>) => {
      pipe.push(cmds);
      if (opts.fail) throw new Error('ECONNRESET');
      return cmds.map(([cmd, key]) => {
        if (cmd === 'zcount' && key === 'reactions::hourly::919811110000') return 149; // capped
        if (cmd === 'zcount' && key === 'reactions::hourly::919876540001') return 40;
        if (cmd === 'zcount' && key === 'reactions::floods::919876540001') return 2;
        if (cmd === 'zcount') return 0;
        if (cmd === 'hgetall' && key === 'reactions::state::919876540001') return { lastReactionAt: String(NOW - 60_000), floodReleaseAt: String(NOW + 600_000), reactionTimeoutPauses: '1' };
        if (cmd === 'hgetall' && key === 'reactions::state::919822220000') return { lastReactionAt: String(NOW - 3 * 3600_000) }; // silent
        if (cmd === 'hgetall') return {};
        if (cmd === 'hlen' && key === 'reactions::restricted::919876540001') return 12;
        return 0;
      });
    }),
  };
}

describe('reactions: pure rules', () => {
  it('Redis batch: 4 known per-mobile keys, ZCOUNT over the last hour, no SCAN/KEYS', () => {
    const cmds = reactRedisBatch(['91a', '91b'], NOW);
    expect(cmds).toHaveLength(8);
    expect(cmds[0]).toEqual(['zcount', 'reactions::hourly::91a', NOW - 3_600_000, '+inf']);
    expect(cmds[1]).toEqual(['zcount', 'reactions::floods::91a', NOW - 3_600_000, '+inf']);
    expect(cmds[2]).toEqual(['hgetall', 'reactions::state::91a']);
    expect(cmds[3]).toEqual(['hlen', 'reactions::restricted::91a']);
    expect(cmds.map((c) => c[0]).every((c) => ['zcount', 'hgetall', 'hlen'].includes(c))).toBe(true);
  });

  it('capped at 145/h, paused while floodReleaseAt is ahead, silent after 2 h with heartbeat up', () => {
    const live = readReactBatch(['m'], [145, 0, { lastReactionAt: String(NOW - 1000), floodReleaseAt: String(NOW - 1) }, 0], NOW).get('m')!;
    expect(live).toMatchObject({ lastHour: 145, capped: true, pausedUntil: null, lastReactionAgeSec: 1 });
    expect(REACT_LIMITS.CAPPED_AT).toBe(145);
    const quiet = { ...live, lastHour: 0, capped: false, lastReactionAgeSec: 2 * 3600 };
    expect(isSilent({ connected: true, health: 'ok' }, quiet)).toBe(true);
    expect(isSilent({ connected: true, health: 'ok' }, { ...quiet, lastReactionAgeSec: 3600 })).toBe(false);
    expect(isSilent(null, quiet)).toBe(false);
    expect(isSilent({ connected: false, health: null }, quiet)).toBe(false);
  });

  it('SQL: reaction sums ride on the existing daily_client / promotions statements', () => {
    for (const qy of [promoMobilesHistSql('2026-10-14', '2026-10-21', '2026-10-27'), promoMobilesTodaySql('2026-10-28'), dailyClientSql('dc_hist', '2026-10-01', '2026-10-27')]) {
      for (const c of ['reactions_success', 'reactions_restricted', 'reactions_failed', 'reactions_floods']) expect(qy.sql).toContain(`coalesce(sum(${c}), 0) AS ${c}`);
    }
    expect(promoMobilesHistSql('2026-10-14', '2026-10-21', '2026-10-27').params).toEqual(['2026-10-14', '2026-10-21', '2026-10-27']);
  });
});

describe('GET /monitor/reactions (service)', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('today: family totals, yesterday as previous, masked mobiles, live state, capped/silent, restricted channels', async () => {
    const redis = reactRedis();
    const { svc, calls, mongoCalls } = build(pg, mongo(), redis);
    const r = await svc.reactions('today', null);

    expect(r.families.promote.totals).toMatchObject({ success: 1000, restricted: 100, failed: 10, floods: 3, attempts: 1110, mobilesReacting: 1 });
    expect(r.families.promote.totals.successRate).toBeCloseTo(0.9009, 4);
    expect(r.families['tg-aut'].totals).toMatchObject({ success: 1000, restricted: 300, attempts: 1300, restrictedRate: 0.2308, mobilesReacting: 2 });
    expect(r.both).toMatchObject({ success: 2000, restricted: 400, failed: 10, floods: 5, mobilesReacting: 3 });
    // previous = yesterday's full day (daily_client), no mobile count
    expect(r.families['tg-aut'].previous).toMatchObject({ success: 3000, restricted: 600, mobilesReacting: null });
    expect(r.families.promote.previous).toMatchObject({ success: 2000, restricted: 200 });
    expect(r.previousRange).toEqual({ from: '2026-10-27', to: '2026-10-27' });
    expect(r.hoursElapsed).toBeCloseTo(15.7, 1);
    expect(r.daily).toEqual([]);

    const m1 = r.families.promote.mobiles.find((m: any) => m.mobile === '••••0001');
    expect(m1).toMatchObject({ clientId: 'alpha1', profile: 'alpha', success: 1000, lastDay: '2026-10-28', promoSent: null, heartbeat: { connected: true, health: 'ok' }, silent: false });
    expect(m1.live).toMatchObject({ lastHour: 40, floodsLastHour: 2, lastReactionAgeSec: 60, pausedUntil: new Date(NOW + 600_000).toISOString(), timeoutPauses: 1, restrictedChannels: 12, capped: false });
    // an active promote mobile with no reactions is listed (zero) and, heartbeat up + never reacted, silent
    expect(r.families.promote.mobiles.find((m: any) => m.mobile === '••••0002')).toMatchObject({ success: 0, silent: true });
    expect(r.families['tg-aut'].mobiles.find((m: any) => m.mobile === '••••1111' || m.clientId === 'alpha1').live.capped).toBe(true);
    expect(r.families['tg-aut'].mobiles.find((m: any) => m.clientId === 'beta1')).toMatchObject({ silent: true });
    expect(r.now).toEqual({ reactionsLastHour: 189, mobilesReacting: 2, mobilesCapped: 1, floodsLastHour: 2, mobilesPaused: 1 });
    expect(r.restrictedChannels).toEqual({ total: 869, byDay: [{ day: '2026-10-27', n: 23 }, { day: '2026-10-28', n: 5 }] });
    expect(r.fleet).toBeNull();
    expect(r.scope).toEqual({ client: null });
    expect(r.families.promote.clients).toEqual([expect.objectContaining({ clientId: 'alpha1', name: 'Alpha', success: 1000, mobiles: 2 })]);

    // shared statements only; one Redis pipeline of known keys
    const names = [...new Set(calls.map((c) => c.name))].sort();
    expect(names).toEqual(['dc_hist', 'promo_mobiles_today', 'routed_columns']);
    expect(redis.readPipeline).toHaveBeenCalledTimes(1);
    const keys = redis.pipe[0].map((c) => c[1]);
    expect(keys.every((k) => /^reactions::(hourly|floods|state|restricted)::\d+$/.test(k))).toBe(true);
    expect(new Set(keys.map((k) => k.split('::')[2]))).toEqual(new Set(['919811110000', '919822220000', '919876540001', '919876540002']));
    expect(mongoCalls.filter((c) => c.coll === 'activeChannels')).toHaveLength(1);

    const json = JSON.stringify(r);
    for (const full of ['919876540001', '919876540002', '919811110000', '919822220000']) expect(json).not.toContain(full);
    expect(json).not.toMatch(/\d{10}/);
    expect(r.notes.join(' ')).not.toContain('unavailable');

    // the restricted-channels scan is cached for an hour: a later rebuild does not repeat it
    await svc.reactions('7d', null);
    expect(mongoCalls.filter((c) => c.coll === 'activeChannels')).toHaveLength(1);
  });

  it('7d: closed IST days (cur + previous in one statement), Σ families = Σ daily_client', async () => {
    const { svc, calls } = build(pg, mongo(), reactRedis());
    const r = await svc.reactions('7d', null);
    const q = calls.find((c) => c.name === 'promo_mobiles_hist')!;
    expect(q.params).toEqual(['2026-10-14', '2026-10-21', '2026-10-27']);
    expect(r.range).toEqual({ from: '2026-10-21', to: '2026-10-27' });
    expect(r.families.promote.totals).toMatchObject({ success: 3000, restricted: 200 });
    expect(r.families.promote.previous).toMatchObject({ success: 500 });
    expect(r.families['tg-aut'].totals).toMatchObject({ success: 3000, restricted: 600 });
    expect(r.daily).toHaveLength(14);
    for (const f of ['tg-aut', 'promote']) {
      const d = r.daily.filter((x: any) => x.family === f);
      expect(d.reduce((s: number, x: any) => s + x.success, 0)).toBe(r.families[f].totals.success);
      expect(d.reduce((s: number, x: any) => s + x.restricted, 0)).toBe(r.families[f].totals.restricted);
    }
    expect(r.daily.some((x: any) => x.day === '2026-10-20')).toBe(false);
    const m = r.families.promote.mobiles.find((x: any) => x.mobile === '••••0001');
    expect(m).toMatchObject({ promoSent: 900, promoBanRate: 0.1, floodsPerDay: 0.14 });
    expect(r.hoursElapsed).toBeNull();
    expect(calls.some((c) => c.name === 'promo_mobiles_today')).toBe(false);
  });

  it('client scope: rows of that client only, fleet = the unscoped totals', async () => {
    const a = build(pg, mongo(), reactRedis());
    const scoped = await a.svc.reactions('today', 'alpha1');
    const b = build(pg, mongo(), reactRedis());
    const all = await b.svc.reactions('today', null);
    expect(scoped.scope).toEqual({ client: 'alpha1' });
    expect(scoped.families['tg-aut'].totals).toMatchObject({ success: 700, restricted: 300 });
    expect(scoped.families['tg-aut'].mobiles.every((m: any) => m.clientId === 'alpha1')).toBe(true);
    expect(scoped.families['tg-aut'].previous).toMatchObject({ success: 2400 });
    expect(scoped.fleet.both).toEqual(all.both);
    expect(scoped.fleet.families['tg-aut'].totals).toEqual(all.families['tg-aut'].totals);
    expect(scoped.fleet.families.promote.totals).toEqual(all.families.promote.totals);
    expect(scoped.now.reactionsLastHour).toBe(189); // beta1 has 0 in the last hour
  });

  it('Redis down: now null + a note, the rest is served', async () => {
    const { svc } = build(pg, mongo(), reactRedis({ fail: true }));
    const r = await svc.reactions('today', null);
    expect(r.now).toBeNull();
    expect(r.families.promote.totals.success).toBe(1000);
    expect(r.families.promote.mobiles[0].live).toBeNull();
    expect(r.notes.join(' ')).toMatch(/redis_reactions unavailable: ECONNRESET/);
  });

  it('Mongo down: restrictedChannels null + a note', async () => {
    const { svc } = build(pg, mongo({ failActive: true }), reactRedis());
    const r = await svc.reactions('today', null);
    expect(r.restrictedChannels).toBeNull();
    expect(r.notes.join(' ')).toMatch(/restricted_channels unavailable/);
    expect(r.both.success).toBe(2000);
  });

  it('Postgres failure of the per-mobile part = 503, never an empty page', async () => {
    const t = build((n) => (n === 'promo_mobiles_today' ? undefined : pg(n)), mongo(), reactRedis());
    const err = await t.svc.reactions('today', null).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(String(err.message)).toMatch(/reaction counts unavailable/);
    const h = build((n) => (n === 'promo_mobiles_hist' ? undefined : pg(n)), mongo(), reactRedis());
    expect(await h.svc.reactions('30d', null).catch((e) => e)).toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('fleet comparison blocks on promotions + funnel', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  const SENDS = [
    { cur: true, service: 'p', client_id: 'alpha1', mobile: '919876540001', error_type: null, sent: '300', delivered: '250', banned: '5', failed: '0', last_ts: ist('2026-10-28T15:00:00').toISOString() },
    { cur: true, service: 't', client_id: 'beta1', mobile: '919822220000', error_type: null, sent: '40', delivered: '40', banned: '0', failed: '0', last_ts: ist('2026-10-28T12:00:00').toISOString() },
    { cur: true, service: 't', client_id: 'alpha1', mobile: '919811110000', error_type: null, sent: '100', delivered: '80', banned: '15', failed: '0', last_ts: ist('2026-10-28T15:30:00').toISOString() },
  ];
  const pgP = (n: string) => (n === 'promo_sends' ? SENDS : pg(n));
  const promoRedis = () => ({
    ...reactRedis(),
    readPipeline: jest.fn(async (cmds: Array<[string, string]>) =>
      cmds.map(([cmd, key]) => (cmd === 'hgetall' ? (key === 'tg::acct::919822220000' ? { spamStatus: 'limited' } : {}) : 0)),
    ),
  });

  it('promotions: fleet only when a client is set, equal to the unscoped totals (spam state of other clients included)', async () => {
    const all = await build(pgP, mongo(), promoRedis()).svc.promotions('today', null);
    expect(all).not.toHaveProperty('fleet');
    const scoped = await build(pgP, mongo(), promoRedis()).svc.promotions('today', 'alpha1');
    expect(scoped.families['tg-aut'].totals.sent).toBe(100);
    expect(scoped.fleet.both).toEqual(all.both);
    expect(scoped.fleet.families['tg-aut'].totals).toEqual(all.families['tg-aut'].totals);
    expect(scoped.fleet.families['tg-aut'].totals.mobilesLimited).toBe(1);
    expect(scoped.fleet.families.promote.totals).toEqual(all.families.promote.totals);
  });

  it('funnel: fleet { totals, byOrigin } only when a client is set', async () => {
    const all = await build(pg, mongo(), reactRedis()).svc.funnel('7d', null);
    expect(all).not.toHaveProperty('fleet');
    const scoped = await build(pg, mongo(), reactRedis()).svc.funnel('7d', 'alpha1');
    expect(scoped.fleet.totals).toEqual(all.totals);
    expect(scoped.fleet.byOrigin).toEqual(all.byOrigin);
  });
});

describe('monitor controller: reactions', () => {
  it('parseReactWindow accepts today|7d|30d only (no 24h)', () => {
    expect(parseReactWindow(undefined)).toBe('today');
    expect(parseReactWindow('30d')).toBe('30d');
    expect(() => parseReactWindow('24h')).toThrow();
    expect(() => parseReactWindow('90d')).toThrow();
  });

  it('declared before client/:clientId', () => {
    const proto = MonitorController.prototype as any;
    const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    const paths = names.map((n) => Reflect.getMetadata('path', proto[n]));
    expect(paths.indexOf('reactions')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('reactions')).toBeLessThan(paths.indexOf('client/:clientId'));
  });

  describe('over HTTP', () => {
    let app: INestApplication;
    const svc = {
      reactions: jest.fn(async (window: string, client: string | null) => ({ window, client })),
      client: jest.fn(async () => ({ route: 'client' })),
    };
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ controllers: [MonitorController], providers: [{ provide: MonitorService, useValue: svc }] }).compile();
      app = moduleRef.createNestApplication({ logger: false });
      await app.init();
    });
    afterAll(async () => app.close());

    it('resolves with parsed params', async () => {
      const a = await request(app.getHttpServer()).get('/monitor/reactions?window=7d&client=shruthi1');
      expect(a.status).toBe(200);
      expect(a.body).toEqual({ window: '7d', client: 'shruthi1' });
      expect((await request(app.getHttpServer()).get('/monitor/reactions')).body).toEqual({ window: 'today', client: null });
      expect(svc.client).not.toHaveBeenCalled();
    });

    it.each([['/monitor/reactions?window=24h'], ['/monitor/reactions?window=1y'], ['/monitor/reactions?client=a%20b']])('%s = 400', async (url) => {
      expect((await request(app.getHttpServer()).get(url)).status).toBe(400);
    });
  });
});
