import { buildCheckSummaryNotification } from '../check-summary-notification';

const row = (clientId: string, needed = 0) => ({ clientId, activeCount: 1, assignedCount: 1, inactiveCount: 0, needed, neverUsed: 0, usedInLast24Hours: 1 });
const base = { kind: 'Buffer', active: 3, inactive: 1, unassigned: 2, totalUpdates: 2, createdCount: 1, attemptedCount: 3, totalNeeded: 4, clientsNeedingMore: 2, updatedEntries: [], createdEntries: [] };

describe('buildCheckSummaryNotification', () => {
  test('tables only: pool totals in one row, per-client sorted neediest first with the count in the header', () => {
    const n = buildCheckSummaryNotification({ ...base, perClient: [row('alpha'), row('zeta', 3), row('beta', 1)] });
    expect(n.title).toBe('Buffer check');
    expect(n.summary).toBeUndefined();
    expect(n.fields).toBeUndefined();
    expect(n.tables![0]).toEqual({
      title: 'Pool',
      columns: ['Active', 'Inactive', 'Unassigned', 'Needed (2 clients)', 'Updated', 'Created', 'Tried'],
      rows: [[3, 1, 2, 4, 2, 1, 3]],
      numeric: [0, 1, 2, 3, 4, 5, 6],
    });
    const t = n.tables![1];
    expect(t.columns).toEqual(['Client (3)', 'Active', 'Assigned', 'Inactive', 'Needed', 'Never used', 'Used 24h']);
    expect(t.rows.map((r) => r[0])).toEqual(['zeta', 'beta', 'alpha']);
  });

  test('updated/created accounts get real columns, capped at 10 with a count of the rest', () => {
    const none = buildCheckSummaryNotification({ ...base, perClient: [row('a')] });
    expect(none.tables).toHaveLength(2);
    const updated = Array.from({ length: 12 }, (_, i) => ({ clientId: 'c1', mobile: `91${i}`, change: 'privacy', count: 2 }));
    const n = buildCheckSummaryNotification({ ...base, perClient: [row('a')], updatedEntries: updated, createdEntries: [{ clientId: 'c2', mobile: '9177' }] });
    expect(n.tables!.map((t) => t.title)).toEqual(['Pool', 'Per client', 'Updated (12) (+2 more)', 'Created (1)']);
    expect(n.tables![2].columns).toEqual(['Client', 'Mobile', 'Change', 'Updates']);
    expect(n.tables![2].rows[0]).toEqual(['c1', '910', 'privacy', 2]);
    expect(n.tables![2].rows).toHaveLength(10);
    expect(n.tables![3].rows).toEqual([['c2', '9177']]);
  });

  test('perClientLimit caps the per-client rows and says how many are hidden', () => {
    const n = buildCheckSummaryNotification({ ...base, perClient: ['a', 'b', 'c'].map((c) => row(c)), perClientLimit: 2 });
    expect(n.tables![1].rows).toHaveLength(2);
    expect(n.tables![1].title).toBe('Per client (+1 more)');
    expect(n.tables![1].columns[0]).toBe('Client (3)');
  });
});
