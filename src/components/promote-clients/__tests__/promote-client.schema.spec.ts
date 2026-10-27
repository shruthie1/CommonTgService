import mongoose from 'mongoose';
import { PromoteClientSchema } from '../schemas/promote-client.schema';

/**
 * Review 2026-10-28: tg-platform writes promoteClients.lastScraped (inactive-mobile-scraper). Live type
 * (2026-10-28): lastScraped date on 247 docs. Declared optional with NO default, so docs without it stay
 * without. daysLeft is not declared: owner 2026-10-28 removed it from promoteClients (nothing read it;
 * tg-platform keeps the SpamBot verdict in Redis tg::acct::{mobile}).
 */
describe('PromoteClientSchema: lastScraped', () => {
    const Model = mongoose.models.PromoteClientSchemaSpec
        || mongoose.model('PromoteClientSchemaSpec', PromoteClientSchema, 'promoteClientsSchemaSpec');

    it('declares lastScraped: Date, optional, no default', () => {
        const ls = PromoteClientSchema.path('lastScraped') as any;
        expect(ls?.instance).toBe('Date');
        expect(ls.isRequired).toBeFalsy();
        expect(ls.defaultValue).toBeUndefined();
    });

    it('a doc without lastScraped gets no value; a given value is kept (not stripped by strict mode)', () => {
        const bare = new Model({ tgId: '1', mobile: '919000000001', lastActive: '2026-01-01', availableDate: '2026-10-28', channels: 1 });
        expect(bare.toObject()).not.toHaveProperty('lastScraped');
        const at = new Date('2026-10-22T13:43:51.393Z');
        const set = new Model({ tgId: '1', mobile: '919000000001', lastActive: '2026-01-01', availableDate: '2026-10-28', channels: 1, lastScraped: at });
        expect(set.toObject()).toMatchObject({ lastScraped: at });
    });
});
