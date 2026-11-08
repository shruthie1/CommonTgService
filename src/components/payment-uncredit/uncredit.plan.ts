/**
 * Pure userData rules for Uncredit / Recredit (tg-platform docs/design/2026-11-08-payment-uncredit.md section 5).
 *
 * The CMS cannot import tg-aut's ladder; it mirrors the two numbers it needs from
 * tg-platform apps/tg-aut/src/payments/ladder.ts (DEMO_BALANCE, FULL_SHOW_ROWS -> owedShowCap). Keep them in step.
 */

/** ladder.ts DEMO_BALANCE: the demo band kept when older genuine payments (outside the proofs' 7 days) exist. */
export const DEMO_BALANCE = 50;
/** ladder.ts FULL_SHOW_ROWS (minHighest -> owedBelow), largest applicable row wins; 0 below 200. */
const OWED_SHOW_ROWS: ReadonlyArray<readonly [number, number]> = [[200, 3], [250, 5], [350, 7], [600, 9]];

/** A money field: finite number >= 0 (strings parsed), else 0. Same as ladder.ts amountOf. */
export function amountOf(value: unknown): number {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export function countOf(value: unknown): number {
    return Math.floor(amountOf(value));
}

export function owedShowCap(highest: unknown): number {
    const h = amountOf(highest);
    return OWED_SHOW_ROWS.reduce((cap, [min, owed]) => (h >= min ? Math.max(cap, owed) : cap), 0);
}

/** A live in-house call: a callProgress entry not completed, updated in the last 10 minutes. */
export const LIVE_CALL_MS = 10 * 60_000;
export function callInProgress(callProgress: unknown, now: number): boolean {
    if (!callProgress || typeof callProgress !== 'object') return false;
    return Object.values(callProgress as Record<string, any>).some((p) =>
        p && typeof p === 'object' && p.completed !== true && now - amountOf(p.updatedAt) < LIVE_CALL_MS);
}

/** The userData fields Uncredit may set (never creditKeys, servedSha, cheatCount, canReply, fakePayment*, videos, callProgress). */
export const TIER_FIELDS = ['highestPayAmount', 'payAmount', 'fullShow', 'showsPaidTo', 'secondShow', 'demoGiven'] as const;
export type TierField = (typeof TIER_FIELDS)[number];

export interface UserDataUndo {
    status: 'applied' | 'missing' | 'unchanged';
    rowId?: unknown;
    /** value before the uncredit (null = field was absent). */
    before?: Partial<Record<TierField, unknown>>;
    /** value the uncredit wrote. */
    after?: Partial<Record<TierField, unknown>>;
    /** $inc the uncredit applied (negative); the recredit applies the opposite. */
    inc?: { lifetimePaid?: number; lifetimeCredits?: number };
}

export interface UncreditInput {
    /** the voided payment: proof creditAmount (else amount). */
    amount: number;
    servedAtMs: number;
    /** amounts of the other credited, not uncredited proofs of the same chat + profile + client. */
    others: number[];
    /** a live call and force: treated as delivered. */
    forceDelivered?: boolean;
}

export interface UncreditPlan {
    /** guard: every field read, with the value read (null = absent). */
    guard: Record<string, unknown>;
    set: Partial<Record<TierField, unknown>>;
    inc: { lifetimePaid?: number; lifetimeCredits?: number };
    undo: UserDataUndo;
    delivered: boolean;
}

const raw = (row: Record<string, unknown>, f: string): unknown => (row[f] === undefined ? null : row[f]);

export function planUncredit(row: Record<string, unknown>, input: UncreditInput): UncreditPlan {
    const A = amountOf(input.amount);
    const lp = amountOf(row.lifetimePaid);
    const lc = countOf(row.lifetimeCredits);
    const h = amountOf(row.highestPayAmount);
    const pay = amountOf(row.payAmount);
    const fs = countOf(row.fullShow);
    const spt = countOf(row.showsPaidTo);
    const others = input.others.map(amountOf);
    const maxR = others.length ? Math.max(...others) : 0;
    const sumR = others.reduce((a, b) => a + b, 0);

    const inc: UncreditPlan['inc'] = {};
    const takePaid = Math.min(A, lp);
    if (takePaid > 0) inc.lifetimePaid = -takePaid;
    if (lc > 0) inc.lifetimeCredits = -1;
    const lpAfter = lp - takePaid;

    // highestPayAmount drops only when the voided payment can be what set it and no remaining payment justifies it.
    let hNew = h;
    if (h > 0 && h <= A && h > maxR) hNew = Math.max(maxR, lpAfter > sumR ? DEMO_BALANCE : 0);

    const delivered = !!input.forceDelivered || amountOf(row.callTime) > input.servedAtMs;
    const next: Record<TierField, unknown> = {
        highestPayAmount: hNew, payAmount: pay, fullShow: fs, showsPaidTo: spt,
        secondShow: row.secondShow, demoGiven: row.demoGiven,
    };
    if (!delivered) {
        next.payAmount = Math.max(0, pay - A);
        if (spt > fs) next.showsPaidTo = spt - 1;
    } else {
        if (hNew > 0) next.payAmount = Math.min(pay, hNew);
        // End the cycle at the tier that was served: nothing more is owed at the old or the new tier.
        const fsEnd = Math.max(fs, owedShowCap(h));
        next.fullShow = fsEnd;
        next.showsPaidTo = Math.min(spt, fsEnd);
        if (h > DEMO_BALANCE) next.secondShow = true;
        next.demoGiven = true;
    }

    const set: UncreditPlan['set'] = {};
    const before: UserDataUndo['before'] = {};
    const guard: Record<string, unknown> = {};
    const numeric: Record<TierField, number | null> = { highestPayAmount: h, payAmount: pay, fullShow: fs, showsPaidTo: spt, secondShow: null, demoGiven: null };
    for (const f of TIER_FIELDS) {
        const cur = numeric[f];
        const changed = cur === null ? next[f] !== row[f] && next[f] !== undefined : next[f] !== cur;
        if (!changed) continue;
        set[f] = next[f];
        before[f] = raw(row, f);
        guard[f] = raw(row, f);
    }
    if (inc.lifetimePaid) guard.lifetimePaid = raw(row, 'lifetimePaid');
    if (inc.lifetimeCredits) guard.lifetimeCredits = raw(row, 'lifetimeCredits');
    const any = Object.keys(set).length > 0 || Object.keys(inc).length > 0;
    return {
        guard, set, inc, delivered,
        undo: any ? { status: 'applied', rowId: row._id, before, after: { ...set }, inc: { ...inc } } : { status: 'unchanged', rowId: row._id },
    };
}

export interface RecreditPlan {
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
    restored: string[];
    skipped: string[];
}

/** Restore each tier field only where the row still holds what the uncredit wrote; lifetime deltas always come back. */
export function planRecredit(row: Record<string, unknown>, undo: UserDataUndo): RecreditPlan {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    const $inc: Record<string, number> = {};
    const restored: string[] = [];
    const skipped: string[] = [];
    const filter: Record<string, unknown> = { _id: row._id };
    for (const [f, wrote] of Object.entries(undo.after ?? {})) {
        const now = raw(row, f);
        if (now !== wrote) { skipped.push(f); continue; }
        filter[f] = now;
        const prev = (undo.before ?? {})[f as TierField];
        if (prev === null || prev === undefined) $unset[f] = ''; else $set[f] = prev;
        restored.push(f);
    }
    for (const [f, d] of Object.entries(undo.inc ?? {})) {
        if (typeof d === 'number' && d !== 0) { $inc[f] = -d; restored.push(f); }
    }
    const update: Record<string, unknown> = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    if (Object.keys($inc).length) update.$inc = $inc;
    return { filter, update, restored, skipped };
}
