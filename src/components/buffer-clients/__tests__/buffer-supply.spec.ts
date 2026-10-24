/**
 * Dynamic buffer supply — pure rules (docs/design/2026-10-24-dynamic-buffer-supply.md).
 * Counting rules, target math + bounds, engine-ceiling budget + distribution, fail-closed config.
 */
import {
    allocateByNeed,
    BUFFER_SUPPLY_ENV,
    BUFFER_SUPPLY_HARD_CAP_MAX,
    classifyBufferForCap,
    computeClientSupplyTarget,
    computeFleetEnrollmentBudget,
    defaultBufferSupplyConfig,
    engineWeeklyCeiling,
    readBufferSupplyConfig,
} from '../buffer-supply';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const OPTS = { operationalFloor: 200, maxFailedAttempts: 3, freeFreshMs: 14 * DAY, limitedWindowMs: 30 * DAY };
const graduated = (extra: Record<string, unknown> = {}) => ({ warmupPhase: 'session_rotated', channels: 250, inUse: false, ...extra });

describe('classifyBufferForCap', () => {
    it.each([
        ['free, checked 1 day ago', graduated({ spamStatus: 'free', spamCheckedAt: new Date(NOW - DAY) }), { counted: true, kind: 'usable' }],
        ['free, check older than the freshness window', graduated({ spamStatus: 'free', spamCheckedAt: new Date(NOW - 15 * DAY) }), { counted: false, reason: 'stale_free' }],
        ['free without spamCheckedAt', graduated({ spamStatus: 'free' }), { counted: false, reason: 'stale_free' }],
        ['limited, lifts in 5 days', graduated({ spamStatus: 'limited', limitedUntil: new Date(NOW + 5 * DAY), spamCheckedAt: new Date(NOW) }), { counted: true, kind: 'limited_soon' }],
        ['limited, lift date already passed', graduated({ spamStatus: 'limited', limitedUntil: new Date(NOW - DAY) }), { counted: true, kind: 'limited_soon' }],
        ['limited, lifts exactly at the window edge', graduated({ spamStatus: 'limited', limitedUntil: new Date(NOW + 30 * DAY) }), { counted: true, kind: 'limited_soon' }],
        ['limited, lifts after the window', graduated({ spamStatus: 'limited', limitedUntil: new Date(NOW + 31 * DAY) }), { counted: false, reason: 'limited_outside_window' }],
        ['limited without a lift date', graduated({ spamStatus: 'limited', limitedUntil: null }), { counted: false, reason: 'limited_no_date' }],
        ['harsh, checked today', graduated({ spamStatus: 'harsh', spamCheckedAt: new Date(NOW) }), { counted: false, reason: 'harsh' }],
        ['harsh, checked 90 days ago (still never counts)', graduated({ spamStatus: 'harsh', spamCheckedAt: new Date(NOW - 90 * DAY) }), { counted: false, reason: 'harsh' }],
        ['graduated, never SpamBot-checked (null)', graduated({ spamStatus: null }), { counted: false, reason: 'never_checked' }],
        ['graduated, never SpamBot-checked (field missing)', graduated(), { counted: false, reason: 'never_checked' }],
        ['ready phase counts like session_rotated', { warmupPhase: 'ready', channels: 200, spamStatus: 'free', spamCheckedAt: new Date(NOW) }, { counted: true, kind: 'usable' }],
        ['graduated below the channel floor', graduated({ channels: 199, spamStatus: 'free', spamCheckedAt: new Date(NOW) }), { counted: false, reason: 'below_channel_floor' }],
        ['graduated but the live main (inUse)', graduated({ inUse: true, spamStatus: 'free', spamCheckedAt: new Date(NOW) }), { counted: false, reason: 'in_use' }],
        ['warmup (growing), spam state ignored', { warmupPhase: 'growing', channels: 50, spamStatus: 'harsh' }, { counted: true, kind: 'pipeline' }],
        ['warmup (enrolled)', { warmupPhase: 'enrolled', channels: 0 }, { counted: true, kind: 'pipeline' }],
        ['warmup stalled at max failed attempts', { warmupPhase: 'settling', failedUpdateAttempts: 3 }, { counted: false, reason: 'failed_attempts' }],
        ['no warmup phase', { channels: 300 }, { counted: false, reason: 'no_phase' }],
    ])('%s', (_label, doc, expected) => {
        expect(classifyBufferForCap(doc as any, NOW, OPTS)).toEqual(expected);
    });
});

describe('engineWeeklyCeiling', () => {
    it('is 5 sensitive/run x 4 runs/day x 7 days / 3 sensitive actions per account, floored', () => {
        expect(engineWeeklyCeiling(5, 4)).toBe(46);
    });
});

describe('computeClientSupplyTarget', () => {
    const config = defaultBufferSupplyConfig(46);

    it('sizes the target to consumption x lead time + safety margin', () => {
        // 14 swaps in 14 days = 1/day; 1 x 30 + 2 = 32.
        expect(computeClientSupplyTarget({ consumed: 14, counted: 10 }, config)).toEqual({
            ratePerDay: 1, rawTarget: 32, target: 32, cap: 37, need: 22,
        });
    });

    it('never goes below the minimum target (a client with no swaps keeps the old 10-account stock)', () => {
        const r = computeClientSupplyTarget({ consumed: 0, counted: 4 }, config);
        expect(r.target).toBe(10);
        expect(r.need).toBe(6);
    });

    it('is bounded by the max target and the cap by the hard cap', () => {
        const r = computeClientSupplyTarget({ consumed: 140, counted: 0 }, config);
        expect(r.rawTarget).toBe(302);
        expect(r.target).toBe(40);
        expect(r.cap).toBe(45);
        const tight = computeClientSupplyTarget({ consumed: 140, counted: 0 }, { ...config, maxTarget: 60, hardCap: 50 });
        expect(tight.target).toBe(60);
        expect(tight.cap).toBe(50);
        expect(tight.need).toBe(50); // need never exceeds the cap
    });

    it('needs nothing when counted supply already meets the target', () => {
        expect(computeClientSupplyTarget({ consumed: 3, counted: 15 }, config).need).toBe(0);
    });
});

describe('computeFleetEnrollmentBudget', () => {
    it('is the smallest of per-run max, rolling-7-day ceiling left and pipeline room', () => {
        expect(computeFleetEnrollmentBudget({ maxNewPerRun: 10, weeklyCeiling: 46, enrolledLast7d: 0, fleetWarming: 100, leadTimeDays: 30 }))
            .toEqual({ budget: 10, weeklyRemaining: 46, pipelineCapacity: 198, pipelineRemaining: 98 });
        expect(computeFleetEnrollmentBudget({ maxNewPerRun: 10, weeklyCeiling: 46, enrolledLast7d: 43, fleetWarming: 100, leadTimeDays: 30 }).budget).toBe(3);
        expect(computeFleetEnrollmentBudget({ maxNewPerRun: 10, weeklyCeiling: 46, enrolledLast7d: 0, fleetWarming: 195, leadTimeDays: 30 }).budget).toBe(3);
        expect(computeFleetEnrollmentBudget({ maxNewPerRun: 10, weeklyCeiling: 46, enrolledLast7d: 60, fleetWarming: 0, leadTimeDays: 30 }).budget).toBe(0);
    });
});

describe('allocateByNeed', () => {
    it('gives everyone their need when the budget is enough', () => {
        const a = allocateByNeed([{ clientId: 'a', need: 2, target: 10 }, { clientId: 'b', need: 3, target: 10 }], 10);
        expect(Object.fromEntries(a)).toEqual({ a: 2, b: 3 });
    });

    it('spreads a constrained budget by deficit share instead of list order', () => {
        // a is 100% short (10/10), b 50% (10/20), c 10% (2/20). Budget 6: a takes slots until it is
        // as short as b (5/10 = 10/20), then the tie goes to the larger remaining need (b).
        const a = allocateByNeed([
            { clientId: 'c', need: 2, target: 20 },
            { clientId: 'b', need: 10, target: 20 },
            { clientId: 'a', need: 10, target: 10 },
        ], 6);
        expect(Object.fromEntries(a)).toEqual({ a: 5, b: 1 });
        expect([...a.values()].reduce((x, y) => x + y, 0)).toBe(6);
    });

    it('allocates nothing with a zero budget or zero needs', () => {
        expect(allocateByNeed([{ clientId: 'a', need: 5, target: 10 }], 0).size).toBe(0);
        expect(allocateByNeed([{ clientId: 'a', need: 0, target: 10 }], 5).size).toBe(0);
    });
});

describe('readBufferSupplyConfig', () => {
    it('uses code defaults when nothing is set', () => {
        expect(readBufferSupplyConfig({}, 46)).toEqual({ config: defaultBufferSupplyConfig(46), invalid: [] });
        expect(defaultBufferSupplyConfig(46)).toMatchObject({ mode: 'dynamic', consumptionWindowDays: 14, leadTimeDays: 30, minTarget: 10, fleetWeeklyCeiling: 46 });
    });

    it('applies valid overrides', () => {
        const r = readBufferSupplyConfig({ [BUFFER_SUPPLY_ENV.minTarget]: '12', [BUFFER_SUPPLY_ENV.fleetWeeklyCeiling]: ' 30 ' }, 46);
        expect(r.invalid).toEqual([]);
        expect(r.config).toMatchObject({ mode: 'dynamic', minTarget: 12, fleetWeeklyCeiling: 30 });
    });

    it('honours an explicit legacy mode (config rollback)', () => {
        expect(readBufferSupplyConfig({ [BUFFER_SUPPLY_ENV.mode]: 'LEGACY' }, 46).config.mode).toBe('legacy');
    });

    it.each([
        [BUFFER_SUPPLY_ENV.mode, 'turbo'],
        [BUFFER_SUPPLY_ENV.minTarget, 'ten'],
        [BUFFER_SUPPLY_ENV.minTarget, '-1'],
        [BUFFER_SUPPLY_ENV.leadTimeDays, '2.5'],
        [BUFFER_SUPPLY_ENV.hardCap, String(BUFFER_SUPPLY_HARD_CAP_MAX + 1)],
        // The engine ceiling can only be lowered by config, never raised.
        [BUFFER_SUPPLY_ENV.fleetWeeklyCeiling, '47'],
        [BUFFER_SUPPLY_ENV.consumptionWindowDays, 'NaN'],
    ])('fails closed to legacy on garbage %s=%s', (key, value) => {
        const r = readBufferSupplyConfig({ [key]: value }, 46);
        expect(r.config.mode).toBe('legacy');
        expect(r.invalid).toEqual([key]);
    });

    it('fails closed when min target exceeds max target', () => {
        const r = readBufferSupplyConfig({ [BUFFER_SUPPLY_ENV.minTarget]: '30', [BUFFER_SUPPLY_ENV.maxTarget]: '20' }, 46);
        expect(r.config.mode).toBe('legacy');
        expect(r.invalid).toHaveLength(1);
    });
});
