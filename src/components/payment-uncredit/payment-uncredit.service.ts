import {
    BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, Optional,
    ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from '../user-data/schemas/user-data.schema';
import { AnalyticsPgError, AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { ChannelCategory } from '../bots/channel-category.enum';
import { getBotsServiceInstance } from '../../utils';
import { PaymentProofsService } from '../payment-proofs/payment-proofs.service';
import { parseProofId, proofIdOf } from '../payment-proofs/payment-proofs.classify';
import { PAYMENT_PROOF_MODEL } from '../payment-proofs/schemas/payment-proof.schema';
import { amountOf, callInProgress, planRecredit, planUncredit, UserDataUndo } from './uncredit.plan';

/**
 * Uncredit = a supported void of ONE credited payment; Recredit undoes it (owner 2026-11-08;
 * tg-platform docs/design/2026-11-08-payment-uncredit.md). Generalises the manual void of payment_event 5060.
 *
 * Stores touched, in order: Postgres payment_void (row stays, voided_at set, payer taken back only when it was the
 * key's last counted payment), stats2 day marker, the proof profile's userData row, the proof (journal + review
 * stamp 'fake'). The proof's `uncredited` field is the journal: each step records its undo before the next starts,
 * so a failure is compensated in reverse, and a retry (Uncredit forward, Recredit backward) resumes from it.
 *
 * Not touched: other personas' rows, creditKeys / servedSha (tg-aut never re-credits the message or image),
 * cheatCount, canReply, fakePayment*, videos, callProgress, the chat-level fake mark.
 */
export const UNCREDIT_REASONS = ['resent', 'fake', 'duplicate', 'other'] as const;
export type UncreditReason = (typeof UNCREDIT_REASONS)[number];
const DEFAULT_BY = 'tg-chats';
const MAX_BY = 60;
const MAX_NOTE = 300;
/** No payment_event row yet for a proof served less than this long ago: the sink may still be flushing it. */
export const PG_ROW_GRACE_MS = 60 * 60_000;
/** A pending journal younger than this belongs to a request still running. */
export const PENDING_STALE_MS = 2 * 60_000;

interface PgVoid { status: 'voided' | 'already' | 'no_row' | 'fake_marked'; payment_id: string | null; amount: number | null; day: string | null; payers_taken: boolean; payers_mobile: string | null }
interface PgUnvoid { status: 'unvoided' | 'not_voided' | 'fake_marked'; payment_id: string | null; amount: number | null; day: string | null; payers_given: boolean }

export interface PgUndo { status: PgVoid['status']; linked: boolean; paymentId: string | null; day: string | null; payersTaken: boolean }
export type Stats2Result = 'unset' | 'lowered' | 'unchanged' | 'missing';
export interface Stats2Undo { result: Stats2Result; docId?: unknown; day?: string | null; prev?: { dailyPaidCountedAt: unknown; dailyRevenueCounted: unknown }; after?: number }

export interface UncreditJournal {
    state: 'pending' | 'done' | 'failed';
    at: Date;
    by: string;
    reason: UncreditReason;
    note: string;
    amount: number;
    undo: { pg?: PgUndo; stats2?: Stats2Undo; userData?: UserDataUndo; review?: unknown };
}

type ProofRow = {
    _id: unknown; proofId?: string; chatId: string; profile: string; clientId: string; telegramMsgId: number;
    amount?: number; creditAmount?: number; servedAt?: Date; verdict?: { outcome?: string }; review?: unknown;
    uncredited?: UncreditJournal;
};

function clean(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function pgMessage(err: AnalyticsPgError | undefined): string {
    if (!err) return 'unknown error';
    return err.code ? `${err.message} (${err.code})` : err.message;
}

export function isCredited(p: Pick<ProofRow, 'verdict' | 'servedAt'>): boolean {
    const outcome = p.verdict?.outcome;
    return outcome ? outcome === 'credited' : !!p.servedAt;
}

export function creditOf(p: Pick<ProofRow, 'creditAmount' | 'amount'>): number {
    return amountOf(p.creditAmount ?? p.amount);
}

function publicPart(j: UncreditJournal) {
    return { at: j.at, by: j.by, reason: j.reason, note: j.note, amount: j.amount };
}

class StepError extends Error {
    constructor(readonly step: 'postgres' | 'stats2' | 'userData' | 'proof', message: string) { super(message); }
}

@Injectable()
export class PaymentUncreditService {
    private readonly logger = new Logger(PaymentUncreditService.name);

    constructor(
        @InjectModel(PAYMENT_PROOF_MODEL) private readonly proofModel: Model<any>,
        @InjectModel(UserData.name) private readonly userDataModel: Model<UserDataDocument>,
        private readonly pg: AnalyticsPgReader,
        @Optional() private readonly paymentProofs?: PaymentProofsService,
    ) {}

    private get proofs() { return this.proofModel.collection; }
    private get users() { return this.userDataModel.collection; }
    private get stats2() { return this.userDataModel.db.collection('stats2'); }

    private async pgCall<T>(sql: string, params: unknown[]): Promise<{ row?: T; error?: string; kind?: string }> {
        let failure: AnalyticsPgError | undefined;
        const rows = await this.pg.query<T>(sql, params, (e) => { failure = e; });
        if (!rows) return { error: pgMessage(failure), kind: failure?.kind };
        return { row: rows[0] };
    }

    private async proofOrThrow(rawProofId: string): Promise<ProofRow> {
        const key = parseProofId(rawProofId);
        if (!key) throw new BadRequestException('proofId must be <clientId>-<chatId>-<telegramMsgId>');
        const proof = await this.proofs.findOne(
            { chatId: key.chatId, clientId: key.clientId, telegramMsgId: key.telegramMsgId },
            { projection: { shadow: 0, ocr: 0, imageHash: 0 } },
        ) as ProofRow | null;
        if (!proof) throw new NotFoundException('no such proof (gone after the 7-day TTL?)');
        return proof;
    }

    private async setJournal(id: unknown, set: Record<string, unknown>): Promise<void> {
        await this.proofs.updateOne({ _id: id as any }, { $set: set });
    }

    private async unsetJournal(id: unknown, keys: string[]): Promise<void> {
        await this.proofs.updateOne({ _id: id as any }, { $unset: Object.fromEntries(keys.map((k) => [k, ''])) });
    }

    private async chatMarked(chatId: string): Promise<boolean> {
        return !!(await this.users.findOne({ chatId, fakePaymentAt: { $ne: null } }, { projection: { _id: 1 } }));
    }

    async uncredit(rawProofId: string, body: { reason?: unknown; note?: unknown; by?: unknown; force?: unknown } = {}, nowMs = Date.now()) {
        const reason = clean(body.reason, 20) as UncreditReason;
        if (!UNCREDIT_REASONS.includes(reason)) throw new BadRequestException(`reason must be ${UNCREDIT_REASONS.join('|')}`);
        const note = clean(body.note, MAX_NOTE);
        if (reason === 'other' && !note) throw new BadRequestException("reason 'other' needs a note");
        const by = clean(body.by, MAX_BY) || DEFAULT_BY;
        const force = body.force === true;

        const proof = await this.proofOrThrow(rawProofId);
        const proofId = proofIdOf(proof);
        const A = creditOf(proof);
        if (!isCredited(proof) || !A || !proof.servedAt) throw new BadRequestException('this proof was not credited');
        if (proof.uncredited?.state === 'done') return { proofId, changed: false, uncredited: publicPart(proof.uncredited), ...this.answerOf(proof.uncredited) };
        if (proof.uncredited?.state === 'pending' && nowMs - new Date(proof.uncredited.at).getTime() < PENDING_STALE_MS) {
            throw new ConflictException({ code: 'uncredit_in_progress', message: 'another Uncredit of this payment is running' });
        }
        if (!this.pg.isEnabled()) throw new ServiceUnavailableException('analytics Postgres is not configured (ANALYTICS_DB_URL)');
        if (await this.chatMarked(proof.chatId)) {
            throw new ConflictException({ code: 'fake_marked', message: 'the chat is marked fake: no payment of it counts already' });
        }
        const user = await this.users.findOne({ chatId: proof.chatId, profile: proof.profile }) as Record<string, any> | null;
        const live = !!user && callInProgress(user.callProgress, nowMs);
        if (live && !force) throw new ConflictException({ code: 'call_in_progress', message: 'a show is running for this payment; Uncredit anyway treats it as delivered' });

        // Claim (or resume an earlier attempt that died: its journal says what is already done).
        let journal: UncreditJournal;
        if (proof.uncredited) {
            journal = proof.uncredited;
            journal.at = new Date(nowMs);
            await this.setJournal(proof._id, { 'uncredited.state': 'pending', 'uncredited.at': new Date(nowMs) });
        } else {
            journal = { state: 'pending', at: new Date(nowMs), by, reason, note, amount: A, undo: { review: proof.review ?? null } };
            const claim = await this.proofs.updateOne({ _id: proof._id as any, uncredited: { $exists: false } }, { $set: { uncredited: journal } });
            if (!claim.modifiedCount) throw new ConflictException({ code: 'uncredit_in_progress', message: 'another Uncredit of this payment is running' });
        }

        let failedAt: StepError['step'] | null = null;
        let failure = '';
        try {
            // 3. Postgres (one statement, atomic).
            if (!journal.undo.pg) {
                const voidReason = note ? `${reason}: ${note}` : reason;
                const pg = await this.pgCall<PgVoid>(
                    `SELECT status, payment_id::text AS payment_id, amount, day::text AS day, payers_taken, payers_mobile
                       FROM payment_void($1, $2, $3, $4, $5::integer, $6::timestamptz, $7, $8)`,
                    [proofId, proof.chatId, proof.clientId, proof.profile, A, new Date(proof.servedAt).toISOString(), voidReason, by],
                );
                if (!pg.row) throw new StepError('postgres', pg.error ?? 'no row');
                if (pg.row.status === 'fake_marked') {
                    await this.release(proof._id, journal);
                    throw new ConflictException({ code: 'fake_marked', message: 'the chat is marked fake in Postgres: no payment of it counts already' });
                }
                if (pg.row.status === 'no_row' && nowMs - new Date(proof.servedAt).getTime() < PG_ROW_GRACE_MS) {
                    await this.release(proof._id, journal);
                    throw new ConflictException({ code: 'pg_row_pending', message: 'the payment is not in Postgres yet (sink flush); try again in a few minutes' });
                }
                journal.undo.pg = {
                    status: pg.row.status, linked: pg.row.status !== 'no_row', paymentId: pg.row.payment_id,
                    day: pg.row.day, payersTaken: !!pg.row.payers_taken,
                };
                await this.setJournal(proof._id, { 'uncredited.undo.pg': journal.undo.pg });
            }
            // 4. stats2 day marker.
            if (!journal.undo.stats2) {
                journal.undo.stats2 = await this.stats2Void(proof, journal.undo.pg, A).catch((e) => { throw new StepError('stats2', (e as Error).message); });
                await this.setJournal(proof._id, { 'uncredited.undo.stats2': journal.undo.stats2 });
            }
            // 5. userData (the proof's profile row only).
            if (!journal.undo.userData) {
                journal.undo.userData = await this.userDataVoid(proof, A, live && force).catch((e) => { throw new StepError('userData', (e as Error).message); });
                await this.setJournal(proof._id, { 'uncredited.undo.userData': journal.undo.userData });
            }
            // 6. proof: done + review stamp 'fake'.
            const done = await this.proofs.updateOne(
                { _id: proof._id as any, 'uncredited.state': 'pending' },
                { $set: { 'uncredited.state': 'done', review: { decision: 'fake', at: new Date(nowMs) } } },
            ).catch((e) => { throw new StepError('proof', (e as Error).message); });
            if (!done.matchedCount) throw new StepError('proof', 'journal changed during the uncredit');
            journal.state = 'done';
        } catch (err) {
            if (!(err instanceof StepError)) throw err;
            failedAt = err.step;
            failure = err.message;
        }

        if (failedAt) {
            this.logger.error(`uncredit ${proofId}: ${failedAt} failed: ${failure}; compensating`);
            let compensated = false;
            try {
                await this.undoSteps(proof._id, journal, proof.chatId, proofId);
                await this.release(proof._id, journal);
                compensated = true;
            } catch (e) {
                this.logger.error(`uncredit ${proofId}: compensation failed: ${(e as Error)?.message ?? e}`);
                await this.setJournal(proof._id, { 'uncredited.state': 'failed' }).catch(() => undefined);
            }
            await this.cacheChanged(proof.chatId);
            this.notify('error', `Uncredit FAILED at ${failedAt}${compensated ? ' (undone)' : ' (NOT undone: repeat Uncredit or Recredit)'}`, proof, by, [
                { label: 'Error', value: failure },
            ]);
            throw new HttpException(
                { code: 'step_failed', message: `Uncredit failed at ${failedAt}: ${failure}`, failedAt, compensated, proofId },
                HttpStatus.BAD_GATEWAY,
            );
        }

        await this.cacheChanged(proof.chatId);
        const answer = this.answerOf(journal);
        this.logger.warn(`uncredit ${proofId} by ${by} (${reason}) ₹${A}: ${JSON.stringify(answer)}`);
        this.notify('warning', `Payment uncredited (₹${A})`, proof, by, [
            { label: 'Reason', value: note ? `${reason}: ${note}` : reason },
            { label: 'Postgres', value: `${answer.postgres.status}${answer.postgres.payersTaken ? ', payer taken back' : ''}` },
            { label: 'userData', value: answer.userData.status },
        ]);
        return { proofId, changed: true, uncredited: publicPart(journal), ...answer };
    }

    async recredit(rawProofId: string, body: { by?: unknown } = {}, nowMs = Date.now()) {
        const by = clean(body.by, MAX_BY) || DEFAULT_BY;
        const proof = await this.proofOrThrow(rawProofId);
        const proofId = proofIdOf(proof);
        const journal = proof.uncredited;
        if (!journal) return { proofId, changed: false };
        if (journal.state === 'pending' && nowMs - new Date(journal.at).getTime() < PENDING_STALE_MS) {
            throw new ConflictException({ code: 'uncredit_in_progress', message: 'an Uncredit of this payment is running' });
        }
        if (journal.undo.pg?.linked && !this.pg.isEnabled()) throw new ServiceUnavailableException('analytics Postgres is not configured (ANALYTICS_DB_URL)');
        if (await this.chatMarked(proof.chatId)) {
            throw new ConflictException({ code: 'fake_marked', message: 'the chat is marked fake: unmark it first' });
        }
        const before = { pg: journal.undo.pg, stats2: journal.undo.stats2, userData: journal.undo.userData };
        let userData: { status: string; restored: string[]; skipped: string[] } = { status: before.userData?.status ?? 'none', restored: [], skipped: [] };
        let stats2: string = 'unchanged';
        let postgres: Record<string, unknown> = { status: before.pg ? 'skipped' : 'none' };
        try {
            const r = await this.undoSteps(proof._id, journal, proof.chatId, proofId);
            userData = r.userData ?? userData;
            stats2 = r.stats2 ?? stats2;
            postgres = r.postgres ?? postgres;
        } catch (err) {
            if (err instanceof HttpException) throw err;
            this.logger.error(`recredit ${proofId}: ${(err as Error)?.message ?? err}`);
            await this.paymentProofs?.chatChanged(proof.chatId);
            throw new HttpException({ code: 'step_failed', message: `Recredit failed: ${(err as Error)?.message ?? err}; repeat Recredit`, proofId }, HttpStatus.BAD_GATEWAY);
        }
        const review = journal.undo.review;
        await this.proofs.updateOne({ _id: proof._id as any }, {
            $unset: { uncredited: '', ...(review ? {} : { review: '' }) },
            ...(review ? { $set: { review } } : {}),
            $push: { uncreditHistory: { ...publicPart(journal), recreditedAt: new Date(nowMs), recreditedBy: by } },
        } as any);
        await this.cacheChanged(proof.chatId);
        this.logger.warn(`recredit ${proofId} by ${by}: userData ${JSON.stringify(userData)}, stats2 ${stats2}, pg ${JSON.stringify(postgres)}`);
        this.notify('info', `Payment recredited (₹${journal.amount})`, proof, by, [
            { label: 'Postgres', value: String(postgres.status) },
            { label: 'userData', value: `${userData.status}${userData.skipped.length ? `, kept ${userData.skipped.join(', ')}` : ''}` },
        ]);
        return { proofId, changed: true, postgres, stats2, userData };
    }

    private answerOf(j: UncreditJournal) {
        const pg = j.undo.pg;
        const ud = j.undo.userData;
        return {
            postgres: { status: pg?.status ?? null, paymentId: pg?.paymentId ?? null, linked: !!pg?.linked, payersTaken: !!pg?.payersTaken, day: pg?.day ?? null },
            stats2: j.undo.stats2?.result ?? 'unchanged',
            userData: { status: ud?.status ?? 'unchanged', set: ud?.after ?? {}, inc: ud?.inc ?? {} },
        };
    }

    /** Drop the claim (nothing of the uncredit remains). */
    private async release(id: unknown, journal: UncreditJournal): Promise<void> {
        await this.proofs.updateOne({ _id: id as any, 'uncredited.at': journal.at } as any, { $unset: { uncredited: '' } });
    }

    private async cacheChanged(chatId: string): Promise<void> {
        await this.paymentProofs?.chatChanged(chatId);
        await this.paymentProofs?.proofsChanged(chatId);
    }

    /** stats2 rules (design section 6): D = the voided row's IST day. */
    private async stats2Void(proof: ProofRow, pg: PgUndo | undefined, A: number): Promise<Stats2Undo> {
        const doc = await this.stats2.findOne({ chatId: proof.chatId, profile: proof.profile, client: proof.clientId }) as Record<string, any> | null;
        if (!doc) return { result: 'missing' };
        const day = pg?.linked ? pg.day : null;
        if (!day || doc.dailyPaidCountedAt !== day) return { result: 'unchanged' };
        const prev = { dailyPaidCountedAt: doc.dailyPaidCountedAt, dailyRevenueCounted: doc.dailyRevenueCounted ?? null };
        const guard = { _id: doc._id, dailyPaidCountedAt: day, dailyRevenueCounted: prev.dailyRevenueCounted };
        if (pg!.payersTaken) {
            const r = await this.stats2.updateOne(guard, { $unset: { dailyPaidCountedAt: '', dailyRevenueCounted: '' } });
            if (!r.matchedCount) throw new Error('stats2 changed during the uncredit');
            return { result: 'unset', docId: doc._id, day, prev };
        }
        const after = Math.max(0, amountOf(prev.dailyRevenueCounted) - A);
        const r = await this.stats2.updateOne(guard, { $set: { dailyRevenueCounted: after } });
        if (!r.matchedCount) throw new Error('stats2 changed during the uncredit');
        return { result: 'lowered', docId: doc._id, day, prev, after };
    }

    private async userDataVoid(proof: ProofRow, A: number, forceDelivered: boolean): Promise<UserDataUndo> {
        const row = await this.users.findOne({ chatId: proof.chatId, profile: proof.profile }) as Record<string, any> | null;
        if (!row) return { status: 'missing' };
        const others = (await this.proofs.find(
            { chatId: proof.chatId, profile: proof.profile, clientId: proof.clientId, _id: { $ne: proof._id as any } },
            { projection: { amount: 1, creditAmount: 1, servedAt: 1, 'verdict.outcome': 1, 'uncredited.state': 1 } },
        ).toArray() as ProofRow[])
            .filter((p) => isCredited(p) && !p.uncredited)
            .map(creditOf);
        const plan = planUncredit(row, { amount: A, servedAtMs: new Date(proof.servedAt!).getTime(), others, forceDelivered });
        if (plan.undo.status === 'unchanged') return plan.undo;
        const update: Record<string, unknown> = {};
        if (Object.keys(plan.set).length) update.$set = plan.set;
        if (Object.keys(plan.inc).length) update.$inc = plan.inc;
        const r = await this.users.updateOne({ _id: row._id, ...plan.guard }, update);
        if (!r.matchedCount) throw new Error('userData changed during the uncredit');
        return plan.undo;
    }

    /**
     * Undo what the journal holds, newest first (userData, stats2, Postgres), $unset-ing each journal key right after
     * its step so a retry resumes where it stopped. Shared by Recredit and the Uncredit compensation.
     */
    private async undoSteps(id: unknown, journal: UncreditJournal, chatId: string, proofId: string) {
        const out: { userData?: { status: string; restored: string[]; skipped: string[] }; stats2?: string; postgres?: Record<string, unknown> } = {};
        const ud = journal.undo.userData;
        if (ud) {
            if (ud.status === 'applied') {
                const row = await this.users.findOne({ _id: ud.rowId as any }) as Record<string, any> | null;
                if (row) {
                    const plan = planRecredit(row, ud);
                    if (Object.keys(plan.update).length) {
                        const r = await this.users.updateOne(plan.filter, plan.update);
                        if (!r.matchedCount) throw new Error('userData changed during the recredit; repeat');
                    }
                    out.userData = { status: 'restored', restored: plan.restored, skipped: plan.skipped };
                } else {
                    out.userData = { status: 'missing', restored: [], skipped: [] };
                }
            } else {
                out.userData = { status: ud.status, restored: [], skipped: [] };
            }
            await this.unsetJournal(id, ['uncredited.undo.userData']);
            delete journal.undo.userData;
        }
        const st = journal.undo.stats2;
        if (st) {
            out.stats2 = 'unchanged';
            if (st.result === 'unset' && st.prev) {
                // Only while the marker is still unset: a genuine payment after the void already counted the day.
                const r = await this.stats2.updateOne({ _id: st.docId as any, dailyPaidCountedAt: { $exists: false } }, { $set: st.prev });
                out.stats2 = r.matchedCount ? 'restored' : 'kept';
            } else if (st.result === 'lowered' && st.prev) {
                const r = await this.stats2.updateOne(
                    { _id: st.docId as any, dailyPaidCountedAt: st.day, dailyRevenueCounted: st.after },
                    { $set: { dailyRevenueCounted: st.prev.dailyRevenueCounted } },
                );
                out.stats2 = r.matchedCount ? 'restored' : 'kept';
            }
            await this.unsetJournal(id, ['uncredited.undo.stats2']);
            delete journal.undo.stats2;
        }
        const pg = journal.undo.pg;
        if (pg) {
            if (pg.linked) {
                const r = await this.pgCall<PgUnvoid>(
                    `SELECT status, payment_id::text AS payment_id, amount, day::text AS day, payers_given FROM payment_unvoid($1, $2)`,
                    [proofId, chatId],
                );
                if (!r.row) throw new Error(`Postgres: ${r.error}`);
                if (r.row.status === 'fake_marked') {
                    throw new ConflictException({ code: 'fake_marked', message: 'the chat is marked fake in Postgres: unmark it, then Recredit again' });
                }
                out.postgres = { status: r.row.status, paymentId: r.row.payment_id, payersGiven: !!r.row.payers_given, day: r.row.day };
            } else {
                out.postgres = { status: 'not_linked' };
            }
            await this.unsetJournal(id, ['uncredited.undo.pg']);
            delete journal.undo.pg;
        }
        return out;
    }

    /** Audit trail in the ops channel. Fire-and-forget. */
    private notify(severity: 'info' | 'warning' | 'error', title: string, proof: ProofRow, by: string, extra: { label: string; value: string }[]): void {
        try {
            const bots = getBotsServiceInstance();
            if (!bots) return;
            void bots.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, {
                severity,
                title,
                fields: [
                    { label: 'Chat', value: proof.chatId },
                    { label: 'Client / persona', value: `${proof.clientId} / ${proof.profile}` },
                    { label: 'Proof', value: proofIdOf(proof) },
                    { label: 'By', value: by },
                    ...extra,
                ],
            }).catch((e: unknown) => this.logger.warn(`uncredit notice failed: ${(e as Error)?.message ?? e}`));
        } catch (e) {
            this.logger.warn(`uncredit notice failed: ${(e as Error)?.message ?? e}`);
        }
    }
}
