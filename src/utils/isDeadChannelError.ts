/**
 * Classify a Telegram join error as a DEAD CHANNEL error — the channel's username
 * no longer resolves (renamed, deleted, or never existed). These are permanent at the
 * CHANNEL level (not the account level): the account is fine, the channel is gone.
 *
 * Callers must NOT re-queue such a channel (it will fail forever) and SHOULD delete it
 * from the `channels` / `activeChannels` collections so it's never re-queued.
 *
 * Deliberately NARROW: only username-resolution failures. Rate limits, flood waits,
 * CHANNEL_PRIVATE (join-by-invite), and INVITE_REQUEST_SENT are handled elsewhere and
 * must NOT be treated as dead — deleting a private/approval channel would lose it.
 */

// Whole-token error codes that mean the username does not resolve to any peer.
const DEAD_CHANNEL_TOKENS = [
  'USERNAME_INVALID',
  'USERNAME_NOT_OCCUPIED',
];

// GramJS surfaces a stale/deleted username as a plain-text message rather than an
// error code: `No user has "<name>" as username`. Matched case-insensitively as a phrase.
const DEAD_CHANNEL_PHRASES = [
  'no user has',
];

function containsToken(text: string, token: string): boolean {
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
  if (DEAD_CHANNEL_TOKENS.some((token) => containsToken(text, token))) return true;
  const lower = text.toLowerCase();
  return DEAD_CHANNEL_PHRASES.some((phrase) => lower.includes(phrase));
}

/**
 * @param error Any thrown value (Error, GramJS RPCError, or wrapper with errorMessage/message).
 */
export default function isDeadChannelError(error: unknown): boolean {
  if (error == null) return false;
  if (typeof error === 'string') return classify(error);
  if (typeof error === 'object') {
    const e = error as Record<string, unknown>;
    if (classify(typeof e.errorMessage === 'string' ? e.errorMessage : null)) return true;
    if (classify(typeof e.message === 'string' ? e.message : null)) return true;
    // nested wrapper (e.g. { error: rpcError })
    if (e.error && classify(typeof (e.error as any).errorMessage === 'string' ? (e.error as any).errorMessage : (e.error as any).message)) return true;
  }
  return classify(String(error));
}
