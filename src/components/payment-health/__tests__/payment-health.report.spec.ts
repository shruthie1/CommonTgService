import {
    HealthProof, PgPaymentRow, buildCheck, buildReport, formatReport, holdsAndFakes, istDay, istDayRange, needsLook, reconcile,
} from '../payment-health.report';

const DAY = '2026-11-10';
const { from, to } = istDayRange(DAY);
const t = (minAfterStart: number) => from + minAfterStart * 60_000;
let n = 0;
const proof = (over: Partial<HealthProof>): HealthProof => ({
    proofId: `meghana2-100-${++n}`, chatId: '100', clientId: 'meghana2', amount: 50, creditAmount: 50,
    servedAt: new Date(t(600)), createdAt: new Date(t(600)), verdict: { outcome: 'credited', reasons: [] }, imageSha256: `s${n}`, ...over,
});
const pg = (over: Partial<PgPaymentRow>): PgPaymentRow => ({
    id: String(++n), ts: t(600), chatId: '100', clientId: 'meghana2', amount: 50, source: 'screenshot', voided: false, voidProofId: null, ...over,
});

describe('payment health report', () => {
    it('IST day range: 2026-11-10 IST = 2026-11-09T18:30Z .. 2026-11-10T18:30Z; yesterday of 09:00 IST', () => {
        expect(new Date(from).toISOString()).toBe('2026-11-09T18:30:00.000Z');
        expect(to - from).toBe(86_400_000);
        expect(istDay(Date.parse('2026-11-11T03:30:00Z'), -1)).toBe('2026-11-10');
    });

    it('reconcile: matched, missing, extra, voided, void mismatches; boundary rows; other sources', () => {
        const ok = proof({ servedAt: new Date(t(100)) });
        const missing = proof({ chatId: '200', servedAt: new Date(t(200)), amount: 70, creditAmount: 70 });
        const unc = proof({ chatId: '300', servedAt: new Date(t(300)), uncredited: { state: 'done' } });
        const voidedLive = proof({ chatId: '400', servedAt: new Date(t(400)) });
        const uncLive = proof({ chatId: '500', servedAt: new Date(t(500)), uncredited: { state: 'done' } });
        const boundary = proof({ chatId: '600', servedAt: new Date(from - 5 * 60_000) }); // served the day before
        const notCredited = proof({ chatId: '700', verdict: { outcome: 'repeat' } });
        const rows = [
            pg({ ts: t(102) }), // 2 min after: match ok
            pg({ chatId: '300', ts: t(301), voided: true, voidProofId: unc.proofId }),
            pg({ chatId: '400', ts: t(400), voided: true }),
            pg({ chatId: '500', ts: t(500) }),
            pg({ chatId: '600', ts: from + 60_000 }), // inside the day, belongs to the boundary proof
            pg({ chatId: '800', ts: t(900), amount: 99 }), // extra
            pg({ chatId: '100', ts: t(130) }), // too far (30 min) from ok -> extra
            pg({ source: 'manual', ts: t(10) }),
        ];
        const r = reconcile([ok, missing, unc, voidedLive, uncLive, boundary, notCredited], rows, from, to);
        expect(r.credited).toEqual({ count: 3, amount: 170 }); // ok 50, missing 70, voidedLive 50
        expect(r.uncredited).toEqual({ count: 2, amount: 100 });
        expect(r.missing.map((m) => m.proofId)).toEqual([missing.proofId]);
        expect(r.extra.map((x) => x.chatId).sort()).toEqual(['100', '800']);
        expect(r.voided).toEqual({ count: 2, amount: 100 });
        expect(r.voidedButCredited.map((x) => x.proofId)).toEqual([voidedLive.proofId]);
        expect(r.uncreditedButCounted.map((x) => x.proofId)).toEqual([uncLive.proofId]);
        expect(r.otherSources).toEqual({ manual: 1 });
        expect(r.rows.count).toBe(7);
    });

    it('reconcile: an extra row next to a served proof with a non-credited verdict names that proof', () => {
        const odd = proof({ chatId: '6395839176', clientId: 'arpitha1', amount: 51, creditAmount: 51, servedAt: new Date(t(100)), verdict: { outcome: 'repeat', reasons: ['DUPLICATE_UPDATE'] } });
        const r = reconcile([odd], [pg({ chatId: '6395839176', clientId: 'arpitha1', amount: 51, ts: t(100) })], from, to);
        expect(r.credited.count).toBe(0);
        expect(r.extra).toEqual([expect.objectContaining({ chatId: '6395839176', note: `served, verdict repeat: ${odd.proofId}` })]);
    });

    it('reconcile: two same-amount credits match two rows, closest first, each row once', () => {
        const a = proof({ servedAt: new Date(t(100)) });
        const b = proof({ servedAt: new Date(t(104)) });
        const r = reconcile([a, b], [pg({ ts: t(100) }), pg({ ts: t(105) })], from, to);
        expect(r.missing).toEqual([]);
        expect(r.extra).toEqual([]);
        const r2 = reconcile([a, b], [pg({ ts: t(101) })], from, to);
        expect(r2.missing.map((m) => m.proofId)).toEqual([b.proofId]);
    });

    it('holds and fake flags by reason (proofs created in the day only)', () => {
        const rows = [
            proof({ ask: { kind: 'held', state: 'open', reasons: ['PERSONA_PAYEE'] }, verdict: { outcome: 'other', reasons: ['PERSONA_PAYEE'] } }),
            proof({ ask: { kind: 'held', state: 'resolved', reasons: ['PERSONA_PAYEE', 'OLD_PAYMENT'] } }),
            proof({ ask: { kind: 'old_time', state: 'open' }, verdict: { outcome: 'old_time', reasons: ['OLD_PAYMENT'] } }),
            proof({ verdict: { outcome: 'fraud_ask', reasons: ['FAKE_TEXT'] } }),
            proof({ verdict: { outcome: 'fake_blocked', reasons: ['FAKE_TEXT', 'SECOND_FAKE'] } }),
            proof({ verdict: { outcome: 'fraud_ask', reasons: ['FAKE_TEXT'] }, createdAt: new Date(from - 1) }), // day before
        ];
        const h = holdsAndFakes(rows, from, to);
        expect(h.holds).toEqual({ total: 3, open: 2, byReason: [['OLD_PAYMENT', 2], ['PERSONA_PAYEE', 2]] });
        expect(h.fakes).toEqual({ total: 2, byReason: [['FAKE_TEXT', 2], ['SECOND_FAKE', 1]] });
    });

    it('build check: newest builtAt wins; older or unstamped processes are behind; skipped without data', () => {
        const b = buildCheck([
            { clientId: 'b1', sha: 'aaaaaaa1', builtAt: '2026-11-10T10:00:00Z' },
            { clientId: 'a1', sha: 'bbbbbbb2', builtAt: '2026-11-09T10:00:00Z' },
            { clientId: 'c1', sha: null, builtAt: null },
        ]);
        expect(b.newest).toEqual({ sha: 'aaaaaaa1', builtAt: '2026-11-10T10:00:00Z' });
        expect(b.behind!.map((p) => p.clientId)).toEqual(['a1', 'c1']);
        expect(buildCheck(null, 'redis down').skipped).toBe('redis down');
        expect(buildCheck([]).skipped).toMatch(/no live/);
    });

    it('report + message: doubles in the day, counts, tables; Postgres down = revenue check skipped', () => {
        const a = proof({ chatId: '6809433050', amount: 100, creditAmount: 100, servedAt: new Date(t(100)), time: { state: 'known', epochMs: t(99) }, ocr: { precheckText: '1 min ago' } });
        const b = proof({ chatId: '6809433050', amount: 100, creditAmount: 100, servedAt: new Date(t(400)), utr: 'T2611091131442440992013', time: { state: 'known', epochMs: t(98) } });
        const r = buildReport({ day: DAY, proofs: [a, b], pgRows: [pg({ chatId: '6809433050', amount: 100, ts: t(100) })], processes: [] });
        expect(r.doubles).toHaveLength(1);
        expect(r.reconcile!.missing.map((m) => m.proofId)).toEqual([b.proofId]);
        expect(needsLook(r)).toBe(true);
        const msg = formatReport(r);
        expect(msg.title).toBe('Payment health 2026-11-10');
        expect(msg.severity).toBe('warning');
        const field = (label: string) => msg.fields!.find((f) => f.label === label)?.value;
        expect(field('Credited')).toBe('2 · ₹200');
        expect(field('Missing rows')).toBe('1 · ₹100');
        expect(field('Possible double credits')).toBe('1 · ₹100');
        expect(field('Old build')).toMatch(/^skipped: no live/);
        expect(msg.tables!.map((x) => x.title)).toEqual(['Credited, no revenue row', 'Possible double credit, check']);

        const down = buildReport({ day: DAY, proofs: [], pgRows: null, pgError: 'query: timeout', processes: null, processesSkipped: 'redis down' });
        expect(down.reconcile).toBeNull();
        const m2 = formatReport(down);
        expect(m2.fields!.find((f) => f.label === 'Revenue check')?.value).toBe('skipped: query: timeout');
        expect(m2.severity).toBe('warning');

        const clean = buildReport({ day: DAY, proofs: [proof({ servedAt: new Date(t(5)) })], pgRows: [pg({ ts: t(5) })], processes: [{ clientId: 'x', sha: 'abc', builtAt: '2026-11-10T00:00:00Z' }] });
        expect(formatReport(clean).severity).toBe('info');
        expect(formatReport(clean).tables).toEqual([]);
    });

    it('long lists are capped in the message, counts are not', () => {
        const proofs = Array.from({ length: 12 }, (_, i) => proof({ chatId: `9${i}`, servedAt: new Date(t(10 + i)) }));
        const msg = formatReport(buildReport({ day: DAY, proofs, pgRows: [], processes: null }));
        const tbl = msg.tables!.find((x) => x.title!.startsWith('Credited, no revenue row'))!;
        expect(tbl.title).toContain('(first 8 of 12)');
        expect(tbl.rows).toHaveLength(8);
        expect(msg.fields!.find((f) => f.label === 'Missing rows')?.value).toBe('12 · ₹600');
    });
});
