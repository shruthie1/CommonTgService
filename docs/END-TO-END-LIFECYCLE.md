# End-to-End Account Lifecycle

Authoritative summary of how Telegram accounts move through CommonTgService, `tg-aut-local`, and `promote-clients-local` as the code works today.

This document is intentionally concise and operational. It is meant to replace stale assumptions from older lifecycle notes.

## Repos Involved

- `CommonTgService-local`
  Manages users, buffer clients, promote clients, warmup, channel growth, and client swaps.
- `tg-aut-local`
  Uses the main `clients` account for DM/conversion flows and asks CommonTgService to swap in a warmed buffer account when the current one degrades.
- `promote-clients-local`
  Uses `promoteClients` records directly for outbound promotion activity and temporarily cools down or retires mobiles by updating `availableDate` / `status`.

## Main Collections

- `users`
  Raw registered Telegram accounts and backup sessions.
- `bufferClients`
  Accounts warming up or waiting to become/return to main conversational accounts.
- `promoteClients`
  Accounts warming up or actively used by the promotion engine.
- `clients`
  The currently assigned main account per `clientId` used by `tg-aut-local`.

## Conversation-State Contract (`userData`)

`userData` is owned by `tg-aut-local`; it stores one conversation-state document per
`(chatId, profile)`. `promote-clients-local` may read it to recognize a downstream
conversion, but must never create or decorate a user record.

The canonical runtime fields are `totalCount`, `lastMsgTimeStamp`, `picCount`,
`picsSent`, `videos`, `prfCount`, `paidCount`, `limitTime`, `canReply`, `payAmount`,
`highestPayAmount`, `paidReply`, `demoGiven`, `secondShow`, `fullShow`, `cheatCount`,
`callTime`, `username`, and `accessHash`. `canReply` is always numeric and defaults to
`1`; `picsSent` is always a numeric counter and defaults to `0`.

CommonTgService mirrors this schema for its inspection/admin API. Its update endpoints
never upsert: a missing conversation is a `404`, rather than a partially initialized
document. `picsSent` is the only accepted/stored picture-counter key. Attribution belongs
to dedicated promotion-claim/channel-intelligence records, not to `userData`.

## Lifecycle Overview

1. Account is registered into `users`.
2. Account is classified into `bufferClients` or `promoteClients`.
3. CommonTgService warms the account through phase-based warmup.
4. Promote accounts are consumed directly by `promote-clients-local`.
5. Buffer accounts are candidates for `setupClient()` swaps into `clients` for `tg-aut-local`.
6. Replaced accounts return to `bufferClients` with a future `availableDate`, or are marked inactive on hard failures.

## Stage 1: Registration

Registration creates a `users` document with the Telegram session string and profile metadata.

At this point the account is not yet in `bufferClients` or `promoteClients`.

## Stage 2: Classification

### Buffer classification

`setAsBufferClient()` and `createBufferClientFromUser()`:

- copy `users.session` into `bufferClients.session`
- set `status='active'`
- set `availableDate` immediately
- set `warmupPhase='enrolled'`
- assign `warmupJitter`
- assign `enrolledAt`

No new session is created at enrollment.

### Promote classification

`setAsPromoteClient()` and `createPromoteClientFromUser()` do the equivalent for `promoteClients`.

No new session is created at enrollment.

## Stage 3: Warmup in CommonTgService

Warmup is driven by:

- `checkBufferClients()`
- `checkPromoteClients()`
- `processClient()`
- `getWarmupPhaseAction()`

### Warmup phases

- `enrolled`
- `settling`
- `identity`
- `growing`
- `maturing`
- `ready`
- `session_rotated`

### Actual sequence

1. `enrolled`
   Wait until `1 + jitter` days.
2. `settling`
   `set_privacy` -> wait 2+ days -> `set_2fa` -> wait 2+ days -> `remove_other_auths`
3. `identity`
   `delete_photos` -> wait 2+ days -> `update_name_bio` -> wait 2+ days -> `update_username`
4. `growing`
   Join channels until `channels >= 200`
5. `maturing`
   Upload profile photo
6. `ready`
   Only after the day `20 + jitter` floor
7. `session_rotated`
   Explicit post-warmup backup-session creation step

### Important scheduler behavior

- `processClient()` only performs one warmup action per call.
- Warmup actions are gated by a 2-hour cooldown via `lastUpdateAttempt`.
- Health checks run independently from warmup.
- Join scheduling selects active accounts below the role's channel target. Terminal `ready` and `session_rotated` accounts are excluded once they meet the role's operational floor; underfilled terminal accounts stay in the join queue until their real count reaches it. Buffer terminal-recovery accounts are ordered ahead of normal warming candidates, highest verified count first, without changing Telegram pacing or per-account limits.
- `warmupPhase` and `enrolledAt` are mandatory lifecycle fields. Missing metadata is rejected by runtime jobs and corrected only by an explicit database migration.
- Normal maintenance explicitly skips `ready` and `session_rotated` accounts. READY -> SESSION_ROTATED is a separate, strict session-rotation path. It never infers phase, backfills lifecycle timestamps, or treats `lastUsed` as evidence of a completed rotation. It rechecks active, non-primary ownership, the role channel floor, every prerequisite timestamp, and the absence of `sessionRotatedAt` immediately before creating a backup. There is no bulk session-refresh API. READY rotation may run alongside join/leave work because terminal-phase accounts are excluded from normal warmup work; checks and other warmup maintenance remain serialized.
- CMS checks buffer READY rotation at minute `45`, and UMS checks promote READY rotation at minute `55`. Each owner may complete at most one candidate per hourly run; the per-pool maintenance lock makes busy/no-candidate runs defer safely without overlapping joins or checks.
- A maintenance lock that exceeds 30 minutes is logged as overdue but is not force-released; releasing it while the Telegram promise is alive would allow overlapping account work. Recover an actually stuck run by investigating/restarting the owning process.

## Stage 4: Promote Usage in `tg-platform/apps/promote-clients`

The deployed promotion runtime consumes `promoteClients` directly from Mongo.

### Current availability query

`dbservice.getAvailablePromoteMobile()` selects promote accounts with:

- `clientId = process.env.clientId`
- `availableDate <= today + 3 days`
- `channels >= 230`
- `createdAt < now - 7 days`
- `status = 'active'`
- `warmupPhase = 'session_rotated'`

The same predicate is rechecked immediately before a selected mobile is connected.
There is no phase-less or timestamp-based fallback.

### Runtime cooldown / retirement flow

During outbound promotion:

- `Promotions.setDaysLeft(daysLeft)` pushes `availableDate` into the future by `daysLeft`
- `setupNewMobile()` can:
  - push `availableDate` forward
  - mark `status='inactive'`
  - remove the mobile from the in-process manager

So the promotion repo treats `availableDate` as the main operational cooldown lever for reuse.

## Stage 5: Conversation Usage in `tg-aut-local`

`tg-aut-local` does not use `bufferClients` directly as its live account.

It uses the assigned record in the `clients` collection. When that main account degrades, it asks CommonTgService to swap in a warmed buffer account.

### Swap triggers

Current examples:

- `tg-aut-local/src/utils.ts -> startNewUserProcess()`
- `tg-aut-local/src/app.ts` uncaught error handling
- `tg-aut-local/src/TelegramManager.ts` startup failure handling
- `tg-aut-local/src/event-handlers/SystemMessageHandler.ts` special “automatically released” flow
- `tg-aut-local/src/jobs.ts` promotion health degradation path

These call:

`GET {tgmanager}/setupClient/{clientId}?archiveOld=...&formalities=...`

`archiveOld` is the backward-compatible query-field name; when true, the replaced
primary is returned to the buffer pool rather than archived.

## Stage 6: `setupClient()` Swap in CommonTgService

`ClientService.setupClient()` is the bridge from warmed `bufferClients` into the live `clients` account used by `tg-aut-local`.

For ordinary swaps, the selected buffer must be due (`availableDate <= today`). When tg-aut
reports a server-classified permanent Telegram failure such as `FROZEN_METHOD_INVALID`, CommonTgService
first tries those due candidates, then may use the earliest future-due candidate only if no due candidate
passes the same session-safety checks. This exception is decided by the server-side permanent-error
classifier, never by a caller-supplied override; it still requires an active, unused, 15-day-old,
`session_rotated` buffer with at least the graduation channel count and a distinct backup session.

### Candidate selection

Current query requires:

- same `clientId`
- requested `mobile`, when supplied; otherwise any mobile different from the existing client mobile
- `createdAt <= now - 15 days`
- normal swaps: `availableDate <= today`
- permanent Telegram failures only: after the normal scan has no session-safe candidate,
  `availableDate > today` is allowed and is ordered earliest-first
- `channels >= 200`
- `status = 'active'`
- `inUse != true`
- `warmupPhase = 'session_rotated'`

This is the practical “buffer is mature enough to become the main account” gate.

### Swap flow

1. Find current main account in `clients`
2. Find eligible buffer candidate
3. Set active setup state in `TelegramService`
4. Connect the new buffer account
5. Update username/profile bits for the new account
6. Atomically update `clients.mobile`, `clients.username`, `clients.session`, and mirrored persona `name`
7. In the same MongoDB transaction, mark the new buffer account `inUse=true` and `lastUsed=now`
8. Trigger the process restart through `deployKey`
9. Return the replaced main account to `bufferClients`

### Replaced main account return to pool

`returnOldClientToBufferPool()` writes the replaced main account back into `bufferClients` with:

- same `clientId`
- previous live `session`
- `availableDate = now + days`
- `channels = max(250, previously recorded buffer count)`
- `status = 'active'` unless `days > 35`, then inactive
- `inUse = false`
- `lastUsed = now`
- `warmupPhase = 'session_rotated'` and `sessionRotatedAt = null`

So a used main account re-enters the buffer pool on a delayed reuse schedule as terminal
supply with a 250-channel minimum. The periodic terminal health check later reconciles the
real Telegram count. If that verified count falls below the buffer operating floor (200),
the join sweep can then provide capacity-recovery joins; it does not rewind warmup or create
a replacement session.

Its retained `lastUsed` and null `sessionRotatedAt` document that no additional Telegram
session was created. This keeps session creation limited to accounts that have never been
used and have no recorded rotation.

## Stage 7: Session Strategy

### During warmup

- client records use the old trusted session copied from `users.session`
- join scheduling does not create new sessions

### After warmup

`rotateSession(mobile)`:

1. creates a new session
2. stores it in `users.session` as backup
3. keeps the old client session in `bufferClients.session` / `promoteClients.session`
4. marks `warmupPhase='session_rotated'`

### During `setupClient()`

The session copied into the live `clients` row is the selected buffer client's session.

## Stage 8: Fields That Matter Operationally

### `warmupPhase`

Tracks whether CommonTgService still considers the account warming or ready.

### `availableDate`

Operational reuse gate used heavily by:

- promote-client cooldown / recycle logic
- `setupClient()` buffer swap eligibility
- aggregate availability views

`setupClient.days` is an integer in the inclusive range 0–35. This is enforced by the API
DTO so a malformed or legacy caller cannot strand an active buffer account with an arbitrary
future availability date.

### Pool planning

Both pools use the same short-horizon and replenishment-horizon calculation. Short-horizon
deficits are reported for operational visibility, while enrollment is driven by the three-to-
four-week horizon that a newly enrolled account can actually reach. This prevents repeated
over-enrollment for a same-day gap that warmup cannot repair. Operational channel floors
remain role-specific: 200 for buffer swaps and 230 for promotion runtime selection.

### `lastUsed`

Marks that the account has actually been consumed in production.

### `inUse`

Prevents the same buffer/promote record from being treated as idle while it is actively assigned.

## Runtime invariant

Promotion runtime selection is phase-aware: only active `session_rotated` records at the
230-channel floor can connect. CommonTgService owns lifecycle transitions; tg-platform
enforces the terminal runtime gate before both selection and connection.

## Recommended Source of Truth

For current behavior, prefer code in this order:

1. `CommonTgService-local/src/components/shared/*`
2. `CommonTgService-local/src/components/clients/client.service.ts`
3. `tg-platform/apps/promote-clients/src/core/dbservice.ts`
4. `tg-platform/apps/promote-clients/src/core/mobile-manager.ts`
5. `tg-platform/apps/tg-aut/src/core/*`
6. `tg-aut-local/src/TelegramManager.ts`

Older lifecycle docs in other repos may describe pre-redesign behavior and should be treated as historical unless updated against current code.
