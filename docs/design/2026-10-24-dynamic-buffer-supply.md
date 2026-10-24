# Dynamic buffer supply (2026-10-24)

Owner approved the direction on 2026-10-24: stop counting harsh and limited/unchecked accounts toward the cap, and make the cap and target dynamic. Code: `src/components/buffer-clients/buffer-supply.ts` (pure rules) and `BufferClientService.buildBufferSupplyPlan` (wiring). Promote enrolment is unchanged.

## Problem (live Mongo + CMS logs, 2026-10-24)

- `isHealthyBufferClientForCap` counted every graduated account with at least 200 channels toward the per-client cap of 20, whatever its SpamBot state. Harsh accounts stay `status: active` and never leave that count, so enrolment was blocked at "healthyCount 20" for divya1, ramya1, kavya1, meghana1, keerthi1 and shruthi1.
- The target was a fixed stock: 10 accounts available within 30 days (6 within 24 days). The fleet need it computed was 2.
- Graduated active buffers fleet-wide: 258. Of those, 165 are harsh, 75 limited (all lifting within 30 days), 11 never SpamBot-checked, and 7 free.
- Consumption is about 50 swaps a week (bufferClients `lastUsed` in the last 7 days: 56; last 14 days: 85). Fresh graduations are about 2 a week. There are 374 eligible candidate users (+16/day).
- Warmup engine: 5 sensitive actions per run, 4 runs a day, 3 sensitive actions per account, so 46 accounts can start warmup per week. Accounts enrolled in the last 7 days: 40. Accounts currently warming: 108.

## Rules

**Counting** (`classifyBufferForCap`, active + assigned docs):

| Account | Counts? |
|---|---|
| Still in warmup (not ready/session_rotated), `failedUpdateAttempts < 3` | yes, pipeline (as before) |
| Graduated, the live main (`inUse`) | no |
| Graduated, under 200 channels | no (as before) |
| Graduated, `spamStatus: free` checked within 14 days | yes, usable |
| Graduated, free but older or no `spamCheckedAt` | no (`stale_free`) |
| Graduated, `limited` with `limitedUntil` at most 30 days ahead (or already past) | yes, limited_soon |
| Graduated, limited lifting later, or with no date | no |
| Graduated, `harsh` (any age) | no |
| Graduated, `spamStatus` null or missing | no (`never_checked`) |

Never-checked and stale-free graduates are listed per client as `needsSpamCheck`. They get their SpamBot check on the existing path: `ClientService.isSpamSafeForSwap` (setupClient) probes every swap candidate that has no free verdict from the last 6 hours, and `buildSpamEligibleFilter` keeps null-status accounts selectable. That path writes `spamStatus`, `limitedUntil` and `spamCheckedAt` (`spamCheckSource: 'cms-probe'`). This change adds no new SpamBot traffic, because a periodic probe would be new Telegram activity on buffer sessions. tg-aut also writes the verdict for the live main.

**Target per client:**

- `consumed` = that client's bufferClients (any status) whose `lastUsed` falls in the last 14 days. setupClient stamps `lastUsed` on the replaced main whether it goes back to the pool or is inactivated. Mongo keeps no swap history. `clients.swappedAt` holds only the latest swap and was set on 1 of 20 clients on 10-24. Known undercounts: an account swapped twice in the window counts once, and docs moved to `bufferClientsArchive` are invisible.
- `target = clamp(ceil(consumed / 14 × 30) + 2, 10, 40)`
- `cap = min(50, target + 5)`. Code hard bound: 60.
- `need = min(cap − counted, max(target − counted, legacy window need))`. Keeping the old window need as a floor means no client gets less than before.

**Fleet budget per run:** `min(10 per run, 46 − enrolled in the last 7 days, ceil(46 × 30 / 7) − currently warming)`. When the budget binds, slots go one at a time to the client with the largest remaining deficit as a share of its target (`allocateByNeed`). Warmup per-run caps, runs per day and phase gates are unchanged.

**Promote:** it has its own cap function (`isHealthyPromoteClientForCap`, cap 30) and its schema has no spam fields, so it does not share the bug and is untouched. Both pools draw from the same `users` candidate query, and each excludes the other's mobiles. Buffer enrolment is capped at 46 a week; promote enrolled 45 in 30 days. Together that is well under the candidate supply of 374 plus 112 a week.

## Expected effect (live dry run 2026-10-24, same rules, read-only)

- Fleet need rises from 2 to 79.
- This run's budget is 6, because 40 accounts were enrolled in the last 7 days against the ceiling of 46.
- Largest needs: sneha1 15, sowmya2 13, sowmya1 12, meghana1 6, nidhi1 5.
- After that, enrolment runs at the engine ceiling (about 46 a week) until the per-client targets are met.

## Config keys (Mongo `configuration` doc → `process.env`)

| Key | Default | Range |
|---|---|---|
| `BUFFER_SUPPLY_MODE` | `dynamic` | `dynamic` / `legacy` |
| `BUFFER_SUPPLY_CONSUMPTION_WINDOW_DAYS` | 14 | 3–60 |
| `BUFFER_SUPPLY_LEAD_TIME_DAYS` | 30 (also the limited window) | 7–90 |
| `BUFFER_SUPPLY_SAFETY_MARGIN` | 2 | 0–20 |
| `BUFFER_SUPPLY_MIN_TARGET` | 10 | 0–40, ≤ max |
| `BUFFER_SUPPLY_MAX_TARGET` | 40 | 1–60 |
| `BUFFER_SUPPLY_CAP_HEADROOM` | 5 | 0–30 |
| `BUFFER_SUPPLY_HARD_CAP` | 50 | 1–60 |
| `BUFFER_SUPPLY_FREE_FRESH_DAYS` | 14 | 1–60 |
| `BUFFER_SUPPLY_FLEET_WEEKLY_CEILING` | 46 (engine) | 0–engine ceiling (can only lower it) |

A value outside its range, a non-integer, or min > max fails closed to `legacy`: the exact pre-change enrolment (old counting, cap 20, fixed 10-account stock, priority order, 10 per run). The rejected keys are logged as a warning and shown in the summary title.

## Audit

- Every buffer check run logs `[<clientId>] Buffer supply plan` with counted by kind, excluded by reason, `needsSpamCheck`, consumed, target, cap, window need, need and allocated.
- One `Buffer supply plan (fleet)` line carries the budget, enrolled in the last 7 days, warming and pipeline capacity.
- The run summary sent to ACCOUNT_NOTIFICATIONS gets a "Supply plan" table. That summary is sent per run, 4 times a day; there is no separate daily buffer summary.
- `GET /bufferclients/diagnoseEnrollment` (`diagnoseEnrollmentDecision`) returns the same plan.

## Rollback

- Config: set `BUFFER_SUPPLY_MODE=legacy` through the CMS configuration update API. `ConfigurationService.update` writes the key into `process.env` of that process at once. An edit made straight in Mongo takes effect only after `pm2 restart cms`, because `setEnv` runs at boot and never overwrites a key that is already set.
- Code: `git revert` the commit and redeploy CMS.
