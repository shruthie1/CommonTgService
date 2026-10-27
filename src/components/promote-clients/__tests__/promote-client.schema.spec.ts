import mongoose from 'mongoose';
import { PromoteClientSchema } from '../schemas/promote-client.schema';

/**
 * Review 2026-10-28: tg-platform writes promoteClients.daysLeft (promotion-engine setDaysLeft) and
 * lastScraped (inactive-mobile-scraper). Live types (2026-10-28): daysLeft int on 261 docs,
 * lastScraped date on 247. Declared optional with NO default, so docs without them stay without.
 */
describe('PromoteClientSchema: daysLeft + lastScraped', () => {
    const Model = mongoose.models.PromoteClientSchemaSpec
        || mongoose.model('PromoteClientSchemaSpec', PromoteClientSchema, 'promoteClientsSchemaSpec');

    it('declares daysLeft: Number and lastScraped: Date, optional, no defaults', () => {
        const dl = PromoteClientSchema.path('daysLeft') as any;
        const ls = PromoteClientSchema.path('lastScraped') as any;
        expect(dl?.instance).toBe('Number');
        expect(ls?.instance).toBe('Date');
        expect(dl.isRequired).toBeFalsy();
        expect(ls.isRequired).toBeFalsy();
        expect(dl.defaultValue).toBeUndefined();
        expect(ls.defaultValue).toBeUndefined();
    });

    it('a doc without them gets no value; given values are kept (not stripped by strict mode)', () => {
        const bare = new Model({ tgId: '1', mobile: '919000000001', lastActive: '2026-01-01', availableDate: '2026-10-28', channels: 1 });
        expect(bare.toObject()).not.toHaveProperty('daysLeft');
        expect(bare.toObject()).not.toHaveProperty('lastScraped');
        const at = new Date('2026-10-22T13:43:51.393Z');
        const set = new Model({ tgId: '1', mobile: '919000000001', lastActive: '2026-01-01', availableDate: '2026-10-28', channels: 1, daysLeft: -1, lastScraped: at });
        expect(set.toObject()).toMatchObject({ daysLeft: -1, lastScraped: at });
    });
});
