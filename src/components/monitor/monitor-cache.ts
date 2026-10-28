/**
 * In-memory TTL cache with single-flight per key: concurrent callers for the same key share one
 * load; a failed load is not cached (the next caller retries) and the last good value is kept for
 * stale fallback.
 */
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
