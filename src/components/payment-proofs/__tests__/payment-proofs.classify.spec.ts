/** Pure rules of the payments review screen (contract section 2): outcome derivation, states, proofId, cursor. */
import {
    classify, decodeCursor, deriveLegacyOutcome, encodeCursor, inState, isAfterCursor, parseProofId, proofIdOf,
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

describe('review queue rule', () => {
    const credited = (amount: number, verdict: Record<string, unknown> = {}) =>
        base({ creditAmount: amount, servedAt: new Date(), verdict: { outcome: 'credited', reasons: [], fakeScore: null, ...verdict } });

    it('every not-credited proof is in review until reviewed', () => {
        expect(classify(base()).review).toBe(true);
        expect(classify(base({ review: { state: 'ok', by: 'ops', at: new Date() } })).review).toBe(false);
    });
    it('a clean credited proof under ₹300 is not in review', () => {
        expect(classify(credited(299)).review).toBe(false);
    });
    it('credited ≥ ₹300 is in review', () => {
        expect(classify(credited(300)).review).toBe(true);
    });
    it('credited with fakeScore ≥ 40 or any reason is in review', () => {
        expect(classify(credited(20, { fakeScore: 39 })).review).toBe(false);
        expect(classify(credited(20, { fakeScore: 40 })).review).toBe(true);
        expect(classify(credited(20, { reasons: ['FUTURE_TIME'] })).review).toBe(true);
    });
    it('reviewed removes it from review but keeps it in reviewed/credited', () => {
        const c = classify({ ...credited(600), review: { state: 'ok', by: 'ops', at: new Date() } });
        expect(c.review).toBe(false);
        expect(inState(c, false, 'reviewed')).toBe(true);
        expect(inState(c, false, 'credited')).toBe(true);
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
    it.each(['', 'not-base64!', Buffer.from('{"t":"x","id":"y"}').toString('base64url'), Buffer.from('[1]').toString('base64url')])('rejects %j', (s) => {
        expect(decodeCursor(s)).toBeNull();
    });
});
