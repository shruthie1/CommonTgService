/**
 * One greppable line per pool-row DELETE decision (owner 2026-11-20: the buffer/promote DELETE routes stay,
 * every delete is logged). grep `pool-client-delete` in cms/ums logs.
 *   kind=deleted  the row was removed
 *   kind=no_row   no row matched the mobile (nothing removed)
 *   kind=error    the delete threw (nothing known to be removed)
 * The mobile is masked to its last 4 digits (non-digits dropped first; none = no digits). The reason is last, whitespace collapsed to one line.
 */
export type PoolClientDeleteKind = 'deleted' | 'no_row' | 'error';

export function poolClientDeleteLine(
    pool: 'buffer' | 'promote',
    kind: PoolClientDeleteKind,
    mobile: unknown,
    reason: string,
): string {
    // Digits only, so a malformed input can never put a newline or other text into the line.
    const digits = String(mobile ?? '').replace(/\D/g, '');
    const masked = digits ? `****${digits.slice(-4)}` : 'none';
    const oneLine = String(reason ?? '').replace(/\s+/g, ' ').trim() || 'none';
    return `pool-client-delete kind=${kind} pool=${pool} mobile=${masked} reason=${oneLine}`;
}
