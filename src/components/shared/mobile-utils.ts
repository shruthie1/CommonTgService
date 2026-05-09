export const CANONICAL_MOBILE_REGEX = /^[1-9]\d{10,14}$/;

export function normalizeMobileInput(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
}

export function canonicalizeMobile(value: string): string {
    const normalized = normalizeMobileInput(value);
    if (!CANONICAL_MOBILE_REGEX.test(normalized)) {
        throw new Error('mobile must include country code and contain 11-15 digits');
    }
    return normalized;
}

export function mobilesEqual(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return false;
    try {
        return canonicalizeMobile(a) === canonicalizeMobile(b);
    } catch {
        return false;
    }
}
