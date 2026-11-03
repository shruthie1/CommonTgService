import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from '../user-data/schemas/user-data.schema';
import { PAYMENT_PROOF_MODEL, PaymentProofRow, ProofReview } from './schemas/payment-proof.schema';
import {
    ClassifiedProof, PROOF_STATES, ProofCounts, ProofState, addToCounts, classify, decodeCursor, emptyCounts,
    encodeCursor, inState, isAfterCursor, parseProofId,
} from './payment-proofs.classify';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
/** The TTL is 7 days, so this is the whole collection by default. */
export const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Rows read per list call (counts need the whole filtered window). Prod 2026-11-03: 1,756 rows in total at ~617 B,
 * so one call reads ~1 MB; the cap only guards against a runaway collection and sets `truncated`.
 */
export const MAX_WINDOW_ROWS = 20_000;
const USERDATA_IN_CHUNK = 1_000;
const CLIENT_HOST_TTL_MS = 5 * 60 * 1000;
const CLIENT_ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;
const MAX_BY = 60;

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
} as const;

export interface ListQuery {
    since?: string;
    client?: string;
    state?: string;
    minAmount?: string | number;
    limit?: string | number;
    cursor?: string;
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
    /** true when the window held more than MAX_WINDOW_ROWS rows (counts then cover only the newest ones). */
    truncated: boolean;
}

type ChatInfo = { profile: string; username?: string; cheatCount?: number; fakePaymentAt?: Date };

/**
 * Payments review (contract section 2). Reads `paymentProofs` (tg-aut owned) + `userData` + `clients`; writes only
 * `paymentProofs.review`. Mark fake stays POST /fake-payment/:chatId/mark.
 */
@Injectable()
export class PaymentProofsService {
    private clientHosts: { at: number; map: Map<string, string> } | null = null;

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
        let cursor = null;
        if (q.cursor !== undefined && q.cursor !== '') {
            cursor = decodeCursor(q.cursor);
            if (!cursor) throw new BadRequestException('invalid cursor');
        }
        return { since, client, state, minAmount, limit, cursor };
    }

    async list(q: ListQuery, now = Date.now()): Promise<ListResult> {
        const p = this.parseQuery(q, now);
        const filter: Record<string, unknown> = { createdAt: { $gte: new Date(p.since) } };
        if (p.client) filter.clientId = p.client;
        // createdAt range on tg-aut's TTL index createdAt_ttl; no new index (prod 2026-11-03: 1,756 keys/docs, 6 ms).
        const rows = await this.proofModel
            .find(filter, CLASSIFY_PROJECTION)
            .sort({ createdAt: -1, _id: -1 })
            .limit(MAX_WINDOW_ROWS + 1)
            .lean<PaymentProofRow[]>()
            .exec();
        const truncated = rows.length > MAX_WINDOW_ROWS;
        if (truncated) rows.length = MAX_WINDOW_ROWS;

        const classified: { row: PaymentProofRow; c: ClassifiedProof }[] = [];
        for (const row of rows) {
            const c = classify(row);
            if (p.minAmount !== null && (c.amount === null || c.amount < p.minAmount)) continue;
            classified.push({ row, c });
        }

        const chats = await this.chatInfo([...new Set(classified.map((x) => String(x.row.chatId)))]);
        const counts = emptyCounts();
        const page: { row: PaymentProofRow; c: ClassifiedProof; marked: boolean }[] = [];
        let more = false;
        for (const x of classified) {
            const marked = !!chats.get(String(x.row.chatId))?.marked;
            addToCounts(counts, x.c, marked);
            if (more || !inState(x.c, marked, p.state)) continue;
            const t = new Date(x.row.createdAt).getTime();
            if (p.cursor && !isAfterCursor(t, String(x.row._id), p.cursor)) continue;
            if (page.length < p.limit) page.push({ ...x, marked });
            else more = true;
        }

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
                persona: ud?.profile ?? row.profile,
                username: ud?.username || null,
                complaintScore: typeof ud?.cheatCount === 'number' ? ud.cheatCount : null,
                fakePaymentAt: chat?.fakePaymentAt ?? null,
                clientHost: hosts.get(String(row.clientId)) ?? null,
            } as ProofItem;
        });
        const last = page[page.length - 1];
        const nextCursor = more && last
            ? encodeCursor({ t: new Date(last.row.createdAt).getTime(), id: String(last.row._id) })
            : null;
        return { items, nextCursor, counts, truncated };
    }

    /** userData rows of the chats (index chatId_Profile): per-persona info + chat-level fake mark. */
    private async chatInfo(chatIds: string[]) {
        const out = new Map<string, { rows: Map<string, ChatInfo>; marked: boolean; fakePaymentAt: Date | null }>();
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
        return { proofId, review };
    }
}
