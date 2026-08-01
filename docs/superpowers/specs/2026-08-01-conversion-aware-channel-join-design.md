# Conversion-Aware, Stateless Channel Joining — Design

> Service: **CommonTgService** only. Created 2026-08-01.
> Companion analysis (live data, 2026-08-01): 8,507 posted-to channels, 3.05% fleet DM/send;
> 64% of channels drive 0 DMs yet absorb 39% of sends; the live join-exclusion is safety-only and
> misses ~2,101 proven-dead channels burning ~36% of fleet sends for zero DMs.

## Goal

Make warmup/join channel-selection **fade proven-dead channels** (many sends, zero DMs) toward the
back of the selection order, while **preserving randomized spread and full exploration of untried
channels**. The mechanism is **stateless and dynamic**: computed live from existing data at query
time, with **no persisted score, no cached field, no Redis prior, no backfill, no fixed thresholds.**

Non-goal: changing promotion (posting) selection, the conversation engine, or account
health/rest logic. Those are separate. This spec touches only *which channels an account joins*.

## Background: what exists today

Both client pools (buffer and promote) select channels to join through the same path:
`fetchJoinableChannels` → `ActiveChannelsService.getActiveChannels` (when the account has < 220
channels) or `ChannelsService.getActiveChannels` (≥ 220). Both `getActiveChannels` implementations
use an **identical** aggregation sort:

```
sortScore = random()
          × reactionWeight   // ×0.3 if reactRestricted, else ×1
          × diversityWeight  // 1 / (clientsJoined + 1)
```

then `$sort: {sortScore:-1}`, `$skip`, `$limit`, and a post-fetch safety exclusion via
`ChannelIntelligenceReadService.getExcludedChannelIds` (blocked / consecutiveErrors≥3 /
deleted-rate>0.5 — **all send-safety, no conversion**).

Two established facts drive this design:

1. **`clientsJoined` cannot track diversification accurately.** It is a monotonic counter
   (`incrementClientsJoined` does `$inc:+1` on join) that is **never decremented** on leave, ban,
   recycle, swap, or account death. It counts historical *join events*, not *current live members*.
   Over time it drifts: a channel 50 accounts joined-then-left still reads `clientsJoined: 50`,
   steering the fleet away from good channels based on ghost joins. It is an unreliable signal.

2. **Conversion data exists but is unused for selection.** `channelIntelligence` holds per-channel
   `outcomes.attempted` (sends) and `DMs.credited` (attributed DMs). The DM-per-send spread is
   enormous (dead 0% vs strong >5%, top channels 300%+), but selection ignores it entirely.

## Design

### The one change: the selection sort

Replace the sort expression in **both** `getActiveChannels` pipelines:

**From:** `random() × reactionWeight × diversityWeight(1/clientsJoined)`

**To:** `random() × reactionWeight × conversionWeight`

- `random()` — **kept.** With ~8,700 joinable channels and per-query `$rand()`, 100+ accounts
  distribute naturally. Randomness is the spread mechanism (and is itself anti-detection: no stable
  join order). It replaces the broken `clientsJoined` diversity weight.
- `reactionWeight` — **kept unchanged** (`×0.3` if `reactRestricted`, else `×1`).
- `conversionWeight` — **NEW**, stateless, defined below.

`diversityWeight (1/(clientsJoined+1))` is **removed** — the counter is provably inaccurate (fact 1).

### `conversionWeight` — stateless, computed live via `$lookup`

Inside each `getActiveChannels` aggregation, before `$addFields: sortScore`, add a `$lookup` from
the channel collection → `channelIntelligence` on `channelId`, then compute the weight inline from
the joined `outcomes.attempted` and `DMs.credited`. No field is written back.

**Empirical-Bayes shrinkage** toward a **fleet-neutral prior**, expressed as pseudo-counts so it is
a pure inline formula (no persisted prior):

```
attempted = ifNull(ci.outcomes.attempted, 0)     // 0 when no channelIntelligence doc / never posted
credited  = ifNull(ci.DMs.credited, 0)

// Prior = the fleet DM-per-send as pseudo-observations. PRIOR_RATE ≈ 0.03 (3% — the measured
// fleet DM/send). PRIOR_STRENGTH = pseudo-sends of prior weight (see "Tuning constants").
shrunkRate = (PRIOR_RATE * PRIOR_STRENGTH + credited)
           / (PRIOR_STRENGTH + attempted)

// Map shrunkRate → a narrow multiplier so it MODULATES but never dominates random().
// Normalize against PRIOR_RATE so "neutral" (shrunkRate == PRIOR_RATE) maps to 1.0.
raw            = shrunkRate / PRIOR_RATE          // 1.0 at neutral; <1 dead-leaning; >1 converter
conversionWeight = clamp(raw, WEIGHT_MIN, WEIGHT_MAX)   // e.g. [0.2, 1.3]
```

**Why this satisfies every requirement:**

- **Stateless / not tracked:** every value is read live from existing `outcomes`/`DMs`; nothing is
  persisted. Rollback = delete the `$lookup` + `conversionWeight` factor.
- **Dynamic / relative, no thresholds:** the weight is a *continuous* function of evidence. "How
  dead" is not a cutoff — a channel with 10 sends/0 DMs is mildly down-weighted; 200 sends/0 DMs is
  strongly down-weighted; both via the same formula.
- **Untried channels stay fully explorable (the critical edge case):** with `attempted=0, credited=0`,
  `shrunkRate = (PRIOR_RATE*PRIOR_STRENGTH)/(PRIOR_STRENGTH) = PRIOR_RATE` → `raw = 1.0` →
  `conversionWeight = 1.0`. A channel with **no channelIntelligence doc** takes the `$lookup`
  empty-array path, `$ifNull`→0, and lands at exactly neutral. **No penalty for zero evidence, by
  construction — not a special case.** This preserves the ~62% unknown-channel exploration headroom.
- **No division-by-zero / NaN:** the denominator is `PRIOR_STRENGTH + attempted ≥ PRIOR_STRENGTH > 0`
  always. `$ifNull` guards `attempted`/`credited` to 0 **before** any arithmetic. A NaN `sortScore`
  would sort unpredictably and silently break exploration, so this is a hard requirement + a test.
- **Diversity preserved without tracking:** two channels with equal conversion evidence differ only
  by `random()` → still spread/shuffled. Dead channels fade; equally-good channels stay randomized.

### Tuning constants (named, in one place)

| Constant | Value | Meaning |
|---|---|---|
| `PRIOR_RATE` | `0.03` | Fleet DM-per-send (measured 3.05%). The neutral point. |
| `PRIOR_STRENGTH` | `20` | Pseudo-sends of prior weight. Higher = more shrinkage (slower to trust a channel's own rate); ~20 means a channel needs ~20 real sends before its own signal outweighs the prior. |
| `WEIGHT_MIN` | `0.2` | Dead channels fade to 0.2× (never fully vanish — occasional re-test). |
| `WEIGHT_MAX` | `1.3` | Proven converters get a mild lift, capped so they don't become account magnets (anti-clustering). |

These live as named constants at the top of the shared logic (see "Structure"), so tuning is one
edit and both collections agree.

### Structure — keep it DRY across the two collections

`active-channels.service.ts` and `channels.service.ts` currently duplicate the sort pipeline. To
avoid the two drifting, extract the conversion `$lookup` + `sortScore` pipeline stages into a small
shared helper (e.g. `buildConversionAwareSortStages()` in a shared util or on
`ChannelIntelligenceReadService`, which already owns channelIntelligence reads). Both services call
it. One definition, one place to tune, one place to test. Do **not** otherwise refactor these files.

### What is explicitly KEPT unchanged

- The negative-keyword title/username filters.
- Quality gates: `participantsCount > MIN` (600 activeChannels / 1000 channels), `username != null`,
  `canSendMsgs`, `banned/forbidden/private/broadcast` excluded.
- `reactionWeight` (`reactRestricted` → ×0.3).
- The post-fetch **safety** exclusion `getExcludedChannelIds` (blocked / consecutiveErrors≥3 /
  deleted-rate>0.5). Conversion is a *soft tilt in the sort*; safety stays a *hard gate*. They are
  complementary and both remain.
- Daily join caps, join intervals, jitter, permanent-error deactivation — untouched.

### `clientsJoined` cleanup

`incrementClientsJoined` and the `clientsJoined` field become **unused for selection**. The design
**stops calling `incrementClientsJoined`** (it wrote an inaccurate signal at a cost on every join)
and removes the `diversityWeight` factor. The `clientsJoined` schema field is left in place
(harmless, avoids a migration); it simply stops being written and read. Flag any other readers of
`clientsJoined` during implementation — if none, the field is inert.

## Data flow

```
join loop (buffer or promote)
  → account has < channelTarget channels
  → fetchJoinableChannels(currentCount, remainingDailyBudget, alreadyJoinedIds)
      → currentCount < 220 : ActiveChannelsService.getActiveChannels(...)
      → else               : ChannelsService.getActiveChannels(...)
          [$match quality+keyword gates]
          [$lookup channelIntelligence on channelId]   ← NEW
          [$addFields sortScore = random × reaction × conversionWeight(shrunk)]  ← CHANGED
          [$sort desc][$skip][$limit][$project]
          → getExcludedChannelIds (safety) removes blocked/error/high-delete   ← unchanged
  → queue the returned channels for joining (rate-limited, jittered)
```

## Error handling

- **Missing channelIntelligence doc** → `$lookup` empty → `$ifNull`→0 → weight = 1.0 (neutral).
  Explicit requirement + test.
- **`$lookup` / aggregation failure** → same fail-open posture the code already uses for
  `getExcludedChannelIds`: if the conversion stage errors, fall back to the prior behavior
  (random × reaction, no conversion tilt) rather than returning zero channels. Never let the tilt
  starve the join pipeline.
- **PRIOR_RATE mis-set to 0** → guarded: constant is a fixed non-zero literal; a unit test asserts
  it is > 0 so the normalization can't divide by zero.

## Testing

Unit tests (pure pipeline / formula, no live keys):

1. **Untried channel (no CI doc / attempted=0)** → conversionWeight == 1.0 (neutral), channel is
   still selectable. *(The exploration-preservation guarantee.)*
2. **Proven dead (attempted high, credited=0)** → conversionWeight near WEIGHT_MIN; ranks below an
   equal untried channel given equal random draw.
3. **Proven converter (credited/attempted well above PRIOR_RATE)** → conversionWeight > 1.0, capped
   at WEIGHT_MAX.
4. **Two equal-conversion channels** → order differs only by random() across runs (spread preserved).
5. **No NaN:** attempted=0, credited=0 produces a finite weight; sortScore is finite.
6. **Fail-open:** conversion stage error → falls back to random×reaction selection, returns channels.
7. **Both services** produce equivalent conversionWeight for the same (attempted, credited) — proves
   the shared helper is actually shared.

Live validation (read-only, before canary): sample the ~2,101 currently-unexcluded dead channels →
confirm low conversionWeight; sample the ~62% unknown pool → confirm ≈1.0.

## Rollout / rollback

- **Lowest-risk shape:** one aggregation `$lookup` + a changed `sortScore` expression, stateless.
- **No migration, no backfill, no new field, no Redis, no deploy-order dependency** — explicitly
  unlike the prior (reverted) `conversionRateShrunk` design, which failed on index-name collisions
  and cold-prior hard-fails. This design persists nothing, so none of those failure modes exist.
- **Canary:** deploy to one client pool / one VM first; watch join distribution (are dead channels
  getting joined less?), fleet DM-per-send trend, and the `USER_BANNED_IN_CHANNEL` rate. Widen after
  it holds.
- **Rollback:** revert the sort expression (and restore `diversityWeight` if desired). Instant, no
  data cleanup.

## Open items resolved during implementation (not blockers)

- Exact home of the shared `buildConversionAwareSortStages()` helper (util vs
  `ChannelIntelligenceReadService`).
- Whether any code other than the sort reads `clientsJoined` (if so, leave the increment; if not,
  remove it).
- Final `PRIOR_STRENGTH` value (~20) — start conservative; it only affects how fast a channel's own
  signal overrides the prior, and is a one-line tune behind a named constant.
