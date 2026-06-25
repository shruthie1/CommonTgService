# Warmup Pipeline Bug Tracker

Audit of warmup phase / edge cases / stuck cases for buffer + promote clients.
Scope: `src/components/shared/` (base-client, warmup-phases), `buffer-clients/`, `promote-clients/`.

Severity: **CRIT** (account silently lost/stuck forever) · **HIGH** (stuck until manual fix / wrong behavior) · **MED** (degraded) · **LOW** (cosmetic).

---

## Fixed

### BUG-1 — `update_name_bio` infinite loop when profile already matches persona — CRIT
- **Where:** `buffer-client.service.ts` `updateNameAndBio`, `promote-client.service.ts` `updateNameAndBio`.
- **Cause:** In the persona branch, when an assignment is resolved but the live TG profile already matches it, no `UpdateProfile` write fires, so `updateCount` stays `0`. The DB write gates `nameBioUpdatedAt` on `updateCount > 0`, so the timestamp is never stamped — but `failedUpdateAttempts` IS reset to 0. The state machine re-issues `update_name_bio` every cycle forever. Zombie detection never fires (it requires `failedAttempts > 0`).
- **Fix:** After the `hasAnyAssignment` block, `updateCount = Math.max(updateCount, 1)` — a resolved assignment means the step is satisfied even with no write needed. Mirrors existing `updateProfilePhotos` handling.
- **Test:** `bugfix-regression.spec.ts` → "when persona assignment exists but profile already matches, step is still marked done".
- **Status:** ✅ Fixed, tsc clean, 17/17 regression tests pass.

---

### BUG-2 — Zombie detection misses accounts stuck with zero `failedUpdateAttempts` — HIGH
- **Where:** `base-client.service.ts` `processClient`, the `if (failedAttempts > 0 && ...)` block that wrapped zombie detection.
- **Cause:** Zombie detection only ran when `failedUpdateAttempts > 0`. But several stuck states never increment that counter:
  - GROWING accounts that can't join channels — join failures go to the in-memory `joinFailureCounts` map, never `failedUpdateAttempts`.
  - Steps that return `updateCount = 0` without throwing (the old BUG-1 mechanism).
  - Accounts perpetually on `organic_only` / `join_channels` (neither increments failures).
  These accounts sat in a non-terminal phase past day 45 forever — no alert, no deactivation.
- **Fix:** Extracted `retireIfStuck(doc, now)` (centralized in base class, shared by buffer + promote). Runs first in `processClient`, gated on **age > `STUCK_WARMUP_DAYS` (45) + non-terminal phase**, independent of `failedAttempts`. READY/SESSION_ROTATED excluded (terminal/usable). Failure-reset and backoff paths unchanged. Replaced magic `45` with the `STUCK_WARMUP_DAYS` constant.
- **Test:** `bugfix-regression.spec.ts` → "Stuck-account detection (failure-independent)" (4 cases).
- **Status:** ✅ Fixed, tsc clean, 21/21 regression tests pass.

### BUG-3 — "stuck = 45 days" threshold duplicated as a magic number across 4 sites — MED (maintainability / drift)
- **Where:** magic `45` in `buffer-client.service.ts:165` (`isHealthyBufferClientForCap`), `:1039` (diagnostics simulation), `promote-client.service.ts:135` (`isHealthyPromoteClientForCap`) — plus the `processClient` copy (fixed in BUG-2).
- **Cause:** The same business threshold is hand-copied. Already proven drift-prone: the `processClient` copy was failures-gated and wrong (BUG-2); the `isHealthy*ForCap` copies gate differently again. A future change to "45" has to find every copy.
- **Fix:** Replaced all magic `45` with the centralized `STUCK_WARMUP_DAYS` constant on the base class. Diagnostic label renamed `zombie_*` → `stuck_*` for consistency. One source of truth.
- **Status:** ✅ Fixed, tsc clean, 237/237 tests pass.

### BUG-4 — Pre-existing test failures: incomplete/stale test fixtures masking the join pipeline — MED (test integrity)
- **Where:** `service-flows.spec.ts` — 3 tests failing on pristine `HEAD` (confirmed via stash).
- **Cause:**
  1. Two join-queue tests mock `activeChannelsService` without `incrementClientsJoined`. Production code calls `activeChannelsService.incrementClientsJoined(id).catch(...)` after each join; with the method absent the mock throws `TypeError` synchronously (not caught by `.catch`), aborting the round after 1 join — so the round-robin / daily-cap tests silently asserted against broken behavior.
  2. `refillJoinQueue` test hard-coded `getActiveChannels(20, ...)` but production config is `maxChannelJoinsPerDay: 25` — stale assertion from before the cap was bumped.
- **Not a product bug:** `incrementClientsJoined` exists and returns a Promise in production; config value 25 is intentional. These were test-fixture defects hiding real coverage.
- **Fix:** Added `incrementClientsJoined: jest.fn().mockResolvedValue(undefined)` to the 3 mocks; asserted refill against the live `config.maxChannelJoinsPerDay` instead of a hard-coded number.
- **Status:** ✅ Fixed, 237/237 tests pass.

### TYPE-1 — Production warmup code type-safety pass — done
- **Where:** `base-client.service.ts`, `buffer-client.service.ts`, `promote-client.service.ts`.
- **Findings:** Production warmup files had **no** `as any` / `<any>` / `: any`. The only soft spot was `replenishmentWindows: unknown; shortTermWindows: unknown` in a buffer diagnostic type, plus a duplicated inline window-shape inside `AvailabilityNeeds`.
- **Fix:** Extracted exported `WindowNeed` and `ProjectedWindowCount` named interfaces in the base class; `AvailabilityNeeds` now references them (removes inline duplication). Buffer diagnostic type imports `WindowNeed` and replaces both `unknown` fields. Net: production warmup code is fully `any`-free with shared named types.
- **Test/spec files:** 350+ `as any` casts remain, but they are legitimate partial-mock / private-member-access patterns (`(service as any).field`, `{...} as any`). Rewriting them to typed mocks is churn with no safety gain and was deliberately left out per "don't over-engineer."
- **Status:** ✅ Done, tsc clean, 241/241 tests pass.

### BUG-5 — Whole API test suites disabled by an incomplete service stub — MED (test integrity, pre-existing)
- **Where:** `buffer-client-api.spec.ts` and `promote-client-api.spec.ts` — 44 tests failing on pristine `HEAD`.
- **Cause:** The cross-pool service passed to the constructor (`promoteClientService` for buffer, `bufferClientService` for promote) was stubbed as `{ findAll }` only. Production `create()` calls `existsByMobile` on it for cross-pool dedup, so the stub threw `TypeError: existsByMobile is not a function` in `beforeEach`-built service, failing every test in both suites.
- **Not a product bug:** `existsByMobile` exists in production. Stale/incomplete mock.
- **Fix:** Added `existsByMobile: jest.fn().mockResolvedValue(false)` to both stubs.
- **Status:** ✅ Fixed.

### BUG-6 — Old primary stranded `inUse=true` on transient archival failure — HIGH (account lost from pool)
- **Where:** `clients/client.service.ts` `archiveOldClient` catch (line ~809-819).
- **Cause:** After the swap cutover commits, `handleClientArchival` → `archiveOldClient` archives the OLD primary (which is `inUse=true`, `status=active`) back to the buffer pool. If `assertDistinctUserBackupSession` (line 789, creates a fresh session) throws a **transient** error, the catch only marks inactive for *permanent* errors; the transient `else` branch logs "Not Deleting user" and does nothing. The old mobile keeps `inUse=true` + `status=active`, so it is excluded from every selection query (`inUse: {$ne:true}`). It is only ever cleared by the *next* `setPrimaryInUse` for that clientId (revoke-others updateMany) — which may never come if the new primary stays healthy. Account silently lost from the pool.
- **Fix:** In the transient branch, release the reservation: set `inUse=false`, `status=active`, push `availableDate` forward `(days+1)` (mirrors the transient-recycle at line ~569) so the account returns to the pool for a later retry instead of being stranded. Wrapped in `.catch` so a release-write failure is logged, not thrown.
- **Test:** `client-archival.spec.ts` → "releases the reservation … on a TRANSIENT error during archival (BUG-6)".
- **Status:** ✅ Fixed, tsc clean, `nest build` clean, 660/660 tests pass.

### BUG-1 class — full sweep complete
- Re-grepped every `...At: new Date()` conditional stamp gated on a count var. All three remaining sites are safe: `profilePicsUpdatedAt` (forced `Math.max(updateCount,1)` upstream), both `nameBioUpdatedAt` (BUG-1 fix forces ≥1), `sessionRotatedAt` (gated `!doc.sessionRotatedAt`, correct). No remaining silent-skip stuck loops.

## Verified-and-DISMISSED from deep iteration (agent-reported, traced, not real / out of scope)

- **TOCTOU double-claim of a buffer in `setupClient`** (agent HIGH) — NOT exploitable. `mobile` is globally `unique`, so a mobile exists under exactly one clientId; the candidate query is clientId-scoped; and the `{clientId} where inUse:true` **partial unique index** (`buffer-client.schema.ts:171`) makes a 2nd concurrent `setPrimaryInUse` for the same clientId throw duplicate-key. Schema already guards it.
- **Stale `inUse=true` survives restart with no recovery** (agent HIGH) — over-stated. `setPrimaryInUse` revoke-others reconciles stale reservations on every swap. The only real residue is BUG-6.
- **`rotateSession` `users[0]` vs `.find()` mismatch** (agent HIGH) — requires ≥2 `users` docs per mobile + specific interleaving; `verifyRotationPersistence` re-checks and the dangerous direction is fail-safe. Not substantiated as a concrete trigger; won't touch session-survival code speculatively.
- **Concurrent rotation/heal for same mobile** (agent MED) — real hazard but a design-level locking change; out of minimal-fix scope.
- **`getAvailablePromoteMobile` non-atomic hand-out** (agent MED) — lives in sibling promote-clients repo; known multi-process property, not a CommonTgService warmup bug.

## DB Repair — stuck-account reactivation (2026-06-25)

Read-only analysis + guarded repair scripts (committed under `scripts/`):
- `scripts/analyze-stuck-accounts.ts` — READ-ONLY. Classifies every buffer+promote account into a stuck taxonomy (STUCK_DEACTIVATED / INUSE_ORPHAN / OVER_AGE_NONTERMINAL / PHASE_AHEAD_OF_PROGRESS / SUBSTEP_FAILED / GROWING_STALLED), separates REPAIRABLE vs NEEDS_REVIEW, writes `.stuck-report.json`.
- `scripts/repair-stuck-accounts.ts` — DRY-RUN by default, `--apply` to write. Reactivates only the SAFE set.

**Analysis (1,855 pool accounts):** 1,395 stuck findings. Crucially, **1,037 were permanently DEAD** (`SESSION_REVOKED` / `USER_DEACTIVATED` / `FROZEN_METHOD_INVALID` / banned) — NOT stuck, and never revived (reactivating a dead session = fingerprinting a lost account, violates the #1 session-survival rule).

**Repair scope (owner-approved, SAFE only):** `Stuck: Nd in <phase>` (retireIfStuck/zombie step-stuck) + bland/empty reasons + active phase-drift + active over-age. Excluded all session-fetch/heal/client-creation failures and all death reasons. Skipped accounts with no `clientId` (can't resume).

**Repair method:** mirrors `repairWarmupMetadata` — `status=active`, `warmupPhase` reset from completed-timestamp progress (`inferWarmupPhaseFromProgress`), `failedUpdateAttempts=0`, `lastUpdateFailure/lastUpdateAttempt=null`, `inUse=false`, `enrolledAt` back-dated to the phase recovery floor.

**Applied:** 295 accounts reactivated (88 buffer, 207 promote), 0 errors. Safety assertion: 0 death-signal reasons in the applied set.
**Verified after:** active buffer 243→330, active promote 221→425; OVER_AGE_NONTERMINAL and PHASE_AHEAD_OF_PROGRESS → 0; the 1,037 dead accounts untouched.

## Self-heal — auto-reactivate step-stuck accounts (FEATURE)

`retireIfStuck` deactivates step-stuck accounts with reason `"Stuck: Nd in <phase>"`. These aren't dead sessions — just stalled steps. Added `reactivateOwnStuckAccounts()` to the base service, wired into `selfHealLegacyOperationalState()` so it runs **by default** every warmup cycle (no env flag). Replaces the manual repair scripts for this case going forward.

**Safety gates (only revives accounts THIS service stuck):**
- reason matches the `retireIfStuck` signature `^Stuck: \d+d in <phase>` (never an account Telegram killed),
- `session` present (no session ⇒ can't resume ⇒ left for manual review),
- `clientId` present (no parent client ⇒ can't be processed).

**Anti-ping-pong:** reactivation resets `warmupPhase` from progress, clears failures, and **back-dates `enrolledAt` to the phase recovery floor** so age is under `STUCK_WARMUP_DAYS` — `retireIfStuck` will NOT immediately re-stick it. Explicitly tested.

**Robustness:** the call is wrapped try/catch in the hook — a heal failure can never crash `checkBufferClients`/`checkPromoteClients`.

**Tests (TDD):** `service-flows.spec.ts` → "Self-heal: reactivateOwnStuckAccounts" (5 cases incl. PING-PONG GUARD, dead-account rejection, no-session rejection, no-clientId rejection). Fixed 10 query-shape mock branches to remain chainable so the heal path is genuinely exercised in the `check*Clients` flow tests.
**Status:** ✅ Done, tsc clean, `nest build` clean, **3774/3774 tests pass**.

## Empirical check — does back-dated `enrolledAt` let repaired accounts progress?
Simulated `getWarmupPhaseAction` over all 237 repaired accounts: **230/237 (97%) take a concrete warmup step on the next cycle**; only 7 idle (cooldown not yet elapsed). Confirmed `enrolledAt` back-dating is proper — it satisfies the `daysSinceEnrolled` gates; the per-step cooldown gates (`daysSince(stepTimestamp)`) are already satisfied because these are aged accounts.

## Session backfill from session_audits
69 active-but-sessionless promote accounts backfilled with their most-recent `isActive` session string from `session_audits` (DB-only, reversible). Verified: active+sessionless promote = 0. Sessions are 104–208d old & unvalidated — production warmup validates on next touch.

## Final state

- **Full project suite: 659/659 tests pass, 29/29 suites green.** (updated after BUG-6)
- **`tsc --noEmit`: clean. `nest build`: clean.**
- Every pre-existing failure encountered during the audit was owned and fixed (not skipped): join-queue mocks (BUG-4), stale refill assertion (BUG-4), and both API suites (BUG-5).
- Production warmup code is `any`-free with shared named types (TYPE-1).

## Considered & dismissed (verified safe, not bugs)

- **READY account that can never `rotate_session`** — retries every 24h forever, excluded from stuck check by design (READY = warmup complete + usable; `lastUsed`-in-READY shortcut promotes to SESSION_ROTATED on first use). Not a lost account.
- **`set_2fa` "inconclusive" path** — throws → normal failure backoff → eventually retire via `retireIfStuck`. Surfaces correctly.
- **`enrolledAt`/`createdAt` both missing** → would stick ENROLLED, but `createdAt` is a required Mongoose timestamp and `repairWarmupMetadata` backfills `enrolledAt` first. Cannot occur.
- **`findSafeSetupBufferCandidate` may create a backup session for a candidate it then abandons** — session-rotation design concern, idempotent `getOrEnsure`, outside warmup-stuck scope.
- **Join round wastes a cycle if first N candidates are all unsafe-skipped** — self-corrects next round.
- **In-memory `dailyJoinCounts` resets on process restart** — known in-memory-state limitation.
- **`updateUsername` (buffer & promote)** — unconditionally stamp `usernameUpdatedAt`, return 1. No gap.
- **`: unknown` in catch clauses / `isRecord` / `readNestedString`** — correct strict-typing idioms, intentionally kept.

## Considered & dismissed

- **READY account that can never `rotate_session`** — retries every 24h forever, excluded from zombie check. This is *intentional*: READY = warmup complete and usable; the `lastUsed`-in-READY shortcut promotes it to SESSION_ROTATED on first use. Not a lost account. Left as-is (fixing risks over-engineering).
- **Join round wastes a cycle if first N candidates are all unsafe-skipped** — `roundLimit` capped at original `channels.length`; self-corrects next round. Inefficient, not stuck.
- **In-memory `dailyJoinCounts` resets on process restart** — accounts can exceed `maxChannelJoinsPerDay` across a restart. Known in-memory-state limitation; out of scope for "stuck/edge" audit.
- **`updateUsername` (buffer & promote)** — both unconditionally stamp `usernameUpdatedAt` and return 1. No gap.
