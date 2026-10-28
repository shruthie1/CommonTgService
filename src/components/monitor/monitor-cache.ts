/**
 * In-memory caches for the monitor.
 *
 * TtlCache: TTL + single-flight per key: concurrent callers for the same key share one load; a failed
 * load is not cached (the next caller retries) and the last good value is kept for stale fallback.
 *
 * SwrCache: stale-while-revalidate + single-flight + hard expiry + bounded LRU.
 *  - fresh (age < freshMs)                → 'hit', served.
 *  - stale (older, but not past expiresAt and not older than maxStaleMs)
 *                                          → 'stale', served immediately; ONE background refresh starts
 *                                            (single-flight); its failure keeps the old value.
 *  - absent / expired                     → 'miss', the caller waits for the load (shared with any load
 *                                            already in flight for the key, foreground or background).
 * `expiresAt` is per entry (e.g. the next IST midnight for closed-day history).
 */
import { withTimeout } from './monitor-util';

export interface CacheHit<T> {
  value: T;
  /** epoch ms when the value was loaded */
  at: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheHit<T>>();
  private readonly inflight = new Map<string, Promise<CacheHit<T>>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxKeys = 50,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get(key: string, load: () => Promise<T>): Promise<CacheHit<T>> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = (async () => {
      try {
        const value = await load();
        const entry = { value, at: this.now() };
        this.set(key, entry);
        return entry;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  /** Last good value regardless of age (stale fallback). */
  last(key: string): CacheHit<T> | undefined {
    return this.entries.get(key);
  }

  private set(key: string, entry: CacheHit<T>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }
}

export type CacheState = 'hit' | 'stale' | 'miss';

export interface SwrResult<T> {
  value: T;
  /** epoch ms when the served value finished loading */
  at: number;
  state: CacheState;
}

interface SwrEntry<T> {
  value: T;
  at: number;
  expiresAt: number;
}

export interface SwrOptions {
  /** Age below which an entry is served without refreshing. */
  freshMs: number;
  /** Age past which an entry is no longer served even as stale (default: never by age). */
  maxStaleMs?: number;
  maxKeys?: number;
  now?: () => number;
  /** Called when a background refresh fails (the old value stays). */
  onBackgroundError?: (key: string, err: unknown) => void;
}

/** `background` = true when the load is a stale-while-revalidate refresh nobody is waiting for. */
export type SwrLoader<T> = (background: boolean) => Promise<T>;

export class SwrCache<T> {
  private readonly entries = new Map<string, SwrEntry<T>>();
  private readonly inflight = new Map<string, Promise<SwrEntry<T>>>();
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(private readonly opts: SwrOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.maxKeys = opts.maxKeys ?? 100;
  }

  /**
   * `expiresAt`: absolute epoch ms after which the entry is never served (default: no expiry).
   * `opts.refresh` (a background snapshot rebuild, nobody waiting): a stale entry is refreshed and
   * awaited instead of served (a failed refresh falls back to the stale value), and loads run at
   * background priority.
   */
  async get(key: string, load: SwrLoader<T>, expiresAt = Number.POSITIVE_INFINITY, opts?: { refresh?: boolean }): Promise<SwrResult<T>> {
    const now = this.now();
    const e = this.entries.get(key);
    const refresh = opts?.refresh === true;
    if (e && (now >= e.expiresAt || now - e.at >= (this.opts.maxStaleMs ?? Number.POSITIVE_INFINITY))) {
      this.entries.delete(key);
    } else if (e) {
      if (now - e.at < this.opts.freshMs) return { value: e.value, at: e.at, state: 'hit' };
      if (refresh) {
        try {
          const fresh = await (this.inflight.get(key) ?? this.start(key, load, expiresAt, true));
          return { value: fresh.value, at: fresh.at, state: 'hit' };
        } catch (err) {
          this.opts.onBackgroundError?.(key, err);
          return { value: e.value, at: e.at, state: 'stale' };
        }
      }
      if (!this.inflight.has(key)) {
        this.start(key, load, expiresAt, true).catch((err) => this.opts.onBackgroundError?.(key, err));
      }
      return { value: e.value, at: e.at, state: 'stale' };
    }
    const pending = this.inflight.get(key) ?? this.start(key, load, expiresAt, refresh);
    const entry = await pending;
    return { value: entry.value, at: entry.at, state: 'miss' };
  }

  /** Number of live entries (tests / ops). */
  get size(): number {
    return this.entries.size;
  }

  private start(key: string, load: SwrLoader<T>, expiresAt: number, background: boolean): Promise<SwrEntry<T>> {
    const p = (async () => {
      try {
        const value = await load(background);
        const entry = { value, at: this.now(), expiresAt };
        this.set(key, entry);
        return entry;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  private set(key: string, entry: SwrEntry<T>): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    const now = this.now();
    for (const [k, v] of this.entries) if (now >= v.expiresAt) this.entries.delete(k);
    while (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }
}

/**
 * Concurrency gate for the module's Postgres queries (its pool has max 2 connections). Foreground
 * work (a viewer is waiting) may use `limit` slots and always goes first; background refreshes are
 * sequenced through `backgroundLimit` slots so a refresh burst never fills the pool ahead of a viewer.
 */
export class ConcurrencyGate {
  private active = 0;
  private activeBg = 0;
  private readonly fg: Array<() => void> = [];
  private readonly bg: Array<() => void> = [];

  constructor(
    private readonly limit = 2,
    private readonly backgroundLimit = 1,
  ) {}

  async run<T>(background: boolean, fn: () => Promise<T>): Promise<T> {
    await this.acquire(background);
    try {
      return await fn();
    } finally {
      this.release(background);
    }
  }

  get pending(): number {
    return this.fg.length + this.bg.length;
  }

  private acquire(background: boolean): Promise<void> {
    if (this.canStart(background)) {
      this.take(background);
      return Promise.resolve();
    }
    return new Promise((resolve) => (background ? this.bg : this.fg).push(resolve));
  }

  private canStart(background: boolean): boolean {
    if (this.active >= this.limit) return false;
    if (!background) return true;
    return this.fg.length === 0 && this.activeBg < this.backgroundLimit;
  }

  private take(background: boolean): void {
    this.active += 1;
    if (background) this.activeBg += 1;
  }

  private release(background: boolean): void {
    this.active -= 1;
    if (background) this.activeBg -= 1;
    if (this.fg.length && this.active < this.limit) {
      this.take(false);
      this.fg.shift()!();
    } else if (this.bg.length && this.canStart(true)) {
      this.take(true);
      this.bg.shift()!();
    }
  }
}

/** Where whole-response snapshots survive a restart (Redis GET / SET key value EX ttl). */
export interface SnapshotStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSec: number): Promise<unknown>;
}

export interface SnapshotOptions<T> {
  /** Age below which a snapshot is served without a rebuild. */
  freshMs: number;
  /** Calendar day of an instant (IST date): a snapshot is served only on the day it was built. */
  day: (now: number) => string;
  store?: SnapshotStore | null;
  keyPrefix?: string;
  /** Redis TTL (default 36 h, so the next boot can tell the monitor was used recently). */
  ttlSec?: number;
  /** Snapshots larger than this are kept in memory only (default 256 KB). */
  maxBytes?: number;
  /** Deadline for one store read (default 500 ms): a slow store never holds a viewer longer. */
  storeDeadlineMs?: number;
  maxKeys?: number;
  /** false = a degraded build (a section failed): returned to its caller, never cached or persisted. */
  complete?: (value: T) => boolean;
  now?: () => number;
  onError?: (what: string, err: unknown) => void;
}

export type SnapshotSource = 'memory' | 'store' | 'build';

export interface SnapshotResult<T> {
  value: T;
  /** epoch ms when the build of this snapshot started (its generatedAt) */
  at: number;
  /** 'hit' fresh, 'stale' served while one background rebuild runs, 'miss' this caller waited for a build */
  state: CacheState;
  source: SnapshotSource;
}

interface SnapEntry<T> {
  value: T;
  at: number;
  day: string;
  source: 'memory' | 'store';
}

interface Built<T> {
  value: T;
  at: number;
  complete: boolean;
}

/**
 * Whole-response snapshots (stale-while-revalidate, single-flight per name), optionally persisted to
 * a store so a restarted process serves the last snapshot instead of making its first viewer wait.
 *  - fresh (age < freshMs)            → served.
 *  - older, same calendar day          → served at once; ONE background rebuild starts.
 *  - none in memory                    → the store is read once per (day, name), within a deadline.
 *  - none at all / another day         → the caller waits for the build (shared with one in flight).
 * A degraded build (complete() false) is returned to its caller but never replaces a snapshot.
 */
export class SnapshotCache<T> {
  private readonly entries = new Map<string, SnapEntry<T>>();
  private readonly inflight = new Map<string, Promise<Built<T>>>();
  private readonly storeReads = new Map<string, Promise<SnapEntry<T> | undefined>>();
  private readonly storeTried = new Set<string>();
  private readonly now: () => number;
  private readonly prefix: string;

  constructor(private readonly opts: SnapshotOptions<T>) {
    this.now = opts.now ?? (() => Date.now());
    this.prefix = opts.keyPrefix ?? 'monitor::snapshot::';
  }

  key(name: string): string {
    return `${this.prefix}${name}`;
  }

  async get(name: string, build: (background: boolean) => Promise<T>): Promise<SnapshotResult<T>> {
    const now = this.now();
    const day = this.opts.day(now);
    let e = this.entries.get(name);
    if (e && e.day !== day) {
      this.entries.delete(name);
      e = undefined;
    }
    if (!e) e = await this.fromStore(name, day);
    if (e) {
      if (now - e.at < this.opts.freshMs) return { value: e.value, at: e.at, state: 'hit', source: e.source };
      this.refresh(name, build).catch((err) => this.opts.onError?.(`rebuild ${name}`, err));
      return { value: e.value, at: e.at, state: 'stale', source: e.source };
    }
    const b = await (this.inflight.get(`${day}|${name}`) ?? this.start(name, build, false));
    return { value: b.value, at: b.at, state: 'miss', source: 'build' };
  }

  /** Rebuilds `name` at background priority; joins a build of the same day already in flight. */
  refresh(name: string, build: (background: boolean) => Promise<T>): Promise<Built<T>> {
    return this.inflight.get(`${this.opts.day(this.now())}|${name}`) ?? this.start(name, build, true);
  }

  /** Loads today's stored snapshots of `names` into memory (boot), so their first viewer is a memory hit. */
  async preload(names: readonly string[]): Promise<number> {
    const day = this.opts.day(this.now());
    const got = await Promise.all(names.filter((n) => !this.entries.has(n)).map((n) => this.fromStore(n, day)));
    return got.filter(Boolean).length;
  }

  /** Day of the stored snapshot for `name`, any day (null = none / store unavailable). */
  async storedDay(name: string): Promise<string | null> {
    const raw = await this.readStore(name);
    return raw?.day ?? null;
  }

  get size(): number {
    return this.entries.size;
  }

  private start(name: string, build: (background: boolean) => Promise<T>, background: boolean): Promise<Built<T>> {
    // in-flight builds are per (day, name): a build started before IST midnight is never joined after it
    const at = this.now();
    const day = this.opts.day(at);
    const k = `${day}|${name}`;
    const p = (async () => {
      try {
        const value = await build(background);
        const complete = this.opts.complete ? this.opts.complete(value) : true;
        const cur = this.entries.get(name);
        if (complete && !(cur && cur.day > day)) {
          this.set(name, { value, at, day, source: 'memory' });
          this.persist(name, value, at, day);
        }
        return { value, at, complete };
      } finally {
        this.inflight.delete(k);
      }
    })();
    this.inflight.set(k, p);
    return p;
  }

  private async readStore(name: string): Promise<{ day: string; at: number; value: T } | null> {
    const store = this.opts.store;
    if (!store) return null;
    try {
      const raw = await withTimeout(Promise.resolve().then(() => store.get(this.key(name))), this.opts.storeDeadlineMs ?? 500, 'snapshot read');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1 || typeof parsed.day !== 'string' || !Number.isFinite(parsed.at) || parsed.value == null) return null;
      return { day: parsed.day, at: parsed.at, value: parsed.value as T };
    } catch (err) {
      this.opts.onError?.(`read ${name}`, err);
      return null;
    }
  }

  /** One store read per (day, name); concurrent first callers share it. */
  private fromStore(name: string, day: string): Promise<SnapEntry<T> | undefined> {
    if (!this.opts.store) return Promise.resolve(undefined);
    const k = `${day}|${name}`;
    const pending = this.storeReads.get(k);
    if (pending) return pending;
    if (this.storeTried.has(k)) return Promise.resolve(undefined);
    if (this.storeTried.size > 1000) this.storeTried.clear();
    this.storeTried.add(k);
    const p = (async () => {
      try {
        const r = await this.readStore(name);
        if (!r || r.day !== day) return undefined;
        const cur = this.entries.get(name);
        if (cur && cur.day === day && cur.at >= r.at) return cur;
        const e: SnapEntry<T> = { value: r.value, at: r.at, day, source: 'store' };
        this.set(name, e);
        return e;
      } finally {
        this.storeReads.delete(k);
      }
    })();
    this.storeReads.set(k, p);
    return p;
  }

  private persist(name: string, value: T, at: number, day: string): void {
    const store = this.opts.store;
    if (!store) return;
    let raw: string;
    try {
      raw = JSON.stringify({ v: 1, day, at, value });
    } catch (err) {
      this.opts.onError?.(`serialize ${name}`, err);
      return;
    }
    if (Buffer.byteLength(raw) > (this.opts.maxBytes ?? 256 * 1024)) {
      this.opts.onError?.(`persist ${name}`, new Error(`snapshot of ${Buffer.byteLength(raw)} bytes not persisted`));
      return;
    }
    Promise.resolve()
      .then(() => store.set(this.key(name), raw, 'EX', this.opts.ttlSec ?? 36 * 3600))
      .catch((err) => this.opts.onError?.(`persist ${name}`, err));
  }

  private set(name: string, entry: SnapEntry<T>): void {
    this.entries.delete(name);
    this.entries.set(name, entry);
    while (this.entries.size > (this.opts.maxKeys ?? 100)) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }
}
