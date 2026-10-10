import { connectionManager } from './connection-manager';
import { TelegramLogger } from './telegram-logger';

const logger = new TelegramLogger('SpamBotProbe');

/**
 * Self-contained @SpamBot probe used by the CMS before swapping a buffer account in as a client's
 * live account. It deliberately does not share code with tg-platform; the classification texts
 * below are the ones SpamBot is known to send.
 */

export type SpamProbeStatus = 'free' | 'limited' | 'harsh' | 'unknown';

export interface SpamProbeResult {
  status: SpamProbeStatus;
  /** Set for 'limited' only. */
  limitedUntil: Date | null;
  /** Reply text the classification was based on (truncated), for logs/notifications. */
  replyText?: string;
  /** Why the result is 'unknown' (timeout, connection failure...). */
  error?: string;
  /** True when the account could not be connected at all (connect error/timeout), as opposed to connected-but-no-reply. */
  connectFailed?: boolean;
  /** Connected, but sending /start or reading the reply threw (PEER_FLOOD, FLOOD_WAIT, auth errors...): not verifiable. */
  sendFailed?: boolean;
  /** Not probed: another flow is building or holds an unhealthy connection for this mobile; touching it would tear that down. */
  busy?: boolean;
}

export const SPAMBOT_USERNAME = '@SpamBot';
export const SPAMBOT_POLL_TIMEOUT_MS = 15_000;
export const SPAMBOT_POLL_INTERVAL_MS = 1_500;
/** Hard cap for one probe including connecting the account. */
export const SPAMBOT_TOTAL_TIMEOUT_MS = 25_000;
/** Used when SpamBot says "limited until" but the date cannot be parsed. Conservative, not Telegram data. */
export const UNPARSEABLE_LIMIT_FALLBACK_DAYS = 7;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndex(name: string): number | undefined {
  return MONTHS[name.slice(0, 3).toLowerCase()];
}

/** Build a UTC date; a missing year means "next occurrence"; a missing time means end of that UTC day. */
function buildDate(
  day: number, month: number, year: number | undefined, hour: number | undefined, minute: number | undefined, now: Date,
): Date | null {
  if (day < 1 || day > 31) return null;
  const hh = hour ?? 23;
  const mm = minute ?? 59;
  const ss = hour === undefined ? 59 : 0;
  let y = year ?? now.getUTCFullYear();
  let d = new Date(Date.UTC(y, month, day, hh, mm, ss));
  if (year === undefined && d.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    y += 1;
    d = new Date(Date.UTC(y, month, day, hh, mm, ss));
  }
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== day ? null : d;
}

const TIME_PART = String.raw`(?:,?\s+(\d{1,2}):(\d{2}))?`;
// "12 Oct 2026, 15:58 UTC" / "12 Oct"
const DAY_FIRST = new RegExp(String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?` + TIME_PART, 'g');
// "Oct 12, 2026" / "October 12"
const MONTH_FIRST = new RegExp(String.raw`([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?` + TIME_PART, 'g');

export function parseLimitedUntil(text: string, now: Date = new Date()): Date | null {
  const lower = text.toLowerCase();
  const keyIdx = [lower.indexOf('limited until'), lower.indexOf('automatically released')]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  const scope = keyIdx === undefined ? text : text.slice(keyIdx);

  for (const m of scope.matchAll(DAY_FIRST)) {
    const mi = monthIndex(m[2]);
    if (mi === undefined) continue;
    const d = buildDate(+m[1], mi, m[3] ? +m[3] : undefined, m[4] ? +m[4] : undefined, m[5] ? +m[5] : undefined, now);
    if (d) return d;
  }
  for (const m of scope.matchAll(MONTH_FIRST)) {
    const mi = monthIndex(m[1]);
    if (mi === undefined) continue;
    const d = buildDate(+m[2], mi, m[3] ? +m[3] : undefined, m[4] ? +m[4] : undefined, m[5] ? +m[5] : undefined, now);
    if (d) return d;
  }
  return null;
}

export function classifySpamBotReply(text: string, now: Date = new Date()): SpamProbeResult {
  const reply = (text || '').trim();
  const lower = reply.toLowerCase();
  const snippet = reply.slice(0, 300);
  if (!reply) return { status: 'unknown', limitedUntil: null };

  if (lower.includes('good news')) {
    return { status: 'free', limitedUntil: null, replyText: snippet };
  }
  if (lower.includes('limited until') || lower.includes('automatically released')) {
    const until = parseLimitedUntil(reply, now);
    if (until) return { status: 'limited', limitedUntil: until, replyText: snippet };
    // Dated limit whose date we could not read: still limited, so keep it out of the swap path.
    return {
      status: 'limited',
      limitedUntil: new Date(now.getTime() + UNPARSEABLE_LIMIT_FALLBACK_DAYS * 24 * 60 * 60 * 1000),
      replyText: snippet,
    };
  }
  if (lower.includes('harsh response') || lower.includes('while the account is limited')) {
    return { status: 'harsh', limitedUntil: null, replyText: snippet };
  }
  return { status: 'unknown', limitedUntil: null, replyText: snippet };
}

/** Telegram message dates are unix seconds (gramjs) or Date; tolerate small local/server clock skew. */
const SEND_CLOCK_SKEW_SEC = 2;

function messageDateSec(m: any): number | undefined {
  const d = m?.date;
  if (d instanceof Date) return Math.floor(d.getTime() / 1000);
  return typeof d === 'number' ? d : undefined;
}

/** Newer than our /start: by message id when the send returned one, otherwise by send timestamp (never id > 0). */
function isAfterSend(m: any, sentId: number | undefined, sentAtSec: number): boolean {
  if (sentId !== undefined) return m.id > sentId;
  const date = messageDateSec(m);
  return date !== undefined && date >= sentAtSec;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ProbeOptions {
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  totalTimeoutMs?: number;
  now?: () => Date;
}

/**
 * Probe @SpamBot with the account's own session. Never throws: any failure yields 'unknown'.
 * A connection opened only for the probe is always released; a connection that already existed
 * (e.g. the account is live elsewhere in this process) is left alone.
 */
export async function probeSpamBot(mobile: string, options: ProbeOptions = {}): Promise<SpamProbeResult> {
  const pollTimeoutMs = options.pollTimeoutMs ?? SPAMBOT_POLL_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? SPAMBOT_POLL_INTERVAL_MS;
  const totalTimeoutMs = options.totalTimeoutMs ?? SPAMBOT_TOTAL_TIMEOUT_MS;
  const nowFn = options.now ?? (() => new Date());
  const deadline = Date.now() + totalTimeoutMs;
  // getClient() joins an in-flight build and tears down + rebuilds an unhealthy registered client.
  // Either would hijack another flow's connection, so only probe a mobile nobody else is touching
  // ('none', we open and later release it) or one with a healthy client (reused as-is, never released).
  const reuseState = connectionManager.getReuseState(mobile);
  if (reuseState === 'busy') {
    logger.info(mobile, 'SpamBot probe skipped: connection busy in another flow');
    return { status: 'unknown', limitedUntil: null, busy: true, error: 'connection in use by another flow' };
  }
  const openedByProbe = reuseState === 'none';
  let acquired = false;
  let lastUsedAtAcquire: number | undefined;
  const release = async () => {
    // Release only a connection we actually obtained (a failed connect cleans itself up in the
    // connection manager; a timed-out one is disconnected when it lands, see below). If another flow
    // in this process reused our connection meanwhile (lastUsed moved), it owns it now and must
    // disconnect it itself. Never leave an idle session connected: a second live connection of the
    // same session (another CMS/UMS instance, the VM apps) means AUTH_KEY_DUPLICATED.
    if (!openedByProbe || !acquired) return;
    if (connectionManager.getLastUsed(mobile) !== lastUsedAtAcquire) return;
    try {
      await connectionManager.unregisterClient(mobile); // idempotent
    } catch {
      /* best effort: the connection manager's idle cleanup is the backstop */
    }
  };

  const withDeadline = async <T>(p: Promise<T>, what: string): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${what} timed out`)), Math.max(0, deadline - Date.now()));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const connecting = connectionManager.getClient(mobile, { handler: false });
  connecting.catch(() => undefined); // a timed-out connect may reject later; never leave it unhandled
  let manager: Awaited<typeof connecting>;
  try {
    manager = await withDeadline(connecting, 'connect');
  } catch (error) {
    if (openedByProbe) {
      // The connect may still succeed after we gave up. Disconnect it as soon as it lands rather than
      // leaving a live session for idle cleanup. The candidate was rejected, so no swap will use it.
      connecting.then(
        () => {
          // grep "late connection disconnected" for reports on slow connects.
          logger.warn(mobile, 'SpamBot probe: late connection disconnected after connect timeout', { totalTimeoutMs });
          return connectionManager.unregisterClient(mobile).catch(() => undefined);
        },
        () => undefined,
      );
    }
    return {
      status: 'unknown', limitedUntil: null, connectFailed: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  acquired = true;
  lastUsedAtAcquire = connectionManager.getLastUsed(mobile);
  try {
    const tg = manager?.client;
    if (!tg) return { status: 'unknown', limitedUntil: null, connectFailed: true, error: 'no telegram client' };

    const sentAtSec = Math.floor(Date.now() / 1000) - SEND_CLOCK_SKEW_SEC;
    const sent = await withDeadline(tg.sendMessage(SPAMBOT_USERNAME, { message: '/start' }), 'send /start');
    const sentId: number | undefined = typeof sent?.id === 'number' && sent.id > 0 ? sent.id : undefined;
    const pollUntil = Math.min(deadline, Date.now() + pollTimeoutMs);
    let lastText = '';
    while (Date.now() < pollUntil) {
      await sleep(Math.min(pollIntervalMs, Math.max(0, pollUntil - Date.now())));
      const messages = await withDeadline(tg.getMessages(SPAMBOT_USERNAME, { limit: 5 }), 'read reply');
      // Only replies newer than our /start; oldest-first so multi-part replies read in order.
      const incoming = (messages || [])
        .filter((m: any) => m && !m.out && typeof m.id === 'number' && isAfterSend(m, sentId, sentAtSec))
        .sort((a: any, b: any) => a.id - b.id);
      if (incoming.length) {
        lastText = incoming.map((m: any) => String(m.message ?? m.text ?? '')).join('\n');
        const result = classifySpamBotReply(lastText, nowFn());
        // A greeting/menu may precede the verdict, so keep polling while still unknown.
        if (result.status !== 'unknown') return result;
      }
    }
    return {
      status: 'unknown',
      limitedUntil: null,
      replyText: lastText ? lastText.slice(0, 300) : undefined,
      error: lastText ? 'unrecognized SpamBot reply' : 'no SpamBot reply before timeout',
    };
  } catch (error) {
    // The account connected but could not message SpamBot (PEER_FLOOD, FLOOD_WAIT, AUTH_KEY_*...).
    // That is evidence against it, not silence: the caller must not treat it as safe.
    return { status: 'unknown', limitedUntil: null, sendFailed: true, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await release();
  }
}
