// accountMembership writer (tg-platform docs/design/2026-11-07-account-collection-split.md, S3 facet F4). The builder is
// diffed against tg-platform's in tg-platform tests/unit/packages/tg-db/account-membership.test.mjs (MIRROR); this spec
// covers the CMS write contract: per-pool guarded upsert, stale / race retry, never throws, client-side deadline.
import { buildAccountMembershipWrite, recordAccountMembership, recordAccountMembershipSoon } from '../account-membership';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const T1 = new Date('2026-11-07T10:00:00.000Z');
const dup = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
const DOC = { mobile: '+919000000221', updatedAt: T1, clientId: 'shruthi1', status: 'active', inUse: true, availableDate: '2026-11-08', lastUsed: T1, message: 'm', session: 'S', warmupPhase: 'ready', assignedBio: 'bio' };
const input = { pool: 'buffer', by: 'cms:buffer-update', doc: DOC };

describe('buildAccountMembershipWrite', () => {
  it('_id = mobile, guarded per pool on pools.<pool>.sourceUpdatedAt; buffer inUse -> main; no session / warmup / persona', () => {
    const write = buildAccountMembershipWrite(input, NOW)!;
    expect(write.filter).toEqual({ _id: '919000000221', $or: [{ 'pools.buffer.sourceUpdatedAt': { $lte: T1 } }, { 'pools.buffer.sourceUpdatedAt': null }] });
    expect(write.update).toEqual({ $set: { v: 1, mobile: '919000000221', updatedAt: NOW, 'pools.buffer': {
      role: 'main', clientId: 'shruthi1', status: 'active', inUse: true, availableDate: '2026-11-08', lastUsed: T1, message: 'm', sourceUpdatedAt: T1, by: 'cms:buffer-update',
    } } });
    expect(JSON.stringify(write)).not.toMatch(/session|"S"|warmupPhase|assignedBio/);
    expect((buildAccountMembershipWrite({ ...input, pool: 'promote' }, NOW)!.update.$set as any)['pools.promote'].role).toBe('promote');
  });

  it('null without a valid pool, producer, doc or doc updatedAt', () => {
    expect(buildAccountMembershipWrite({ ...input, pool: 'main' }, NOW)).toBeNull();
    expect(buildAccountMembershipWrite({ ...input, by: '' }, NOW)).toBeNull();
    expect(buildAccountMembershipWrite({ ...input, doc: { mobile: '1' } }, NOW)).toBeNull();
  });
});

describe('recordAccountMembership', () => {
  it('written / stale (silent) / lost race (written)', async () => {
    const warn = jest.fn();
    const ok = jest.fn().mockResolvedValue({ matchedCount: 1 });
    expect(await recordAccountMembership({ updateOne: ok }, input)).toBe('written');
    expect(ok.mock.calls[0][2]).toEqual({ upsert: true, maxTimeMS: 3_000 });
    expect(await recordAccountMembership({ updateOne: jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 0 }) }, input, { logger: { warn } })).toBe('stale');
    expect(await recordAccountMembership({ updateOne: jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 1 }) }, input, { logger: { warn } })).toBe('written');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reject / throw / stall -> failed with one masked warn, bounded by the deadline; Soon is synchronous', async () => {
    for (const updateOne of [jest.fn().mockRejectedValue(new Error('down')), jest.fn(() => { throw new Error('boom'); }), jest.fn(() => new Promise(() => {}))]) {
      const warn = jest.fn();
      expect(await recordAccountMembership({ updateOne } as any, input, { logger: { warn }, deadlineMs: 30 })).toBe('failed');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/^accountMembership: .*0221/);
      expect(warn.mock.calls[0][0]).not.toContain('919000000221');
    }
    expect(await recordAccountMembership(null, input)).toBe('skipped');
    expect(recordAccountMembershipSoon({ updateOne: jest.fn(() => new Promise(() => {})) } as any, input, { deadlineMs: 10 })).toBeUndefined();
  });
});
