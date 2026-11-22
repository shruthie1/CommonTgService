/**
 * The one definite "foreign 2FA" signal: Telegram answered PASSWORD_HASH_INVALID to an SRP check
 * made with OUR password (account.GetPasswordSettings in set2fa's verifyOurPassword, or
 * auth.CheckPassword when createNewSession logs in a new session). The SRP inputs come from
 * account.GetPassword in the same call, so the rejection means the stored password is not ours.
 *
 * Everything else (FLOOD_WAIT, SRP_ID_INVALID, network, timeouts, hasPassword=false) is NOT a
 * foreign verdict and must never drop a mobile. Whole-token match, so a longer identifier that
 * contains the token does not count.
 */
const FOREIGN_2FA_TOKEN = /(^|[^A-Z0-9_])PASSWORD_HASH_INVALID([^A-Z0-9_]|$)/i;

export function isForeign2faError(error: unknown): boolean {
    const texts: string[] = [];
    if (typeof error === 'string') texts.push(error);
    else if (error && typeof error === 'object') {
        const e = error as { message?: unknown; errorMessage?: unknown };
        if (typeof e.errorMessage === 'string') texts.push(e.errorMessage);
        if (typeof e.message === 'string') texts.push(e.message);
    }
    return texts.some((t) => FOREIGN_2FA_TOKEN.test(t));
}
