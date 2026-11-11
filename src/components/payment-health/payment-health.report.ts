/**
 * Daily payment health report (owner 2026-11-11): pure computation + formatting, no I/O.
 * PaymentHealthService loads the rows (Mongo paymentProofs, Postgres payment_event, Redis heartbeats) and sends the
 * result to the ops channel. Report only: nothing here writes, inserts or uncredits.
 *
 * Proof -> payment_event matching is the paywatch rule (scratch paywatch4/check.mjs, used since 2026-11-09):
 * source 'screenshot', amount > 0, same chat + client + amount, |ts - servedAt| <= 15 min, closest row first, each
 * row used once. A row whose void_proof_id names the proof matches it first (an Uncredit voids exactly that row).
 */
import type { RichNotificationInput } from '../../utils/rich-message';
import { DoubleCreditPair, DoubleCreditRow, creditAmountOf, findDoubleCredits, isLiveCredit, proofKey } from '../payment-proofs/payment-proofs.double-credit';

export const MATCH_WINDOW_MS = 15 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Rows listed per table in the Telegram message (counts always cover everything). */
export const MAX_LISTED = 8;
/** Reasons listed per breakdown table. */
export const MAX_REASONS = 6;

export interface HealthProof extends DoubleCreditRow {
    createdAt?: Date | string;
    ask?: { kind?: string; state?: string; reasons?: string[] } | null;
    verdict?: { outcome?: string; reasons?: string[] } | null;
}

export interface PgPaymentRow {
    id: string;
    /** epoch ms */
    ts: number;
    chatId: string;
    clientId: string;
    amount: number;
    source: string;
    voided: boolean;
    voidProofId?: string | null;
}

export interface ProcessBuild {
    clientId: string;
    sha: string | null;
    builtAt: string | null;
}

export interface BuildCheck {
    /** Why the check could not run (Redis down, no heartbeats). */
    skipped?: string;
    newest?: { sha: string | null; builtAt: string | null };
    total?: number;
    behind?: ProcessBuild[];
}

export interface ReconcileResult {
    /** Live credits (served in the day, not uncredited). */
    credited: { count: number; amount: number };
    uncredited: { count: number; amount: number };
    rows: { count: number; amount: number };
    /** Live credits with no payment_event row. */
    missing: Array<{ proofId: string; chatId: string; clientId: string; amount: number; servedAt: number }>;
    /**
     * Screenshot rows in the day that match no credited proof. `note` names a proof that was served (servedAt set) with a
     * non-credited verdict at the same chat / client / amount / time (seen 2026-11-10: outcome 'repeat' DUPLICATE_UPDATE).
     */
    extra: Array<PgPaymentRow & { note?: string }>;
    /** Voided rows in the day. */
    voided: { count: number; amount: number };
    /** A live credit whose matched row is voided (revenue lost without an Uncredit). */
    voidedButCredited: Array<{ proofId: string; rowId: string; amount: number }>;
    /** An uncredited proof whose matched row is still counted. */
    uncreditedButCounted: Array<{ proofId: string; rowId: string; amount: number }>;
    otherSources: Record<string, number>;
}

export interface PaymentHealthReport {
    /** IST day "YYYY-MM-DD". */
    day: string;
    reconcile: ReconcileResult | null;
    /** Postgres failure (reconcile skipped). */
    pgError?: string;
    doubles: DoubleCreditPair[];
    holds: { total: number; open: number; byReason: Array<[string, number]> };
    fakes: { total: number; byReason: Array<[string, number]> };
    builds: BuildCheck;
}

/** IST day containing `now` shifted by `offsetDays`. */
export function istDay(now: number, offsetDays = 0): string {
    return new Date(now + IST_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** [start, end) epoch ms of an IST day. */
export function istDayRange(day: string): { from: number; to: number } {
    const from = Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS;
    return { from, to: from + DAY_MS };
}

function served(r: DoubleCreditRow): number {
    return r.servedAt ? new Date(r.servedAt).getTime() : NaN;
}

/** Served (credited at some point): verdict credited, or servedAt on an old row without verdict. */
function wasCredited(r: HealthProof): boolean {
    if (!Number.isFinite(served(r))) return false;
    const o = r.verdict?.outcome;
    return o ? o === 'credited' : true;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Proofs: every row served within [from - 15 min, to + 15 min) (boundary matches); rows: payment_event in the same
 * padded window. Only proofs / rows inside [from, to) are reported.
 */
export function reconcile(proofs: HealthProof[], rows: PgPaymentRow[], from: number, to: number, matchMs = MATCH_WINDOW_MS): ReconcileResult {
    const screenshot = rows.filter((x) => x.source === 'screenshot' && x.amount > 0);
    const served_ = proofs.filter(wasCredited).sort((a, b) => served(a) - served(b));
    const used = new Set<string>();
    const match = new Map<string, PgPaymentRow>();
    // 1. an Uncredit voided exactly this row
    for (const p of served_) {
        const row = screenshot.find((x) => !used.has(x.id) && x.voidProofId && x.voidProofId === proofKey(p));
        if (row) { used.add(row.id); match.set(proofKey(p), row); }
    }
    // 2. paywatch rule
    for (const p of served_) {
        const id = proofKey(p);
        if (match.has(id)) continue;
        const t = served(p);
        const amount = creditAmountOf(p);
        let best: PgPaymentRow | undefined;
        for (const x of screenshot) {
            if (used.has(x.id) || x.chatId !== String(p.chatId) || x.clientId !== p.clientId || x.amount !== amount) continue;
            if (Math.abs(x.ts - t) > matchMs) continue;
            if (!best || Math.abs(x.ts - t) < Math.abs(best.ts - t)) best = x;
        }
        if (best) { used.add(best.id); match.set(id, best); }
    }
    const inDay = (t: number) => t >= from && t < to;
    const dayProofs = served_.filter((p) => inDay(served(p)));
    const live = dayProofs.filter((p) => isLiveCredit(p));
    const unc = dayProofs.filter((p) => !isLiveCredit(p));
    const dayRows = screenshot.filter((x) => inDay(x.ts));
    const otherSources: Record<string, number> = {};
    for (const x of rows) if (inDay(x.ts) && x.source !== 'screenshot') otherSources[x.source] = (otherSources[x.source] ?? 0) + 1;
    const voidedRows = dayRows.filter((x) => x.voided);
    return {
        credited: { count: live.length, amount: sum(live.map(creditAmountOf)) },
        uncredited: { count: unc.length, amount: sum(unc.map(creditAmountOf)) },
        rows: { count: dayRows.length, amount: sum(dayRows.map((x) => x.amount)) },
        missing: live.filter((p) => !match.has(proofKey(p))).map((p) => ({
            proofId: proofKey(p), chatId: String(p.chatId), clientId: String(p.clientId ?? ''), amount: creditAmountOf(p), servedAt: served(p),
        })),
        extra: dayRows.filter((x) => !used.has(x.id)).map((x) => {
            const near = proofs.find((p) => !wasCredited(p) && Number.isFinite(served(p)) && String(p.chatId) === x.chatId
                && p.clientId === x.clientId && creditAmountOf(p) === x.amount && Math.abs(served(p) - x.ts) <= matchMs);
            return near ? { ...x, note: `served, verdict ${near.verdict?.outcome ?? '?'}: ${proofKey(near)}` } : x;
        }),
        voided: { count: voidedRows.length, amount: sum(voidedRows.map((x) => x.amount)) },
        voidedButCredited: live.filter((p) => match.get(proofKey(p))?.voided).map((p) => ({ proofId: proofKey(p), rowId: match.get(proofKey(p))!.id, amount: creditAmountOf(p) })),
        uncreditedButCounted: unc.filter((p) => { const m = match.get(proofKey(p)); return !!m && !m.voided; })
            .map((p) => ({ proofId: proofKey(p), rowId: match.get(proofKey(p))!.id, amount: creditAmountOf(p) })),
        otherSources,
    };
}

function tally(lists: string[][]): Array<[string, number]> {
    const m = new Map<string, number>();
    for (const l of lists) for (const k of new Set(l.length ? l : ['(no reason)'])) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Holds = proofs created in the day with an ask of kind held / old_time; fake flags = outcome fraud_ask / fake_blocked. */
export function holdsAndFakes(proofs: HealthProof[], from: number, to: number): Pick<PaymentHealthReport, 'holds' | 'fakes'> {
    const day = proofs.filter((p) => { const t = p.createdAt ? new Date(p.createdAt).getTime() : NaN; return t >= from && t < to; });
    const held = day.filter((p) => p.ask?.kind === 'held' || p.ask?.kind === 'old_time');
    const fake = day.filter((p) => p.verdict?.outcome === 'fraud_ask' || p.verdict?.outcome === 'fake_blocked');
    return {
        holds: {
            total: held.length,
            open: held.filter((p) => p.ask?.state === 'open').length,
            byReason: tally(held.map((p) => (p.ask?.reasons?.length ? p.ask.reasons : p.verdict?.reasons ?? []))),
        },
        fakes: { total: fake.length, byReason: tally(fake.map((p) => p.verdict?.reasons ?? [])) },
    };
}

/** Doubles whose later credit falls in the day (the earlier one may be up to 48 h before). */
export function doublesInDay(proofs: DoubleCreditRow[], from: number, to: number): DoubleCreditPair[] {
    return findDoubleCredits(proofs).filter((p) => p.secondServedAt >= from && p.secondServedAt < to);
}

/** Newest build = latest builtAt among live tg-aut heartbeats; processes on an older (or unknown) build are behind. */
export function buildCheck(processes: ProcessBuild[] | null, skipped?: string): BuildCheck {
    if (!processes) return { skipped: skipped ?? 'heartbeats unavailable' };
    if (!processes.length) return { skipped: 'no live tg-aut heartbeat' };
    const stamped = processes.filter((p) => p.builtAt && Number.isFinite(Date.parse(p.builtAt)));
    if (!stamped.length) return { skipped: 'heartbeats carry no build stamp' };
    const newest = stamped.reduce((a, b) => (Date.parse(b.builtAt!) > Date.parse(a.builtAt!) ? b : a));
    const behind = processes.filter((p) => !p.builtAt || Date.parse(p.builtAt) < Date.parse(newest.builtAt!))
        .sort((a, b) => a.clientId.localeCompare(b.clientId));
    return { newest: { sha: newest.sha, builtAt: newest.builtAt }, total: processes.length, behind };
}

export function buildReport(input: {
    day: string;
    proofs: HealthProof[];
    pgRows: PgPaymentRow[] | null;
    pgError?: string;
    processes: ProcessBuild[] | null;
    processesSkipped?: string;
}): PaymentHealthReport {
    const { from, to } = istDayRange(input.day);
    return {
        day: input.day,
        reconcile: input.pgRows ? reconcile(input.proofs, input.pgRows, from, to) : null,
        ...(input.pgRows ? {} : { pgError: input.pgError ?? 'Postgres unavailable' }),
        doubles: doublesInDay(input.proofs, from, to),
        ...holdsAndFakes(input.proofs, from, to),
        builds: buildCheck(input.processes, input.processesSkipped),
    };
}

export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const ist = (t: number) => new Date(t + IST_OFFSET_MS).toISOString().slice(5, 16).replace('T', ' ');
const shortSha = (s: string | null) => (s ? s.slice(0, 7) : '?');

/** True when something needs a look (warning severity). */
export function needsLook(r: PaymentHealthReport): boolean {
    const c = r.reconcile;
    return !c || c.missing.length > 0 || c.extra.length > 0 || c.voidedButCredited.length > 0
        || c.uncreditedButCounted.length > 0 || r.doubles.length > 0;
}

/** The Telegram message: a few lines + small tables. */
export function formatReport(r: PaymentHealthReport): RichNotificationInput {
    const c = r.reconcile;
    const fields: Array<{ label: string; value: string; code?: boolean }> = [];
    if (c) {
        fields.push({ label: 'Credited', value: `${c.credited.count} · ${inr(c.credited.amount)}`, code: false });
        fields.push({ label: 'Revenue rows', value: `${c.rows.count} · ${inr(c.rows.amount)}`, code: false });
        fields.push({ label: 'Missing rows', value: c.missing.length ? `${c.missing.length} · ${inr(sum(c.missing.map((m) => m.amount)))}` : '0', code: false });
        fields.push({ label: 'Extra rows', value: String(c.extra.length), code: false });
        fields.push({ label: 'Voided', value: `${c.voided.count} · ${inr(c.voided.amount)} (uncredited ${c.uncredited.count})`, code: false });
    } else {
        fields.push({ label: 'Revenue check', value: `skipped: ${r.pgError}`, code: false });
    }
    fields.push({ label: 'Possible double credits', value: r.doubles.length ? `${r.doubles.length} · ${inr(sum(r.doubles.map((d) => d.amount)))}` : '0', code: false });
    fields.push({ label: 'Holds', value: `${r.holds.total} (${r.holds.open} still open)`, code: false });
    fields.push({ label: 'Fake flags', value: String(r.fakes.total), code: false });
    const b = r.builds;
    fields.push({
        label: 'Old build',
        value: b.skipped ? `skipped: ${b.skipped}` : `${b.behind!.length} of ${b.total} (newest ${shortSha(b.newest!.sha)})`,
        code: false,
    });

    const tables: NonNullable<RichNotificationInput['tables']> = [];
    const more = (n: number) => (n > MAX_LISTED ? ` (first ${MAX_LISTED} of ${n})` : '');
    if (c?.missing.length) {
        tables.push({
            title: `Credited, no revenue row${more(c.missing.length)}`, columns: ['Proof', '₹', 'Served'], numeric: [1],
            rows: c.missing.slice(0, MAX_LISTED).map((m) => [m.proofId, m.amount, ist(m.servedAt)]),
        });
    }
    if (c?.extra.length) {
        tables.push({
            title: `Revenue row, no proof${more(c.extra.length)}`, columns: ['Row', 'Client', 'Chat', '₹', 'At'], numeric: [3],
            rows: c.extra.slice(0, MAX_LISTED).map((x) => [`${x.id}${x.voided ? ' (voided)' : ''}${x.note ? ` (${x.note})` : ''}`, x.clientId, x.chatId, x.amount, ist(x.ts)]),
        });
    }
    if (c?.voidedButCredited.length || c?.uncreditedButCounted.length) {
        const rows = [
            ...(c.voidedButCredited ?? []).map((x) => [x.proofId, x.rowId, 'row voided, proof still credited']),
            ...(c.uncreditedButCounted ?? []).map((x) => [x.proofId, x.rowId, 'uncredited, row still counted']),
        ];
        tables.push({ title: `Void mismatch${more(rows.length)}`, columns: ['Proof', 'Row', 'What'], rows: rows.slice(0, MAX_LISTED) });
    }
    if (r.doubles.length) {
        tables.push({
            title: `Possible double credit, check${more(r.doubles.length)}`, columns: ['Chat', '₹', 'Proofs', 'Why'], numeric: [1],
            rows: r.doubles.slice(0, MAX_LISTED).map((d) => [d.chatId, d.amount, `${d.first} + ${d.second.split('-').pop()}`, d.why]),
        });
    }
    if (r.holds.byReason.length) {
        tables.push({ title: 'Holds by reason', columns: ['Reason', 'n'], numeric: [1], rows: r.holds.byReason.slice(0, MAX_REASONS) });
    }
    if (r.fakes.byReason.length) {
        tables.push({ title: 'Fake flags by reason', columns: ['Reason', 'n'], numeric: [1], rows: r.fakes.byReason.slice(0, MAX_REASONS) });
    }
    if (b.behind?.length) {
        tables.push({
            title: `Not on the newest build${more(b.behind.length)}`, columns: ['Client', 'Build'],
            rows: b.behind.slice(0, MAX_LISTED).map((p) => [p.clientId, p.builtAt ? `${shortSha(p.sha)} ${p.builtAt.slice(5, 16).replace('T', ' ')}Z` : 'unknown']),
        });
    }
    return {
        title: `Payment health ${r.day}`,
        severity: needsLook(r) ? 'warning' : 'info',
        summary: 'Yesterday (IST). Report only: nothing was changed.',
        fields,
        fieldLayout: 'table',
        tables,
    };
}
