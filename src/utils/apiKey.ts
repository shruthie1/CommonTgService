/**
 * The shared API key — one place for both sending it and checking it.
 *
 * OUTBOUND  getApiKey()          the key this service SENDS to other services.
 * INBOUND   isAcceptedApiKey()   whether a key presented TO this service is valid.
 *
 * WHY INBOUND IS A SET, NOT A SINGLE VALUE
 * ---------------------------------------
 * This service copies the `configuration` collection into process.env, and does it LIVE when
 * the configuration is updated (ConfigurationInit, init.service.ts). If the guard accepted only
 * process.env.X_API_KEY, then changing that value in the DB would switch the accepted key
 * instantly, while every fleet process keeps sending the old one until it restarts — and a
 * restarting process must authenticate to fetch its config BEFORE it can learn the new key.
 * One config edit would lock the whole fleet out, then crash-loop it.
 *
 * So the legacy key stays accepted unless it is retired EXPLICITLY:
 *   - X_API_KEYS set (comma-separated)  -> exactly that list is accepted (authoritative)
 *   - otherwise                         -> X_API_KEY (if set) AND the legacy key
 *
 * Rotation is therefore: add the new key -> move every caller to it -> set X_API_KEYS to the
 * new key alone. There is never a moment where a caller holds a key the guard refuses.
 *
 * Comparison is case-insensitive, matching the original guard (`toLowerCase() === 'santoor'`).
 */
export const LEGACY_API_KEY = 'santoor';

const parseList = (raw: string | undefined): string[] =>
    (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export function getApiKey(): string {
    return process.env.X_API_KEY || process.env.API_KEY || LEGACY_API_KEY;
}

export function getAcceptedApiKeys(): string[] {
    const explicit = parseList(process.env.X_API_KEYS);
    if (explicit.length > 0) return [...new Set(explicit)];
    // A blank or missing list is "unset", never "accept nothing".
    return [...new Set([...parseList(process.env.X_API_KEY), LEGACY_API_KEY])];
}

export function isAcceptedApiKey(key: string | null | undefined): boolean {
    if (!key) return false;
    // No trim on the presented key: the original guard did not trim, so ' santoor' stays rejected.
    return getAcceptedApiKeys().includes(key.toLowerCase());
}
