# Warmup Redesign — Implementation Guide

**Covers:** Base class architecture, file inventory, schema changes, warmup phase logic, organic activity, session rotation.

---

## Architecture

```
shared/
├── base-client.service.ts      ← Abstract base class (all shared logic)
├── organic-activity.ts          ← Human-like TG activity simulation
├── warmup-phases.ts             ← Phase constants, transition state machine
├── client-helper.utils.ts       ← gaussianRandom, getTimestamp, jitter
├── index.ts                     ← Re-exports everything
└── __tests__/
    ├── warmup-phases.test.ts    ← 38 tests (all phase transitions, edge cases, full timeline)
    └── client-helper.test.ts    ← 22 tests (gaussian bounds, NaN handling, jitter range)

buffer-clients/
├── buffer-client.service.ts     ← Extends BaseClientService
├── schemas/buffer-client.schema.ts  ← +5 warmup fields
└── dto/
    ├── create-buffer-client.dto.ts
    └── update-buffer-client.dto.ts  ← +5 warmup fields

promote-clients/
├── promote-client.service.ts    ← Extends BaseClientService
├── schemas/promote-client.schema.ts  ← +5 warmup fields + session + inUse
└── dto/
    ├── create-promote-client.dto.ts  ← +session field
    └── update-promote-client.dto.ts  ← +5 warmup fields
```

---

## Base Class: `BaseClientService<TDoc>`

Generic abstract class parameterized by the document type (`BufferClientDocument` or `PromoteClientDocument`).

### What the base class owns

| Category | Methods |
|----------|---------|
| **Lifecycle** | `onModuleDestroy()`, `cleanup()` |
| **Memory** | `startMemoryCleanup()`, `clearMemoryCleanup()`, `performMemoryCleanup()`, `trimMapIfNeeded()`, `createTimeout()`, `clearAllTimeouts()` |
| **Helpers** | `safeUnregisterClient()`, `handleError()`, `updateUser2FAStatus()` |
| **Maps** | `safeSetJoinChannelMap()`, `safeSetLeaveChannelMap()`, `removeFromJoinMap()`, `removeFromLeaveMap()`, `clearJoinMap()`, `clearLeaveMap()` |
| **Health** | `performHealthCheck()` — uses organic activity instead of SetPrivacy |
| **Warmup steps** | `updatePrivacySettings()`, `set2fa()`, `removeOtherAuths()`, `deleteProfilePhotos()`, `updateProfilePhotos()` |
| **Warmup engine** | `processClient()` — reads phase from `getWarmupPhaseAction()`, executes one action per cycle |
| **Backfill** | `backfillTimestamps()` |
| **Channel queues** | `joinChannelQueue()`, `processJoinChannelInterval()`, `processJoinChannelSequentially()`, `leaveChannelQueue()`, `processLeaveChannelInterval()`, `processLeaveChannelSequentially()`, `clearJoinChannelInterval()`, `clearLeaveChannelInterval()` |
| **Availability** | `calculateAvailabilityBasedNeeds()` |
| **Stats** | `getClientsByStatus()`, `getClientsWithMessages()`, `getLeastRecentlyUsedClients()`, `getNextAvailableClient()`, `getUnusedClients()`, `getUsageStatistics()`, `markAsUsed()` |
| **Session** | `rotateSession()` |

### What subclasses must implement

```typescript
abstract get model(): Model<TDoc>;
abstract get clientType(): 'buffer' | 'promote';
abstract get config(): ClientConfig;
abstract updateNameAndBio(doc, client, failedAttempts): Promise<number>;
abstract updateUsername(doc, client, failedAttempts): Promise<number>;
abstract findOne(mobile, throwErr?): Promise<TDoc>;
abstract update(mobile, updateDto): Promise<TDoc>;
abstract markAsInactive(mobile, reason): Promise<TDoc | null>;
abstract updateStatus(mobile, status, message?): Promise<TDoc>;
```

### ClientConfig interface

```typescript
interface ClientConfig {
  joinChannelInterval: number;      // ms between queue processing runs
  leaveChannelInterval: number;     // ms between leave processing runs
  leaveChannelBatchSize: number;    // channels to leave per batch
  channelProcessingDelay: number;   // ms between clients in queue
  channelTarget: number;            // max channels to join
  maxJoinsPerSession: number;       // max joins per queue run per mobile
  maxNewClientsPerTrigger: number;  // rate limit for new enrollments
  minTotalClients: number;          // minimum active clients per clientId
  maxMapSize: number;               // max entries in join/leave maps
  cleanupInterval: number;          // ms between memory cleanup runs
  cooldownHours: number;            // hours between update attempts
  clientProcessingDelay: number;    // ms between client processing
}
```

### Config values per type

| Config | Buffer | Promote |
|--------|--------|---------|
| joinChannelInterval | 6 min | 6 min |
| leaveChannelInterval | 120s | 60s |
| channelTarget | 200 | 200 |
| maxJoinsPerSession | 8 | 8 |
| minTotalClients | 10 | 12 |
| cleanupInterval | 15 min | 10 min |
| cooldownHours | 2 | 2 |
| clientProcessingDelay | 10s | 8s |

---

## Schema Changes

### New fields (both schemas)

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `twoFASetAt` | Date | `null` | When 2FA was set during settling phase |
| `otherAuthsRemovedAt` | Date | `null` | When other sessions were revoked |
| `warmupPhase` | String enum | `null` | Current warmup phase |
| `warmupJitter` | Number | `0` | Random 0-3 day offset, set once at enrollment |
| `enrolledAt` | Date | `null` | When account entered warmup pipeline |
| `organicActivityAt` | Date | `null` | Last organic read activity timestamp |
| `sessionRotatedAt` | Date | `null` | When backup session was created |

### Promote-only additions

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `session` | String | — | Old trusted session for active use (was missing) |
| `inUse` | Boolean | `false` | Align with buffer client (was missing) |

### warmupPhase enum values

```
'enrolled' | 'settling' | 'identity' | 'growing' | 'maturing' | 'ready' | 'session_rotated'
```

---

## Warmup Phase State Machine

### `getWarmupPhaseAction(doc, now)` → `WarmupAction`

Located in `shared/warmup-phases.ts`. Pure function — no side effects, no DB calls.

**Input:** Document fields + current timestamp  
**Output:** `{ phase, action, organicIntensity }`

### Phase transition rules

```
ENROLLED:
  if daysSinceEnrolled >= 1 + jitter → SETTLING (set_privacy)
  else → wait

SETTLING (sub-steps: privacy → 2FA → removeOtherAuths):
  if privacy NOT done → set_privacy
  if privacy done < 2 days ago → organic_only
  if privacy done 2+ days AND 2FA NOT done → set_2fa
  if 2FA done < 2 days ago → organic_only
  if 2FA done 2+ days AND auths NOT removed → remove_other_auths
  if ALL settling done AND daysSinceEnrolled >= 4 + jitter → IDENTITY (delete_photos)
  else → organic_only

IDENTITY:
  if photos NOT deleted → delete_photos
  if photos deleted < 2 days ago → organic_only
  if photos deleted 2+ days AND name/bio NOT done → update_name_bio
  if name/bio done < 2 days ago → organic_only
  if name/bio done 2+ days AND username NOT done → update_username
  if ALL identity done AND daysSinceEnrolled >= 8 + jitter → GROWING (join_channels)
  else → organic_only

GROWING:
  if channels < 200 → join_channels
  if channels >= 200 AND daysSinceEnrolled >= 18 + jitter → MATURING
  else → organic_only

MATURING:
  if photo NOT uploaded → upload_photo
  if photo uploaded → advance_to_ready

READY / SESSION_ROTATED:
  → wait (nothing to do)
```

### Strict gating (no bypasses)

Every step REQUIRES:
1. The **previous step's timestamp** to exist (`> 0`)
2. At least **2 days** since previous step (`MIN_DAYS_BETWEEN_IDENTITY_STEPS`)
3. The **day threshold** to be met (`base + jitter`)

If any condition is not met → `organic_only` or `wait`.

---

## Organic Activity Module

### `performOrganicActivity(client, intensity)`

Located in `shared/organic-activity.ts`. Uses existing `TelegramManager` methods.

| Method Used | TG API Call | Type |
|------------|-------------|------|
| `getMe()` | `users.getFullUser(self)` | Read |
| `getDialogs({limit})` | `messages.getDialogs` | Read |
| `getMessages(entity, limit)` | `messages.getHistory` | Read |
| `getContacts()` | `contacts.getContacts` | Read |
| `getSelfMSgsInfo(limit)` | `messages.getHistory(self)` | Read |

All pauses between calls use `gaussianRandom()` for natural timing variation.

**Error handling:** All organic activity failures are caught and logged — they never abort the warmup step. The outer caller proceeds with the admin action regardless.

---

## Channel Joining

### `processJoinChannelSequentially()` in base class

```
for each mobile in queue:
    joinCount = 0
    while joinCount < 8 AND channels remain:
        check if channel is banned → skip
        tryJoiningChannel(mobile, channel)
        joinCount++
        
        // Organic interleaving every 2-3 joins
        if joinCount % random(2,3) == 0:
            performOrganicActivity(client, 'light')
        
        // Human-like delay: Gaussian(mean=120s, stddev=30s, min=90s, max=180s)
        sleep(gaussianRandom(120000, 30000, 90000, 180000))
    
    if no channels remain → remove from queue
```

### Queue loading

Channel join entry points (`joinchannelForBufferClients`, `joinchannelForPromoteClients`) now load **25 channels per mobile** instead of 150. Combined with max 8 joins per run, this means:
- 8 channels joined per run (if all succeed)
- ~16 minutes per run (8 joins * ~2 min each)
- 25 channels exhausted in ~3 runs
- Reaching 200 channels takes ~12-15 days (at 2 runs/day)

---

## Session Rotation

### `rotateSession(mobile)` in base class

```typescript
1. Connect with old session (buffer/promote.session)
2. createNewSession() → full re-login, new auth key
3. Store new session in users.session (backup)
4. Update warmupPhase = 'session_rotated', sessionRotatedAt = now
5. Old session stays in buffer/promote.session (active use)
```

Called externally when an account transitions from `ready` to active rotation. Not called during warmup.

---

## `processClient()` Flow

Main warmup processor, called from `checkBufferClients` / `checkPromoteClients`:

```
1. Skip if inUse
2. Skip if no parent client
3. Sleep 15-25s (initial delay)
4. Check failed attempts (skip if >= 3, reset if last failure > 7 days ago)
5. Check cooldown (skip if last attempt < 2 hours ago)
6. Skip if lastUsed > 0 (already in active use, backfill timestamps)
7. getWarmupPhaseAction(doc, now) → { phase, action, organicIntensity }
8. Update phase in DB if changed
9. If action == 'wait' → update lastUpdateAttempt, return
10. Execute action:
    - organic_only → connect, organic activity, disconnect
    - set_privacy → organic preamble + updatePrivacyforDeletedAccount()
    - delete_photos → organic + delete profile photos
    - update_name_bio → abstract (buffer: full name, promote: firstName + petName)
    - update_username → abstract (buffer: set username, promote: clear username)
    - upload_photo → organic + upload 1 photo from pool
    - set_2fa → organic + set2fa() (during settling, stamps twoFASetAt)
    - remove_other_auths → organic + removeOtherAuths() (during settling, after 2FA)
    - advance_to_ready → mark warmupPhase='ready' (requires day 20+ floor)
    - join_channels → no-op (handled by separate joinChannel* flow)
11. Sleep 15-25s (final delay)
```

**One warmup action per `processClient()` call, gated by a 2-hour cooldown.**
Note: health checks, join scheduling, and leave scheduling run independently via separate entry points. The cooldown only gates `processClient()`, not the other schedulers. Join scheduling is gated by `warmupPhase` filter (only `growing`+ phases).

---

## Testing

### Test files

- `shared/__tests__/warmup-phases.spec.ts` — warmup phase tests
- `shared/__tests__/client-helper.spec.ts` — utility tests

Run with:
```bash
npx jest 'src/components/shared/__tests__'
```

### Test coverage

| Area | Tests | What's covered |
|------|-------|---------------|
| ENROLLED phase | 6 | Jitter effects, missing enrolledAt/createdAt, fallback to createdAt |
| SETTLING phase | 7 | Privacy, 2FA, removeOtherAuths sub-steps with 2-day gaps, advancing to identity |
| IDENTITY phase | 7 | Each sub-step, 2-day gaps, advancing to growing |
| GROWING phase | 5 | Below target, at target but early, transitioning to maturing |
| MATURING phase | 2 | Upload photo, advance to ready |
| READY/SESSION_ROTATED | 2 | Terminal states |
| Edge cases | 5 | Unknown phase, null, undefined, migration scenario, channels=undefined |
| Full timeline | 1 | 25-day simulation walking through all phases |
| isAccountReady | 5 | All phase values |
| isAccountWarmingUp | 9 | All phase values including null/undefined |
| gaussianRandom | 5 | Integer output, min/max bounds, distribution centering |
| generateWarmupJitter | 1 | Range [0,3], all values seen in 100 iterations |
| getTimestamp | 5 | null, undefined, empty string, valid date, invalid date string (NaN fix) |

### Running tests

```bash
cd CommonTgService-local
npx jest --config '{"transform":{"^.+\\.tsx?$":"ts-jest"},"testEnvironment":"node"}' 'src/components/shared/__tests__'
```

---

## Migration

### Existing buffer/promote clients

Mongoose handles this gracefully — new fields have defaults:
- `warmupPhase: null` → treated as `enrolled` → `getWarmupPhaseAction` returns `wait` (safe, no action taken)
- `warmupJitter: 0` → no jitter offset
- `enrolledAt: null` → falls back to `createdAt`
- Other new fields: `null` / `0`

### Recommended migration

For accounts that are already warmed up and in active use:

```javascript
// Mark existing active buffer clients as ready
db.bufferClients.updateMany(
  { status: 'active', lastUsed: { $ne: null } },
  { $set: { warmupPhase: 'ready' } }
);

// Mark existing active promote clients as ready
db.promoteClients.updateMany(
  { status: 'active', lastUsed: { $ne: null } },
  { $set: { warmupPhase: 'ready' } }
);

// Copy session from users to promoteClients (for accounts that don't have it)
db.promoteClients.find({ session: { $exists: false } }).forEach(pc => {
  const user = db.users.findOne({ mobile: pc.mobile });
  if (user) {
    db.promoteClients.updateOne(
      { mobile: pc.mobile },
      { $set: { session: user.session } }
    );
  }
});
```

---

## Deployment

1. Deploy code changes to one VM
2. Run migration queries above
3. Monitor logs for warmup phase transitions
4. Verify no `SetPrivacy` calls in health checks (search logs for "SetPrivacy" → should be zero)
5. Verify enrollment only does `getChannelInfo` (search logs for "set2fa" during enrollment → should be zero)
6. Wait 24 hours, check session revocation rates
7. If stable, roll out to remaining VMs
