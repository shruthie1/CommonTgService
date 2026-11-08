import { SnapshotCache, SnapshotWarmer, SwrCache } from '../monitor-cache';
import {
  SNAPSHOT_FRESH_MS,
  SNAPSHOT_MAX_SERVE_STALE_MS,
  SNAPSHOT_WARM_DEFAULT_INTERVAL_MS,
  SNAPSHOT_WARM_IGNORE_GAP_MS,
  SNAPSHOT_WARM_LEAD_MS,
  SNAPSHOT_WARM_MARGIN_MS,
  SNAPSHOT_WARM_MAX_INTERVAL_MS,
  SNAPSHOT_WARM_MIN_INTERVAL_MS,
} from '../monitor.service';

// Keep-warm: a page polled every ~63 s (the app's 60 s poll + response time, prod 2026-11-08) must
// find a fresh snapshot, with no more rebuilds than the on-demand stale-while-revalidate path did.

const PAGE = 'fleet:today';
const POLL_MS = 63_000;
const BUILD_MS = 3_000;

/** Awaits `p` while fake time runs (a miss waits for a build that sleeps on a fake timer). */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  let value: T | undefined;
  let error: unknown;
  p.then(
    (v) => ((done = true), (value = v)),
    (e) => ((done = true), (error = e)),
  );
  for (let i = 0; i < 10_000 && !done; i += 1) await jest.advanceTimersByTimeAsync(100);
  if (error) throw error;
  return value as T;
}

function setup(opts: { warm: boolean; buildMs?: number }) {
  let builds = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const cache = new SnapshotCache<any>({
    freshMs: SNAPSHOT_FRESH_MS,
    maxServeStaleMs: SNAPSHOT_MAX_SERVE_STALE_MS,
    day: () => '2026-11-08',
  });
  const build = async () => {
    builds += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, opts.buildMs ?? BUILD_MS));
    concurrent -= 1;
    return { n: builds };
  };
  const warmer = new SnapshotWarmer({
    leadMs: SNAPSHOT_WARM_LEAD_MS,
    defaultIntervalMs: SNAPSHOT_WARM_DEFAULT_INTERVAL_MS,
    minIntervalMs: SNAPSHOT_WARM_MIN_INTERVAL_MS,
    maxIntervalMs: SNAPSHOT_WARM_MAX_INTERVAL_MS,
    ignoreGapMs: SNAPSHOT_WARM_IGNORE_GAP_MS,
    maxKeys: 20,
    needsRebuild: (name, at) => {
      const p = cache.peek(name);
      if (p.building) return false;
      return p.at === null || at + SNAPSHOT_WARM_MARGIN_MS - p.at >= SNAPSHOT_FRESH_MS;
    },
    rebuild: (name) => cache.refresh(name, build),
  });
  /** One app poll: the request, plus the app's 2.5 s follow-up when the answer is stale. */
  const poll = async () => {
    const r = await settle(cache.get(PAGE, build));
    if (opts.warm) warmer.touch(PAGE);
    let requests = 1;
    if (r.state === 'stale') {
      await jest.advanceTimersByTimeAsync(2_500);
      await settle(cache.get(PAGE, build));
      if (opts.warm) warmer.touch(PAGE);
      requests += 1;
    }
    return { state: r.state, ageSec: Math.round((Date.now() - r.at) / 1000), requests };
  };
  return {
    cache,
    warmer,
    poll,
    get builds() {
      return builds;
    },
    get maxConcurrent() {
      return maxConcurrent;
    },
  };
}

/** Runs `n` polls POLL_MS apart (measured start to start). */
async function pollLoop(s: ReturnType<typeof setup>, n: number) {
  const out: Array<{ state: string; ageSec: number; requests: number }> = [];
  for (let i = 0; i < n; i += 1) {
    const t = Date.now();
    out.push(await s.poll());
    await jest.advanceTimersByTimeAsync(Math.max(0, POLL_MS - (Date.now() - t)));
  }
  return out;
}

describe('snapshot keep-warm', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-11-08T05:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('baseline (no warming): every 63 s poll is stale and needs the 2.5 s follow-up', async () => {
    const s = setup({ warm: false });
    const polls = await pollLoop(s, 10);
    expect(polls[0].state).toBe('miss');
    expect(polls.slice(1).map((p) => p.state)).toEqual(Array(9).fill('stale'));
    expect(polls.reduce((a, p) => a + p.requests, 0)).toBe(19);
    expect(s.builds).toBe(10);
  });

  it('a polled snapshot is rebuilt before it goes stale: every poll after the first is a hit, same rebuild count', async () => {
    const s = setup({ warm: true });
    const polls = await pollLoop(s, 10);
    expect(polls[0].state).toBe('miss');
    expect(polls.slice(1).map((p) => p.state)).toEqual(Array(9).fill('hit'));
    // served ~15 s after its build (lead), well inside the 60 s fresh window
    for (const p of polls.slice(1)) expect(p.ageSec).toBeLessThanOrEqual(20);
    expect(polls.reduce((a, p) => a + p.requests, 0)).toBe(10);
    // first build + one warm rebuild per poll cycle (9) = the baseline's 10, plus the one the 10th poll
    // scheduled for the 11th (it ran inside the loop's trailing 63 s; it is the idle test's "at most one")
    expect(s.builds).toBe(11);
    expect(s.maxConcurrent).toBe(1);
  });

  it('a 120 s poller (Chats tab) learns its gap: hits after the second poll, one rebuild per cycle', async () => {
    const s = setup({ warm: true });
    const states: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      states.push((await s.poll()).state);
      await jest.advanceTimersByTimeAsync(120_000);
    }
    // 2nd poll: the default 60 s guess rebuilt at 45 s, so the 120 s poll lands on a 75 s old snapshot
    expect(states).toEqual(['miss', 'stale', 'hit', 'hit', 'hit', 'hit']);
    // first build + default-guess warm + stale rebuild + one warm per later cycle (bounded by poll count)
    expect(s.builds).toBeLessThanOrEqual(1 + 6 + 1);
  });

  it('stops after idle: at most one rebuild after the last poll, then no timers', async () => {
    const s = setup({ warm: true });
    await pollLoop(s, 3);
    const before = s.builds;
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.builds - before).toBeLessThanOrEqual(1);
    expect(s.warmer.pending).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('never overlaps a rebuild already in flight (single-flight per key)', async () => {
    const s = setup({ warm: true, buildMs: 20_000 });
    await s.poll(); // miss, 20 s build
    s.warmer.touch(PAGE); // ignored (within 10 s of the last request)
    await jest.advanceTimersByTimeAsync(61_000);
    // stale poll starts an on-demand rebuild; the warm timer then finds it in flight
    await settle(s.cache.get(PAGE, async () => ({})));
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(s.maxConcurrent).toBe(1);
  });

  it('stop() clears pending timers and no rebuild runs', async () => {
    const s = setup({ warm: true });
    await s.poll();
    expect(s.warmer.pending).toBe(1);
    const before = s.builds;
    s.warmer.stop();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    expect(s.builds).toBe(before);
    s.warmer.touch(PAGE);
    expect(s.warmer.pending).toBe(0);
  });

  it('a snapshot still fresh at the expected poll is not rebuilt', async () => {
    let builds = 0;
    const cache = new SnapshotCache<any>({ freshMs: SNAPSHOT_FRESH_MS, day: () => 'd' });
    const build = async () => ({ n: ++builds });
    const warmer = new SnapshotWarmer({
      leadMs: SNAPSHOT_WARM_LEAD_MS,
      defaultIntervalMs: 30_000,
      minIntervalMs: SNAPSHOT_WARM_MIN_INTERVAL_MS,
      maxIntervalMs: SNAPSHOT_WARM_MAX_INTERVAL_MS,
      ignoreGapMs: SNAPSHOT_WARM_IGNORE_GAP_MS,
      maxKeys: 20,
      needsRebuild: (name, at) => {
        const p = cache.peek(name);
        return !p.building && (p.at === null || at + SNAPSHOT_WARM_MARGIN_MS - p.at >= SNAPSHOT_FRESH_MS);
      },
      rebuild: (name) => cache.refresh(name, build),
    });
    await cache.get(PAGE, build);
    warmer.touch(PAGE); // expected poll at +30 s: snapshot 30 s old then, still fresh
    await jest.advanceTimersByTimeAsync(60_000);
    expect(builds).toBe(1);
  });

  it('bounds tracked pages (oldest dropped with its timer)', () => {
    const warmer = new SnapshotWarmer({
      leadMs: 15_000,
      defaultIntervalMs: 60_000,
      minIntervalMs: 30_000,
      maxIntervalMs: 300_000,
      ignoreGapMs: 10_000,
      maxKeys: 3,
      needsRebuild: () => true,
      rebuild: async () => undefined,
    });
    for (let i = 0; i < 10; i += 1) warmer.touch(`p${i}`);
    expect(warmer.pending).toBe(3);
    expect(jest.getTimerCount()).toBe(3);
    warmer.stop();
  });
});

describe('SwrCache refreshAheadMs', () => {
  it('a background refresh also reloads a part about to go stale; viewers still get the fresh copy', async () => {
    let now = 0;
    let loads = 0;
    const c = new SwrCache<number>({ freshMs: 60_000, now: () => now });
    const load = async () => ++loads;
    await c.get('k', load);
    now = 40_000;
    expect((await c.get('k', load)).state).toBe('hit');
    expect((await c.get('k', load, undefined, { refresh: true })).value).toBe(1);
    expect(loads).toBe(1);
    const r = await c.get('k', load, undefined, { refresh: true, refreshAheadMs: 30_000 });
    expect(r).toMatchObject({ value: 2, state: 'hit' });
    expect(loads).toBe(2);
  });

  it('a failed refresh-ahead keeps the still-fresh value as a hit', async () => {
    let now = 0;
    const c = new SwrCache<number>({ freshMs: 60_000, now: () => now });
    await c.get('k', async () => 1);
    now = 40_000;
    const r = await c.get('k', async () => Promise.reject(new Error('pg down')), undefined, { refresh: true, refreshAheadMs: 30_000 });
    expect(r).toMatchObject({ value: 1, state: 'hit' });
  });
});
