# Pool onboarding unification (buffer + promote)

**Date:** 2026-10-27. **Status:** every row closed 2026-10-27: done, owner-gated, deferred to the master plan, or won't-fix (tracker below is the source of truth). Owner answers of 2026-10-27 applied the same day (Q1 planner, Q2, Q3, Q6, Q8, Q9, Q10, per-run health-check cap); only D7 (Q7) stays owner-gated.
**Input:** divergence analysis of 2026-10-27 (44 rows, M0-M13), every row re-verified against `master` @ `852f0d2a` before work started. Line numbers below are from that commit.
**Related:** `2026-10-26-account-lifecycle-firmup-master-plan.md` (W-A..W-F, another workstream; not edited here). Rows that plan owns are marked `deferred to master-plan W-x` and their code is left alone.

## Goal

One onboarding pipeline for both pools. Buffer (CMS) and promote (UMS) keep their real differences (floor, caps, username strategy, supply planner, schedules) as **data in a per-pool profile**, not as two pasted copies of the same code. Accidental drift that is a bug gets fixed, one step per commit, with a red/green test.

## Hard rules for every step

No new logins or sessions, no `removeOtherAuths`/`ResetAuthorizations`, no new kind of Telegram call, no change to pacing/sleeps/delays (except the owner's 2026-10-27 Q3 values), no data deletion, no index drops, no response-shape change on existing endpoints. Refactor steps must leave the M0 parity harness (`src/components/shared/__tests__/pool-onboarding-parity.spec.ts`) unchanged: its `CURRENT` table lists every per-pool difference and its Telegram ledger records every connect/probe/unregister and every sleep in order. A behaviour step flips only the `CURRENT` keys it owns.

## Shared design

```
shared/onboarding/
  pool-profile.ts     PoolProfile + BUFFER_PROFILE / PROMOTE_PROFILE (pure data, today's values)
  candidate-source.ts users query + goodIds (one copy)
  enrolment.ts        probe (hasPassword, channelInfo) -> dedup -> lock -> write -> notice (one copy)
  pool-claim.ts       cross-process one-pool-per-mobile guard backed by Mongo (M13)
  set-as.ts           operator enrolment setAs* (D8)
shared/base-client.service.ts (one copy, values from poolProfile)
  updateStatus / markAsActive / markAsInactive (M7), updateNameAndBio (M8),
  runWarmupMaintenance (M9), runJoinSweep + refillJoinQueue + findPrioritizedJoinCandidates (M11b)
```

Pool-specific code left in the services: the post-warmup enrolment planner wrappers (`buildBufferSupplyPlan` vs
`buildPromoteEnrolmentPlan`; both on the dynamic supply functions since Q1, each with its own values) and their summary notices, the username strategy (D31), and thin
wrappers that keep the existing public method names and routes.

Per-pool pacing, messages and flags added in this pass: `setAs` (D8), `joinSweep` (D36-D40),
`warmupRun` (M9), `consumerMinAgeDays` (D44). Each holds today's exact value; golden traces in
`src/components/shared/__tests__/fixtures/` were captured on the pre-extraction code.

`PoolProfile` holds only intentional differences:

| Field | buffer | promote | Why it differs |
|---|---|---|---|
| `kind` / labels | buffer | promote | names in logs and notices |
| `operationalFloor` | 200 | 230 | consumers differ (swap vs promotion runtime) |
| `legacyHealthyCap` | 20 | 30 | consumers differ |
| `minTotalClients` | 10 | 12 | consumers differ |
| `autoEnrolDocExtras` / `setAs.stampLastActive` | none | `lastActive: ISO now` (auto-enrol and setAs, Q10) | promote schema field |
| `setAsRequiresClientId` | yes | no (auto-assign fewest) | intentional |
| `excludePrimaryMobiles` | yes | no | a promote doc is never a main |
| `usernameStrategy` | set | clear | buffer needs a persona handle |
| `warmupRun.healthCheckShare` | 20 (= the cap) | 4 | Q2: promote takes a smaller share of `HEALTH_CHECK_CONNECTIONS_PER_RUN` (20) |
| supply planner values | minTarget 10, cap 20 | minTarget 12, cap 30, lead 30d, consumed 0 | Q1: same dynamic planner, own targets/floors |

No longer per-pool (owner 2026-10-27): pacing is one `ONBOARDING_PACING` (Q3), `terminalPhasesInWarmupRun` is `[session_rotated]` for both (Q2), `consumerMinAgeDays` is 15 for both (Q8).

Q3 old -> new pacing per pool (slower of each pair; ties on mean/range -> buffer's clipped gaussian):

| Value | buffer old | promote old | both now |
|---|---|---|---|
| `clientProcessingDelay` | 10 s | 8 s | 10 s |
| `leaveChannelInterval` | 120 s | 60 s | 120 s |
| setAs sleep after channel info | gaussian 7.5 s (5-10) | none | gaussian 7.5 s (5-10) |
| join sweep afterConnect / afterChannelInfo / beforeFetchCandidates | none | 5-8 s each | 5-8 s each |
| join sweep before permanent-error handling | none | 1 s | 1 s |
| between accounts | gaussian 2500/1500 (0-5 s) + delay, none after the last | uniform 0-5 s + delay, after every account | gaussian 2500/1500 (0-5 s) + delay, after every account |
| settle | gaussian 7500/750 (6-9 s) | uniform 6-9 s | gaussian 7500/750 (6-9 s) |
| join queue start | 4-6 s | 2 s | 4-6 s |
| leave queue start | gaussian 12.5 s (10-15) | 5 s | gaussian 12.5 s (10-15) |
| refill leave queue start | gaussian 6500/1000 (5-8 s) | uniform 5-8 s | gaussian 6500/1000 (5-8 s) |

## Tracker

Status: `todo`, `done`, `owner-gated`, `won't-fix`, `deferred to master-plan W-x`. Kind: S shared, D duplicated, P pool-specific. Intent: I intentional, A accidental drift, ? unknown.

| ID | Aspect | Buffer (file:line) | Promote (file:line) | Kind/Intent | Decision | Step | Status | Commit |
|---|---|---|---|---|---|---|---|---|
| D1 | `users` candidate filter | buffer-client.service.ts:2111-2121 | promote-client.service.ts:1444-1454 | D/I (identical) | one shared query + batch loop (`shared/onboarding/candidate-source.ts`) | M6 | done | a12103bf |
| D2 | goodIds exclusion set | :1663-1674 | :1105-1113 | D/I | one shared builder (`buildEnrolmentExclusions`) for the two run paths | M6 | done | a12103bf |
| D3 | who decides buffer vs promote | first scheduler, lowest tgId | same | ?/? | Owner 2026-10-27: Q1 classification part: keep as is (no classifier; a pool is chosen by which enrol path runs first, lowest tgId first). Planner part: see D12 | Q1 | won't-fix (owner: keep as is) | — |
| D4 | pre-enrol probe (hasPassword, channelInfo) | :1966-1978 | :1303-1313 (no debug log on 2FA skip) | D/I | one enrolment function (`shared/onboarding/enrolment.ts`) | M5 | done | 67061500 |
| D5 | cross-pool dedup is in-process only | :1942-1952, 2005-2024 | :1279-1289, 1339-1358 | D/I | Mongo-backed claim (`shared/onboarding/pool-claim.ts`): new collection `poolEnrolmentClaims`, one doc per mobile `{mobile, pool, at}`, unique index `mobile_unique` (additive). Taken inside the in-process lock by auto-enrol, both `setAs*` and both `create()`; the other pool is refused while its claim is younger than 60 s; release sets `at` to epoch (never deletes). Live data 2026-10-27: 0 dual-pool mobiles, so no existing doc is refused | M13 | done | 38b842bc |
| D6 | `setAs*` cross-pool guard | refuses mains + promote (:1262-1273) | refuses mains only (:818-823); neither takes the lock | D/**A** | promote also refuses buffer; both take the lock and re-check inside it | M1 | done | 5b30cad5 |
| D7 | `setAs*` eligibility (no twoFA/hasPassword/activity filter) | :1252-1257 | :811-816 | D/? | code shared (D8, `shared/onboarding/set-as.ts`): adding auto-enrol's 2FA/activity checks to the operator path is a policy decision, one place to change. Owner 2026-10-27: not covered by the 2026-10-27 answers (their "Q7 keep as is" names no classifier, which is this doc's Q1/D3, so it was applied to D3); stays owner-gated | — | owner-gated (Q7; code shared) | f1bf4fc0 |
| D8 | `setAs*` body / clientId | required (controller :161,168); 5-10 s pacing draw after channel info | optional, auto-assign (:825-841); no draw; `lastActive:'default'` | P/I | one shared body `shared/onboarding/set-as.ts`; per-pool values in `PoolProfile.setAs` (messages, `postChannelInfoSleep`, `docExtras`, `errorContext`, `permanentErrorReason`) + `setAsRequiresClientId`. Characterisation (messages, stored doc, pacing draws, permanent/plain errors, clientId omitted) green before and after. Pacing value owner-gated Q3, `lastActive` Q10 | M7b | done | f1bf4fc0 |
| D9 | `setAs*` HTTP verb | POST | GET (controller :118) | D/A | additive `POST promoteclients/SetAsPromoteClient/:mobile` (same handler body, same API-key/IP auth: not an ignore or origin-only path); GET kept. Red/green controller test. Owner 2026-10-27: Q6 keep GET + POST | D9 | done (Q6: keep both) | 56278ceb |
| D10 | manual bulk enrol bypasses the cap | `addNewUserstoBufferClients` (:2059-2084) uses window need, no counted/cap map -> cap 20 counted from 0, no fleet budget | **re-verified:** promote manual (:1393-1418) also passes no counts -> cap 30 counted from 0 (the input said it matched scheduled; it does not) | D/A | manual path uses the same plan/caps/budget as the scheduled run, both pools | M12 | done | 2d209907 |
| D11 | `badIds` parameter never used | :2086-2100 | :1420-1433 | D/A | part of the bulk-enrol request body; keep the parameter (contract) | — | won't-fix | |
| D12 | need calculation / fleet budget | dynamic plan (:303-437, buffer-supply.ts) | legacy window + cap 30 (:1214-1238), no engine budget | P/I + ? | promote gets the same engine budget (`computeFleetEnrollmentBudget`, own engine ceiling 46/wk, lead 30d) (M12). Owner 2026-10-27: Q1 planner part: promote uses buffer's dynamic supply planner (`buffer-supply.ts`) with promote's own values (minTarget 12, maxTarget/hardCap 30, capHeadroom 18, lead 30d; consumed = 0, promote `lastUsed` is not a consumption signal). Measured read-only on prod Mongo (old vs new dist, 20 clients): identical plans, needs [] / totalNeed 0, healthy 12-24 per client, budget 10 of weekly remaining 17 (enrolledLast7d 29, fleetWarming 51); both under the weekly budget | Q1 | done | cc05d61d |
| D13 | per-client cap | dynamic or 20 (buffer-supply.ts:115,150) | 30 (:62) | P/I | profile value (`legacyHealthyCap`) | M4 | done | 3b36a819 |
| D14 | healthy-for-cap | `isHealthyBufferClientForCap` (:268-288) | `isHealthyPromoteClientForCap` (:143-160) | D/A (copy), I (floor) | one function `isHealthyForLegacyCap`, floor from profile | M4 | done | 3b36a819 |
| D15 | spam-limit state | schema + supply shift | none | P/? | — | — | deferred to master-plan W-A (Q4) | |
| D16 | config block | :476-493 | :123-141 | P/I + ? | floor/minTotal read from the profile; pacing now one shared `ONBOARDING_PACING` (Q3) | M4, Q3 | done | 3b36a819, 5d3dcb66 |
| D17 | promote `totalSlotsNeeded` loop is a dead calculation | — | :1242-1256 | D/A | replaced by the priority-order budget allocation | M12 | done | 2d209907 |
| D18 | fields on auto-enrol | :1989-2022 | + `lastActive` ISO (:1323-1356) | D/I | port `docExtras` (promote `lastActive`) | M5 | done | 67061500 |
| D19 | promote `lastActive`: ISO (auto) vs `'default'` (setAs, :850) | — | :850 vs :1325 | D/A | Owner 2026-10-27: Q10: no reader of `'default'` (grep of CMS, tg-platform, dashboard-local, my-tg-local, vcui-local, payment-local); setAs now writes the ISO enrolment time like auto-enrol (`PoolProfile.setAs.stampLastActive`) | Q10 | done | 127fde03 |
| D20 | `create()` default `message` | none (:816-826) | `'Account is functioning properly'` (:469-481) | D/A | harmless; keep | — | won't-fix | |
| D21 | `create()` overwrites caller lifecycle (`warmupPhase`, `sessionRotatedAt`) | :816-825, reached from `returnOldClientToBufferPool` (client.service.ts:1545,1563) | same (:469-481) | P/A | **not changed here.** Fixing it would let a returning main without a buffer doc land directly in `session_rotated`, which is exactly the dirty re-entry W-E gates. Today's overwrite sends it back through warmup instead. | M3 | deferred to master-plan W-E | |
| D22 | schema strictness (`clientId`/`session` optional, no status enum on promote) | buffer-client.schema.ts:30-79 | promote-client.schema.ts:27-51 | D/A | tightening a schema can reject existing docs; out of scope | — | won't-fix | |
| D23 | promote `remove()` raw mobile | canonicalises (:913-916) | `deleteOne({ mobile })` (:754) | D/A | **re-verified:** not a lost delete (the schema `set: canonicalizeMobile` also canonicalises query values; M0 proves `+91...` deletes). Remaining drift: malformed mobile -> 500 not 400; notice shows the raw input. Canonicalise explicitly | M2 | done | 29ba782b |
| D24 | enrol failure not logged on promote | :2043-2050 | :1378-1384 | D/A | one enrolment function logs for both (log-only change) | M5 | done | 67061500 |
| D25 | session copied from `users.session`, no login | :1991 | :1327 | D/I | — | — | done (already equal) | |
| D26 | READY -> SESSION_ROTATED | base :1506-1586, 2974-3083 | same | S/I | — | — | done (shared); rotation gate deferred to master-plan W-E | |
| D27 | recycled mains stamped SESSION_ROTATED directly | client.service.ts:1516-1563 | none | P/I | — | — | deferred to master-plan W-E | |
| D28 | phase machine, thresholds, jitter | warmup-phases.ts | same | S/I | — | — | done (shared); jitter deferred to master-plan W-D | |
| D29 | step implementations | base :1042-1420 | same | S/I | — | — | done (shared); deferred to master-plan W-C/W-D | |
| D30 | `updateNameAndBio` duplicated (~230 lines) | :497-731 | :164-398 | D/A (copy) | **re-verified:** byte-identical except surname field and other-pool service; one shared method in `BaseClientService` (surname list from `clientType`, `otherPoolModel()` hook, per-pool 'no persona pool' log text kept). Characterisation (Telegram ledger, pool surname, cross-pool dedup, error path, no-pool path) green before and after | M8 | done | 937ad159 |
| D31 | `updateUsername` set vs clear | :733-781 | :400-434 | P/I | keep both strategies; a "skip clear when already blank" needs a username read we do not store | — | won't-fix | |
| D32 | which phases the warmup run processes | skips READY (:1713) | skips READY + SESSION_ROTATED (:1151); health branch :1170-1175 dead | D/?/A | one loop `BaseClientService.runWarmupMaintenance` (M9). Owner 2026-10-27: Q2: both pools process `[session_rotated]` | M9, Q2 | done | 9620b50d, 48b831bc |
| D33 | primary-mobile skip uses `===` | :1696 | n/a | P/I | stored mobiles are canonical (schema setter); keep | — | won't-fix | |
| D34 | promote SESSION_ROTATED never health-checked by the warmup run | warmup run + `updateInfo` | `updateInfo` only | D/A | Owner 2026-10-27: Q2: promote `session_rotated` health-checked in the warmup run within the per-run cap (D47), promote share 4/run, never-checked then oldest-checked first. 74 never-checked at 4 runs/day x 4 = ~16/day -> ~5 days (plus up to 20 per promote `updateInfo`, every 4th UTC day). Risk: promote docs never set `inUse`, so a check can connect an account tg-platform is using (same as today's `updateInfo`, now more often) | Q2 (M10) | done | 48b831bc |
| D35 | diagnostics endpoints | :1317, :1417 | none | D/A | observability only; not needed for unification | — | won't-fix | |
| D36 | join candidate tiering | :232-266 | :604-638 | D/I | one `findPrioritizedJoinCandidates` in `BaseClientService` (fallback floor = `profile.operationalFloor`, 200/230 as before). Golden trace (candidate order incl. recovery tier) identical before/after | M11b | done | 9f923a2a |
| D37 | join sweep primary exclusion / clientId scope | :1846-1854 | :914-924 | D/I | one sweep `runJoinSweep`; `profile.excludePrimaryMobiles` and `joinSweep.scopesByClientId` hold today's values. Golden trace pins buffer skipping the main, promote connecting it | M11b | done | 9f923a2a |
| D38 | join sweep pacing | 1 gap/account (:1916) | 3 extra 5-8s sleeps + gap (:941-952, 983) | D/? | Owner 2026-10-27: Q3: one shared `ONBOARDING_PACING.joinSweep`, slower of each pair: promote's three 5-8 s sleeps + 1 s pre-permanent sleep now apply to buffer, gap after every account incl. the last; ties on mean/range take buffer's clipped gaussian. Golden traces regenerated for exactly these durations | Q3 | done | 5d3dcb66 |
| D39 | promote join sweep catch-all wipes every queued join | none | :997-1004 | D/A | log and rethrow, keep the queues (buffer behaviour) | M11 | done | 5dd802f2 |
| D40 | `refillJoinQueue` copy | :1139-1221 | :640-710 (leave delay differs) | D/I+A | one `refillJoinQueue` in `BaseClientService` (M11b). Owner 2026-10-27: Q3: leave-queue start = shared gaussian 6500/1000/5000-8000 (promote was 5000+U(0,3000)) | M11b, Q3 | done | 9f923a2a, 5d3dcb66 |
| D41 | schedules / minute offsets | scheduled-jobs.service.ts:99,107-109,140-144 | :160,165-167,189-191 | P/I | keep exactly | — | won't-fix | |
| D42 | warmup failure backoff / deactivate cascade | base | same | S/I | — | — | done (shared) | |
| D43 | `updateStatus` / `markAsInactive` copies | :969-1007, 1225-1242 | :549-602, 716-733 | D/A | **re-verified:** identical modulo names; one shared implementation in `BaseClientService` (label from `clientType`); characterisation test (fields, notices, idempotence, failure) green before and after | M7 | done | 279960d8 |
| D44 | swap/runtime age gates (15d vs 7d) | client.service.ts:1798-1815 | tg-platform | P/? | Owner 2026-10-27: Q8: 15 days for both. tg-platform `PROMOTE_RUNTIME_MIN_AGE_DAYS = 15` (was 7) in `packages/tg-db/src/collections/promote.repository.ts`; `PROMOTE_PROFILE.consumerMinAgeDays` 15. Measured: 185 eligible promote accounts, 0 aged 7-14 days (none stop promoting) | Q8 | done | tg-platform fef4006; 26e7191f |
| D45 | `setAsBufferClient` sleeps 5-10s after channelInfo; promote does not | :1281 | :812-851 | D/? | Owner 2026-10-27: Q3: `ONBOARDING_PACING.setAsPostChannelInfoSleep` gaussian 7500/1250/5000-10000 for both pools (promote had none) | Q3 | done | 5d3dcb66 |
| D46 | archive collections (`*Archive`) written by no CMS code | — | — | ?/? | Owner 2026-10-27: Q9: archives stay as they are | Q9 | won't-fix (owner: keep as is) | — |
| D47 | Telegram connections per run for health checks/probes | warmup-run SR check unbounded; `updateInfo` 25 | warmup run none (Q2); `updateInfo` 25 | P/A | Owner 2026-10-27: one cap `HEALTH_CHECK_CONNECTIONS_PER_RUN` = 20 for the warmup-run health check and `updateInfo`, both pools; over the cap the rest are deferred to the next run, oldest-checked first (no write). Measured: buffer warmup runs did median 11, p75 ~16, max 27 checks over 12 days (lower bound); cms log 27-44 passed/day. Not capped: join-sweep connects (join work), swap SpamBot probes (already 3/request, rescue path), ready-rotation (1/run), pre-enrol probe (bounded by the enrolment budget) | cap | done | 9d404340 |

## Owner questions (exact)

1. **Q1 (D3, D12):** Should a candidate's pool be chosen deliberately (ratio, or buffer-first while any client has 0 free buffers), or is "whichever pool's run needs it first, lowest tgId first" acceptable?
2. **Q2 (D32, D34, M10):** Was skipping promote `session_rotated` accounts in the warmup run deliberate? Today 74/255 have never been health-checked by CMS. Options: match buffer (health-check in the warmup run), run `updateInfo` daily (25/run), or leave it to tg-platform's own failure handling. Either option adds Telegram connections to accounts that get none today.
3. **Q3 (D16, D38, D40, D45):** Is there a safety reason for promote's three extra 5-8s sleeps per join-sweep account, its 60s vs 120s leave interval, its 8s vs 10s processing delay, and for buffer's 5-10s sleep in `setAsBufferClient` that promote lacks? Or can both pools share one set of values (which set)?
4. **Q6 (D9):** A `POST SetAsPromoteClient/:mobile` can be added alongside the GET. Does any caller (dashboard, scripts) use the GET, and may it be retired later?
5. **Q7 (D7):** Should `setAs*` apply the auto-enrol filters (`twoFA:false`, the `hasPassword()` probe, activity filters), or may operators override?
6. **Q8 (D44):** Buffer swap requires `createdAt <= now-15d`, promote runtime `< now-7d`. Both are moot behind the day-24 READY gate. Drop, unify, or keep?
7. **Q9 (D46):** Who moves dead docs to `bufferClientsArchive` / `promoteClientsArchive`, and should the shared pipeline own it?
8. **Q10 (D19):** `setAsPromoteClient` writes `lastActive: 'default'`, auto-enrol writes an ISO time. Does any consumer depend on `'default'`? If not, both should write the ISO time.

### Owner answers (2026-10-27)

| Q | Answer | Rows | Commit |
|---|---|---|---|
| Q1 | planner: promote uses buffer's dynamic supply planner with its own values; classification: keep as is (no classifier) | D12 done, D3 won't-fix | cc05d61d |
| Q2 | health-check promote `session_rotated` in the warmup run within the per-run cap, smaller promote share | D32, D34 done | 48b831bc (cap 9d404340) |
| Q3 | one pacing set, the slower of each pair | D16, D38, D40, D45 done | 5d3dcb66 |
| Q6 | keep GET + POST | D9 done | 56278ceb |
| Q7 | not answered as worded: the answer "Q7 keep as is (no classifier)" matches Q1's classification part and was applied to D3; D7 (setAs filters) stays owner-gated | D7 owner-gated | — |
| Q8 | 15 days for both | D44 done | tg-platform fef4006; 26e7191f |
| Q9 | archives as is | D46 won't-fix | — |
| Q10 | no `'default'` reader; setAs writes a real date | D19 done | 127fde03 |
| cap | per-run cap on health-check/probe connections, both pools, oldest-checked first | D47 done | 9d404340 |

