# Conversion-Aware, Stateless Channel Joining — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CommonTgService's channel-join selection fade proven-dead and delete-heavy channels toward the back of the join order (while keeping untried channels fully explorable and preserving random spread across 100+ mobiles), computed live and statelessly from `channelIntelligence`.

**Architecture:** Replace the join-selection sort `random × reactionWeight × diversityWeight(1/clientsJoined)` with `random × conversionWeight × sendQualityWeight` in both `getActiveChannels` aggregations. The two weights are computed inline in the aggregation via a `$lookup` on `channelIntelligence`, shrunk toward a **live fleet prior** (fleet DM/send and survive-rate, recomputed at most every 15 min and cached in-memory as two floats). All new logic lives in one shared helper on `ChannelIntelligenceReadService` (already injected into both services) so the two collections never drift. Nothing is persisted; rollback = revert the sort expression.

**Tech Stack:** NestJS 11, TypeScript 5, Mongoose aggregation pipelines, Jest 30 + ts-jest, `mongodb-memory-server` (already a dev dependency, used by existing specs for real-aggregation tests).

## Global Constraints

- **Service scope:** CommonTgService **only**. Do not touch tg-platform, promote-clients, tg-aut, or the reaction service. Do not change promotion/posting selection or the conversation engine.
- **Stateless / no persistence:** no new schema field, no write-back to `channelIntelligence`, no Redis, no migration, no backfill. The ONLY state permitted is a 2-float in-memory prior cache that rebuilds on restart.
- **CommonTgService never writes `channelIntelligence`** — it is owned by the sibling tg-platform service. Read-only lookups only.
- **Live, self-calibrating priors:** `PRIOR_RATE` (fleet DM/send) and `SQ_PRIOR_RATE` (fleet survive-rate) are computed live from `channelIntelligence`, never hardcoded. The literals `0.03` / `0.82` appear ONLY as cold-start fallbacks (used only when the fleet aggregation returns zero sends).
- **Fixed tuning constants (exact values):** `PRIOR_STRENGTH = 20`, `WEIGHT_MIN = 0.2`, `WEIGHT_MAX = 1.3`, `SQ_PRIOR_STRENGTH = 20`, `SQ_MIN = 0.5`, `SQ_MAX = 1.1`, `PRIOR_TTL_MS = 15 * 60 * 1000`, `PRIOR_RATE_FALLBACK = 0.03`, `SQ_PRIOR_RATE_FALLBACK = 0.82`.
- **Untried channels must stay neutral (weight 1.0), never penalized.** A channel with no `channelIntelligence` doc or `attempted=0` MUST get `conversionWeight = 1.0` and `sendQualityWeight = 1.0`. This is a hard requirement with dedicated tests.
- **No NaN in `sortScore`:** every arithmetic input is `$ifNull`-guarded to a number before use; the normalization denominator (`PRIOR_STRENGTH + attempted`) and divisor (`PRIOR_RATE`) are always strictly positive.
- **Fail-open:** if the fleet-prior computation or the sort aggregation errors, fall back to random-only selection (or the last cached prior) and still return channels — never starve the join pipeline. Mirror the existing `getExcludedChannelIds` fail-open posture.
- **DRY:** both `active-channels.service.ts` and `channels.service.ts` must consume the SAME helper. No copy-pasted pipeline logic.
- **Keep unchanged:** negative-keyword filters, `participantsCount` gates (`>600` activeChannels / `>1000` channels), `username != null`, `canSendMsgs`, banned/forbidden/private/broadcast exclusions, the post-fetch safety exclusion `getExcludedChannelIds`, daily caps, join intervals, jitter, permanent-error deactivation.
- **Spec:** `docs/superpowers/specs/2026-08-01-conversion-aware-channel-join-design.md` is the source of truth.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/components/active-channels/channel-intelligence-read.service.ts` | Owns all `channelIntelligence` reads. **New home** for `getFleetPrior()` (live prior + cache) and `buildConversionAwareSortStages(prior)` (pure pipeline-stage builder) + the tuning constants. | Modify (add methods + constants) |
| `src/components/active-channels/active-channels.service.ts` | `getActiveChannels` for accounts with `<220` channels. | Modify (call helper, replace sort stage; stop calling `incrementClientsJoined` per Task 5) |
| `src/components/channels/channels.service.ts` | `getActiveChannels` for accounts with `≥220` channels. | Modify (call helper, replace sort stage) |
| `src/components/shared/base-client.service.ts:1719` | The single caller of `incrementClientsJoined`. | Modify (remove the call) |
| `src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts` | Existing spec for this service. | Modify (add prior + sort-stage tests) |
| `src/components/active-channels/__tests__/active-channels.service.spec.ts` | Existing spec. | Modify (assert new sort wiring) |
| `src/components/channels/__tests__/channels.service.spec.ts` | Existing spec. | Modify (assert new sort wiring) |

Constants and both helpers live together on `ChannelIntelligenceReadService` (one definition, one place to tune, one place to test). The two consuming services only call the helper.

---

## Task 1: Tuning constants + pure `buildConversionAwareSortStages(prior)` builder

Adds the named constants and a **pure function** that, given a prior, returns the `$lookup` + `$addFields sortScore` pipeline stages. Pure (no I/O) so it is trivially unit-testable and identical for both services.

**Files:**
- Modify: `src/components/active-channels/channel-intelligence-read.service.ts`
- Test: `src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export interface FleetPrior { PRIOR_RATE: number; SQ_PRIOR_RATE: number; }`
  - `ChannelIntelligenceReadService.buildConversionAwareSortStages(prior: FleetPrior): PipelineStage[]` — returns exactly two stages: a `$lookup` (from `channelIntelligence`, localField `channelId`, foreignField `channelId`, as `_ci`) and an `$addFields` computing `sortScore` (and dropping `_ci` is deferred to the caller's existing `$project`, but this builder also unsets `_ci` — see step 3). Later tasks splice these stages into their pipeline in place of the old `$addFields`.
  - Exported consts on the class or module: `PRIOR_STRENGTH`, `WEIGHT_MIN`, `WEIGHT_MAX`, `SQ_PRIOR_STRENGTH`, `SQ_MIN`, `SQ_MAX`, `PRIOR_TTL_MS`, `PRIOR_RATE_FALLBACK`, `SQ_PRIOR_RATE_FALLBACK`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts` a new `describe` block. This test runs the builder's stages through `mongodb-memory-server` (matching the existing `getOutcomeAnalytics` test style in the same file) against a `channels`-like input collection plus a `channelIntelligence` collection, and asserts the computed weights. Use `PRIOR_TTL_MS=0` semantics by passing an explicit prior (no cache involved in this task).

```ts
import mongoose, { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Schema } from 'mongoose';
import { ChannelIntelligenceReadService } from '../channel-intelligence-read.service';

describe('ChannelIntelligenceReadService.buildConversionAwareSortStages', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let ciModel: any;       // channelIntelligence
  let chanModel: any;     // the source collection we sort
  let service: ChannelIntelligenceReadService;

  const Bare = () => new Schema({}, { strict: false });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    connection = await mongoose.createConnection(mongod.getUri(), { dbName: 'sortStages' }).asPromise();
    ciModel = connection.model('channelIntelligence', new Schema({}, { strict: false, collection: 'channelIntelligence' }));
    chanModel = connection.model('srcChan', new Schema({}, { strict: false, collection: 'srcChan' }));
    service = new ChannelIntelligenceReadService(ciModel);

    // Source channels to sort (only channelId matters for the lookup):
    await chanModel.create([
      { channelId: 'untried' },      // no CI doc  -> neutral 1.0 x 1.0
      { channelId: 'dead' },         // 200 sends, 0 DMs -> conversion toward WEIGHT_MIN
      { channelId: 'converter' },    // high credited/attempted -> conversion toward WEIGHT_MAX
      { channelId: 'deletey' },      // 40% deleted (under 50% hard gate) -> sendQuality toward SQ_MIN
    ]);
    await ciModel.create([
      { channelId: 'dead',      outcomes: { attempted: 200, survived: 180, deleted: 5 },  DMs: { credited: 0 } },
      { channelId: 'converter', outcomes: { attempted: 100, survived: 95,  deleted: 2 },  DMs: { credited: 30 } },
      { channelId: 'deletey',   outcomes: { attempted: 100, survived: 55,  deleted: 40 }, DMs: { credited: 3 } },
    ]);
  });

  afterAll(async () => {
    if (connection) { await connection.dropDatabase(); await connection.close(); }
    if (mongod) await mongod.stop();
  });

  // Helper: run the builder's stages and expose the computed weights instead of dropping them.
  async function weights(prior: { PRIOR_RATE: number; SQ_PRIOR_RATE: number }) {
    const stages = service.buildConversionAwareSortStages(prior);
    // Re-project the intermediate weights for assertion by appending a debug $addFields
    // that recomputes nothing — we instead inspect sortScore bounds and relative order.
    const rows = await chanModel.aggregate([...stages, { $project: { channelId: 1, sortScore: 1 } }]).exec();
    return Object.fromEntries(rows.map((r: any) => [r.channelId, r.sortScore]));
  }

  it('untried channel (no CI doc) contributes neutral weights (sortScore in (0,1], no penalty)', async () => {
    const s = await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    // sortScore = rand * conv(1.0) * sq(1.0) => in (0,1].
    expect(s['untried']).toBeGreaterThan(0);
    expect(s['untried']).toBeLessThanOrEqual(1);
  });

  it('proven-dead channel weight ceiling is far below an untried channel ceiling', async () => {
    // Run many draws; the max achievable sortScore reflects the weight product.
    const maxDead = Math.max(...await Promise.all([...Array(200)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['dead'])));
    const maxUntried = Math.max(...await Promise.all([...Array(200)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['untried'])));
    // dead conv ~0.2, sq ~1.0 => ceiling ~0.2 ; untried ceiling ~1.0
    expect(maxDead).toBeLessThan(maxUntried);
    expect(maxDead).toBeLessThanOrEqual(0.2 * 1.1 + 0.02); // WEIGHT_MIN * SQ_MAX ceiling + slack
  });

  it('proven converter can exceed neutral ceiling (weight > 1 possible)', async () => {
    const maxConv = Math.max(...await Promise.all([...Array(400)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['converter'])));
    expect(maxConv).toBeGreaterThan(1); // WEIGHT_MAX(1.3) * SQ_MAX(1.1) ceiling ~1.43
  });

  it('delete-heavy channel (under 50% hard gate) is send-quality penalized vs a clean channel', async () => {
    // deletey survival ~0.55 shrunk => sq < 1 ; converter survival ~0.95 => sq ~1.1
    const maxDeletey = Math.max(...await Promise.all([...Array(400)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['deletey'])));
    // deletey conv is modest (3/100 ~ prior) and sq is depressed -> ceiling well under converter's
    const maxConv = Math.max(...await Promise.all([...Array(400)].map(async () => (await weights({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 }))['converter'])));
    expect(maxDeletey).toBeLessThan(maxConv);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts -t buildConversionAwareSortStages`
Expected: FAIL with `service.buildConversionAwareSortStages is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/components/active-channels/channel-intelligence-read.service.ts`, above the `@Injectable()` class (module scope), add the constants and the `FleetPrior` type:

```ts
// ─── Conversion-aware join-sort tuning (see spec 2026-08-01-conversion-aware-channel-join-design) ───
export const PRIOR_STRENGTH = 20;          // pseudo-sends of prior weight (conversion)
export const WEIGHT_MIN = 0.2;             // dead channels floor
export const WEIGHT_MAX = 1.3;             // converter ceiling (anti-clustering cap)
export const SQ_PRIOR_STRENGTH = 20;       // pseudo-sends of prior weight (send-quality)
export const SQ_MIN = 0.5;                 // delete-heavy floor (secondary nudge)
export const SQ_MAX = 1.1;                 // clean-survival ceiling
export const PRIOR_TTL_MS = 15 * 60 * 1000; // fleet-prior cache max age
export const PRIOR_RATE_FALLBACK = 0.03;   // used ONLY when fleet has zero sends
export const SQ_PRIOR_RATE_FALLBACK = 0.82;// used ONLY when fleet has zero sends

export interface FleetPrior {
  PRIOR_RATE: number;
  SQ_PRIOR_RATE: number;
}
```

Then add this method to the class (keep `PipelineStage` import — already present):

```ts
  /**
   * Returns the two pipeline stages that implement conversion-aware, stateless join sorting:
   *   sortScore = rand() × conversionWeight × sendQualityWeight
   * both weights shrunk toward the LIVE fleet prior (passed in). Pure function of (prior + constants);
   * no I/O. Spliced into each getActiveChannels pipeline in place of the old reaction/diversity sort.
   */
  buildConversionAwareSortStages(prior: FleetPrior): PipelineStage[] {
    const priorRate = prior?.PRIOR_RATE > 0 ? prior.PRIOR_RATE : PRIOR_RATE_FALLBACK;
    const sqPriorRate = prior?.SQ_PRIOR_RATE > 0 ? prior.SQ_PRIOR_RATE : SQ_PRIOR_RATE_FALLBACK;

    return [
      {
        $lookup: {
          from: 'channelIntelligence',
          localField: 'channelId',
          foreignField: 'channelId',
          as: '_ci',
        },
      },
      {
        $addFields: {
          sortScore: {
            $let: {
              vars: {
                ci: { $ifNull: [{ $arrayElemAt: ['$_ci', 0] }, {}] },
              },
              in: {
                $let: {
                  vars: {
                    attempted: { $ifNull: ['$$ci.outcomes.attempted', 0] },
                    credited: { $ifNull: ['$$ci.DMs.credited', 0] },
                    survived: { $ifNull: ['$$ci.outcomes.survived', 0] },
                  },
                  in: {
                    $let: {
                      vars: {
                        // conversion shrink toward live PRIOR_RATE, normalized so neutral == 1.0
                        conversionWeight: {
                          $min: [WEIGHT_MAX, { $max: [WEIGHT_MIN, {
                            $divide: [
                              { $divide: [
                                { $add: [{ $multiply: [priorRate, PRIOR_STRENGTH] }, '$$credited'] },
                                { $add: [PRIOR_STRENGTH, '$$attempted'] },
                              ] },
                              priorRate,
                            ],
                          }] }],
                        },
                        // send-quality shrink toward live SQ_PRIOR_RATE, normalized so neutral == 1.0
                        sendQualityWeight: {
                          $min: [SQ_MAX, { $max: [SQ_MIN, {
                            $divide: [
                              { $divide: [
                                { $add: [{ $multiply: [sqPriorRate, SQ_PRIOR_STRENGTH] }, '$$survived'] },
                                { $add: [SQ_PRIOR_STRENGTH, '$$attempted'] },
                              ] },
                              sqPriorRate,
                            ],
                          }] }],
                        },
                      },
                      in: { $multiply: [{ $rand: {} }, '$$conversionWeight', '$$sendQualityWeight'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { $project: { _ci: 0 } },
    ];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts -t buildConversionAwareSortStages`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/active-channels/channel-intelligence-read.service.ts src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts
git commit -m "feat(channels): add conversion-aware join-sort stage builder + tuning constants"
```

---

## Task 2: Live fleet prior `getFleetPrior()` with in-memory TTL cache + fallback

Computes `{ PRIOR_RATE, SQ_PRIOR_RATE }` live from `channelIntelligence` (fleet Σcredited/Σattempted and Σsurvived/Σattempted), caches the two floats for `PRIOR_TTL_MS`, and falls back to the literals only when the fleet has zero sends or the aggregation errors.

**Files:**
- Modify: `src/components/active-channels/channel-intelligence-read.service.ts`
- Test: `src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts`

**Interfaces:**
- Consumes: `FleetPrior`, `PRIOR_RATE_FALLBACK`, `SQ_PRIOR_RATE_FALLBACK`, `PRIOR_TTL_MS` (Task 1).
- Produces: `ChannelIntelligenceReadService.getFleetPrior(ttlMs?: number): Promise<FleetPrior>` — `ttlMs` defaults to `PRIOR_TTL_MS`; passing `0` forces recompute (tests). Never throws (fail-open to last cache or fallback).

- [ ] **Step 1: Write the failing test**

Add a `describe('ChannelIntelligenceReadService.getFleetPrior')` block to the same spec file:

```ts
describe('ChannelIntelligenceReadService.getFleetPrior', () => {
  it('computes live fleet prior from Σcredited/Σattempted and Σsurvived/Σattempted', async () => {
    const docs = [
      { outcomes: { attempted: 100, survived: 80 }, DMs: { credited: 5 } },
      { outcomes: { attempted: 100, survived: 84 }, DMs: { credited: 1 } },
    ]; // Σattempted=200, Σcredited=6 -> 0.03 ; Σsurvived=164 -> 0.82
    const model = {
      aggregate: () => ({ exec: async () => [{ totalCredited: 6, totalAttempted: 200, totalSurvived: 164 }] }),
    } as any;
    const svc = new ChannelIntelligenceReadService(model);
    const prior = await svc.getFleetPrior(0);
    expect(prior.PRIOR_RATE).toBeCloseTo(0.03, 5);
    expect(prior.SQ_PRIOR_RATE).toBeCloseTo(0.82, 5);
  });

  it('falls back to literals when the fleet has zero sends', async () => {
    const model = { aggregate: () => ({ exec: async () => [{ totalCredited: 0, totalAttempted: 0, totalSurvived: 0 }] }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    const prior = await svc.getFleetPrior(0);
    expect(prior.PRIOR_RATE).toBe(0.03);
    expect(prior.SQ_PRIOR_RATE).toBe(0.82);
  });

  it('fails open to fallback when the aggregation throws', async () => {
    const model = { aggregate: () => ({ exec: async () => { throw new Error('boom'); } }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    const prior = await svc.getFleetPrior(0);
    expect(prior.PRIOR_RATE).toBe(0.03);
    expect(prior.SQ_PRIOR_RATE).toBe(0.82);
  });

  it('caches within TTL: a second call inside the window does not re-query', async () => {
    const exec = jest.fn(async () => [{ totalCredited: 6, totalAttempted: 200, totalSurvived: 164 }]);
    const model = { aggregate: () => ({ exec }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    await svc.getFleetPrior(60_000);
    await svc.getFleetPrior(60_000);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('ttl=0 recomputes every call', async () => {
    const exec = jest.fn(async () => [{ totalCredited: 6, totalAttempted: 200, totalSurvived: 164 }]);
    const model = { aggregate: () => ({ exec }) } as any;
    const svc = new ChannelIntelligenceReadService(model);
    await svc.getFleetPrior(0);
    await svc.getFleetPrior(0);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts -t getFleetPrior`
Expected: FAIL with `svc.getFleetPrior is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add a private cache field and the method to the class. Note: uses `Date.now()` (allowed in app code; the `ttl=0` test path avoids any timing dependence).

```ts
  private _priorCache: { value: FleetPrior; at: number } | null = null;

  /**
   * Live fleet prior: PRIOR_RATE = Σcredited/Σattempted, SQ_PRIOR_RATE = Σsurvived/Σattempted,
   * over the whole channelIntelligence collection. Cached in-memory for `ttlMs` (two floats only).
   * Fails open to the last cached value, then to the measured literals. Never throws.
   */
  async getFleetPrior(ttlMs: number = PRIOR_TTL_MS): Promise<FleetPrior> {
    const now = Date.now();
    if (ttlMs > 0 && this._priorCache && now - this._priorCache.at < ttlMs) {
      return this._priorCache.value;
    }
    try {
      const [row] = await this.model
        .aggregate([
          {
            $group: {
              _id: null,
              totalCredited: { $sum: { $ifNull: ['$DMs.credited', 0] } },
              totalAttempted: { $sum: { $ifNull: ['$outcomes.attempted', 0] } },
              totalSurvived: { $sum: { $ifNull: ['$outcomes.survived', 0] } },
            },
          },
        ])
        .exec();

      const totalAttempted = row?.totalAttempted ?? 0;
      const value: FleetPrior = {
        PRIOR_RATE: totalAttempted > 0 ? (row.totalCredited ?? 0) / totalAttempted : PRIOR_RATE_FALLBACK,
        SQ_PRIOR_RATE: totalAttempted > 0 ? (row.totalSurvived ?? 0) / totalAttempted : SQ_PRIOR_RATE_FALLBACK,
      };
      this._priorCache = { value, at: now };
      return value;
    } catch (error) {
      this.logger.warn(
        `getFleetPrior failed, using ${this._priorCache ? 'cached' : 'fallback'} prior: ${error instanceof Error ? error.message : error}`,
      );
      return this._priorCache?.value ?? { PRIOR_RATE: PRIOR_RATE_FALLBACK, SQ_PRIOR_RATE: SQ_PRIOR_RATE_FALLBACK };
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts -t getFleetPrior`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/active-channels/channel-intelligence-read.service.ts src/components/active-channels/__tests__/channel-intelligence-read.service.spec.ts
git commit -m "feat(channels): add live self-calibrating fleet prior with in-memory TTL cache"
```

---

## Task 3: Wire the helper into `ActiveChannelsService.getActiveChannels`

Replace the old `random × reactionWeight × diversityWeight` `$addFields` with `getFleetPrior()` + `buildConversionAwareSortStages(prior)`, preserving every surrounding stage and the post-fetch safety exclusion.

**Files:**
- Modify: `src/components/active-channels/active-channels.service.ts:400-423`
- Test: `src/components/active-channels/__tests__/active-channels.service.spec.ts`

**Interfaces:**
- Consumes: `getFleetPrior()`, `buildConversionAwareSortStages(prior)` (Tasks 1-2), via the already-injected `this.channelIntelligenceReadService`.
- Produces: unchanged public signature `getActiveChannels(limit, skip, notIds): Promise<ActiveChannel[]>`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/active-channels/__tests__/active-channels.service.spec.ts`. This is a wiring test: it spies on the read service and asserts the pipeline no longer contains the old diversity divide and does contain the lookup. Mock the aggregate to capture the pipeline.

```ts
describe('getActiveChannels uses conversion-aware sort (no reaction/diversity)', () => {
  it('calls getFleetPrior and splices the lookup-based sort stages', async () => {
    // Arrange a service instance with mocked model + read service.
    const captured: any[] = [];
    const activeChannelModel: any = {
      aggregate: (pipeline: any[]) => { captured.push(pipeline); return { exec: async () => [] }; },
    };
    const readSvc: any = {
      getFleetPrior: jest.fn(async () => ({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 })),
      buildConversionAwareSortStages: jest.fn(() => [
        { $lookup: { from: 'channelIntelligence', localField: 'channelId', foreignField: 'channelId', as: '_ci' } },
        { $addFields: { sortScore: { $rand: {} } } },
        { $project: { _ci: 0 } },
      ]),
      getExcludedChannelIds: jest.fn(async () => new Set()),
    };
    // Construct via the class with these deps (match the real constructor param order).
    const svc: any = Object.create(ActiveChannelsService.prototype);
    svc.activeChannelModel = activeChannelModel;
    svc.channelIntelligenceReadService = readSvc;
    svc.MIN_PARTICIPANTS_COUNT = 600;
    svc.DEFAULT_LIMIT = 50; svc.DEFAULT_SKIP = 0;
    svc.logger = { warn: () => {}, error: () => {} };
    svc.handleError = (e: any) => e;

    await svc.getActiveChannels(50, 0, []);

    expect(readSvc.getFleetPrior).toHaveBeenCalled();
    expect(readSvc.buildConversionAwareSortStages).toHaveBeenCalledWith({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    const pipeline = captured[0];
    const json = JSON.stringify(pipeline);
    expect(json).toContain('channelIntelligence');            // lookup spliced in
    expect(json).not.toContain('reactRestricted');            // reaction weight gone
    expect(json).not.toContain('clientsJoined');              // diversity weight gone
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/active-channels/__tests__/active-channels.service.spec.ts -t "conversion-aware sort"`
Expected: FAIL — pipeline still contains `reactRestricted` / `clientsJoined`, and `buildConversionAwareSortStages` not called.

- [ ] **Step 3: Write minimal implementation**

In `src/components/active-channels/active-channels.service.ts`, replace the pipeline construction (currently lines ~400-423). Fetch the prior first, then splice the helper's stages in place of the old `$addFields`:

```ts
      const prior = await this.channelIntelligenceReadService.getFleetPrior();

      const pipeline: PipelineStage[] = [
        { $match: query },
        // Conversion-aware, stateless sort (spec 2026-08-01): random × conversionWeight ×
        // sendQualityWeight, both shrunk toward the live fleet prior. Replaces the old
        // reactRestricted/clientsJoined weighting.
        ...this.channelIntelligenceReadService.buildConversionAwareSortStages(prior),
        { $sort: { sortScore: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { sortScore: 0 } },
      ];
```

Leave the `$match query`, the results/`getExcludedChannelIds` block, and everything else exactly as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/active-channels/__tests__/active-channels.service.spec.ts -t "conversion-aware sort"`
Expected: PASS.

Also run the whole file to confirm no regression:
Run: `npx jest src/components/active-channels/__tests__/active-channels.service.spec.ts`
Expected: PASS (pre-existing tests still green; if a pre-existing test asserted the old `reactRestricted`/`clientsJoined` sort, update that assertion to the new pipeline shape as part of this step).

- [ ] **Step 5: Commit**

```bash
git add src/components/active-channels/active-channels.service.ts src/components/active-channels/__tests__/active-channels.service.spec.ts
git commit -m "feat(active-channels): use conversion-aware fleet-prior sort in getActiveChannels"
```

---

## Task 4: Wire the helper into `ChannelsService.getActiveChannels`

Symmetric change to the second pipeline (`≥220` channels path), consuming the SAME helper — proves DRY.

**Files:**
- Modify: `src/components/channels/channels.service.ts:251-268`
- Test: `src/components/channels/__tests__/channels.service.spec.ts`

**Interfaces:**
- Consumes: `getFleetPrior()`, `buildConversionAwareSortStages(prior)` via `this.channelIntelligenceReadService` (already injected — see `channels.module.ts:24`).
- Produces: unchanged public signature `getActiveChannels(limit, skip, notIds)`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/channels/__tests__/channels.service.spec.ts`:

```ts
describe('ChannelsService.getActiveChannels uses conversion-aware sort', () => {
  it('calls getFleetPrior and splices the lookup-based sort stages', async () => {
    const captured: any[] = [];
    const ChannelModel: any = {
      aggregate: (pipeline: any[]) => { captured.push(pipeline); return { exec: async () => [] }; },
    };
    const readSvc: any = {
      getFleetPrior: jest.fn(async () => ({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 })),
      buildConversionAwareSortStages: jest.fn(() => [
        { $lookup: { from: 'channelIntelligence', localField: 'channelId', foreignField: 'channelId', as: '_ci' } },
        { $addFields: { sortScore: { $rand: {} } } },
        { $project: { _ci: 0 } },
      ]),
      getExcludedChannelIds: jest.fn(async () => new Set()),
    };
    const svc: any = Object.create(ChannelsService.prototype);
    svc.ChannelModel = ChannelModel;
    svc.channelIntelligenceReadService = readSvc;

    await svc.getActiveChannels(50, 0, []);

    expect(readSvc.getFleetPrior).toHaveBeenCalled();
    expect(readSvc.buildConversionAwareSortStages).toHaveBeenCalledWith({ PRIOR_RATE: 0.03, SQ_PRIOR_RATE: 0.82 });
    const json = JSON.stringify(captured[0]);
    expect(json).toContain('channelIntelligence');
    expect(json).not.toContain('reactRestricted');
    expect(json).not.toContain('clientsJoined');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/channels/__tests__/channels.service.spec.ts -t "conversion-aware sort"`
Expected: FAIL — old pipeline still present.

- [ ] **Step 3: Write minimal implementation**

In `src/components/channels/channels.service.ts`, replace the pipeline block (currently lines ~251-268):

```ts
      const prior = await this.channelIntelligenceReadService.getFleetPrior();

      const pipeline: PipelineStage[] = [
        { $match: query },
        // Conversion-aware, stateless sort (spec 2026-08-01) — same shared helper as ActiveChannelsService.
        ...this.channelIntelligenceReadService.buildConversionAwareSortStages(prior),
        { $sort: { sortScore: -1 as const } },
        { $skip: skip },
        { $limit: limit },
        { $project: { sortScore: 0 } }
      ];
```

Leave the `$match query`, the `result`/`getExcludedChannelIds` block, and the `catch` (returns `[]`) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/channels/__tests__/channels.service.spec.ts`
Expected: PASS (new wiring test + pre-existing tests; update any pre-existing test that asserted the old sort shape).

- [ ] **Step 5: Commit**

```bash
git add src/components/channels/channels.service.ts src/components/channels/__tests__/channels.service.spec.ts
git commit -m "feat(channels): use conversion-aware fleet-prior sort in getActiveChannels (DRY with active-channels)"
```

---

## Task 5: Stop writing the inaccurate `clientsJoined` counter

The diversity weight is gone (Tasks 3-4), so the monotonic `incrementClientsJoined` write is now pure cost with no reader. Remove its single call site. Leave the schema field and the method in place (harmless, avoids a migration; the method simply becomes unused).

**Files:**
- Modify: `src/components/shared/base-client.service.ts:1719`
- Test: `src/components/active-channels/__tests__/active-channels.service.spec.ts` (assert the field is no longer in any join-sort pipeline — already covered by Task 3's `not.toContain('clientsJoined')`; this task adds a guard that no code path calls the increment during a join).

- [ ] **Step 1: Write the failing test**

Confirm there are no remaining callers programmatically (this doubles as the regression guard). Add a tiny structural test file `src/components/active-channels/__tests__/clients-joined-unused.spec.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

describe('clientsJoined counter is no longer written', () => {
  it('has zero calls to incrementClientsJoined outside its own definition', () => {
    const root = path.resolve(__dirname, '../../../');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) {
          const text = fs.readFileSync(full, 'utf8');
          // The definition line contains "async incrementClientsJoined"; a *call* is ".incrementClientsJoined("
          if (/\.incrementClientsJoined\s*\(/.test(text)) hits.push(full);
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/active-channels/__tests__/clients-joined-unused.spec.ts`
Expected: FAIL — `base-client.service.ts` still calls `.incrementClientsJoined(`.

- [ ] **Step 3: Write minimal implementation**

In `src/components/shared/base-client.service.ts` around line 1719, remove the fire-and-forget call. Current line:

```ts
                        this.activeChannelsService.incrementClientsJoined(currentChannel.channelId).catch(() => {});
```

Replace it with a short comment explaining why (so the next reader doesn't "restore" it):

```ts
                        // clientsJoined counter removed (spec 2026-08-01): it was a monotonic,
                        // never-decremented signal driving the old diversity sort, which is now
                        // pure random spread. No join-selection code reads clientsJoined anymore.
```

If removing the statement leaves an empty/dangling block or an unused `currentChannel` reference, adjust minimally to keep it compiling — do not refactor surrounding logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/active-channels/__tests__/clients-joined-unused.spec.ts`
Expected: PASS.

Then confirm the build still compiles:
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors from this change.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/base-client.service.ts src/components/active-channels/__tests__/clients-joined-unused.spec.ts
git commit -m "chore(channels): stop writing inaccurate clientsJoined counter (diversity weight removed)"
```

---

## Task 6: Full-suite green + typecheck + spec cross-check

Final verification that the whole change compiles and the existing suites pass, and a read-only sanity note for the canary.

**Files:**
- No source changes expected. Fix only what breaks.

- [ ] **Step 1: Run the two service suites + the read-service suite together**

Run: `npx jest src/components/active-channels src/components/channels`
Expected: PASS. If a pre-existing test asserts the old sort, update it to the new pipeline shape (this is expected fallout, not a new feature).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit any test-assertion updates**

```bash
git add -A
git commit -m "test(channels): update pre-existing sort assertions to conversion-aware pipeline"
```

(If nothing changed, skip this commit.)

---

## Rollout / rollback (post-implementation, not a code task)

- **Canary:** deploy to one client pool / one VM first. Watch: join distribution (are dead channels joined less?), fleet DM-per-send trend, `USER_BANNED_IN_CHANNEL` rate, and log the computed live `PRIOR_RATE`/`SQ_PRIOR_RATE` once to confirm ≈0.03 / ≈0.82. Widen after it holds ~24h.
- **Rollback:** revert the two `getActiveChannels` sort edits (Tasks 3-4). Instant, no data cleanup — nothing was persisted. Restoring `incrementClientsJoined` (Task 5) and the old diversity weight is optional and independent.
