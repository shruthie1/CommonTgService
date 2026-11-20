import mongoose from 'mongoose';
import { PromoteStatSchema, stripTgOwnedPaths } from '../schemas/promote-stat.schema';

/**
 * tg-aut promotion-health cycle (tg-platform 2026-11-20): promoteStats.promoHealthPause (with nested retryBase) is
 * written only by tg-aut through the raw driver, each write conditional on the cycle it read. CMS declares it
 * additively (optional, no default, no validator, Mixed: never cast) and read-only: no CMS model update can write it.
 */
describe('PromoteStat schema: promoHealthPause (tg-written, read-only for CMS)', () => {
  const Model = mongoose.model('PromoteStatPromoHealthSpec', PromoteStatSchema);
  const sample = {
    client: 'c1', data: { ch: 1 }, totalCount: 1, uniqueChannels: 1, releaseDay: 1, isActive: true,
    lastUpdatedTimeStamp: 1, channels: ['ch'],
  };
  const cycle = {
    mobile: '919000000000', pausedAt: 100, until: 1900, failedRetries: 2, retriedAt: 1900,
    retryBase: { proc: '123:abc:def', success: 4, failed: 9 },
  };

  /** The update a CMS model query would send, after Mongoose's own casting and the schema's pre hooks. */
  async function sentUpdate(op: 'updateOne' | 'updateMany' | 'findOneAndUpdate', update: Record<string, unknown>) {
    const query = (Model as any)[op]({ client: 'c1' }, update);
    // Run this schema's own query pre hooks for the op (exec() runs them before sending), then Mongoose's update cast.
    const own = ((PromoteStatSchema as any).s.hooks._pres.get(op) ?? []).filter((hook: any) => hook.fn.name === 'stripTgOwned');
    expect(own).toHaveLength(1);
    for (const hook of own) await hook.fn.call(query);
    return query._castUpdate(query.getUpdate());
  }

  it('declares the path as optional, default-free, validator-free Mixed', () => {
    const schemaType = PromoteStatSchema.path('promoHealthPause') as any;
    expect(schemaType).toBeDefined();
    expect(schemaType.instance).toBe('Mixed');
    expect(schemaType.isRequired).toBeFalsy();
    expect(schemaType.defaultValue).toBeUndefined();
    expect(schemaType.validators).toHaveLength(0);
  });

  it('hydrates a stored cycle (retryBase included) and a null cycle unchanged; validation is unchanged', () => {
    const doc = Model.hydrate({ _id: new mongoose.Types.ObjectId(), ...sample, promoHealthPause: cycle });
    expect(doc.toObject().promoHealthPause).toEqual(cycle);
    expect(doc.validateSync()).toBeUndefined();
    const none = Model.hydrate({ _id: new mongoose.Types.ObjectId(), ...sample, promoHealthPause: null });
    expect(none.get('promoHealthPause')).toBeNull();
    expect(new Model(sample).validateSync()).toBeUndefined();
    expect(new Model(sample).toObject()).not.toHaveProperty('promoHealthPause');
  });

  it.each(['updateOne', 'updateMany', 'findOneAndUpdate'] as const)('%s: a CMS update cannot write promoHealthPause or a path under it', async (op) => {
    const plain = await sentUpdate(op, { isActive: false, promoHealthPause: null });
    expect(JSON.stringify(plain)).not.toContain('promoHealthPause');
    expect(JSON.stringify(plain)).toContain('isActive');
    const operators = await sentUpdate(op, {
      $set: { isActive: true, 'promoHealthPause.failedRetries': 0, 'promoHealthPause.retryBase': null },
      $unset: { promoHealthPause: 1 },
      $setOnInsert: { promoHealthPause: cycle },
    });
    expect(JSON.stringify(operators)).not.toContain('promoHealthPause');
    expect(JSON.stringify(operators)).toContain('isActive');
  });

  it('stripTgOwnedPaths leaves other fields alone (the daily reset fields, a near-miss name)', () => {
    const update: Record<string, unknown> = {
      $set: { totalCount: 0, uniqueChannels: 0, releaseDay: 1, lastUpdatedTimeStamp: 1, data: {}, promoHealthPauseNote: 'x' },
      mobile: '9',
    };
    stripTgOwnedPaths(update);
    expect(update).toEqual({
      $set: { totalCount: 0, uniqueChannels: 0, releaseDay: 1, lastUpdatedTimeStamp: 1, data: {}, promoHealthPauseNote: 'x' },
      mobile: '9',
    });
  });
});
