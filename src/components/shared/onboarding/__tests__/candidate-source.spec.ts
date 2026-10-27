import { findEnrolmentCandidates } from '../candidate-source';

/**
 * Review 2026-10-28: users.tgId is a String, so Mongo `sort({ tgId: 1 })` is lexicographic
 * ('10' < '9'). Intent is the lowest NUMERIC tgId first (oldest accounts). The fake below sorts and
 * limits the way Mongo does on a string field, so the old query returns the wrong accounts.
 */
const USERS = [
    { mobile: 'm9', tgId: '9', session: 'S' },
    { mobile: 'm10', tgId: '10', session: 'S' },
    { mobile: 'm100', tgId: '100', session: 'S' },
    { mobile: 'm2', tgId: '2', session: 'S' },
    { mobile: 'm8000000000', tgId: '8000000000', session: 'S' },
];

function fakeUsersService() {
    return {
        executeQuery: jest.fn(async (_q: object, sort?: Record<string, 1 | -1>, limit?: number, _skip?: number, projection?: Record<string, 0 | 1>) => {
            let rows = USERS.map((u) => ({ ...u }));
            if (sort?.tgId) rows.sort((a, b) => (a.tgId < b.tgId ? -1 : a.tgId > b.tgId ? 1 : 0) * sort.tgId);
            if (limit) rows = rows.slice(0, limit);
            if (projection) rows = rows.map((u) => Object.fromEntries(Object.entries(u).filter(([k]) => projection[k] === 1)) as any);
            return rows;
        }),
    };
}

describe('findEnrolmentCandidates: numeric tgId order', () => {
    it('returns the lowest numeric tgIds first, limited', async () => {
        const us = fakeUsersService();
        const rows = await findEnrolmentCandidates(us, [], 3, '2026-07-29');
        expect(rows.map((r) => r.tgId)).toEqual(['2', '9', '10']);
    });

    it('fetches only mobile + tgId (no full user docs / sessions)', async () => {
        const us = fakeUsersService();
        const rows = await findEnrolmentCandidates(us, [], 10, '2026-07-29');
        expect(rows.every((r) => !('session' in r))).toBe(true);
        expect(rows.map((r) => r.tgId)).toEqual(['2', '9', '10', '100', '8000000000']);
    });
});
