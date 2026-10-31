/**
 * from..to IST ranges on the monitor endpoints (tg-chats design 2026-10-31 §4). The legacy period/days/window
 * responses are pinned to a golden captured from the pre-change build (f8d3da89) with the same fixtures.
 */
import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MonitorController, parseRange } from '../monitor.controller';
import { legacyOf, MonitorService } from '../monitor.service';
import { foldMobileDays } from '../monitor-promotions';
import { MONITOR_PERIODS, presetOf, resolvePeriod, resolveRange } from '../monitor-time';
import { buildService, legacyResponses, MOBILE_DAYS, NOW, promoHistRows } from './monitor-range.fixtures';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const golden = require('./monitor-legacy-golden.json');

const strip = (v: any) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'timingsMs' || k === 'cache' || k === 'generatedAt' ? undefined : x)));
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('legacy params are unchanged', () => {
  it('fleet/detail/client/funnel/promotions/reactions presets equal the pre-change golden', async () => {
    expect(await legacyResponses()).toEqual(golden);
  });
});

describe('parseRange', () => {
  const bad = (from?: string, to?: string) => expect(() => parseRange(from, to, NOW)).toThrow(BadRequestException);

  it('null without from; to defaults to from', () => {
    expect(parseRange(undefined, undefined, NOW)).toBeNull();
    expect(parseRange('', '', NOW)).toBeNull();
    expect(parseRange('2026-10-20', undefined, NOW)).toEqual({ from: '2026-10-20', to: '2026-10-20' });
    expect(parseRange('2026-10-04', '2026-10-31', NOW)).toEqual({ from: '2026-10-04', to: '2026-10-31' });
  });

  it('400 on bad, inverted, future, too long and too early ranges', () => {
    bad(undefined, '2026-10-20'); // to without from
    bad('2026-10-2', '2026-10-20');
    bad('2026-02-30');
    bad('20261020');
    bad('2026-10-22', '2026-10-20');
    bad('2026-10-30', '2026-11-01'); // after today IST
    bad('2026-10-03', '2026-10-10'); // before 2026-10-04
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 60 * 86_400_000);
    bad('2026-11-01', '2026-12-30'); // 60 days > 31 (today 2026-12-30)
    expect(parseRange('2026-11-01', '2026-11-30', Date.now())).toEqual({ from: '2026-11-01', to: '2026-11-30' }); // from = today - 59
  });

  it('31 days allowed, 32 rejected; from >= today - 59', () => {
    expect(parseRange('2026-10-04', '2026-11-03', NOW + 3 * 86_400_000)).toEqual({ from: '2026-10-04', to: '2026-11-03' });
    expect(() => parseRange('2026-10-04', '2026-11-04', NOW + 4 * 86_400_000)).toThrow(BadRequestException);
    const later = NOW + 70 * 86_400_000; // today 2027-01-09, floor 2026-11-11
    expect(() => parseRange('2026-11-10', '2026-11-12', later)).toThrow(BadRequestException);
    expect(parseRange('2026-11-11', '2026-11-12', later)).toEqual({ from: '2026-11-11', to: '2026-11-12' });
  });
});

describe('resolveRange / presetOf', () => {
  it('resolveRange of a preset range equals resolvePeriod', () => {
    for (const p of MONITOR_PERIODS) {
      const a = resolvePeriod(p, NOW);
      const b = resolveRange(a.range.from, a.range.to, NOW);
      expect({ range: b.range, prevRange: b.prevRange, cur: b.cur, prev: b.prev }).toEqual({ range: a.range, prevRange: a.prevRange, cur: a.cur, prev: a.prev });
      expect(presetOf(a.range, '2026-10-31')).toBe(p);
    }
  });

  it('kinds and equal-length previous windows', () => {
    const m = resolveRange('2026-10-29', '2026-10-31', NOW);
    expect(m.kind).toBe('mixed');
    expect(m.prevRange).toEqual({ from: '2026-10-26', to: '2026-10-28' });
    expect(m.prev.end).toBe(NOW - 3 * 86_400_000);
    const d = resolveRange('2026-10-20', '2026-10-22', NOW);
    expect(d.kind).toBe('days');
    expect(d.prevRange).toEqual({ from: '2026-10-17', to: '2026-10-19' });
    expect(resolveRange('2026-10-31', '2026-10-31', NOW).kind).toBe('intraday');
    expect(presetOf({ from: '2026-10-23', to: '2026-10-29' }, '2026-10-31')).toBeNull();
  });
});

describe('/monitor/fleet?from=&to=', () => {
  it('a preset-equal range is the legacy response plus range fields', async () => {
    const legacy = await buildService().svc.fleet('7d');
    const r = await buildService().svc.fleetRange({ from: '2026-10-24', to: '2026-10-30' });
    const { rangeKind, clientsDaily, amountBuckets } = r as any;
    expect(strip(legacyOf(r))).toEqual(strip(legacy));
    expect(r.notes.some((n: string) => n.startsWith('clientsDaily'))).toBe(true);
    expect(rangeKind).toBe('days');
    expect(clientsDaily).toHaveLength(3 * 7);
    expect(amountBuckets).toHaveLength(3 * 5);
    const t = await buildService().svc.fleetRange({ from: '2026-10-31', to: '2026-10-31' });
    const { rangeKind: k2, clientsDaily: cd2, amountBuckets: ab2 } = t as any;
    expect(strip(legacyOf(t))).toEqual(strip(await buildService().svc.fleet('today')));
    expect(k2).toBe('intraday');
    expect(cd2.every((x: any) => x.date === '2026-10-31' && typeof x.hour === 'number')).toBe(true);
    expect(ab2).toHaveLength(15);
  });

  it('clientsDaily and amountBuckets add up to the client totals', async () => {
    const r: any = await buildService().svc.fleetRange({ from: '2026-10-18', to: '2026-10-22' });
    expect(r.period).toBeNull();
    expect(r.previousRange).toEqual({ from: '2026-10-13', to: '2026-10-17' });
    for (const c of r.clients) {
      const days = r.clientsDaily.filter((x: any) => x.clientId === c.clientId);
      expect(days.map((x: any) => x.date)).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
      expect(days.reduce((s: number, x: any) => s + x.revenue, 0)).toBe(c.revenue);
      expect(days.reduce((s: number, x: any) => s + x.newUsers, 0)).toBe(c.newUsers);
      expect(days.reduce((s: number, x: any) => s + x.payers, 0)).toBeGreaterThanOrEqual(c.payers);
      const buckets = r.amountBuckets.filter((x: any) => x.clientId === c.clientId);
      expect(buckets.map((b: any) => b.bucket)).toEqual(['<100', '100-199', '200-349', '350-599', '600-999']);
      expect(buckets.reduce((s: number, x: any) => s + x.revenue, 0)).toBeLessThanOrEqual(c.revenue);
    }
    // alpha1 pays 100 + 50 + 250 every day: 5 x (one <100, one 100-199, one 200-349)
    const a = Object.fromEntries(r.amountBuckets.filter((x: any) => x.clientId === 'alpha1').map((x: any) => [x.bucket, x.count]));
    expect(a).toEqual({ '<100': 5, '100-199': 5, '200-349': 5, '350-599': 0, '600-999': 0 });
  });

  it('mixed range: previous revenue is cut at the same time of day N days back', async () => {
    const r: any = await buildService().svc.fleetRange({ from: '2026-10-29', to: '2026-10-31' });
    expect(r.rangeKind).toBe('mixed');
    // current: 2 closed days x 750 + today 900; previous: 10-26, 10-27 = 750 each, 10-28 up to 15:30 IST = 500
    expect(r.fleet.revenue).toBe(2 * 750 + 900);
    expect(r.previous.revenue).toBe(2 * 750 + 500);
    expect(r.clientsDaily.filter((x: any) => x.date === '2026-10-31').reduce((s: number, x: any) => s + x.revenue, 0)).toBe(900);
  });

  it('closed ranges are memory-only; ranges with today persist to Redis', async () => {
    const store = new Map<string, string>();
    const { svc } = buildService({ store });
    await svc.fleetRange({ from: '2026-10-20', to: '2026-10-22' });
    await svc.fleetRange({ from: '2026-10-29', to: '2026-10-31' });
    await flush();
    const keys = [...store.keys()];
    expect(keys).toContain('monitor::snapshot::fleet:r:2026-10-29:2026-10-31');
    expect(keys.some((k) => k.includes('2026-10-20'))).toBe(false);
  });
});

describe('/monitor/promotions and /monitor/reactions ranges', () => {
  it('foldMobileDays matches the promo_mobiles_hist SQL fold', () => {
    const norm = (rows: any[]) =>
      rows
        .map((r) => ({ ...r, ...Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'string' && /^\d+$/.test(v)).map(([k, v]) => [k, Number(v)])) }))
        .sort((x, y) => `${x.cur}${x.namespace}${x.mobile}`.localeCompare(`${y.cur}${y.namespace}${y.mobile}`));
    const got = foldMobileDays(MOBILE_DAYS, { from: '2026-10-20', to: '2026-10-25' }, { from: '2026-10-14', to: '2026-10-19' });
    expect(norm(got)).toEqual(norm(promoHistRows(['2026-10-14', '2026-10-20', '2026-10-25'])));
  });

  it('a preset-equal promotions range is the legacy 7d response', async () => {
    const legacy: any = await buildService().svc.promotions('7d', 'alpha1');
    const r: any = await buildService().svc.promotionsRange({ from: '2026-10-24', to: '2026-10-30' }, 'alpha1');
    const { rangeKind, ...rest } = r;
    expect(rangeKind).toBe('days');
    expect(strip(rest)).toEqual(strip(legacy));
  });

  it('a non-preset promotions range sums daily_mobile over exactly those days', async () => {
    const r: any = await buildService().svc.promotionsRange({ from: '2026-10-20', to: '2026-10-22' }, 'alpha1');
    expect(r.window).toBeNull();
    expect(r.range).toEqual({ from: '2026-10-20', to: '2026-10-22' });
    expect(r.previousRange).toEqual({ from: '2026-10-17', to: '2026-10-19' });
    expect(r.families.promote.totals.sent).toBe(300);
    expect(r.families.promote.previous.sent).toBe(300);
    expect(r.families['tg-aut'].totals.sent).toBe(120);
  });

  it('reactions range: window null and daily limited to the range', async () => {
    const r: any = await buildService().svc.reactionsRange({ from: '2026-10-20', to: '2026-10-22' }, null);
    expect(r.window).toBeNull();
    expect(r.range).toEqual({ from: '2026-10-20', to: '2026-10-22' });
    expect([...new Set(r.daily.map((d: any) => d.day))]).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    const p: any = await buildService().svc.reactionsRange({ from: '2026-10-24', to: '2026-10-30' }, null);
    const { rangeKind, ...rest } = p;
    expect(rangeKind).toBe('days');
    expect(strip(rest)).toEqual(strip(await buildService().svc.reactions('7d', null)));
  });
});

describe('detail and funnel ranges', () => {
  it('client range: bounded daily, no hourly, previous range', async () => {
    const r: any = await buildService().svc.clientRange('alpha1', { from: '2026-10-20', to: '2026-10-22' });
    expect(r.range).toEqual({ from: '2026-10-20', to: '2026-10-22' });
    expect(r.previousRange).toEqual({ from: '2026-10-17', to: '2026-10-19' });
    expect(r.rangeKind).toBe('days');
    expect(r.hourly).toBeNull();
    expect(r.daily.map((d: any) => d.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(r.summary.revenue).toBe(3 * 400);
    const f: any = await buildService().svc.fleetDetailRange({ from: '2026-10-29', to: '2026-10-31' });
    expect(f.rangeKind).toBe('mixed');
    expect(f.hourly).not.toBeNull();
  });

  it('funnel range covers the same days as fleet', async () => {
    const r: any = await buildService().svc.funnelRange({ from: '2026-10-20', to: '2026-10-22' }, null);
    const fl: any = await buildService().svc.fleetRange({ from: '2026-10-20', to: '2026-10-22' });
    expect(r.period).toBeNull();
    expect(r.rangeKind).toBe('days');
    expect(r.range).toEqual({ from: '2026-10-20', to: '2026-10-22' });
    expect(r.totals.newUsers).toBe(fl.fleet.newUsers);
    const t: any = await buildService().svc.funnelRange({ from: '2026-10-31', to: '2026-10-31' }, 'alpha1');
    const { rangeKind, ...rest } = t;
    expect(rangeKind).toBe('intraday');
    expect(strip(rest)).toEqual(strip(await buildService().svc.funnel('today', 'alpha1')));
  });
});

describe('from/to over HTTP', () => {
  let app: INestApplication;
  const ok = (name: string) => jest.fn(async (...a: any[]) => ({ route: name, args: a }));
  const svc: Record<string, jest.Mock> = {
    fleet: ok('fleet'),
    fleetRange: ok('fleetRange'),
    fleetDetail: ok('fleetDetail'),
    fleetDetailRange: ok('fleetDetailRange'),
    promotions: ok('promotions'),
    promotionsRange: ok('promotionsRange'),
    reactions: ok('reactions'),
    reactionsRange: ok('reactionsRange'),
    funnel: ok('funnel'),
    funnelRange: ok('funnelRange'),
    client: ok('client'),
    clientRange: ok('clientRange'),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [MonitorController], providers: [{ provide: MonitorService, useValue: svc }] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['/monitor/fleet?from=2026-10-20&to=2026-10-22&period=30d', 'fleetRange', [{ from: '2026-10-20', to: '2026-10-22' }]],
    ['/monitor/fleet/detail?from=2026-10-20', 'fleetDetailRange', [{ from: '2026-10-20', to: '2026-10-20' }]],
    ['/monitor/promotions?from=2026-10-20&to=2026-10-22&client=alpha1', 'promotionsRange', [{ from: '2026-10-20', to: '2026-10-22' }, 'alpha1']],
    ['/monitor/reactions?from=2026-10-20&to=2026-10-22', 'reactionsRange', [{ from: '2026-10-20', to: '2026-10-22' }, null]],
    ['/monitor/funnel?from=2026-10-20&to=2026-10-22&client=beta1', 'funnelRange', [{ from: '2026-10-20', to: '2026-10-22' }, 'beta1']],
    ['/monitor/client/alpha1?from=2026-10-20&to=2026-10-22', 'clientRange', ['alpha1', { from: '2026-10-20', to: '2026-10-22' }]],
    ['/monitor/fleet?period=7d', 'fleet', ['7d']],
    ['/monitor/promotions?window=24h', 'promotions', ['24h', null]],
  ])('%s -> %s', async (url, route, args) => {
    const res = await request(app.getHttpServer()).get(url);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route, args });
  });

  it.each([
    '/monitor/fleet?to=2026-10-20',
    '/monitor/fleet?from=2026-10-03',
    '/monitor/fleet?from=2026-10-30&to=2026-11-01',
    '/monitor/fleet/detail?from=2026-02-30',
    '/monitor/promotions?from=2026-10-22&to=2026-10-20',
    '/monitor/reactions?from=bad',
    '/monitor/funnel?from=2026-10-1',
    '/monitor/client/alpha1?from=2026-10-03&to=2026-10-05',
  ])('%s -> 400', async (url) => {
    const res = await request(app.getHttpServer()).get(url);
    expect(res.status).toBe(400);
  });
});
