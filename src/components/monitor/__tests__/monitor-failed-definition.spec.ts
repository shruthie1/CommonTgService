// Pins the one definition of promotion `failed` (owner 2026-11-08, tg-platform
// docs/design/2026-11-08-analytics-cleanup.md B): failed = count(outcome IN ('failed','banned')) = sent - delivered,
// the same as daily_client / daily_mobile.failed (the sink counts a banned send in both). banned stays its own
// number. Intraday (promotion_send) and closed days (daily_mobile) must add up with no double count and no
// undercount, at every level: mobile, client, family, both.
import { byFamily, sendsByFamily } from '../monitor-family';
import { buildPromotions, PromoRow, promoWindows, rowsFromHist, rowsFromSends } from '../monitor-promotions';
import { promoSendsSql, sendsLiveSql } from '../monitor-sql';

const NOW = Date.parse('2026-10-28T10:12:10.000Z'); // 15:42:10 IST
const DAY = 86_400_000;
const TODAY0 = Date.parse('2026-10-27T18:30:00.000Z');

type Outcome = 'delivered' | 'banned' | 'failed' | 'deleted';
interface Ev { service: 'p' | 't'; client: string; mobile: string; outcome: Outcome; err: string | null }

const many = (n: number, e: Ev): Ev[] => Array.from({ length: n }, () => e);
const P1 = '919876540001';
const T1 = '919822220000';
// today's promotion_send rows
const EVENTS: Ev[] = [
  ...many(20, { service: 'p', client: 'alpha1', mobile: P1, outcome: 'delivered', err: null }),
  ...many(4, { service: 'p', client: 'alpha1', mobile: P1, outcome: 'banned', err: 'USER_BANNED_IN_CHANNEL' }),
  ...many(3, { service: 'p', client: 'alpha1', mobile: P1, outcome: 'failed', err: 'FLOOD' }),
  ...many(1, { service: 'p', client: 'alpha1', mobile: P1, outcome: 'deleted', err: null }),
  ...many(10, { service: 't', client: 'beta1', mobile: T1, outcome: 'delivered', err: null }),
  ...many(2, { service: 't', client: 'beta1', mobile: T1, outcome: 'banned', err: 'USER_BANNED_IN_CHANNEL' }),
];
const failedOrBanned = (e: Ev) => e.outcome === 'failed' || e.outcome === 'banned';

/** promo_sends as Postgres computes it (the FILTERs pinned below), current window only. */
function promoSendsRows(events: Ev[]): any[] {
  const out = new Map<string, any>();
  for (const e of events) {
    const k = `${e.service}|${e.client}|${e.mobile}|${e.err}`;
    const a = out.get(k) ?? { cur: true, service: e.service, client_id: e.client, mobile: e.mobile, error_type: e.err, sent: 0, delivered: 0, banned: 0, failed: 0, last_ts: new Date(NOW - 60_000).toISOString() };
    if (e.outcome !== 'deleted') a.sent += 1;
    if (e.outcome === 'delivered') a.delivered += 1;
    if (e.outcome === 'banned') a.banned += 1;
    if (failedOrBanned(e)) a.failed += 1;
    out.set(k, a);
  }
  return [...out.values()].map((a) => ({ ...a, sent: String(a.sent), delivered: String(a.delivered), banned: String(a.banned), failed: String(a.failed) }));
}

// closed days: daily_mobile (failed already includes banned)
const HIST = [
  { cur: true, namespace: 'promote-clients', client_id: 'alpha1', mobile: P1, profile: 'alpha', sent: '100', delivered: '80', banned: '15', failed: '20', new_users: '0', last_day: '2026-10-27' },
  { cur: true, namespace: 'tg-aut', client_id: 'beta1', mobile: T1, profile: 'beta', sent: '50', delivered: '45', banned: '3', failed: '5', new_users: '0', last_day: '2026-10-27' },
];

const build = (rows: PromoRow[], window: 'today' | '7d') =>
  buildPromotions({
    w: promoWindows(window, NOW),
    rows,
    extra: null,
    dms: { cur: null, prev: null },
    spam: null,
    route: null,
    heartbeats: null,
    assigned: null,
    names: new Map(),
    routedCols: [],
    client: null,
  });

/** failed = sent - delivered (no deleted in sent) at every level of the body. */
function expectFailedIsSentMinusDelivered(body: ReturnType<typeof buildPromotions>) {
  const all = [body.both, ...Object.values(body.families).flatMap((f) => [f.totals, ...f.clients, ...f.mobiles])];
  expect(all.length).toBeGreaterThan(3);
  for (const x of all) expect(x.failed).toBe(x.sent - x.delivered);
}

describe('promotion failed = failed + banned everywhere', () => {
  it('intraday SQL counts outcome IN (failed, banned) as failed and keeps banned separate', () => {
    for (const qy of [sendsLiveSql({ start: TODAY0, end: NOW }, NOW - DAY), promoSendsSql({ start: TODAY0, end: NOW }, { start: TODAY0 - DAY, end: NOW - DAY })]) {
      expect(qy.sql).toContain("count(*) FILTER (WHERE outcome IN ('failed', 'banned')) AS failed");
      expect(qy.sql).toContain("count(*) FILTER (WHERE outcome = 'banned') AS banned");
      expect(qy.sql).not.toContain("outcome = 'failed')");
    }
  });

  it('today: failed = count(outcome IN failed,banned) per mobile / client / family / both; error mix excludes banned', () => {
    const body = build(rowsFromSends(promoSendsRows(EVENTS)), 'today');
    const count = (pred: (e: Ev) => boolean) => EVENTS.filter(pred).length;
    const p = body.families.promote;
    expect(p.totals).toMatchObject({ sent: 27, delivered: 20, banned: 4, failed: count((e) => e.service === 'p' && failedOrBanned(e)) });
    expect(p.totals.failed).toBe(7);
    expect(p.clients.find((c) => c.clientId === 'alpha1')).toMatchObject({ failed: 7, banned: 4 });
    expect(p.mobiles[0]).toMatchObject({ failed: 7, banned: 4, topError: { type: 'FLOOD', count: 3 } });
    const t = body.families['tg-aut'];
    expect(t.totals).toMatchObject({ sent: 12, delivered: 10, banned: 2, failed: 2 });
    expect(t.mobiles[0].topError).toBeNull();
    expect(body.both).toMatchObject({ failed: count(failedOrBanned), banned: count((e) => e.outcome === 'banned') });
    expect(body.both.failed).toBe(9);
    expectFailedIsSentMinusDelivered(body);
  });

  it('multi-day (closed days + today): failed = daily_mobile.failed + today failed+banned, banned never added twice', () => {
    const today = rowsFromSends(promoSendsRows(EVENTS));
    const body = build([...rowsFromHist(HIST, []), ...today], '7d');
    const p = body.families.promote;
    expect(p.totals).toMatchObject({ sent: 127, delivered: 100, banned: 19, failed: 27 });
    expect(p.clients.find((c) => c.clientId === 'alpha1')).toMatchObject({ failed: 27, banned: 19 });
    expect(p.mobiles[0]).toMatchObject({ failed: 27, banned: 19, topError: { type: 'FLOOD', count: 3 } });
    expect(body.families['tg-aut'].totals).toMatchObject({ sent: 62, delivered: 55, banned: 5, failed: 7 });
    expect(body.both).toMatchObject({ sent: 189, delivered: 155, banned: 24, failed: 34 });
    expectFailedIsSentMinusDelivered(body);
  });

  it('overview families: today sends_live rows and daily_client rows use the same failed', () => {
    const live = promoSendsRows(EVENTS).map((r) => ({ ...r, today: true }));
    const fam = byFamily(sendsByFamily(live, 'service'), null);
    expect(fam.promote).toMatchObject({ sends: 27, sendSuccess: 20, banned: 4, failed: 7 });
    expect(fam['tg-aut']).toMatchObject({ sends: 12, sendSuccess: 10, banned: 2, failed: 2 });
    const dc = [
      { client_id: 'alpha1', namespace: 'promote-clients', sent: '100', delivered: '80', banned: '15', failed: '20' },
      { client_id: 'beta1', namespace: 'tg-aut', sent: '50', delivered: '45', banned: '3', failed: '5' },
    ];
    const both = sendsByFamily([...dc, ...live.map((r) => ({ ...r, namespace: r.service === 'p' ? 'promote-clients' : 'tg-aut' }))], 'namespace');
    expect(both.total.promote).toEqual({ sent: 127, delivered: 100, banned: 19, failed: 27 });
    expect(both.total['tg-aut']).toEqual({ sent: 62, delivered: 55, banned: 5, failed: 7 });
  });
});
