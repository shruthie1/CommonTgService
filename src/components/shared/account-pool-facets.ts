/**
 * CMS producer hook of the S3 snapshot facets (tg-platform docs/design/2026-11-07-account-collection-split.md,
 * "S3 implementation"): after a pool-doc write that returned the AFTER doc, mirror it into every facet.
 *
 * Both functions return at once and never throw; each facet write is bounded by its own client-side deadline and
 * logs one warn on failure. The pool-doc write has already happened and its result is never changed.
 *
 * Producers: BufferClientService / PromoteClientService update() and create() (every base-client flow writes through
 * update(): status, warmup phases and steps, health checks, username), onboarding enrolment.ts / set-as.ts, and the
 * client cutover (client.service.ts, re-read after commit because the cutover writes inside a transaction).
 */
import { ACCOUNT_IDENTITY_COLLECTION, recordAccountIdentitySoon } from './account-identity';
import { ACCOUNT_MEMBERSHIP_COLLECTION, recordAccountMembershipSoon } from './account-membership';
import { accountFacetCollectionOf, ACCOUNT_WARMUP_COLLECTION, recordAccountWarmupSoon, type AccountFacetLogger, type AccountFacetPool } from './account-warmup';

/** Mongoose document or plain object -> plain object (null when it is neither). */
function plain(doc: unknown): Record<string, unknown> | null {
  if (!doc || typeof doc !== 'object') return null;
  const toObject = (doc as { toObject?: () => unknown }).toObject;
  const value = typeof toObject === 'function' ? toObject.call(doc) : doc;
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/** Mirror one pool doc (the AFTER doc of a write). Fire-and-forget; never throws. */
export function mirrorPoolDocFacetsSoon(model: unknown, pool: AccountFacetPool, doc: unknown, by: string, logger?: AccountFacetLogger): void {
  try {
    const snapshot = plain(doc);
    if (!snapshot) return;
    recordAccountWarmupSoon(accountFacetCollectionOf(model, ACCOUNT_WARMUP_COLLECTION), { pool, by, doc: snapshot }, { logger });
    recordAccountMembershipSoon(accountFacetCollectionOf(model, ACCOUNT_MEMBERSHIP_COLLECTION), { pool, by, doc: snapshot }, { logger });
    recordAccountIdentitySoon(accountFacetCollectionOf(model, ACCOUNT_IDENTITY_COLLECTION), { pool, by, doc: snapshot }, { logger });
  } catch { /* mirroring is best-effort */ }
}

interface FindableModel {
  find(filter: Record<string, unknown>): { lean(): { maxTimeMS?(ms: number): unknown; exec(): Promise<unknown[]> } };
}

/**
 * Re-read the pool docs matching `filter` and mirror each (used where the write ran inside a transaction or returned
 * no doc, e.g. the cutover). Fire-and-forget: the read runs in the background with maxTimeMS + a client-side deadline,
 * so it never delays the caller; a failed read is one warn.
 */
export function mirrorPoolFacetsByQuerySoon(
  model: unknown, pool: AccountFacetPool, filter: Record<string, unknown>, by: string, logger?: AccountFacetLogger, deadlineMs = 3_000,
): void {
  try {
    const findable = model as FindableModel | null | undefined;
    if (!findable || typeof findable.find !== 'function') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = Promise.resolve().then(async () => {
      const query = findable.find(filter).lean();
      if (typeof query.maxTimeMS === 'function') query.maxTimeMS(deadlineMs);
      return query.exec();
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`pool re-read timed out after ${deadlineMs} ms (client-side deadline)`)), deadlineMs);
      (timer as { unref?: () => void }).unref?.();
    });
    void Promise.race([read, timeout])
      .then((docs) => {
        for (const doc of Array.isArray(docs) ? docs : []) mirrorPoolDocFacetsSoon(model, pool, doc, by, logger);
      })
      .catch((error) => {
        try {
          logger?.warn(`account facets: ${pool} re-read for ${by} failed; snapshots not mirrored (the pool write is unaffected)`, {
            error: error instanceof Error ? error.message : String(error),
          });
        } catch { /* never throws */ }
      })
      .finally(() => clearTimeout(timer));
  } catch { /* mirroring is best-effort */ }
}
