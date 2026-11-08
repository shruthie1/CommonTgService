import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from '../user-data/schemas/user-data.schema';
import { PAYMENT_PROOF_MODEL, PaymentProofRow, ProofReview, REVIEW_DECISIONS, ReviewDecision } from './schemas/payment-proof.schema';
import {
    ClassifiedProof, PROOF_STATES, ProofCounts, ProofState, ReviewModel, addToCounts, buildReviewModel, classify,
    decodeCursor, emptyCounts, encodeCursor, isAfterCursor, parseProofId, proofIdOf, reviewOptionsFromEnv,
} from './payment-proofs.classify';
import { ChatUser, REVIEW_VIEWS, ReviewView, ReviewViews, buildViews, isHiddenEntry } from './payment-proofs.views';

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
/**
 * The whole-window read (rows + userData + review model) is shared by every list call. Prod 2026-11-03 (VM2 -> Atlas):
 * ~8.5 s per call whatever the filters, so it is kept in memory: fresh for PAYMENT_PROOFS_LIST_CACHE_MS (default 60 s,
 * 0 = off), then served stale while one background reload runs. stampChat() and the fake-payment mark patch it in place.
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
    'verdict.outcome': 1, 'verdict.reasons': 1, 'verdict.fakeScore': 1, review: 1,
    // review model signals (re-sends, image reuse, payer, receipt age)
    imageSha256: 1, 'image.sha256': 1, utr: 1, payeeUpiId: 1, payeeName: 1, 'time.state': 1, 'time.epochMs': 1,
    'verdict.fakeSignals': 1, 'ocr.payerName': 1,
    // views (redesign 2026-11-07): genuine check, fraud-block source, card thumbnails
    'verdict.payee': 1, 'ask.state': 1, 'ask.openedAt': 1, 'ask.closedAt': 1, 'image.stored': 1, 'image.host': 1,
} as const;
/** userData fields the list join and the views read (index chatId_Profile). */
const CHAT_USER_PROJECTION = {
    _id: 0, chatId: 1, profile: 1, clientId: 1, username: 1, cheatCount: 1, canReply: 1, payAmount: 1, fakePaymentAt: 1,
    fakePaymentBy: 1, fakePaymentReason: 1, fakePaymentPrev: 1, fakePaymentProofIds: 1, fakePaymentHistory: 1,
} as const;
export const PROOF_SORTS = ['time'] as const;
export type ProofSort = (typeof PROOF_SORTS)[number];

export interface ListQuery {
    since?: string;
    client?: string;
    /** chatId: one chat's proofs (the review details sheet's history; additive 2026-11-04). */
    chat?: string;
    /** all (the default; the only state since 2026-11-07). */
    state?: string;
    minAmount?: string | number;
    limit?: string | number;
    cursor?: string;
    /** time (newest first; the default and the only sort since 2026-11-07). */
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
    /** The operator's stamp if it still holds (classify stampOf); null = not reviewed. */
    stamp: ClassifiedProof['stamp'];
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
    counts: ProofCounts;
    /** The review rule's settings and per-IST-day risk threshold (whole collection, not the filters). */
    reviewModel: ReviewModel;
    /** true when the window held more than MAX_WINDOW_ROWS rows (counts then cover only the newest ones). */
    truncated: boolean;
}

type ChatEntry = { rows: Map<string, ChatUser>; marked: boolean; fakePaymentAt: Date | null };

export interface ViewQuery { view?: string; client?: string; includeReviewed?: string }
/** Most proofs one stamp call takes (a card shows a chat's 7 days of proofs). */
export const MAX_STAMP_IDS = 200;
export interface ViewResult {
    view: ReviewView;
    entries: ReviewViews[ReviewView];
    /** Entries per view (same client filter), for the tab badges. */
    counts: Record<ReviewView, number>;
    truncated: boolean;
}

/** One whole-window read and what is derived from it (independent of the request's filters, sort and page). */
interface WindowData {
    loadedAt: number;
    rows: PaymentProofRow[];
    truncated: boolean;
    chats: Map<string, ChatEntry>;
    everything: { row: PaymentProofRow; c: ClassifiedProof }[];
    reviewModel: ReviewModel;
    views: ReviewViews;
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
        const state = (q.state === undefined || q.state === '' ? 'all' : String(q.state)) as ProofState;
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
        const sort = (q.sort === undefined || q.sort === '' ? 'time' : String(q.sort)) as ProofSort;
        if (!PROOF_SORTS.includes(sort)) throw new BadRequestException(`sort must be one of ${PROOF_SORTS.join('|')}`);
        let cursor = null;
        if (q.cursor !== undefined && q.cursor !== '') {
            cursor = decodeCursor(q.cursor);
            if (!cursor) throw new BadRequestException('invalid cursor');
        }
        return { since, client, chat, state, minAmount, limit, cursor, sort };
    }

    async list(q: ListQuery, now = Date.now()): Promise<ListResult> {
        const p = this.parseQuery(q, now);
        // Shared whole-window data (cached); since / client / chat / minAmount / paging are applied per request.
        const { everything, chats, reviewModel, truncated } = await this.window(p.since, now);
        const isMarked = (chatId: string) => !!chats.get(chatId)?.marked;

        const classified = everything.filter(({ row, c }) =>
            new Date(row.createdAt).getTime() >= p.since
            && (!p.client || row.clientId === p.client)
            && (!p.chat || String(row.chatId) === p.chat)
            && (p.minAmount === null || (c.amount !== null && c.amount >= p.minAmount)));

        const counts = emptyCounts();
        const inPage: { row: PaymentProofRow; c: ClassifiedProof; marked: boolean; t: number }[] = [];
        for (const x of classified) {
            const marked = isMarked(String(x.row.chatId));
            addToCounts(counts, x.c, marked);
            // rows are already (createdAt desc, _id desc), the page order.
            const t = new Date(x.row.createdAt).getTime();
            if (p.cursor && !isAfterCursor(t, String(x.row._id), p.cursor)) continue;
            inPage.push({ ...x, marked, t });
        }
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
                stamp: c.stamp,
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
        const nextCursor = more && last ? encodeCursor({ t: last.t, id: String(last.row._id) }) : null;
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
        // Every marked chat is in the "Fake & muted" view, also with no proof left in the window (23 chats on
        // 2026-11-07; the distinct read took 95 ms).
        const markedIds = (await this.userDataModel.distinct('chatId', { fakePaymentAt: { $ne: null } }).exec()).map(String);
        const chats = await this.chatInfo([...new Set([...rows.map((row) => String(row.chatId)), ...markedIds])]);
        return this.derive({ loadedAt: now, rows, truncated, chats });
    }

    /** classify + review model from rows + chats (cheap; re-run after a patch since buildReviewModel sets c.repeat). */
    private derive(d: Pick<WindowData, 'loadedAt' | 'rows' | 'truncated' | 'chats'>): WindowData {
        const everything = d.rows.map((row) => ({ row, c: classify(row) }));
        const options = reviewOptionsFromEnv();
        const reviewModel = buildReviewModel(everything, (chatId) => !!d.chats.get(chatId)?.marked, options);
        const users = new Map([...d.chats].map(([chatId, e]) => [chatId, [...e.rows.values()]]));
        return { ...d, everything, reviewModel, views: buildViews(everything, users, options) };
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
                // Also a chat with no proof in the window: a marked chat is listed in the muted view regardless.
                if (!fresh && !w.chats.has(id)) return null;
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
                .find({ chatId: { $in: chunk } }, CHAT_USER_PROJECTION)
                .lean<ChatUser[]>()
                .exec();
            // Display name (owner 2026-11-07): tg-aut stores userData.username as `@username || firstName`, so it is a
            // first name exactly when the person has no Telegram handle (userIdentity.handle; index chatId_1). Live
            // 2026-11-07, 1,000 newest chats: username = handle on 425/426 with a handle, a first name on 574/574 without.
            const handles = new Map((await this.proofModel.db.collection('userIdentity')
                .find({ chatId: { $in: chunk } }, { projection: { _id: 0, chatId: 1, handle: 1 } }).toArray())
                .map((x) => [String(x.chatId), typeof x.handle === 'string' && x.handle ? x.handle : null]));
            for (const d of docs) {
                const key = String(d.chatId);
                d.name = handles.has(key) && !handles.get(key) && d.username ? d.username : null;
                let e = out.get(key);
                if (!e) { e = { rows: new Map(), marked: false, fakePaymentAt: null }; out.set(key, e); }
                e.rows.set(String(d.profile), d);
                if (d.fakePaymentAt) {
                    e.marked = true;
                    const at = new Date(d.fakePaymentAt as Date);
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

    /**
     * GET /payment-proofs?view=check|muted|refused (redesign 2026-11-07): one view over the whole cached window
     * (no paging: one entry per chat, measured in the tens). Cards get clientHost for the thumbnail.
     */
    async views(q: ViewQuery, now = Date.now()): Promise<ViewResult> {
        const view = String(q.view ?? '') as ReviewView;
        if (!REVIEW_VIEWS.includes(view)) throw new BadRequestException(`view must be one of ${REVIEW_VIEWS.join('|')}`);
        let client: string | undefined;
        if (q.client !== undefined && q.client !== '') {
            if (!CLIENT_ID_RE.test(String(q.client))) throw new BadRequestException('client must be a clientId');
            client = String(q.client);
        }
        const all = q.includeReviewed === '1' || q.includeReviewed === 'true';
        const w = await this.window(now - DEFAULT_WINDOW_MS, now);
        const ofClient = (e: { clients?: string[]; clientId?: string }) => !client || (e.clients ? e.clients.includes(client) : e.clientId === client);
        const visible = <T extends Parameters<typeof isHiddenEntry>[0]>(xs: T[]) => xs.filter((e) => !isHiddenEntry(e));
        const mine = { check: w.views.check.filter(ofClient), muted: w.views.muted.filter(ofClient), refused: w.views.refused.filter(ofClient) };
        const open = { check: visible(mine.check), muted: visible(mine.muted), refused: visible(mine.refused) };
        const filtered = all ? mine : open;
        const hosts = await this.clientHostMap(now);
        const withHost = <T extends { clientId: string }>(c: T) => ({ ...c, clientHost: hosts.get(c.clientId) ?? null });
        const entries = view === 'check'
            ? filtered.check.map((e) => ({ ...e, history: e.history.map(withHost) }))
            : view === 'muted'
                ? filtered.muted.map((e) => ({ ...e, evidence: e.evidence.map(withHost) }))
                : filtered.refused.map(withHost);
        return {
            view,
            entries,
            // Always the entries still to review (stamped ones not counted), also with includeReviewed.
            counts: { check: open.check.length, muted: open.muted.length, refused: open.refused.length },
            truncated: w.truncated,
        };
    }

    /**
     * The operator's stamp on exactly the proofs a card showed (POST chat/:chatId/actions). The state change itself
     * (mark fake, unblock) stays on its own endpoint, called first by tg-chats. A proof that arrived after the card
     * loaded is not in proofIds, so it stays unreviewed.
     */
    async stampChat(chatId: string, body: { decision?: unknown; proofIds?: unknown }, now = new Date()): Promise<{ chatId: string; decision: ReviewDecision; stamped: number }> {
        const id = String(chatId ?? '').trim();
        if (!/^-?\d{1,20}$/.test(id)) throw new BadRequestException('chatId must be a chatId');
        const decision = body?.decision as ReviewDecision;
        if (!REVIEW_DECISIONS.includes(decision) || decision === 'past') throw new BadRequestException('decision must be fine|fake|unblocked');
        const ids = body?.proofIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > MAX_STAMP_IDS) throw new BadRequestException(`proofIds: 1 to ${MAX_STAMP_IDS} proof ids`);
        const keys = ids.map((p) => parseProofId(p));
        if (keys.some((k) => k?.chatId !== id)) throw new BadRequestException('proofIds must be proof ids of this chat');
        // (chatId, clientId, telegramMsgId) identifies old (no proofId) and new rows alike; chatId leads chatId_1_createdAt_-1.
        const filter = { chatId: id, $or: keys.map((k) => ({ clientId: k!.clientId, telegramMsgId: k!.telegramMsgId })) };
        const review: ProofReview = { decision, at: now };
        const res = await this.proofModel.updateMany(filter, { $set: { review } }).exec();
        if (!res.matchedCount) throw new NotFoundException('no such proof of this chat (gone after the 7-day TTL?)');
        await this.patchWindows(`stamp chat ${id}`, () => this.rereadChat(id));
        return { chatId: id, decision, stamped: res.matchedCount };
    }

    /**
     * "Not fake" on a payment-check fraud block: closes every open fraud ask of the chat. tg-aut treats only
     * ask.state 'open' as a live warning / block (proof-gate decide.ts, calls video-policy fraudBlockOn), so the ask
     * is resolved the way a credit resolves it, plus closedAt / closedBy for the audit. Idempotent.
     */
    async closeFraudAsks(chatId: string, by: string, now = new Date()): Promise<{ proofIds: string[]; blocked: number }> {
        const filter = { chatId, 'ask.kind': 'fraud', 'ask.state': 'open' };
        const open = await this.proofModel.find(filter, CLASSIFY_PROJECTION).lean<PaymentProofRow[]>().exec();
        if (!open.length) return { proofIds: [], blocked: 0 };
        await this.proofModel.updateMany(
            { _id: { $in: open.map((r) => r._id) }, 'ask.state': 'open' },
            { $set: { 'ask.state': 'resolved', 'ask.resolvedAt': now, 'ask.closedAt': now, 'ask.closedBy': by } },
        ).exec();
        await this.patchWindows(`close fraud asks ${chatId}`, () => this.rereadChat(chatId));
        return { proofIds: open.map((r) => proofIdOf(r)), blocked: open.filter((r) => !!r.ask?.blockedAt).length };
    }

    /** Patch for patchWindows: replace the chat's rows with a fresh read. */
    private async rereadChat(chatId: string): Promise<(w: WindowData) => WindowData | null> {
        const fresh = new Map((await this.proofModel.find({ chatId }, CLASSIFY_PROJECTION).lean<PaymentProofRow[]>().exec())
            .map((r) => [String(r._id), r]));
        return (w) => {
            let hit = false;
            const rows = w.rows.map((r) => { const f = fresh.get(String(r._id)); if (f) hit = true; return f ?? r; });
            return hit ? this.derive({ ...w, rows }) : null;
        };
    }
}
