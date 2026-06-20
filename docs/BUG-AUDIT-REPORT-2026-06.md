# Bug Audit & Fix Report — CommonTgService (June 2026)

**Method:** Adversarial auditing + strict reproduce-first TDD. Every bug below got a
failing test asserting the real production scenario, then a minimal source fix, then
green. Externals-only mocking; real MongoDB (mongodb-memory-server) for data paths.

**Outcome:** 55 reproducible production bugs found and fixed across 17 audit rounds.
Final state — **3,730 tests pass** (119 suites); `tsc`, `lint`, `build` all clean.
Coverage rose from 39.8% → 96.7% lines and 21.5% → 92.9% branches.
The hunt converged twice on **3 consecutive clean audit rounds**: first across
workflows/edge-cases, cross-module contracts, and idempotency/retries (rounds 10-12);
then (after a re-invoked goal targeting fresh surface) across re-audit-of-changes,
time/scale boundaries, and error-path/dependency-failure injection (rounds 15-17).

Commits: `4d6448b` (coverage + scenario-audit fixes), `09eabde` (bug-hunt rounds 4-9),
`f80ac1b` (this report), and a final commit for rounds 13-14, on branch
`tests/coverage-and-bugfixes`.

### Phase 3 — config/lifecycle/upload bugs (rounds 13-14)
- **🔴 Graceful shutdown was dead code** (`processListeners.ts`/`main.ts`): SIGTERM handler
  `process.exit(0)`'d synchronously and `enableShutdownHooks` was never called, so
  `InitModule.onModuleDestroy` (Mongo close, health-check interval clear, "Service Stopped"
  alert) never ran on the frequent PM2/buffer-swap restarts → in-flight writes cut, leaked
  interval, no shutdown visibility. Fixed: signal handler awaits `app.close()` (single
  deterministic path, 20s cap) before exit.
- **🔴 Concurrent profile-pic cross-contamination** (`cloudinary.ts`/`setProfilePic`): shared
  `temp.zip` + extract to cwd over fixed dp1/dp2/dp3.jpg via a singleton → concurrent calls
  (different personas) could make an account wear another account's photos (fingerprinting
  risk) or hit an unlink race. Fixed: unique per-call extract dir, returned + read from it.
- **🟠 Config value coercion** (`init.service.ts`): `String(value)` turned object/array config
  into `"[object Object]"` and leaked Mongo `createdAt`/`updatedAt` into `process.env`. Fixed:
  JSON-serialize non-primitives + skip storage-metadata keys.
- **🟠 `/tmp` leak (regression from the cloudinary fix)**: the unique extract dir was never
  removed → unbounded `/tmp` growth on every warmup/rotation profile-pic op. Fixed: `rmSync`
  in `finally`. (Caught by re-auditing my own change — round 14.)
- **🟠 Dead timeout-reap** (`client-operations.ts`): the GramJS `_errorHandler` closure captured
  a construction-time `ctx` whose `.client` was still `null`, so the fast timeout-driven reap of
  a dead/timed-out client never fired (only the periodic-cleanup backstop did). Fixed: closure
  builds ctx from the live created client.

Plus a cleanup: removed the redundant `enableShutdownHooks()` so shutdown runs `onModuleDestroy`
once (not twice racing).

### Surfaced, NOT auto-fixed (need a decision; documented in project memory)
- **stats/stats2** `update`/`deleteOne` query `{chatId, profile}` while the unique key is
  `{chatId, profile, client}` — can mutate/delete the wrong client's row. Fix is an API contract
  change (add `client` to the route) with cross-repo (tg-aut) impact.
- **proxy-ip conflicting unique indexes** — needs a DB migration (drop `ipAddress_1`).
- **event-manager at-least-once retry** — duplicate effect lives in tg-aut (different repo).
- **handleSetupClient** catch lacks a `!cutoverCommitted` guard (latent; no trigger today).
- Low-sev: webshare rollback prior-status, `SessionStatus.ACTIVE` never written,
  timestamp.service `push(undefined)`, `User.mobile unique` vs one-doc-per-session.

Severity legend: 🔴 account-loss/security/data-loss · 🟠 incorrect-results/stuck/crash · 🟡 lower.

---

## Phase 1 — Coverage & scenario-audit fixes (commit 4d6448b)

### 1. 🔴 dynamic-data: silent data loss on Mixed fields
`dynamic-data.service.ts` — in-place lodash `set`/`unset`/array mutations on a
`Schema.Types.Mixed` field followed by `doc.save()` persisted **nothing** (Mongoose
doesn't auto-detect Mixed mutations). **Fix:** `doc.markModified('data')` before each
save (3 sites: update, handleArrayOperation, remove).

### 2. 🟠 fetchWithTimeout: retried non-retryable errors
`fetchWithTimeout.ts` — a non-retryable error (e.g. HTTP 404) with attempts remaining
fell through and was retried anyway (4 requests instead of 1), ignoring `shouldRetry()`.
**Fix:** unconditional `break` after the retry decision.

### 3. 🟠 fetchWithTimeout: crash on non-string error message
`fetchWithTimeout.ts` — `message.includes('timeout')` / `message.slice(0,150)` assumed
`parsedError.message` is a string; a structured (object) error from an upstream API threw
`TypeError`, masking the original error. **Fix:** normalize `message` to a string at the source.

### 4. 🟠 contact-operations: blocked-export guard checked wrong field
`contact-operations.ts exportContacts` — checked `'peerBlocked' in blockedContacts`, but
the GramJS field is `blocked`; CSV export with `includeBlocked` never marked anyone blocked.
**Fix:** `'blocked' in blockedContacts`.

### 5. 🟠 chat-operations: dead low-activity skip
`chat-operations.ts` — `callCountsByChat[chatId]?.totalCalls < 1` evaluated `undefined < 1`
→ `false`, so the optimization never fired. **Fix:** `(... ?? 0) < 1`.

### 6. 🟠 media-operations: RangeError crash on invalid Date
`media-operations.ts` — 6 sites called `startDate?.toISOString()` unconditionally; an
invalid Date threw `RangeError: Invalid time value`, crashing the media-list endpoint.
**Fix:** `safeIsoString()` helper at all 6 sites.

### 7. 🔴 client.service archiveOldClient: stranded buffer on transient error
`client.service.ts` — on a *transient* error after cutover, the old primary buffer client
was left `inUse=true`/`status=active`, permanently excluding it from all future selection.
**Fix:** release the reservation (`inUse=false`) and push `availableDate` forward to return
it to the pool for retry.

### 8. 🔴 Batch ops ignored permanent errors (session-survival)
`contact-operations.ts` (addContact/importContacts/manageBlockList) and
`message-operations.ts` (forwardMessages chunk loop) only special-cased FLOOD_WAIT; a
`SESSION_REVOKED`/`USER_DEACTIVATED_BAN` mid-batch was logged and the loop kept invoking on
a dead account. **Fix:** consult `isPermanentError` → abort batch + surface (re-throw/break).

### 9. 🟠 auth.guard: spoofable IP-header trust
`auth.guard.ts` — the IP allowlist trusted client-supplied `cf-connecting-ip`/`x-real-ip`/
`x-forwarded-for` unconditionally (auth bypass if the service is ever reachable off the
Cloudflare/nginx hop). **Fix:** documented trust boundary + `TRUST_PROXY_HEADERS=false`
opt-out (default true preserves prod).

### 10. 🟠 auth-operations waitForOtp: submitted a stale OTP
`auth-operations.ts` — returned a >60s-old login code on the final attempt; submitting an
expired code risks the new-session login. **Fix:** never return a stale code; throw instead.

### 11. 🔴 Concurrent cross-pool enrollment race → 2 sessions / 1 account
`createBufferClientFromUser` + `createPromoteClientFromUser` fired concurrently for the same
mobile both passed the non-atomic `isMobileEnrolledAnywhere` check and BOTH wrote → two live
sessions on one account → Telegram revokes both (permanent loss). **Fix:** shared per-mobile
mutex `shared/enrollment-lock.ts` (`withEnrollmentLock`) wrapping the dedup-recheck+write in
both `create()` and `createXFromUser` paths.

### Dead-code / defensive cleanups (same phase)
- Removed orphaned `isSimilarEnough` (`checkMe.utils.ts`); documented `istanbul ignore` on
  proven-unreachable defensive branches in `parseError.ts`, `chat-operations.ts`,
  `channel-operations.ts`, `obfuscateText.ts`, `persona-assignment.ts`,
  `webshare-proxy.service.ts`, `Exception-filter.ts`, `fetchWithTimeout.ts`.
- Reverted an agent's accidental "restoration" of the intentionally-empty `MemoryCleanerService`.

---

## Phase 2 — Adversarial bug-hunt (commit 09eabde)

### 12. 🟠 channel-operations getGroupBannedUsers: PeerUser.chatId crash
Read `(peer as PeerChat).chatId` but banned participants carry `Api.PeerUser` (`.userId`)
→ `undefined.toString()` crashed the listing. **Fix:** read userId/channelId/chatId whichever
is present. (An existing test masked it by using `PeerChat`.)

### 13. 🟠 message-operations forwardSecretMsgs: variable shadowing → silent media loss
Outer `const messages=[]` shadowed by an inner block-scoped `messages`; `while(messages.length>0)`
read the always-empty outer array → only the first 100 messages forwarded, rest silently lost.
**Fix:** track `pageSize`.

### 14. 🟠 channel-operations getGrpMembers: pagination infinite loop / FLOOD
`nextOffset = offset + result.length` (resolved-user count) instead of participants consumed;
a page of all admins/banned left the offset unchanged with `hasMore` true → re-fetched the same
offset forever. **Fix:** advance by `users.length` + `consumedCount>0` termination guard.

### 15. 🟠 withTimeout: default shouldRetry hard-capped at 3
`defaultShouldRetry` returned false at `attempt>=3` regardless of caller `maxRetries` (e.g. 6);
recoverable errors during warmup/2FA gave up early. **Fix:** removed the cap (loop bounds by maxRetries).

### 16. 🟠 contact-operations getContactStatistics: online/offline inverted
`'wasOnline' in c.status` matches `UserStatusOffline` (which has `wasOnline`), NOT
`UserStatusOnline` → `online` counted offline users; genuinely-online excluded.
**Fix:** `online = instanceof UserStatusOnline`; lastWeekActive = recently-offline.

### 17. 🔴 auth-operations set2fa onEmailCodeError: submitted literal 'error' as OTP
Returned `Promise.resolve('error')`; GramJS submits the return value as the verification code
→ burned a 2FA attempt with garbage (FLOOD/too-many-attempts risk). **Fix:** `Promise.reject(e)`.

### 18. 🟠 relationship-scorer: future date → recency bonus > 100
A future `lastMessageDate` (clock skew) → negative daysSince → `100*(1-neg/90) > 100`,
inflating the score. **Fix:** clamp daysSince to `Math.max(0, …)` + finite guard.

### 19. 🟠 IMap.getCode: picked by seqno, not newest receivedAt
Selected the candidate by position in the seqno-ordered list, not by `receivedAt`; a
re-delivered email with a lower seqno but newer date lost → returned a STALE OTP and deleted
the wrong message. **Fix:** sort by `receivedAt` desc, seqno tie-break.

### 20. 🟠 ip-management _pickAndMark: global round-robin counter across pools
A single global `ROUND_ROBIN_KEY` counter `% ips.length` against differently-sized pools
(full vs client/country/protocol-filtered) → skips/repeats within a pool. **Fix:** per-pool
counter key via `poolSignature(ips)`.

### 21. 🟠 media-operations: multi-type hasMore always-true → stuck pagination
`getMediaMetadata`/`getFilteredMedia` multi-type `hasMore` used the post-slice length
(`=== effectiveLimit`), always true once results ≥ limit → dashboard paginated forever.
**Fix:** compute `hasMore` from the pre-slice raw count.

### 22. 🟠 transaction.findAll: `if(amount)` dropped amount:0 filter
Zero-value/refund lookups silently ignored the amount constraint. **Fix:** `!== undefined && !== null`.

### 23. 🟠 event-manager: failed events rescheduled forever
A dead `profile.repl` rescheduled `+30s` every tick with no max-attempts → permanent
background load + notification spam. **Fix:** added `Event.attempts` + give-up (delete) after 5.

### 24. 🟠 session getOldestSessionOrCreate: rate-limit double-counted
Called `checkRateLimit` (increments) then the fallback→`createSession` incremented again;
1 request billed 2 of 20/hr slots → tripped the limit at ~10, wrongly blocking healthy accounts.
**Fix:** non-incrementing `peekRateLimit` for the orchestration check.

### 25. 🔴 Telegram.forwardMediaToBot: client leak on error path
`unregisterClient` was only on the success path; any throw (flood-wait/banned/network) leaked
a live TG connection. **Fix:** moved to `finally`.

### 26. 🟠 base-client removeFromLeaveMap: re-entrancy guard cleared mid-iteration
Emptying the leave map called `clearLeaveChannelInterval` which set
`isLeaveChannelProcessing=false` mid-loop, opening a concurrent double-leave window.
**Fix:** clear only the timer handle, not the processing flag.

### 27. 🟠 Phantom buffer supply: SESSION_ROTATED with <200 channels counted as ready
Availability planning counted any SESSION_ROTATED account as ready on phase alone, but the
buffer-swap query requires `channels > 200`. Warmup can graduate a stalled account at ~100
channels → counted as supply yet never swappable → planning stopped replenishing, swaps failed.
**Fix:** count ready only if `channels >= MIN_CHANNELS_FOR_MATURING`.

### 28. 🟠 Swap query off-by-one (gt 200 vs graduation gte 200)
`channels: { $gt: 200 }` rejected accounts at exactly the graduation threshold (warmup
graduates at `>= 200`). **Fix:** `$gte: MIN_CHANNELS_FOR_MATURING`.

### 29–31. 🟠 Query-boolean inversion class (3 DTOs)
The global ValidationPipe uses `enableImplicitConversion`, which coerces a `boolean`-typed
query prop via `Boolean(value)` — and `Boolean("false") === true` — OVERRIDING the
`@Transform`. So `?canSendMsgs=false` / `?twoFA=false` / `?paidReply=false` returned the
logical opposite set. Fixed across **SearchChannelDto** (canSendMsgs), **SearchUserDto**
(twoFA/expired/demoGiven/starred), **SearchUserDataDto** (paidReply/demoGiven/secondShow/
picsSent) by widening the design-type to `boolean | string` (emitted as Object → no implicit
Boolean()) so the `@Transform` produces the real boolean. (SetupClientQueryDto with a default
initializer and SearchClientDto with no booleans verified unaffected.)

### 32. 🔴 active-channels.search: NoSQL operator injection
`search(@Query() query: any)` passed the raw object to `Model.find()` → `?title[$ne]=x` /
`{$where}` injected operators and could dump the collection. **Fix:** reject `$`-prefixed keys
and object/array values (scalar-equality only).

### 33. 🟠 webshare replaceProxy: proxy stranded inactive on failed POST
`markInactive` ran, then the Webshare POST failed with no rollback → proxy stuck inactive
forever (silently leaves rotation, pool shrinks). **Fix:** added `IpManagementService.markActive`
+ rollback in the catch.

### 34. 🟠 users topRelationships: NaN poisoned the leaderboard
`parseFloat(minScore)`/`parseInt(page)` of non-numeric query strings produced NaN that flowed
into the Mongo query (`{bestScore:{$gt:NaN}}` matches nothing) → silently EMPTY leaderboard,
no error. **Fix:** isNaN guards matching the sibling /top-interacted endpoint.

### 35. 🔴 connection-manager: cleanup/forceCleanup destroyed in-use clients (session-survival)
`lastUsed` is only stamped at acquisition, never refreshed; a warmup op held with
`autoDisconnect:false` for >10 min (organic activity) looked stale and got torn down
mid-operation (breaks 2FA/removeOtherAuths; risks FALSE permanent account expiry).
`forceCleanup` also evicted oldest-by-`lastUsed` (= the busiest). **Fix:** `isStale` applies
only to `autoDisconnect:true`; `forceCleanup` evicts disposable tiers
(errored → auto-disconnect → disconnected) before in-use keep-alive clients.

### 36. 🟠 active-channels paginated: banned + search dropped the banned filter
When `filter:'banned'` (sets `$or`) was combined with a `search` term, the search clause
OVERWROTE `query.$or`, silently dropping the banned constraint. **Fix:** combine both `$or`
groups under `$and`.

### 37. 🟡 active-channels paginated: unescaped search regex
Raw search term used as `$regex` → ReDoS / wildcard over-match (`a.b.c` matched `axbxc`).
**Fix:** escape regex metacharacters.

### 38. 🟠 connection-manager: dead-socket keep-alive never reaped (regression from #35)
Re-auditing the #35 fix found that an `autoDisconnect:false` client whose socket DIED
(state stays `'connected'`, `connected()===false`) was now never reaped → leak + forceCleanup
would evict in-use clients before it. **Fix:** reap when `isIdle && connected()===false`
regardless of autoDisconnect (the isIdle gate still protects in-flight ops).

> (Bug count note: the 50 total includes the granular DTO entries 29/30/31 counted separately
> and the istanbul-marked dead-code defects from Phase 1.)

---

## Surfaced but NOT fixed (need a human/ops/design decision)

- **proxy-ip conflicting unique indexes** — `@Prop({unique:true})` on `ipAddress` conflicts with
  the compound `{ipAddress,port}` unique index; blocks multi-port-per-host proxies (standard
  Webshare layout), sync silently drops them. **Requires a DB migration** (drop `ipAddress_1`),
  not a code-only change.
- **event-manager at-least-once retry** — retries `/requestCall`+`/sendMessage` on timeout with
  `key=Date.now()` regenerated per attempt (defeats remote dedup). The user-visible duplicate
  materializes in **tg-aut** (a different service, not this repo) — unconfirmable here.
- **webshare replaceProxy rollback** hardcodes `markActive` instead of restoring the prior
  status (low severity; self-corrects next sync).
- **SessionStatus.ACTIVE never written** → `getSessionStats.activeSessions` always 0
  (analytics-only, cosmetic).
- **User schema `mobile: unique:true`** vs the one-doc-per-session design (see `expireAccount`'s
  `updateMany`) — schema/code tension worth reconciling.

---

## Recurring lessons

- **Tests can mask bugs.** Several defects survived because existing tests used inputs that
  don't match real provider shapes (`PeerChat` vs `PeerUser`), passed overrides that bypass the
  buggy default (shouldRetry), or asserted the buggy value as expected. Build inputs that match
  REAL provider responses and the live framework config.
- **`enableImplicitConversion` overrides `@Transform`** for bare `: boolean` query props — widen
  the type or `?x=false` silently inverts.
- **Mixed Mongoose fields** need `markModified`.
- **Guard `?.toISOString()`/`.includes`/`.slice`** behind validity/type checks.
- **Fix at the consumption layer** when graduation/eligibility thresholds disagree, rather than
  raising a graduation gate (which can strand accounts).
- **Re-audit your own fixes** — bug #38 was a regression introduced by the #35 fix, caught only
  by re-auditing changed code.
