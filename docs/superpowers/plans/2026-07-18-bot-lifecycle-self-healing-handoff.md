# Bot Lifecycle Automation Handoff

Date: 2026-07-18
Scope: `CommonTgService` bot health, replacement, channel-admin verification, and alerting.

## Goal

Make Telegram notification bots self-healing without risking the non-renewable Telegram user
accounts that create and administer them.

The intended workflow is:

```text
validate bot token -> classify outcome -> retire only permanently dead bots
    -> create replacement with a healthy creator account -> add as channel admin
    -> verify membership/admin rights -> activate -> make selectable for sends
```

Transient failures must never retire a bot or trigger a BotFather creation. Flood/spam signals
must stop the run rather than try another account.

## Current Live State

- CMS runs on VM2 as one PM2 process and has been stable; its historical restart count is not a
  current crash loop.
- `BOT_HEALTH_JOB_ENABLED` is unset on the live CMS process. The daily automatic validation and
  replacement scheduler is therefore disabled.
- The `bots` collection has 55 records: 53 active, one revoked/inactive record, and one inactive
  record with `deadReason: "awaiting channel-admin add"`.
- Keep `BOT_HEALTH_JOB_ENABLED` disabled until the controlled dry-run and one bounded real run in
  the rollout plan are clean.

## Implemented Lifecycle Contract (2026-07-18)

The first implementation pass is now in `src/components/bots`. It is deliberately additive and
backward compatible:

- Legacy `status`, `deadReason`, `deadAt`, and existing bot documents are retained. No existing
  reader needs an immediate migration.
- `lifecycle` is the authoritative safety field for new code. Only
  `lifecycle: "active_verified"` is selectable for a send; the old `status` remains mirrored as
  `active`/`inactive` for compatibility.
- CMS migrates documents missing `lifecycle` on startup and before a real health run. The mapping
  is deterministic: active → `active_verified`; inactive awaiting admin → `pending_admin`;
  inactive token/getMe/revoked reason → `dead_token`; every other inactive record →
  `manual_attention`. The migration preserves all legacy values.
- New manually registered and BotFather-created bots are persisted as `pending_admin` and legacy
  `status: "inactive"` from their first database write. They cannot enter send rotation until a
  separate channel-admin verification succeeds.
- Scheduler and manual calls acquire the same expiring Mongo lease (`botHealthLeases/bot-health`).
  The per-process guard remains a fast local check; the lease handles multiple CMS processes and
  crash recovery.
- Replacement and minimum-health top-up share a single global BotFather creation budget of one
  per run. Flood/spam signals stop pending-admin promotion, replacement, and top-up work.
- Pending-admin reconciliation is also capped at one due record per run. The strict promotion
  path performs one `promoteToAdmin` call and propagates Telegram errors; legacy bulk setup keeps
  its separate best-effort behavior.
- `POST /bots/validate-and-replace?dryRun=true` validates tokens and reports proposed actions
  without bot-state writes, BotFather creation, channel promotion, cache mutation, or summary
  notification. It still acquires the short-lived run lease so it cannot overlap a real repair.
  `async=true` can be combined with `dryRun=true`.

## Pre-Lifecycle Implementation (superseded)

Main implementation: `src/components/bots/bots.service.ts`.

- Scheduler is daily at 03:30 Asia/Kolkata, guarded by `BOT_HEALTH_JOB_ENABLED`:
  lines 151-190.
- Token health check uses Telegram `getMe`; only HTTP 401, 403, and 404 are treated as permanent:
  lines 857-874.
- Dead bot replacement was capped independently from category top-up, allowing up to three new
  bots per run. This is replaced by the single global creation budget above.
- Provisioning persists a bot inactive, adds it as channel admin, verifies it, and only then marks
  it active:
  lines 1031-1060.
- Sends selected non-inactive bots first but fell back to all records when none were active. This
  is replaced by the `active_verified` selection invariant.
- Manual operation endpoint: `POST /bots/validate-and-replace`:
  `src/components/bots/bots.controller.ts:41-56`.

## Resolved Deployment Blockers

### 1. Pending-admin bots are incorrectly reactivated

`validateAndReplaceBots()` marks every `inactive` bot as `active` if `getMe` succeeds
(`bots.service.ts:898-905`). `getMe` proves only the token is live. It does not prove the bot is
in the target channel or is an admin.

This conflicts with the provisioning contract, which deliberately leaves a failed add/verify bot
inactive (`bots.service.ts:1031-1060`). A live record currently has this exact
`awaiting channel-admin add` state.

Implemented behavior:

- Split state/reason handling. Only a bot retired for a token failure may be restored by a live
  `getMe` result.
- A `pending_admin` bot must run channel-admin verification before activation.
- If verification fails, keep it non-selectable and schedule bounded reconciliation or escalate it
  to manual attention. Never activate it merely because the token is valid.

### 2. Send failover retries known bad bots

If every bot in a category is inactive, `sendByCategoryWithFailover()` retains the original list
and attempts to send with revoked or unverified bots (`bots.service.ts:431-445`).

Implemented behavior:

- Select only verified active bots.
- If there are none, return `false`, emit one structured category-unhealthy alert, and let the
  repair worker handle it. Do not make a live send attempt with inactive bots.

## Recommended State Model

Replace the overloaded `status: active | inactive` semantic with a lifecycle field. Keep legacy
fields during migration, then remove them once all readers use the new field.

```ts
type BotLifecycle =
  | 'active_verified'
  | 'dead_token'
  | 'pending_admin'
  | 'manual_attention';

interface BotLifecycleFields {
  lifecycle: BotLifecycle;
  lifecycleReason?: string;
  lifecycleUpdatedAt: Date;
  lastValidatedAt?: Date;
  lastAdminVerifiedAt?: Date;
  repairAttempts: number;
  nextRepairAt?: Date;
  replacedBotId?: ObjectId;
  createdByMobile?: string;
}
```

Selection invariant:

```text
Only lifecycle === active_verified is eligible to send.
```

Migration mapping:

```text
status active                         -> active_verified
status inactive + token-revoked reason -> dead_token
status inactive + awaiting-admin reason -> pending_admin
other inactive                         -> manual_attention
```

## Target Automation Flow

### Health validation

1. Acquire a Mongo-backed lease before any run. It must cover scheduler and manual endpoint
   invocations, with an expiry for crash recovery.
2. Load bot records with lifecycle metadata.
3. Call `getMe` sequentially with current pacing.
4. Classify results:
   - `200 + ok`: valid token. Refresh validation time only.
   - `401`, `403`, `404`: transition `active_verified` to `dead_token` atomically.
   - timeout, `429`, `5xx`, connection failure: retain current state and schedule retry with
     backoff. Do not retire or replace.
5. Flush/refresh selection cache immediately when a bot becomes non-selectable.

### Pending-admin reconciliation

1. For each `pending_admin` bot whose `nextRepairAt` is due, resolve a safe channel manager.
2. Verify the bot is already an admin. If yes, transition to `active_verified`.
3. If absent, make one paced add/promote attempt only when no flood/spam signal is present.
4. Verify after the propagation delay.
5. On failure, increment attempts and set bounded backoff. After the configured threshold,
   transition to `manual_attention` and alert.

### Replacement

1. Queue `dead_token` bots by category and age.
2. Apply one global BotFather creation budget per run. Replacement and redundancy top-up must share
   the same budget; start with one creation total per run.
3. Pick creator accounts using the existing healthy foreign-account preference.
4. Persist the new bot as `pending_admin` before channel actions.
5. Add it as admin using only permissions held by the selected promoter.
6. Verify membership/admin status from a separate controllable viewer where possible.
7. Transition to `active_verified` only after proof. Delete/archive the dead record only after that
   transition succeeds.
8. On flood/spam signal, stop all remaining creates/promotes in the run and schedule delayed retry.

### Category health

- Count only `active_verified` bots.
- Raise an alert when a category drops below the minimum healthy count.
- A category with zero active bots must not send through inactive bots.
- Top-up only categories with a known configured channel. A category with no bot and no channel
  mapping is configuration work, not a reason to guess a target channel.

## Focused Regression Coverage

The focused suite now covers the following implemented safety behavior:

1. `pending_admin` + live `getMe` remains non-selectable until admin verification succeeds.
2. `dead_token` + live `getMe` recovery only occurs if that recovery policy is intentionally kept.
3. All-inactive category returns `false` and makes zero Telegram send calls.
4. `401`, `403`, and `404` transition to `dead_token` with the actual status recorded.
5. Timeouts, `429`, `5xx`, and network errors leave lifecycle unchanged and schedule backoff.
6. Global creation budget applies across replacement plus top-up.
7. Concurrent manual and scheduled runs contend on the distributed lease; only one performs work.
8. A newly dead bot is removed from a warm send cache before its health scan completes.
9. Legacy records migrate without removing the old fields.
10. Dry-run does not resolve Telegram user-account services for pending-admin reconciliation.
11. A flood during pending-admin promotion aborts remaining creation/top-up work.

The remaining follow-up coverage should exercise failed post-add verification.

## Rollout Plan

1. Implement lifecycle fields, migration, selection invariant, distributed lease, and tests.
2. Deploy CMS with the scheduler still disabled.
3. Run `POST /bots/validate-and-replace?async=true&dryRun=true` in dry-run mode. It should report proposed
   transitions and creation actions but make no Telegram mutations.
4. Review dry-run output and correct current `pending_admin` data manually or through the new
   reconciler.
5. Enable one real run with a global creation budget of one and monitor the summary, Mongo states,
   and manager-account Telegram errors.
6. Enable `BOT_HEALTH_JOB_ENABLED=true` only on the single CMS PM2 process after the controlled run
   is clean.
7. Keep a kill switch: unset the flag and restart only CMS if automation needs immediate stop.

## Operational Rules

- Never automatically retry BotFather creation or channel promotion after flood/spam signals.
- Never use session-revoked user accounts as creators or channel managers.
- Never send through non-verified bots.
- Do not log bot tokens, request URLs containing tokens, or notification query text. This release
  redacts these diagnostics in `src/utils/fetchWithTimeout.ts` and must be deployed together with
  the lifecycle changes.
- Do not run the bot health scheduler on any tg-aut or promote-client process. CMS is the owner.

## Verification Commands

```sh
# Focused test suite
npm test -- --runInBand src/components/bots/__tests__/bots.service.spec.ts

# Build CommonTgService
npm run build

# On CMS VM, confirm scheduler configuration without exposing secrets
cms_id="$(pm2 jlist | jq -r '.[] | select(.name == "cms") | .pm_id')"
pm2 env "$cms_id" | grep '^BOT_HEALTH_JOB_ENABLED='
```

## Existing Local Changes

This lifecycle change is intentionally separate from the existing uncommitted security fix in:

- `src/utils/fetchWithTimeout.ts`
- `src/utils/__tests__/fetchWithTimeout.spec.ts`

It redacts bot credentials and query values from request diagnostics and notification logs. Its
focused test suite and `npm run build` passed.
