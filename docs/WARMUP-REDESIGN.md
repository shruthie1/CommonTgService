# Warmup Redesign — Design Document

**Goal:** Stop Telegram from flagging/revoking sessions by making account warmup slow, randomized, and human-like.  
**Date:** 2026-04-03  
**Status:** Implemented — pending deployment

---

## Problem

Telegram was revoking sessions because accounts looked automated during warmup:

| Detection Vector | What We Did | What Telegram Sees |
|-----------------|-------------|-------------------|
| Profile burst | 5 mutations in 90 seconds at setup | Bot doing account takeover |
| `removeOtherAuths()` | Called before every enrollment | Account hijacker pattern |
| New session immediately | Created at enrollment, old session discarded | Untrusted device, no history |
| Channel join rate | 20s between joins, 350 target | Extreme outlier behavior |
| No organic activity | Only connected for admin operations | Zombie account |
| Fleet fingerprint | Same day thresholds, same action order | 50 accounts doing identical things |
| Health check writes | `SetPrivacy` as liveness ping every 7 days | Unnecessary profile modifications |
| 2FA as first action | Set immediately on enrollment | Takeover lockdown pattern |

## Solution

### 1. Phase-Based Warmup (20-25 days, not 10-15)

Each account progresses through 7 phases. Each phase has a **purpose visible to Telegram** — mimicking how a real user gradually customizes their account.

```
ENROLLED (Day 0)
    │ wait 1-4 days (jitter)
    ▼
SETTLING (Day 1+)          ← "opens the app", browses chats
    │ Sub-step 1: set privacy (organic preamble)
    │ Sub-step 2: set 2FA (2+ day gap, secures account EARLY)
    │ Sub-step 3: removeOtherAuths (2+ day gap, AFTER 2FA — safe)
    │ wait until day 4+
    ▼
IDENTITY (Day 4+)          ← one profile change per cycle, 2+ day gaps
    │ delete photos → name/bio → username (sequential, 2-day gaps)
    │ wait until day 8+
    ▼
GROWING (Day 8+)           ← channel joining: 8/session, 90-180s delays
    │ target: 200 channels (was 350)
    │ wait until day 18+
    ▼
MATURING (Day 18+)         ← upload 1 profile photo
    │
    ▼
READY (Day 20+)            ← eligible for active use
    │ triggered when account enters rotation
    ▼
SESSION_ROTATED            ← backup session created, old session stays active
```

### Why 2FA and removeOtherAuths are EARLY, not late

The account needs to be secured early so the original user can't access it. The order matters:

1. **Privacy first** — lightweight, non-suspicious
2. **2FA second** — secures the account with our password
3. **removeOtherAuths third** — now safe because 2FA is set; looks like a security-conscious user cleaning up sessions, not a hijacker

Each step is in a **separate session** with **2+ day gaps** and **organic activity preamble**, so Telegram sees:
- Day 1: User opens app, browses chats, changes privacy settings (normal)
- Day 3: User enables 2FA (security-conscious, normal)  
- Day 5: User removes old sessions (cleaning up after enabling 2FA, normal)

### 2. Per-Account Randomization

Every account gets a `warmupJitter` (0-3 random days) assigned at enrollment. All day thresholds are `base + jitter`, so 50 accounts enrolled on the same day don't all transition on the same day.

### 3. Organic Activity Before Every Action

Before any admin operation (privacy, name, photos), the account performs read-only Telegram activity that looks like a human opening the app:

| Intensity | Duration | Actions |
|-----------|----------|---------|
| light | 1-2 min | `getMe()` → pause → `getDialogs(5)` |
| medium | 3-5 min | `getDialogs(15)` → read channel messages → `getContacts()` |
| full | 5-10 min | `getDialogs(20)` → read from 2-3 channels → contacts → saved messages |

All pauses are Gaussian-randomized (15-45s range).

### 4. Session Rotation Strategy

```
ENROLLMENT:
  users.session (old, trusted) → copy to buffer/promote.session
  users.session stays unchanged

WARMUP (20-25 days):
  All operations use buffer/promote.session (the old trusted one)
  No new sessions created during warmup

SESSION ROTATION (when ready for active use):
  Create new session → store in users.session (backup)
  buffer/promote.session keeps old session (active use)
  No removeOtherAuths() — both sessions coexist

ACTIVE USE:
  Services use buffer/promote.session (old, trusted, warmed up)
  If revoked → recover from users.session (backup)
```

### 5. Channel Joining Redesign

| Parameter | Before | After |
|-----------|--------|-------|
| Delay between joins | 20s fixed | 90-180s Gaussian (mean=120s, stddev=30s) |
| Joins per session | Unlimited | Max 8 |
| Channel target | 350 | 200 |
| Queue load per mobile | 150 channels | 25 channels |
| Organic interleaving | None | Every 2-3 joins |
| Join interval | 6min (buffer) / 4min (promote) | 6min both |

### 6. Health Check Redesign

| Before | After |
|--------|-------|
| `SetPrivacy` (write operation) | `getDialogs` + `getMe` (read-only organic activity) |
| Every exactly 7 days | Every 5-9 days (randomized) |

---

## What Changed at Enrollment

### Before (setAsBufferClient)
```
connect → set2fa() → 30-60s → getChannels → 5-10s → createNewSession() → save
```

### After (setAsBufferClient)
```
connect → getChannels → save with old session + warmupPhase='enrolled'
```

### Before (setAsPromoteClient)  
```
connect → set2fa() → 30-60s → clearUsername → 10-15s → updatePrivacy → 10-15s
       → setName("Deleted Account") → 10-15s → deletePhotos → 10-15s → getChannels → save
```

### After (setAsPromoteClient)
```
connect → getChannels → save with old session + warmupPhase='enrolled'
```

### Before (createBufferClientFromUser / createPromoteClientFromUser)
```
connect → removeOtherAuths() → 10-20s → set2fa() → 30-60s → getChannels → createNewSession → save
```

### After
```
connect → hasPassword check → getChannels → save with old session + warmupPhase='enrolled'
```

---

## Timing Comparison

| Action | Before | After |
|--------|--------|-------|
| Initial setup | 5 operations in 90s | 1 operation (getChannels) |
| First admin action | Day 0 (immediate) | Day 1-4 (after organic browsing) |
| Privacy update | Day 1 | Day 1-4 (with organic preamble) |
| 2FA setup | Day 0 (FIRST, in setup burst) | Day 3-7 (EARLY, but with 2-day gap after privacy) |
| removeOtherAuths | Day 0 (FIRST, before 2FA!) | Day 5-9 (AFTER 2FA, with 2-day gap) |
| Delete photos | Day 2 | Day 7-11 |
| Name/bio | Day 3 (100ch) | Day 9-13 |
| Username | Day 7 (150ch) | Day 11-15 |
| Profile photo upload | Day 10 (170ch) | Day 18-23 |
| Channel join rate | 20s between joins | 90-180s Gaussian |
| Channel target | 350 | 200 |
| Warmup complete | Day 10-15 | Day 20-25 |
| Session creation | During setup | Post-warmup, before active use |
| Health check | SetPrivacy every 7d | getDialogs every 5-9d |

---

## Strict Sequential Gating

The old system had a bypass where if a previous step was never attempted (`timestamp === 0`), the next step could proceed anyway. This meant steps could fire out of order or collapse together.

The new system uses **strict gating**: each step REQUIRES the previous step's timestamp to exist AND be at least 2 days old. No bypasses.

```
SETTLING:
  privacy ──────(2+ days)───→ set 2FA ──────(2+ days)───→ removeOtherAuths

IDENTITY (day 4+):
  delete photos ─(2+ days)──→ name/bio ─────(2+ days)───→ username

GROWING (day 8+):
  channel joining (max 8/session, 90-180s delays, target 200)

MATURING (day 18+):
  upload photo ──(wait for day 20+ floor)──→ READY
```

---

## Backward Compatibility

- Existing accounts with completed warmup should have `warmupPhase` set to `'ready'` via migration
- Accounts with no `warmupPhase` field are treated as `'enrolled'` (safe default — will wait before any action)
- All existing DB fields preserved — new fields have defaults (`null` or `0`)
- Promote clients now have a `session` field — existing docs without it will have `session: undefined` which is handled

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Warmup takes longer (20-25 days vs 10-15) | Buffer pool sizing accounts for this; availability windows still maintain minimum ready accounts |
| Organic activity could trigger rate limits | All calls are read-only; errors caught and logged, non-fatal |
| Gaussian delays could occasionally be too short | Clamped to min=90s, max=180s for channel joins |
| Old sessions might expire during 25-day warmup | Health checks every 5-9 days keep sessions alive |
| Migration of existing accounts | Default `warmupPhase=null` → treated as enrolled → waits before acting |
