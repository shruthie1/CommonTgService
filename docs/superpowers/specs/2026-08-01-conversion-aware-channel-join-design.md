# Conversion-Aware, Stateless Channel Joining — Design

> Service: **CommonTgService** only. Created 2026-08-01.
> Companion analysis (live data, 2026-08-01): 8,507 posted-to channels, 3.05% fleet DM/send;
> 64% of channels drive 0 DMs yet absorb 39% of sends; the live join-exclusion is safety-only and
> misses ~2,101 proven-dead channels burning ~36% of fleet sends for zero DMs.

## Goal

Make warmup/join channel-selection **fade proven-dead channels** (many sends, zero DMs) — and,
secondarily, **fade delete-heavy/hostile channels** — toward the back of the selection order, while
**preserving randomized spread and full exploration of untried channels**. The mechanism is
**stateless and dynamic**: computed live from existing `channelIntelligence` data (`outcomes` +
`DMs`) at query time, with **no persisted score, no cached field, no Redis prior, no backfill, no
fixed thresholds.** The reaction-restricted weight is dropped (no usable per-channel reaction data).

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

### The change: the selection sort

Replace the sort expression in **both** `getActiveChannels` pipelines:

**From:** `random() × reactionWeight × diversityWeight(1/clientsJoined)`

**To:** `random() × conversionWeight × sendQualityWeight`

- `random()` — **kept.** With ~8,700 joinable channels and per-query `$rand()`, 100+ accounts
  distribute naturally. Randomness is the spread mechanism (and is itself anti-detection: no stable
  join order). It replaces the broken `clientsJoined` diversity weight.

  **Overlap analysis (decision: pure random is sufficient).** Each mobile joins ~350 channels from
  a ~8,700 pool. Expected joins-per-channel ≈ `100 mobiles × 350 / 8,700 ≈ 4` — which matches the
  measured live spread today (avg 2.2, max 11, zero channels over-concentrated). Random distributes
  evenly *in expectation*; it does not *actively* avoid overlap (it is memoryless). Active avoidance
  would require accurate live per-channel membership across 100+ churning accounts — impractical and
  the reason the monotonic `clientsJoined` counter was inaccurate in the first place. At this
  pool-to-demand ratio, natural random spread keeps overlap low without any tracking, so no active
  de-clustering is added. (Already-joined channels are still excluded per-mobile via `notIds`.) The
  conversion tilt (capped 1.3×) only mildly concentrates toward good channels — overlap stays bounded.
- `conversionWeight` — **NEW**, stateless, the **primary** worth signal (DMs-per-send). Defined below.
- `sendQualityWeight` — **NEW**, stateless, a **secondary** signal from `outcomes.survived`/`deleted`
  (do posts stick here?). Defined below.

**Two factors are REMOVED:**
- `diversityWeight (1/(clientsJoined+1))` — the counter is provably inaccurate (fact 1); randomness
  replaces it.
- `reactionWeight (×0.3 if reactRestricted)` — **dropped entirely.** Rationale (measured):
  `reactRestricted` is set on only **84 of 41,986 channels (0.2%)**, and **no per-channel reaction
  count is stored** on `channelIntelligence` (reaction stats are per-mobile daily aggregates in
  `reactionStatsDaily`, not per-channel), so reactions carry no usable channel-join signal. Removing
  it simplifies the sort with negligible behavioral change. (This does NOT touch the reaction
  *service* that reacts to messages — only the `reactRestricted` factor in the join sort.)

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
  (see also `sendQualityWeight` below, which shares the same guard requirement)
  would sort unpredictably and silently break exploration, so this is a hard requirement + a test.
- **Diversity preserved without tracking:** two channels with equal conversion evidence differ only
  by `random()` → still spread/shuffled. Dead channels fade; equally-good channels stay randomized.

### `sendQualityWeight` — secondary, stateless (from the same `$lookup`)

A channel can have good past conversion yet start rejecting/deleting posts (or accept posts but
delete them). `sendQualityWeight` is a graded tilt on send outcomes, sitting **below** the existing
hard exclusion (`deleted/attempted > 0.5` still hard-excludes; see "kept unchanged"). It grades the
0–50% range so a 30%-delete channel ranks below a clean one without being removed:

```
attempted = ifNull(ci.outcomes.attempted, 0)
survived  = ifNull(ci.outcomes.survived, 0)
deleted   = ifNull(ci.outcomes.deleted, 0)

// survivalRate over the same shrink prior idea so low-sample stays neutral.
survivalRate = (SQ_PRIOR_RATE * SQ_PRIOR_STRENGTH + survived)
             / (SQ_PRIOR_STRENGTH + attempted)     // SQ_PRIOR_RATE ≈ 0.82 (measured avg survive)
sendQualityWeight = clamp(survivalRate / SQ_PRIOR_RATE, SQ_MIN, SQ_MAX)   // e.g. [0.5, 1.1]
```

- **Untried channel (attempted=0):** `survivalRate = SQ_PRIOR_RATE` → weight = 1.0 (neutral, same
  guarantee as conversion — no NaN, fully explorable).
- **Delete-heavy / low-survive (below the 50% hard cliff):** survivalRate drops → weight toward
  SQ_MIN (0.5) → ranks lower.
- **Range is narrower than conversion** (0.5–1.1 vs 0.2–1.3): send-quality is a *secondary* nudge;
  conversion is the primary worth signal. A channel that survives fine but never converts should
  still fade (conversion dominates); send-quality only additionally penalizes hostile-to-posting
  channels that slip under the hard gate.
- **Stateless / same `$lookup`:** reuses the one channelIntelligence join; no extra query. Same
  `$ifNull`-before-arithmetic NaN guard.

### Tuning constants (named, in one place)

| Constant | Value | Meaning |
|---|---|---|
| `PRIOR_RATE` | `0.03` | Fleet DM-per-send (measured 3.05%). The neutral point. |
| `PRIOR_STRENGTH` | `20` | Pseudo-sends of prior weight. Higher = more shrinkage (slower to trust a channel's own rate); ~20 means a channel needs ~20 real sends before its own signal outweighs the prior. |
| `WEIGHT_MIN` | `0.2` | Dead channels fade to 0.2× (never fully vanish — occasional re-test). |
| `WEIGHT_MAX` | `1.3` | Proven converters get a mild lift, capped so they don't become account magnets (anti-clustering). |
| `SQ_PRIOR_RATE` | `0.82` | Fleet avg survive-rate (measured 81.7%). Neutral point for send-quality. |
| `SQ_PRIOR_STRENGTH` | `20` | Pseudo-sends of send-quality prior. |
| `SQ_MIN` | `0.5` | Delete-heavy channels floor (secondary nudge, milder than conversion). |
| `SQ_MAX` | `1.1` | Clean channels get a slight lift, tightly capped. |

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
- The post-fetch **safety** exclusion `getExcludedChannelIds` (blocked / consecutiveErrors≥3 /
  deleted-rate>0.5). Conversion + send-quality are *soft tilts in the sort*; safety stays a *hard
  gate*. They are complementary and all remain. (Note: `reactionWeight` is NOT in this list — it is
  removed, see "Two factors are REMOVED" above.)
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
          [$addFields sortScore = random × conversionWeight(shrunk) × sendQualityWeight]  ← CHANGED
          [$sort desc][$skip][$limit][$project]
          → getExcludedChannelIds (safety) removes blocked/error/high-delete   ← unchanged
  → queue the returned channels for joining (rate-limited, jittered)
```

## Error handling

- **Missing channelIntelligence doc** → `$lookup` empty → `$ifNull`→0 → weight = 1.0 (neutral).
  Explicit requirement + test.
- **`$lookup` / aggregation failure** → same fail-open posture the code already uses for
  `getExcludedChannelIds`: if the conversion stage errors, fall back to random-only selection
  (no conversion/send-quality tilt) rather than returning zero channels. Never let the tilt
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
5. **No NaN:** attempted=0, credited=0 produces finite conversionWeight AND sendQualityWeight; sortScore finite.
6. **Fail-open:** conversion/lookup stage error → falls back to random-only selection, returns channels.
7. **Both services** produce equivalent weights for the same (attempted, survived, deleted, credited) —
   proves the shared helper is actually shared.
8. **sendQualityWeight — untried channel** (attempted=0) → weight 1.0 (neutral, explorable).
9. **sendQualityWeight — delete-heavy under the hard cliff** (e.g. 40% deleted, not >50%) → weight
   toward SQ_MIN; ranks below a clean-survival channel.
10. **reactionWeight removed** → a `reactRestricted:true` channel is no longer penalized in the sort
    (only conversion + send-quality + random apply).

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
