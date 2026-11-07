// accountIdentity writer (tg-platform docs/design/2026-11-07-account-collection-split.md, S3 facet F5; CMS writes the
// `profile` group only). The builder is diffed against tg-platform's in tg-platform
// tests/unit/packages/tg-db/account-identity.test.mjs (MIRROR); this spec covers the CMS write contract.
import { buildAccountIdentityWrite, recordAccountIdentity, recordAccountIdentitySoon } from '../account-identity';

const NOW = new Date('2026-11-07T12:00:00.000Z');
const T1 = new Date('2026-11-07T10:00:00.000Z');
const dup = () => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
const DOC = {
  mobile: '919000000421', updatedAt: T1, tgId: '7021', username: 'shru', assignedFirstName: 'Shruthi', assignedLastName: 'G',
  assignedBio: 'hi', assignedProfilePics: ['https://a/1.jpg'], session: 'S', clientId: 'c1', warmupPhase: 'ready',
};
const input = { pool: 'promote', by: 'cms:promote-update', doc: DOC };

describe('buildAccountIdentityWrite', () => {
  it('_id = mobile, guarded on profile.sourceUpdatedAt; persona + tgId + username; no session / membership / warmup', () => {
    const write = buildAccountIdentityWrite(input, NOW)!;
    expect(write.filter).toEqual({ _id: '919000000421', $or: [{ 'profile.sourceUpdatedAt': { $lte: T1 } }, { 'profile.sourceUpdatedAt': null }] });
    expect(write.update).toEqual({ $set: { v: 1, mobile: '919000000421', updatedAt: NOW, profile: {
      pool: 'promote', tgId: '7021', username: 'shru', assignedFirstName: 'Shruthi', assignedLastName: 'G', assignedBio: 'hi',
      assignedProfilePics: ['https://a/1.jpg'], sourceUpdatedAt: T1, by: 'cms:promote-update',
    } } });
    expect(JSON.stringify(write)).not.toMatch(/session|"S"|clientId|warmupPhase/);
  });

  it('null without a valid pool, producer, doc or doc updatedAt', () => {
    expect(buildAccountIdentityWrite({ ...input, pool: 'main' }, NOW)).toBeNull();
    expect(buildAccountIdentityWrite({ ...input, by: '' }, NOW)).toBeNull();
    expect(buildAccountIdentityWrite({ ...input, doc: { mobile: '1' } }, NOW)).toBeNull();
  });
});

describe('recordAccountIdentity', () => {
  it('written / stale (silent) / lost race (written)', async () => {
    const warn = jest.fn();
    expect(await recordAccountIdentity({ updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }) }, input)).toBe('written');
    expect(await recordAccountIdentity({ updateOne: jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 0 }) }, input, { logger: { warn } })).toBe('stale');
    expect(await recordAccountIdentity({ updateOne: jest.fn().mockRejectedValueOnce(dup()).mockResolvedValueOnce({ matchedCount: 1 }) }, input, { logger: { warn } })).toBe('written');
    expect(warn).not.toHaveBeenCalled();
  });

  it('reject / throw / stall -> failed with one masked warn, bounded by the deadline; Soon is synchronous', async () => {
    for (const updateOne of [jest.fn().mockRejectedValue(new Error('down')), jest.fn(() => { throw new Error('boom'); }), jest.fn(() => new Promise(() => {}))]) {
      const warn = jest.fn();
      expect(await recordAccountIdentity({ updateOne } as any, input, { logger: { warn }, deadlineMs: 30 })).toBe('failed');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/^accountIdentity: .*0421/);
      expect(warn.mock.calls[0][0]).not.toContain('919000000421');
    }
    expect(await recordAccountIdentity(null, input)).toBe('skipped');
    expect(recordAccountIdentitySoon({ updateOne: jest.fn(() => new Promise(() => {})) } as any, input, { deadlineMs: 10 })).toBeUndefined();
  });
});
