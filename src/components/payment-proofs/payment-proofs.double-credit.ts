/**
 * Possible double credit (owner 2026-11-11): two credited proofs of the same chat and the same amount within 48 h
 * whose evidence does NOT prove two payments. Read-only signal for tg-chats (badge next to Uncredit) and the daily
 * payment health report. Never uncredits anything.
 *
 * "Proves two payments" =
 *  - different real UTRs of the same format (12-digit UPI reference, or PhonePe "T" + 20-22 digits), not a one-digit
 *    OCR misread of each other; or
 *  - both rows have a readable printed clock that is not relative ("Just now", "1 min ago") and the clocks differ by
 *    more than 1 minute.
 * The same UTR or the same file (imageSha256) is never proof of two payments.
 *
 * Known true cases (prod 2026-11-09/10): meghana2 chat 6809433050 proofs 300768 + 301161 (₹100, "1 min ago" vs a
 * printed 11:31 AM); kavya1 chat 5299793102 proofs 61117 + 61124 (₹40, "Just now" vs a printed 8:52 AM).
 */

export const DOUBLE_CREDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Printed clocks this close may be the same payment read twice. */
export const CLOCK_TOLERANCE_MS = 60 * 1000;

/** Fields the rule reads (paymentProofs rows; all optional except the ids). */
export interface DoubleCreditRow {
    proofId?: string;
    chatId: string;
    clientId?: string;
    telegramMsgId?: number;
    amount?: number | null;
    creditAmount?: number | null;
    servedAt?: Date | string | null;
    verdict?: { outcome?: string } | null;
    uncredited?: { state?: string } | null;
    utr?: string | null;
    imageSha256?: string | null;
    time?: { state?: string; epochMs?: number | null; relative?: boolean } | null;
    ocr?: { text?: unknown; precheckText?: unknown } | null;
}

export interface DoubleCreditPair {
    chatId: string;
    amount: number;
    /** Earlier credit. */
    first: string;
    /** Later credit. */
    second: string;
    firstServedAt: number;
    secondServedAt: number;
    /** Short evidence label: why the pair is not proven to be two payments. */
    why: string;
}

/** Clock-relative wording ("Just now", "1 min ago", "3 hrs ago"): the screen shows no printed clock. */
const RELATIVE_TIME_RE = /\bjust\s+now\b|\b\d+\s*(?:s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\s+ago\b/i;
const REPEATED_DIGIT_RE = /^(\d)\1+$/;

export function proofKey(r: Pick<DoubleCreditRow, 'proofId' | 'clientId' | 'chatId' | 'telegramMsgId'>): string {
    return r.proofId || `${r.clientId}-${r.chatId}-${r.telegramMsgId}`;
}

export function creditAmountOf(r: Pick<DoubleCreditRow, 'creditAmount' | 'amount'>): number {
    const n = Number(r.creditAmount ?? r.amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function ms(v: Date | string | null | undefined): number {
    if (v === null || v === undefined) return NaN;
    return new Date(v).getTime();
}

/** Credited and still counted: verdict credited (else servedAt for old rows), served, not uncredited. */
export function isLiveCredit(r: DoubleCreditRow): boolean {
    if (!Number.isFinite(ms(r.servedAt))) return false;
    if (r.uncredited?.state === 'done') return false;
    const outcome = r.verdict?.outcome;
    return outcome ? outcome === 'credited' : true;
}

/** Format of a real transaction reference, or null when it is a partial / unknown read. */
export function utrFormat(utr: unknown): string | null {
    if (typeof utr !== 'string') return null;
    const u = utr.trim();
    if (/^\d{12}$/.test(u)) return REPEATED_DIGIT_RE.test(u) ? null : 'upi12';
    if (/^T\d{20,22}$/.test(u)) return REPEATED_DIGIT_RE.test(u.slice(1)) ? null : `phonepe${u.length}`;
    return null;
}

function positionsDiffering(a: string, b: string): number {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
}

/** Different real UTRs of the same format, more than one digit apart (one digit = an OCR misread). */
export function differentRealUtrs(a: DoubleCreditRow, b: DoubleCreditRow): boolean {
    const fa = utrFormat(a.utr);
    const fb = utrFormat(b.utr);
    if (!fa || fa !== fb) return false;
    const ua = String(a.utr).trim();
    const ub = String(b.utr).trim();
    return ua !== ub && positionsDiffering(ua, ub) > 1;
}

function ocrText(r: DoubleCreditRow): string {
    const parts = [r.ocr?.precheckText, r.ocr?.text].filter((x): x is string => typeof x === 'string' && x.length > 0);
    return parts.join('\n');
}

/** The printed clock (epoch ms) when readable and not relative; otherwise null. */
export function printedClock(r: DoubleCreditRow): number | null {
    const t = r.time;
    if (!t || t.state !== 'known' || t.relative === true) return null;
    const epoch = Number(t.epochMs);
    if (!Number.isFinite(epoch) || epoch <= 0) return null;
    if (RELATIVE_TIME_RE.test(ocrText(r))) return null;
    return epoch;
}

function sameUtr(a: DoubleCreditRow, b: DoubleCreditRow): boolean {
    return typeof a.utr === 'string' && typeof b.utr === 'string' && a.utr.trim() !== '' && a.utr.trim() === b.utr.trim();
}

/** null when the evidence proves two payments; otherwise a short label of why it does not. */
export function notProvenWhy(a: DoubleCreditRow, b: DoubleCreditRow): string | null {
    if (a.imageSha256 && a.imageSha256 === b.imageSha256) return 'same file';
    if (sameUtr(a, b)) return 'same UTR';
    if (differentRealUtrs(a, b)) return null;
    const ca = printedClock(a);
    const cb = printedClock(b);
    if (ca !== null && cb !== null) {
        if (Math.abs(ca - cb) > CLOCK_TOLERANCE_MS) return null;
        return 'same printed minute';
    }
    const relA = !!a.time && (a.time.relative === true || RELATIVE_TIME_RE.test(ocrText(a)));
    const relB = !!b.time && (b.time.relative === true || RELATIVE_TIME_RE.test(ocrText(b)));
    if (relA || relB) return 'relative time ("just now" / "N min ago")';
    if (ca === null && cb === null) return 'no UTR, no printed clock';
    return 'one side has no printed clock';
}

/**
 * Every possible double credit among `rows` (any chats). Pairs are (earlier, later) by servedAt, within
 * DOUBLE_CREDIT_WINDOW_MS, same chat and same credit amount, both live credits.
 */
export function findDoubleCredits(rows: DoubleCreditRow[], windowMs = DOUBLE_CREDIT_WINDOW_MS): DoubleCreditPair[] {
    const byChat = new Map<string, DoubleCreditRow[]>();
    for (const r of rows) {
        if (!isLiveCredit(r) || !creditAmountOf(r)) continue;
        const k = String(r.chatId);
        const list = byChat.get(k);
        if (list) list.push(r);
        else byChat.set(k, [r]);
    }
    const out: DoubleCreditPair[] = [];
    for (const [chatId, list] of byChat) {
        list.sort((x, y) => ms(x.servedAt) - ms(y.servedAt));
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            const ta = ms(a.servedAt);
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                const tb = ms(b.servedAt);
                if (tb - ta > windowMs) break;
                if (creditAmountOf(a) !== creditAmountOf(b) || proofKey(a) === proofKey(b)) continue;
                const why = notProvenWhy(a, b);
                if (why === null) continue;
                out.push({ chatId, amount: creditAmountOf(a), first: proofKey(a), second: proofKey(b), firstServedAt: ta, secondServedAt: tb, why });
            }
        }
    }
    return out.sort((x, y) => x.secondServedAt - y.secondServedAt);
}

/** proofId -> the other proofIds it may double with (both sides of every pair). */
export function doubleCreditIndex(pairs: DoubleCreditPair[]): Map<string, { withProofIds: string[]; why: string }> {
    const m = new Map<string, { withProofIds: string[]; why: string }>();
    const add = (id: string, other: string, why: string) => {
        const e = m.get(id);
        if (e) {
            if (!e.withProofIds.includes(other)) e.withProofIds.push(other);
        } else m.set(id, { withProofIds: [other], why });
    };
    for (const p of pairs) {
        add(p.first, p.second, p.why);
        add(p.second, p.first, p.why);
    }
    return m;
}

/** Mongo projection of the fields the rule reads (ocr text only for the relative-time check). */
export const DOUBLE_CREDIT_PROJECTION = {
    _id: 0, proofId: 1, chatId: 1, clientId: 1, telegramMsgId: 1, amount: 1, creditAmount: 1, servedAt: 1,
    'verdict.outcome': 1, 'uncredited.state': 1, utr: 1, imageSha256: 1, time: 1, 'ocr.text': 1, 'ocr.precheckText': 1,
} as const;
