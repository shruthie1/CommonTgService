# Aggressive Channel Joining — Self-Sustaining Round-Robin Loop

## Problem

Channel joining is triggered by an HTTP call every 3 hours. Each trigger fills the `joinChannelMap` once, processes it (max 8 joins per mobile), then the loop stops and waits for the next trigger. With 8 triggers/day and 8 joins per trigger, the theoretical max is 64 channels/day — but in practice much less because:

1. The query `limit(8)` only picks 8 mobiles per trigger, starving the rest
2. Once the map drains, the loop stops — no refill until the next HTTP trigger
3. The join query filters by `warmupPhase: { $in: ['growing', 'maturing', 'ready', 'session_rotated'] }`, excluding earlier phases

## Goal

Every active account below `channelTarget` (200) joins **up to 20 channels per day**, distributed via round-robin. The 3-hour HTTP trigger starts a loop that **keeps running until all eligible mobiles are daily-capped or at target**, then stops and waits for the next trigger.

## Design

### Core Concept

Change the behavior **after the `joinChannelMap` drains**: instead of stopping, auto-refill from DB and continue. The loop runs until there's nothing left to do (all capped or at target), then exits cleanly. The next 3-hour HTTP trigger restarts it.

```
HTTP trigger (every 3h)
    ↓
joinchannelFor*Clients() → populates joinChannelMap
    ↓
joinChannelQueue() → processJoinChannelSequentially() [round-robin, 3 per mobile]
    ↓ (map drains)
scheduleNextJoinRound()
    ↓
map empty? → refillJoinQueue()
    ├── mobiles found → repopulate map → continue processing
    └── none found (all capped/at target) → stop. Wait for next HTTP trigger.
```

### Changes by File

#### 1. `base-client.service.ts`

**New config fields:**
```typescript
interface ClientConfig {
    // ... existing fields ...
    maxChannelJoinsPerDay: number;       // 20
    joinsPerMobilePerRound: number;      // 3
}
```

**New in-memory state:**
```typescript
protected dailyJoinCounts: Map<string, number> = new Map();
protected dailyJoinDate: string = '';
```

**New abstract method:**
```typescript
abstract refillJoinQueue(): Promise<number>;
```
Each subclass queries its own model for active accounts below `channelTarget` that haven't hit the daily cap, fetches channels to join, and populates the map. Returns count of mobiles added.

**Modified `scheduleNextJoinRound()`:**

Current: if map empty → `clearJoinChannelInterval()` → stop.

New:
```
if map empty:
    count = await refillJoinQueue()
    if count === 0:
        clearJoinChannelInterval()  // genuinely done — stop until next HTTP trigger
        return
    // else: map repopulated, schedule next round
schedule processJoinChannelInterval() after jittered delay (same as current)
```

**Modified `processJoinChannelSequentially()` — round-robin:**

Current: each mobile gets up to `maxJoinsPerSession` (8) joins before moving to the next.

New:
- Each mobile gets at most `joinsPerMobilePerRound` (3) joins per round
- After 3 joins, move to the next mobile (leave remaining channels in the map)
- Check daily cap before each mobile: skip if `dailyJoinCounts >= maxChannelJoinsPerDay`
- Remove from map when: channel array empty OR daily cap reached
- Daily counter reset at start of method if date changed

The inter-join delay (90-180s Gaussian) and organic activity interleaving (every 2-3 joins) remain unchanged within each mobile's 3-join batch.

**Daily counter reset:**
```typescript
const today = ClientHelperUtils.getTodayDateString();
if (today !== this.dailyJoinDate) {
    this.dailyJoinCounts.clear();
    this.dailyJoinDate = today;
}
```

**Daily counter increment:**
Inside the join loop, after each successful `tryJoiningChannel`:
```typescript
this.dailyJoinCounts.set(mobile, (this.dailyJoinCounts.get(mobile) || 0) + 1);
```

**`$inc` channel count:** Already exists post-loop per mobile. No change.

#### 2. `buffer-client.service.ts`

**Implement `refillJoinQueue()`:**

```typescript
async refillJoinQueue(): Promise<number> {
    if (this.isJoinChannelProcessing) return 0;

    this.resetDailyCountersIfNeeded();

    // NO warmup phase filter — any active account below target is eligible
    const eligible = await this.bufferClientModel
        .find({
            status: 'active',
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(this.joinChannelMap.keys()) },
        })
        .sort({ channels: 1 })
        .limit(this.config.maxMapSize)
        .exec();

    let added = 0;
    for (const doc of eligible) {
        const dailyCount = this.dailyJoinCounts.get(doc.mobile) || 0;
        if (dailyCount >= this.config.maxChannelJoinsPerDay) continue;

        const remaining = this.config.maxChannelJoinsPerDay - dailyCount;
        const channelsToJoin = await this.fetchJoinableChannels(doc.channels, remaining);
        if (channelsToJoin.length === 0) continue;

        if (this.safeSetJoinChannelMap(doc.mobile, channelsToJoin)) added++;
    }

    return added;
}
```

**Extract `fetchJoinableChannels()`** — lightweight channel fetch (no TG connection):
```typescript
private async fetchJoinableChannels(
    currentChannels: number,
    limit: number,
): Promise<(Channel | ActiveChannel)[]> {
    const source = currentChannels < 220
        ? this.activeChannelsService
        : this.channelsService;
    return source.getActiveChannels(Math.min(limit, 25), 0, []);
}
```

No `excludedIds` (would require TG call). `tryJoiningChannel` handles already-joined channels gracefully.

**Modify `joinchannelForBufferClients()` — warmup filter removed:**
```typescript
// OLD:
warmupPhase: { $in: ['growing', 'maturing', 'ready', 'session_rotated'] },

// NEW: removed — any active account below channelTarget joins
```

The existing method continues to work as the HTTP entry point. It does the full flow (TG connection for real channel count, proper excludedIds). The `refillJoinQueue` is the lightweight refill for between triggers.

#### 3. `promote-client.service.ts`

Same pattern as buffer — implement `refillJoinQueue()` and `fetchJoinableChannels()` querying `promoteClientModel`.

Remove warmup phase filter from `joinchannelForPromoteClients()` query.

#### 4. Config values

| Config | Buffer | Promote |
|--------|--------|---------|
| `maxChannelJoinsPerDay` | 20 | 20 |
| `joinsPerMobilePerRound` | 3 | 3 |
| `joinChannelInterval` | 6 min (unchanged) | 6 min (unchanged) |
| `maxJoinsPerSession` | 8 (unchanged, safety ceiling) | 8 (unchanged) |

### Timing Analysis

**HTTP trigger fires every 3 hours → 8 times/day.**

With 20 mobiles at 50 channels each:
- Trigger fires → `joinchannelFor*Clients()` populates map with ~20 mobiles
- Round 1: 20 mobiles × 3 joins × ~120s = ~2 hours
- Map drains → `refillJoinQueue()` → finds same 20 mobiles still below target, re-adds those not yet capped
- Round 2: continues for remaining daily capacity
- After ~7 rounds per mobile (3 × 7 = 21, capped at 20): all mobiles capped → loop stops
- Total active time: ~3-4 hours per trigger (overlaps with next trigger safely — `isJoinChannelProcessing` guard prevents double-processing)

Each mobile gets 20 channels/day. 200 channels reached in **10 days** from zero.

**With 50 mobiles:**
- More mobiles = longer rounds but same daily cap per mobile
- Round 1: 50 × 3 × 120s = ~5 hours
- The loop will span across multiple HTTP triggers, but the processing guard prevents overlap
- Each mobile still gets 20/day via round-robin

### Interaction with HTTP Trigger

The 3-hour HTTP trigger calls `joinchannelForBufferClients(skipExisting=true)`:
1. `prepareJoinChannelRefresh(true)` preserves mobiles with remaining channels
2. Re-queries DB for new eligible mobiles
3. Adds them to the map alongside preserved ones
4. `joinChannelQueue()` sees the map is populated and schedules processing

If the previous loop is still running (`isJoinChannelProcessing = true`), the HTTP trigger returns early with "Join/leave still processing, skipped". The running loop continues uninterrupted.

If the previous loop finished (all capped), the trigger restarts it — useful after midnight when daily counters would have reset, or when new accounts were enrolled since the last run.

### What Does NOT Change

- Per-join delay: 90-180s Gaussian
- Organic activity interleaving every 2-3 joins
- FloodWait/permanent error handling
- `safeSetJoinChannelMap` max map size (100)
- `tryJoiningChannel` logic
- Leave channel queue behavior
- Channel count increment via `$inc`
- Health check channel count correction
- HTTP trigger endpoint behavior (still works, still callable manually)

### Edge Cases

1. **Account banned mid-loop:** Removed from map via `markAsInactive`. Next refill skips it.

2. **FloodWaitError:** Mobile removed from map. Next refill re-adds it (still below target). Daily counter preserves the count — won't exceed 20.

3. **All at target:** `refillJoinQueue()` returns 0. Loop stops. Next HTTP trigger restarts it (picks up newly enrolled accounts or accounts whose channels dropped).

4. **Service restart:** Daily counters reset (in-memory). Worst case: up to 20 extra joins on restart day. Well within Telegram tolerance.

5. **Midnight rollover:** Daily counters clear on first `processJoinChannelSequentially()` call of the new day. If loop is running at midnight, it continues with fresh counters — accounts get a new batch of 20.

6. **HTTP trigger while loop running:** Returns "still processing." No duplicate processing.

7. **No channels available to join (activeChannelsService returns empty):** Mobile gets empty channel array → not added to map. `refillJoinQueue` returns 0 for that mobile. Loop continues with other mobiles.
