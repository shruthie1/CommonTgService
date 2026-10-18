import { sendNoticeBatched } from './notice-batch';
import type { RichNotificationInput } from './rich-message';

/**
 * Notice digest. Clients (and CMS code) queue routine per-client notices in Redis lists
 * `notice-digest::<category>::<key>` (opt-in via RichNotificationInput.digest); the flusher, which
 * runs only in the process that owns the UMS scheduler, drains each list and posts ONE table per
 * list. tg-core's notice-digest.ts is the producer side and shares these constants.
 *
 * Bounds: list capped at DIGEST_LIST_CAP entries (LTRIM), entry <= 4 KB, key TTL 24 h, lock 120 s,
 * at most MAX_KEYS_PER_RUN lists per run, at most MAX_COLUMNS columns per table.
 */
export const DIGEST_PREFIX = 'notice-digest::';
export const DIGEST_ALIVE_KEY = 'notice-digest::flusher-alive';
export const DIGEST_ALIVE_TTL_S = 900;
export const DIGEST_LIST_CAP = 2000;
export const DIGEST_ENTRY_MAX_BYTES = 4096;
export const DIGEST_TTL_S = 24 * 60 * 60;
export const DIGEST_LOCK_PREFIX = 'notice-digest-lock::';
export const DIGEST_LOCK_TTL_S = 120;
export const FLUSHING_MARK = '::flushing::';
const MAX_KEYS_PER_RUN = 200;
const MAX_COLUMNS = 20;
const SCAN_COUNT = 100;
/** A list is posted once nothing new arrived for QUIET_MS, or its oldest entry is MAX_AGE_MS old. */
export const DIGEST_QUIET_MS = 4 * 60 * 1000;
export const DIGEST_MAX_AGE_MS = 60 * 60 * 1000;
/** A failed or unknown-category list is put back this many times before its entries are dropped. */
const MAX_REQUEUES = 1;

export interface DigestEntry {
    clientId: string;
    at: number;
    title: string;
    row: Record<string, string | number>;
    summary?: string;
    retry?: number;
    /** How a client's repeated rows collapse into its one row: 'last' (snapshots, default) or 'sum' (counters). */
    merge?: 'sum' | 'last';
    /** Quiet window for this list (default DIGEST_QUIET_MS), read from the newest entry. */
    quietMs?: number;
    /** Column to order rows by, descending (default: the first numeric column). Read from the newest entry. */
    sortBy?: string;
}

/** The ioredis subset the digest needs (kept narrow so tests can use an in-memory fake). */
export interface DigestRedis {
    set(key: string, value: string, ...args: any[]): Promise<unknown>;
    scan(cursor: string, ...args: any[]): Promise<[string, string[]]>;
    rename(from: string, to: string): Promise<unknown>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    lindex(key: string, index: number): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
    multi(): {
        rpush(key: string, ...values: string[]): any;
        ltrim(key: string, start: number, stop: number): any;
        expire(key: string, seconds: number): any;
        exec(): Promise<Array<[Error | null, unknown]> | null>;
    };
}

export type DigestSend = (category: string, input: RichNotificationInput) => Promise<boolean>;

const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Queue entries (CMS-side producer). Returns false on any problem so the caller can send directly. */
export async function pushDigestEntries(
    redis: DigestRedis,
    category: string,
    key: string,
    entries: Array<Omit<DigestEntry, 'at'> & { at?: number }>,
): Promise<boolean> {
    try {
        if (!KEY_PATTERN.test(category) || !KEY_PATTERN.test(key) || entries.length === 0) return false;
        const listKey = `${DIGEST_PREFIX}${category}::${key}`;
        const tx = redis.multi();
        for (const entry of entries) {
            const json = JSON.stringify({ ...entry, at: entry.at ?? Date.now() });
            if (Buffer.byteLength(json) > DIGEST_ENTRY_MAX_BYTES) return false;
            tx.rpush(listKey, json);
        }
        tx.ltrim(listKey, -DIGEST_LIST_CAP, -1);
        tx.expire(listKey, DIGEST_TTL_S);
        const results = await tx.exec();
        return !!results && !results.some(([error]) => error);
    } catch {
        return false;
    }
}

function parseEntries(raw: string[]): DigestEntry[] {
    const out: DigestEntry[] = [];
    for (const line of raw) {
        try {
            const e = JSON.parse(line);
            if (e && typeof e === 'object' && typeof e.clientId === 'string' && e.row && typeof e.row === 'object') {
                out.push({ ...e, at: Number(e.at) || 0 });
            }
        } catch {
            // a corrupt entry is dropped, never blocks the rest
        }
    }
    return out;
}

/** One row per client: 'sum' adds numbers (strings keep the newest non-empty value); 'last' keeps the newest row. */
export function mergeByClient(entries: DigestEntry[]): DigestEntry[] {
    const byClient = new Map<string, DigestEntry>();
    for (const e of [...entries].sort((a, b) => a.at - b.at)) {
        const prev = byClient.get(e.clientId);
        if (!prev || e.merge !== 'sum') {
            byClient.set(e.clientId, { ...e, row: { ...e.row } });
            continue;
        }
        const row = { ...prev.row };
        for (const [k, v] of Object.entries(e.row)) {
            if (typeof v === 'number' && typeof row[k] === 'number') row[k] = (row[k] as number) + v;
            else if (typeof v === 'number' && row[k] === undefined) row[k] = v;
            else if (v !== '' && v !== undefined) row[k] = v;
        }
        byClient.set(e.clientId, { ...e, row });
    }
    return [...byClient.values()];
}

/** One notice: Client column + the union of row keys (first-seen order, capped), numbers right-aligned, rows by sortBy descending. */
export function buildDigestNotice(all: DigestEntry[]): RichNotificationInput {
    const entries = mergeByClient(all);
    const first = all[0];
    const columns: string[] = [];
    for (const e of entries) {
        for (const k of Object.keys(e.row)) {
            if (!columns.includes(k) && columns.length < MAX_COLUMNS - 1) columns.push(k);
        }
    }
    const isNumeric = (c: string) => entries.every((e) => e.row[c] === undefined || typeof e.row[c] === 'number');
    const requested = [...all].reverse().find((e) => e.sortBy)?.sortBy;
    const sortCol = requested && columns.includes(requested) && isNumeric(requested) ? requested : columns.find(isNumeric);
    const num = (e: DigestEntry) => (sortCol ? Number(e.row[sortCol] ?? -Infinity) : 0);
    const sorted = [...entries].sort((a, b) => num(b) - num(a) || a.clientId.localeCompare(b.clientId));
    const rows = sorted.map((e) => [e.clientId, ...columns.map((c) => e.row[c] ?? '')]);
    const numeric = columns.map((c, i) => ({ c, i: i + 1 })).filter(({ c }) => isNumeric(c)).map(({ i }) => i);
    const clients = new Set(entries.map((e) => e.clientId)).size;
    // Table only: no summary line or footer; the client count sits in the header.
    return {
        severity: 'info',
        title: first.title,
        tables: [{ columns: [`Client (${clients})`, ...columns], rows, numeric }],
    };
}

export class NoticeDigestFlusher {
    constructor(
        private readonly getRedis: () => DigestRedis,
        private readonly send: DigestSend,
        private readonly isKnownCategory: (category: string) => boolean,
        private readonly log: { warn(msg: string): void; error(msg: string): void } = console,
    ) {}

    /** One pass. Never throws. Returns the number of messages sent. */
    async runOnce(now: number = Date.now()): Promise<number> {
        let sent = 0;
        let redis: DigestRedis;
        try {
            redis = this.getRedis();
            await redis.set(DIGEST_ALIVE_KEY, String(now), 'EX', DIGEST_ALIVE_TTL_S);
        } catch (error) {
            this.log.warn(`notice digest: Redis unavailable: ${error instanceof Error ? error.message : String(error)}`);
            return 0;
        }
        let keys: string[] = [];
        try {
            let cursor = '0';
            do {
                const [next, batch] = await redis.scan(cursor, 'MATCH', `${DIGEST_PREFIX}*`, 'COUNT', SCAN_COUNT);
                cursor = next;
                keys.push(...batch);
            } while (cursor !== '0' && keys.length < MAX_KEYS_PER_RUN);
        } catch (error) {
            this.log.warn(`notice digest: scan failed: ${error instanceof Error ? error.message : String(error)}`);
            return 0;
        }
        keys = [...new Set(keys)].filter((k) => k !== DIGEST_ALIVE_KEY).slice(0, MAX_KEYS_PER_RUN);
        for (const key of keys) {
            try {
                sent += await this.flushKey(redis, key, now);
            } catch (error) {
                this.log.error(`notice digest: flushing ${key} failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return sent;
    }

    private async flushKey(redis: DigestRedis, key: string, now: number): Promise<number> {
        const markAt = key.indexOf(FLUSHING_MARK);
        const orphan = markAt >= 0;
        const baseKey = orphan ? key.slice(0, markAt) : key;
        if (orphan) {
            // a drain that crashed after RENAME: finish it, but never while its owner may still hold it
            const stamp = Number(key.slice(markAt + FLUSHING_MARK.length));
            if (!Number.isFinite(stamp) || now - stamp < DIGEST_LOCK_TTL_S * 1000) return 0;
        } else if (!(await this.isDue(redis, key, now))) {
            return 0;
        }
        const lockKey = `${DIGEST_LOCK_PREFIX}${baseKey}`;
        if ((await redis.set(lockKey, String(now), 'EX', DIGEST_LOCK_TTL_S, 'NX')) !== 'OK') return 0;
        try {
            let workKey = key;
            if (!orphan) {
                workKey = `${key}${FLUSHING_MARK}${now}`;
                try {
                    await redis.rename(key, workKey); // new arrivals start a fresh list
                } catch {
                    return 0; // another flusher drained it first
                }
            }
            const entries = parseEntries(await redis.lrange(workKey, 0, -1));
            // Post first, then delete: a crash in between re-sends (orphan path) rather than losing the batch.
            const sent = entries.length ? await this.post(redis, baseKey, entries) : 0;
            await redis.del(workKey);
            return sent;
        } finally {
            await redis.del(lockKey).catch(() => undefined);
        }
    }

    private async isDue(redis: DigestRedis, key: string, now: number): Promise<boolean> {
        const [firstRaw, lastRaw] = [await redis.lindex(key, 0), await redis.lindex(key, -1)];
        const at = (raw: string | null) => {
            try { return Number(JSON.parse(raw ?? '{}').at) || 0; } catch { return 0; }
        };
        if (!firstRaw) return false;
        let quiet = DIGEST_QUIET_MS;
        try { quiet = Number(JSON.parse(lastRaw ?? '{}').quietMs) || DIGEST_QUIET_MS; } catch { /* default */ }
        return now - at(lastRaw) >= Math.min(quiet, DIGEST_MAX_AGE_MS) || now - at(firstRaw) >= DIGEST_MAX_AGE_MS;
    }

    private async post(redis: DigestRedis, baseKey: string, entries: DigestEntry[]): Promise<number> {
        const category = baseKey.slice(DIGEST_PREFIX.length).split('::')[0];
        let ok = false;
        if (!this.isKnownCategory(category)) {
            this.log.error(`notice digest: unknown category "${category}" for ${baseKey}`);
        } else {
            const input = buildDigestNotice(entries);
            let delivered = 0;
            const messages = await sendNoticeBatched(async (m) => {
                const result = await this.send(category, m);
                if (result === false) throw new Error('send returned false');
                delivered++;
            }, input);
            ok = messages > 0 && delivered > 0;
            if (ok) return messages;
        }
        // Failed or unknown category: put back once (bounded), drop on the second failure.
        const keep = entries.filter((e) => (e.retry ?? 0) < MAX_REQUEUES).map((e) => ({ ...e, retry: (e.retry ?? 0) + 1 }));
        if (keep.length < entries.length) this.log.error(`notice digest: dropped ${entries.length - keep.length} entries of ${baseKey} after repeated failure`);
        if (keep.length) {
            const tx = redis.multi();
            tx.rpush(baseKey, ...keep.map((e) => JSON.stringify(e)));
            tx.ltrim(baseKey, -DIGEST_LIST_CAP, -1);
            tx.expire(baseKey, DIGEST_TTL_S);
            await tx.exec();
        }
        return 0;
    }
}
