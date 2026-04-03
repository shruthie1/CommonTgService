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

## Lifecycle Overview

1. Account is registered into `users`.
2. Account is classified into `bufferClients` or `promoteClients`.
3. CommonTgService warms the account through phase-based warmup.
4. Promote accounts are consumed directly by `promote-clients-local`.
5. Buffer accounts are candidates for `setupClient()` swaps into `clients` for `tg-aut-local`.
6. Used accounts are archived back into `bufferClients` with a future `availableDate`, or marked inactive on hard failures.

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
- Join scheduling runs independently from warmup, but is now gated to `growing` and later phases.

## Stage 4: Promote Usage in `promote-clients-local`

`promote-clients-local` consumes `promoteClients` directly from Mongo.

### Current availability query

`dbservice.getAvailablePromoteMobile()` selects promote accounts with:

- `clientId = process.env.clientId`
- `availableDate <= today + 3 days`
- `channels >= 230`
- `createdAt < now - 7 days`
- `status = 'active'`

Notably, this code path does not currently filter on `warmupPhase`.

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

## Stage 6: `setupClient()` Swap in CommonTgService

`ClientService.setupClient()` is the bridge from warmed `bufferClients` into the live `clients` account used by `tg-aut-local`.

### Candidate selection

Current query requires:

- same `clientId`
- `mobile != existing client mobile`
- `createdAt <= now - 15 days`
- `availableDate <= today`
- `channels > 200`
- `status = 'active'`

This is the practical “buffer is mature enough to become the main account” gate.

### Swap flow

1. Find current main account in `clients`
2. Find eligible buffer candidate
3. Set active setup state in `TelegramService`
4. Connect the new buffer account
5. Update username/profile bits for the new account
6. Update `clients.mobile`, `clients.username`, and `clients.session`
7. Trigger old process restart through `deployKey`
8. Archive the old main account back into `bufferClients`
9. Mark the new buffer account `inUse=true` and `lastUsed=now`

### Old main account archival

`archiveOldClient()` writes the old main account back into `bufferClients` with:

- same `clientId`
- previous live `session`
- `availableDate = now + (days + 1)`
- `channels = 170`
- `status = 'active'` unless `days > 35`, then inactive
- `inUse = false`

So a used main account re-enters the buffer pool on a delayed reuse schedule.

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

### `lastUsed`

Marks that the account has actually been consumed in production.

### `inUse`

Prevents the same buffer/promote record from being treated as idle while it is actively assigned.

## Important Current Caveat

The warmup engine is phase-aware, but not every usage/availability query across repos is.

In particular:

- CommonTgService join scheduling is phase-gated
- `setupClient()` effectively gates by age/channels/availableDate
- `promote-clients-local` availability still primarily gates by `availableDate`, age, channels, and status

If a future change wants “only ready/session_rotated accounts may be used anywhere”, that rule must be enforced in the selection queries, not just in the warmup state machine.

## Recommended Source of Truth

For current behavior, prefer code in this order:

1. `CommonTgService-local/src/components/shared/*`
2. `CommonTgService-local/src/components/clients/client.service.ts`
3. `promote-clients-local/src/dbservice.ts`
4. `promote-clients-local/src/setupNewMobile.ts`
5. `tg-aut-local/src/utils.ts`
6. `tg-aut-local/src/TelegramManager.ts`

Older lifecycle docs in other repos may describe pre-redesign behavior and should be treated as historical unless updated against current code.
