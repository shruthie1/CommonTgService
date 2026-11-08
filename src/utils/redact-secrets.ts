/**
 * Log redaction for credentials. Used by the shared Logger and parseError so a whole document
 * (users / bufferClients / promoteClients / clients / session_audits) or an error that embeds one
 * (e.g. Mongo E11000 on users.session_1) never prints a live Telegram session, a 2FA password,
 * an API key or a bot token. Logs only: never apply it to stored or returned data.
 */

const SECRET_KEYS = new Set([
    'session', 'stringsession', 'sessionstring', 'activesession', 'backupsession',
    'password', 'passwd', 'twofa', 'apikey', 'api_key', 'x-api-key',
    'token', 'bottoken', 'accesstoken', 'refreshtoken', 'secret', 'authkey',
]);

/** GramJS StringSession: "1" followed by ~350 base64 chars. 200+ never occurs in ordinary text. */
const SESSION_LIKE = /\b1[A-Za-z0-9+/_-]{200,}={0,2}/g;
/**
 * Telegram bot token: <bot id>:<35-char secret>. Only the secret is replaced: the leading digits (a bot id, which
 * is not secret, or a mobile written straight before ':') are kept, so a mobile is never lost (2026-11-08).
 */
const BOT_TOKEN_LIKE = /(?<!\d)(\d{6,12}):[A-Za-z0-9_-]{30,}/g; // also inside ".../bot<token>/..."

export const REDACTED = '[redacted]';

export function isSecretKey(key: string): boolean {
    return SECRET_KEYS.has(String(key).toLowerCase());
}

export function redactSecretText<T>(text: T): T {
    if (typeof text !== 'string') return text;
    return text.replace(SESSION_LIKE, '[redacted-session]').replace(BOT_TOKEN_LIKE, '$1:[redacted-token]') as unknown as T;
}
