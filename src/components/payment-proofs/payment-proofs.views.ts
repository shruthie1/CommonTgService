import { PaymentProofRow } from './schemas/payment-proof.schema';
import { REVIEW_FAKE_SCORE, ReviewItem, ReviewOptions, ReviewStamp, istDay } from './payment-proofs.classify';

/**
 * Payments review views (tg-chats redesign phase 1, owner approved 2026-11-07). Pure; reads only what tg-aut and the
 * operator already recorded. Input: rows already run through classify + buildReviewModel (repeat, reusedFrom,
 * baseRisk are set there) and the userData rows of the chats.
 *
 *  - check  ("Check these"): one entry per chat, not marked fake, with a credited unreviewed proof that has a real
 *           fake signal or is high value (non-repeat credit over alwaysAmount, or the IST day's top dailyTarget by
 *           baseRisk). Measured 11-03..11-07: payer name alone 0/15 precision and weak siblings (own re-sends, failed
 *           payment, no real reference, impossible reference) 0.32, so neither counts as a fake signal.
 *  - muted  ("Fake & muted"): one entry per chat with fakePaymentAt or a canReply 0 row that has proofs in the
 *           window, plus every marked chat. Source = operator mark, payment-check fraud block (open fraud ask with
 *           blockedAt) or unknown (abuse cheatCount bans and ops blocks record nothing; cheatCount is reset to 0).
 *  - refused ("Refused but looks genuine"): one entry per uncredited proof that passes every genuine check and was
 *           not credited later in the chat within 24 h.
 *
 * A chat is in one view only: muted, else check, else refused. Every entry carries `stamp`: the operator's latest
 * stamp when every proof its card shows is stamped (check: history, muted: evidence or else all its proofs, refused:
 * the proof), else null. The service hides stamped entries (and marked chats with no proof left, which cannot be
 * stamped) unless includeReviewed=1; see isHiddenEntry.
 */

/** Reason codes that prove the receipt itself was tampered with (exact codes or prefixes). */
const REAL_FAKE_CODES: ReadonlySet<string> = new Set([
    'PERSONA_PAYEE', 'LAXMI_PAYEE', 'UPI_NOT_OURS', 'FAKE_TEXT', 'EDITED_PICTURE', 'AI_WATERMARK', 'DATE_IN_FUTURE',
]);
const REAL_FAKE_PREFIXES = ['LLM_FAKE_', 'FUTURE_', 'DISCLAIMER_', 'BLOCKLIST_', 'UTR_REUSED'];

export function isRealFakeReason(code: string): boolean {
    return REAL_FAKE_CODES.has(code) || REAL_FAKE_PREFIXES.some((p) => code.startsWith(p));
}

export interface FakePaymentHistoryEntry {
    action: 'mark' | 'unmark' | 'unmute';
    by: string;
    reason: string;
    at: Date | string;
    proofIds: string[];
    /** unmute only: what muted the chat (fraud_block | unknown). */
    source?: string;
}

/** One userData row (one persona of one chat): only the fields the views read. */
export interface ChatUser {
    chatId: string;
    profile: string;
    clientId?: string;
    username?: string;
    /** Display name: userData.username when it is a first name (no Telegram handle), else null. Set by the service. */
    name?: string | null;
    canReply?: number;
    payAmount?: number;
    cheatCount?: number;
    fakePaymentAt?: Date | string | null;
    fakePaymentBy?: string;
    fakePaymentReason?: string;
    fakePaymentPrev?: { payAmount?: number; canReply?: number };
    fakePaymentProofIds?: string[];
    fakePaymentHistory?: FakePaymentHistoryEntry[];
}

/** A proof as a card: enough for the list row, the thumbnail (clientHost added by the service) and Open chat. */
export interface ProofCard {
    _id: string;
    proofId: string;
    clientId: string;
    chatId: string;
    profile: string;
    telegramMsgId: number;
    createdAt: string;
    amount: number | null;
    outcome: string;
    reasons: string[];
    fakeScore: number | null;
    credited: boolean;
    reviewed: boolean;
    legacy: boolean;
    image: PaymentProofRow['image'] | null;
    clientHost?: string | null;
}

export interface CheckReason { kind: 'fake' | 'high'; label: string; proofId: string }

export interface CheckEntry {
    chatId: string;
    username: string | null;
    name: string | null;
    clients: string[];
    personas: string[];
    reasons: CheckReason[];
    fakeSignal: boolean;
    highValue: boolean;
    /** Non-repeat proofs of the chat, oldest first (repeated equal amounts stand out). */
    history: ProofCard[];
    totalCredited: number;
    unreviewedCredited: number;
    /** Credited, not yet reviewed: what "Looks fine" marks. */
    pendingProofIds: string[];
    reviewedCount: number;
    reviewed: boolean;
    muted: boolean;
    marked: boolean;
    stamp: ReviewStamp | null;
}

export type MuteSource = 'operator_mark' | 'fraud_block' | 'unknown';

export interface MutedEntry {
    chatId: string;
    username: string | null;
    name: string | null;
    clients: string[];
    personas: { profile: string; clientId: string | null; canReply: number | null }[];
    source: MuteSource;
    at: string | null;
    by: string | null;
    reason: string | null;
    reasonCodes: string[];
    evidence: ProofCard[];
    creditedAmount: number;
    /** canReply before the operator mark (fakePaymentPrev), null when not marked or not recorded. */
    preMarkCanReply: number | null;
    /** Some proof of the chat carries its own fake sign (real code, fake score, image model, reused from another chat). */
    ownFakeSign: boolean;
    /** Paid real money and no own fake sign anywhere: probably muted by mistake. */
    likelyWrong: boolean;
    history: FakePaymentHistoryEntry[];
    stamp: ReviewStamp | null;
    /** A marked chat with no proof left in the window: nothing to stamp. */
    noProofs: boolean;
}

export interface RefusedEntry extends ProofCard {
    username: string | null;
    name: string | null;
    refusedReason: string;
    stamp: ReviewStamp | null;
}

/** Hidden unless includeReviewed=1: stamped, or a marked chat with no proof to stamp. */
export function isHiddenEntry(e: { stamp: ReviewStamp | null; noProofs?: boolean }): boolean {
    return e.stamp !== null || e.noProofs === true;
}

export interface ReviewViews { check: CheckEntry[]; muted: MutedEntry[]; refused: RefusedEntry[] }
export const REVIEW_VIEWS = ['check', 'muted', 'refused'] as const;
export type ReviewView = (typeof REVIEW_VIEWS)[number];

const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;
/** A refused receipt printed more than this before it arrived is not "looks genuine". */
const FRESH_MS = 30 * MIN_MS;
/** Printed a little after arrival is clock skew, not a future-dated fake (tg-aut excuses neighbour time zones). */
const SKEW_MS = 5 * MIN_MS;

/**
 * Refused for a reason that is not a doubt about authenticity: not a finished payment, a fixed rule (₹1,000+), or
 * already credited on another client. These are never "looks genuine".
 */
const NOT_A_MISSED_CREDIT_OUTCOMES: ReadonlySet<string> = new Set(['not_receipt', 'over_limit', 'cross_client', 'not_ours', 'repeat']);
const NOT_A_MISSED_CREDIT_CODES: ReadonlySet<string> = new Set([
    'FAILED_PAYMENT_TO_SCREEN', 'FAILED_PAYMENT', 'NOT_FINISHED', 'STATUS_UNCLEAR', 'NO_AMOUNT', 'OVER_1000', 'NOT_PAID_TO_US',
]);

const REFUSED_LABELS: Record<string, string> = {
    fraud_ask: 'Payment check asked for proof', fake_blocked: 'Blocked as fake', not_ours: 'Not paid to us',
    not_receipt: 'Not a finished receipt', over_limit: 'Over the ₹1,000 limit', old_time: 'Old payment time',
    cross_client: 'Sent on another client', model_blocked: 'Image model blocked it', other: 'Not credited',
};

const msOf = (r: PaymentProofRow) => new Date(r.createdAt).getTime();
const shaOf = (r: PaymentProofRow): string | null => {
    const s = r.imageSha256 || r.image?.sha256;
    return typeof s === 'string' && s ? s : null;
};
const iso = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    const t = new Date(v as string).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const uniqSorted = (xs: (string | undefined | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
/** The latest stamp when every proof is stamped, else null (also for none). */
const stampOfAll = (xs: ReviewItem[]): ReviewStamp | null =>
    xs.length && xs.every((x) => x.c.stamp) ? xs.map((x) => x.c.stamp!).sort((a, b) => (a.at < b.at ? 1 : -1))[0] : null;

export function proofCard({ row, c }: ReviewItem): ProofCard {
    return {
        _id: String(row._id), proofId: c.proofId, clientId: String(row.clientId), chatId: String(row.chatId),
        profile: String(row.profile), telegramMsgId: row.telegramMsgId, createdAt: new Date(row.createdAt).toISOString(),
        amount: c.amount, outcome: String(c.outcome), reasons: c.reasons, fakeScore: c.fakeScore, credited: c.credited,
        reviewed: c.reviewed, legacy: c.legacy, image: row.image ?? null,
    };
}

export function buildViews(items: ReviewItem[], users: Map<string, ChatUser[]>, options: ReviewOptions): ReviewViews {
    const asc = [...items].sort((a, b) => msOf(a.row) - msOf(b.row) || (String(a.row._id) < String(b.row._id) ? -1 : 1));
    const byChat = new Map<string, ReviewItem[]>();
    const shaFirstChat = new Map<string, string>();
    const shaCount = new Map<string, number>();
    for (const x of asc) {
        const chat = String(x.row.chatId);
        byChat.set(chat, [...(byChat.get(chat) ?? []), x]);
        const sha = shaOf(x.row);
        if (sha) {
            if (!shaFirstChat.has(sha)) shaFirstChat.set(sha, chat);
            shaCount.set(sha, (shaCount.get(sha) ?? 0) + 1);
        }
    }
    const fromOtherChat = (x: ReviewItem) => {
        const sha = shaOf(x.row);
        return !!sha && shaFirstChat.get(sha) !== String(x.row.chatId);
    };
    const marked = (chat: string) => (users.get(chat) ?? []).some((u) => !!u.fakePaymentAt);
    const muted = (chat: string) => (users.get(chat) ?? []).some((u) => u.canReply === 0);
    const usernameOf = (chat: string) => (users.get(chat) ?? []).map((u) => u.username).find((s) => !!s) ?? null;
    const nameOf = (chat: string) => (users.get(chat) ?? []).map((u) => u.name).find((s) => !!s) ?? null;
    /** In the muted view (which wins over check and refused). */
    const inMuted = (chat: string) => marked(chat) || (muted(chat) && (byChat.get(chat)?.length ?? 0) > 0);

    /** This proof's own fake signs (labels); empty = none. */
    const ownSigns = (x: ReviewItem): string[] => {
        const out: string[] = [];
        const codes = x.c.reasons.filter(isRealFakeReason);
        if (codes.length) out.push(`Fake sign: ${codes.join(', ')}`);
        if (x.c.fakeScore !== null && x.c.fakeScore >= REVIEW_FAKE_SCORE) out.push(`Fake score ${x.c.fakeScore}`);
        const signals = Array.isArray(x.row.verdict?.fakeSignals) ? x.row.verdict!.fakeSignals!.filter((s) => typeof s === 'string' && s) : [];
        if (signals.length) out.push(`Image model: ${signals.slice(0, 3).join(', ')}`);
        const from = x.c.reusedFrom;
        if (from && from.chatId !== String(x.row.chatId)) out.push('Reused UTR of another chat');
        else if (from && from.amount !== null && from.amount !== x.c.amount) out.push(`Edited copy of an earlier receipt (₹${from.amount} before)`);
        if (fromOtherChat(x)) out.push('Same image as another chat');
        return out;
    };
    /** A sibling's real tamper evidence, as the code list for the label (null = weak or none). */
    const siblingTamper = (x: ReviewItem, f: ReviewItem): string | null => {
        if (f === x) return null;
        // The edited copy of x itself says nothing about x, the genuine original (owner 2026-11-04).
        if (f.c.reusedFrom && f.c.reusedFrom.proofId === x.c.proofId) return null;
        const codes = f.c.reasons.filter(isRealFakeReason);
        if (codes.length) return codes.join(', ');
        if (f.c.outcome === 'cross_client' && f.c.reasons.includes('SAME_FILE') && fromOtherChat(f)) return 'same file as another chat';
        return null;
    };
    const fakeReasons = (x: ReviewItem): string[] => {
        const out = ownSigns(x);
        const sib = (byChat.get(String(x.row.chatId)) ?? []).map((f) => siblingTamper(x, f)).find((s) => s !== null);
        if (sib) out.push(`Chat sent a fake receipt: ${sib}`);
        return out;
    };

    // Per credited proof: fake signs, over the amount line, and the day's top-N by baseRisk among the rest.
    const fake = new Map<ReviewItem, string[]>();
    const over = new Set<ReviewItem>();
    const topN = new Set<ReviewItem>();
    const days = new Map<string, ReviewItem[]>();
    for (const x of asc) {
        if (!x.c.credited) continue;
        const f = fakeReasons(x);
        if (f.length) fake.set(x, f);
        if (!x.c.repeat && x.c.amount !== null && x.c.amount > options.alwaysAmount) over.add(x);
        const d = istDay(msOf(x.row));
        days.set(d, [...(days.get(d) ?? []), x]);
    }
    for (const list of days.values()) {
        const slots = Math.max(0, options.dailyTarget - list.filter((x) => fake.has(x)).length);
        list.filter((x) => !fake.has(x) && !over.has(x) && (x.c.amount ?? 0) >= options.minAmount && x.c.baseRisk >= options.riskFloor)
            .sort((a, b) => b.c.baseRisk - a.c.baseRisk || (b.c.amount ?? 0) - (a.c.amount ?? 0) || (String(b.row._id) < String(a.row._id) ? -1 : 1))
            .slice(0, slots)
            .forEach((x) => topN.add(x));
    }

    const check: CheckEntry[] = [];
    for (const [chat, list] of byChat) {
        if (inMuted(chat)) continue;
        const creditedRows = list.filter((x) => x.c.credited);
        const pending = creditedRows.filter((x) => !x.c.reviewed);
        const reasons: CheckReason[] = [];
        // Every credited proof, stamped or not: a stamped chat is still an entry (hidden by default), and a new
        // unstamped screenshot in it brings it back.
        for (const x of creditedRows) {
            for (const label of fake.get(x) ?? []) reasons.push({ kind: 'fake', label, proofId: x.c.proofId });
            if (over.has(x)) reasons.push({ kind: 'high', label: `High value: ₹${x.c.amount} (over ₹${options.alwaysAmount})`, proofId: x.c.proofId });
            else if (topN.has(x)) reasons.push({ kind: 'high', label: `Top risk today: ${x.c.baseReasons.join('; ')}`, proofId: x.c.proofId });
        }
        if (!reasons.length) continue;
        const sum = (xs: ReviewItem[]) => xs.reduce((s, x) => s + x.c.atRiskAmount, 0);
        const reviewedCount = creditedRows.filter((x) => x.c.reviewed).length;
        const history = list.filter((x) => x.c.credited || !x.c.repeat);
        check.push({
            chatId: chat,
            username: usernameOf(chat),
            name: nameOf(chat),
            clients: uniqSorted(list.map((x) => String(x.row.clientId))),
            personas: uniqSorted(list.map((x) => String(x.row.profile))),
            reasons,
            fakeSignal: reasons.some((r) => r.kind === 'fake'),
            highValue: reasons.some((r) => r.kind === 'high'),
            history: history.map(proofCard),
            totalCredited: sum(creditedRows),
            unreviewedCredited: sum(pending),
            pendingProofIds: pending.map((x) => x.c.proofId),
            reviewedCount,
            reviewed: reviewedCount > 0,
            muted: muted(chat),
            marked: false,
            stamp: stampOfAll(history),
        });
    }
    check.sort((a, b) => Number(b.fakeSignal) - Number(a.fakeSignal) || b.unreviewedCredited - a.unreviewedCredited || (a.chatId < b.chatId ? -1 : 1));

    const mutedEntries: MutedEntry[] = [];
    for (const [chat, rows] of users) {
        const list = byChat.get(chat) ?? [];
        const isMarked = marked(chat);
        if (!isMarked && !(muted(chat) && list.length)) continue;
        const creditedRows = list.filter((x) => x.c.credited);
        const creditedAmount = creditedRows.reduce((s, x) => s + x.c.atRiskAmount, 0);
        const ownFakeSign = list.some((x) => ownSigns(x).length > 0);
        const blocks = list.filter((x) => x.row.ask?.kind === 'fraud' && x.row.ask.state === 'open' && !!x.row.ask.blockedAt && !(x.row.ask as { closedAt?: unknown }).closedAt);
        const markRow = rows.filter((u) => !!u.fakePaymentAt).sort((a, b) => new Date(a.fakePaymentAt!).getTime() - new Date(b.fakePaymentAt!).getTime())[0];
        let entry: Pick<MutedEntry, 'source' | 'at' | 'by' | 'reason' | 'reasonCodes' | 'evidence' | 'preMarkCanReply'>;
        let shown = list;
        if (markRow) {
            const ids = new Set(markRow.fakePaymentProofIds ?? []);
            const evidence = ids.size ? list.filter((x) => ids.has(x.c.proofId)) : creditedRows;
            if (evidence.length) shown = evidence;
            entry = {
                source: 'operator_mark', at: iso(markRow.fakePaymentAt), by: markRow.fakePaymentBy ?? null,
                reason: markRow.fakePaymentReason ?? null, reasonCodes: [], evidence: evidence.map(proofCard),
                preMarkCanReply: typeof markRow.fakePaymentPrev?.canReply === 'number' ? markRow.fakePaymentPrev.canReply : null,
            };
        } else if (blocks.length) {
            const latest = Math.max(...blocks.map((x) => new Date(x.row.ask!.blockedAt!).getTime()));
            shown = blocks;
            entry = {
                source: 'fraud_block', at: iso(latest), by: null, reason: null,
                reasonCodes: uniqSorted(blocks.flatMap((x) => x.row.ask?.reasons ?? [])), evidence: blocks.map(proofCard), preMarkCanReply: null,
            };
        } else {
            entry = { source: 'unknown', at: null, by: null, reason: null, reasonCodes: [], evidence: [], preMarkCanReply: null };
        }
        mutedEntries.push({
            chatId: chat,
            username: usernameOf(chat),
            name: nameOf(chat),
            clients: uniqSorted([...rows.map((u) => u.clientId), ...list.map((x) => String(x.row.clientId))]),
            personas: [...rows].sort((a, b) => (a.profile < b.profile ? -1 : 1))
                .map((u) => ({ profile: u.profile, clientId: u.clientId ?? null, canReply: typeof u.canReply === 'number' ? u.canReply : null })),
            ...entry,
            creditedAmount,
            ownFakeSign,
            likelyWrong: creditedAmount > 0 && !ownFakeSign,
            history: rows.flatMap((u) => u.fakePaymentHistory ?? []).filter((h, i, all) =>
                all.findIndex((o) => o.action === h.action && iso(o.at) === iso(h.at)) === i),
            stamp: stampOfAll(shown),
            noProofs: list.length === 0,
        });
    }
    mutedEntries.sort((a, b) => Number(b.likelyWrong) - Number(a.likelyWrong) || b.creditedAmount - a.creditedAmount
        || (new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()) || (a.chatId < b.chatId ? -1 : 1));

    const refused: RefusedEntry[] = [];
    const inCheck = new Set(check.map((e) => e.chatId));
    for (const [chat, list] of byChat) {
        if (inMuted(chat) || inCheck.has(chat)) continue;
        for (const x of list) {
            if (x.c.credited || x.c.repeat || !looksGenuine(x)) continue;
            const t = msOf(x.row);
            if (list.some((y) => y.c.credited && msOf(y.row) > t && msOf(y.row) - t <= DAY_MS)) continue;
            const sha = shaOf(x.row);
            if (sha && (shaCount.get(sha) ?? 0) > 1) continue;
            const label = REFUSED_LABELS[String(x.c.outcome)] ?? 'Not credited';
            refused.push({
                ...proofCard(x),
                username: usernameOf(chat),
                name: nameOf(chat),
                refusedReason: x.c.reasons.length ? `${label}: ${x.c.reasons.join(', ')}` : label,
                stamp: x.c.stamp,
            });
        }
    }
    refused.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { check, muted: mutedEntries, refused };
}

/** A refusal that doubts authenticity, payee ours, printed at most FRESH_MS before arrival, fake score under the line, no real fake code, not a reuse copy. */
function looksGenuine(x: ReviewItem): boolean {
    const r = x.row;
    if (NOT_A_MISSED_CREDIT_OUTCOMES.has(String(x.c.outcome)) || x.c.reasons.some((code) => NOT_A_MISSED_CREDIT_CODES.has(code))) return false;
    if (r.verdict?.payee !== 'ours') return false;
    if (x.c.fakeScore !== null && x.c.fakeScore >= REVIEW_FAKE_SCORE) return false;
    if (x.c.reasons.some(isRealFakeReason)) return false;
    if (x.c.reusedFrom) return false;
    const printed = r.time?.state === 'known' && typeof r.time.epochMs === 'number' ? r.time.epochMs : null;
    if (printed === null) return false;
    const age = msOf(r) - printed;
    if (age > FRESH_MS || age < -SKEW_MS) return false;
    return true;
}
