# Lifecycle Channel-Threshold Model — Refactor Design

**Status:** proposal, not implemented
**Date:** 2026-08-15
**Confirmed in production:** 28 active promote accounts stranded; only 6 of 35 READY accounts usable

---

## 1. The defect, stated once

There is exactly **one** modelling error, and every symptom descends from it:

> `getWarmupPhaseAction(doc, now)` decides phase transitions for BOTH pools but receives no pool
> configuration, so it can only use a hard-coded `MIN_CHANNELS_FOR_MATURING = 200`
> (`warmup-phases.ts:47`). Every OTHER gate in the system correctly reads
> `config.operationalChannelThreshold`.

The base class already parameterises the floor at **8 sites** — join eligibility (`:391`),
operational eligibility (`:400`, `:413`), reconciliation (`:1777`), health (`:2260`, `:2273`), and
rotation refusal (`:2677`, `:2679`). The phase machine is the only participant blind to it.

With promote at 230 and the machine at 200, the 200–229 band is a trap:

| Gate | Behaviour for a promote account at 207 channels |
|---|---|
| Phase machine (`warmup-phases.ts:47`) | advances it to READY — thinks 200 is enough |
| Warmup loop (`promote-client.service.ts:1040`) | `continue` — skips READY accounts entirely |
| Rotation (`base-client.service.ts:2677`) | refuses — below the 230 floor |

Invisible to the thing that would grow it; refused by the thing that would use it.

**Buffer is immune only by coincidence**: its floor is 200, exactly equal to the hard-coded constant
(`buffer-client.service.ts:252`). The bug has always been there; buffer just never hit it.

---

## 2. Why patching is the wrong response

The four obvious patches — make the constant configurable, add a READY salvage, backfill the
stranded rows, add recovery-first ordering for promote — each fix a symptom. None prevents the next
threshold from drifting out of agreement, and there are already **three** distinct channel numbers
in play per pool (`channelTarget` 350, `operationalChannelThreshold` 200/230, the phase constant
200) with no invariant tying them together.

The refactor makes the relationship explicit and enforceable instead.

---

## 3. The model

Three thresholds, one owner, one stated invariant:

```
enrolled ──► settling ──► identity ──► growing ──► maturing ──► ready ──► session_rotated
                                          │                        │
                                          │                        └── operationalFloor
                                          │                            (usable as supply)
                                          └── advancementFloor
                                              (enough to leave growing)

                          joinTarget  ── keep joining until here (headroom above the floor)
```

**INVARIANT: `advancementFloor === operationalFloor`.**

An account must never be advanced past growing on a channel count that a later gate will reject.
Today promote violates this (200 vs 230). The invariant is what makes the trap structurally
impossible rather than accidentally avoided.

`joinTarget > operationalFloor` gives headroom so ordinary channel churn does not immediately drop
an account below the floor.

### Concretely

| Pool | advancementFloor | operationalFloor | joinTarget |
|---|---|---|---|
| buffer | 200 | 200 | 350 |
| promote | **230** (was 200) | 230 | 350 |

Promote's advancement floor rises to match its own floor. No account will reach READY under-qualified
again.

---

## 4. Changes

**4.1 — Pass the threshold into the phase machine.**
`getWarmupPhaseAction(doc, now, thresholds)` gains a third parameter carrying the pool's floors.
`MIN_CHANNELS_FOR_MATURING` becomes the DEFAULT, not the law. Five call sites
(`base-client.service.ts:1319,1430`, `promote-client.service.ts:1041`,
`buffer-client.service.ts:1127,1377`) pass `this.config`.

**4.2 — One accessor for the floor.**
The `?? MIN_CHANNELS_FOR_MATURING` fallback is currently repeated at 8 sites. Replace with a single
`protected get operationalFloor()` on the base class. One place to read, one place to change.

**4.3 — Assert the invariant at construction.**
Each pool's config is validated on service init: `advancementFloor === operationalFloor`, and
`joinTarget > operationalFloor`. A future config that reintroduces the mismatch fails loudly at boot
rather than silently stranding accounts weeks later.

**4.4 — Close the READY gate hole.**
The growing phase already has a deadline salvage (`GROWING_ADVANCE_DEADLINE_DAYS`, added in
`1bb5c0d3`) so no account stalls there forever. READY has no counterpart, which is why the salvage
actively MANUFACTURES stranded accounts: after 30 days it drops the channel target to 0 and pushes
join-starved accounts to READY with whatever they have — 22 promote accounts are currently READY
below 200, one with **2 channels**.

Fix: the warmup loop stops skipping READY accounts that are below the operational floor. They are
not "done"; they need channels. Same treatment for `SESSION_ROTATED` — 21 accounts sit there in the
200–229 band, terminal with no re-entry.

**4.5 — Recovery-first ordering for promote.**
Buffer has `findPrioritizedJoinCandidates` (`buffer-client.service.ts:170-197`) which front-loads
terminal-but-underfilled accounts. Promote sorts plainly by `channels: -1`
(`promote-client.service.ts:548-552`), so recovering accounts compete against the whole pool and can
be crowded out indefinitely. Buffer has the mechanism and does not need it; promote needs it and
lacks it. Lift it to the base class.

---

## 5. Migration of existing damage

The refactor stops new strandings; it does not by itself move the accounts already stuck. Separately
and reversibly:

- **28 active accounts at 200–229** — recoverable, need ~30 channels each. Once 4.4 lands they are
  picked up by the warmup loop automatically; no data edit required.
- **22 READY accounts below 200** (one at 2 channels) — same path, but they need far more channels.
  Worth reviewing whether the 30-day salvage should have promoted them at all.
- **21 `session_rotated` accounts at 200–229** — need an explicit re-entry decision. Terminal phase
  with no path back is a policy question, not a bug to silently patch.

No backfill script is proposed here. Once the loop stops skipping them, the existing join machinery
does the work, which is safer than a one-off mutation.

---

## 6. What this does NOT change

- The `channels` counter accuracy problems (attempt-based increment, the `channels: 500` sentinel on
  `CHANNELS_TOO_MUCH`, absolute-vs-`$inc` races). Those corrupt the field the thresholds READ, and
  deserve their own change — fixing thresholds while the input is unreliable would be building on
  sand, but conflating them makes both unreviewable.
- Join-chain stall paths, per-channel failure tracking, warmup cooldown gaps. Separately identified,
  separately scoped.

---

## 7. Verification

| Check | Method |
|---|---|
| Invariant holds | boot-time assertion; unit test per pool config |
| No new strandings | `promoteClients` count where `phase=ready AND channels < operationalFloor` trends to 0 |
| Existing stranded recover | the 28 accounts gain channels over subsequent join rounds |
| Buffer unaffected | its numbers are unchanged by construction (200 === 200) |
| No regression | full suite + both app builds before push |
