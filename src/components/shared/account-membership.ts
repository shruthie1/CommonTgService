/**
 * accountMembership writer (tg-platform docs/design/2026-11-07-account-collection-split.md, step S3 facet F4).
 *
 * Which pool / client an account belongs to NOW: the current-state twin of the S1 accountRoleEvents history (S1 events
 * are untouched). One doc per MOBILE (`_id` = mobile) with one sub-doc per pool, `pools.buffer` / `pools.promote` =
 * { role, clientId, status, inUse, availableDate, lastUsed, message, sourceUpdatedAt, by }.
 *   - role: 'main' for a buffer doc with inUse === true, else the pool name; 'retired' is status === 'inactive'.
 *   - dbcoll / persona are not stored (dbcoll is a `clients` field joined by clientId; persona -> accountIdentity);
 *     channels / lastActive / version are excluded (channels is a high-frequency $inc counter outside update()).
 * Each pool sub-doc is guarded on `pools.<pool>.sourceUpdatedAt` (the pool doc's own updatedAt).
 *
 * S3 is ADDITIVE (dual-write only), same producers and the same never-throw / client-side-deadline write as
 * accountWarmup (recordAccountFacetWrite). Nothing reads it yet.
 *
 * MIRROR: ACCOUNT_MEMBERSHIP_VERSION and buildAccountMembershipWrite must stay identical to tg-platform
 * packages/tg-db/src/collections/account-membership.repository.ts; tg-platform
 * tests/unit/packages/tg-db/account-membership.test.mjs diffs both builders over the same inputs.
 */
import {
  facetCleanString,
  facetToDate,
  normalizeFacetMobile,
  recordAccountFacetWrite,
  type AccountFacetCollection,
  type AccountFacetOptions,
  type AccountFacetPool,
  type AccountFacetWrite,
  type AccountFacetWriteResult,
  type AccountPoolFacetInput,
} from './account-warmup';

export const ACCOUNT_MEMBERSHIP_COLLECTION = 'accountMembership';
export const ACCOUNT_MEMBERSHIP_VERSION = 1;
const POOL_SET: ReadonlySet<string> = new Set(['buffer', 'promote']);

export type AccountMembershipRole = 'main' | AccountFacetPool;

export interface AccountPoolMembership {
  role: AccountMembershipRole;
  clientId: string | null;
  status: string | null;
  inUse: boolean | null;
  availableDate: string | null;
  lastUsed: Date | null;
  message: string | null;
  sourceUpdatedAt: Date;
  by: string;
}

/**
 * The guarded write of one pool doc's membership. Null when there is nothing valid to write (no mobile / pool /
 * producer / doc, or a doc without a valid updatedAt). MIRROR of tg-db buildAccountMembershipWrite.
 */
export function buildAccountMembershipWrite(input: AccountPoolFacetInput, now: Date): AccountFacetWrite | null {
  const doc = input?.doc;
  if (!doc || typeof doc !== 'object') return null;
  const mobile = normalizeFacetMobile(input.mobile ?? doc.mobile);
  const pool = typeof input.pool === 'string' && POOL_SET.has(input.pool) ? (input.pool as AccountFacetPool) : null;
  const by = facetCleanString(input.by, 60);
  const sourceUpdatedAt = facetToDate(doc.updatedAt);
  if (!mobile || !pool || !by || !sourceUpdatedAt) return null;
  const inUse = typeof doc.inUse === 'boolean' ? doc.inUse : null;
  const membership: AccountPoolMembership = {
    role: pool === 'buffer' && inUse === true ? 'main' : pool,
    clientId: facetCleanString(doc.clientId, 60),
    status: facetCleanString(doc.status, 40),
    inUse,
    availableDate: facetCleanString(doc.availableDate, 40),
    lastUsed: facetToDate(doc.lastUsed),
    message: facetCleanString(doc.message, 500),
    sourceUpdatedAt,
    by,
  };
  const path = `pools.${pool}`;
  return {
    filter: { _id: mobile, $or: [{ [`${path}.sourceUpdatedAt`]: { $lte: sourceUpdatedAt } }, { [`${path}.sourceUpdatedAt`]: null }] },
    update: { $set: { v: ACCOUNT_MEMBERSHIP_VERSION, mobile, [path]: membership, updatedAt: now } },
  };
}

/** One guarded write. Never throws; resolves within the deadline. */
export function recordAccountMembership(
  collection: AccountFacetCollection | null | undefined,
  input: AccountPoolFacetInput,
  options: AccountFacetOptions = {},
): Promise<AccountFacetWriteResult> {
  return recordAccountFacetWrite(
    collection, ACCOUNT_MEMBERSHIP_COLLECTION,
    () => buildAccountMembershipWrite(input, options.now ? options.now() : new Date()),
    input?.mobile ?? input?.doc?.mobile, options,
  );
}

/** Fire-and-forget form for producers: returns immediately, never rejects. */
export function recordAccountMembershipSoon(
  collection: AccountFacetCollection | null | undefined,
  input: AccountPoolFacetInput,
  options: AccountFacetOptions = {},
): void {
  try {
    void recordAccountMembership(collection, input, options).catch(() => undefined);
  } catch { /* never throws */ }
}
