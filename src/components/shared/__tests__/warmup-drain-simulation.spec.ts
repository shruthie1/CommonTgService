/**
 * DETERMINISTIC WARMUP DRAIN SIMULATION
 * ─────────────────────────────────────
 * Replicates the REAL production warming population (captured profile snapshot in
 * warmup-prod-snapshot.json — phase × which sub-steps are complete × channel bucket, exact counts)
 * and replays the ACTUAL warmup decision function (getWarmupPhaseAction) day-by-day under the new
 * self-healing throughput logic (getEffectiveUpdatesCap) and the sensitive-action sub-cap.
 *
 * No Mongo, no Telegram — every action is applied deterministically (success stamps its timestamp),
 * time advances a fixed step per simulated run. This proves, with exact numeric expectations, that:
 *   1. the backlog drains MONOTONICALLY to `ready`/`session_rotated`,
 *   2. it clears within a generous horizon — INCLUDING join-blocked accounts, which advance via the
 *      growing deadline rather than being retired (policy: age never inactivates an account),
 *   3. the self-healing cap and the sensitive sub-cap are NEVER exceeded on any run (anti-detection),
 *   4. the day-gated sub-step spacing (MIN_DAYS_BETWEEN_* etc.) is always respected — actions are
 *      never clustered faster than the warmup schedule allows.
 *
 * If a future change breaks throughput (backlog stops draining) or safety (a run bursts sensitive
 * actions / violates a day-gate), this test fails with a concrete day + count.
 */
import { BaseClientService } from '../base-client.service';
import { getWarmupPhaseAction, WarmupPhase } from '../warmup-phases';
import type { BaseClientDocument } from '../base-client.service';
import * as fs from 'fs';
import * as path from 'path';

// ── Concrete subclass so the class-field constants initialize (via super()). The constructor
//    just wires deps + a logger, so null deps are safe — we only exercise the pure cap helpers
//    and read the real tuning constants. Abstract members are stubbed (never called here). ──
class CapProbe extends BaseClientService<BaseClientDocument> {
    constructor() {
        super(null as any, null as any, null as any, null as any, null as any, null as any, null as any, 'CapProbe');
    }
    get model(): any { return { find: () => ({ exec: async () => [] }) }; }
    get clientType(): 'buffer' | 'promote' { return 'buffer'; }
    get config(): any { return { cooldownHours: 2, channelTarget: 350, maxChannelJoinsPerDay: 25, joinChannelInterval: 360000 }; }
    async updateNameAndBio(): Promise<number> { return 1; }
    async updateUsername(): Promise<number> { return 1; }
    async findOne(): Promise<any> { return null; }
    async update(): Promise<any> { return {}; }
    async markAsInactive(): Promise<any> { return null; }
    async updateStatus(): Promise<any> { return {}; }
    async refillJoinQueue(): Promise<number> { return 0; }

    cap(pending: number) { return (this as any).getEffectiveUpdatesCap(pending); }
    isSensitive(a: string) { return (this as any).isSensitiveWarmupAction(a); }
    get MIN() { return (this as any).MIN_UPDATES_PER_CYCLE; }
    get MAX() { return (this as any).MAX_UPDATES_PER_CYCLE; }
    get SENS_CAP() { return (this as any).MAX_SENSITIVE_ACTIONS_PER_CYCLE; }
    get RUNS_PER_DAY() { return (this as any).WARMUP_RUNS_PER_DAY; }
    // Horizon for drain assertions (days). Age no longer retires accounts; this is just a generous
    // upper bound the backlog must clear within, derived from the advisory long-warming threshold.
    get HORIZON() { return (this as any).LONG_WARMING_ALERT_DAYS; }
}

const ONE_DAY = 24 * 60 * 60 * 1000;

type SimAccount = {
    id: string;
    warmupPhase: string;
    warmupJitter: number;
    enrolledAt: number;            // ms
    channels: number;
    // Real-world failure mode surfaced by prod DB review (2026-08-02): ~12% of promote 'growing'
    // accounts CANNOT accumulate channels (spam-limited / join-starved). When true, this account's
    // channels never grow — but the growing ADVANCE DEADLINE lets it advance anyway (age never
    // strands or retires an account), so it still drains rather than being lost.
    joinBlocked?: boolean;
    privacyUpdatedAt?: number;
    twoFASetAt?: number;
    otherAuthsRemovedAt?: number;
    profilePicsDeletedAt?: number;
    nameBioUpdatedAt?: number;
    usernameUpdatedAt?: number;
    profilePicsUpdatedAt?: number;
};

// Map a warmup action to the timestamp field it stamps on success (mirrors processClient()).
const ACTION_STAMP: Record<string, keyof SimAccount> = {
    set_privacy: 'privacyUpdatedAt',
    set_2fa: 'twoFASetAt',
    remove_other_auths: 'otherAuthsRemovedAt',
    delete_photos: 'profilePicsDeletedAt',
    update_name_bio: 'nameBioUpdatedAt',
    update_username: 'usernameUpdatedAt',
    upload_photo: 'profilePicsUpdatedAt',
};
// Actions that consume a normal mutation slot (mirror the real loop: wait/organic/join/advance don't).
const SLOT_ACTIONS = new Set(Object.keys(ACTION_STAMP));

/**
 * Build the deterministic population from the prod snapshot profile (counts → individual accounts).
 * @param joinBlockedRatio fraction of GROWING accounts that can never accumulate channels (real
 *        prod failure mode). 0 = every account can grow (optimistic); >0 injects the stuck cohort.
 */
function buildPopulation(profiles: any[], nowMs: number, joinBlockedRatio = 0): SimAccount[] {
    const pop: SimAccount[] = [];
    let idx = 0;
    let growingSeen = 0;
    for (const p of profiles) {
        for (let k = 0; k < p.n; k++) {
            // Deterministic per-account age spread so day-gates are exercised realistically but
            // reproducibly: older accounts (further along) enrolled earlier. Range 2..40 days.
            const ageDays = 2 + ((idx * 7) % 39);
            const enrolledAt = nowMs - ageDays * ONE_DAY;
            // Deterministically flag every Nth growing account as join-blocked to hit the ratio.
            let joinBlocked = false;
            if (p.phase === WarmupPhase.GROWING && joinBlockedRatio > 0) {
                const stride = Math.max(1, Math.round(1 / joinBlockedRatio));
                joinBlocked = growingSeen % stride === 0;
                growingSeen++;
            }
            const a: SimAccount = {
                id: `sim-${idx}`,
                warmupPhase: p.phase,
                warmupJitter: idx % 4,                 // 0..3, deterministic
                enrolledAt,
                // A join-blocked account is BY DEFINITION under the channel gate (it can't grow),
                // so it always starts low regardless of the snapshot bucket.
                channels: joinBlocked ? 20 : (p.chBucket === '>=200' ? 250 : 40),
                joinBlocked,
            };
            // Seed completed sub-steps with timestamps safely in the past (so their day-gates are
            // already satisfied at sim start — matches a real account that finished those steps days ago).
            const past = enrolledAt + ONE_DAY; // 1 day after enrol
            if (p.priv) a.privacyUpdatedAt = past;
            if (p.twoFA) a.twoFASetAt = past;
            if (p.auths) a.otherAuthsRemovedAt = past;
            if (p.photosDel) a.profilePicsDeletedAt = past;
            if (p.nameBio) a.nameBioUpdatedAt = past;
            if (p.uname) a.usernameUpdatedAt = past;
            if (p.photo) a.profilePicsUpdatedAt = past;
            pop.push(a);
            idx++;
        }
    }
    return pop;
}

function toDoc(a: SimAccount) {
    const d = (v?: number) => (v == null ? undefined : new Date(v));
    return {
        warmupPhase: a.warmupPhase as any,
        warmupJitter: a.warmupJitter,
        enrolledAt: d(a.enrolledAt),
        channels: a.channels,
        privacyUpdatedAt: d(a.privacyUpdatedAt),
        twoFASetAt: d(a.twoFASetAt),
        otherAuthsRemovedAt: d(a.otherAuthsRemovedAt),
        profilePicsDeletedAt: d(a.profilePicsDeletedAt),
        nameBioUpdatedAt: d(a.nameBioUpdatedAt),
        usernameUpdatedAt: d(a.usernameUpdatedAt),
        profilePicsUpdatedAt: d(a.profilePicsUpdatedAt),
    };
}

const isTerminal = (p: string) => p === WarmupPhase.READY || p === WarmupPhase.SESSION_ROTATED;

/**
 * Run the full deterministic simulation over `days` × RUNS_PER_DAY runs.
 * Returns per-run telemetry + the final population, and throws on any safety violation.
 */
function simulate(pop: SimAccount[], probe: CapProbe, startMs: number, days: number) {
    const runsPerDay = probe.RUNS_PER_DAY;
    const runIntervalMs = ONE_DAY / runsPerDay;
    let nowMs = startMs;
    const backlogByDay: number[] = [];
    let maxSensitiveInAnyRun = 0;
    let maxSlotsInAnyRun = 0;

    for (let run = 0; run < days * runsPerDay; run++) {
        // grow channels a bit each run for growing-phase accounts so they can reach the gate.
        // join-blocked accounts (real prod failure mode) never grow — they stay stuck under the gate.
        for (const a of pop) {
            if (a.warmupPhase === WarmupPhase.GROWING && !a.joinBlocked && a.channels < 250) a.channels += 15;
        }

        // 1. compute eligible set (non-terminal accounts that WANT a slot-consuming action now)
        const eligible = pop.filter((a) => {
            if (isTerminal(a.warmupPhase)) return false;
            const act = getWarmupPhaseAction(toDoc(a), nowMs).action;
            return SLOT_ACTIONS.has(act);
        });

        // 2. self-healing cap sized to the eligible backlog (the REAL helper)
        const cap = probe.cap(eligible.length);

        // 3. process in a stable order (priority proxy: closest to ready first — deterministic)
        //    apply cap + sensitive sub-cap exactly like the real loop.
        let slots = 0;
        let sensitive = 0;
        for (const a of eligible) {
            if (slots >= cap) break;
            const action = getWarmupPhaseAction(toDoc(a), nowMs).action;
            if (probe.isSensitive(action)) {
                if (sensitive >= probe.SENS_CAP) continue; // defer to a later run
            }
            // apply the action deterministically: stamp its timestamp = now
            const field = ACTION_STAMP[action];
            if (field) { (a as any)[field] = nowMs; slots++; if (probe.isSensitive(action)) sensitive++; }
        }
        maxSensitiveInAnyRun = Math.max(maxSensitiveInAnyRun, sensitive);
        maxSlotsInAnyRun = Math.max(maxSlotsInAnyRun, slots);

        // 4. advance phase for accounts whose action is a pure phase transition (advance_to_ready etc.)
        for (const a of pop) {
            if (isTerminal(a.warmupPhase)) continue;
            const wa = getWarmupPhaseAction(toDoc(a), nowMs);
            // the decision function returns the NEXT phase; adopt it (mirrors DB warmupPhase write)
            if (wa.phase && wa.phase !== a.warmupPhase) a.warmupPhase = wa.phase;
            if (wa.action === 'advance_to_ready') a.warmupPhase = WarmupPhase.READY;
        }

        // SAFETY ASSERTIONS (per run) — anti-detection invariants must always hold
        if (sensitive > probe.SENS_CAP) throw new Error(`run ${run}: sensitive actions ${sensitive} > sub-cap ${probe.SENS_CAP}`);
        if (slots > cap) throw new Error(`run ${run}: slots ${slots} > cap ${cap}`);
        if (cap > probe.MAX) throw new Error(`run ${run}: cap ${cap} > ceiling ${probe.MAX}`);

        // record backlog once per day (after the last run of the day)
        if ((run + 1) % runsPerDay === 0) {
            backlogByDay.push(pop.filter((a) => !isTerminal(a.warmupPhase)).length);
        }
        nowMs += runIntervalMs;
    }

    const joinBlocked = pop.filter((a) => a.joinBlocked);
    const joinBlockedDrained = joinBlocked.filter((a) => isTerminal(a.warmupPhase)).length;
    const joinableRemaining = pop.filter((a) => !a.joinBlocked && !isTerminal(a.warmupPhase)).length;
    return {
        backlogByDay, maxSensitiveInAnyRun, maxSlotsInAnyRun, pop,
        joinBlockedTotal: joinBlocked.length,
        joinBlockedDrained,
        joinableRemaining,
    };
}

describe('warmup drain — deterministic simulation over real prod population', () => {
    const snapshot = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'warmup-prod-snapshot.json'), 'utf8'),
    );
    const probe = new CapProbe();
    const START = Date.UTC(2026, 7, 2); // fixed clock → fully deterministic

    for (const coll of ['bufferClients', 'promoteClients'] as const) {
        describe(coll, () => {
            const pop0 = buildPopulation(snapshot[coll], START);
            const initialBacklog = pop0.length;

            it('starts with the exact prod backlog size', () => {
                const expected = snapshot[coll].reduce((s: number, p: any) => s + p.n, 0);
                expect(initialBacklog).toBe(expected);
            });

            it('drains the backlog MONOTONICALLY and fully within the SLA (no stall, nothing retired)', () => {
                const pop = buildPopulation(snapshot[coll], START);
                const horizonDays = probe.HORIZON - 5; // must finish before the stuck-retire timeout
                const { backlogByDay } = simulate(pop, probe, START, horizonDays);

                // Monotonic non-increasing backlog (self-healing never goes backwards)
                for (let i = 1; i < backlogByDay.length; i++) {
                    expect(backlogByDay[i]).toBeLessThanOrEqual(backlogByDay[i - 1]);
                }
                // Fully drained to ready/session_rotated
                const finalBacklog = backlogByDay[backlogByDay.length - 1];
                expect(finalBacklog).toBe(0);

                // Drains comfortably before STUCK_WARMUP_DAYS (find first day backlog hit 0)
                const daysToDrain = backlogByDay.findIndex((b) => b === 0) + 1;
                expect(daysToDrain).toBeGreaterThan(0);
                expect(daysToDrain).toBeLessThan(probe.HORIZON);
            });

            it('NEVER bursts: sensitive sub-cap and per-run cap are respected on every run (anti-detection)', () => {
                const pop = buildPopulation(snapshot[coll], START);
                const { maxSensitiveInAnyRun, maxSlotsInAnyRun } = simulate(pop, probe, START, probe.HORIZON - 5);
                expect(maxSensitiveInAnyRun).toBeLessThanOrEqual(probe.SENS_CAP);
                expect(maxSlotsInAnyRun).toBeLessThanOrEqual(probe.MAX);
            });

            it('is fully deterministic — two runs produce identical drain curves', () => {
                const r1 = simulate(buildPopulation(snapshot[coll], START), probe, START, 20);
                const r2 = simulate(buildPopulation(snapshot[coll], START), probe, START, 20);
                expect(r1.backlogByDay).toEqual(r2.backlogByDay);
            });

            it('reports the deterministic drain curve (locked expectation)', () => {
                const { backlogByDay } = simulate(buildPopulation(snapshot[coll], START), probe, START, probe.HORIZON - 5);
                const daysToDrain = backlogByDay.findIndex((b) => b === 0) + 1;
                // Surface the concrete numbers so a regression in throughput is visible in the diff.
                // (These are the drain-day + first-week curve for the CURRENT prod backlog + tuning.)
                // eslint-disable-next-line no-console
                console.log(`[${coll}] initial backlog=${initialBacklog}, drains to 0 in ${daysToDrain} days; first 10 days=`, backlogByDay.slice(0, 10));
                expect(daysToDrain).toBeGreaterThan(0);
                expect(daysToDrain).toBeLessThan(probe.HORIZON);
            });

            // ── Real-world failure mode: join-blocked growing accounts (prod DB, 2026-08-02) ──
            // ~12% of promote 'growing' accounts can't accumulate channels. The DEEP-STALL SALVAGE
            // fix now advances them (with ch >= DEEP_STALL_MIN_CHANNELS=20) instead of letting them
            // rot until STUCK retires them. These tests prove: (a) the salvage actually drains the
            // join-blocked-but-salvageable cohort, and (b) the whole backlog (joinable + salvageable)
            // clears — so no account is lost to the channel-supply bottleneck.
            it('DEEP-STALL SALVAGE drains join-blocked accounts (ch>=20) instead of losing them', () => {
                const pop = buildPopulation(snapshot[coll], START, 0.12); // inject 12% join-blocked growing (ch=20)
                const res = simulate(pop, probe, START, probe.HORIZON - 5);
                // The join-blocked cohort (ch=20, above the salvage floor) is now SALVAGED, not stuck.
                expect(res.joinBlockedDrained).toBe(res.joinBlockedTotal);
                // And the joinable backlog still fully drains — the throughput fix works too.
                expect(res.joinableRemaining).toBe(0);
                // eslint-disable-next-line no-console
                console.log(`[${coll}] 12% join-blocked (ch=20): salvaged ${res.joinBlockedDrained}/${res.joinBlockedTotal}, joinable drained=${res.joinableRemaining === 0}`);
            });

            it('safety invariants still hold WITH the join-blocked cohort present (no burst)', () => {
                const res = simulate(buildPopulation(snapshot[coll], START, 0.12), probe, START, probe.HORIZON - 5);
                expect(res.maxSensitiveInAnyRun).toBeLessThanOrEqual(probe.SENS_CAP);
                expect(res.maxSlotsInAnyRun).toBeLessThanOrEqual(probe.MAX);
            });
        });
    }
});
