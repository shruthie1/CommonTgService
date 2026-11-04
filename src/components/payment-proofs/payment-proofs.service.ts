import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from '../user-data/schemas/user-data.schema';
import { PAYMENT_PROOF_MODEL, PaymentProofRow, ProofReview } from './schemas/payment-proof.schema';
import {
    ClassifiedProof, PROOF_STATES, ProofCounts, ProofState, ReviewModel, addToCounts, buildReviewModel, classify,
    decodeCursor, emptyCounts, encodeCursor, inState, isAfterCursor, parseProofId, priorityOf, reviewOptionsFromEnv,
} from './payment-proofs.classify';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
/** The TTL is 7 days, so this is the whole collection by default. */
export const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Rows read per list call (the review model needs the whole collection). Prod 2026-11-03: 1,756 rows in total at ~617 B,
 * so one call reads ~1 MB; the cap only guards against a runaway collection and sets `truncated`.
 */
export const MAX_WINDOW_ROWS = 20_000;
const USERDATA_IN_CHUNK = 1_000;
const CLIENT_HOST_TTL_MS = 5 * 60 * 1000;
const CLIENT_ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const MAX_BY = 60;
/**
 * The whole-window read (rows + userData + review model) is shared by every list call. Prod 2026-11-03 (VM2 -> Atlas):
 * ~8.5 s per call whatever the filters, so it is kept in memory: fresh for PAYMENT_PROOFS_LIST_CACHE_MS (default 60 s,
 * 0 = off), then served stale while one background reload runs. review() and the fake-payment mark patch it in place.
 */
export const DEFAULT_LIST_CACHE_MS = 60_000;
/** Entries: the default 7-day window plus a few explicit older `since` windows. */
export const MAX_CACHED_WINDOWS = 4;
const DEFAULT_WINDOW_KEY = 'default';

export function listCacheMs(env: Record<string, string | undefined> = process.env): number {
    const raw = env.PAYMENT_PROOFS_LIST_CACHE_MS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_LIST_CACHE_MS;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_LIST_CACHE_MS;
}

/** Bulky / internal fields not sent to the UI (shadow vision run, perceptual hash, race-guard copies). */
const ROW_PROJECTION = { shadow: 0, imageHash: 0, servedUtr: 0, servedSha: 0 } as const;
/**
 * Only what classify() + paging need, for the whole-window read; the page's full rows are fetched by _id after.
 * Prod 2026-11-03 (laptop -> Atlas): 1,757 rows = 431 KB / ~5.0 s slim vs 914 KB / ~9.6 s with ROW_PROJECTION.
 */
const CLASSIFY_PROJECTION = {
    _id: 1, chatId: 1, profile: 1, clientId: 1, telegramMsgId: 1, createdAt: 1, amount: 1, creditAmount: 1, decision: 1,
    reasons: 1, servedAt: 1, 'ask.kind': 1, 'ask.blockedAt': 1, 'ask.reasons': 1, proofId: 1,
    'verdict.outcome': 1, 'verdict.reasons': 1, 'verdict.fakeScore': 1, 'review.state': 1,
    // review model signals (re-sends, image reuse, payer, receipt age)
    imageSha256: 1, 'image.sha256': 1, utr: 1, payeeUpiId: 1, payeeName: 1, 'time.state': 1, 'time.epochMs': 1,
    'verdict.fakeSignals': 1, 'ocr.payerName': 1,
} as const;
export const PROOF_SORTS = ['risk', 'time'] as const;
export type ProofSort = (typeof PROOF_SORTS)[number];

export interface ListQuery {
    since?: string;
    client?: string;
    /** chatId: one chat's proofs (the review details sheet's history; additive 2026-11-04). */
    chat?: string;
    state?: string;
    minAmount?: string | number;
    limit?: string | number;
    cursor?: string;
    /** risk (default for state=review: risk x credited ₹) or time (newest first; default for other states). */
    sort?: string;
}

export interface ProofItem extends Omit<PaymentProofRow, '_id'> {
    _id: string;
    proofId: string;
    outcome: string;
    legacy: boolean;
    reasons: string[];
    fakeScore: number | null;
    amountValue: number | null;
    inReview: boolean;
    flagged: boolean;
    risk: number;
    riskReasons: string[];
    atRiskAmount: number;
    strong: boolean;
    repeat: boolean;
    /** Reuse copy: the earliest proof with the same UTR (additive 2026-11-04). */
    reusedFrom: ClassifiedProof['reusedFrom'];
    persona: string;
    username: string | null;
    complaintScore: number | null;
    fakePaymentAt: Date | null;
    clientHost: string | null;
}

export interface ListResult {
    items: ProofItem[];
    nextCursor: string | null;
    /** counts.reviewAmount = credited ₹ of the review items (same filters). */
    counts: ProofCounts & { reviewAmount: number };
    /** The review rule's settings and per-IST-day risk threshold (whole collection, not the filters). */
    reviewModel: ReviewModel;
    /** true when the window held more than MAX_WINDOW_ROWS rows (counts then cover only the newest ones). */
    truncated: boolean;
}

type ChatInfo = { profile: string; username?: string; cheatCount?: number; fakePaymentAt?: Date };
type ChatEntry = { rows: Map<string, ChatInfo>; marked: boolean; fakePaymentAt: Date | null };

/** One whole-window read and what is derived from it (independent of the request's filters, sort and page). */
interface WindowData {
    loadedAt: number;
    rows: PaymentProofRow[];
    truncated: boolean;
    chats: Map<string, ChatEntry>;
    everything: { row: PaymentProofRow; c: ClassifiedProof }[];
    reviewModel: ReviewModel;
}

/**
 * Payments review (contract section 2). Reads `paymentProofs` (tg-aut owned) + `userData` + `clients`; writes only
 * `paymentProofs.review`. Mark fake stays POST /fake-payment/:chatId/mark.
 */
@Injectable()
export class PaymentProofsService {
    private readonly logger = new Logger(PaymentProofsService.name);
    private clientHosts: { at: number; map: Map<string, string> } | null = null;
    private readonly windows = new Map<string, WindowData>();
    private readonly loading = new Map<string, { gen: number; promise: Promise<WindowData> }>();
    /** Bumped by every write; a load started before a write is neither joined nor stored after it. */
    private gen = 0;

    constructor(
        @InjectModel(PAYMENT_PROOF_MODEL) private readonly proofModel: Model<any>,
        @InjectModel(UserData.name) private readonly userDataModel: Model<UserDataDocument>,
    ) {}

    parseQuery(q: ListQuery, now = Date.now()) {
        let since = now - DEFAULT_WINDOW_MS;
        if (q.since !== undefined && q.since !== '') {
            const t = Date.parse(String(q.since));
            if (!Number.isFinite(t)) throw new BadRequestException('since must be an ISO date');
            since = t;
        }
        let client: string | undefined;
        if (q.client !== undefined && q.client !== '') {
            if (!CLIENT_ID_RE.test(String(q.client))) throw new BadRequestException('client must be a clientId');
            client = String(q.client);
        }
        let chat: string | undefined;
        if (q.chat !== undefined && q.chat !== '') {
            if (!/^-?\d{1,20}$/.test(String(q.chat))) throw new BadRequestException('chat must be a chatId');
            chat = String(q.chat);
        }
        const state = (q.state === undefined || q.state === '' ? 'review' : String(q.state)) as ProofState;
        if (!PROOF_STATES.includes(state)) throw new BadRequestException(`state must be one of ${PROOF_STATES.join('|')}`);
        let minAmount: number | null = null;
        if (q.minAmount !== undefined && q.minAmount !== '') {
            minAmount = Number(q.minAmount);
            if (!Number.isFinite(minAmount) || minAmount < 0) throw new BadRequestException('minAmount must be a number >= 0');
        }
        let limit = DEFAULT_LIMIT;
        if (q.limit !== undefined && q.limit !== '') {
            limit = Number(q.limit);
            if (!Number.isInteger(limit) || limit < 1) throw new BadRequestException('limit must be an integer >= 1');
            limit = Math.min(limit, MAX_LIMIT);
        }
        const sort = (q.sort === undefined || q.sort === '' ? (state === 'review' ? 'risk' : 'time') : String(q.sort)) as ProofSort;
        if (!PROOF_SORTS.includes(sort)) throw new BadRequestException(`sort must be one of ${PROOF_SORTS.join('|')}`);
        let cursor = null;
        if (q.cursor !== undefined && q.cursor !== '') {
            cursor = decodeCursor(q.cursor);
            if (!cursor || (cursor.s === 'r') !== (sort === 'risk')) throw new BadRequestException('invalid cursor');
        }
        return { since, client, chat, state, minAmount, limit, cursor, sort };
    }

    async list(q: ListQuery, now = Date.now()): Promise<ListResult> {
        const p = this.parseQuery(q, now);
        // Shared whole-window data (cached); since / client / minAmount / state / sort / paging are applied per request.
        const { everything, chats, reviewModel, truncated } = await this.window(p.since, now);
        const isMarked = (chatId: string) => !!chats.get(chatId)?.marked;

        const classified = everything.filter(({ row, c }) =>
            new Date(row.createdAt).getTime() >= p.since
            && (!p.client || row.clientId === p.client)
            && (!p.chat || String(row.chatId) === p.chat)
            && (p.minAmount === null || (c.amount !== null && c.amount >= p.minAmount)));

        const counts = { ...emptyCounts(), reviewAmount: 0 };
        const inPage: { row: PaymentProofRow; c: ClassifiedProof; marked: boolean; t: number }[] = [];
        for (const x of classified) {
            const marked = isMarked(String(x.row.chatId));
            addToCounts(counts, x.c, marked);
            if (x.c.review) counts.reviewAmount += x.c.atRiskAmount;
            if (!inState(x.c, marked, p.state)) continue;
            const t = p.sort === 'risk' ? priorityOf(x.c) : new Date(x.row.createdAt).getTime();
            if (p.cursor && !isAfterCursor(t, String(x.row._id), p.cursor)) continue;
            inPage.push({ ...x, marked, t });
        }
        // rows are already (createdAt desc, _id desc); risk order needs a sort on (priority desc, _id desc).
        if (p.sort === 'risk') inPage.sort((a, b) => b.t - a.t || (String(b.row._id) < String(a.row._id) ? -1 : 1));
        const more = inPage.length > p.limit;
        const page = inPage.slice(0, p.limit);

        const hosts = page.length ? await this.clientHostMap(now) : new Map<string, string>();
        const full = new Map<string, PaymentProofRow>();
        if (page.length) {
            const docs = await this.proofModel
                .find({ _id: { $in: page.map((x) => x.row._id) } }, ROW_PROJECTION)
                .lean<PaymentProofRow[]>()
                .exec();
            for (const d of docs) full.set(String(d._id), d);
        }
        const items = page.map(({ row: slim, c }) => {
            // A row the TTL removed between the two reads keeps its slim fields.
            const row = full.get(String(slim._id)) ?? slim;
            const chat = chats.get(String(row.chatId));
            const ud = chat?.rows.get(String(row.profile));
            return {
                ...row,
                _id: String(row._id),
                proofId: c.proofId,
                outcome: c.outcome,
                legacy: c.legacy,
                reasons: c.reasons,
                fakeScore: c.fakeScore,
                amountValue: c.amount,
                inReview: c.review,
                flagged: c.flagged,
                risk: c.risk,
                riskReasons: c.riskReasons,
                atRiskAmount: c.atRiskAmount,
                strong: c.strong,
                repeat: c.repeat,
                reusedFrom: c.reusedFrom,
                persona: ud?.profile ?? row.profile,
                username: ud?.username || null,
                complaintScore: typeof ud?.cheatCount === 'number' ? ud.cheatCount : null,
                fakePaymentAt: chat?.fakePaymentAt ?? null,
                clientHost: hosts.get(String(row.clientId)) ?? null,
            } as ProofItem;
        });
        const last = page[page.length - 1];
        const nextCursor = more && last
            ? encodeCursor(p.sort === 'risk' ? { t: last.t, id: String(last.row._id), s: 'r' } : { t: last.t, id: String(last.row._id) })
            : null;
        return { items, nextCursor, counts, reviewModel, truncated };
    }

    /** The shared whole-window data: cached, single-flight, stale-while-revalidate (see DEFAULT_LIST_CACHE_MS). */
    private async window(since: number, now: number): Promise<WindowData> {
        // An explicit since older than the TTL widens the read (from = since); otherwise the window is the last 7 days.
        const wide = since < now - DEFAULT_WINDOW_MS;
        const ttl = listCacheMs();
        if (ttl <= 0) return this.loadWindow(wide ? since : now - DEFAULT_WINDOW_MS, now);
        const key = wide ? `since:${since}` : DEFAULT_WINDOW_KEY;
        const hit = this.windows.get(key);
        if (hit && now - hit.loadedAt < ttl) return hit;
        const load = () => this.refreshWindow(key, wide ? since : now - DEFAULT_WINDOW_MS, now);
        if (!hit) return load();
        load().catch((err) => this.logger.error(`payment-proofs ${key} window reload failed; serving the copy from ${new Date(hit.loadedAt).toISOString()}: ${(err as Error)?.stack ?? err}`));
        return hit;
    }

    private refreshWindow(key: string, from: number, now: number): Promise<WindowData> {
        const running = this.loading.get(key);
        if (running && running.gen === this.gen) return running.promise;
        const gen = this.gen;
        const promise: Promise<WindowData> = this.loadWindow(from, now)
            .then((data) => {
                if (gen === this.gen) {
                    this.windows.delete(key);
                    this.windows.set(key, data);
                    while (this.windows.size > MAX_CACHED_WINDOWS) this.windows.delete(this.windows.keys().next().value as string);
                }
                return data;
            })
            .finally(() => { if (this.loading.get(key)?.promise === promise) this.loading.delete(key); });
        this.loading.set(key, { gen, promise });
        return promise;
    }

    private async loadWindow(from: number, now: number): Promise<WindowData> {
        // The whole collection (7-day TTL) is read so the review model (signals across chats, per-day thresholds) does
        // not change with the filters; since / client / minAmount are applied in memory. createdAt range on tg-aut's
        // TTL index createdAt_ttl; no new index (prod 2026-11-03: 1,767 rows).
        const rows = await this.proofModel
            .find({ createdAt: { $gte: new Date(from) } }, CLASSIFY_PROJECTION)
            .sort({ createdAt: -1, _id: -1 })
            .limit(MAX_WINDOW_ROWS + 1)
            .lean<PaymentProofRow[]>()
            .exec();
        const truncated = rows.length > MAX_WINDOW_ROWS;
        if (truncated) rows.length = MAX_WINDOW_ROWS;
        const chats = await this.chatInfo([...new Set(rows.map((row) => String(row.chatId)))]);
        return this.derive({ loadedAt: now, rows, truncated, chats });
    }

    /** classify + review model from rows + chats (cheap; re-run after a patch since buildReviewModel sets c.repeat). */
    private derive(d: Pick<WindowData, 'loadedAt' | 'rows' | 'truncated' | 'chats'>): WindowData {
        const everything = d.rows.map((row) => ({ row, c: classify(row) }));
        const reviewModel = buildReviewModel(everything, (chatId) => !!d.chats.get(chatId)?.marked, reviewOptionsFromEnv());
        return { ...d, everything, reviewModel };
    }

    /**
     * Re-reads what one write changed and patches every cached window in place, so the operator's next list shows it.
     * If the re-read fails the cache is dropped (the next list reloads) and the error is logged.
     */
    private async patchWindows(what: string, apply: () => Promise<(w: WindowData) => WindowData | null>): Promise<void> {
        this.gen++;
        if (!this.windows.size) return;
        try {
            const patch = await apply();
            for (const [key, w] of this.windows) {
                const next = patch(w);
                if (next) this.windows.set(key, next);
            }
        } catch (err) {
            this.windows.clear();
            this.logger.error(`payment-proofs cache patch after ${what} failed; cache dropped: ${(err as Error)?.stack ?? err}`);
        }
    }

    /** Called by FakePaymentService after a mark / unmark wrote userData for the chat. */
    async chatChanged(chatId: string): Promise<void> {
        const id = String(chatId);
        await this.patchWindows(`fake-payment ${id}`, async () => {
            const fresh = (await this.chatInfo([id])).get(id);
            return (w) => {
                if (!w.rows.some((r) => String(r.chatId) === id)) return null;
                const chats = new Map(w.chats);
                if (fresh) chats.set(id, fresh); else chats.delete(id);
                return this.derive({ ...w, chats });
            };
        });
    }

    /** userData rows of the chats (index chatId_Profile): per-persona info + chat-level fake mark. */
    private async chatInfo(chatIds: string[]) {
        const out = new Map<string, ChatEntry>();
        for (let i = 0; i < chatIds.length; i += USERDATA_IN_CHUNK) {
            const chunk = chatIds.slice(i, i + USERDATA_IN_CHUNK);
            const docs = await this.userDataModel
                .find({ chatId: { $in: chunk } }, { _id: 0, chatId: 1, profile: 1, username: 1, cheatCount: 1, fakePaymentAt: 1 })
                .lean<(ChatInfo & { chatId: string })[]>()
                .exec();
            for (const d of docs) {
                const key = String(d.chatId);
                let e = out.get(key);
                if (!e) { e = { rows: new Map(), marked: false, fakePaymentAt: null }; out.set(key, e); }
                e.rows.set(String(d.profile), d);
                if (d.fakePaymentAt) {
                    e.marked = true;
                    const at = new Date(d.fakePaymentAt);
                    if (!e.fakePaymentAt || at < e.fakePaymentAt) e.fakePaymentAt = at;
                }
            }
        }
        return out;
    }

    /** clientId -> clients.repl (the tg-aut host that serves the proof image / OCR). Read-only, cached 5 min. */
    private async clientHostMap(now: number): Promise<Map<string, string>> {
        if (this.clientHosts && now - this.clientHosts.at < CLIENT_HOST_TTL_MS) return this.clientHosts.map;
        const docs = await this.proofModel.db.collection('clients')
            .find({}, { projection: { _id: 0, clientId: 1, repl: 1 } })
            .toArray();
        const map = new Map<string, string>();
        for (const d of docs) if (typeof d.clientId === 'string' && typeof d.repl === 'string' && d.repl) map.set(d.clientId, d.repl);
        this.clientHosts = { at: now, map };
        return map;
    }

    /** Sets (state 'ok') or clears the operator review on one proof. Idempotent. */
    async review(proofId: string, body: { state?: string; by?: string }, now = new Date()): Promise<{ proofId: string; review: ProofReview | null }> {
        const key = parseProofId(proofId);
        if (!key) throw new BadRequestException('proofId must be <clientId>-<chatId>-<telegramMsgId>');
        const state = body?.state;
        if (state !== 'ok' && state !== 'clear') throw new BadRequestException("state must be 'ok' or 'clear'");
        const by = typeof body?.by === 'string' ? body.by.trim().slice(0, MAX_BY) : '';
        if (state === 'ok' && !by) throw new BadRequestException('by is required');
        // (chatId, clientId, telegramMsgId) identifies the row for old (no proofId) and new rows alike; chatId leads
        // the existing chatId_1_createdAt_-1 index.
        const filter = { chatId: key.chatId, clientId: key.clientId, telegramMsgId: key.telegramMsgId };
        const review: ProofReview | null = state === 'ok' ? { state: 'ok', by, at: now } : null;
        const update = review ? { $set: { review } } : { $unset: { review: 1 } };
        const res = await this.proofModel.updateOne(filter, update).exec();
        if (!res.matchedCount) throw new NotFoundException('payment proof not found (gone after the 7-day TTL?)');
        await this.patchWindows(`review ${proofId}`, async () => {
            const fresh = new Map((await this.proofModel.find(filter, CLASSIFY_PROJECTION).lean<PaymentProofRow[]>().exec())
                .map((r) => [String(r._id), r]));
            return (w) => {
                let hit = false;
                const rows = w.rows.map((r) => { const f = fresh.get(String(r._id)); if (f) hit = true; return f ?? r; });
                return hit ? this.derive({ ...w, rows }) : null;
            };
        });
        return { proofId, review };
    }
}
