/**
 * Post-review P1-3 (2026-10-27): auto-enrolment checks the cross-process claim index BEFORE it
 * connects to Telegram, so a broken index costs no session work.
 */
jest.mock('telegram/Helpers', () => ({ ...jest.requireActual('telegram/Helpers'), sleep: jest.fn(async () => undefined) }));
jest.mock('../../../Telegram/utils/connection-manager', () => ({
    connectionManager: { getClient: jest.fn(), unregisterClient: jest.fn(async () => undefined) },
}));
jest.mock('../../../../utils/telegram-utils/channelinfo', () => ({ channelInfo: jest.fn() }));

import { connectionManager } from '../../../Telegram/utils/connection-manager';
import { enrolPoolClientFromUser, type EnrolmentPort } from '../enrolment';
import { BUFFER_PROFILE } from '../pool-profile';

describe('auto-enrol: claim index readiness before the Telegram connect (post-review P1-3, red/green)', () => {
    test('a failing claim index skips the candidate with no Telegram connect', async () => {
        const createIndex = jest.fn(async () => { throw new Error('index build failed'); });
        const logger = { debug: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const port = {
            profile: BUFFER_PROFILE,
            model: { db: { collection: jest.fn(() => ({ createIndex, findOneAndUpdate: jest.fn(), updateOne: jest.fn() })) } },
            logger,
            usersService: { search: jest.fn(async () => []), expireAccount: jest.fn() },
            canonicalMobile: (m: string) => m,
            isMobileEnrolledAnywhere: jest.fn(async () => null),
            updateUser2FAStatus: jest.fn(),
            sendAccountNotice: jest.fn(),
            handleError: jest.fn((e: unknown) => ({ message: String(e), status: 500, error: e })),
            safeUnregisterClient: jest.fn(async () => undefined),
            docExtras: () => ({}),
        } as unknown as EnrolmentPort;

        const result = await enrolPoolClientFromUser(port, { mobile: '919000000120', tgId: 'tg-1' }, 'c1');

        expect(result).toBe(false);
        expect(createIndex).toHaveBeenCalledTimes(1);
        expect(connectionManager.getClient).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('pool claim index not ready: index build failed'));
    });
});
