# Aggressive Channel Joining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make channel joining self-sustaining with round-robin distribution and 20 channels/day/account cap, triggered by existing 3-hour HTTP scheduler.

**Architecture:** Add daily join tracking + auto-refill to `BaseClientService`. When `joinChannelMap` drains, `scheduleNextJoinRound()` calls a new `refillJoinQueue()` abstract method instead of stopping. Each subclass implements `refillJoinQueue()` to re-query its model for eligible mobiles. The per-mobile join cap changes from `maxJoinsPerSession` (8, process all at once) to `joinsPerMobilePerRound` (3, then rotate). Warmup phase filter removed from join queries.

**Tech Stack:** TypeScript, NestJS, Mongoose, Jest

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/shared/base-client.service.ts` | Modify | Add config fields, daily counters, `refillJoinQueue()` abstract, modify `scheduleNextJoinRound()` + `processJoinChannelSequentially()` |
| `src/components/buffer-clients/buffer-client.service.ts` | Modify | Implement `refillJoinQueue()`, add `fetchJoinableChannels()`, remove warmup filter, update config |
| `src/components/promote-clients/promote-client.service.ts` | Modify | Same as buffer |
| `src/components/shared/__tests__/service-flows.spec.ts` | Modify | Add tests for round-robin, daily cap, refill, warmup-independent joining |

---

### Task 1: Add Config Fields + Daily Counter State to Base Class

**Files:**
- Modify: `src/components/shared/base-client.service.ts:41-52` (ClientConfig)
- Modify: `src/components/shared/base-client.service.ts:169-193` (class fields)

- [ ] **Step 1: Add new config fields to `ClientConfig` interface**

In `src/components/shared/base-client.service.ts`, add two fields to the `ClientConfig` interface after `clientProcessingDelay`:

```typescript
export interface ClientConfig {
    joinChannelInterval: number;
    leaveChannelInterval: number;
    leaveChannelBatchSize: number;
    channelProcessingDelay: number;
    channelTarget: number;
    maxJoinsPerSession: number;
    maxNewClientsPerTrigger: number;
    minTotalClients: number;
    maxMapSize: number;
    cooldownHours: number;
    clientProcessingDelay: number;
    maxChannelJoinsPerDay: number;
    joinsPerMobilePerRound: number;
}
```

- [ ] **Step 2: Add daily counter state and helper to the base class**

After the `MAX_UPDATES_PER_CYCLE` constant (line ~193), add:

```typescript
    protected dailyJoinCounts: Map<string, number> = new Map();
    protected dailyJoinDate: string = '';

    protected resetDailyJoinCountersIfNeeded(): void {
        const today = ClientHelperUtils.getTodayDateString();
        if (today !== this.dailyJoinDate) {
            this.dailyJoinCounts.clear();
            this.dailyJoinDate = today;
        }
    }

    protected getDailyJoinCount(mobile: string): number {
        this.resetDailyJoinCountersIfNeeded();
        return this.dailyJoinCounts.get(mobile) || 0;
    }

    protected incrementDailyJoinCount(mobile: string): void {
        this.dailyJoinCounts.set(mobile, this.getDailyJoinCount(mobile) + 1);
    }

    protected isMobileDailyCapped(mobile: string): boolean {
        return this.getDailyJoinCount(mobile) >= this.config.maxChannelJoinsPerDay;
    }
```

- [ ] **Step 3: Add `refillJoinQueue()` abstract method**

In the abstract methods section (after `updateStatus`, line ~332), add:

```typescript
    /** Re-query DB for mobiles below channelTarget that haven't hit the daily cap. Populate joinChannelMap. */
    abstract refillJoinQueue(): Promise<number>;
```

- [ ] **Step 4: Add `cleanupIntervalId` for dailyJoinCounts in `cleanup()`**

In the `cleanup()` method (line ~340), add after the existing clears:

```typescript
    this.dailyJoinCounts.clear();
```

- [ ] **Step 5: Update buffer config**

In `src/components/buffer-clients/buffer-client.service.ts`, update the `config` getter (line ~95):

```typescript
    get config(): ClientConfig {
        return {
            joinChannelInterval: 6 * 60 * 1000,
            leaveChannelInterval: 120 * 1000,
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,
            channelTarget: 200,
            maxJoinsPerSession: 8,
            maxNewClientsPerTrigger: 10,
            minTotalClients: 10,
            maxMapSize: 100,
            cooldownHours: 2,
            clientProcessingDelay: 10000,
            maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
        };
    }
```

- [ ] **Step 6: Update promote config**

In `src/components/promote-clients/promote-client.service.ts`, update the `config` getter (line ~94):

```typescript
    get config(): ClientConfig {
        return {
            joinChannelInterval: 6 * 60 * 1000,
            leaveChannelInterval: 60 * 1000,
            leaveChannelBatchSize: 10,
            channelProcessingDelay: 120000,
            channelTarget: 200,
            maxJoinsPerSession: 8,
            maxNewClientsPerTrigger: 10,
            minTotalClients: 12,
            maxMapSize: 100,
            cooldownHours: 2,
            clientProcessingDelay: 8000,
            maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
        };
    }
```

- [ ] **Step 7: Update TestBaseService config in tests**

In `src/components/shared/__tests__/service-flows.spec.ts`, update the `TestBaseService.config` getter (line ~57):

```typescript
    get config(): ClientConfig {
        return {
            joinChannelInterval: 1,
            leaveChannelInterval: 1,
            leaveChannelBatchSize: 1,
            channelProcessingDelay: 1,
            channelTarget: 200,
            maxJoinsPerSession: 1,
            maxNewClientsPerTrigger: 1,
            minTotalClients: 1,
            maxMapSize: 1,
            cooldownHours: 2,
            clientProcessingDelay: 1,
            maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
        };
    }
```

Also add stub `refillJoinQueue` to `TestBaseService` (after `updateStatus` stub, line ~78):

```typescript
    async refillJoinQueue(): Promise<number> { return 0; }
```

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 9: Run existing tests**

Run: `npx jest --testPathPatterns='shared/__tests__' --no-coverage`
Expected: All 81 tests pass

- [ ] **Step 10: Commit**

```bash
git add src/components/shared/base-client.service.ts src/components/buffer-clients/buffer-client.service.ts src/components/promote-clients/promote-client.service.ts src/components/shared/__tests__/service-flows.spec.ts
git commit -m "feat: add daily join counter state and config for aggressive channel joining"
```

---

### Task 2: Modify `processJoinChannelSequentially()` for Round-Robin + Daily Cap

**Files:**
- Modify: `src/components/shared/base-client.service.ts:1082-1187`

- [ ] **Step 1: Write failing test for round-robin behavior**

In `src/components/shared/__tests__/service-flows.spec.ts`, add at the end of the `describe('Service flow reliability')` block:

```typescript
    test('processJoinChannelSequentially uses round-robin: each mobile gets joinsPerMobilePerRound before rotating', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])), updateOne: jest.fn().mockResolvedValue({}) };
        const service = new TestBaseService(mockModel);

        // Override config to allow more joins for this test
        jest.spyOn(service, 'config', 'get').mockReturnValue({
            ...service.config,
            maxJoinsPerSession: 10,
            joinsPerMobilePerRound: 2,
            maxChannelJoinsPerDay: 20,
            maxMapSize: 100,
        });

        const joinOrder: string[] = [];
        jest.spyOn(service as any, 'telegramService', 'get').mockReturnValue({
            tryJoiningChannel: jest.fn(async (mobile: string) => { joinOrder.push(mobile); }),
            getChannelInfo: jest.fn(),
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(service as any, 'activeChannelsService', 'get').mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

        // Give mobile-A 5 channels and mobile-B 5 channels
        (service as any).joinChannelMap.set('mobile-A', [
            { channelId: 'a1', username: 'a1' }, { channelId: 'a2', username: 'a2' },
            { channelId: 'a3', username: 'a3' }, { channelId: 'a4', username: 'a4' },
            { channelId: 'a5', username: 'a5' },
        ]);
        (service as any).joinChannelMap.set('mobile-B', [
            { channelId: 'b1', username: 'b1' }, { channelId: 'b2', username: 'b2' },
            { channelId: 'b3', username: 'b3' }, { channelId: 'b4', username: 'b4' },
            { channelId: 'b5', username: 'b5' },
        ]);

        await (service as any).processJoinChannelSequentially();

        // With joinsPerMobilePerRound=2: A gets 2, then B gets 2, then done for this round
        // Remaining channels stay in map for next round
        expect(joinOrder).toEqual(['mobile-A', 'mobile-A', 'mobile-B', 'mobile-B']);
        // Both should still have channels remaining
        expect((service as any).joinChannelMap.get('mobile-A')?.length).toBe(3);
        expect((service as any).joinChannelMap.get('mobile-B')?.length).toBe(3);
    });
```

- [ ] **Step 2: Write failing test for daily cap enforcement**

```typescript
    test('processJoinChannelSequentially skips mobiles that hit daily cap', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])), updateOne: jest.fn().mockResolvedValue({}) };
        const service = new TestBaseService(mockModel);

        jest.spyOn(service, 'config', 'get').mockReturnValue({
            ...service.config,
            maxJoinsPerSession: 10,
            joinsPerMobilePerRound: 5,
            maxChannelJoinsPerDay: 2,
            maxMapSize: 100,
        });

        const joinOrder: string[] = [];
        jest.spyOn(service as any, 'telegramService', 'get').mockReturnValue({
            tryJoiningChannel: jest.fn(async (mobile: string) => { joinOrder.push(mobile); }),
            getChannelInfo: jest.fn(),
        });
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(service as any, 'activeChannelsService', 'get').mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) });

        (service as any).joinChannelMap.set('capped-mobile', [
            { channelId: 'c1', username: 'c1' }, { channelId: 'c2', username: 'c2' },
            { channelId: 'c3', username: 'c3' },
        ]);
        (service as any).joinChannelMap.set('fresh-mobile', [
            { channelId: 'f1', username: 'f1' }, { channelId: 'f2', username: 'f2' },
        ]);

        // Pre-set capped-mobile to daily cap
        (service as any).dailyJoinCounts.set('capped-mobile', 2);
        (service as any).dailyJoinDate = ClientHelperUtils.getTodayDateString();

        await (service as any).processJoinChannelSequentially();

        // capped-mobile should be skipped entirely, fresh-mobile gets its joins
        expect(joinOrder).toEqual(['fresh-mobile', 'fresh-mobile']);
        // capped-mobile removed from map (daily cap reached)
        expect((service as any).joinChannelMap.has('capped-mobile')).toBe(false);
    });
```

Add import at top of test file if not present:
```typescript
import { ClientHelperUtils } from '../client-helper.utils';
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest --testPathPatterns='shared/__tests__/service-flows' --no-coverage`
Expected: The 2 new tests FAIL (current code doesn't have round-robin or daily cap logic)

- [ ] **Step 4: Implement the modified `processJoinChannelSequentially()`**

Replace the entire method in `src/components/shared/base-client.service.ts` (lines 1082-1187):

```typescript
    /**
     * Round-robin channel joining with human-like pacing:
     * - Each mobile gets joinsPerMobilePerRound (3) joins before rotating to the next
     * - Daily cap of maxChannelJoinsPerDay (20) per mobile
     * - 90-180s between joins (Gaussian)
     * - Organic activity interleaved every 2-3 joins
     */
    protected async processJoinChannelSequentially() {
        this.resetDailyJoinCountersIfNeeded();

        const keys = Array.from(this.joinChannelMap.keys());
        this.logger.debug(`Processing join channel queue for ${keys.length} clients (round-robin, ${this.config.joinsPerMobilePerRound}/mobile)`);

        for (let i = 0; i < keys.length; i++) {
            const mobile = keys[i];
            let currentChannel: Channel | ActiveChannel | null = null;
            let joinCount = 0;

            // Daily cap check — skip and remove if already at limit
            if (this.isMobileDailyCapped(mobile)) {
                this.logger.debug(`${mobile} hit daily cap (${this.config.maxChannelJoinsPerDay}), removing from queue`);
                this.removeFromJoinMap(mobile);
                continue;
            }

            try {
                const channels = this.joinChannelMap.get(mobile);
                if (!channels || channels.length === 0) {
                    this.removeFromJoinMap(mobile);
                    continue;
                }

                const roundLimit = Math.min(
                    this.config.joinsPerMobilePerRound,
                    this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(mobile),
                    channels.length,
                );

                while (joinCount < roundLimit) {
                    currentChannel = channels.shift();
                    if (!currentChannel) break;

                    this.joinChannelMap.set(mobile, channels);
                    this.logger.debug(`${mobile} joining @${currentChannel.username} (${channels.length} remaining)`);

                    // Check if channel is banned
                    let activeChannel: ActiveChannel | null = null;
                    try {
                        activeChannel = await this.activeChannelsService.findOne(currentChannel.channelId);
                    } catch { /* ignore */ }

                    if (activeChannel && (activeChannel.banned === true || (activeChannel.deletedCount && activeChannel.deletedCount > 0))) {
                        this.logger.debug(`Skipping banned/deleted channel ${currentChannel.channelId}`);
                        await sleep(5000 + Math.random() * 3000);
                        continue;
                    }

                    await this.telegramService.tryJoiningChannel(mobile, currentChannel);
                    joinCount++;
                    this.incrementDailyJoinCount(mobile);

                    // Organic interleaving every 2-3 joins
                    if (joinCount > 0 && joinCount % (2 + Math.floor(Math.random() * 2)) === 0) {
                        try {
                            const client = await connectionManager.getClient(mobile, { autoDisconnect: false, handler: false });
                            await performOrganicActivity(client, 'light');
                        } catch {
                            // Non-fatal
                        }
                    }

                    // Human-like delay between joins: Gaussian mean=120s, stddev=30s, min=90s, max=180s
                    if (joinCount < roundLimit && channels.length > 0) {
                        const delay = ClientHelperUtils.gaussianRandom(120000, 30000, 90000, 180000);
                        await sleep(delay);
                    }
                }

                // Increment channel count by successful joins (no extra TG API call)
                if (joinCount > 0) {
                    try {
                        await this.model.updateOne({ mobile }, { $inc: { channels: joinCount } });
                    } catch {
                        // Non-fatal — count will be corrected on next health check
                    }
                }

                // Remove from map if empty or daily-capped; otherwise leave for next round
                if (channels.length === 0 || this.isMobileDailyCapped(mobile)) {
                    this.removeFromJoinMap(mobile);
                }
            } catch (error: any) {
                const errorDetails = this.handleError(
                    error,
                    `${mobile} ${currentChannel ? `@${currentChannel.username}` : ''} Join Channel Error`,
                    mobile,
                );

                if (errorDetails.error === 'FloodWaitError' || error.errorMessage === 'CHANNELS_TOO_MUCH') {
                    this.logger.warn(`${mobile} FloodWaitError or too many channels, removing from queue`);
                    this.removeFromJoinMap(mobile);

                    await sleep(10000 + Math.random() * 5000);
                    try {
                        const channelsInfo = await this.telegramService.getChannelInfo(mobile, true);
                        await this.update(mobile, { channels: channelsInfo.ids.length });
                    } catch {
                        if (error.errorMessage === 'CHANNELS_TOO_MUCH') {
                            await this.update(mobile, { channels: 500 });
                        }
                    }
                }

                if (isPermanentError(errorDetails)) {
                    this.removeFromJoinMap(mobile);
                    const reason = await this.buildPermanentAccountReason(errorDetails.message);
                    await this.markAsInactive(mobile, reason);
                }
            } finally {
                await this.safeUnregisterClient(mobile);

                if (i < keys.length - 1) {
                    await sleep(this.config.clientProcessingDelay + Math.random() * 5000);
                }
            }
        }
    }
```

- [ ] **Step 5: Run tests**

Run: `npx jest --testPathPatterns='shared/__tests__/service-flows' --no-coverage`
Expected: All tests pass including the 2 new ones

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/base-client.service.ts src/components/shared/__tests__/service-flows.spec.ts
git commit -m "feat: round-robin processJoinChannelSequentially with daily cap"
```

---

### Task 3: Modify `scheduleNextJoinRound()` to Auto-Refill

**Files:**
- Modify: `src/components/shared/base-client.service.ts:1042-1054`

- [ ] **Step 1: Write failing test for auto-refill on empty map**

In `service-flows.spec.ts`:

```typescript
    test('scheduleNextJoinRound calls refillJoinQueue when map is empty and continues if refill adds mobiles', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])) };
        const service = new TestBaseService(mockModel);

        let refillCalled = false;
        jest.spyOn(service, 'refillJoinQueue').mockImplementation(async () => {
            refillCalled = true;
            // Simulate refill adding a mobile
            (service as any).joinChannelMap.set('refilled-mobile', [{ channelId: 'r1', username: 'r1' }]);
            return 1;
        });

        const createTimeoutSpy = jest.spyOn(service as any, 'createTimeout').mockReturnValue(setTimeout(() => {}, 0));

        // Map is empty — should trigger refill
        (service as any).scheduleNextJoinRound();

        // Wait for the async refill
        await new Promise(resolve => setImmediate(resolve));

        expect(refillCalled).toBe(true);
        // Should have scheduled a processing round (createTimeout called with processJoinChannelInterval)
        expect(createTimeoutSpy).toHaveBeenCalled();
    });

    test('scheduleNextJoinRound stops when refillJoinQueue returns 0', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])) };
        const service = new TestBaseService(mockModel);

        jest.spyOn(service, 'refillJoinQueue').mockResolvedValue(0);
        const clearSpy = jest.spyOn(service as any, 'clearJoinChannelInterval');

        (service as any).scheduleNextJoinRound();
        await new Promise(resolve => setImmediate(resolve));

        expect(clearSpy).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --testPathPatterns='shared/__tests__/service-flows' --no-coverage`
Expected: New tests FAIL

- [ ] **Step 3: Implement modified `scheduleNextJoinRound()`**

Replace the method in `base-client.service.ts` (lines ~1042-1054):

```typescript
    /**
     * Schedule the next join processing round with randomized delay.
     * When map is empty, attempts to refill from DB before stopping.
     */
    private async scheduleNextJoinRound() {
        if (this.joinChannelMap.size === 0) {
            try {
                const refilled = await this.refillJoinQueue();
                if (refilled === 0) {
                    this.logger.debug('No eligible mobiles for channel joining — stopping until next trigger');
                    this.clearJoinChannelInterval();
                    return;
                }
                this.logger.log(`Refilled join queue with ${refilled} mobiles`);
            } catch (error) {
                this.logger.error('Error refilling join queue', error);
                this.clearJoinChannelInterval();
                return;
            }
        }

        const baseInterval = this.config.joinChannelInterval;
        const jitter = ClientHelperUtils.gaussianRandom(0, baseInterval * 0.25, -baseInterval * 0.5, baseInterval * 0.5);
        const delay = Math.max(60000, baseInterval + jitter);
        this.joinChannelIntervalId = this.createTimeout(async () => {
            await this.processJoinChannelInterval();
        }, delay);
    }
```

Also update `processJoinChannelInterval()` — since `scheduleNextJoinRound` is now async, the `finally` block needs adjustment:

```typescript
    protected async processJoinChannelInterval() {
        if (this.isJoinChannelProcessing) return;

        if (this.joinChannelMap.size === 0) {
            // Let scheduleNextJoinRound handle the refill logic
            await this.scheduleNextJoinRound();
            return;
        }

        this.isJoinChannelProcessing = true;
        try {
            await this.processJoinChannelSequentially();
        } catch (error) {
            this.logger.error('Error in join channel queue', error);
        } finally {
            this.isJoinChannelProcessing = false;
            await this.scheduleNextJoinRound();
        }
    }
```

- [ ] **Step 4: Run tests**

Run: `npx jest --testPathPatterns='shared/__tests__/service-flows' --no-coverage`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/base-client.service.ts src/components/shared/__tests__/service-flows.spec.ts
git commit -m "feat: auto-refill joinChannelMap when empty instead of stopping"
```

---

### Task 4: Implement `refillJoinQueue()` in BufferClientService

**Files:**
- Modify: `src/components/buffer-clients/buffer-client.service.ts`

- [ ] **Step 1: Add `fetchJoinableChannels()` helper**

Add this private method near the other channel-related methods in `buffer-client.service.ts`:

```typescript
    private async fetchJoinableChannels(currentChannels: number, limit: number): Promise<(Channel | ActiveChannel)[]> {
        const capped = Math.min(limit, 25);
        if (capped <= 0) return [];
        return currentChannels < 220
            ? this.activeChannelsService.getActiveChannels(capped, 0, [])
            : this.channelsService.getActiveChannels(capped, 0, []);
    }
```

- [ ] **Step 2: Implement `refillJoinQueue()`**

Add this method to `BufferClientService`:

```typescript
    async refillJoinQueue(): Promise<number> {
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) return 0;
        if (this.telegramService.getActiveClientSetup()) return 0;

        this.resetDailyJoinCountersIfNeeded();

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
            if (this.isMobileDailyCapped(doc.mobile)) continue;

            const remaining = this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(doc.mobile);
            const channelsToJoin = await this.fetchJoinableChannels(doc.channels, remaining);
            if (channelsToJoin.length === 0) continue;

            if (this.safeSetJoinChannelMap(doc.mobile, channelsToJoin)) {
                added++;
            }
        }

        if (added > 0) {
            this.logger.log(`Refilled join queue with ${added} buffer clients`);
        }

        return added;
    }
```

- [ ] **Step 3: Remove warmup phase filter from `joinchannelForBufferClients()`**

In the query at line ~521-526, remove the `warmupPhase` line:

```typescript
        const query: Record<string, any> = {
            channels: { $lt: this.config.channelTarget },
            mobile: { $nin: Array.from(preservedMobiles) },
            status: 'active',
        };
```

Also remove the `limit(8)` — let the refill mechanism handle throughput. Change to a larger batch since we're now doing round-robin:

```typescript
        const clients = await this.bufferClientModel.find(query).sort({ channels: 1 }).limit(this.config.maxMapSize);
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 5: Run tests**

Run: `npx jest --testPathPatterns='shared/__tests__' --no-coverage`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/buffer-clients/buffer-client.service.ts
git commit -m "feat: implement refillJoinQueue and remove warmup filter for buffer clients"
```

---

### Task 5: Implement `refillJoinQueue()` in PromoteClientService

**Files:**
- Modify: `src/components/promote-clients/promote-client.service.ts`

- [ ] **Step 1: Add `fetchJoinableChannels()` helper**

```typescript
    private async fetchJoinableChannels(currentChannels: number, limit: number): Promise<(Channel | ActiveChannel)[]> {
        const capped = Math.min(limit, 25);
        if (capped <= 0) return [];
        return currentChannels < 220
            ? this.activeChannelsService.getActiveChannels(capped, 0, [])
            : this.channelsService.getActiveChannels(capped, 0, []);
    }
```

- [ ] **Step 2: Implement `refillJoinQueue()`**

```typescript
    async refillJoinQueue(): Promise<number> {
        if (this.isJoinChannelProcessing || this.isLeaveChannelProcessing) return 0;
        if (this.telegramService.getActiveClientSetup()) return 0;

        this.resetDailyJoinCountersIfNeeded();

        const eligible = await this.promoteClientModel
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
            if (this.isMobileDailyCapped(doc.mobile)) continue;

            const remaining = this.config.maxChannelJoinsPerDay - this.getDailyJoinCount(doc.mobile);
            const channelsToJoin = await this.fetchJoinableChannels(doc.channels, remaining);
            if (channelsToJoin.length === 0) continue;

            if (this.safeSetJoinChannelMap(doc.mobile, channelsToJoin)) {
                added++;
            }
        }

        if (added > 0) {
            this.logger.log(`Refilled join queue with ${added} promote clients`);
        }

        return added;
    }
```

- [ ] **Step 3: Remove warmup phase filter from `joinchannelForPromoteClients()`**

In the query at line ~419-427, remove the `warmupPhase` line and increase limit:

```typescript
            const clients = await this.promoteClientModel
                .find({
                    channels: { $lt: this.config.channelTarget },
                    mobile: { $nin: Array.from(preservedMobiles) },
                    status: 'active',
                })
                .sort({ channels: 1 })
                .limit(this.config.maxMapSize);
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 5: Run tests**

Run: `npx jest --testPathPatterns='shared/__tests__' --no-coverage`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/promote-clients/promote-client.service.ts
git commit -m "feat: implement refillJoinQueue and remove warmup filter for promote clients"
```

---

### Task 6: Update Existing Join Channel Tests

**Files:**
- Modify: `src/components/shared/__tests__/service-flows.spec.ts`

- [ ] **Step 1: Update the warmup phase filter test**

The test `'buffer join query only targets warmup phases that are allowed to join'` (line ~496 area) currently asserts that the query includes `warmupPhase: { $in: [...] }`. Since we removed the warmup filter, update the test:

```typescript
    test('buffer join query targets any active client below channel target (warmup-independent)', async () => {
        let capturedQuery: Record<string, any> | undefined;
        const bufferModel: any = {
            find: jest.fn((query: Record<string, any>) => {
                capturedQuery = query;
                return { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
            }),
        };

        const service = makeBufferService(bufferModel);
        jest.spyOn(service as any, 'clearJoinChannelInterval').mockImplementation(() => {});
        jest.spyOn(service as any, 'clearLeaveChannelInterval').mockImplementation(() => {});

        await service.joinchannelForBufferClients(false);

        expect(capturedQuery).toBeDefined();
        expect(capturedQuery?.status).toBe('active');
        expect(capturedQuery?.channels).toEqual({ $lt: 200 });
        // No warmup phase filter — any active client is eligible
        expect(capturedQuery?.warmupPhase).toBeUndefined();
    });
```

- [ ] **Step 2: Run all tests**

Run: `npx jest --testPathPatterns='shared/__tests__' --no-coverage`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/__tests__/service-flows.spec.ts
git commit -m "test: update join channel tests for warmup-independent aggressive joining"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full type check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Full test suite**

Run: `npx jest --testPathPatterns='shared/__tests__' --no-coverage`
Expected: All tests pass (original 81 + new tests)

- [ ] **Step 3: Review the flow end-to-end**

Verify mentally:
1. HTTP trigger calls `joinchannelForBufferClients()` → populates map (no warmup filter) → calls `joinChannelQueue()`
2. `joinChannelQueue()` → `scheduleNextJoinRound()` → schedules `processJoinChannelInterval()`
3. `processJoinChannelInterval()` → `processJoinChannelSequentially()` (round-robin, 3 per mobile, daily cap 20)
4. After processing → `scheduleNextJoinRound()` → map empty? → `refillJoinQueue()` → finds more eligible → repopulates → continues
5. Eventually all mobiles capped or at target → `refillJoinQueue()` returns 0 → loop stops
6. Next HTTP trigger (3h later) restarts the cycle

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: aggressive self-sustaining channel joining with round-robin and 20/day cap"
```
