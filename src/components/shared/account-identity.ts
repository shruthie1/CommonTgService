/**
 * accountIdentity writer (tg-platform docs/design/2026-11-07-account-collection-split.md, step S3 facet F5).
 *
 * Who an account is on Telegram. One doc per MOBILE (`_id` = mobile). CMS writes only the `profile` group: the pool-doc
 * snapshot { pool, tgId, username, assignedFirstName, assignedLastName, assignedBio, assignedProfilePics,
 * sourceUpdatedAt, by }, guarded on `profile.sourceUpdatedAt` (the pool doc's updatedAt; a mobile in both pools feeds
 * the same group, the most recently updated pool doc wins). The `telegram` group (tg-aut's getMe observation) is
 * written by tg-platform only. The users-maintenance getMe writes on `users` are NOT mirrored (gap, owner question).
 *
 * S3 is ADDITIVE (dual-write only), same producers and the same never-throw / client-side-deadline write as
 * accountWarmup (recordAccountFacetWrite). Nothing reads it yet.
 *
 * MIRROR: ACCOUNT_IDENTITY_VERSION and buildAccountIdentityWrite must stay identical to tg-platform
 * packages/tg-db/src/collections/account-identity.repository.ts; tg-platform
 * tests/unit/packages/tg-db/account-identity.test.mjs diffs both builders over the same inputs.
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

export const ACCOUNT_IDENTITY_COLLECTION = 'accountIdentity';
export const ACCOUNT_IDENTITY_VERSION = 1;
const POOL_SET: ReadonlySet<string> = new Set(['buffer', 'promote']);
const MAX_PROFILE_PICS = 20;

export interface AccountIdentityProfile {
  pool: AccountFacetPool;
  tgId: string | null;
  username: string | null;
  assignedFirstName: string | null;
  assignedLastName: string | null;
  assignedBio: string | null;
  assignedProfilePics: string[] | null;
  sourceUpdatedAt: Date;
  by: string;
}

function profilePics(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((pic): pic is string => typeof pic === 'string' && pic.trim() !== '').map((pic) => pic.trim()).slice(0, MAX_PROFILE_PICS);
}

/** tgId as stored in pool docs is a string; a number is accepted (users.tgId history). */
function tgIdValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return facetCleanString(value, 40);
}

/**
 * The guarded `profile` write of one pool doc. Null when there is nothing valid to write (no mobile / pool / producer /
 * doc, or a doc without a valid updatedAt). MIRROR of tg-db buildAccountIdentityWrite.
 */
export function buildAccountIdentityWrite(input: AccountPoolFacetInput, now: Date): AccountFacetWrite | null {
  const doc = input?.doc;
  if (!doc || typeof doc !== 'object') return null;
  const mobile = normalizeFacetMobile(input.mobile ?? doc.mobile);
  const pool = typeof input.pool === 'string' && POOL_SET.has(input.pool) ? (input.pool as AccountFacetPool) : null;
  const by = facetCleanString(input.by, 60);
  const sourceUpdatedAt = facetToDate(doc.updatedAt);
  if (!mobile || !pool || !by || !sourceUpdatedAt) return null;
  const profile: AccountIdentityProfile = {
    pool,
    tgId: tgIdValue(doc.tgId),
    username: facetCleanString(doc.username, 64),
    assignedFirstName: facetCleanString(doc.assignedFirstName, 200),
    assignedLastName: facetCleanString(doc.assignedLastName, 200),
    assignedBio: facetCleanString(doc.assignedBio, 1000),
    assignedProfilePics: profilePics(doc.assignedProfilePics),
    sourceUpdatedAt,
    by,
  };
  return {
    filter: { _id: mobile, $or: [{ 'profile.sourceUpdatedAt': { $lte: sourceUpdatedAt } }, { 'profile.sourceUpdatedAt': null }] },
    update: { $set: { v: ACCOUNT_IDENTITY_VERSION, mobile, profile, updatedAt: now } },
  };
}

/** One guarded write. Never throws; resolves within the deadline. */
export function recordAccountIdentity(
  collection: AccountFacetCollection | null | undefined,
  input: AccountPoolFacetInput,
  options: AccountFacetOptions = {},
): Promise<AccountFacetWriteResult> {
  return recordAccountFacetWrite(
    collection, ACCOUNT_IDENTITY_COLLECTION,
    () => buildAccountIdentityWrite(input, options.now ? options.now() : new Date()),
    input?.mobile ?? input?.doc?.mobile, options,
  );
}

/** Fire-and-forget form for producers: returns immediately, never rejects. */
export function recordAccountIdentitySoon(
  collection: AccountFacetCollection | null | undefined,
  input: AccountPoolFacetInput,
  options: AccountFacetOptions = {},
): void {
  try {
    void recordAccountIdentity(collection, input, options).catch(() => undefined);
  } catch { /* never throws */ }
}
