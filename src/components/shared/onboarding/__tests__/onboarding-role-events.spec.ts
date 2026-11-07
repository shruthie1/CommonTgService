// accountRoleEvents producers at pool entry (tg-platform docs/design/2026-11-07-account-collection-split.md, S1):
// auto-enrolment and the operator set-as path record `enrolled` (pool + assigned clientId) after the pool write;
// a failing or stalled insert never throws and never delays enrolment.
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../../Telegram/utils/connection-manager', () => ({
    connectionManager: { getClient: jest.fn(), unregisterClient: jest.fn(async () => undefined) },
}));
jest.mock('../../../../utils/telegram-utils/channelinfo', () => ({ channelInfo: jest.fn(async () => ({ ids: ['a', 'b'] })) }));

import { connectionManager } from '../../../Telegram/utils/connection-manager';
import { enrolPoolClientFromUser, type EnrolmentPort } from '../enrolment';
import { setAsPoolClient, type SetAsPort } from '../set-as';
import { BUFFER_PROFILE, PROMOTE_PROFILE } from '../pool-profile';

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Whatever `work` resolves to within 500 ms, else 'blocked'; the timer is always cleared (no open handle). */
async function within500<T>(work: Promise<T>): Promise<T | 'blocked'> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([work, new Promise<'blocked'>((resolve) => { timer = setTimeout(() => resolve('blocked'), 500); })]);
    } finally {
        clearTimeout(timer);
    }
}

function makeModel(insertOne: jest.Mock) {
    const claims = {
        createIndex: jest.fn(async () => 'mobile_unique'),
        findOneAndUpdate: jest.fn(async () => ({})),
        updateOne: jest.fn(async () => ({})),
        findOne: jest.fn(async () => null),
    };
    const roleEvents = { insertOne };
    return {
        db: { collection: jest.fn((name: string) => (name === 'accountRoleEvents' ? roleEvents : claims)) },
        findOneAndUpdate: jest.fn(() => ({ exec: async () => ({}) })),
        aggregate: jest.fn(async () => []),
    };
}

function enrolPort(profile: typeof BUFFER_PROFILE, model: any): EnrolmentPort {
    return {
        profile,
        model,
        logger: { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        usersService: { search: jest.fn(async () => [{ session: 'user-session' }]), expireAccount: jest.fn() },
        canonicalMobile: (m: string) => m,
        isMobileEnrolledAnywhere: jest.fn(async () => null),
        updateUser2FAStatus: jest.fn(),
        sendAccountNotice: jest.fn(async () => true),
        handleError: jest.fn((e: unknown) => ({ message: String(e), status: 500, error: e })),
        safeUnregisterClient: jest.fn(async () => undefined),
        docExtras: () => ({}),
    } as unknown as EnrolmentPort;
}

function setAsPort(profile: typeof BUFFER_PROFILE, model: any): SetAsPort {
    return {
        profile,
        model,
        usersService: {
            search: jest.fn(async () => [{ tgId: 'tg-1', session: 'user-session' }]),
            executeQuery: jest.fn(async () => [{ tgId: 'tg-1' }]),
            expireAccount: jest.fn(),
        },
        clientService: { findAll: jest.fn(async () => [{ clientId: 'shruthi1', mobile: '919999999999' }]) },
        telegramService: { getChannelInfo: jest.fn(async () => ({ ids: ['a'] })) },
        canonicalMobile: (m: string) => m.replace(/^\+/, ''),
        mobilesMatch: (a: string | null | undefined, b: string) => a === b,
        findOne: jest.fn(async () => null),
        otherPoolExistsByMobile: jest.fn(async () => false),
        isMobileEnrolledAnywhere: jest.fn(async () => null),
        withPoolClaimOrRefuse: async <T>(_m: string, fn: () => Promise<T>) => fn(),
        safeUnregisterClient: jest.fn(async () => undefined),
        enrolmentInactiveSince: () => '2026-01-01',
    } as unknown as SetAsPort;
}

beforeEach(() => {
    jest.clearAllMocks();
    (connectionManager.getClient as jest.Mock).mockResolvedValue({ hasPassword: async () => false, client: {} });
});

describe('accountRoleEvents: auto-enrolment', () => {
    it.each([[BUFFER_PROFILE, 'buffer'], [PROMOTE_PROFILE, 'promote']] as const)('%#: enrolled with pool + clientId, by cms:auto-enrol', async (profile, pool) => {
        const insertOne = jest.fn().mockResolvedValue({});
        const ok = await enrolPoolClientFromUser(enrolPort(profile, makeModel(insertOne)), { mobile: '919000000120', tgId: 'tg-1' }, 'shruthi1', '2026-11-07');
        await flush();
        expect(ok).toBe(true);
        expect(insertOne.mock.calls.map((c) => c[0])).toEqual([expect.objectContaining({
            v: 1, event: 'enrolled', mobile: '919000000120', clientId: 'shruthi1', pool, by: 'cms:auto-enrol', details: { availableDate: '2026-11-07' },
            reasonCode: 'enrolment',
        })]);
    });

    it('nothing when the candidate is skipped (2FA already set)', async () => {
        (connectionManager.getClient as jest.Mock).mockResolvedValue({ hasPassword: async () => true, client: {} });
        const insertOne = jest.fn();
        expect(await enrolPoolClientFromUser(enrolPort(BUFFER_PROFILE, makeModel(insertOne)), { mobile: '919000000121', tgId: 'tg-1' }, 'shruthi1')).toBe(false);
        await flush();
        expect(insertOne).not.toHaveBeenCalled();
    });

    it('a stalled or failing insert never delays or fails the enrolment', async () => {
        for (const insertOne of [jest.fn(() => new Promise(() => {})), jest.fn().mockRejectedValue(new Error('mongo down'))]) {
            const outcome = await within500(
                enrolPoolClientFromUser(enrolPort(BUFFER_PROFILE, makeModel(insertOne)), { mobile: '919000000122', tgId: 'tg-1' }, 'shruthi1'),
            );
            expect(outcome).toBe(true);
        }
    });
});

describe('accountRoleEvents: operator set-as', () => {
    it('enrolled with pool + clientId, by cms:set-as', async () => {
        const insertOne = jest.fn().mockResolvedValue({});
        await setAsPoolClient(setAsPort(BUFFER_PROFILE, makeModel(insertOne)), '+919000000130', 'shruthi1', '2026-11-08');
        await flush();
        expect(insertOne.mock.calls.map((c) => c[0])).toEqual([expect.objectContaining({
            event: 'enrolled', mobile: '919000000130', clientId: 'shruthi1', pool: 'buffer', by: 'cms:set-as', details: { availableDate: '2026-11-08' },
            reasonCode: 'enrolment',
        })]);
    });

    it('a failing insert is logged through the port logger (mobile masked)', async () => {
        const port = setAsPort(BUFFER_PROFILE, makeModel(jest.fn().mockRejectedValue(new Error('mongo down'))));
        const warn = jest.fn();
        (port as any).logger = { warn };
        await setAsPoolClient(port, '919000000133', 'shruthi1', '2026-11-08');
        await flush();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).not.toContain('919000000133');
    });

    it('nothing when set-as is refused', async () => {
        const insertOne = jest.fn();
        const port = setAsPort(BUFFER_PROFILE, makeModel(insertOne));
        (port.otherPoolExistsByMobile as jest.Mock).mockResolvedValue(true);
        await expect(setAsPoolClient(port, '919000000131', 'shruthi1', '2026-11-08')).rejects.toThrow();
        await flush();
        expect(insertOne).not.toHaveBeenCalled();
    });

    it('a stalled insert never delays set-as', async () => {
        const insertOne = jest.fn(() => new Promise(() => {}));
        const outcome = await within500(
            setAsPoolClient(setAsPort(PROMOTE_PROFILE, makeModel(insertOne)), '919000000132', 'shruthi1', '2026-11-08').then(() => 'done'),
        );
        expect(outcome).toBe('done');
    });
});
