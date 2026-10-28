import { TtlCache } from '../monitor-cache';
import { mapTtfp, timeToFirstPayPipeline, userCohortPipeline } from '../monitor-mongo';
import {
  channelDmsHistSql,
  channelSendsHistSql,
  channelSendsTodaySql,
  dailyClientSql,
  dmRowsSql,
  dmsByDaySql,
  mobilesSql,
  paymentRowsSql,
  sendsHourlySql,
  sendsLiveSql,
} from '../monitor-sql';
import { clientDaysRange, istDate, istDayStart, istHour, resolvePeriod } from '../monitor-time';
import { historyNotes, maskMobile, maskPayload, pooledConversion, ratio, withTimeout } from '../monitor-util';
import { classifyHeartbeat } from '../monitor.service';
import { MonitorController, parseDays, parsePeriod, parseSvc } from '../monitor.controller';

// 2026-10-28 15:42:10 IST
const NOW = Date.parse('2026-10-28T10:12:10.000Z');

describe('monitor IST period math', () => {
  it('today: previous is yesterday up to the same IST time', () => {
    const w = resolvePeriod('today', NOW);
    expect(w.today).toBe('2026-10-28');
    expect(w.range).toEqual({ from: '2026-10-28', to: '2026-10-28' });
    expect(w.prevRange).toEqual({ from: '2026-10-27', to: '2026-10-27' });
    expect(new Date(w.cur.start).toISOString()).toBe('2026-10-27T18:30:00.000Z'); // 00:00 IST
    expect(w.cur.end).toBe(NOW);
    expect(new Date(w.prev.start).toISOString()).toBe('2026-10-26T18:30:00.000Z');
    expect(new Date(w.prev.end).toISOString()).toBe('2026-10-27T10:12:10.000Z'); // 15:42:10 IST yesterday
    expect(w.wholeDays).toBe(false);
  });

  it('today just after IST midnight (UTC still the previous day)', () => {
    const t = Date.parse('2026-10-27T18:35:00.000Z'); // 00:05 IST 10-28
    const w = resolvePeriod('today', t);
    expect(w.today).toBe('2026-10-28');
    expect(w.prev.end - w.prev.start).toBe(5 * 60_000);
  });

  it('7d / 30d: N complete IST days ending yesterday, previous block before', () => {
    const w7 = resolvePeriod('7d', NOW);
    expect(w7.range).toEqual({ from: '2026-10-21', to: '2026-10-27' });
    expect(w7.prevRange).toEqual({ from: '2026-10-14', to: '2026-10-20' });
    expect(w7.cur.end).toBe(istDayStart('2026-10-28'));
    expect(w7.prev.end).toBe(w7.cur.start);
    expect(w7.cur.end - w7.cur.start).toBe(7 * 86_400_000);
    const w30 = resolvePeriod('30d', NOW);
    expect(w30.range).toEqual({ from: '2026-09-28', to: '2026-10-27' });
    expect(w30.prevRange).toEqual({ from: '2026-08-29', to: '2026-09-27' });
  });

  it('client days range includes today', () => {
    expect(clientDaysRange(7, NOW)).toMatchObject({ from: '2026-10-22', to: '2026-10-28', end: NOW });
  });

  it('istDate / istHour', () => {
    expect(istDate(Date.parse('2026-10-27T18:29:59Z'))).toBe('2026-10-27');
    expect(istDate(Date.parse('2026-10-27T18:30:00Z'))).toBe('2026-10-28');
    expect(istHour(Date.parse('2026-10-27T18:30:00Z'))).toBe(0);
    expect(istHour(NOW)).toBe(15);
  });
});

describe('monitor SQL builders', () => {
  const today0 = Date.parse('2026-10-27T18:30:00.000Z');
  const start = Date.parse('2026-09-28T18:30:00.000Z');

  it('every statement is a named SELECT', () => {
    const qs = [
      paymentRowsSql('pay_hist', start, today0),
      paymentRowsSql('pay_today', today0),
      dailyClientSql('dc_hist', '2026-08-29', '2026-10-27'),
      dmsByDaySql(start, today0),
      dmRowsSql('dm_rows_today', today0),
      sendsLiveSql({ start: today0, end: NOW }, NOW - 86_400_000),
      sendsHourlySql({ start: today0 - 86_400_000, end: today0 }),
      mobilesSql('mobiles_hist', '2026-10-22', '2026-10-27'),
      channelDmsHistSql(null, '2026-10-21', '2026-10-28', start, today0),
      channelDmsHistSql('a', '2026-10-21', '2026-10-28', start, today0),
      channelSendsHistSql(null, ['1'], '2026-10-21', '2026-10-28', start, today0),
      channelSendsHistSql('a', ['1'], '2026-10-21', '2026-10-28', start, today0),
      channelSendsTodaySql(null, ['1'], today0),
      channelSendsTodaySql('a', ['1'], today0),
    ];
    for (const q of qs) {
      expect(q.sql.startsWith(`/* monitor.${q.name} */ `)).toBe(true);
      expect(q.sql).toMatch(/^\/\* monitor\.[a-z_]+ \*\/ (SELECT|WITH)/);
      expect(q.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
    }
  });

  it('payments: raw credit rows with client_id, bounded history / open-ended today', () => {
    const h = paymentRowsSql('pay_hist', start, today0);
    expect(h.sql).toContain('FROM payment_event_owner');
    expect(h.sql).toContain('client_id, ts, chat_id, amount, owner_amount, cheat_flagged');
    expect(h.sql).toContain('ts >= $1::timestamptz AND ts < $2::timestamptz AND amount > 0');
    expect(h.params).toEqual(['2026-09-28T18:30:00.000Z', '2026-10-27T18:30:00.000Z']);
    const t = paymentRowsSql('pay_today', today0);
    expect(t.sql).toContain('WHERE ts >= $1::timestamptz AND amount > 0');
    expect(t.params).toEqual(['2026-10-27T18:30:00.000Z']);
  });

  it('daily_client: never revenue or active_users; tg-aut new users only; per (day, client)', () => {
    const q = dailyClientSql('dc_hist', '2026-08-29', '2026-10-27');
    expect(q.sql).not.toMatch(/\brevenue\b/);
    expect(q.sql).not.toContain('active_users');
    expect(q.sql).toContain("namespace = 'tg-aut'");
    expect(q.sql).toContain('GROUP BY day, client_id');
    expect(q.params).toEqual(['2026-08-29', '2026-10-27']);
  });

  it('promotion_send queries never use COUNT(DISTINCT) and are time-bounded', () => {
    const qs = [
      sendsLiveSql({ start: today0, end: NOW }, NOW - 86_400_000),
      sendsHourlySql({ start: today0 - 86_400_000, end: today0 }),
      channelSendsHistSql('a', ['1'], '2026-10-21', '2026-10-28', start, today0),
      channelSendsTodaySql('a', ['1'], today0),
      channelSendsTodaySql(null, ['1'], today0),
    ];
    for (const q of qs) {
      expect(q.sql).toContain('FROM promotion_send');
      expect(q.sql).toMatch(/ts >= \$\d::timestamptz/);
      expect(q.sql.toLowerCase()).not.toContain('count(distinct');
    }
    const live = sendsLiveSql({ start: today0, end: NOW }, NOW - 86_400_000);
    expect(live.params).toEqual([
      '2026-10-27T18:30:00.000Z',
      '2026-10-26T18:30:00.000Z',
      '2026-10-28T10:12:10.000Z',
      '2026-10-27T10:12:10.000Z',
    ]);
  });

  it('dms come from conversion_event kind=dm', () => {
    expect(dmsByDaySql(start, today0).sql).toContain("FROM conversion_event\nWHERE kind = 'dm'");
    expect(dmRowsSql('dm_rows_yday', today0 - 86_400_000, today0).sql).toContain("WHERE kind = 'dm' AND ts >= $1::timestamptz AND ts < $2::timestamptz");
  });

  it('fleet channels: closed days from daily_channel, raw only behind a one-time gate for unrolled days', () => {
    const d = channelDmsHistSql(null, '2026-09-29', '2026-10-28', start, today0);
    expect(d.name).toBe('channels_dms_hist');
    expect(d.sql).toContain('FROM daily_channel\n  WHERE day >= $1::date AND day <= (SELECT d FROM rolled) AND dms > 0');
    expect(d.sql).toContain('WHERE (SELECT d FROM rolled) < $2::date - 1 AND kind = \'dm\'');
    expect(d.sql).not.toMatch(/client_id/);
    expect(d.params).toEqual(['2026-09-29', '2026-10-28', '2026-09-28T18:30:00.000Z', '2026-10-27T18:30:00.000Z']);
    const s = channelSendsHistSql(null, ['1', '2'], '2026-09-29', '2026-10-28', start, today0);
    expect(s.sql).toContain('FROM daily_channel\n  WHERE channel_id = ANY($5::text[]) AND day >= $1::date');
    expect(s.sql).toContain('WHERE (SELECT d FROM rolled) < $2::date - 1 AND channel_id = ANY($5::text[])');
    expect(s.sql).not.toMatch(/client_id/);
    expect(s.params[4]).toEqual(['1', '2']);
    // one client: conversion_event / promotion_send with client_id = $1 (daily_channel has no client)
    const cd = channelDmsHistSql('a', '2026-09-29', '2026-10-28', start, today0);
    expect(cd.sql).toContain("kind = 'dm' AND client_id = $1 AND ts >= $2::timestamptz AND ts < $3::timestamptz");
    expect(cd.sql).not.toContain('daily_channel');
    const cs = channelSendsHistSql('a', ['1'], '2026-09-29', '2026-10-28', start, today0);
    expect(cs.sql).toContain('channel_id = ANY($2::text[]) AND client_id = $1 AND ts >= $3::timestamptz AND ts < $4::timestamptz');
    expect(channelSendsTodaySql('a', ['1'], today0).sql).toContain('AND client_id = $3');
    expect(channelSendsTodaySql(null, ['1'], today0).sql).not.toContain('client_id');
  });

  it('mobiles: per (mobile, client) so history and today merge exactly', () => {
    const m = mobilesSql('mobiles_today', '2026-10-28', '2026-10-28');
    expect(m.sql).toContain('GROUP BY mobile, client_id');
    expect(m.sql).toContain("FILTER (WHERE namespace = 'promote-clients')");
    expect(m.params).toEqual(['2026-10-28', '2026-10-28']);
  });
});

describe('monitor pipelines', () => {
  it('time-to-first-pay pipeline: client filter optional', () => {
    expect((timeToFirstPayPipeline(undefined, 1, 2)[0] as any).$match).toEqual({ firstPaidAt: { $gte: 1, $lt: 2 } });
    expect((timeToFirstPayPipeline('a', 1, 2)[0] as any).$match).toEqual({ clientId: 'a', firstPaidAt: { $gte: 1, $lt: 2 } });
  });
});

describe('monitor conversion math', () => {
  it('pools numerators and denominators over days (not an average of ratios)', () => {
    // day1 1/100 = 1%, day2 10/10 = 100%: pooled 11/110 = 10%, average would be 50.5%
    expect(pooledConversion([{ newUsers: 100, sameDayPayers: 1 }, { newUsers: 10, sameDayPayers: 10 }])).toBe(0.1);
    expect(pooledConversion([])).toBeNull();
    expect(ratio(62, 2428)).toBe(0.0255);
    expect(ratio(5, 0)).toBeNull();
  });

  it('cohort pipeline matches ObjectId time range, optional client, paidBefore cut', () => {
    const p: any[] = userCohortPipeline({ start: Date.parse('2026-10-27T18:30:00Z'), end: NOW, clientId: 'x', paidBefore: 123, byHour: true });
    expect(p[0].$match.clientId).toBe('x');
    expect(p[0].$match._id.$gte.getTimestamp().toISOString()).toBe('2026-10-27T18:30:00.000Z');
    expect(JSON.stringify(p[1])).toContain('"$lt":["$firstPaidAt",123]');
    expect(JSON.stringify(p[1])).toContain('Asia/Kolkata');
  });

  it('time-to-first-pay buckets', () => {
    const m = mapTtfp([
      { _id: -1e15, n: 2 },
      { _id: 0, n: 5 },
      { _id: 120, n: 3 },
      { _id: 4320, n: 1 },
    ]);
    expect(m.negative).toBe(2);
    expect(m.buckets).toEqual([
      { bucket: '<10m', count: 5 },
      { bucket: '10-30m', count: 0 },
      { bucket: '30m-2h', count: 0 },
      { bucket: '2-24h', count: 3 },
      { bucket: '1-3d', count: 0 },
      { bucket: '3d+', count: 1 },
    ]);
  });
});

describe('monitor masking', () => {
  it('masks mobiles to the last 4', () => {
    expect(maskMobile('919876541234')).toBe('••••1234');
    expect(maskMobile(null)).toBeNull();
  });

  it('masks every mobile field in a heartbeat payload, nested, and promote mobiles[].m', () => {
    const out: any = maskPayload({
      mobile: '919999990001',
      ready: { telegram: true, mobile: '918888880002' },
      mobiles: [{ m: '917777770003', ok: 3 }],
      other: ['919999990004'],
    });
    expect(out.mobile).toBe('••••0001');
    expect(out.ready).toEqual({ telegram: true, mobile: '••••0002' });
    expect(out.mobiles[0]).toEqual({ m: '••••0003', ok: 3 });
    expect(out.other).toEqual(['919999990004']);
  });
});

describe('monitor history notes', () => {
  it('flags ranges crossing 2026-10-26 (attribution) and 2026-10-04 (revenue)', () => {
    expect(historyNotes([{ from: '2026-10-27', to: '2026-10-28' }])).toEqual([]);
    const n = historyNotes([{ from: '2026-10-21', to: '2026-10-27' }]);
    expect(n.join(' ')).toContain('2026-10-26');
    expect(n.join(' ')).not.toContain('Revenue history');
    const n30 = historyNotes([{ from: '2026-09-28', to: '2026-10-27' }], { mobiles: true });
    expect(n30).toHaveLength(3);
  });
});

describe('TtlCache single-flight', () => {
  it('shares one load across concurrent callers and caches within the TTL', async () => {
    let t = 0;
    const cache = new TtlCache<number>(1000, 10, () => t);
    let loads = 0;
    let release!: (v: number) => void;
    const loader = () => {
      loads += 1;
      return new Promise<number>((r) => (release = r));
    };
    const a = cache.get('k', loader);
    const b = cache.get('k', loader);
    release(42);
    expect((await a).value).toBe(42);
    expect((await b).value).toBe(42);
    expect(loads).toBe(1);
    t = 999;
    await cache.get('k', async () => (loads += 1));
    expect(loads).toBe(1);
    t = 1000;
    expect((await cache.get('k', async () => 7)).value).toBe(7);
  });

  it('does not cache failures but keeps the last good value', async () => {
    let t = 0;
    const cache = new TtlCache<number>(10, 10, () => t);
    await cache.get('k', async () => 1);
    t = 50;
    await expect(cache.get('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(cache.last('k')).toEqual({ value: 1, at: 0 });
    expect((await cache.get('k', async () => 2)).value).toBe(2);
  });

  it('evicts the oldest key past maxKeys', async () => {
    const cache = new TtlCache<number>(1000, 2);
    await cache.get('a', async () => 1);
    await cache.get('b', async () => 2);
    await cache.get('c', async () => 3);
    expect(cache.last('a')).toBeUndefined();
  });

  it('withTimeout rejects slow work', async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, 'slow')).rejects.toThrow('slow timed out after 10 ms');
  });
});

describe('heartbeat classification (CMS clock)', () => {
  const now = 1_000_000_000;
  it('live within 2*interval+10 s, stale after', () => {
    expect(classifyHeartbeat({ at: now - 70_000, intervalSec: 30 }, now)).toEqual({ state: 'live', ageSec: 70, clockSkew: false });
    expect(classifyHeartbeat({ at: now - 71_000, intervalSec: 30 }, now).state).toBe('stale');
    expect(classifyHeartbeat({ at: now - 50_000 }, now).state).toBe('live'); // default interval 30
    expect(classifyHeartbeat({ at: now - 100_000, intervalSec: 60 }, now).state).toBe('live');
  });
  it('stopping only while recent', () => {
    expect(classifyHeartbeat({ at: now - 100_000, status: 'stopping' }, now).state).toBe('stopping');
    expect(classifyHeartbeat({ at: now - 121_000, status: 'stopping' }, now).state).toBe('stale');
  });
  it('no key = no-heartbeat; bad at = stale; future at = clock skew', () => {
    expect(classifyHeartbeat(null, now)).toEqual({ state: 'no-heartbeat', ageSec: null, clockSkew: false });
    expect(classifyHeartbeat({ at: 'x' }, now).state).toBe('stale');
    expect(classifyHeartbeat({ at: now + 6_000 }, now)).toEqual({ state: 'live', ageSec: 0, clockSkew: true });
  });
});

describe('monitor controller parsing', () => {
  it('validates query params', () => {
    expect(parsePeriod(undefined)).toBe('today');
    expect(parsePeriod('30d')).toBe('30d');
    expect(() => parsePeriod('90d')).toThrow();
    expect(parseDays(undefined)).toBe(7);
    expect(parseDays('30')).toBe(30);
    expect(() => parseDays('14')).toThrow();
    expect(parseSvc(undefined)).toBe('all');
    expect(parseSvc('promote')).toBe('promote');
    expect(() => parseSvc('cms')).toThrow();
  });
});

describe('monitor controller routes', () => {
  it('fleet/detail is its own route, declared before client/:clientId', () => {
    const proto = MonitorController.prototype as any;
    const names = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    const paths = names.map((n) => Reflect.getMetadata('path', proto[n]));
    expect(paths).toContain('fleet/detail');
    expect(paths.indexOf('fleet/detail')).toBeLessThan(paths.indexOf('client/:clientId'));
  });

  it('fleet/detail validates days and calls the service', async () => {
    const svc = { fleetDetail: jest.fn(async (d: number) => ({ days: d })) };
    const c = new MonitorController(svc as any);
    await expect((c as any).fleetDetail('30')).resolves.toEqual({ days: 30 });
    expect(() => (c as any).fleetDetail('14')).toThrow();
  });
});
