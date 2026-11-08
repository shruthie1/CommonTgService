// accountHealth writer (tg-platform docs/design/2026-11-07-account-collection-split.md, S2 + "S2 review fixes"): the
// guarded pipeline write (MIRROR of tg-db buildAccountHealthWrite), the verdictAt stale-write guard, spamCheckedAt as
// status-change time, and the best-effort contract (never throws, client-side deadline, one masked warn on failure).
import {
  ACCOUNT_HEALTH_COLLECTION,
  accountHealthCollectionOf,
  buildAccountHealthWrite,
  recordAccountHealth,
  recordAccountHealthSoon,
} from '../account-health';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const T1 = new Date('2026-11-07T10:00:00.000Z');

const dup = () => Object.assign(new Error('E11000 duplicate key error collection: tgclients.accountHealth index: _id_'), { code: 11000 });

/** spamCheckedAt = status-change time: kept while the stored status equals the incoming one, else the verdict time. */
const statusSince = (status: string, at: Date) => ({ $cond: [{ $eq: ['$spamStatus', { $literal: status }] }, { $ifNull: ['$spamCheckedAt', at] }, at] });

describe('buildAccountHealthWrite', () => {
  it('verdict: guarded on verdictAt (<= incoming or absent); spamCheckedAt moves only on a status change; a legacy daysLeft on the input is never written (2026-11-08)', () => {
    const w = buildAccountHealthWrite({
      mobile: '+919000000001', by: 'tg-aut:spambot',
      verdict: { spamStatus: 'limited', limitedUntil: T1.getTime() + 86_400_000, verdictAt: T1.getTime(), spamCheckSource: 'tg-aut', daysLeft: 2 },
    } as any, NOW);
    expect(w).toEqual({
      filter: { _id: '919000000001', $or: [{ verdictAt: { $lte: T1 } }, { verdictAt: null }] },
      update: [{ $set: {
        v: 1, spamStatus: { $literal: 'limited' }, limitedUntil: new Date(T1.getTime() + 86_400_000),
        spamCheckedAt: statusSince('limited', T1), verdictAt: T1,
        spamCheckSource: { $literal: 'tg-aut' }, spamCheckBy: { $literal: 'tg-aut:spambot' }, updatedAt: NOW,
      } }],
    });
  });

  it('verdict without daysLeft: one $set stage, no $unset (old daysLeft / daysLeftBy stay); free / harsh store limitedUntil null', () => {
    const w = buildAccountHealthWrite({
      mobile: '919000000002', by: 'cms:swap-probe',
      verdict: { spamStatus: 'harsh', limitedUntil: T1, verdictAt: T1, spamCheckSource: 'cms-probe' },
    }, NOW)!;
    expect(w.update).toEqual([
      { $set: {
        v: 1, spamStatus: { $literal: 'harsh' }, limitedUntil: null, spamCheckedAt: statusSince('harsh', T1), verdictAt: T1,
        spamCheckSource: { $literal: 'cms-probe' }, spamCheckBy: { $literal: 'cms:swap-probe' }, updatedAt: NOW,
      } },
    ]);
    expect(w.update).toHaveLength(1);
  });

  it('every write is exactly one $set stage with no daysLeft / daysLeftBy, whatever daysLeft the input carries', () => {
    for (const daysLeft of [undefined, null, -1, 0, 5, 3.7, Number.NaN]) {
      const w = buildAccountHealthWrite({
        mobile: '919000000009', by: 'promote:harsh',
        verdict: { spamStatus: 'harsh', verdictAt: T1, spamCheckSource: 'promote', daysLeft },
      } as any, NOW)!;
      expect(w.update).toHaveLength(1);
      expect(Object.keys(w.update[0])).toEqual(['$set']);
      expect(w.update[0].$set).not.toHaveProperty('daysLeft');
      expect(w.update[0].$set).not.toHaveProperty('daysLeftBy');
    }
  });

  it('no stamps: lastChecked / lastHealthCheckAttemptAt are not accountHealth fields', () => {
    expect(buildAccountHealthWrite({ mobile: '919000000003', by: 'cms:health-check', lastHealthCheckAttemptAt: T1 } as any, NOW)).toBeNull();
  });

  it.each([
    [{ mobile: '', by: 'x', verdict: { spamStatus: 'free', verdictAt: T1, spamCheckSource: 'cms-probe' } }],
    [{ mobile: '919000000004', by: '', verdict: { spamStatus: 'free', verdictAt: T1, spamCheckSource: 'cms-probe' } }],
    [{ mobile: '919000000004', by: 'x' }],
    [{ mobile: '919000000004', by: 'x', verdict: { spamStatus: 'unknown', verdictAt: T1, spamCheckSource: 'cms-probe' } }],
    [{ mobile: '919000000004', by: 'x', verdict: { spamStatus: 'free', verdictAt: null, spamCheckSource: 'cms-probe' } }],
    [{ mobile: '919000000004', by: 'x', verdict: { spamStatus: 'free', verdictAt: T1, spamCheckSource: '' } }],
    [{ mobile: '919000000004', by: 'x', verdict: { spamStatus: 'free', spamCheckedAt: T1, spamCheckSource: 'cms-probe' } }],
  ])('nothing valid to write -> null (%#)', (input) => {
    expect(buildAccountHealthWrite(input as any, NOW)).toBeNull();
  });

  it('never carries a session / password / token field', () => {
    const w = buildAccountHealthWrite({ mobile: '919000000005', by: 'x', session: 'S', password: 'P', verdict: { spamStatus: 'free', verdictAt: T1, spamCheckSource: 'cms-probe', token: 'T' } } as any, NOW);
    expect(JSON.stringify(w)).not.toMatch(/session|password|token|"S"|"P"|"T"/);
  });
});

describe('recordAccountHealth', () => {
  const verdictInput = { mobile: '919000000010', by: 'cms:swap-probe', verdict: { spamStatus: 'free', verdictAt: T1, spamCheckSource: 'cms-probe' } };

  it('upserts the guarded write', async () => {
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 0, upsertedCount: 1 });
    expect(await recordAccountHealth({ updateOne }, verdictInput, { now: () => NOW })).toBe('written');
    // Review L9: maxTimeMS on the upsert.
    expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: '919000000010' }), expect.any(Array), { upsert: true, maxTimeMS: 2_500 });
  });

  it('a newer stored verdict: E11000, then the no-upsert retry matches nothing -> stale, nothing logged', async () => {
    const updateOne = jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 0 });
    const logger = { warn: jest.fn() };
    expect(await recordAccountHealth({ updateOne }, verdictInput, { logger })).toBe('stale');
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateOne.mock.calls[1][2]).toEqual({ maxTimeMS: 2_500 }); // no upsert on the retry; review L9: maxTimeMS
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('a lost insert race: E11000, then the retry matches -> written', async () => {
    const updateOne = jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 1 });
    expect(await recordAccountHealth({ updateOne }, verdictInput)).toBe('written');
  });

  it('a failure is one masked warn and never throws', async () => {
    const updateOne = jest.fn().mockRejectedValue(new Error('mongo down'));
    const logger = { warn: jest.fn() };
    expect(await recordAccountHealth({ updateOne }, verdictInput, { logger })).toBe('failed');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('••••0010');
    expect(logger.warn.mock.calls[0][0]).not.toContain('919000000010');
  });

  it('a stalled write resolves at the client-side deadline', async () => {
    const updateOne = jest.fn(() => new Promise(() => {}));
    const started = Date.now();
    expect(await recordAccountHealth({ updateOne }, verdictInput, { deadlineMs: 50 })).toBe('failed');
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('no collection / nothing valid -> skipped', async () => {
    expect(await recordAccountHealth(null, verdictInput)).toBe('skipped');
    expect(await recordAccountHealth({ updateOne: jest.fn() }, { mobile: '919000000011', by: 'x' })).toBe('skipped');
  });

  it('recordAccountHealthSoon returns synchronously even when updateOne throws synchronously', () => {
    const updateOne = jest.fn(() => { throw new Error('sync boom'); });
    expect(() => recordAccountHealthSoon({ updateOne }, verdictInput)).not.toThrow();
  });

  it('accountHealthCollectionOf: model.db.collection(accountHealth) or null', () => {
    const coll = { updateOne: jest.fn() };
    const collection = jest.fn(() => coll);
    expect(accountHealthCollectionOf({ db: { collection } })).toBe(coll);
    expect(collection).toHaveBeenCalledWith(ACCOUNT_HEALTH_COLLECTION);
    expect(accountHealthCollectionOf({})).toBeNull();
    expect(accountHealthCollectionOf({ db: { collection: () => { throw new Error('x'); } } })).toBeNull();
  });
});
