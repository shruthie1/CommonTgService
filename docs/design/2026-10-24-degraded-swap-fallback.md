# Degraded swap fallback (2026-10-24)

Status: implemented locally, not deployed. Owner-approved direction 2026-10-24. Review fixes
D1-D9 applied 2026-10-24 (rescue and pool-refill passes, marker from the probe, sibling-race
exclusions). Review-2 fixes applied 2026-10-24: rescue acts only on live-session evidence
(`clients.deadMain`), cross-process leases, upgrade backoff + cap, job passes never create a
session, idempotent retire, fresh-verdict refill, per-client error isolation. Review-3 fixes
applied 2026-10-24: late reports from a replaced tg-aut process (`reportedMobile` +
`stale_report`, 15-min grace after a cutover for old bundles), `disabled` is not an attempt,
`update()` clears `deadMain` on a new session, pinned calls write no `deadMain`, leases renewed
during a run, 60-min run claim with no slot overlap.

## Problem

When a client's live tg-aut account dies and `GET /setupClient/:clientId` finds no eligible
buffer, CMS retires the dead account but leaves `clients.<id>` pointing at it. The client then
serves nobody until a human moves it by hand.

## Incident

- sneha2 main ****3438 frozen 2026-10-24 05:37Z.
- `setupClient` returned `no_candidate`: 0 eligible; the permanent-reason fallback scan found 2
  future-dated buffers and rejected both as harsh. CMS retired ****3438 and left sneha2 on it.
- Fixed by hand: `clients.sneha2` → buffer ****5704 (session-rotated, SpamBot-limited until
  10-29), written the way `setupClient` would write it, then `pm2 restart`.
- tg-aut on ****5704 kept calling `/setupClient` (SpamBot-limit trigger) and got `no_candidate`
  plus a "No buffer" notice each time.

## Trigger classification

Degraded tiers run only when the swap reason means the live account is DEAD
(`isDeadSwapReason`, token match, in `src/components/clients/degraded-swap.ts`):

`FROZEN_METHOD_INVALID`, `FROZEN_PARTICIPANT_MISSING`, `USER_DEACTIVATED`,
`USER_DEACTIVATED_BAN`, `SESSION_REVOKED`, `AUTH_KEY_UNREGISTERED`, `AUTH_KEY_DUPLICATED`,
`PHONE_NUMBER_BANNED`, plus the internal `DEAD_MAIN_RESCUE` (the rescue pass below).

- `INPUT_USER_DEACTIVATED` (another user deleted their account) is never dead, even when the
  message also carries a `USER_DEACTIVATED` token. It is checked first, as in `isPermanentError`.
- `SESSION_EXPIRED` and `PHONE_NUMBER_INVALID` are permanent in `isPermanentError` but are not
  dead here (owner decision: SESSION_EXPIRED stays off the list).
- tg-aut sends the parsed code as `reason=` from the permanent-failure handoff
  (`apps/tg-aut/src/telegram/permanent-failure/handoff.ts`). The SpamBot-limit swap
  (`system-message-handler.ts`) and the promotion-health swap (`jobs/job-manager.ts`) send prose
  reasons, so they never qualify. A SpamBot-limited main still answers inbound DMs: we keep it,
  and the pool-refill pass moves it once a tier-1 buffer exists.
- A request that pins `?mobile=` never uses degraded tiers.

## Tiers

Tier 1 is the existing rules, unchanged: own pool, due `availableDate`, then (permanent reason
only) the future-`availableDate` fallback. Tiers 2-4 run only when tier 1 found nothing **and**
tier 1 has no unprobed candidates left. If the tier-1 probe budget ran out, the answer stays
`no_candidate` + `moreCandidatesPending`, and the caller's retry reaches those candidates first.

| Tier | Source | Selection |
|---|---|---|
| 2 | Same-persona sibling (same `dbcoll`, other `clientId`) | Tier-1 rules on the sibling's pool. Used only if the sibling keeps at least 2 **usable** spares afterwards. Usable = `users` doc present, not expired, 2FA on, and a stored backup session distinct from the buffer session (read-only check, nothing is created). All rows are counted (no limit). Only the first `usable - 2` are tried, so a spare lost to a failed probe also counts as gone. Lender with the most usable spares first. `clientId` is reassigned inside the cutover transaction. |
| 3 | Own pool, temporarily limited | `status: active`, not `inUse`, `warmupPhase: session_rotated`, `channels >= 200`, `spamStatus: limited`, `limitedUntil > now`. Sort `limitedUntil` asc, `channels` desc, `createdAt` asc. |
| 4 | Own pool, harsh limit | Same filters, `spamStatus: harsh`. Sort `channels` desc, `createdAt` asc. Inbound-only, so the alert is louder. |

All degraded tiers also require a `users` doc with `expired !== true` and `twoFA === true`,
checked before the backup-session check can create a session.

Ranking is deterministic. Random selection was ruled out.

## Exclusions (any tier)

Never swapped in: `status: inactive` (frozen and expired accounts are deactivated by
`expireAccount`), expired users, users without 2FA, `inUse`, warming accounts (any phase other
than `session_rotated`, `ready` included), fewer than 200 channels, the dead main itself, the
promote pool (only `bufferClients` is queried), and another persona's pool.

Sibling race (D3): every candidate query, tier 1 included, excludes `$nin` the mobiles of any
active client setup (`TelegramManager.activeClientSetups`, new and existing mobile) and every
other client's current main. A candidate whose setup is registered to another client between
the query and the probe is skipped before and again after the probe.

## Safety (same as a normal swap)

- **SpamBot probe** before every degraded pick, using a shared 3-probe budget for tiers 2-4.
  Tier 2 accepts only `free` (tier-1 rules). Tier 3 also accepts `limited`, and tier 4 also
  accepts `harsh`. These are always rejected, and the next candidate is tried: connect failure
  (dead session), send failure (e.g. `FROZEN_METHOD_INVALID`), a busy connection, and an
  unrecognised SpamBot reply that mentions "frozen". An `unknown` reply with no frozen mention
  is allowed, as in tier 1, and keeps the stored `limitedUntil`.
- Separate-session check (`assertDistinctUserBackupSession`).
- One Mongo transaction for the cutover, with the current-mobile guard
  (`{clientId, mobile: expectedExisting}`). Tier 2 adds `reassignClientId`, which matches only
  an active, not-in-use buffer still owned by the sibling, and throws `ConflictException`
  otherwise.
- Ownership (D3): the setup registry entry is written before any await, so a parallel request
  for another client sees it. Degraded plans are keyed `clientId:mobile`, and
  `updateClientSession` refuses a setup whose `clientId` is not the caller's. On a failed swap,
  the `availableDate` push, the setup-registry clear and `unregisterClient` are skipped when the
  mobile now belongs to another client (a fresh `clients` read; a read error counts as taken).
- Unchanged: the per-client in-flight lock (`setupInFlightMap`, which coalesces concurrent
  requests), the 4-min cooldown, the `deployKey` restart, the uptime map refresh
  (`performPostUpdateTasks`) and the bot notices. No `removeOtherAuths` on any of these paths.
- **Cross-process leases (review 2).** `cms` (the job) and `ums` / `ums-test` (HTTP
  `/setupClient`) share Mongo, not memory. Every `setupClient` run (HTTP and job passes) first
  takes `clients.swapLease {owner: host:pid:uuid, until}` with one atomic `findOneAndUpdate`
  (free = absent, null or expired), before any probe or connection, and releases it in `finally`.
  TTL `SWAP_LEASE_TTL_MS` = 10 min, so a crashed holder frees itself. A held lease answers
  `cooldown` ("in progress in another CMS process", `cooldownRemainingMs` <= 4 min; tg-aut waits
  exactly that long). Each candidate is leased on `bufferClients.probeLease` before anything can
  connect it (backup-session check, SpamBot probe, cutover); a candidate leased by another
  process is skipped (not probed) and the answer says `moreCandidatesPending`. Sibling spares
  (tier 2) go through the same code, so two setupClient runs in different processes never
  connect one session at once. A rejected candidate's lease is released at once; the picked one
  keeps it through the cutover. A running setup renews both leases every `SWAP_LEASE_RENEW_MS`
  (2 min) to now + 10 min (review 3), so a long HTTP run (backup-session creation, slow connects)
  keeps them; a crashed process stops renewing and frees them within 10 min (DS-138).
  **Scope (known limit):** only `setupClient` runs (HTTP and job passes) take or read these
  leases. Warmup, health checks, channel joins, `updateClient` and the other paths that connect
  buffer sessions use their own in-process guards, as before this change; a `setupClient` probe
  in one process and, say, a warmup step in another can still touch one session at once. Not
  widened here.
- **Late reports from a replaced process (review 3).** `/setupClient` used not to say which
  mobile the caller runs on. Between a cutover and tg-aut's restart the OLD process (still on the
  old mobile) could report dead or send a SpamBot trigger, and CMS booked it against the NEW main:
  a second swap, or `deadMain` on the new main that the rescue pass then acted on. Now:
  - tg-aut adds `reportedMobile=<its mobile>` to every `/setupClient` call (additive query
    param; `requestClientSetup` appends it for every trigger, the dead handoff sets it too).
  - CMS (HTTP path only) answers `stale_report` and does nothing (no swap, no `deadMain`) when
    `reportedMobile` is present and not `clients.mobile`. A `reportedMobile` equal to the main is
    not held back, except within 15 min of a session change by `update()` (below). An unparseable value counts as absent (never a 400).
  - Old bundles (no param): every cutover stamps `clients.swappedAt` (Mongo, so `ums` sees what
    `cms` did); for `SWAP_REPORT_GRACE_MS` = 15 min after it a report with a reason and no pinned
    `?mobile=` is answered `cooldown` (`cooldownRemainingMs` = rest of the window, a status old
    bundles know) and does nothing. Why 15 min: CMS calls the `deployKey` restart right after the
    commit (seconds), and tg-aut suppresses its own requests 5 min after a swap; an old bundle
    whose new main really is dead still gets through: its handoff gate (`>= now - 60 s x
    2^failedHandoffs`) tries at t0 + 0, 2, 6, 14 and 30 min, and only the 30-min attempt is sure to
    land after the window (DS-134).
  - `update()` with a new session (manual re-login) also stamps `swappedAt`, plus
    `sessionChangedAt` when the mobile is unchanged: the running process still holds the old
    session on the SAME mobile, so `reportedMobile` cannot tell it apart, and reports for the main
    are answered `cooldown` for the same 15 min (DS-140). A cutover clears `sessionChangedAt`.
  - `reportedMobile` is never a 400: a repeated param (Express array) takes its first element; a
    non-string is absent or implicitly stringified and then unparseable, i.e. absent (DS-141).
  - A pinned `?mobile=` call (operator) writes no `deadMain` and skips the grace window.
- **Error path (review 2).** On a failed swap the `availableDate` push and the `unregisterClient`
  are skipped when the mobile is ANY client's current main, this client included (our own
  cutover can commit before a later step throws). `updateClientSession` still releases CMS's own
  connection after a cutover, so tg-aut is the only user of the new session.

## Marker

`clients.degraded = { since, tier, reason, fromMobile, limitedUntil, fromClientId? }`. This is
an additive schema field.

The marker records what the account **is**, from the probe result, not which tier picked it
(D2, `markerTierFromVerdict`):

| Pick | Probe says | Marker |
|---|---|---|
| tier 2 (sibling) | free (the only accepted verdict) | none: it meets tier-1 rules. Notice "Buffer borrowed" (warning) |
| tier 3 or 4 | free | none |
| tier 3 or 4 | limited | tier 3, with the **probed** `limitedUntil` |
| tier 4 | harsh | tier 4 |
| tier 3 or 4 | unknown | the pick tier |

- Every cutover without a marker `$unset`s it.
- `update()` (manual fix, ops tools) `$unset`s it when the mobile changes and the update does
  not set `degraded` itself (D5).
- `findAllMasked`, `findOneMasked` and `findAllMaskedObject` strip it (and `swapRetry`), because both hold a mobile,
  so `/clients/maskedcls*` (read by vcui-local and payment-local) returns exactly the same shape
  as before.

`/setupClient` response, additive only (old tg-aut builds ignore it):
- `degradedTier` on `swapped`, only when a marker was stamped.
- `degraded: true` on `no_candidate` when the client is already degraded.

The status set gains `stale_report` (review 3). Only bundles that send `reportedMobile` ever
get it; old bundles see only the statuses they already know (`cooldown` in the grace window).

## Swap-maintenance job

`cms-swap-maintenance`, cron `7,37 * * * *` IST, CMS scheduler only, run-claimed per UTC
half-hour slot in `controlPlaneJobRuns` (`swap-maintenance:<slot>`, the same lease as
`AnalyticsHealthCheck`). Its claim lasts 60 min, not the default 15 (review 3): worst case per
run is <= 54 probes x 25 s = 22.5 min plus <= 9 cutovers (connect, getMe, restart call, retire;
not individually capped, budgeted at 2 min each) = ~40 min, estimated from the code's timeouts,
not measured live. A slot is skipped while the previous slot's claim is still live, so two runs
never overlap (DS-J02); a crashed run blocks at most the next one or two slots. It replaces `cms-degraded-upgrade`. Each run reads `clients` fresh and,
per client, the main's `users` docs and buffer row. All swaps go through `setupClient`'s lock,
leases and cooldown. Job passes never create a backup session: a candidate needs a STORED users
session distinct from its own (`getOrEnsureDistinctUsersBackupSession`, which can connect and
call `createNewSession`, is HTTP-only); others are skipped. One client's error (a Mongo read, a
throw anywhere in its pass) is a `failed` row and never aborts the run. Three passes, one client
at a time:

1. **Rescue (D1, review 2).** Evidence is live-session only. When `/setupClient` is called with
   an owner dead reason (`isDeadSwapReason`; tg-aut is the only process on the live session),
   CMS stores `clients.deadMain {mobile, reason, at}` for the CURRENT mobile (guarded write; `at`
   = the latest report). A client is rescued only when `deadMain.mobile === clients.mobile` and
   `deadMain.reason` passes `isDeadSwapReason` (so `SESSION_EXPIRED` never counts). `users`
   expiry and inactive pool rows are NOT evidence: CMS writes them when the BACKUP session
   (`users[0].session`) fails (connection-manager `expireAccount`, users delete, `updateClient`),
   while the live `clients.session` may be fine. Rescue also waits `DEAD_MAIN_HANDOFF_WAIT_MS` =
   35 min after the last report, so tg-aut's own handoff ladder (1+2+4+8+16 min) finishes
   first. `deadMain` is cleared by any cutover and by `update()` changing the mobile, and the
   masked endpoints never return it (nor `swapLease`). Reason `DEAD_MAIN_RESCUE: <reported
   reason>` (never recorded as evidence itself), `archiveOld=false`, `formalities=false`, all
   tiers. Retiring is idempotent: a main whose users docs are all expired and whose pool row is
   inactive is not expired or announced again ("Inactivated" is sent once per account; a
   partially expired main is retired). At most `RESCUE_MAX_PER_RUN` = 3 attempts per run.
2. **Upgrade.** For each degraded client with a live main:
   - If the current account now meets tier-1 rules (pool row owned by this client, active,
     `session_rotated`, >= 200 channels, >= 15 days old, not harsh, no `limitedUntil` in the
     future on the row or the marker, users doc not expired), the marker is cleared with a guarded
     `$unset` and "Degraded cleared" is sent. There is no swap. The live main is never probed.
   - Otherwise it runs `setupClient` with reason `DEGRADED_UPGRADE` and only tiers strictly
     better than the current one (tier 1 always). The current account is alive, so this is a
     normal swap: `archiveOld=true` and `formalities=true`, and the degraded account returns to
     the pool with `availableDate` no earlier than its `limitedUntil`. An upgrade keeps the
     episode's original `since` and `reason`. If nothing is better, nothing is sent.
   - Review 2: same episode rule as rescue (pass `upgrade`), at most `UPGRADE_MAX_PER_RUN` = 3
     swap attempts per run. A marker clear is not an attempt and runs for every client.
3. **Pool refill (D8).** A non-degraded, alive main that is SpamBot-limited (harsh, or limited
   with a future `limitedUntil`) is swapped once a tier-1 buffer exists. The main's stored verdict
   counts only if `spamCheckedAt` is at most `MAIN_SPAM_STATUS_FRESH_MS` = 7 days old (a 60-day-old
   harsh status says nothing about today). A cheap query (limit 1, no probe, no notice) runs
   first. Reason `POOL_REFILL`, `archiveOld=true`, `formalities=true`, tier 1 only. At most
   `POOL_REFILL_MAX_PER_RUN` = 3 attempts per run. tg-aut's own no_candidate cap stays as it is.

**Amplification bound per run (40 clients, measured in DS-129).** At most 3 setups per pass, so
<= 9 `setupClient` runs, <= 9 restarts (only a swap restarts), whatever the client count. Probes
per setup: tier 1 due 3, plus the dead-only future-date fallback 3, plus the shared degraded
budget 3 (degraded tiers run only when tier 1 left nothing unprobed). Rescue <= 9, upgrade <= 6
(no future fallback), refill <= 3 (tier 1 only), so <= 3x9 + 3x6 + 3x3 = **54 SpamBot probes per
run**. DS-129 builds 40 clients (14 dead, 13 degraded, 13 limited) whose every probe fails to
connect and measures exactly 9 setups, 54 probes, 0 restarts. Per client, the episode rule caps
it at 6 attempts per episode (<= 54 probes per rescue episode). HTTP `/setupClient` from tg-aut
is separate (its own ladders; at most 9 probes per call).

Retry rule for rescue, upgrade and refill (owner rule: exponential backoff plus a hard stop;
coordinator decision 2026-10-24; upgrade added in review 2). One episode per client, persisted on `clients.swapRetry`
`{ pass, mobile, attempts, nextAt, poolFingerprint, since, stoppedAt }`, so a CMS restart does
not re-arm it:

- After a miss (no_candidate, failed) the next attempt waits 30 min, then 60, 120, 240,
  480 min. The **6th miss is the hard stop** (`PASS_MAX_ATTEMPTS`): `stoppedAt` is set, ONE notice
  is sent, and later runs report `stopped` without calling setupClient.
  - rescue: critical "Rescue stopped": "`<client>` stuck on dead main, rescue stopped after 6
    tries, will retry when the pool changes".
  - upgrade: warning "Upgrade stopped".
  - refill: warning "Pool refill stopped".
- A CMS `cooldown` answer (in-process 4-min cooldown or another process's lease) or a
  `disabled` answer (`AUTO_CLIENT_SETUP` off) is not an attempt: nothing was probed. No backoff,
  no hard stop and no "Rescue stopped" while setup is switched off (DS-135).
- The episode **re-arms** (count back to 0, attempt at once) only when:
  - `clients.mobile` differs from `swapRetry.mobile` (manual fix, another process), or a different
    pass applies;
  - the pool fingerprint changed. The pool is the bufferClients rows of the client and its
    same-`dbcoll` siblings. `swapPoolFingerprint` encodes, per active not-in-use row: clientId,
    mobile, session_rotated yes/no, >= 200 channels yes/no, availableDate due yes/no, spamStatus,
    limit still running yes/no. So a new doc, an availableDate or limitedUntil passing, a row
    reaching session_rotated or 200 channels, or a status change re-arms it, while channel-count
    noise and `updatedAt` do not. It is computed fresh each run and stored after each attempt, so
    the attempt's own SpamBot probe writes never count as a change. Users-doc changes (expiry,
    2FA) are not in the fingerprint.
- A swap ends the episode: the cutover `$unset`s `swapRetry`.
- Writes are guarded on `{clientId, mobile}`, so a concurrent cutover is never overwritten. The
  job is run-claimed, so one process runs it per slot.

## Alerts

- **Degraded swap**: tier, new and old mobile (last 4), limitedUntil, borrowed-from, reason.
  `warning` for tier 3, `critical` for tier 4.
- **Buffer borrowed**: a tier-2 swap (no marker), `warning`.
- **Degraded upgrade** on a move to a better degraded tier. **Degraded cleared** on a move to
  tier 1, or when the upgrade pass finds the current account meets tier-1 rules.
- **No buffer**: one notice per episode, not one per retry. The episode key is
  `clientId:currentMobile:dead|normal` (D4), so a manual fix or another process moving the client
  starts a new episode. The episode ends at the next successful swap or a CMS restart. It is
  `critical` for a dead main.
- **Rescue stopped** (critical) / **Upgrade stopped** / **Pool refill stopped** (warning): once,
  at the hard stop.
- **Degraded daily** (`cms-degraded-summary`, 10:05 IST, claimed per IST day): degraded clients
  (tier, mobile last 4, since, limitedUntil), clients with zero tier-1-eligible spares (the
  per-client pool-empty warning), and **stuck** clients (episode at the hard stop, still on the
  same main: client, pass, mobile last 4, tries, stopped at). Severity `error` when a rescue is
  stuck or a client is on tier 4. Nothing is sent when all three lists are empty.

## tg-aut

`apps/tg-aut/src/telegram/setup-client.ts`, shared by the SpamBot and promotion triggers:

- Consecutive `no_candidate` answers back off 2, 4, 8, 16 h (15, 30, 60, 120 min while CMS
  reports `moreCandidatesPending`). After 5 in a row the triggers stop until the process
  restarts. Before this change it was every 2 h, forever.
- `no_candidate` with `degraded: true` stops at once. The swap-maintenance job owns that client.
- Dead-account handoffs (`bypassBackoff`) are untouched. They back off 1, 2, 4, 8 and 16 min and
  stop after 5 failures. Each dead handoff stores `clients.deadMain`; 35 min after the last one
  the CMS rescue pass owns the client. A successful dead handoff
  logs `newMobile` and `degradedTier`.
- Every request carries `reportedMobile` = `process.env.mobile` (TA-18, DJ-01..04). A
  `stale_report` answer means CMS already moved the client off this mobile: the triggers stop
  until the restart (TA-19), and the dead handoff stops without counting a failure or retrying
  (DJ-04). tg-aut does not restart itself on it; CMS's cutover restart does.

## Config

`DEGRADED_SWAP_TIERS` in the Mongo `configuration` doc, read at call time:

- Unset or blank means `2,3,4`.
- `none` (or `off`, `0`, `false`) disables the fallback.
- A subset such as `3,4` is honoured.
- A value with no valid tier fails closed (disabled).
- The rescue pass honours it too (with `none`, a dead main is swapped only to tier 1). The
  upgrade and refill passes still move clients to tier 1 when the fallback is disabled.

## Rollback

`DEGRADED_SWAP_TIERS=none` stops new degraded swaps at the next request, with no restart. The
rescue and refill passes then only ever take tier-1 buffers. A full rollback is `git revert`
and a redeploy of CMS and tg-plat. Existing `clients.degraded` markers must be removed
**before** the revert (`$unset` `clients.degraded`, `clients.swapRetry`, `clients.deadMain` and
`clients.swapLease`, `clients.swappedAt`, `clients.sessionChangedAt`, and `bufferClients.probeLease`): old code does not
strip these fields from the masked endpoints, so `/clients/maskedcls` would expose
`degraded.fromMobile`, `swapRetry.mobile` and `deadMain.mobile`. `reportedMobile` is additive in
both directions: an old CMS ignores it (its DTO pipe does not whitelist), and an old tg-aut
bundle against the new CMS gets the 15-min grace window instead of `stale_report`.

## Rollout

1. Deploy CMS (`pm2 restart cms` loads the bundle). Optionally start with
   `DEGRADED_SWAP_TIERS=3` and widen it after the first real event.
2. Deploy tg-plat. Each process picks it up on its next natural restart; no forced restarts.
3. Watch for Degraded swap / Buffer borrowed / upgrade / cleared / daily notices, and check the
   `controlPlaneJobRuns` `swap-maintenance:*` docs (results: `{rescue, upgrade, refill}`).

## Scenario matrix

Every row is a test. The ID is the start of the jest test name, so
`npx jest src/components/clients/__tests__/degraded-swap.regression.spec.ts -t "DS-42 "` runs
one row (keep the trailing space). Source: `src/components/clients/__tests__/degraded-swap.regression.spec.ts`
(rows) and `degraded-swap.fixtures.ts` (shared fixture: real `ClientService`, real
`clients`/`bufferClients` collections on an in-memory replica set so the cutover transaction is
real, real `BufferClientService` ownership methods; Telegram, SpamBot probe, notices, users docs
and HTTP are faked). DS-J01 is in `src/control-plane/jobs/scheduled-jobs.service.spec.ts`.

| ID | Area | Setup / trigger | Expected | Run it |
|---|---|---|---|---|
| DS-01 | Trigger | dead reason FROZEN_METHOD_INVALID | degraded tiers allowed (tier-3 swap) | `-t "DS-01 "` |
| DS-02 | Trigger | dead reason FROZEN_PARTICIPANT_MISSING | degraded tiers allowed (tier-3 swap) | `-t "DS-02 "` |
| DS-03 | Trigger | dead reason USER_DEACTIVATED | degraded tiers allowed (tier-3 swap) | `-t "DS-03 "` |
| DS-04 | Trigger | dead reason USER_DEACTIVATED_BAN | degraded tiers allowed (tier-3 swap) | `-t "DS-04 "` |
| DS-05 | Trigger | dead reason SESSION_REVOKED | degraded tiers allowed (tier-3 swap) | `-t "DS-05 "` |
| DS-06 | Trigger | dead reason AUTH_KEY_UNREGISTERED | degraded tiers allowed (tier-3 swap) | `-t "DS-06 "` |
| DS-07 | Trigger | dead reason AUTH_KEY_DUPLICATED | degraded tiers allowed (tier-3 swap) | `-t "DS-07 "` |
| DS-08 | Trigger | dead reason PHONE_NUMBER_BANNED | degraded tiers allowed (tier-3 swap) | `-t "DS-08 "` |
| DS-09 | Trigger | `isDeadSwapReason` on each dead code, any case, inside a longer message | true; tokens only (no substring hits) | `-t "DS-09 "` |
| DS-10 | Trigger | internal reasons | `DEAD_MAIN_RESCUE` dead; `DEGRADED_UPGRADE`, `POOL_REFILL` not dead | `-t "DS-10 "` |
| DS-11 | Trigger | not dead: "SpamBot limited until 29 Oct" | never degraded (no probe, no swap) | `-t "DS-11 "` |
| DS-12 | Trigger | not dead: "SpamBot harsh limit (indefinite)" | never degraded (no probe, no swap) | `-t "DS-12 "` |
| DS-13 | Trigger | not dead: "PEER_FLOOD" | never degraded (no probe, no swap) | `-t "DS-13 "` |
| DS-14 | Trigger | not dead: "FLOOD_WAIT_120" | never degraded (no probe, no swap) | `-t "DS-14 "` |
| DS-15 | Trigger | not dead: "ECONNRESET network error" | never degraded (no probe, no swap) | `-t "DS-15 "` |
| DS-16 | Trigger | not dead: "Request timed out" | never degraded (no probe, no swap) | `-t "DS-16 "` |
| DS-17 | Trigger | not dead: "INPUT_USER_DEACTIVATED" | never degraded (no probe, no swap) | `-t "DS-17 "` |
| DS-18 | Trigger | not dead: "INPUT_USER_DEACTIVATED: USER_DEACTIVATED" | never degraded (no probe, no swap) | `-t "DS-18 "` |
| DS-19 | Trigger | not dead: "Promotion health check failed: failStreak=9" | never degraded (no probe, no swap) | `-t "DS-19 "` |
| DS-20 | Trigger | not dead: "unknown" | never degraded (no probe, no swap) | `-t "DS-20 "` |
| DS-21 | Trigger | not dead: "SESSION_EXPIRED" | never degraded (no probe, no swap) | `-t "DS-21 "` |
| DS-22 | Trigger | dead reason + `?mobile=` pinned, pinned mobile not eligible | no_candidate; tiers 2-4 never scanned | `-t "DS-22 "` |
| DS-23 | Tier selection | tier 1 available | tier 1 used, no marker, degraded tiers not scanned | `-t "DS-23 "` |
| DS-24 | Tier selection | dead main, no tier 1, sibling with 3 usable spares | one lent (sibling keeps 2), clientId reassigned, no marker | `-t "DS-24 "` |
| DS-25 | Tier selection | sibling with 2 usable spare(s) never lends | tier 3 | `-t "DS-25 "` |
| DS-26 | Tier selection | sibling with 1 usable spare(s) never lends | tier 3 | `-t "DS-26 "` |
| DS-27 | Tier selection | sibling with 0 usable spare(s) never lends | tier 3 | `-t "DS-27 "` |
| DS-28 | Tier selection | sibling spare with expired users doc is not counted (3 rows, 2 usable) | no lend, tier 3 | `-t "DS-28 "` |
| DS-29 | Tier selection | sibling spare with no 2FA is not counted (3 rows, 2 usable) | no lend, tier 3 | `-t "DS-29 "` |
| DS-30 | Tier selection | sibling spare with no distinct backup session is not counted (3 rows, 2 usable) | no lend, tier 3 | `-t "DS-30 "` |
| DS-31 | Tier selection | sibling with spares but a different `dbcoll` | never lends | `-t "DS-31 "` |
| DS-32 | Tier selection | several tier-3 rows | picked by limitedUntil asc, channels desc, createdAt asc | `-t "DS-32 "` |
| DS-33 | Tier selection | only a harsh row | tier 4 swap, critical "Degraded swap" | `-t "DS-33 "` |
| DS-34 | Tier selection | a harsh row and a limited row | tier 3 used | `-t "DS-34 "` |
| DS-35 | Tier selection | DEGRADED_SWAP_TIERS=none | old behaviour (no_candidate) | `-t "DS-35 "` |
| DS-36 | Tier selection | DEGRADED_SWAP_TIERS=3 | sibling never consulted, tier 3 used | `-t "DS-36 "` |
| DS-37 | Tier selection | DEGRADED_SWAP_TIERS=2,4 | tier-3 buffer ignored, tier 4 used | `-t "DS-37 "` |
| DS-38 | Tier selection | `DEGRADED_SWAP_TIERS=2;3` | fallback disabled (fails closed) | `-t "DS-38 "` |
| DS-39 | Exclusion | exclusion: warming: enrolled | never swapped in (any tier) | `-t "DS-39 "` |
| DS-40 | Exclusion | exclusion: warming: settling | never swapped in (any tier) | `-t "DS-40 "` |
| DS-41 | Exclusion | exclusion: warming: identity | never swapped in (any tier) | `-t "DS-41 "` |
| DS-42 | Exclusion | exclusion: warming: growing | never swapped in (any tier) | `-t "DS-42 "` |
| DS-43 | Exclusion | exclusion: warming: maturing | never swapped in (any tier) | `-t "DS-43 "` |
| DS-44 | Exclusion | exclusion: ready but not session_rotated | never swapped in (any tier) | `-t "DS-44 "` |
| DS-45 | Exclusion | exclusion: channels < 200 | never swapped in (any tier) | `-t "DS-45 "` |
| DS-46 | Exclusion | exclusion: status inactive | never swapped in (any tier) | `-t "DS-46 "` |
| DS-47 | Exclusion | exclusion: inUse | never swapped in (any tier) | `-t "DS-47 "` |
| DS-48 | Exclusion | exclusion: users doc expired | never swapped in (any tier) | `-t "DS-48 "` |
| DS-49 | Exclusion | exclusion: users doc without 2FA | never swapped in (any tier) | `-t "DS-49 "` |
| DS-50 | Exclusion | exclusion: other dbcoll pool (other clientId) | never swapped in (any tier) | `-t "DS-50 "` |
| DS-51 | Exclusion | matching rows only in promoteClients | never consulted | `-t "DS-51 "` |
| DS-52 | Exclusion | only candidate is in another client's active setup | not picked (D3) | `-t "DS-52 "` |
| DS-53 | Exclusion | only candidate is another client's current main | not picked (D3) | `-t "DS-53 "` |
| DS-54 | Exclusion | the dead main is still a matching row | never picked | `-t "DS-54 "` |
| DS-55 | Probe | T3 probe limited | accepted, marker 3 with the PROBED limitedUntil | `-t "DS-55 "` |
| DS-56 | Probe | T3 probe harsh | rejected, next candidate | `-t "DS-56 "` |
| DS-57 | Probe | T3 probe free | accepted with NO marker (D2) | `-t "DS-57 "` |
| DS-58 | Probe | T4 probe limited | marker 3, not 4 (D2) | `-t "DS-58 "` |
| DS-59 | Probe | T4 probe free | no marker (D2) | `-t "DS-59 "` |
| DS-60 | Probe | probe unrecognised reply mentioning a frozen account | rejected, falls through to the next candidate | `-t "DS-60 "` |
| DS-61 | Probe | probe connect failure (dead session) | rejected, falls through to the next candidate | `-t "DS-61 "` |
| DS-62 | Probe | probe send failure FROZEN_METHOD_INVALID | rejected, falls through to the next candidate | `-t "DS-62 "` |
| DS-63 | Probe | T2 sibling spare probed limited | rejected, next sibling spare | `-t "DS-63 "` |
| DS-64 | Probe | degraded probe budget exhausted | no_candidate + moreCandidatesPending | `-t "DS-64 "` |
| DS-65 | Probe | all candidates rejected for an already-degraded client | no_candidate + degraded:true | `-t "DS-65 "` |
| DS-66 | Probe | tier-1 probes pending | degraded tiers wait for the retry | `-t "DS-66 "` |
| DS-67 | Marker | degraded tier-3 swap | marker {since, tier, reason, fromMobile, limitedUntil} written inside the transaction | `-t "DS-67 "` |
| DS-68 | Marker | degraded client gets a tier-1 swap | marker `$unset`, "Degraded cleared" | `-t "DS-68 "` |
| DS-69 | Marker | `update()` sets a new mobile on a degraded client | `$unset degraded` (D5) | `-t "DS-69 "` |
| DS-70 | Marker | `update()` without a mobile change | marker kept | `-t "DS-70 "` |
| DS-71 | Marker | degraded client | masked endpoints identical to pre-change shape | `-t "DS-71 "` |
| DS-72 | Maintenance job | upgrade: degraded T3 + tier-1 appears | swapped up, marker cleared, old account returned with availableDate held to limitedUntil (real archive path, D9) | `-t "DS-72 "` |
| DS-73 | Maintenance job | upgrade: T3 whose limit has expired | marker cleared, no swap (D2) | `-t "DS-73 "` |
| DS-74 | Maintenance job | upgrade: legacy T2 marker on an account meeting tier-1 rules | cleared, NOT swapped to another free one (D2) | `-t "DS-74 "` |
| DS-75 | Maintenance job | upgrade: only strictly better tiers; nothing better | no swap, no notice, attempt 1 of the episode | `-t "DS-75 "` |
| DS-76 | Maintenance job | upgrade: T4 | T3 keeps the episode reason and since; one "Degraded upgrade" | `-t "DS-76 "` |
| DS-77 | Maintenance job | rescue: the degraded account itself dies (tg-aut reported it dead) | rescued, any tier (D1) | `-t "DS-77 "` |
| DS-78 | Maintenance job | rescue: client reported dead, main already retired by that report, tg-aut at its handoff cap | rescued to tier 1; main not retired or announced again (0 "Inactivated") | `-t "DS-78 "` |
| DS-79 | Maintenance job | main row inactive with an [UNSAFE] reason, no tg-aut report | no rescue | `-t "DS-79 "` |
| DS-80 | Maintenance job | refill: SpamBot-limited (alive) main + tier-1 appears | swapped, reason POOL_REFILL, old returned (D8) | `-t "DS-80 "` |
| DS-81 | Maintenance job | refill: limited main, no tier-1 buffer | no setup call, no notice | `-t "DS-81 "` |
| DS-82 | Maintenance job | healthy main + tier-1 spare | refill does nothing | `-t "DS-82 "` |
| DS-83 | Maintenance job | dead main, nothing anywhere, two runs | one "No buffer", no "Inactivated" re-notice, then skipped_cooldown | `-t "DS-83 "` |
| DS-84 | Maintenance job | 5 dead clients | 3 rescue attempts this run | `-t "DS-84 "` |
| DS-85 | Maintenance job | dead client, nothing to swap, repeated runs | retry after 30 min, then 1 h; a new main resets | `-t "DS-85 "` |
| DS-86 | Concurrency / safety | sibling race: spare taken by a sibling setup DURING our probe | we skip it and take the next (D3) | `-t "DS-86 "` |
| DS-87 | Concurrency / safety | swap fails on a mobile that meanwhile became a sibling's main | no availableDate push, no disconnect (D3) | `-t "DS-87 "` |
| DS-88 | Concurrency / safety | client mobile changed between pick and commit | ConflictException, nothing written | `-t "DS-88 "` |
| DS-89 | Concurrency / safety | setPrimaryInUse throws inside the transaction | client write and tier-2 reassign rolled back | `-t "DS-89 "` |
| DS-90 | Concurrency / safety | deployKey restart fails after commit | "Restart failed" notice; data committed | `-t "DS-90 "` |
| DS-91 | Concurrency / safety | two concurrent dead handoffs | one selection, one cutover, second gets cooldown | `-t "DS-91 "` |
| DS-92 | Concurrency / safety | source of the swap paths | no `removeOtherAuths` call | `-t "DS-92 "` |
| DS-93 | Concurrency / safety | plans for two clients in flight | each cutover uses only its own plan | `-t "DS-93 "` |
| DS-94 | Concurrency / safety | `updateClientSession` for a setup owned by another client | ConflictException | `-t "DS-94 "` |
| DS-95 | Notification | dead main, nothing anywhere, repeated requests | one critical "No buffer" | `-t "DS-95 "` |
| DS-96 | Notification | mobile changes between two no_candidate answers | a second "No buffer" (new episode, D4) | `-t "DS-96 "` |
| DS-97 | Notification | one degraded swap | exactly one "Degraded swap" | `-t "DS-97 "` |
| DS-98 | Notification | degraded clients / empty pools / neither | summary lists them; nothing sent when both empty | `-t "DS-98 "` |
| DS-99 | Primitive | reassign a spare that is inUse, inactive or no longer the sibling's | ConflictException; free active spare moves | `-t "DS-99 "` |
| DS-100 | Primitive | `$set` / `$unset` of `degraded` on the strict schema | kept / removed | `-t "DS-100 "` |
| DS-101 | Primitive | tier-2 swap | client guard write, then reassignClientId, then setPrimaryInUse | `-t "DS-101 "` |
| DS-102 | Maintenance job | 5 limited clients each with a tier-1 spare | 3 refills this run | `-t "DS-102 "` |
| DS-103 | Hard stop | dead main, nothing anywhere, job every 15 min for 18 h | attempts at 0, 30, 90, 210, 450, 930 min (6), then `stopped` | `-t "DS-103 "` |
| DS-104 | Hard stop | stopped episode, pool unchanged, 7 days of runs | no 7th attempt, status `stopped` | `-t "DS-104 "` |
| DS-105 | Hard stop | episode reaches the stop, more runs | one critical "Rescue stopped" with the owner text | `-t "DS-105 "` |
| DS-106 | Hard stop | stopped; a new (warming) doc, then a usable buffer | re-armed at attempt 1; then swapped in, `swapRetry` removed | `-t "DS-106 "` |
| DS-107 | Hard stop | stopped; clients.mobile changed to another dead account | new episode, attempt 1 | `-t "DS-107 "` |
| DS-108 | Hard stop | stopped; CMS restart (fresh service) | still `stopped`, no attempt, no second notice | `-t "DS-108 "` |
| DS-109 | Hard stop | stopped episode | daily summary has a Stuck table row, severity error | `-t "DS-109 "` |
| DS-110 | Hard stop | fingerprint primitive | changes on availableDate/limitedUntil passing or reaching session_rotated; not on channel-count noise | `-t "DS-110 "` |
| DS-111 | Hard stop | client with `swapRetry` | masked endpoints never return it | `-t "DS-111 "` |
| DS-112 | Review 2 | LIVE main whose users doc + pool row a CMS backup-session error expired, no tg-aut report | no rescue, no swap, no restart, no retire, no probe | `-t "DS-112 "` |
| DS-113 | Review 2 | SESSION_EXPIRED as a pool message, as `deadMain.reason`, and as a `/setupClient` reason | never rescue evidence; no `deadMain` written | `-t "DS-113 "` |
| DS-114 | Review 2 | dead / limited / internal-rescue `/setupClient` reasons | dead writes `deadMain {mobile, reason, at}`; others do not; masked views never return it or `swapLease` | `-t "DS-114 "` |
| DS-115 | Review 2 | `deadMain` for an old mobile; then for the current one; then `update()` changes the mobile | ignored; rescued and cleared by the swap; cleared by `update()` | `-t "DS-115 "` |
| DS-116 | Review 2 | dead report at t0 (fake clock incl. `new Date()`), job at 0, 34, 36 min | waiting_handoff, waiting_handoff, swapped | `-t "DS-116 "` |
| DS-117 | Review 2 | cms job + ums HTTP (two `ClientService`s, one Mongo) on one dead client | <= 1 concurrent probe per buffer, <= 1 probe of T1, exactly one swap, lease released | `-t "DS-117 "` |
| DS-118 | Review 2 | client lease held by another process, then expired | cooldown, 0 probes; then taken over, swapped, lease and probe leases gone | `-t "DS-118 "` |
| DS-119 | Review 2 | first candidate leased by another process | never probed or connected; next one taken; their lease untouched, ours released | `-t "DS-119 "` |
| DS-120 | Review 2 | sibling spare (tier 2) leased by another process | skipped, not probed; no_candidate + moreCandidatesPending | `-t "DS-120 "` |
| DS-121 | Review 2 | error after our own cutover committed | new main keeps its availableDate; one unregister (updateClientSession's own) | `-t "DS-121 "` |
| DS-122 | Review 2 | upgrade, T3 candidate never connects, job every 30 min then every 9 h | 4 probes in 5 h (0, 30, 90, 210 min), 6 total, then stopped; one "Upgrade stopped" | `-t "DS-122 "` |
| DS-123 | Review 2 | 5 degraded clients with failing candidates + 1 meeting tier 1 | 3 upgrade setups this run; the clear still happens | `-t "DS-123 "` |
| DS-124 | Review 2 | rescue; first candidate has no stored distinct backup | skipped, never probed; `getOrEnsureDistinctUsersBackupSession` never called; next one taken | `-t "DS-124 "` |
| DS-125 | Review 2 | refill on a 60-day-old harsh verdict, then a 3-day-old one | no swap, no restart; then swapped | `-t "DS-125 "` |
| DS-126 | Review 2 | a Mongo error in one client's rescue and one client's refill | `failed` rows; the next clients are swapped | `-t "DS-126 "` |
| DS-127 | Review 2 | `getClient` throws in the cutover | failed; client unchanged; candidate pushed 3 days, not inUse; leases and setup registry cleared | `-t "DS-127 "` |
| DS-128 | Review 2 | rescue of a main with two users docs, one expired | retired once (one `expireAccount`, one "Inactivated") | `-t "DS-128 "` |
| DS-129 | Review 2 | 40 clients (14 dead, 13 degraded, 13 limited), every probe fails | 9 setups, 54 probes, 0 restarts, 3 no_candidate per pass | `-t "DS-129 "` |
| DS-130 | Review 3 | P1: rescue cutover MAIN -> T1, then a late dead report without `reportedMobile` on another process | `cooldown` (rest of 15 min); mobile stays T1, no `deadMain`, `swappedAt` set, T1 not retired, T2 untouched | `-t "DS-130 "` |
| DS-131 | Review 3 | after the cutover: `reportedMobile` = MAIN at 0 and 20 min; then `reportedMobile` = T1 at 1 min | `stale_report` twice (existingMobile T1), nothing written; the report for the current main is not held back: swapped T1 -> T2 | `-t "DS-131 "` |
| DS-132 | Review 3 | P2: late report while the cutover still holds `swapLease`, rescue 36 min later | old bundle `cooldown`, new bundle `stale_report`, no `deadMain` on T1, rescue does nothing, T1 kept | `-t "DS-132 "` |
| DS-133 | Review 3 | late prose SpamBot trigger at 5 and 14:59 min after a swap; with `reportedMobile` = old main | `cooldown` (old bundle), `stale_report` (new); mobile T1, T2 not taken | `-t "DS-133 "` |
| DS-134 | Review 3 | old bundle on the NEW main, which really is dead: reports at the handoff schedule 0, 2, 6, 14, 30 min | 4 x `cooldown` with no `deadMain`, the 30-min one swaps T1 -> T2 | `-t "DS-134 "` |
| DS-135 | Review 3 | P3: `AUTO_CLIENT_SETUP=false`, dead main, 40 runs 30 min apart; then switched on | every row `disabled` with no attempts, no `swapRetry`, 0 "Rescue stopped"; switched on: attempt 1 | `-t "DS-135 "` |
| DS-136 | Review 3 | P4: `update()` with a name, the same session, then a new session | `deadMain` kept, kept, cleared; rescue does nothing, nothing expired | `-t "DS-136 "` |
| DS-137 | Review 3 | P5: pinned `?mobile=` dead call | no `deadMain` | `-t "DS-137 "` |
| DS-138 | Review 3 | a setup stalls 18 min (lease TTL 10) in its probe | leases renewed past now; another process gets `cooldown`; swapped, both leases gone after | `-t "DS-138 "` |
| DS-139 | Review 3 | `reportedMobile=n/a` | counts as absent: normal swap, no 400 | `-t "DS-139 "` |
| DS-140 | Review 4 | `update()` with a new session, then late dead reports (with `reportedMobile` = the main, and without) at 2 min; again at 31 min | `swappedAt` set, `deadMain` cleared; both `cooldown`, no swap; at 31 min swapped MAIN -> T1, `sessionChangedAt` cleared | `-t "DS-140 "` |
| DS-141 | Review 4 | `reportedMobile` as string, garbage, empty, repeated (array), object, number through the real `ValidationPipe` (main.ts options) | never a 400; array -> first element; object / number stringified | `-t "DS-141 "` |
| DS-J01 | Scheduler | two CMS processes, same slot; a UMS-scheduler process | swap maintenance and the daily summary run once per slot, CMS only; not registered under `UMS_SCHEDULER` | scheduled-jobs.service.spec.ts `-t "DS-J01"` |
| DS-J02 | Scheduler | previous slot's claim still live; then completed | slot skipped; then runs with a 60-min claim | scheduled-jobs.service.spec.ts `-t "DS-J02"` |

tg-aut rows (`tests/unit/apps/tg-aut/setup-client-degraded.test.mjs`, one table, fake clock):

| ID | Scenario | Expected |
|---|---|---|
| TA-01 | no_candidate on every 10-min trigger for 7 days | CMS asked 5 times, gaps 2, 4, 8, 16 h, then stopped |
| TA-02 | no_candidate + `moreCandidatesPending` | gaps 15 (next trigger: 20), 30, 60, 120 min, 5 requests |
| TA-03 | no_candidate + `degraded: true` | one request, then stopped (Infinity) with the degraded message |
| TA-04 | after 5 no_candidates | local cooldown says a restart re-arms requests |
| TA-05 | swap on the 3rd answer | ladder reset: 3 + 5 requests |
| TA-06 | swap | next trigger suppressed for 5 min |
| TA-07 | ladder stopped, dead handoff (`bypassBackoff`) | still reaches CMS |
| TA-08 | dead handoff answers no_candidate / failed / swapped | shared ladder unchanged |
| TA-09 | failed or throw | 15 (20), 30, 60, 120 min, stop after 5 |
| TA-10 | failures then no_candidate | failure count reset, no_candidate ladder starts |
| TA-11 | CMS cooldown 3 min | waits exactly 3 min, not a failure |
| TA-12 | two concurrent triggers | one CMS request |
| TA-13 | swapped + `degradedTier` 2, 3, 4 | accepted, returned for the handoff log |
| TA-14 | swapped without `degradedTier` (probed-free pick, T2 borrow) | `degradedTier` undefined |
| TA-15 | no_candidate + `degraded` true / false | accepted |
| TA-16 | `degradedTier` 1, 5, "3", a tier on no_candidate, `degraded: "yes"` | rejected (invalid contract) |
| TA-17 | swap for another clientId | rejected |
| TA-18 | any request, `process.env.mobile` set / already in the URL / unset | `reportedMobile=<mobile>` appended once (with `?` or `&`); left alone when present or unknown |
| TA-19 | CMS answers `stale_report` | accepted; trigger swaps stop until a restart |

tg-aut journey (`tests/journeys/tg-aut/ds-frozen-main-degraded-swap.test.mjs`, real inbound ->
replier -> handoff -> fetchWithTimeout path; Telegram, CMS answer and `process.kill` faked):

| ID | Scenario | Expected |
|---|---|---|
| DJ-01 | main frozen mid-chat (every send `FROZEN_METHOD_INVALID`), CMS answers a tier-3 swap | one `setupClient?...reason=FROZEN_METHOD_INVALID&reportedMobile=<own mobile>` call, one "Auth failed" in CLIENT_UPDATES, no "Reply failed", log has `newMobile` + `degradedTier: 3`, one SIGTERM only after the 60 s wait |
| DJ-02 | main `USER_DEACTIVATED_BAN`, CMS normal swap | same restart path, no `degradedTier` logged |
| DJ-03 | main frozen, CMS `no_candidate` + `degraded` | no SIGTERM; handoff retries with growing gaps (>= 1, 2, 4, 8 min), gives up after 5; a later SpamBot trigger still reaches CMS |
| DJ-04 | main frozen, CMS answers `stale_report` (the cms job already replaced this mobile) | one call carrying `reportedMobile`, no retries, not counted as a failure, no SIGTERM from tg-aut; a later SpamBot trigger is answered once and then suppressed |

The handoff's own 1/2/4/8/16 min ladder is also in `tests/unit/apps/tg-aut/core-utils.test.mjs`
("owner rule: a failing setupClient handoff ...").

### How to add a scenario

1. Pick the next free ID (`DS-142`, `TA-20`, `DJ-05`). IDs are never reused or renumbered; the
   DS and TA suites fail if IDs are duplicated or out of order.
2. CMS: add one object to `ROWS` in `degraded-swap.regression.spec.ts`:
   `{ id, name, env?, setup(fx), run(fx), expect(out, fx) }`. Build the world with the fixture
   helpers (`fx.world`, `fx.addBuffer`, `fx.addClient`, `limited()`, `harsh()`, `deadReq()`,
   `probeAs()`); add a helper to `degraded-swap.fixtures.ts` instead of copying setup code. Owner
   numbers (bounds, gaps) go in the row as literals, not the exported constants, so a changed
   constant fails the row.
3. tg-aut: add one object to `ROWS` in `setup-client-degraded.test.mjs` (`{ id, name, run(w) }`);
   a journey row is one `test("DJ-nn ...")` using `frozenWorld()`.
4. Add the row to the matching table above with the same ID.
5. Show it fails without the code it guards (revert or mutate that line, run `-t "<ID> "`), then
   passes. Both suites run under plain `npx jest` / `npm test`; no flags.

## Open questions / follow-ups

- Tier 2 assumes `dbcoll` identifies the persona. A borrowed account keeps the sibling's
  assigned name, bio and photos; if sibling persona pools differ, tg-aut's startup persona
  verifier has to reconcile them. This is unverified.
- Candidates a probe found dead are skipped, not retired. They are probed again on every
  request and can use up the 3-probe budget.
- The "No buffer" episode map (setupClient's own notice) is in memory: a CMS restart sends one
  more "No buffer" per client that still has none. The rescue / refill episode itself is in Mongo.
- CMS-side backup-session failures still expire the users doc and deactivate the pool row of a
  live main (connection-manager `expireAccount`); rescue now ignores them, but that pool row stays
  inactive and the main is then excluded from return-to-pool. Not changed here.
- Leases, `swappedAt` and the run claim use the VM clock, not Mongo `$$NOW`. Clock skew between
  VMs above a few minutes shortens or lengthens the 10-min lease TTL and the 15-min grace window.
  Unverified: VM clock skew was not measured. Renewal (every 2 min) keeps a live run's leases
  however long it lasts.
- Leases cover `setupClient` runs only (Safety, "Scope"). Warmup, health checks, joins and
  `updateClient` keep their in-process guards; a cross-process collision with those paths is
  pre-existing and not addressed here.
- Old tg-aut bundles: if the `deployKey` restart fails and the replaced process is still alive
  15 min after the cutover, its next report (dead or SpamBot) is treated as current and can swap
  the new main. New bundles are immune (`stale_report`). An operator call with a `reason` and no
  `?mobile=` inside the window is answered `cooldown`; pin `?mobile=` or wait.
- A stopped rescue is not re-armed by a users-doc change on a pool row (for example 2FA added);
  any bufferClients write that flips a fingerprinted field is needed, or a manual
  `$unset clients.swapRetry`.
