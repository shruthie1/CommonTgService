import mongoose from 'mongoose';
import { StatSchema } from '../stat2.schema';

/**
 * F10 schema drift (data-model review 2026-11-08): tg-platform writes stats2.dailyPaidCountedAt (IST day-key string)
 * and stats2.dailyRevenueCounted (number) through the raw driver (tg-db stats.repository.ts markDailyPaid). The CMS
 * schema declares them additively: optional, no default, no validator, so validation and existing reads are unchanged.
 */
describe('Stat2 schema: tg-written fields (F10)', () => {
  const Model = mongoose.model('Stat2DriftSpec', StatSchema);
  const sample = {
    chatId: '1', count: 1, payAmount: 0, demoGiven: false, demoGivenToday: false, newUser: true,
    paidReply: false, name: 'n', secondShow: false, client: 'c1', profile: 'p1',
  };

  it('declares both paths as optional, default-free and validator-free', () => {
    for (const path of ['dailyPaidCountedAt', 'dailyRevenueCounted']) {
      const schemaType = StatSchema.path(path) as any;
      expect(schemaType).toBeDefined();
      expect(schemaType.isRequired).toBeFalsy();
      expect(schemaType.defaultValue).toBeUndefined();
      expect(schemaType.validators).toHaveLength(0);
    }
    expect(StatSchema.path('dailyPaidCountedAt').instance).toBe('String');
    expect(StatSchema.path('dailyRevenueCounted').instance).toBe('Mixed');
  });

  it('does not change validation of a sample doc with or without the fields', () => {
    expect(new Model(sample).validateSync()).toBeUndefined();
    expect(new Model({ ...sample, dailyPaidCountedAt: '2026-11-08', dailyRevenueCounted: 250 }).validateSync()).toBeUndefined();
    const doc = new Model(sample);
    expect(doc.toObject()).not.toHaveProperty('dailyPaidCountedAt');
    expect(doc.toObject()).not.toHaveProperty('dailyRevenueCounted');
  });

  it('hydrates stored values unchanged (Mixed: no cast, so NaN/legacy values never cast-fail)', () => {
    const doc = Model.hydrate({ _id: new mongoose.Types.ObjectId(), ...sample, dailyPaidCountedAt: '2026-11-08', dailyRevenueCounted: NaN });
    expect(doc.get('dailyPaidCountedAt')).toBe('2026-11-08');
    expect(Number.isNaN(doc.get('dailyRevenueCounted'))).toBe(true);
    expect(doc.validateSync()).toBeUndefined();
  });
});
