/** Pure rules of the payments review screen (contract section 2): outcome derivation, states, proofId, cursor. */
import {
    DEFAULT_REVIEW_OPTIONS, buildReviewModel, classify, decodeCursor, deriveLegacyOutcome, encodeCursor, inState,
    isAfterCursor, parseProofId, proofIdOf, reviewOptionsFromEnv,
} from '../payment-proofs.classify';

const base = (over: Record<string, unknown> = {}): any => ({
    _id: '6ae96d2f023e6f34c07f2ffa', chatId: '5598996725', profile: 'keerthi', clientId: 'keerthi2', telegramMsgId: 94585,
    createdAt: new Date('2026-11-03T05:12:15Z'), decision: 'ACCEPT', reasons: [], ...over,
});

describe('legacy rows (no verdict): outcome derived from servedAt / ask / decision', () => {
    it.each([
        [{ servedAt: new Date(), creditAmount: 20 }, 'credited'],
        [{ ask: { kind: 'fraud', state: 'open' } }, 'fraud_ask'],
        [{ ask: { kind: 'fraud', state: 'open', blockedAt: new Date() } }, 'fake_blocked'],
        [{ ask: { kind: 'old_time', state: 'open' } }, 'old_time'],
        [{ decision: 'REJECT_DUPLICATE' }, 'repeat'],
        [{ decision: 'BLOCK' }, 'fake_blocked'],
        [{ decision: 'ASK_PROOF' }, 'fraud_ask'],
        [{}, 'other'],
        // a served row wins over an older ask on the same row
        [{ servedAt: new Date(), ask: { kind: 'fraud', state: 'resolved' } }, 'credited'],
    ])('%j -> %s', (over, outcome) => {
        expect(deriveLegacyOutcome(base(over))).toBe(outcome);
        const c = classify(base(over));
        expect(c.outcome).toBe(outcome);
        expect(c.legacy).toBe(true);
        expect(c.fakeScore).toBeNull();
    });

    it('derives proofId from clientId-chatId-telegramMsgId and merges row + ask reasons', () => {
        const c = classify(base({ reasons: ['A'], ask: { kind: 'fraud', reasons: ['A', 'B'] } }));
        expect(c.proofId).toBe('keerthi2-5598996725-94585');
        expect(c.reasons).toEqual(['A', 'B']);
    });

    it('uses creditAmount over the amount read', () => {
        expect(classify(base({ amount: 350, creditAmount: 300, servedAt: new Date() })).amount).toBe(300);
        expect(classify(base({ amount: 350 })).amount).toBe(350);
        expect(classify(base()).amount).toBeNull();
    });
});

describe('new rows (verdict present)', () => {
    it('reads outcome, reasons and fakeScore from verdict, ignoring servedAt', () => {
        const c = classify(base({ proofId: 'p-1-2', servedAt: new Date(), verdict: { outcome: 'not_ours', reasons: ['UPI_NOT_OURS'], fakeScore: 12 } }));
        expect(c).toMatchObject({ proofId: 'p-1-2', outcome: 'not_ours', legacy: false, reasons: ['UPI_NOT_OURS'], fakeScore: 12, credited: false });
    });
    it('a verdict without outcome falls back to the legacy derivation', () => {
        expect(classify(base({ verdict: { reasons: [] }, servedAt: new Date() })).outcome).toBe('credited');
    });
});

describe('review signals (buildReviewModel: risk, strong, repeat, reusedFrom; the old review queue was removed 2026-11-08)', () => {
    const T0 = Date.parse('2026-11-03T05:00:00Z'); // 10:30 IST
    let n = 0;
    const oid = () => (++n).toString(16).padStart(24, '0');
    const row = (over: Record<string, unknown> = {}): any => base({
        _id: oid(), telegramMsgId: n, createdAt: new Date(T0 + n * 60_000), time: { state: 'known', epochMs: T0 + n * 60_000 },
        ...over,
    });
    const credited = (amount: number, over: Record<string, unknown> = {}) =>
        row({ servedAt: new Date(), creditAmount: amount, amount, ...over });
    const model = (rows: any[], marked: string[] = [], opts = DEFAULT_REVIEW_OPTIONS) => {
        const items = rows.map((r) => ({ row: r, c: classify(r) }));
        buildReviewModel(items, (chat) => marked.includes(chat), opts);
        return { items, c: (i: number) => items[i].c };
    };
    beforeEach(() => { n = 0; });

    it.each(['fraud_ask', 'fake_blocked', 'cross_client', 'model_blocked', 'not_ours', 'not_receipt', 'old_time', 'over_limit', 'repeat', 'other'])(
        'uncredited %s has nothing at risk', (outcome) => {
            const { c } = model([row({ chatId: '9', verdict: { outcome, reasons: ['PERSONA_PAYEE'], fakeScore: 90 } })]);
            expect(c(0).atRiskAmount).toBe(0);
        });

    it('legacy uncredited rows (other / fraud ask / old_time) have nothing at risk', () => {
        const { items } = model([row(), row({ ask: { kind: 'fraud', state: 'open' } }), row({ ask: { kind: 'old_time' } })]);
        expect(items.map((x) => x.c.atRiskAmount)).toEqual([0, 0, 0]);
    });

    it('a plain credited proof with no signal and ₹200 or less is not strong', () => {
        const { c } = model([credited(200)]);
        expect(c(0)).toMatchObject({ strong: false, atRiskAmount: 200 });
        expect(c(0).riskReasons).not.toContain('Over ₹200');
    });

    describe('over ₹200 is labelled (owner 2026-11-03), not a strong signal', () => {
        it('₹201 with no signal is labelled "Over ₹200", strong stays false', () => {
            const { c } = model([credited(201)]);
            expect(c(0)).toMatchObject({ strong: false, repeat: false });
            expect(c(0).riskReasons).toContain('Over ₹200');
        });
        it('a repeat ₹500 (same image re-sent in the chat) is not labelled by amount', () => {
            const sha = 'f'.repeat(64);
            const { c } = model([row({ imageSha256: sha, amount: 500 }), credited(500, { imageSha256: sha })]);
            expect(c(1)).toMatchObject({ credited: true, repeat: true, strong: false });
            expect(c(1).riskReasons).not.toContain('Over ₹200');
        });
    });

    it('a non-fake reason (BLOCKED_IGNORED, OVER_1000) on a credited proof is not a signal', () => {
        expect(model([credited(50, { reasons: ['BLOCKED_IGNORED'] })]).c(0).strong).toBe(false);
    });

    it.each([
        ['fake reason code', { reasons: ['PERSONA_PAYEE'] }, 'Fake sign: PERSONA_PAYEE'],
        ['LLM_FAKE_* code', { reasons: ['LLM_FAKE_SUSPECTED'] }, 'Fake sign: LLM_FAKE_SUSPECTED'],
        ['fakeScore >= 40', { proofId: 'x-1-1', verdict: { outcome: 'credited', reasons: [], fakeScore: 40 } }, 'Fake score 40'],
        ['fakeSignals', { proofId: 'x-1-1', verdict: { outcome: 'credited', reasons: [], fakeScore: 10, fakeSignals: ['FONT_MISMATCH'] } }, 'Image model: FONT_MISMATCH'],
    ])('credited + %s = strong at any amount', (_n, over, label) => {
        const { c } = model([credited(20, over)]);
        expect(c(0)).toMatchObject({ strong: true });
        expect(c(0).riskReasons).toContain(label);
        expect(c(0).risk).toBeGreaterThanOrEqual(60);
    });

    it('fakeScore 39 alone is not strong', () => {
        expect(model([credited(20, { proofId: 'x-1-1', verdict: { outcome: 'credited', reasons: [], fakeScore: 39 } })]).c(0).strong).toBe(false);
    });

    it('a chat that sent a fake receipt makes its credited proofs strong; the fake itself stays out (flagged only)', () => {
        const { c } = model([credited(50, { chatId: '7' }), row({ chatId: '7', ask: { kind: 'fraud', blockedAt: new Date() } }), credited(50, { chatId: '8' })]);
        expect(c(0)).toMatchObject({ strong: true });
        expect(c(0).riskReasons).toContain('Chat sent a fake receipt');
        expect(c(1)).toMatchObject({ flagged: true });
        expect(c(2).strong).toBe(false);
    });

    it('same image used by another chat is strong', () => {
        const { c } = model([row({ chatId: '1', imageSha256: 'a'.repeat(64) }), credited(50, { chatId: '2', imageSha256: 'a'.repeat(64) })]);
        expect(c(1)).toMatchObject({ strong: true, repeat: false });
        expect(c(1).riskReasons).toContain('Same image used by another chat');
    });

    describe('reused UTR (owner 2026-11-04): the earliest receipt is the original, later edited copies are suspect', () => {
        const U = 'T5551234567';
        it('the original is not strong because of its later edited copy; the copy\'s fake does not taint it', () => {
            const { c } = model([
                credited(50, { chatId: '7', utr: U }),
                row({ chatId: '7', utr: U.toLowerCase(), amount: 150, ask: { kind: 'fraud', blockedAt: new Date() }, reasons: ['UTR_REUSED_OTHER_AMOUNT'] }),
            ]);
            expect(c(0)).toMatchObject({ strong: false, reusedFrom: null });
            expect(c(0).riskReasons).not.toContain('Chat sent a fake receipt');
            expect(c(1)).toMatchObject({ flagged: true });
            expect(c(1).reusedFrom).toMatchObject({ proofId: c(0).proofId, amount: 50 });
        });
        it('a later credited copy with another amount is strong: "Reused UTR of an earlier receipt"', () => {
            const { c } = model([credited(50, { chatId: '7', utr: U }), credited(350, { chatId: '7', utr: ` ${U.slice(0, 5)} ${U.slice(5)} ` })]);
            expect(c(0)).toMatchObject({ strong: false });
            expect(c(1)).toMatchObject({ strong: true });
            expect(c(1).riskReasons).toContain('Reused UTR of an earlier receipt (₹50 before)');
        });
        it('a copy in another chat (same amount) is strong; the earlier chat\'s original is not', () => {
            const { c } = model([credited(100, { chatId: '1', utr: U }), credited(100, { chatId: '2', utr: U })]);
            expect(c(0)).toMatchObject({ strong: false });
            expect(c(1)).toMatchObject({ strong: true });
            expect(c(1).riskReasons).toContain('Reused UTR of an earlier receipt');
        });
        it('edited copies of the chat\'s other originals do not taint an original either', () => {
            const V = 'V7770001112';
            const { c } = model([
                credited(50, { chatId: '7', utr: U }), credited(50, { chatId: '7', utr: V }),
                row({ chatId: '7', utr: V, amount: 350, reasons: ['UTR_REUSED_OTHER_AMOUNT'] }),
            ]);
            expect([c(0).riskReasons, c(1).riskReasons].flat()).not.toContain('Chat sent a fake receipt');
            expect([c(0).strong, c(1).strong]).toEqual([false, false]);
        });
        it('a copy of ANOTHER chat\'s receipt still taints the copying chat\'s originals', () => {
            const V = 'V7770001112';
            const { c } = model([
                credited(50, { chatId: '1', utr: V }), credited(50, { chatId: '7', utr: U }),
                row({ chatId: '7', utr: V, amount: 350, reasons: ['UTR_REUSED_OTHER_AMOUNT'] }),
            ]);
            expect(c(0).strong).toBe(false);
            expect(c(1)).toMatchObject({ strong: true });
            expect(c(1).riskReasons).toContain('Chat sent a fake receipt');
        });
        it('a fake from another UTR in the chat still makes the original strong', () => {
            const { c } = model([credited(50, { chatId: '7', utr: U }), row({ chatId: '7', utr: 'X999888777', reasons: ['PERSONA_PAYEE'] })]);
            expect(c(0)).toMatchObject({ strong: true });
            expect(c(0).riskReasons).toContain('Chat sent a fake receipt');
        });
        it('a same-chat same-amount re-send is a repeat, not a reuse; credited twice = credited before', () => {
            const { c } = model([row({ chatId: '7', utr: U, amount: 500 }), credited(500, { chatId: '7', utr: U }), credited(500, { chatId: '7', utr: U })]);
            expect(c(1)).toMatchObject({ repeat: true, strong: false, reusedFrom: null });
            expect(c(2)).toMatchObject({ strong: true });
            expect(c(2).riskReasons).toContain('Same receipt credited before');
            expect(c(2).riskReasons.some((r) => r.startsWith('Reused UTR'))).toBe(false);
        });
        it('empty or short UTRs are ignored', () => {
            const { c } = model([credited(50, { chatId: '1', utr: '' }), credited(50, { chatId: '2', utr: '' }), credited(50, { chatId: '3', utr: ' 12 34 ' }), credited(50, { chatId: '4', utr: '1234' })]);
            expect([0, 1, 2, 3].map((i) => c(i).strong)).toEqual([false, false, false, false]);
            expect([0, 1, 2, 3].map((i) => c(i).reusedFrom)).toEqual([null, null, null, null]);
        });
        it('same image in another chat: the first chat\'s proof is the original, only the later chat is strong', () => {
            const sha = '9'.repeat(64);
            const { c } = model([credited(50, { chatId: '1', imageSha256: sha }), credited(50, { chatId: '2', imageSha256: sha })]);
            expect(c(0)).toMatchObject({ strong: false });
            expect(c(1)).toMatchObject({ strong: true });
            expect(c(1).riskReasons).toContain('Same image used by another chat');
        });
    });

    describe('legacy repeat detection (no verdict)', () => {
        it('same sha256 as an earlier row of the chat = repeat', () => {
            const { c } = model([credited(350, { imageSha256: 'b'.repeat(64) }), row({ imageSha256: 'b'.repeat(64), amount: 350 })]);
            expect(c(0).repeat).toBe(false);
            expect(c(1)).toMatchObject({ outcome: 'other', legacy: true, repeat: true });
        });
        it('same amount + payee + printed minute = repeat; a different printed minute is a new payment', () => {
            const printed = { state: 'known', epochMs: T0 - 5 * 60_000 };
            const { c } = model([
                credited(150, { payeeUpiId: 'Our@UPI', time: printed }),
                row({ amount: 150, payeeUpiId: 'our@upi', time: { state: 'known', epochMs: printed.epochMs + 20_000 } }),
                row({ amount: 150, payeeUpiId: 'our@upi', time: { state: 'known', epochMs: printed.epochMs + 3 * 60_000 } }),
            ]);
            expect([c(1).repeat, c(2).repeat]).toEqual([true, false]);
            expect([c(1).strong, c(2).strong]).toEqual([false, false]);
        });
        it('a repeat in another chat is not a same-chat repeat', () => {
            const { c } = model([row({ chatId: '1', imageSha256: 'c'.repeat(64) }), row({ chatId: '2', imageSha256: 'c'.repeat(64) })]);
            expect(c(1).repeat).toBe(false);
        });
        it('the same receipt credited twice in the chat is strong (counted twice as revenue)', () => {
            const { c } = model([credited(100, { imageSha256: 'd'.repeat(64) }), credited(100, { imageSha256: 'd'.repeat(64) })]);
            expect(c(0).strong).toBe(false);
            expect(c(1)).toMatchObject({ repeat: true, strong: true });
            expect(c(1).riskReasons).toContain('Same receipt credited before');
        });
        it('a credit after an uncredited try of the same image is the first credit, not strong', () => {
            const { c } = model([row({ imageSha256: 'e'.repeat(64), amount: 50 }), credited(50, { imageSha256: 'e'.repeat(64) })]);
            expect(c(1)).toMatchObject({ repeat: true, strong: false });
        });
    });

    it('a reviewed proof keeps its strong signal', () => {
        const fake = { reasons: ['FAKE_TEXT'] };
        const { c } = model([credited(50, { ...fake, review: { decision: 'fine', at: new Date() } })]);
        expect(c(0).strong).toBe(true);
    });

    it('amount above the client percentiles adds risk', () => {
        // 40 credits of ₹50 for one client + three big ones: p95 of the client = 50, so the big ones score "Top 5%".
        const rows = [
            ...Array.from({ length: 40 }, (_, i) => credited(50, { chatId: `c${i}` })),
            credited(600, { chatId: 'b1' }), credited(500, { chatId: 'b2' }), credited(350, { chatId: 'b3' }),
            credited(20, { chatId: 's1', reasons: ['UPI_NOT_OURS'] }),
        ];
        const opts = { dailyTarget: 3, riskFloor: 25, minAmount: 100, alwaysAmount: 1000 };
        const { items } = model(rows, [], opts);
        // b1/b2 (> p95 ₹350, risk 40) above b3 (= p95, > p90: risk 30)
        expect(items.find((x) => x.row.chatId === 'b1')!.c.risk).toBe(40);
        expect(items.find((x) => x.row.chatId === 'b3')!.c.risk).toBe(30);
        expect(items.find((x) => x.row.chatId === 'b1')!.c.riskReasons[0]).toBe('Top 5% amount for keerthi2 (> ₹350)');
        expect(items.find((x) => x.row.chatId === 'b3')!.c.riskReasons[0]).toBe('Top 10% amount for keerthi2 (> ₹50)');
    });

    it('a top-5% amount under ₹100 still scores its risk', () => {
        const rows = [
            ...Array.from({ length: 40 }, (_, i) => credited(20, { chatId: `c${i}` })),
            credited(90, { chatId: 'small' }), // top 5% but under ₹100
        ];
        const { items } = model(rows);
        expect(items.find((x) => x.row.chatId === 'small')!.c).toMatchObject({ risk: 40, strong: false });
    });

    it('burst and multi-persona credits in 24 h add risk', () => {
        const { c } = model([credited(50, { profile: 'a' }), credited(50, { profile: 'b' }), credited(50, { profile: 'a' })]);
        expect(c(2).riskReasons).toEqual(expect.arrayContaining(['3rd credit in 24 h', 'Paid on 2 personas in 24 h']));
    });

    it('old receipt and unread payment time add risk', () => {
        const { c } = model([credited(50, { time: { state: 'known', epochMs: T0 - 60 * 60_000 } }), credited(50, { chatId: '5', time: { state: 'unknown' } })]);
        expect(c(0).riskReasons.some((r) => /^Receipt \d+ min old$/.test(r))).toBe(true);
        expect(c(1).riskReasons).toContain('Payment time not read');
    });

    it('payer name of a marked-fake chat is strong on another chat', () => {
        const { c } = model([row({ chatId: 'm', ocr: { payerName: 'Ravi K' } }), credited(50, { chatId: 'n', ocr: { payerName: 'ravi  k' } })], ['m']);
        expect(c(1)).toMatchObject({ strong: true });
    });

    it('options come from env with defaults', () => {
        expect(reviewOptionsFromEnv({})).toEqual(DEFAULT_REVIEW_OPTIONS);
        expect(reviewOptionsFromEnv({ REVIEW_DAILY_TARGET: '35', REVIEW_RISK_FLOOR: 'x', REVIEW_MIN_AMOUNT: '200', REVIEW_ALWAYS_AMOUNT: '300' })).toEqual({ dailyTarget: 35, riskFloor: 25, minAmount: 200, alwaysAmount: 300 });
    });
});

describe('states', () => {
    it.each(['fraud_ask', 'fake_blocked', 'cross_client'])('%s is flagged', (o) => {
        expect(inState(classify(base({ verdict: { outcome: o } })), false, 'flagged')).toBe(true);
    });
    it.each(['credited', 'not_ours', 'repeat', 'other'])('%s is not flagged', (o) => {
        expect(inState(classify(base({ verdict: { outcome: o } })), false, 'flagged')).toBe(false);
    });
    it('not_credited / credited are complementary; marked follows the chat flag; all is everything', () => {
        const c = classify(base({ verdict: { outcome: 'repeat' } }));
        expect([inState(c, false, 'not_credited'), inState(c, false, 'credited')]).toEqual([true, false]);
        expect([inState(c, false, 'marked'), inState(c, true, 'marked')]).toEqual([false, true]);
        expect(inState(c, false, 'all')).toBe(true);
    });
});

describe('proofId', () => {
    it('stored proofId wins', () => {
        expect(proofIdOf(base({ proofId: 'x' }))).toBe('x');
    });
    it('parses positive and negative chat ids', () => {
        expect(parseProofId('keerthi2-5598996725-94585')).toEqual({ clientId: 'keerthi2', chatId: '5598996725', telegramMsgId: 94585 });
        expect(parseProofId('ramya1--1001234567-7')).toEqual({ clientId: 'ramya1', chatId: '-1001234567', telegramMsgId: 7 });
    });
    it.each(['', 'abc', 'a-b-c', 'a-1-', '-1-2', 'a b-1-2', 'x'.repeat(121)])('rejects %j', (s) => {
        expect(parseProofId(s)).toBeNull();
    });
});

describe('cursor', () => {
    it('round-trips and orders by (createdAt desc, _id desc)', () => {
        const c = { t: 1000, id: '6ae96d2f023e6f34c07f2ffa' };
        expect(decodeCursor(encodeCursor(c))).toEqual(c);
        expect(isAfterCursor(999, 'ffffffffffffffffffffffff', c)).toBe(true);
        expect(isAfterCursor(1000, '6ae96d2f023e6f34c07f2ff9', c)).toBe(true);
        expect(isAfterCursor(1000, c.id, c)).toBe(false);
        expect(isAfterCursor(1001, '000000000000000000000000', c)).toBe(false);
    });
    it('a cursor of the removed risk order (any sort tag) is refused', () => {
        const c = { t: 1400, id: '6ae96d2f023e6f34c07f2ffa' };
        expect(decodeCursor(Buffer.from(JSON.stringify({ ...c, s: 'r' })).toString('base64url'))).toBeNull();
        expect(decodeCursor(Buffer.from(JSON.stringify({ ...c, s: 'x' })).toString('base64url'))).toBeNull();
    });
    it.each(['', 'not-base64!', Buffer.from('{"t":"x","id":"y"}').toString('base64url'), Buffer.from('[1]').toString('base64url')])('rejects %j', (s) => {
        expect(decodeCursor(s)).toBeNull();
    });
});
