import { PaymentProofRow, ProofOutcome } from './schemas/payment-proof.schema';

/**
 * Pure classification of `paymentProofs` rows for the payments review screen (contract: owner-approved scope
 * 2026-11-03, "Payments review" section 2). No I/O here so the rules are unit tested directly.
 *
 * Row shapes:
 *  - new rows (tg-aut with the review contract): `proofId` + `verdict { outcome, reasons, fakeScore, ... }`.
 *  - old rows (before it): no proofId / verdict. The outcome is derived from what tg-aut did record:
 *    servedAt = credited; ask.kind 'fraud' with blockedAt = fake_blocked, without = fraud_ask; ask.kind 'old_time' =
 *    old_time; decision REJECT_DUPLICATE = repeat, BLOCK = fake_blocked, ASK_PROOF = fraud_ask; else 'other'.
 *    (Prod 2026-11-03: 1,756 rows, all old shape, all decision ACCEPT, no reasons.)
 */
export const PROOF_STATES = ['review', 'flagged', 'not_credited', 'credited', 'marked', 'reviewed', 'all'] as const;
export type ProofState = (typeof PROOF_STATES)[number];
export type ProofCounts = Record<ProofState, number>;

/** fakeScore at or above this puts a proof in the review queue. */
export const REVIEW_FAKE_SCORE = 40;
/** Every credited proof of at least this amount (₹) goes to the review queue. */
export const REVIEW_CREDITED_AMOUNT = 300;
export const FLAGGED_OUTCOMES: ReadonlySet<string> = new Set(['fraud_ask', 'fake_blocked', 'cross_client']);

export interface ClassifiedProof {
    proofId: string;
    outcome: ProofOutcome | string;
    /** true when the outcome was derived from an old row (no verdict). */
    legacy: boolean;
    reasons: string[];
    fakeScore: number | null;
    /** creditAmount (the amount actually credited) else the amount read. */
    amount: number | null;
    reviewed: boolean;
    review: boolean;
    flagged: boolean;
    credited: boolean;
}

export function proofIdOf(row: Pick<PaymentProofRow, 'proofId' | 'clientId' | 'chatId' | 'telegramMsgId'>): string {
    if (typeof row.proofId === 'string' && row.proofId) return row.proofId;
    return `${row.clientId}-${row.chatId}-${row.telegramMsgId}`;
}

/** `<clientId>-<chatId>-<telegramMsgId>`; chatId may be negative (lazy clientId match keeps the sign on chatId). */
export function parseProofId(proofId: unknown): { clientId: string; chatId: string; telegramMsgId: number } | null {
    if (typeof proofId !== 'string' || proofId.length > 120) return null;
    const m = /^([A-Za-z0-9_.]+?)-(-?\d{1,20})-(\d{1,12})$/.exec(proofId.trim());
    if (!m) return null;
    return { clientId: m[1], chatId: m[2], telegramMsgId: Number(m[3]) };
}

export function deriveLegacyOutcome(row: PaymentProofRow): ProofOutcome {
    if (row.servedAt) return 'credited';
    const ask = row.ask;
    if (ask?.kind === 'fraud') return ask.blockedAt ? 'fake_blocked' : 'fraud_ask';
    if (ask?.kind === 'old_time') return 'old_time';
    switch (row.decision) {
        case 'REJECT_DUPLICATE': return 'repeat';
        case 'BLOCK': return 'fake_blocked';
        case 'ASK_PROOF': return 'fraud_ask';
        default: return 'other';
    }
}

function strings(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function classify(row: PaymentProofRow): ClassifiedProof {
    const verdict = row.verdict && typeof row.verdict === 'object' ? row.verdict : null;
    const legacy = !verdict || typeof verdict.outcome !== 'string' || !verdict.outcome;
    const outcome = legacy ? deriveLegacyOutcome(row) : (verdict!.outcome as string);
    const reasons = legacy
        ? [...new Set([...strings(row.reasons), ...strings(row.ask?.reasons)])]
        : strings(verdict!.reasons);
    const fakeScore = legacy ? null : num(verdict!.fakeScore);
    const amount = num(row.creditAmount) ?? num(row.amount);
    const credited = outcome === 'credited';
    const reviewed = row.review?.state === 'ok';
    const needsLook = !credited || (fakeScore !== null && fakeScore >= REVIEW_FAKE_SCORE) || reasons.length > 0;
    const bigCredit = credited && amount !== null && amount >= REVIEW_CREDITED_AMOUNT;
    return {
        proofId: proofIdOf(row),
        outcome,
        legacy,
        reasons,
        fakeScore,
        amount,
        reviewed,
        review: !reviewed && (needsLook || bigCredit),
        flagged: FLAGGED_OUTCOMES.has(outcome),
        credited,
    };
}

export function inState(c: ClassifiedProof, marked: boolean, state: ProofState): boolean {
    switch (state) {
        case 'review': return c.review;
        case 'flagged': return c.flagged;
        case 'not_credited': return !c.credited;
        case 'credited': return c.credited;
        case 'marked': return marked;
        case 'reviewed': return c.reviewed;
        case 'all': return true;
    }
}

export function emptyCounts(): ProofCounts {
    return { review: 0, flagged: 0, not_credited: 0, credited: 0, marked: 0, reviewed: 0, all: 0 };
}

export function addToCounts(counts: ProofCounts, c: ClassifiedProof, marked: boolean): void {
    for (const s of PROOF_STATES) if (inState(c, marked, s)) counts[s]++;
}

/** Opaque keyset cursor over (createdAt desc, _id desc). */
export interface ProofCursor { t: number; id: string }

export function encodeCursor(c: ProofCursor): string {
    return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: unknown): ProofCursor | null {
    if (typeof raw !== 'string' || !raw || raw.length > 200) return null;
    try {
        const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        if (v && typeof v.t === 'number' && Number.isFinite(v.t) && typeof v.id === 'string' && /^[0-9a-f]{24}$/i.test(v.id)) {
            return { t: v.t, id: v.id.toLowerCase() };
        }
    } catch { /* invalid cursor */ }
    return null;
}

/** Row sorts strictly after the cursor in (createdAt desc, _id desc) order. */
export function isAfterCursor(t: number, id: string, cursor: ProofCursor): boolean {
    return t < cursor.t || (t === cursor.t && id < cursor.id);
}
