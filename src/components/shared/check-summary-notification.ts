import type { RichNotificationInput } from '../../utils/rich-message';

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
    updatedEntries: string[];
    createdEntries: string[];
    /** Max rows shown per list/table (default 10 for entry lists, unlimited for perClient unless set). */
    perClientLimit?: number;
}

const ENTRY_LIMIT = 10;

/** Pool check summary as a rich notice: count fields, a per-client table, and the run's entries. */
export function buildCheckSummaryNotification(s: CheckSummaryInput): RichNotificationInput {
    const sorted = [...s.perClient].sort((a, b) => a.clientId.localeCompare(b.clientId));
    const shown = s.perClientLimit ? sorted.slice(0, s.perClientLimit) : sorted;
    const entries = (title: string, list: string[]) => ({
        title: list.length > ENTRY_LIMIT ? `${title} (+${list.length - ENTRY_LIMIT} more)` : title,
        columns: ['#', 'Entry'],
        rows: list.slice(0, ENTRY_LIMIT).map((entry, i) => [i + 1, entry]),
        numeric: [0],
    });
    const tables: NonNullable<RichNotificationInput['tables']> = [{
        title: sorted.length > shown.length ? `Per client (+${sorted.length - shown.length} more)` : 'Per client',
        columns: ['Client', 'Active', 'Assigned', 'Inactive', 'Needed', 'Never used', 'Used 24h'],
        rows: shown.map((i) => [i.clientId, i.activeCount, i.assignedCount, i.inactiveCount, i.needed, i.neverUsed, i.usedInLast24Hours]),
        numeric: [1, 2, 3, 4, 5, 6],
    }];
    if (s.updatedEntries.length) tables.push(entries('Updated this run', s.updatedEntries));
    if (s.createdEntries.length) tables.push(entries('Created this run', s.createdEntries));
    return {
        severity: 'info',
        title: `${s.kind} Client Check Summary`,
        summary: `${s.active} active, ${s.inactive} inactive, ${s.unassigned} unassigned; ${s.totalNeeded} needed across ${s.clientsNeedingMore} clients`,
        fields: [
            { label: 'Updates applied', value: s.totalUpdates, code: false },
            { label: 'Created this run', value: s.createdCount, code: false },
            { label: 'Attempted creates', value: s.attemptedCount, code: false },
        ],
        tables,
    };
}
