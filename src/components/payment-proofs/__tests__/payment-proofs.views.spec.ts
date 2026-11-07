/**
 * Payments review views (tg-chats redesign phase 1, owner approved 2026-11-07): "Check these" (one entry per chat),
 * "Fake & muted" (one entry per muted / marked chat) and "Refused but looks genuine" (one entry per proof).
 * Pure rules over rows already run through classify + buildReviewModel; fixtures are small realistic chats.
 */
import { DEFAULT_REVIEW_OPTIONS, buildReviewModel, classify, stampOf } from '../payment-proofs.classify';
import { ChatUser, buildViews, isHiddenEntry, isRealFakeReason } from '../payment-proofs.views';

const T0 = Date.parse('2026-11-06T06:00:00Z'); // 11:30 IST
let n = 0;
const oid = () => (++n).toString(16).padStart(24, '0');
const row = (over: Record<string, unknown> = {}): any => {
    const id = oid();
    const t = T0 + n * 60_000;
    return {
        _id: id, chatId: '5550001', profile: 'ramya', clientId: 'ramya1', telegramMsgId: n, createdAt: new Date(t),
        time: { state: 'known', epochMs: t - 2 * 60_000 }, imageSha256: `sha-${id}`, utr: `UTR${id.slice(-8)}`,
        proofId: `ramya1-${(over.chatId as string) ?? '5550001'}-${n}`, ...over,
    };
};
const credited = (amount: number, over: Record<string, unknown> = {}) =>
    row({ servedAt: new Date(), creditAmount: amount, amount, verdict: { outcome: 'credited', reasons: [], payee: 'ours', fakeScore: 0, fakeSignals: [] }, ...over });
const refused = (outcome: string, reasons: string[], over: Record<string, unknown> = {}) =>
    row({ amount: 100, verdict: { outcome, reasons, payee: 'ours', fakeScore: 0, fakeSignals: [] }, ...over });
const user = (chatId: string, profile: string, over: Partial<ChatUser> = {}): ChatUser =>
    ({ chatId, profile, clientId: `${profile}1`, username: `u${chatId.slice(-4)}`, canReply: 1, payAmount: 0, ...over });

function views(rows: any[], users: ChatUser[] = []) {
    const items = rows.map((r) => ({ row: r, c: classify(r) }));
    const byChat = new Map<string, ChatUser[]>();
    for (const u of users) byChat.set(u.chatId, [...(byChat.get(u.chatId) ?? []), u]);
    const marked = (chat: string) => (byChat.get(chat) ?? []).some((u) => !!u.fakePaymentAt);
    buildReviewModel(items, marked, DEFAULT_REVIEW_OPTIONS);
    return buildViews(items, byChat, DEFAULT_REVIEW_OPTIONS);
}

beforeEach(() => { n = 0; });

describe('isRealFakeReason: only real tamper codes', () => {
    it.each(['PERSONA_PAYEE', 'UPI_NOT_OURS', 'LAXMI_PAYEE', 'FAKE_TEXT', 'EDITED_PICTURE', 'AI_WATERMARK', 'LLM_FAKE_FUTURE_DATE',
        'FUTURE_TIME', 'FUTURE_DATE', 'DATE_IN_FUTURE', 'DISCLAIMER_SHORT', 'DISCLAIMER_LONG', 'BLOCKLIST_A', 'UTR_REUSED',
        'UTR_REUSED_OTHER_AMOUNT'])('%s is real', (code) => expect(isRealFakeReason(code)).toBe(true));
    it.each(['CREDITED_ELSEWHERE', 'SAME_FILE', 'SAME_UTR', 'FAILED_PAYMENT_TO_SCREEN', 'NO_REAL_REFERENCE', 'IMPOSSIBLE_REFERENCE',
        'SECOND_FAKE', 'FAKE_WARNING_OPEN', 'OLD_PAYMENT', 'REPEAT_FILE', 'NOT_PAID_TO_US'])('%s is not', (code) => expect(isRealFakeReason(code)).toBe(false));
});

describe('view check ("Check these"): one entry per chat', () => {
    it('groups persona rows of one chat into one entry with the whole credit history, oldest first, repeats hidden', () => {
        const sha = 'same-shot';
        const v = views([
            credited(300, { profile: 'ramya' }),
            credited(300, { profile: 'kavya', clientId: 'kavya1' }),
            row({ profile: 'kavya', clientId: 'kavya1', imageSha256: sha, amount: 300, verdict: { outcome: 'repeat', reasons: ['REPEAT_FILE'] } }),
            row({ profile: 'kavya', clientId: 'kavya1', imageSha256: sha, amount: 300, verdict: { outcome: 'repeat', reasons: ['REPEAT_FILE'] } }),
        ], [user('5550001', 'ramya'), user('5550001', 'kavya')]);
        expect(v.check).toHaveLength(1);
        const e = v.check[0];
        expect(e).toMatchObject({ chatId: '5550001', username: 'u0001', clients: ['kavya1', 'ramya1'], personas: ['kavya', 'ramya'], totalCredited: 600 });
        expect(e.history.map((h) => [h.amount, h.profile, h.outcome])).toEqual([[300, 'ramya', 'credited'], [300, 'kavya', 'credited']]);
        expect(e.highValue).toBe(true);
        expect(e.fakeSignal).toBe(false);
        expect(e.reasons.every((r) => r.kind === 'high')).toBe(true);
        expect(e.pendingProofIds).toHaveLength(2);
    });

    it('own real fake code, fake score >= 40 and image-model signals are fake signals (any amount)', () => {
        const v = views([
            credited(50, { chatId: '1', verdict: { outcome: 'credited', reasons: ['FAKE_TEXT'], payee: 'ours', fakeScore: 0, fakeSignals: [] } }),
            credited(50, { chatId: '2', verdict: { outcome: 'credited', reasons: [], payee: 'ours', fakeScore: 45, fakeSignals: [] } }),
            credited(50, { chatId: '3', verdict: { outcome: 'credited', reasons: [], payee: 'ours', fakeScore: 0, fakeSignals: ['font mismatch'] } }),
        ]);
        expect(v.check.map((e) => [e.chatId, e.fakeSignal])).toEqual([['1', true], ['2', true], ['3', true]].sort());
        const labels = v.check.flatMap((e) => e.reasons.map((r) => `${r.kind}:${r.label}`));
        expect(labels).toEqual(expect.arrayContaining(['fake:Fake sign: FAKE_TEXT', 'fake:Fake score 45', 'fake:Image model: font mismatch']));
    });

    it('a sibling with a real tamper code is a fake signal; weak siblings (own resend, failed payment, no real reference, impossible reference) are not', () => {
        const v = views([
            credited(80, { chatId: 'A' }),
            refused('fraud_ask', ['PERSONA_PAYEE'], { chatId: 'A' }),
            credited(80, { chatId: 'B' }),
            refused('cross_client', ['CREDITED_ELSEWHERE', 'SAME_FILE'], { chatId: 'B' }),
            refused('fake_blocked', ['FAILED_PAYMENT_TO_SCREEN', 'SECOND_FAKE'], { chatId: 'B' }),
            refused('fraud_ask', ['NO_REAL_REFERENCE', 'FAKE_WARNING_OPEN'], { chatId: 'B' }),
            refused('old_time', ['IMPOSSIBLE_REFERENCE'], { chatId: 'B' }),
        ]);
        expect(v.check.map((e) => e.chatId)).toEqual(['A']);
        expect(v.check[0].reasons).toEqual([expect.objectContaining({ kind: 'fake', label: 'Chat sent a fake receipt: PERSONA_PAYEE' })]);
    });

    it('cross_client SAME_FILE counts only when the file came from ANOTHER chat', () => {
        const sha = 'shared-file';
        const v = views([
            credited(80, { chatId: 'other', imageSha256: sha }),
            credited(80, { chatId: 'C' }),
            refused('cross_client', ['CREDITED_ELSEWHERE', 'SAME_FILE'], { chatId: 'C', imageSha256: sha }),
        ]);
        expect(v.check.map((e) => e.chatId)).toEqual(['C']);
        expect(v.check[0].reasons[0].label).toBe('Chat sent a fake receipt: same file as another chat');
    });

    it('a credited copy of another chat\'s UTR or image is a fake signal; the first chat to send it is not', () => {
        const v = views([
            credited(90, { chatId: 'orig', utr: 'UTR123456', imageSha256: 'img-1' }),
            credited(90, { chatId: 'copy', utr: 'UTR123456' }),
            credited(90, { chatId: 'img', imageSha256: 'img-1', utr: 'UTR999999' }),
        ]);
        expect(v.check.map((e) => e.chatId).sort()).toEqual(['copy', 'img']);
        const labels = v.check.flatMap((e) => e.reasons.map((r) => r.label));
        expect(labels).toEqual(expect.arrayContaining(['Reused UTR of another chat', 'Same image as another chat']));
    });

    it('the genuine original is not tainted by its own edited copy (owner 2026-11-04)', () => {
        const v = views([
            credited(100, { chatId: 'D', utr: 'UTR777777' }),
            refused('fraud_ask', ['UTR_REUSED_OTHER_AMOUNT'], { chatId: 'D', utr: 'UTR777777', amount: 1000 }),
        ]);
        expect(v.check).toEqual([]);
    });

    it('high value: non-repeat credit over ₹200 enters; ₹200 does not; a repeat over ₹200 does not', () => {
        const v = views([credited(201, { chatId: 'hi' }), credited(200, { chatId: 'lo' })]);
        expect(v.check.map((e) => e.chatId)).toEqual(['hi']);
        expect(v.check[0].reasons).toEqual([expect.objectContaining({ kind: 'high', label: 'High value: ₹201 (over ₹200)' })]);
    });

    it('a payer name shared with a marked chat alone is NOT a reason (precision 0/15)', () => {
        const v = views([
            credited(90, { chatId: 'M', ocr: { payerName: 'Ravi Kumar' } }),
            credited(90, { chatId: 'P', ocr: { payerName: 'Ravi Kumar' } }),
        ], [user('M', 'ramya', { fakePaymentAt: new Date(T0), canReply: 0 }), user('P', 'ramya')]);
        expect(v.check).toEqual([]);
    });

    it('leaves marked and muted chats to the muted view; a fully stamped chat carries its stamp; a partly stamped one none', () => {
        const v = views([
            credited(300, { chatId: 'mk' }),
            credited(300, { chatId: 'rv', review: { decision: 'fine', at: new Date(T0) } }),
            credited(300, { chatId: 'pt' }),
            credited(250, { chatId: 'pt', review: { decision: 'fine', at: new Date(T0) } }),
            credited(300, { chatId: 'mu' }),
        ], [user('mk', 'ramya', { fakePaymentAt: new Date(T0), canReply: 0 }), user('mu', 'ramya', { canReply: 0 })]);
        expect(v.check.map((e) => [e.chatId, e.stamp])).toEqual([['pt', null], ['rv', { decision: 'fine', at: new Date(T0).toISOString() }]]);
        expect(v.check[0]).toMatchObject({ reviewed: true, reviewedCount: 1, totalCredited: 550 });
        expect(v.check[0].pendingProofIds).toHaveLength(1);
        expect(v.muted.map((e) => e.chatId).sort()).toEqual(['mk', 'mu']);
    });

    it('sorts fake-signal chats first, then by unreviewed credited ₹', () => {
        const v = views([
            credited(500, { chatId: 'big' }),
            credited(250, { chatId: 'mid' }),
            credited(20, { chatId: 'fake', verdict: { outcome: 'credited', reasons: ['EDITED_PICTURE'], payee: 'ours', fakeScore: 0, fakeSignals: [] } }),
        ]);
        expect(v.check.map((e) => e.chatId)).toEqual(['fake', 'big', 'mid']);
    });
});

describe('view muted ("Fake & muted"): one entry per chat with fakePaymentAt or canReply 0', () => {
    it('operator mark: source, when, by, reason, stored proof ids as evidence, pre-mark canReply, credited ₹', () => {
        const p = credited(300, { chatId: 'OM' });
        const v = views([p], [
            user('OM', 'ramya', {
                canReply: 0, fakePaymentAt: new Date('2026-11-06T16:10:00Z'), fakePaymentBy: 'tg-chats', fakePaymentReason: 'edited',
                fakePaymentPrev: { payAmount: 300, canReply: 1 }, fakePaymentProofIds: [p.proofId],
            }),
        ]);
        expect(v.muted).toHaveLength(1);
        expect(v.muted[0]).toMatchObject({
            chatId: 'OM', source: 'operator_mark', by: 'tg-chats', reason: 'edited', at: '2026-11-06T16:10:00.000Z',
            preMarkCanReply: 1, creditedAmount: 300, ownFakeSign: false, likelyWrong: true,
        });
        expect(v.muted[0].evidence.map((e) => e.proofId)).toEqual([p.proofId]);
    });

    it('a marked chat with no proofs in the window is still listed', () => {
        const v = views([], [user('OLD', 'ramya', { canReply: 0, fakePaymentAt: new Date(T0), fakePaymentReason: 'r' })]);
        expect(v.muted.map((e) => [e.chatId, e.source, e.creditedAmount])).toEqual([['OLD', 'operator_mark', 0]]);
    });

    it('payment-check fraud block: blockedAt and ask reason codes; evidence = the blocked proofs', () => {
        const blocked = refused('fake_blocked', ['PERSONA_PAYEE'], {
            chatId: 'FB', ask: { kind: 'fraud', state: 'open', reasons: ['PERSONA_PAYEE'], openedAt: new Date(T0), blockedAt: new Date('2026-11-06T07:00:00Z') },
        });
        const v = views([blocked], [user('FB', 'ramya', { canReply: 0 })]);
        expect(v.muted[0]).toMatchObject({ source: 'fraud_block', at: '2026-11-06T07:00:00.000Z', reasonCodes: ['PERSONA_PAYEE'], ownFakeSign: true, likelyWrong: false });
        expect(v.muted[0].evidence.map((e) => e.proofId)).toEqual([blocked.proofId]);
    });

    it('a resolved / closed fraud ask is not the source; nothing recorded = unknown (scam strikes are not inferable)', () => {
        const v = views([
            credited(150, { chatId: 'UN' }),
            refused('fake_blocked', ['FAKE_TEXT'], { chatId: 'UN', ask: { kind: 'fraud', state: 'resolved', blockedAt: new Date(T0) } }),
        ], [user('UN', 'ramya', { canReply: 0, cheatCount: 0 })]);
        expect(v.muted[0]).toMatchObject({ source: 'unknown', at: null, reason: null });
    });

    it('a muted chat with no proofs in the window and no mark is not listed; an unmuted unmarked chat is not listed', () => {
        const v = views([credited(100, { chatId: 'ok' })], [user('ok', 'ramya'), user('gone', 'ramya', { canReply: 0, payAmount: 300 })]);
        expect(v.muted).toEqual([]);
    });

    it('sorts likely-wrong (paid real money, no own fake sign anywhere) first', () => {
        const v = views([
            credited(100, { chatId: 'W1' }),
            credited(400, { chatId: 'F1', verdict: { outcome: 'credited', reasons: ['UPI_NOT_OURS'], payee: 'ours', fakeScore: 0, fakeSignals: [] } }),
            credited(300, { chatId: 'W2' }),
        ], [user('W1', 'ramya', { canReply: 0 }), user('F1', 'ramya', { canReply: 0 }), user('W2', 'ramya', { canReply: 0 })]);
        expect(v.muted.map((e) => [e.chatId, e.likelyWrong])).toEqual([['W2', true], ['W1', true], ['F1', false]]);
    });

    it('carries the audit history and per-persona canReply', () => {
        const h = [{ action: 'unmark' as const, by: 'a', reason: 'mistake', at: new Date(T0), proofIds: [] }];
        const v = views([], [user('H', 'ramya', { canReply: 0, fakePaymentAt: new Date(T0), fakePaymentHistory: h }), user('H', 'kavya', { canReply: 1 })]);
        expect(v.muted[0].history).toHaveLength(1);
        expect(v.muted[0].personas).toEqual([{ profile: 'kavya', clientId: 'kavya1', canReply: 1 }, { profile: 'ramya', clientId: 'ramya1', canReply: 0 }]);
    });
});

describe('view refused ("Refused but looks genuine")', () => {
    const genuine = (over: Record<string, unknown> = {}) => refused('fraud_ask', ['NO_REAL_REFERENCE'], { chatId: 'R', ...over });

    it('lists a refused proof that passes every genuine check, with why it was refused', () => {
        const p = genuine();
        const v = views([p], [user('R', 'ramya')]);
        expect(v.refused).toHaveLength(1);
        expect(v.refused[0]).toMatchObject({ proofId: p.proofId, chatId: 'R', username: 'uR' });
        expect(v.refused[0].refusedReason).toBe('Payment check asked for proof: NO_REAL_REFERENCE');
    });

    it.each([
        ['payee not ours', { verdict: { outcome: 'not_ours', reasons: ['NOT_PAID_TO_US'], payee: 'foreign', fakeScore: 0 } }],
        ['older than 30 min at arrival', { time: { state: 'known', epochMs: T0 - 3600_000 } }],
        ['payment time not read', { time: { state: 'unknown' } }],
        ['fake score 40', { verdict: { outcome: 'fraud_ask', reasons: [], payee: 'ours', fakeScore: 40 } }],
        ['text-proven fake code', { verdict: { outcome: 'fraud_ask', reasons: ['FAKE_TEXT'], payee: 'ours', fakeScore: 0 } }],
        ['repeat', { verdict: { outcome: 'repeat', reasons: ['REPEAT_FILE'], payee: 'ours', fakeScore: 0 } }],
        // not a finished payment to us, or refused by a fixed rule (live 2026-11-07: 9 of 11 rows were these)
        ['failed payment screenshot', { verdict: { outcome: 'fake_blocked', reasons: ['FAILED_PAYMENT_TO_SCREEN'], payee: 'ours', fakeScore: 0 } }],
        ['unfinished receipt', { verdict: { outcome: 'not_receipt', reasons: ['NOT_FINISHED'], payee: 'ours', fakeScore: 0 } }],
        ['over the ₹1,000 rule', { verdict: { outcome: 'over_limit', reasons: ['OVER_1000'], payee: 'ours', fakeScore: 0 } }],
        ['credited on another client', { verdict: { outcome: 'cross_client', reasons: ['CREDITED_ELSEWHERE'], payee: 'ours', fakeScore: 0 } }],
    ])('skips: %s', (_label, over) => {
        expect(views([genuine(over)]).refused).toEqual([]);
    });

    it('skips a non-unique image and a proof credited later in the chat within 24 h', () => {
        const v1 = views([genuine({ imageSha256: 'dup' }), credited(100, { chatId: 'Z', imageSha256: 'dup' })]);
        expect(v1.refused).toEqual([]);
        const v2 = views([genuine(), credited(100, { chatId: 'R' })]);
        expect(v2.refused).toEqual([]);
    });

    it('credited proofs and marked chats never appear', () => {
        expect(views([credited(100, { chatId: 'R' })]).refused).toEqual([]);
        expect(views([genuine()], [user('R', 'ramya', { fakePaymentAt: new Date(T0), canReply: 0 })]).refused).toEqual([]);
    });
});

describe('review stamp (owner 2026-11-07)', () => {
    const at = new Date(T0 + 3_600_000);
    const genuine = (over: Record<string, unknown> = {}) => refused('fraud_ask', ['NO_REAL_REFERENCE'], { chatId: 'R', ...over });
    it('stampOf: the removed legacy { state: ok } shape is no stamp; a later block or ask on the row voids the stamp (it resurfaces)', () => {
        expect(stampOf({ review: { state: 'ok', by: 'x', at } as any })).toBeNull();
        expect(stampOf({ review: { decision: 'fine', at } })).toEqual({ decision: 'fine', at: at.toISOString() });
        expect(stampOf({ review: { decision: 'fake', at }, ask: { blockedAt: new Date(at.getTime() - 1) } })?.decision).toBe('fake');
        expect(stampOf({ review: { decision: 'fine', at }, ask: { blockedAt: new Date(at.getTime() + 15 * 60_000) } })).toBeNull();
        expect(stampOf({ review: { decision: 'fine', at }, ask: { openedAt: new Date(at.getTime() + 1) } })).toBeNull();
        expect(stampOf({ review: { at } as any })).toBeNull();
        expect(stampOf({})).toBeNull();
    });

    it('a check entry is stamped only when every card proof is, and a fraud block after the stamp brings it back', () => {
        const stamped = { review: { decision: 'fine', at } };
        const v1 = views([credited(600, { chatId: 'S', ...stamped }), credited(600, { chatId: 'S', ...stamped })]);
        expect(v1.check[0].stamp).toEqual({ decision: 'fine', at: at.toISOString() });
        expect(isHiddenEntry(v1.check[0])).toBe(true);
        const v2 = views([credited(600, { chatId: 'S', ...stamped }), credited(600, { chatId: 'S', ...stamped, ask: { kind: 'fraud', blockedAt: new Date(at.getTime() + 60_000) } })]);
        expect(v2.check[0].stamp).toBeNull();
    });

    it('one tab per chat: muted wins over check and refused, check over refused', () => {
        const v = views([
            credited(600, { chatId: 'A' }), genuine({ chatId: 'A' }), // canReply 0: muted only
            credited(600, { chatId: 'B' }), genuine({ chatId: 'B', createdAt: new Date(T0 + 40 * 3_600_000), time: { state: 'known', epochMs: T0 + 40 * 3_600_000 - 60_000 } }), // check only
            genuine({ chatId: 'C' }), // refused
        ], [user('A', 'ramya', { canReply: 0 })]);
        expect(v.muted.map((e) => e.chatId)).toEqual(['A']);
        expect(v.check.map((e) => e.chatId)).toEqual(['B']);
        expect(v.refused.map((e) => e.chatId)).toEqual(['C']);
    });

    it('a marked chat with no proof left is hidden (nothing to stamp)', () => {
        const v = views([], [user('Z', 'ramya', { fakePaymentAt: new Date(T0), canReply: 0 })]);
        expect(v.muted[0]).toMatchObject({ chatId: 'Z', stamp: null, noProofs: true });
        expect(isHiddenEntry(v.muted[0])).toBe(true);
    });
});
