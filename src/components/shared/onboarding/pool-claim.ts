/**
 * Cross-process one-pool-per-mobile claim (pool-onboarding M13).
 *
 * `withEnrollmentLock` only serialises enrolments inside ONE process, but buffer enrols on CMS and
 * promote on UMS. This claim is the cross-process half: before the "is this mobile in any pool?"
 * re-check + pool write, the enrolling process takes a short Mongo lease on the mobile in
 * `poolEnrolmentClaims` (unique `mobile`). A second process trying to claim the same mobile for
 * the OTHER pool while the lease is live gets a duplicate-key refusal and skips. Once the lease is
 * released (or expires) the existing per-collection re-check is what keeps the mobile in one pool.
 *
 * DB-only: no Telegram call. Never deletes: release sets the lease time to the epoch.
 */
import { Logger } from '@nestjs/common';
import type { InsertManyOptions, Model } from 'mongoose';
import { maskMobile } from '../../monitor/monitor-util';

export const POOL_CLAIM_COLLECTION = 'poolEnrolmentClaims';
/** Longer than any re-check + write (milliseconds), short enough that a crashed holder self-heals. */
export const POOL_CLAIM_LEASE_MS = 60_000;
/**
 * Server-side cap (maxTimeMS) on each DB call of a claim body: the "already in a pool?" re-check and the pool write.
 * Well under the lease, so a holder stalled in Mongo fails instead of writing after its lease expired and the other
 * pool claimed the mobile (schema audit batch 7). It caps server time only, not the network round trip.
 */
export const POOL_CLAIM_BODY_MAX_TIME_MS = 20_000;

/**
 * insertMany options for a claim-body pool insert. Mongoose 9 forwards maxTimeMS to the insert command (checked with
 * command monitoring, spec pool-claim.spec.ts) but its InsertManyOptions type does not declare it, hence the cast.
 */
export const POOL_CLAIM_INSERT_OPTIONS = { maxTimeMS: POOL_CLAIM_BODY_MAX_TIME_MS } as InsertManyOptions;

const logger = new Logger('PoolClaim');

/** MaxTimeMSExpired (code 50, or the codeName / message some topologies surface). */
function isMaxTimeExpired(error: unknown): boolean {
    const e = error as { code?: number; codeName?: string; message?: string } | null;
    return e?.code === 50 || e?.codeName === 'MaxTimeMSExpired' || (typeof e?.message === 'string' && e.message.includes('MaxTimeMSExpired'));
}

const indexReady = new WeakMap<object, Promise<void>>();

interface ClaimCollection {
    createIndex(spec: Record<string, 1>, opts: Record<string, unknown>): Promise<unknown>;
    findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>, opts: Record<string, unknown>): Promise<unknown>;
    findOne?(filter: Record<string, unknown>): Promise<unknown>;
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>;
}

function claimDb(model: Model<any>): { collection: (name: string) => ClaimCollection } | null {
    const db = (model as unknown as { db?: { collection?: (name: string) => ClaimCollection } }).db;
    // Unit specs build services on plain object fakes with no connection; real models always have one.
    if (!db || typeof db.collection !== 'function') return null;
    return db as { collection: (name: string) => ClaimCollection };
}

/**
 * Resolves once the claim collection's unique `mobile` index exists (created once per connection).
 * A failed createIndex is NOT cached: the rejection is returned to this caller and evicted, so the
 * next call retries (post-review P1-3). Resolves at once for models without a connection.
 */
export function ensurePoolClaimIndex(model: Model<any>): Promise<void> {
    const db = claimDb(model);
    if (!db) return Promise.resolve();
    let ready = indexReady.get(db);
    if (!ready) {
        const attempt: Promise<void> = Promise.resolve()
            .then(() => db.collection(POOL_CLAIM_COLLECTION).createIndex({ mobile: 1 }, { unique: true, name: 'mobile_unique' }))
            .then(() => undefined);
        ready = attempt;
        indexReady.set(db, attempt);
        attempt.catch(() => {
            if (indexReady.get(db) === attempt) indexReady.delete(db);
        });
    }
    return ready;
}

function isDuplicateKey(error: unknown): boolean {
    return (error as { code?: number })?.code === 11000;
}

/**
 * `heldBy` is the pool holding the live claim: the other pool, or this same pool when two
 * enrolments of this pool raced to create the claim (`concurrent: true`).
 */
export type PoolClaimResult<T> = { claimed: true; value: T } | { claimed: false; heldBy: string; concurrent: boolean };

/** Human wording for a refused claim: "promoteClients" or "a concurrent bufferClients enrolment". */
export function describeClaimHolder(result: { heldBy: string; concurrent: boolean }): string {
    return result.concurrent ? `a concurrent ${result.heldBy} enrolment` : result.heldBy;
}

/**
 * Run `fn` while holding the cross-process claim on `mobile` for `pool`. Re-entrant for the same
 * pool (a live claim by the same pool is renewed). Returns `{ claimed: false }` without running
 * `fn` when the other pool holds a live claim, or when a same-pool claim raced this one to the insert.
 */
export async function withPoolClaim<T>(
    model: Model<any>,
    mobile: string,
    pool: 'bufferClients' | 'promoteClients',
    fn: () => Promise<T>,
    now: () => number = Date.now,
): Promise<PoolClaimResult<T>> {
    const db = claimDb(model);
    if (!db) return { claimed: true, value: await fn() };
    await ensurePoolClaimIndex(model);
    const col = db.collection(POOL_CLAIM_COLLECTION);
    const at = new Date(now());
    try {
        await col.findOneAndUpdate(
            { mobile, $or: [{ pool }, { at: { $lt: new Date(at.getTime() - POOL_CLAIM_LEASE_MS) } }] },
            { $set: { mobile, pool, at } },
            { upsert: true },
        );
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // Same outcome either way (refused, fn not run); only the reported holder differs. The
        // filter always matches an own-pool doc, so an own-pool holder means a same-pool insert race.
        const other = pool === 'bufferClients' ? 'promoteClients' : 'bufferClients';
        const holder = col.findOne
            ? ((await col.findOne({ mobile }).catch(() => null)) as { pool?: string } | null)?.pool
            : undefined;
        if (holder === pool) return { claimed: false, heldBy: pool, concurrent: true };
        return { claimed: false, heldBy: other, concurrent: false };
    }
    try {
        return { claimed: true, value: await fn() };
    } catch (error) {
        if (isMaxTimeExpired(error)) {
            logger.warn(`[pool-claim] kind=body_timeout pool=${pool} mobile=${maskMobile(mobile)} maxTimeMS=${POOL_CLAIM_BODY_MAX_TIME_MS}: claim body failed`);
        }
        throw error;
    } finally {
        // A failed release only delays the other pool by one lease (POOL_CLAIM_LEASE_MS); the
        // enrolment result itself must not be turned into a failure by it.
        await col.updateOne({ mobile, pool, at }, { $set: { at: new Date(0) } }).catch(() => undefined);
    }
}
