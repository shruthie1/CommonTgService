const mockClientInstances: any[] = [];

jest.mock('telegram', () => ({
    Api: {},
    TelegramClient: jest.fn().mockImplementation((session: any) => {
        const inst: any = {
            session,
            connected: true,
            connect: jest.fn().mockResolvedValue(undefined),
            getMe: jest.fn().mockResolvedValue({ id: 1, phone: '900' }),
            destroy: jest.fn().mockResolvedValue(undefined),
            _eventBuilders: [],
            _destroyed: false,
            _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
        };
        mockClientInstances.push(inst);
        return inst;
    }),
}));

jest.mock('telegram/Helpers', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { getUserFromSession } from '../getUserFromSession';

function makeThis() {
    return {
        logger: {
            logOperation: jest.fn(),
            logError: jest.fn(),
        },
    };
}

describe('getUserFromSession', () => {
    beforeEach(() => {
        mockClientInstances.length = 0;
        process.env.API_ID = '123';
        process.env.API_HASH = 'hash';
    });

    test('throws when session missing', async () => {
        await expect(getUserFromSession.call(makeThis() as any, '', '900')).rejects.toThrow('Session is required');
    });

    test('returns user info and cleans up the temp client', async () => {
        const self = makeThis();
        const user = await getUserFromSession.call(self as any, 'sess', '900');
        expect(user).toMatchObject({ phone: '900' });
        const inst = mockClientInstances[0];
        expect(inst.connect).toHaveBeenCalled();
        expect(inst.destroy).toHaveBeenCalled();
        expect(inst._destroyed).toBe(true);
        expect(inst._sender.disconnect).toHaveBeenCalled();
        expect(self.logger.logOperation).toHaveBeenCalled();
    });

    test('throws when connection cannot be established', async () => {
        const self = makeThis();
        const { TelegramClient } = jest.requireMock('telegram');
        TelegramClient.mockImplementationOnce(() => {
            const inst: any = {
                connected: false,
                connect: jest.fn().mockResolvedValue(undefined),
                getMe: jest.fn(),
                destroy: jest.fn().mockResolvedValue(undefined),
                _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
            };
            mockClientInstances.push(inst);
            return inst;
        });
        await expect(getUserFromSession.call(self as any, 'sess', '900')).rejects.toThrow('Failed to establish connection to Telegram');
    });

    test.each([
        ['AUTH_KEY_UNREGISTERED', 'Session is invalid or expired'],
        ['SESSION_REVOKED', 'Session is invalid or expired'],
        ['SESSION_EXPIRED', 'Session is invalid or expired'],
        ['AUTH_KEY_DUPLICATED', 'Session is invalid because the auth key was duplicated'],
        ['USER_DEACTIVATED', 'User account has been deactivated'],
        ['PHONE_NUMBER_BANNED', 'Phone number has been banned'],
        ['FROZEN_METHOD_INVALID', 'Account is frozen'],
        ['FROZEN_PARTICIPANT_MISSING', 'Account is frozen'],
        ['Connection TIMEOUT occurred', 'Connection timeout while validating session'],
        ['random failure', 'Failed to validate session: random failure'],
    ])('maps %s to friendly error', async (rawMsg, friendly) => {
        const self = makeThis();
        const { TelegramClient } = jest.requireMock('telegram');
        TelegramClient.mockImplementationOnce(() => {
            const inst: any = {
                connected: true,
                connect: jest.fn().mockResolvedValue(undefined),
                getMe: jest.fn().mockRejectedValue(new Error(rawMsg)),
                destroy: jest.fn().mockResolvedValue(undefined),
                _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
            };
            mockClientInstances.push(inst);
            return inst;
        });
        await expect(getUserFromSession.call(self as any, 'sess', '900')).rejects.toThrow(friendly);
    });

    test('handles non-Error throws (unknown error string)', async () => {
        const self = makeThis();
        const { TelegramClient } = jest.requireMock('telegram');
        TelegramClient.mockImplementationOnce(() => {
            const inst: any = {
                connected: true,
                connect: jest.fn().mockResolvedValue(undefined),
                getMe: jest.fn().mockRejectedValue('weird'),
                destroy: jest.fn().mockResolvedValue(undefined),
                _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
            };
            mockClientInstances.push(inst);
            return inst;
        });
        await expect(getUserFromSession.call(self as any, 'sess', '900')).rejects.toThrow('Failed to validate session: Unknown error occurred');
    });

    test('cleanup error is swallowed (logged, not thrown)', async () => {
        const self = makeThis();
        const { TelegramClient } = jest.requireMock('telegram');
        TelegramClient.mockImplementationOnce(() => {
            const inst: any = {
                connected: true,
                connect: jest.fn().mockResolvedValue(undefined),
                getMe: jest.fn().mockResolvedValue({ phone: '900' }),
                destroy: jest.fn().mockRejectedValue(new Error('cleanup boom')),
                _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
            };
            mockClientInstances.push(inst);
            return inst;
        });
        const user = await getUserFromSession.call(self as any, 'sess', '900');
        expect(user).toMatchObject({ phone: '900' });
        expect(self.logger.logError).toHaveBeenCalledWith('900', 'Failed to cleanup temporary client', expect.any(Error));
    });
});
