/**
 * Robust Telegram RPC error-code matching.
 *
 * A GramJS RPCError's `message` is "<code>: <ERROR_CODE> (caused by <request>)", e.g.
 * "400: INVITE_REQUEST_SENT (caused by channels.JoinChannel)", while `errorMessage` holds the
 * bare code. Strict equality on the message text therefore never matches. These helpers match
 * the bare code from `errorMessage` when present, else the code as a whole token in the text.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function textsOf(error: unknown): string[] {
  if (error == null) return [];
  if (typeof error === 'string') return [error];
  const out: string[] = [];
  if (isRecord(error)) {
    if (typeof error.errorMessage === 'string') out.push(error.errorMessage);
    if (typeof error.message === 'string') out.push(error.message);
    if (isRecord(error.error)) {
      if (typeof error.error.errorMessage === 'string') out.push(error.error.errorMessage);
      if (typeof error.error.message === 'string') out.push(error.error.message);
    }
  }
  if (out.length === 0) out.push(String(error));
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `error` carries the Telegram error `code` (e.g. 'INVITE_REQUEST_SENT') as a whole token. */
export function hasTelegramErrorCode(error: unknown, code: string): boolean {
  const pattern = new RegExp(`(^|[^A-Z0-9_])${escapeRegExp(code.toUpperCase())}($|[^A-Z0-9_])`);
  return textsOf(error).some((text) => pattern.test(text.toUpperCase()));
}

/**
 * True for a Telegram flood wait. GramJS throws FloodWaitError (name 'FloodWaitError', numeric
 * `seconds`, errorMessage 'FLOOD', message "A wait of N seconds is required (caused by ...)").
 * The class name can be lost (bundling, wrapping), so the code/text forms are matched too.
 */
export function isFloodWaitError(error: unknown): boolean {
  if (isRecord(error)) {
    if (error.name === 'FloodWaitError') return true;
    if (error.errorMessage === 'FLOOD' && typeof error.seconds === 'number') return true;
  }
  return textsOf(error).some((text) =>
    /(^|[^A-Z0-9_])FLOOD_(PREMIUM_)?WAIT(_\d+)?($|[^A-Z0-9_])/i.test(text)
    || /A wait of \d+ seconds is required(?! before sending another message)/i.test(text),
  );
}
