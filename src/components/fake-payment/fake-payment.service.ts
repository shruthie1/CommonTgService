import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserData, UserDataDocument } from '../user-data/schemas/user-data.schema';
import { AnalyticsPgError, AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { ChannelCategory } from '../bots/channel-category.enum';
import { getBotsServiceInstance } from '../../utils';

/**
 * Operator fake-payment mark (owner decision 2026-11-02; tg-platform docs/design/2026-11-02-fake-payment-flag.md).
 *
 * If ANY payment of a chatId (any persona, any client) is marked fake, NONE of that user's payments count as revenue,
 * the user is blocked and owed nothing. The mark is chat level and lives on existing records (no new table/collection):
 *   - Mongo userData (source of truth for tg-aut): fakePaymentAt / fakePaymentBy / fakePaymentReason on EVERY row of
 *     the chatId, the row's payAmount / canReply saved in fakePaymentPrev (so the unmark can restore them), then
 *     payAmount 0 and canReply 0. tg-aut (payments/fake-payer.ts) credits nothing and places no call while any row
 *     carries fakePaymentAt.
 *   - Postgres (revenue): payment_event.is_fake on the chat's rows, via fake_payment_mark(chat) /
 *     fake_payment_unmark(chat) from tg-platform/analytics/upgrade-2026-11-02-fake-payment.sql. The
 *     payment_event_owner view zeroes owner_amount for every payment of a chat with any is_fake row; the functions
 *     also take the chat's payers out of (and back into) daily_client/daily_mobile.
 *
 * userData.cheatCount (the complaint score) is never read or written here.
 *
 * Order: Mongo first (it stops tg-aut at once), then Postgres. Both halves are idempotent, so a failure in the second
 * is reported (HTTP 502 with what was done) and the operator simply repeats the same action.
 *
 * Why CMS owns this write (not tg-aut): tg-aut's only Postgres path is the append-only, batched, spooled analytics
 * sink (no synchronous transactional UPDATE that can report failure to the operator) and tg-aut runs per client;
 * CMS is one process that already holds both the userData model and the analytics Postgres pool.
 */
export const CHAT_ID_RE = /^-?\d{3,20}$/;
const MAX_REASON = 300;
const MAX_BY = 60;

export interface FakePaymentPgMark {
    /** payment rows flagged by THIS call (0 on a repeat). */
    marked_now: number;
    payments: number;
    amount_marked: number;
    payer_days: number;
    payer_days_skipped: number;
}

export interface FakePaymentPgUnmark {
    unmarked_now: number;
    amount_restored: number;
    payer_days: number;
}

type Row = Pick<UserData, 'chatId' | 'profile' | 'clientId' | 'payAmount' | 'highestPayAmount' | 'canReply' | 'cheatCount' | 'fakePaymentAt' | 'fakePaymentBy' | 'fakePaymentReason' | 'fakePaymentPrev'> & { _id: unknown };

const ROW_PROJECTION = { chatId: 1, profile: 1, clientId: 1, payAmount: 1, highestPayAmount: 1, canReply: 1, cheatCount: 1, fakePaymentAt: 1, fakePaymentBy: 1, fakePaymentReason: 1, fakePaymentPrev: 1 };

function clean(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function pgMessage(err: AnalyticsPgError | undefined): string {
    if (!err) return 'unknown error';
    return err.code ? `${err.message} (${err.code})` : err.message;
}

@Injectable()
export class FakePaymentService {
    private readonly logger = new Logger(FakePaymentService.name);

    constructor(
        @InjectModel(UserData.name) private readonly userDataModel: Model<UserDataDocument>,
        private readonly pg: AnalyticsPgReader,
    ) {}

    private chatIdOrThrow(chatId: unknown): string {
        const id = typeof chatId === 'string' ? chatId.trim() : '';
        if (!CHAT_ID_RE.test(id)) throw new BadRequestException('chatId must be a numeric Telegram chat id');
        return id;
    }

    private async rows(chatId: string): Promise<Row[]> {
        return this.userDataModel.find({ chatId }, ROW_PROJECTION).lean<Row[]>().exec();
    }

    private async pgCall<T>(sql: string, params: unknown[]): Promise<{ row?: T; error?: string }> {
        let failure: AnalyticsPgError | undefined;
        const rows = await this.pg.query<T>(sql, params, (e) => { failure = e; });
        if (!rows) return { error: pgMessage(failure) };
        return { row: rows[0] };
    }

    /** Current mark state in both stores (read-only). Postgres trouble is reported in `postgres.error`, never thrown. */
    async status(rawChatId: string) {
        const chatId = this.chatIdOrThrow(rawChatId);
        const rows = await this.rows(chatId);
        const pay = await this.pgCall<{ payments: number; amount: number; fake_payments: number; owner_amount: number }>(
            `SELECT count(*)::int AS payments, coalesce(sum(o.amount), 0)::bigint AS amount,
                    count(*) FILTER (WHERE p.is_fake)::int AS fake_payments,
                    coalesce(sum(o.owner_amount), 0)::bigint AS owner_amount
               FROM payment_event_owner o JOIN payment_event p ON p.id = o.id
              WHERE o.chat_id = $1`,
            [chatId],
        );
        const markedRows = rows.filter((r) => r.fakePaymentAt != null);
        const fakePayments = pay.row ? Number(pay.row.fake_payments) : 0;
        return {
            chatId,
            marked: markedRows.length > 0 || fakePayments > 0,
            mongo: {
                rows: rows.length,
                markedRows: markedRows.length,
                personas: rows.map((r) => ({
                    profile: r.profile,
                    clientId: r.clientId ?? null,
                    payAmount: r.payAmount,
                    canReply: r.canReply,
                    cheatCount: r.cheatCount,
                    fakePaymentAt: r.fakePaymentAt ?? null,
                    fakePaymentBy: r.fakePaymentBy ?? null,
                    fakePaymentReason: r.fakePaymentReason ?? null,
                })),
            },
            postgres: {
                error: pay.error ?? null,
                payments: pay.row
                    ? {
                        payments: Number(pay.row.payments),
                        amount: Number(pay.row.amount),
                        fakePayments,
                        ownerAmount: Number(pay.row.owner_amount),
                    }
                    : null,
            },
        };
    }

    /** Mark every row of the chat fake (Mongo), then Postgres. Idempotent. */
    async mark(rawChatId: string, body: { by?: unknown; reason?: unknown } = {}) {
        const chatId = this.chatIdOrThrow(rawChatId);
        const by = clean(body.by, MAX_BY);
        const reason = clean(body.reason, MAX_REASON);
        if (!by) throw new BadRequestException('by (operator name) is required');
        if (!reason) throw new BadRequestException('reason is required');

        const rows = await this.rows(chatId);
        const now = new Date();
        const ops = rows.map((r) => r.fakePaymentAt == null
            ? {
                updateOne: {
                    filter: { _id: r._id, fakePaymentAt: null },
                    update: {
                        $set: {
                            fakePaymentAt: now,
                            fakePaymentBy: by,
                            fakePaymentReason: reason,
                            fakePaymentPrev: { payAmount: r.payAmount ?? 0, canReply: r.canReply ?? 1 },
                            payAmount: 0,
                            canReply: 0,
                        },
                    },
                },
            }
            // Already marked (a re-mark, e.g. after someone set canReply back by hand): block again, keep the
            // original fakePaymentPrev / fakePaymentAt so the unmark still restores the pre-mark values.
            : { updateOne: { filter: { _id: r._id }, update: { $set: { payAmount: 0, canReply: 0 } } } });
        const newlyMarked = rows.filter((r) => r.fakePaymentAt == null).length;
        if (ops.length) await this.userDataModel.bulkWrite(ops as any, { ordered: true });
        const mongo = { rows: rows.length, newlyMarked };

        const pg = await this.pgCall<FakePaymentPgMark>('SELECT * FROM fake_payment_mark($1)', [chatId]);
        if (!pg.row) {
            this.logger.error(`fake-payment mark ${chatId}: Mongo marked ${newlyMarked}/${rows.length} rows, Postgres failed: ${pg.error}`);
            this.notify('error', 'Fake payment mark: Postgres FAILED (repeat the mark)', chatId, by, reason, [
                { label: 'Mongo rows marked', value: `${newlyMarked}/${rows.length}` },
                { label: 'Postgres error', value: String(pg.error) },
            ]);
            throw new HttpException(
                { message: 'Mongo marked; Postgres failed, revenue not yet excluded. Repeat the mark.', chatId, mongo, postgresError: pg.error },
                HttpStatus.BAD_GATEWAY,
            );
        }
        const postgres = {
            markedNow: Number(pg.row.marked_now),
            payments: Number(pg.row.payments),
            amountMarked: Number(pg.row.amount_marked),
            payerDays: Number(pg.row.payer_days),
            payerDaysSkipped: Number(pg.row.payer_days_skipped),
        };
        this.logger.warn(`fake-payment mark ${chatId} by ${by}: mongo ${newlyMarked}/${rows.length}, pg ${JSON.stringify(postgres)}`);
        this.notify('warning', 'Payment marked fake', chatId, by, reason, [
            { label: 'Persona rows', value: `${newlyMarked} newly marked of ${rows.length}` },
            { label: 'Payments excluded', value: postgres.payments ? `${postgres.payments} (₹${postgres.amountMarked} newly)` : 'none in Postgres (no payment_event rows for this chat)' },
            { label: 'Payer-days taken back', value: `${postgres.payerDays} (skipped ${postgres.payerDaysSkipped})` },
        ]);
        return { chatId, marked: true, mongo, postgres };
    }

    /** Remove the mark: restore each row's untouched payAmount / canReply from fakePaymentPrev, then Postgres. Idempotent. */
    async unmark(rawChatId: string, body: { by?: unknown; reason?: unknown } = {}) {
        const chatId = this.chatIdOrThrow(rawChatId);
        const by = clean(body.by, MAX_BY);
        const reason = clean(body.reason, MAX_REASON);
        if (!by) throw new BadRequestException('by (operator name) is required');

        const rows = (await this.rows(chatId)).filter((r) => r.fakePaymentAt != null);
        const ops = rows.map((r) => {
            // Restore a pre-mark value only where the row still holds what the mark wrote (canReply 0 / payAmount 0):
            // a hand unblock or a credit made while marked is kept, never overwritten by the stale pre-mark value.
            // payAmount never comes back above the row's current highestPayAmount. (A block written as canReply 0
            // while marked cannot be told apart from the mark's own 0; see design doc L10.)
            const prev = r.fakePaymentPrev ?? {};
            const restore: Record<string, number> = {};
            if (typeof prev.payAmount === 'number' && r.payAmount === 0) {
                const peak = r.highestPayAmount;
                restore.payAmount = typeof peak === 'number' ? Math.min(prev.payAmount, peak) : prev.payAmount;
            }
            if (typeof prev.canReply === 'number' && r.canReply === 0) restore.canReply = prev.canReply;
            return {
                updateOne: {
                    filter: { _id: r._id },
                    update: {
                        ...(Object.keys(restore).length ? { $set: restore } : {}),
                        $unset: { fakePaymentAt: '', fakePaymentBy: '', fakePaymentReason: '', fakePaymentPrev: '' },
                    },
                },
            };
        });
        if (ops.length) await this.userDataModel.bulkWrite(ops as any, { ordered: true });
        const mongo = { rowsUnmarked: rows.length };

        const pg = await this.pgCall<FakePaymentPgUnmark>('SELECT * FROM fake_payment_unmark($1)', [chatId]);
        if (!pg.row) {
            this.logger.error(`fake-payment unmark ${chatId}: Mongo unmarked ${rows.length} rows, Postgres failed: ${pg.error}`);
            this.notify('error', 'Fake payment unmark: Postgres FAILED (repeat the unmark)', chatId, by, reason, [
                { label: 'Mongo rows unmarked', value: String(rows.length) },
                { label: 'Postgres error', value: String(pg.error) },
            ]);
            throw new HttpException(
                { message: 'Mongo unmarked; Postgres failed, revenue still excluded. Repeat the unmark.', chatId, mongo, postgresError: pg.error },
                HttpStatus.BAD_GATEWAY,
            );
        }
        const postgres = {
            unmarkedNow: Number(pg.row.unmarked_now),
            amountRestored: Number(pg.row.amount_restored),
            payerDays: Number(pg.row.payer_days),
        };
        this.logger.warn(`fake-payment unmark ${chatId} by ${by}: mongo ${rows.length}, pg ${JSON.stringify(postgres)}`);
        this.notify('info', 'Fake payment mark removed', chatId, by, reason, [
            { label: 'Persona rows restored', value: String(rows.length) },
            { label: 'Payments restored', value: `${postgres.unmarkedNow} (₹${postgres.amountRestored})` },
            { label: 'Payer-days given back', value: String(postgres.payerDays) },
        ]);
        return { chatId, marked: false, mongo, postgres };
    }

    /** Audit trail in the ops channel. Fire-and-forget: the write already happened, a failed notice must not undo it. */
    private notify(severity: 'info' | 'warning' | 'error', title: string, chatId: string, by: string, reason: string, extra: { label: string; value: string }[]): void {
        try {
            const bots = getBotsServiceInstance();
            if (!bots) return;
            void bots.sendMessageByCategory(ChannelCategory.ACCOUNT_NOTIFICATIONS, {
                severity,
                title,
                fields: [
                    { label: 'Chat', value: chatId },
                    { label: 'By', value: by },
                    ...(reason ? [{ label: 'Reason', value: reason }] : []),
                    ...extra,
                ],
            }).catch((e: unknown) => this.logger.warn(`fake-payment notice failed: ${(e as Error)?.message ?? e}`));
        } catch (e) {
            this.logger.warn(`fake-payment notice failed: ${(e as Error)?.message ?? e}`);
        }
    }
}
