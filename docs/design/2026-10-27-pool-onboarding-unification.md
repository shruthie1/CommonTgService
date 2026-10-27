# Pool onboarding unification (buffer + promote)

**Date:** 2026-10-27. **Status:** in progress (tracker below is the source of truth).
**Input:** divergence analysis of 2026-10-27 (44 rows, M0-M13), every row re-verified against `master` @ `852f0d2a` before work started. Line numbers below are from that commit.
**Related:** `2026-10-26-account-lifecycle-firmup-master-plan.md` (W-A..W-F, another workstream; not edited here). Rows that plan owns are marked `deferred to master-plan W-x` and their code is left alone.

## Goal

One onboarding pipeline for both pools. Buffer (CMS) and promote (UMS) keep their real differences (floor, caps, username strategy, supply planner, schedules) as **data in a per-pool profile**, not as two pasted copies of the same code. Accidental drift that is a bug gets fixed, one step per commit, with a red/green test.

## Hard rules for every step

No new logins or sessions, no `removeOtherAuths`/`ResetAuthorizations`, no new kind of Telegram call, no change to pacing/sleeps/delays, no data deletion, no index drops, no response-shape change on existing endpoints. Refactor steps must leave the M0 parity harness (`src/components/shared/__tests__/pool-onboarding-parity.spec.ts`) unchanged: its `CURRENT` table lists every per-pool difference and its Telegram ledger records every connect/probe/unregister and every sleep in order. A behaviour step flips only the `CURRENT` keys it owns.

## Shared design

```
shared/onboarding/
  pool-profile.ts     PoolProfile + BUFFER_PROFILE / PROMOTE_PROFILE (pure data, today's values)
  candidate-source.ts users query + goodIds (one copy)
  enrolment.ts        probe (hasPassword, channelInfo) -> dedup -> lock -> write -> notice (one copy)
  pool-claim.ts       cross-process one-pool-per-mobile guard backed by Mongo (M13)
```

`PoolProfile` holds only intentional differences:

| Field | buffer | promote | Why it differs |
|---|---|---|---|
| `kind` / labels | buffer | promote | names in logs and notices |
| `operationalFloor` | 200 | 230 | consumers differ (swap vs promotion runtime) |
| `legacyHealthyCap` | 20 | 30 | consumers differ |
| `minTotalClients` | 10 | 12 | consumers differ |
| `autoEnrolDocExtras` | none | `lastActive: ISO now` | promote schema field |
| `setAsRequiresClientId` | yes | no (auto-assign fewest) | intentional |
| `excludePrimaryMobiles` | yes | no | a promote doc is never a main |
| `usernameStrategy` | set | clear | buffer needs a persona handle |
| pacing (`clientProcessingDelay`, `leaveChannelInterval`, join-sweep sleeps, setAs sleep) | 10s / 120s / 1 gap / 5-10s | 8s / 60s / 3 extra + gap / none | **owner-gated Q3**, kept exactly |
| `terminalPhasesInWarmupRun` | `[session_rotated]` | `[]` | **owner-gated Q2**, kept exactly |
| supply planner | dynamic (`buffer-supply.ts`) | legacy windows + cap 30 | owner-gated Q1 |

## Tracker

Status: `todo`, `done`, `owner-gated`, `won't-fix`, `deferred to master-plan W-x`. Kind: S shared, D duplicated, P pool-specific. Intent: I intentional, A accidental drift, ? unknown.

| ID | Aspect | Buffer (file:line) | Promote (file:line) | Kind/Intent | Decision | Step | Status | Commit |
|---|---|---|---|---|---|---|---|---|
| D1 | `users` candidate filter | buffer-client.service.ts:2111-2121 | promote-client.service.ts:1444-1454 | D/I (identical) | one shared query | M6 | todo | |
| D2 | goodIds exclusion set | :1663-1674 | :1105-1113 | D/I | one shared builder | M6 | todo | |
| D3 | who decides buffer vs promote | first scheduler, lowest tgId | same | ?/? | no code exists; do not invent a rule | — | owner-gated (Q1) | |
| D4 | pre-enrol probe (hasPassword, channelInfo) | :1966-1978 | :1303-1313 (no debug log on 2FA skip) | D/I | one enrolment function | M5 | todo | |
| D5 | cross-pool dedup is in-process only | :1942-1952, 2005-2024 | :1279-1289, 1339-1358 | D/I | Mongo-backed claim | M13 | todo | |
| D6 | `setAs*` cross-pool guard | refuses mains + promote (:1262-1273) | refuses mains only (:818-823); neither takes the lock | D/**A** | promote also refuses buffer; both take the lock and re-check inside it | M1 | done | M1 |
| D7 | `setAs*` eligibility (no twoFA/hasPassword/activity filter) | :1252-1257 | :811-816 | D/? | operator override or same as auto-enrol? | — | owner-gated (Q7) | |
| D8 | `setAs*` clientId | required (controller :161,168) | optional, auto-assign (:825-841) | P/I | profile flag | M7 | todo | |
| D9 | `setAs*` HTTP verb | POST | GET (controller :118) | D/A | add POST, keep GET | M7 | owner-gated (Q6) for retiring GET | |
| D10 | manual bulk enrol bypasses the cap | `addNewUserstoBufferClients` (:2059-2084) uses window need, no counted/cap map -> cap 20 counted from 0, no fleet budget | **re-verified:** promote manual (:1393-1418) also passes no counts -> cap 30 counted from 0 (the input said it matched scheduled; it does not) | D/A | manual path uses the same plan/caps as the scheduled run, both pools | M6 | todo | |
| D11 | `badIds` parameter never used | :2086-2100 | :1420-1433 | D/A | part of the bulk-enrol request body; keep the parameter (contract) | — | won't-fix | |
| D12 | need calculation / fleet budget | dynamic plan (:303-437, buffer-supply.ts) | legacy window + cap 30 (:1214-1238), no engine budget | P/I + ? | promote gets the engine budget only if it does not cut supply sharply (measure) | M12 | todo | |
| D13 | per-client cap | dynamic or 20 (buffer-supply.ts:115,150) | 30 (:62) | P/I | profile value | M4 | todo | |
| D14 | healthy-for-cap | `isHealthyBufferClientForCap` (:268-288) | `isHealthyPromoteClientForCap` (:143-160) | D/A (copy), I (floor) | one function, floor from profile | M4 | todo | |
| D15 | spam-limit state | schema + supply shift | none | P/? | — | — | deferred to master-plan W-A (Q4) | |
| D16 | config block | :476-493 | :123-141 | P/I + ? | floor/minTotal -> profile; pacing values unchanged | M4 | todo (pacing owner-gated Q3) | |
| D17 | promote `totalSlotsNeeded` loop is a dead calculation | — | :1242-1256 | D/A | remove the dead math, keep the `>0` gate semantics | M6 | todo | |
| D18 | fields on auto-enrol | :1989-2022 | + `lastActive` ISO (:1323-1356) | D/I | profile `docExtras` | M5 | todo | |
| D19 | promote `lastActive`: ISO (auto) vs `'default'` (setAs, :850) | — | :850 vs :1325 | D/A | value read by tg-platform promote selection? not checked; keep | — | owner-gated (Q10) | |
| D20 | `create()` default `message` | none (:816-826) | `'Account is functioning properly'` (:469-481) | D/A | harmless; keep | — | won't-fix | |
| D21 | `create()` overwrites caller lifecycle (`warmupPhase`, `sessionRotatedAt`) | :816-825, reached from `returnOldClientToBufferPool` (client.service.ts:1545,1563) | same (:469-481) | P/A | **not changed here.** Fixing it would let a returning main without a buffer doc land directly in `session_rotated`, which is exactly the dirty re-entry W-E gates. Today's overwrite sends it back through warmup instead. | M3 | deferred to master-plan W-E | |
| D22 | schema strictness (`clientId`/`session` optional, no status enum on promote) | buffer-client.schema.ts:30-79 | promote-client.schema.ts:27-51 | D/A | tightening a schema can reject existing docs; out of scope | — | won't-fix | |
| D23 | promote `remove()` raw mobile | canonicalises (:913-916) | `deleteOne({ mobile })` (:754) | D/A | **re-verified:** not a lost delete (the schema `set: canonicalizeMobile` also canonicalises query values; M0 proves `+91...` deletes). Remaining drift: malformed mobile -> 500 not 400; notice shows the raw input. Canonicalise explicitly | M2 | todo | |
| D24 | enrol failure not logged on promote | :2043-2050 | :1378-1384 | D/A | one enrolment function logs for both | M5 | todo | |
| D25 | session copied from `users.session`, no login | :1991 | :1327 | D/I | — | — | done (already equal) | |
| D26 | READY -> SESSION_ROTATED | base :1506-1586, 2974-3083 | same | S/I | — | — | done (shared); rotation gate deferred to master-plan W-E | |
| D27 | recycled mains stamped SESSION_ROTATED directly | client.service.ts:1516-1563 | none | P/I | — | — | deferred to master-plan W-E | |
| D28 | phase machine, thresholds, jitter | warmup-phases.ts | same | S/I | — | — | done (shared); jitter deferred to master-plan W-D | |
| D29 | step implementations | base :1042-1420 | same | S/I | — | — | done (shared); deferred to master-plan W-C/W-D | |
| D30 | `updateNameAndBio` duplicated (~230 lines) | :497-731 | :164-398 | D/A (copy) | **re-verified:** byte-identical except surname field and other-pool service; one shared method | M8 | todo | |
| D31 | `updateUsername` set vs clear | :733-781 | :400-434 | P/I | keep both strategies; a "skip clear when already blank" needs a username read we do not store | — | won't-fix | |
| D32 | which phases the warmup run processes | skips READY (:1713) | skips READY + SESSION_ROTATED (:1151); health branch :1170-1175 dead | D/?/A | keep values; one loop with a profile list | M9 | todo (values owner-gated Q2) | |
| D33 | primary-mobile skip uses `===` | :1696 | n/a | P/I | stored mobiles are canonical (schema setter); keep | — | won't-fix | |
| D34 | promote SESSION_ROTATED never health-checked by the warmup run | warmup run + `updateInfo` | `updateInfo` only | D/A | adds Telegram connections to accounts that get none today | M10 | owner-gated (Q2) | |
| D35 | diagnostics endpoints | :1317, :1417 | none | D/A | observability only; not needed for unification | — | won't-fix | |
| D36 | join candidate tiering | :232-266 | :604-638 | D/I | one function | M11 | todo | |
| D37 | join sweep primary exclusion / clientId scope | :1846-1854 | :914-924 | D/I | profile flag | M11 | todo | |
| D38 | join sweep pacing | 1 gap/account (:1916) | 3 extra 5-8s sleeps + gap (:941-952, 983) | D/? | session-safety pacing; kept exactly | — | owner-gated (Q3) | |
| D39 | promote join sweep catch-all wipes every queued join | none | :997-1004 | D/A | log and rethrow, keep the queues (buffer behaviour) | M11 | todo | |
| D40 | `refillJoinQueue` copy | :1139-1221 | :640-710 (leave delay differs) | D/I+A | leave delays are pacing (Q3); exclusion via profile | M11 | todo (pacing owner-gated Q3) | |
| D41 | schedules / minute offsets | scheduled-jobs.service.ts:99,107-109,140-144 | :160,165-167,189-191 | P/I | keep exactly | — | won't-fix | |
| D42 | warmup failure backoff / deactivate cascade | base | same | S/I | — | — | done (shared) | |
| D43 | `updateStatus` / `markAsInactive` copies | :969-1007, 1225-1242 | :549-602, 716-733 | D/A | **re-verified:** identical modulo names; one shared implementation | M7 | todo | |
| D44 | swap/runtime age gates (15d vs 7d) | client.service.ts:1798-1815 | tg-platform | P/? | — | — | owner-gated (Q8) | |
| D45 | `setAsBufferClient` sleeps 5-10s after channelInfo; promote does not | :1281 | :812-851 | D/? | found by M0 ledger; pacing, kept exactly | — | owner-gated (Q3) | |
| D46 | archive collections (`*Archive`) written by no CMS code | — | — | ?/? | — | — | owner-gated (Q9) | |

## Owner questions (exact)

1. **Q1 (D3, D12):** Should a candidate's pool be chosen deliberately (ratio, or buffer-first while any client has 0 free buffers), or is "whichever pool's run needs it first, lowest tgId first" acceptable?
2. **Q2 (D32, D34, M10):** Was skipping promote `session_rotated` accounts in the warmup run deliberate? Today 74/255 have never been health-checked by CMS. Options: match buffer (health-check in the warmup run), run `updateInfo` daily (25/run), or leave it to tg-platform's own failure handling. Either option adds Telegram connections to accounts that get none today.
3. **Q3 (D16, D38, D40, D45):** Is there a safety reason for promote's three extra 5-8s sleeps per join-sweep account, its 60s vs 120s leave interval, its 8s vs 10s processing delay, and for buffer's 5-10s sleep in `setAsBufferClient` that promote lacks? Or can both pools share one set of values (which set)?
4. **Q6 (D9):** A `POST SetAsPromoteClient/:mobile` can be added alongside the GET. Does any caller (dashboard, scripts) use the GET, and may it be retired later?
5. **Q7 (D7):** Should `setAs*` apply the auto-enrol filters (`twoFA:false`, the `hasPassword()` probe, activity filters), or may operators override?
6. **Q8 (D44):** Buffer swap requires `createdAt <= now-15d`, promote runtime `< now-7d`. Both are moot behind the day-24 READY gate. Drop, unify, or keep?
7. **Q9 (D46):** Who moves dead docs to `bufferClientsArchive` / `promoteClientsArchive`, and should the shared pipeline own it?
8. **Q10 (D19):** `setAsPromoteClient` writes `lastActive: 'default'`, auto-enrol writes an ISO time. Does any consumer depend on `'default'`? If not, both should write the ISO time.
