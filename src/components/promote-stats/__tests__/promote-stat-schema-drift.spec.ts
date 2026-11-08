import mongoose from 'mongoose';
import { PromoteStatSchema } from '../schemas/promote-stat.schema';

/**
 * F10 schema drift (data-model review 2026-11-08): tg-platform writes promoteStats.count ($inc, legacy rows hold
 * strings/NaN, see tg-db promote-stats.normalize.ts) and promoteStats.mobile (boot stamp) through the raw driver
 * (tg-db promote.repository.ts). The CMS schema declares them additively: optional, no default, no validator.
 */
describe('PromoteStat schema: tg-written fields (F10)', () => {
  const Model = mongoose.model('PromoteStatDriftSpec', PromoteStatSchema);
  const sample = {
    client: 'c1', data: { ch: 1 }, totalCount: 1, uniqueChannels: 1, releaseDay: 1, isActive: true,
    lastUpdatedTimeStamp: 1, channels: ['ch'],
  };

  it('declares both paths as optional, default-free and validator-free', () => {
    for (const path of ['count', 'mobile']) {
      const schemaType = PromoteStatSchema.path(path) as any;
      expect(schemaType).toBeDefined();
      expect(schemaType.isRequired).toBeFalsy();
      expect(schemaType.defaultValue).toBeUndefined();
      expect(schemaType.validators).toHaveLength(0);
    }
    expect(PromoteStatSchema.path('count').instance).toBe('Mixed');
    expect(PromoteStatSchema.path('mobile').instance).toBe('String');
  });

  it('does not change validation of a sample doc with or without the fields', () => {
    expect(new Model(sample).validateSync()).toBeUndefined();
    expect(new Model({ ...sample, count: 3, mobile: '919000000000' }).validateSync()).toBeUndefined();
    const doc = new Model(sample);
    expect(doc.toObject()).not.toHaveProperty('count');
    expect(doc.toObject()).not.toHaveProperty('mobile');
  });

  it('hydrates legacy count values (string, NaN) unchanged without a cast failure', () => {
    for (const count of ['7', NaN, 'abc', null]) {
      const doc = Model.hydrate({ _id: new mongoose.Types.ObjectId(), ...sample, count, mobile: '919000000000' });
      if (typeof count === 'number' && Number.isNaN(count)) expect(Number.isNaN(doc.get('count'))).toBe(true);
      else expect(doc.get('count')).toBe(count);
      expect(doc.get('mobile')).toBe('919000000000');
      expect(doc.validateSync()).toBeUndefined();
    }
  });
});
