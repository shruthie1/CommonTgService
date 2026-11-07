import { PaymentProofRow, ProofOutcome, ReviewDecision } from './schemas/payment-proof.schema';

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

/** fakeScore at or above this is a strong fake signal. */
export const REVIEW_FAKE_SCORE = 40;
export const FLAGGED_OUTCOMES: ReadonlySet<string> = new Set(['fraud_ask', 'fake_blocked', 'cross_client']);
/** Outcomes where tg-aut judged the screenshot fake (a chat that sent one makes its credits suspect). */
export const FAKE_OUTCOMES: ReadonlySet<string> = new Set(['fraud_ask', 'fake_blocked', 'cross_client', 'model_blocked']);
/**
 * Reason codes that say "this receipt is fake" (tg-aut processImage fraudReasons, paid-to-us tamper reasons, vision).
 * Not fake: BLOCKED_IGNORED, OVER_1000, AMOUNT_TOO_SMALL, NOT_PAID_TO_US, NOT_FINISHED, REPEAT_* and the like.
 */
export const FAKE_REASON_CODES: ReadonlySet<string> = new Set([
    'PERSONA_PAYEE', 'UPI_NOT_OURS', 'LAXMI_PAYEE', 'FAKE_TEXT', 'FUTURE_TIME', 'FUTURE_DATE', 'DATE_IN_FUTURE',
    'UTR_REUSED', 'UTR_REUSED_OTHER_AMOUNT', 'UTR_MALFORMED', 'EDITED_PICTURE', 'AI_WATERMARK', 'GENERATOR_SUCCESS_TEXT',
    'IMPOSSIBLE_REFERENCE', 'MASKED_TRANSACTION_ID', 'SAMPLE_PAYMENT', 'VISION_AUTHENTICITY', 'SECOND_FAKE',
    'LLM_SECOND_OPINION_SUSPICIOUS', 'IMAGE_NEAR_DUPLICATE_OTHER_CHAT', 'DISCLAIMER_SHORT', 'DISCLAIMER_LONG',
    'DISCLAIMER_MODEL_ONLY', 'BLOCKLIST_A', 'FAILED_PAYMENT_TO_SCREEN',
]);

export function isFakeReason(code: string): boolean {
    return FAKE_REASON_CODES.has(code) || code.startsWith('LLM_FAKE_');
}

export interface ClassifiedProof {
    proofId: string;
    outcome: ProofOutcome | string;
    /** true when the outcome was derived from an old row (no verdict). */
    legacy: boolean;
    reasons: string[];
    fakeScore: number | null;
    /** creditAmount (the amount actually credited) else the amount read. */
    amount: number | null;
    /** stamp !== null. */
    reviewed: boolean;
    /** The operator's stamp, if it still holds (see stampOf). */
    stamp: ReviewStamp | null;
    /** In the review queue: set by buildReviewModel (classify alone leaves it false). */
    review: boolean;
    flagged: boolean;
    credited: boolean;
    /** Review facts (buildReviewModel); defaults when the model did not run. */
    risk: number;
    riskReasons: string[];
    /** Risk points and labels from the non-strong signals only (amount, burst, personas, receipt age): the views'
     * daily top-N ranks on these so a dropped strong rule (e.g. payer name) does not keep a proof out of the ranking. */
    baseRisk: number;
    baseReasons: string[];
    /** Credited ₹ (0 when not credited): the revenue a Mark fake would remove. */
    atRiskAmount: number;
    /** Strong fake signal: enters the queue whatever the amount or threshold. */
    strong: boolean;
    /** Re-send of a screenshot already seen in the same chat (same sha256, or amount + payee + printed minute). */
    repeat: boolean;
    /** Set on a reuse copy: the earliest proof with the same UTR (the original). buildReviewModel fills it. */
    reusedFrom: { proofId: string; chatId: string; createdAt: string; amount: number | null } | null;
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

export interface ReviewStamp { decision: ReviewDecision; at: string }

/**
 * The operator's stamp on a row, or null when there is none or it no longer holds: the payment check opened or
 * blocked an ask on the row after the stamp (e.g. a fraud block 15 min later), so the row needs another look.
 * The legacy { state: 'ok' } shape reads as 'fine'. tg-aut and CMS clocks differ slightly; accepted (owner 2026-11-07).
 */
export function stampOf(row: Pick<PaymentProofRow, 'review' | 'ask'>): ReviewStamp | null {
    const r = row.review;
    const decision = r?.decision ?? (r?.state === 'ok' ? 'fine' : undefined);
    const at = r?.at ? new Date(r.at).getTime() : NaN;
    if (!decision || !Number.isFinite(at)) return null;
    const changedAfter = [row.ask?.blockedAt, row.ask?.openedAt].some((v) => !!v && new Date(v).getTime() > at);
    return changedAfter ? null : { decision, at: new Date(at).toISOString() };
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
    const stamp = stampOf(row);
    return {
        proofId: proofIdOf(row),
        outcome,
        legacy,
        reasons,
        fakeScore,
        amount,
        reviewed: stamp !== null,
        stamp,
        review: false,
        flagged: FLAGGED_OUTCOMES.has(outcome),
        credited,
        risk: 0,
        riskReasons: [],
        baseRisk: 0,
        baseReasons: [],
        atRiskAmount: credited ? amount ?? 0 : 0,
        strong: false,
        repeat: outcome === 'repeat',
        reusedFrom: null,
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

export interface ReviewOptions {
    /** Review entries aimed for per IST day (strong entries count towards it and always enter). */
    dailyTarget: number;
    /** Lowest risk a non-strong credited proof needs to enter. */
    riskFloor: number;
    /** Below this credited ₹ only a strong signal enters. */
    minAmount: number;
    /** A credited, non-repeat proof above this ₹ (strictly) always enters, on top of the daily target (owner 2026-11-03). */
    alwaysAmount: number;
}
export const DEFAULT_REVIEW_OPTIONS: ReviewOptions = { dailyTarget: 20, riskFloor: 25, minAmount: 100, alwaysAmount: 200 };

function envNum(v: string | undefined, dflt: number): number {
    if (v === undefined || v.trim() === '') return dflt;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : dflt;
}

/** REVIEW_DAILY_TARGET / REVIEW_RISK_FLOOR / REVIEW_MIN_AMOUNT / REVIEW_ALWAYS_AMOUNT (remote config copies into process.env). */
export function reviewOptionsFromEnv(env: Record<string, string | undefined> = process.env): ReviewOptions {
    return {
        dailyTarget: Math.floor(envNum(env.REVIEW_DAILY_TARGET, DEFAULT_REVIEW_OPTIONS.dailyTarget)),
        riskFloor: envNum(env.REVIEW_RISK_FLOOR, DEFAULT_REVIEW_OPTIONS.riskFloor),
        minAmount: envNum(env.REVIEW_MIN_AMOUNT, DEFAULT_REVIEW_OPTIONS.minAmount),
        alwaysAmount: envNum(env.REVIEW_ALWAYS_AMOUNT, DEFAULT_REVIEW_OPTIONS.alwaysAmount),
    };
}

/** A client needs this many credited proofs in the window for its own amount percentiles (else all clients'). */
export const MIN_CLIENT_CREDITS = 30;
const MIN_MS = 60_000;
const DAY_MS = 24 * 60 * MIN_MS;
const IST_OFFSET_MS = 330 * MIN_MS;
/** A receipt printed this long before it arrived is old for the risk score. */
const OLD_RECEIPT_MS = 30 * MIN_MS;

/** Risk points (sum capped at 100). Strong ones always enter the queue. */
export const RISK = {
    fakeReason: 70, fakeScore: 60, fakeSignal: 60, chatSentFake: 60, imageOtherChat: 70, creditedBefore: 60, utrReused: 70,
    markedPayer: 60, amountP95: 40, amountP90: 30, amountP75: 15, burst: 15, personas: 15, oldReceipt: 15, timeUnknown: 10,
} as const;

export function istDay(ms: number): string {
    return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function shaOf(r: PaymentProofRow): string | null {
    const s = r.imageSha256 || r.image?.sha256;
    return typeof s === 'string' && s ? s : null;
}
/** UTRs shorter than this (after trim / uppercase / no spaces) are ignored as unread. */
export const MIN_UTR_LENGTH = 6;
/** Normalised UTR (trim, uppercase, no whitespace), or null when absent / shorter than MIN_UTR_LENGTH. */
export function normUtr(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const u = v.trim().toUpperCase().replace(/\s+/g, '');
    return u.length >= MIN_UTR_LENGTH ? u : null;
}
function norm(v: unknown): string {
    return typeof v === 'string' ? v.toLowerCase().replace(/\s+/g, '') : '';
}
function printedMs(r: PaymentProofRow): number | null {
    return r.time?.state === 'known' && typeof r.time.epochMs === 'number' && Number.isFinite(r.time.epochMs) ? r.time.epochMs : null;
}
/** Same payment re-captured: amount + payee + printed minute (tg-aut payee rule 7). */
function paymentKey(r: PaymentProofRow, amount: number | null): string | null {
    const payee = norm(r.payeeUpiId) || norm(r.payeeName);
    const ms = printedMs(r);
    return amount !== null && payee && ms !== null ? `${amount}|${payee}|${Math.floor(ms / MIN_MS)}` : null;
}
function msOf(r: PaymentProofRow): number {
    return new Date(r.createdAt).getTime();
}
/** Nearest-rank percentile of an ascending list. */
function pct(sorted: number[], p: number): number {
    return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
function ordinal(n: number): string {
    return n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

export interface ReviewItem { row: PaymentProofRow; c: ClassifiedProof }
export interface ReviewModel {
    options: ReviewOptions;
    /** IST day -> lowest risk that entered without a strong signal (null = none did). */
    thresholds: Record<string, number | null>;
}

/**
 * The review queue (redesign 2026-11-03: revenue correctness + long-term blocking, post-hoc only). Fills risk /
 * riskReasons / strong / repeat / review on every item, in place. Pass ALL rows of the collection (7-day TTL) so the
 * signals and per-day thresholds do not depend on the list filters. Pure and deterministic; no I/O.
 *
 * review = credited AND not reviewed AND chat not marked fake AND (strong signal OR (not a repeat AND amount >
 * alwaysAmount) OR (amount >= minAmount AND among the day's top max(0, dailyTarget - strong) other credited proofs by
 * (risk, amount) with risk >= riskFloor)). Over-alwaysAmount entries are on top of the target and are not strong.
 * Nothing uncredited enters (repeats, not_ours, not_receipt, old_time, over_limit, other, uncredited fakes = flagged).
 */
export function buildReviewModel(items: ReviewItem[], isMarked: (chatId: string) => boolean, options: ReviewOptions = DEFAULT_REVIEW_OPTIONS): ReviewModel {
    const asc = [...items].sort((a, b) => msOf(a.row) - msOf(b.row) || (String(a.row._id) < String(b.row._id) ? -1 : 1));
    const byChat = new Map<string, ReviewItem[]>();
    const shaChats = new Map<string, Set<string>>();
    const markedPayers = new Map<string, Set<string>>();
    const fakeRows = new Map<string, Set<ReviewItem>>();
    const overAlways = new Set<ReviewItem>();
    // Reused receipts (owner 2026-11-04): a fraudster edits only the amount on an earlier genuine receipt, so the UTR
    // repeats. The EARLIEST row with a UTR (or the first chat to send an image) is the original and is never flagged
    // because of its later copies; a later row is a reuse copy when it is in another chat or reads another amount.
    // A later row in the original's chat with the same amount is a plain re-send (repeat / credited-before rules).
    const utrOriginal = new Map<string, ReviewItem>();
    const utrCopies = new Set<ReviewItem>();
    const shaFirstChat = new Map<string, string>();
    const readAmount = (x: ReviewItem) => num(x.row.amount) ?? x.c.amount;
    for (const x of asc) {
        const chat = String(x.row.chatId);
        let list = byChat.get(chat);
        if (!list) byChat.set(chat, (list = []));
        list.push(x);
        const sha = shaOf(x.row);
        if (sha) {
            if (!shaChats.has(sha)) shaChats.set(sha, new Set());
            shaChats.get(sha)!.add(chat);
            if (!shaFirstChat.has(sha)) shaFirstChat.set(sha, chat);
        }
        const utr = normUtr(x.row.utr);
        if (utr) {
            const orig = utrOriginal.get(utr);
            if (!orig) utrOriginal.set(utr, x);
            else if (String(orig.row.chatId) !== chat || readAmount(orig) !== readAmount(x)) utrCopies.add(x);
        }
        const payer = norm((x.row.ocr as { payerName?: unknown } | undefined)?.payerName);
        if (payer && isMarked(chat)) {
            if (!markedPayers.has(payer)) markedPayers.set(payer, new Set());
            markedPayers.get(payer)!.add(chat);
        }
        if (FAKE_OUTCOMES.has(String(x.c.outcome)) || x.c.reasons.some(isFakeReason)) {
            if (!fakeRows.has(chat)) fakeRows.set(chat, new Set());
            fakeRows.get(chat)!.add(x);
        }
    }

    // Amount percentiles of credited proofs, per client (enough rows) else all clients.
    const amounts = new Map<string, number[]>();
    const all: number[] = [];
    for (const x of asc) {
        if (!x.c.credited || x.c.amount === null) continue;
        all.push(x.c.amount);
        const k = String(x.row.clientId);
        if (!amounts.has(k)) amounts.set(k, []);
        amounts.get(k)!.push(x.c.amount);
    }
    const sortNum = (a: number, b: number) => a - b;
    all.sort(sortNum);
    for (const v of amounts.values()) v.sort(sortNum);
    const distOf = (clientId: string) => {
        const own = amounts.get(clientId);
        return own && own.length >= MIN_CLIENT_CREDITS ? { list: own, scope: clientId } : { list: all, scope: 'all clients' };
    };

    for (const [chat, list] of byChat) {
        const seenSha = new Set<string>();
        const seenKey = new Set<string>();
        const creditedSha = new Set<string>();
        const creditedKey = new Set<string>();
        for (let i = 0; i < list.length; i++) {
            const x = list[i];
            const r = x.row;
            const sha = shaOf(r);
            const utr = normUtr(r.utr);
            const copy = utrCopies.has(x);
            if (copy) {
                const orig = utrOriginal.get(utr!)!;
                x.c.reusedFrom = { proofId: orig.c.proofId, chatId: String(orig.row.chatId), createdAt: new Date(orig.row.createdAt).toISOString(), amount: readAmount(orig) };
            }
            // A same-chat same-amount re-send of a UTR counts like a same-image re-send; a reuse copy does not.
            const utrKey = utr && !copy ? `utr|${utr}` : null;
            const key = paymentKey(r, num(r.amount) ?? x.c.amount);
            x.c.repeat = x.c.outcome === 'repeat' || (!!sha && seenSha.has(sha)) || (!!key && seenKey.has(key))
                || (!!utrKey && seenKey.has(utrKey));
            const creditedBefore = (!!sha && creditedSha.has(sha)) || (!!key && creditedKey.has(key))
                || (!!utrKey && creditedKey.has(utrKey));
            if (sha) seenSha.add(sha);
            if (key) seenKey.add(key);
            if (utrKey) seenKey.add(utrKey);
            if (!x.c.credited) continue;
            if (sha) creditedSha.add(sha);
            if (key) creditedKey.add(key);
            if (utrKey) creditedKey.add(utrKey);

            const reasons: string[] = [];
            let risk = 0;
            let strong = false;
            let baseRisk = 0;
            const baseReasons: string[] = [];
            const add = (pts: number, label: string, isStrong = false) => {
                risk += pts;
                reasons.push(label);
                strong ||= isStrong;
                if (!isStrong) { baseRisk += pts; baseReasons.push(label); }
            };
            const fakeCodes = x.c.reasons.filter(isFakeReason);
            if (fakeCodes.length) add(RISK.fakeReason, `Fake sign: ${fakeCodes.join(', ')}`, true);
            if (x.c.fakeScore !== null && x.c.fakeScore >= REVIEW_FAKE_SCORE) add(RISK.fakeScore, `Fake score ${x.c.fakeScore}`, true);
            const signals = strings(r.verdict?.fakeSignals);
            if (signals.length) add(RISK.fakeSignal, `Image model: ${signals.slice(0, 3).join(', ')}`, true);
            const fakes = fakeRows.get(chat);
            // An edited copy of one of this chat's own earlier receipts says nothing about a UTR original of the chat
            // (the genuine side, owner 2026-11-04). A copy of another chat's receipt still taints the chat.
            const ownCopy = (f: ReviewItem) => !copy && !!utr && utrCopies.has(f)
                && String(utrOriginal.get(normUtr(f.row.utr)!)!.row.chatId) === chat;
            if (fakes && [...fakes].some((f) => f !== x && !ownCopy(f))) add(RISK.chatSentFake, 'Chat sent a fake receipt', true);
            if (sha && (shaChats.get(sha)?.size ?? 0) > 1 && shaFirstChat.get(sha) !== chat) add(RISK.imageOtherChat, 'Same image used by another chat', true);
            if (copy) {
                const before = x.c.reusedFrom!.amount;
                const now = readAmount(x);
                add(RISK.utrReused, `Reused UTR of an earlier receipt${before !== null && before !== now ? ` (₹${before} before)` : ''}`, true);
            }
            if (creditedBefore) add(RISK.creditedBefore, 'Same receipt credited before', true);
            const payer = norm((r.ocr as { payerName?: unknown } | undefined)?.payerName);
            if (payer && [...(markedPayers.get(payer) ?? [])].some((c) => c !== chat)) add(RISK.markedPayer, 'Payer of a marked-fake chat', true);

            const amount = x.c.amount;
            // Always reviewed, but not a fake signal: no risk points, strong stays false.
            if (!x.c.repeat && amount !== null && amount > options.alwaysAmount) {
                reasons.push(`Over ₹${options.alwaysAmount}`);
                overAlways.add(x);
            }
            if (amount !== null) {
                const d = distOf(String(r.clientId));
                if (d.list.length) {
                    const [p75, p90, p95] = [pct(d.list, 0.75), pct(d.list, 0.9), pct(d.list, 0.95)];
                    if (amount > p95) add(RISK.amountP95, `Top 5% amount for ${d.scope} (> ₹${p95})`);
                    else if (amount > p90) add(RISK.amountP90, `Top 10% amount for ${d.scope} (> ₹${p90})`);
                    else if (amount > p75) add(RISK.amountP75, `Top 25% amount for ${d.scope} (> ₹${p75})`);
                }
            }
            const t = msOf(r);
            const day = list.slice(0, i + 1).filter((y) => y.c.credited && t - msOf(y.row) <= DAY_MS);
            if (day.length >= 3) add(RISK.burst, `${ordinal(day.length)} credit in 24 h`);
            const personas = new Set(day.map((y) => String(y.row.profile)));
            if (personas.size >= 2) add(RISK.personas, `Paid on ${personas.size} personas in 24 h`);
            const printed = printedMs(r);
            if (printed === null) add(RISK.timeUnknown, 'Payment time not read');
            else if (t - printed > OLD_RECEIPT_MS) add(RISK.oldReceipt, `Receipt ${Math.round((t - printed) / MIN_MS)} min old`);

            x.c.risk = Math.min(100, risk);
            x.c.riskReasons = reasons;
            x.c.strong = strong;
            x.c.baseRisk = Math.min(100, baseRisk);
            x.c.baseReasons = baseReasons;
        }
    }

    // Per IST day: strong + over-alwaysAmount entries + the top other ones up to the target. Ranked over every credited proof of the
    // day (reviewed / marked included) so a click does not pull another proof in.
    const days = new Map<string, ReviewItem[]>();
    for (const x of asc) {
        if (!x.c.credited) continue;
        const d = istDay(msOf(x.row));
        if (!days.has(d)) days.set(d, []);
        days.get(d)!.push(x);
    }
    const thresholds: Record<string, number | null> = {};
    for (const [d, list] of days) {
        const strongN = list.filter((x) => x.c.strong).length;
        const slots = Math.max(0, options.dailyTarget - strongN);
        const ranked = list
            .filter((x) => !x.c.strong && !overAlways.has(x) && (x.c.amount ?? 0) >= options.minAmount && x.c.risk >= options.riskFloor)
            .sort((a, b) => b.c.risk - a.c.risk || (b.c.amount ?? 0) - (a.c.amount ?? 0) || (String(b.row._id) < String(a.row._id) ? -1 : 1))
            .slice(0, slots);
        thresholds[d] = ranked.length ? ranked[ranked.length - 1].c.risk : null;
        const picked = new Set(ranked);
        for (const x of list) {
            x.c.review = !x.c.reviewed && !isMarked(String(x.row.chatId)) && (x.c.strong || overAlways.has(x) || picked.has(x));
        }
    }
    for (const x of asc) if (!x.c.credited) x.c.review = false;
    return { options, thresholds };
}

/** Review queue order: risk x credited ₹ at risk. */
export function priorityOf(c: ClassifiedProof): number {
    return c.risk * c.atRiskAmount;
}

/** Opaque keyset cursor over (t desc, _id desc): t = createdAt ms, or priorityOf() when s = 'r' (risk order). */
export interface ProofCursor { t: number; id: string; s?: 'r' }

export function encodeCursor(c: ProofCursor): string {
    return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: unknown): ProofCursor | null {
    if (typeof raw !== 'string' || !raw || raw.length > 200) return null;
    try {
        const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        if (v && typeof v.t === 'number' && Number.isFinite(v.t) && typeof v.id === 'string' && /^[0-9a-f]{24}$/i.test(v.id)) {
            if (v.s !== undefined && v.s !== 'r') return null;
            return v.s === 'r' ? { t: v.t, id: v.id.toLowerCase(), s: 'r' } : { t: v.t, id: v.id.toLowerCase() };
        }
    } catch { /* invalid cursor */ }
    return null;
}

/** Row sorts strictly after the cursor in (createdAt desc, _id desc) order. */
export function isAfterCursor(t: number, id: string, cursor: ProofCursor): boolean {
    return t < cursor.t || (t === cursor.t && id < cursor.id);
}
