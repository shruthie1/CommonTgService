import type { RichNotificationInput } from '../../utils/rich-message';

/** One account touched by a check run: what changed and how many updates it took. */
export interface CheckEntry {
    clientId: string;
    mobile: string;
    change?: string;
    count?: number;
}

export interface CheckSummaryInput {
    /** "Promote" | "Buffer" */
    kind: string;
    active: number;
    inactive: number;
    unassigned: number;
    totalUpdates: number;
    createdCount: number;
    attemptedCount: number;
    totalNeeded: number;
    clientsNeedingMore: number;
    perClient: Array<{ clientId: string; activeCount: number; assignedCount: number; inactiveCount: number; needed: number; neverUsed: number; usedInLast24Hours: number }>;
    updatedEntries: CheckEntry[];
    createdEntries: CheckEntry[];
    /** Max rows shown per list/table (default 10 for entry lists, unlimited for perClient unless set). */
    perClientLimit?: number;
}

const ENTRY_LIMIT = 10;

const more = (title: string, total: number, shown: number) => (total > shown ? `${title} (+${total - shown} more)` : title);

/**
 * Pool check summary as tables only: pool totals in one row, then per client (neediest first),
 * then the accounts this run updated or created.
 */
export function buildCheckSummaryNotification(s: CheckSummaryInput): RichNotificationInput {
    const sorted = [...s.perClient].sort((a, b) => b.needed - a.needed || a.clientId.localeCompare(b.clientId));
    const shown = s.perClientLimit ? sorted.slice(0, s.perClientLimit) : sorted;
    const tables: NonNullable<RichNotificationInput['tables']> = [
        {
            title: 'Pool',
            columns: ['Active', 'Inactive', 'Unassigned', `Needed (${s.clientsNeedingMore} clients)`, 'Updated', 'Created', 'Tried'],
            rows: [[s.active, s.inactive, s.unassigned, s.totalNeeded, s.totalUpdates, s.createdCount, s.attemptedCount]],
            numeric: [0, 1, 2, 3, 4, 5, 6],
        },
        {
            title: more('Per client', sorted.length, shown.length),
            columns: [`Client (${sorted.length})`, 'Active', 'Assigned', 'Inactive', 'Needed', 'Never used', 'Used 24h'],
            rows: shown.map((i) => [i.clientId, i.activeCount, i.assignedCount, i.inactiveCount, i.needed, i.neverUsed, i.usedInLast24Hours]),
            numeric: [1, 2, 3, 4, 5, 6],
        },
    ];
    if (s.updatedEntries.length) {
        tables.push({
            title: more(`Updated (${s.updatedEntries.length})`, s.updatedEntries.length, ENTRY_LIMIT),
            columns: ['Client', 'Mobile', 'Change', 'Updates'],
            rows: s.updatedEntries.slice(0, ENTRY_LIMIT).map((e) => [e.clientId, e.mobile, e.change || 'updated', e.count ?? 1]),
            numeric: [3],
        });
    }
    if (s.createdEntries.length) {
        tables.push({
            title: more(`Created (${s.createdEntries.length})`, s.createdEntries.length, ENTRY_LIMIT),
            columns: ['Client', 'Mobile'],
            rows: s.createdEntries.slice(0, ENTRY_LIMIT).map((e) => [e.clientId, e.mobile]),
        });
    }
    return {
        severity: 'info',
        title: `${s.kind} pool check`,
        tables,
    };
}
