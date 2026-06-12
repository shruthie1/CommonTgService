/**
 * Classify a Telegram/runtime error as PERMANENT (account is gone — session
 * revoked, banned, deactivated) vs. temporary (rate limit, network, transient).
 *
 * A false positive here is destructive: callers cascade a permanent classification
 * into `expireAccount`, which retires the account everywhere. So matching must be
 * precise — we match on token boundaries, not loose substrings, and we never let a
 * RECOVERABLE error (e.g. INPUT_USER_DEACTIVATED) be swallowed by a permanent one
 * it happens to contain as a substring.
 */

// Recoverable errors that must NEVER be classified permanent, even though they
// contain a permanent token as a substring (e.g. INPUT_USER_DEACTIVATED ⊃ USER_DEACTIVATED).
const RECOVERABLE_OVERRIDES = [
  'INPUT_USER_DEACTIVATED',
];

const PERMANENT_ERRORS = [
  'SESSION_REVOKED',
  'AUTH_KEY_UNREGISTERED',
  'AUTH_KEY_DUPLICATED',
  'SESSION_EXPIRED',
  'USER_DEACTIVATED',
  'USER_DEACTIVATED_BAN',
  'PHONE_NUMBER_BANNED',
  'PHONE_NUMBER_INVALID',
  // NOTE: FROZEN_* is treated as permanent here to stay consistent with the rest of
  // the platform (session.service, organic-activity, getUserFromSession all do the
  // same, and buildPermanentAccountReason enriches it with appeal metadata). Telegram
  // "frozen" states can sometimes be appealed/temporary — if that classification is
  // ever revisited, it must be changed in ALL those places together, not just here.
  'FROZEN_METHOD_INVALID',
  'FROZEN_PARTICIPANT_MISSING',
];

/**
 * Does `text` contain `token` as a whole token (not as part of a longer
 * identifier)? Boundaries are anything that isn't a letter/digit/underscore, so
 * 'USER_DEACTIVATED' matches in 'RPCError: USER_DEACTIVATED (401)' but NOT inside
 * 'INPUT_USER_DEACTIVATED'.
 */
function containsToken(text: string | null | undefined, token: string): boolean {
  if (typeof text !== 'string' || !token) return false;
  const haystack = text.toUpperCase();
  const needle = token.toUpperCase();
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : haystack[idx - 1];
    const after = idx + needle.length >= haystack.length ? '' : haystack[idx + needle.length];
    const isWordChar = (c: string) => c !== '' && /[A-Z0-9_]/.test(c);
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = idx + 1;
  }
}

function classify(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false;
  // A recoverable override anywhere in the text wins — never classify it permanent.
  if (RECOVERABLE_OVERRIDES.some(token => containsToken(text, token))) return false;
  return PERMANENT_ERRORS.some(token => containsToken(text, token));
}

export default function isPermanentError(errorDetails: { error?: any; message: string; status?: number }): boolean {
  // Parsed/wrapper message.
  if (classify(errorDetails.message)) return true;

  // Raw underlying error message — classify it on its OWN content (the recoverable
  // override is re-checked against the raw text, fixing the earlier bug where the
  // exclusion was checked against the wrapper message instead of the raw message).
  const rawMessage = errorDetails.error?.message || errorDetails.error?.errorMessage;
  if (classify(rawMessage)) return true;

  return false;
}
