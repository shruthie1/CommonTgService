import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ChannelCategory } from '../bots/channel-category.enum';
import { tryGetBotsServiceInstance } from '../../utils/bot.service.instance';
import type { RichNotificationInput } from '../../utils/rich-message';
import { AnalyticsPgError, AnalyticsPgReader } from '../daily-analytics/analytics-pg.reader';
import { withTimeout } from '../monitor/monitor-util';
import { DOUBLE_CREDIT_PROJECTION, DOUBLE_CREDIT_WINDOW_MS } from '../payment-proofs/payment-proofs.double-credit';
import { PAYMENT_PROOF_MODEL } from '../payment-proofs/schemas/payment-proof.schema';
import {
    HealthProof, MATCH_WINDOW_MS, PaymentHealthReport, PgPaymentRow, ProcessBuild, buildReport, formatReport, istDay, istDayRange,
} from './payment-health.report';

/** Same ops channel as tg-aut's "User warned" / "Fake pay blocked" cards (tg-aut outbound/chat-notice.ts). */
export const PAYMENT_HEALTH_CATEGORY = ChannelCategory.CLIENT_UPDATES;
/** Read on every run; default ON, '0'/'false'/'no'/'off' = OFF (the computation still runs on GET /payment-health/report). */
export const PAYMENT_HEALTH_FLAG = 'PAYMENT_HEALTH_REPORT_ENABLED';
export const PAYMENT_HEALTH_REDIS = 'PAYMENT_HEALTH_REDIS';
const HEARTBEAT_INDEX_KEY = 'heartbeat::index';
/** A heartbeat older than this is a dead process (the key TTL is 10 min). */
const HEARTBEAT_FRESH_MS = 10 * 60 * 1000;
const REDIS_DEADLINE_MS = 3_000;
const MONGO_TIMEOUT_MS = 30_000;

export interface PaymentHealthRedis {
    smembers(key: string): Promise<string[]>;
    mget(keys: string[]): Promise<Array<string | null>>;
}

export function paymentHealthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const v = env[PAYMENT_HEALTH_FLAG];
    if (v === undefined || v.trim() === '') return true;
    return !['0', 'false', 'no', 'off'].includes(v.trim().toLowerCase());
}

const PROOF_PROJECTION = {
    ...DOUBLE_CREDIT_PROJECTION,
    createdAt: 1, 'verdict.reasons': 1, 'ask.kind': 1, 'ask.state': 1, 'ask.reasons': 1,
} as const;

/**
 * Daily payment health report (owner 2026-11-11). Read-only: Mongo find on paymentProofs, one Postgres SELECT on
 * payment_event, Redis SMEMBERS + MGET of the tg-aut heartbeats. The scheduler (cms-payment-health, 09:00 IST,
 * run-claimed per IST day) sends it to PAYMENT_HEALTH_CATEGORY. Never inserts revenue rows, never uncredits.
 */
@Injectable()
export class PaymentHealthService {
    private readonly logger = new Logger(PaymentHealthService.name);

    /** Overridable in tests; default = BotsService.sendMessageByCategory (best-effort). */
    notify: (input: RichNotificationInput) => Promise<boolean> = async (input) => {
        const bots = tryGetBotsServiceInstance();
        if (!bots) {
            this.logger.error('Payment health report not sent (BotsService not ready)');
            return false;
        }
        return bots.sendMessageByCategory(PAYMENT_HEALTH_CATEGORY, input);
    };

    constructor(
        @InjectModel(PAYMENT_PROOF_MODEL) private readonly proofModel: Model<any>,
        private readonly pg: AnalyticsPgReader,
        @Inject(PAYMENT_HEALTH_REDIS) private readonly redis: PaymentHealthRedis,
    ) {}

    /** Proofs created from 48 h + 15 min before the day (double-credit partners, boundary matches) to its end + 15 min. */
    async loadProofs(from: number, to: number): Promise<HealthProof[]> {
        const rows = await withTimeout(
            this.proofModel.collection
                .find(
                    { createdAt: { $gte: new Date(from - DOUBLE_CREDIT_WINDOW_MS - MATCH_WINDOW_MS), $lt: new Date(to + MATCH_WINDOW_MS) } },
                    { projection: PROOF_PROJECTION },
                )
                .toArray(),
            MONGO_TIMEOUT_MS,
            'paymentProofs read',
        );
        return rows as unknown as HealthProof[];
    }

    async loadPgRows(from: number, to: number): Promise<{ rows: PgPaymentRow[] | null; error?: string }> {
        let failure: AnalyticsPgError | undefined;
        const rows = await this.pg.query<{ id: string; t: string; chat_id: string; client_id: string; amount: number; source: string; voided: boolean; void_proof_id: string | null }>(
            `SELECT id::text AS id, (extract(epoch FROM ts) * 1000)::bigint::text AS t, chat_id, client_id, amount, source,
                    voided_at IS NOT NULL AS voided, void_proof_id
               FROM payment_event
              WHERE ts >= to_timestamp($1 / 1000.0) AND ts < to_timestamp($2 / 1000.0)
              ORDER BY ts`,
            [from - MATCH_WINDOW_MS, to + MATCH_WINDOW_MS],
            (e) => { failure = e; },
        );
        if (!rows) return { rows: null, error: failure ? `${failure.kind}: ${failure.message}` : 'unknown error' };
        return {
            rows: rows.map((x) => ({
                id: String(x.id), ts: Number(x.t), chatId: String(x.chat_id), clientId: String(x.client_id), amount: Number(x.amount),
                source: String(x.source), voided: !!x.voided, voidProofId: x.void_proof_id ?? null,
            })),
        };
    }

    /** Live tg-aut processes and their build stamp, from the heartbeats; null + reason when Redis cannot be read. */
    async loadBuilds(now: number): Promise<{ processes: ProcessBuild[] | null; skipped?: string }> {
        try {
            const read = async () => {
                const members = (await this.redis.smembers(HEARTBEAT_INDEX_KEY)) ?? [];
                const keys = members.filter((m) => m.startsWith('tg-aut::')).map((m) => `heartbeat::${m}`);
                return keys.length ? { keys, values: await this.redis.mget(keys) } : { keys, values: [] };
            };
            const { keys, values } = await withTimeout(read(), REDIS_DEADLINE_MS, 'heartbeat read');
            const out: ProcessBuild[] = [];
            keys.forEach((k, i) => {
                const raw = values[i];
                if (!raw) return;
                try {
                    const p = JSON.parse(raw);
                    if (!p || typeof p !== 'object' || now - Number(p.ts) > HEARTBEAT_FRESH_MS || p.status === 'stopping') return;
                    out.push({ clientId: String(p.clientId || k.slice('heartbeat::tg-aut::'.length)), sha: p.build?.sha ?? null, builtAt: p.build?.builtAt ?? null });
                } catch {
                    /* unreadable beat: skip */
                }
            });
            return { processes: out };
        } catch (e) {
            return { processes: null, skipped: `heartbeats unreadable (${(e as Error)?.message ?? e})` };
        }
    }

    /** The report for an IST day (default yesterday). Read-only. */
    async compute(day?: string, now = Date.now()): Promise<PaymentHealthReport> {
        const d = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : istDay(now, -1);
        const { from, to } = istDayRange(d);
        const [proofs, pg, builds] = await Promise.all([this.loadProofs(from, to), this.loadPgRows(from, to), this.loadBuilds(now)]);
        return buildReport({ day: d, proofs, pgRows: pg.rows, pgError: pg.error, processes: builds.processes, processesSkipped: builds.skipped });
    }

    /** Scheduler entry: compute yesterday and send (unless the flag is off). Returns the run outcome. */
    async runDaily(now = Date.now()): Promise<Record<string, unknown>> {
        const report = await this.compute(undefined, now);
        const summary = summaryOf(report);
        if (!paymentHealthEnabled()) {
            this.logger.log(`Payment health ${report.day}: not sent (${PAYMENT_HEALTH_FLAG} off) ${JSON.stringify(summary)}`);
            return { day: report.day, sent: false, disabled: true, summary };
        }
        const sent = await this.notify(formatReport(report));
        this.logger.log(`Payment health ${report.day}: sent=${sent} ${JSON.stringify(summary)}`);
        return { day: report.day, sent, summary };
    }
}

/** Small numbers for the run record and logs. */
export function summaryOf(r: PaymentHealthReport): Record<string, unknown> {
    const c = r.reconcile;
    return {
        credited: c?.credited ?? null,
        rows: c?.rows ?? null,
        missing: c?.missing.length ?? null,
        extra: c?.extra.length ?? null,
        voided: c?.voided ?? null,
        doubles: r.doubles.length,
        holds: r.holds.total,
        fakes: r.fakes.total,
        behind: r.builds.behind?.length ?? null,
        ...(r.pgError ? { pgError: r.pgError } : {}),
        ...(r.builds.skipped ? { buildsSkipped: r.builds.skipped } : {}),
    };
}
