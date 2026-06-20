jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));

import { performOrganicActivity } from '../organic-activity';
import { ClientHelperUtils } from '../client-helper.utils';

beforeEach(() => {
    // Keep gaussianRandom deterministic AND prevent it from consuming our Math.random sequence.
    jest.spyOn(ClientHelperUtils, 'gaussianRandom').mockReturnValue(1);
});

function makeClient(overrides: Record<string, any> = {}) {
    return {
        getMe: jest.fn().mockResolvedValue({ id: 1 }),
        getDialogs: jest.fn().mockResolvedValue([{ entity: {} }]),
        getMessages: jest.fn().mockResolvedValue([]),
        getContacts: jest.fn().mockResolvedValue([]),
        getSelfMSgsInfo: jest.fn().mockResolvedValue([]),
        ...overrides,
    } as any;
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('performOrganicActivity', () => {
    describe('light', () => {
        it('calls getMe and getDialogs(limit:5)', async () => {
            const client = makeClient();
            await performOrganicActivity(client, 'light');
            expect(client.getMe).toHaveBeenCalledTimes(1);
            expect(client.getDialogs).toHaveBeenCalledWith({ limit: 5 });
        });

        it('defaults to light when no intensity passed', async () => {
            const client = makeClient();
            await performOrganicActivity(client);
            expect(client.getDialogs).toHaveBeenCalledWith({ limit: 5 });
        });
    });

    describe('medium', () => {
        it('reads messages from a dialog with entity, then contacts', async () => {
            jest.spyOn(Math, 'random').mockReturnValue(0); // randomIdx = 0
            const client = makeClient({
                getDialogs: jest.fn().mockResolvedValue([{ entity: { id: 1 } }, { entity: { id: 2 } }]),
            });
            await performOrganicActivity(client, 'medium');
            expect(client.getDialogs).toHaveBeenCalledWith({ limit: 15 });
            expect(client.getMessages).toHaveBeenCalledWith({ id: 1 }, 5);
            expect(client.getContacts).toHaveBeenCalledTimes(1);
        });

        it('swallows getMessages and getContacts errors', async () => {
            jest.spyOn(Math, 'random').mockReturnValue(0);
            const client = makeClient({
                getDialogs: jest.fn().mockResolvedValue([{ entity: { id: 1 } }]),
                getMessages: jest.fn().mockRejectedValue(new Error('unreadable')),
                getContacts: jest.fn().mockRejectedValue(new Error('contacts failed')),
            });
            await expect(performOrganicActivity(client, 'medium')).resolves.toBeUndefined();
        });

        it('handles empty dialogs', async () => {
            const client = makeClient({ getDialogs: jest.fn().mockResolvedValue([]) });
            await performOrganicActivity(client, 'medium');
            expect(client.getMessages).not.toHaveBeenCalled();
            expect(client.getContacts).toHaveBeenCalledTimes(1);
        });

        it('handles a dialog without entity', async () => {
            jest.spyOn(Math, 'random').mockReturnValue(0);
            const client = makeClient({ getDialogs: jest.fn().mockResolvedValue([{}]) });
            await performOrganicActivity(client, 'medium');
            expect(client.getMessages).not.toHaveBeenCalled();
            expect(client.getContacts).toHaveBeenCalledTimes(1);
        });
    });

    describe('full', () => {
        function fullDialogs() {
            // 10 dialogs, indices 0 and 1 have entities, others don't to exercise the no-entity branch
            return [
                { entity: { id: 0 } },
                { entity: { id: 1 } },
                {}, {}, {}, {}, {}, {}, {}, {},
            ];
        }

        it('reads 2 dialogs, contacts, and self messages', async () => {
            // numToRead: random=0 -> 2 + floor(0*2) = 2
            // Set-fill: floor(random * min(len,10)=10) must reach size 2.
            //   1st fill: 0 -> {0}; 2nd: 0.15*10=1 -> {0,1}; size 2 done.
            const randomSeq = [0, 0, 0.15];
            let i = 0;
            jest.spyOn(Math, 'random').mockImplementation(() => {
                const v = randomSeq[i] ?? 0.15;
                i++;
                return v;
            });
            const client = makeClient({ getDialogs: jest.fn().mockResolvedValue(fullDialogs()) });
            await performOrganicActivity(client, 'full');
            expect(client.getDialogs).toHaveBeenCalledWith({ limit: 20 });
            // both index 0 and 1 have entities → getMessages called twice
            expect(client.getMessages).toHaveBeenCalledTimes(2);
            expect(client.getContacts).toHaveBeenCalledTimes(1);
            expect(client.getSelfMSgsInfo).toHaveBeenCalledWith(10);
        });

        it('swallows getMessages, getContacts, and getSelfMSgsInfo errors', async () => {
            const randomSeq = [0, 0, 0.15];
            let i = 0;
            jest.spyOn(Math, 'random').mockImplementation(() => {
                const v = randomSeq[i] ?? 0.15;
                i++;
                return v;
            });
            const client = makeClient({
                getDialogs: jest.fn().mockResolvedValue(fullDialogs()),
                getMessages: jest.fn().mockRejectedValue(new Error('unreadable')),
                getContacts: jest.fn().mockRejectedValue(new Error('contacts failed')),
                getSelfMSgsInfo: jest.fn().mockRejectedValue(new Error('saved failed')),
            });
            await expect(performOrganicActivity(client, 'full')).resolves.toBeUndefined();
        });

        it('handles empty dialogs', async () => {
            const client = makeClient({ getDialogs: jest.fn().mockResolvedValue([]) });
            await performOrganicActivity(client, 'full');
            expect(client.getMessages).not.toHaveBeenCalled();
            expect(client.getContacts).toHaveBeenCalledTimes(1);
            expect(client.getSelfMSgsInfo).toHaveBeenCalledWith(10);
        });

        it('skips a selected dialog that has no entity (no getMessages for it)', async () => {
            // numToRead: random=0 -> 2. Set-fill must pick indices that BOTH point
            // at entity-less dialogs so the `if (dialog?.entity)` false branch runs.
            // index 2 and 3 in fullDialogs() have no entity. 0.2*10=2, 0.35*10=3.
            const randomSeq = [0, 0.2, 0.35];
            let i = 0;
            jest.spyOn(Math, 'random').mockImplementation(() => {
                const v = randomSeq[i] ?? 0.35;
                i++;
                return v;
            });
            const client = makeClient({ getDialogs: jest.fn().mockResolvedValue(fullDialogs()) });
            await performOrganicActivity(client, 'full');
            // Both picked dialogs lack an entity → getMessages never called.
            expect(client.getMessages).not.toHaveBeenCalled();
            expect(client.getContacts).toHaveBeenCalledTimes(1);
            expect(client.getSelfMSgsInfo).toHaveBeenCalledWith(10);
        });
    });

    describe('fatal vs non-fatal errors', () => {
        it('re-throws when getMe errors with auth_key_unregistered (message)', async () => {
            const client = makeClient({
                getMe: jest.fn().mockRejectedValue(new Error('AUTH_KEY_UNREGISTERED')),
            });
            await expect(performOrganicActivity(client, 'light')).rejects.toThrow(/auth_key_unregistered/i);
        });

        it('re-throws on session_revoked via errorMessage property', async () => {
            const client = makeClient({
                getMe: jest.fn().mockRejectedValue({ errorMessage: 'SESSION_REVOKED' }),
            });
            await expect(performOrganicActivity(client, 'light')).rejects.toBeDefined();
        });

        it('re-throws on fatal pattern surfaced only via toString', async () => {
            const err: any = { toString: () => 'user_deactivated_ban happened' };
            const client = makeClient({ getMe: jest.fn().mockRejectedValue(err) });
            await expect(performOrganicActivity(client, 'light')).rejects.toBe(err);
        });

        it('swallows non-fatal errors (timeout)', async () => {
            const client = makeClient({
                getMe: jest.fn().mockRejectedValue(new Error('timeout')),
            });
            await expect(performOrganicActivity(client, 'light')).resolves.toBeUndefined();
        });

        it('treats an error with no message/errorMessage/toString as non-fatal (empty-string fallback)', async () => {
            // A thrown value with no message, no errorMessage, and a non-callable
            // toString forces the `|| ''` fallback in isConnectionFatalError. An
            // empty string matches no fatal pattern → swallowed, not re-thrown.
            const err: any = { message: undefined, errorMessage: undefined, toString: null };
            const client = makeClient({ getMe: jest.fn().mockRejectedValue(err) });
            await expect(performOrganicActivity(client, 'light')).resolves.toBeUndefined();
        });
    });
});
