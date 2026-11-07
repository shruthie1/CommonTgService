// accountWarmup writer (tg-platform docs/design/2026-11-07-account-collection-split.md, S3 facet F3). The builder is
// diffed against tg-platform's in tg-platform tests/unit/packages/tg-db/account-warmup.test.mjs (MIRROR); this spec
// covers the CMS write contract: guarded upsert, stale / race retry, never throws, client-side deadline.
import {
  ACCOUNT_WARMUP_COLLECTION,
  accountFacetCollectionOf,
  buildAccountWarmupWrite,
  recordAccountWarmup,
  recordAccountWarmupSoon,
} from '../account-warmup';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const T1 = new Date('2026-11-07T10:00:00.000Z');
const dup = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
const DOC = { mobile: '919000000201', updatedAt: T1, warmupPhase: 'ready', lastChecked: T1, lastHealthCheckAttemptAt: T1, session: 'S', clientId: 'c1' };
const input = { pool: 'buffer', by: 'cms:buffer-update', doc: DOC };

describe('buildAccountWarmupWrite', () => {
  it('_id <pool>:<mobile>, guarded on the pool doc updatedAt; stamps included; no session / membership fields', () => {
    const write = buildAccountWarmupWrite(input, NOW)!;
    expect(write.filter).toEqual({ _id: 'buffer:919000000201', $or: [{ sourceUpdatedAt: { $lte: T1 } }, { sourceUpdatedAt: null }] });
    expect(write.update.$set).toMatchObject({ v: 1, mobile: '919000000201', pool: 'buffer', warmupPhase: 'ready', lastChecked: T1, lastHealthCheckAttemptAt: T1, sourceUpdatedAt: T1, by: 'cms:buffer-update', updatedAt: NOW });
    expect(JSON.stringify(write)).not.toMatch(/session|"S"|clientId/);
  });

  it('null without a valid pool, producer, doc or doc updatedAt', () => {
    expect(buildAccountWarmupWrite({ ...input, pool: 'main' }, NOW)).toBeNull();
    expect(buildAccountWarmupWrite({ ...input, by: ' ' }, NOW)).toBeNull();
    expect(buildAccountWarmupWrite({ ...input, doc: null }, NOW)).toBeNull();
    expect(buildAccountWarmupWrite({ ...input, doc: { mobile: '1' } }, NOW)).toBeNull();
  });
});

describe('recordAccountWarmup', () => {
  it('guarded upsert -> written', async () => {
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 0, upsertedCount: 1 });
    expect(await recordAccountWarmup({ updateOne }, input, { now: () => NOW })).toBe('written');
    expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'buffer:919000000201' }), expect.any(Object), { upsert: true, maxTimeMS: 3_000 });
  });

  it('newer stored snapshot -> E11000, no-upsert retry misses -> stale, nothing logged; a lost race -> written', async () => {
    const warn = jest.fn();
    const stale = jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 0 });
    expect(await recordAccountWarmup({ updateOne: stale }, input, { logger: { warn } })).toBe('stale');
    expect(stale.mock.calls[1][2]).toEqual({ maxTimeMS: 3_000 }); // the retry: no upsert, same server-side budget
    const race = jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 1 });
    expect(await recordAccountWarmup({ updateOne: race }, input, { logger: { warn } })).toBe('written');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reject / sync throw / stall -> failed, one masked warn, never throws, bounded by the deadline', async () => {
    for (const updateOne of [
      jest.fn().mockRejectedValue(new Error('mongo down')),
      jest.fn(() => { throw new Error('sync boom'); }),
      jest.fn(() => new Promise(() => {})),
    ]) {
      const warn = jest.fn();
      const started = Date.now();
      expect(await recordAccountWarmup({ updateOne } as any, input, { logger: { warn }, deadlineMs: 30 })).toBe('failed');
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('0201');
      expect(warn.mock.calls[0][0]).not.toContain('919000000201');
    }
  });

  it('no collection / nothing valid -> skipped; a throwing logger is swallowed; recordSoon is synchronous', async () => {
    expect(await recordAccountWarmup(null, input)).toBe('skipped');
    const updateOne = jest.fn();
    expect(await recordAccountWarmup({ updateOne }, { ...input, pool: 'x' })).toBe('skipped');
    expect(updateOne).not.toHaveBeenCalled();
    const bad = { warn: () => { throw new Error('logger broken'); } };
    expect(await recordAccountWarmup({ updateOne: jest.fn().mockRejectedValue(new Error('x')) }, input, { logger: bad })).toBe('failed');
    expect(recordAccountWarmupSoon({ updateOne: jest.fn(() => new Promise(() => {})) } as any, input, { deadlineMs: 10 })).toBeUndefined();
  });

  it('accountFacetCollectionOf resolves model.db.collection(name), null when unwired', () => {
    const col = { updateOne: jest.fn() };
    const collection = jest.fn(() => col);
    expect(accountFacetCollectionOf({ db: { collection } }, ACCOUNT_WARMUP_COLLECTION)).toBe(col);
    expect(collection).toHaveBeenCalledWith('accountWarmup');
    expect(accountFacetCollectionOf({}, ACCOUNT_WARMUP_COLLECTION)).toBeNull();
    expect(accountFacetCollectionOf({ db: { collection: () => { throw new Error('x'); } } }, ACCOUNT_WARMUP_COLLECTION)).toBeNull();
  });
});
