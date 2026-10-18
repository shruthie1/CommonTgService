import { buildCheckSummaryNotification } from '../check-summary-notification';

const row = (clientId: string, n = 1) => ({ clientId, activeCount: n, assignedCount: n, inactiveCount: 0, needed: 0, neverUsed: 0, usedInLast24Hours: n });
const base = { kind: 'Buffer', active: 3, inactive: 1, unassigned: 0, totalUpdates: 2, createdCount: 1, attemptedCount: 1, totalNeeded: 4, clientsNeedingMore: 2, updatedEntries: [] as string[], createdEntries: [] as string[] };

describe('buildCheckSummaryNotification', () => {
  test('headline numbers are a field table and per-client numbers a right-aligned multi-column table sorted by client', () => {
    const n = buildCheckSummaryNotification({ ...base, perClient: [row('zeta'), row('alpha')] });
    expect(n.title).toBe('Buffer Client Check Summary');
    expect(n.fields?.map((f) => f.label)).toEqual(['Updates applied', 'Created this run', 'Attempted creates']);
    const t = n.tables![0];
    expect(t.columns).toEqual(['Client', 'Active', 'Assigned', 'Inactive', 'Needed', 'Never used', 'Used 24h']);
    expect(t.numeric).toEqual([1, 2, 3, 4, 5, 6]);
    expect(t.rows.map((r) => r[0])).toEqual(['alpha', 'zeta']);
  });

  test('entry tables appear only when something ran, capped at 10 with a count of the rest', () => {
    const none = buildCheckSummaryNotification({ ...base, perClient: [row('a')] });
    expect(none.tables).toHaveLength(1);
    const entries = Array.from({ length: 12 }, (_, i) => `e${i}`);
    const n = buildCheckSummaryNotification({ ...base, perClient: [row('a')], updatedEntries: entries, createdEntries: ['c1'] });
    expect(n.tables!.map((t) => t.title)).toEqual(['Per client', 'Updated this run (+2 more)', 'Created this run']);
    expect(n.tables![1].rows).toHaveLength(10);
  });

  test('perClientLimit caps the per-client rows and says how many are hidden', () => {
    const n = buildCheckSummaryNotification({ ...base, perClient: ['a', 'b', 'c'].map((c) => row(c)), perClientLimit: 2 });
    expect(n.tables![0].rows).toHaveLength(2);
    expect(n.tables![0].title).toBe('Per client (+1 more)');
  });
});
