jest.mock('../../../../utils/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../../utils/logbots', () => ({ notifbot: jest.fn().mockReturnValue('http://bot') }));
jest.mock('../../utils/generateTGConfig', () => ({
    generateTGConfig: jest.fn().mockResolvedValue({ apiId: 1, apiHash: 'h', params: {} }),
}));
jest.mock('../../utils/connection-manager', () => ({
    unregisterClient: jest.fn().mockResolvedValue(undefined),
    connectionManager: { unregisterClient: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../../../utils/withTimeout', () => ({
    withTimeout: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

let lastClient: any;
jest.mock('telegram', () => {
    const actual = jest.requireActual('telegram');
    return {
        ...actual,
        TelegramClient: jest.fn().mockImplementation(() => {
            lastClient = {
                connected: true,
                setLogLevel: jest.fn(),
                connect: jest.fn().mockResolvedValue(undefined),
                addEventHandler: jest.fn(),
                destroy: jest.fn().mockResolvedValue(undefined),
                _eventBuilders: [],
                _sender: { disconnect: jest.fn().mockResolvedValue(undefined) },
            };
            return lastClient;
        }),
    };
});
jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn().mockResolvedValue(undefined) };
});

import { StringSession } from 'telegram/sessions';
import { createClient, destroyClient, handleClientError, handleIncomingEvent } from '../client-operations';
import { withTimeout } from '../../../../utils/withTimeout';
import { unregisterClient } from '../../utils/connection-manager';
import { fetchWithTimeout } from '../../../../utils/fetchWithTimeout';

function makeCtx(client: any = null) {
    return {
        client,
        phoneNumber: '900',
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    } as any;
}

describe('createClient', () => {
    afterEach(() => jest.clearAllMocks());

    test('creates connected client with default handler', async () => {
        const ctx = makeCtx();
        const result = await createClient(ctx, new StringSession(''));
        expect(result.apiId).toBe(1);
        expect(result.client).toBe(lastClient);
        expect(lastClient.addEventHandler).toHaveBeenCalled();
        expect(lastClient.setLogLevel).toHaveBeenCalled();
    });

    test('uses custom handler when provided', async () => {
        const ctx = makeCtx();
        const handlerFn = jest.fn();
        await createClient(ctx, new StringSession(''), true, handlerFn);
        expect(ctx.logger.info).toHaveBeenCalledWith('900', 'Adding Custom Event Handler');
        // exercise the registered handler wrapper
        const wrapper = lastClient.addEventHandler.mock.calls[0][0];
        await wrapper({} as any);
        expect(handlerFn).toHaveBeenCalled();
    });

    test('skips handler when handler=false', async () => {
        const ctx = makeCtx();
        await createClient(ctx, new StringSession(''), false);
        expect(lastClient.addEventHandler).not.toHaveBeenCalled();
    });

    test('throws and destroys when client not connected after handler attach', async () => {
        (withTimeout as jest.Mock).mockImplementationOnce(async (fn: any) => fn());
        const ctx = makeCtx();
        const { TelegramClient } = jest.requireMock('telegram');
        TelegramClient.mockImplementationOnce(() => {
            lastClient = {
                connected: false,
                setLogLevel: jest.fn(), connect: jest.fn().mockResolvedValue(undefined),
                addEventHandler: jest.fn(), destroy: jest.fn().mockResolvedValue(undefined),
            };
            return lastClient;
        });
        await expect(createClient(ctx, new StringSession(''))).rejects.toThrow(/not connected/);
        expect(lastClient.destroy).toHaveBeenCalled();
    });

    test('handles destroy failure during error cleanup', async () => {
        const ctx = makeCtx();
        const { TelegramClient } = jest.requireMock('telegram');
        TelegramClient.mockImplementationOnce(() => {
            lastClient = {
                connected: false,
                setLogLevel: jest.fn(), connect: jest.fn().mockResolvedValue(undefined),
                addEventHandler: jest.fn(), destroy: jest.fn().mockRejectedValue(new Error('destroy fail')),
            };
            return lastClient;
        });
        await expect(createClient(ctx, new StringSession(''))).rejects.toThrow();
        expect(ctx.logger.error).toHaveBeenCalledWith('900', 'Error destroying failed client', expect.any(Error));
    });

    test('default-handler wrapper routes to handleIncomingEvent', async () => {
        const ctx = makeCtx();
        await createClient(ctx, new StringSession(''));
        const wrapper = lastClient.addEventHandler.mock.calls[0][0];
        await expect(wrapper({ isPrivate: false } as any)).resolves.toBeUndefined();
    });
});

describe('destroyClient', () => {
    afterEach(() => jest.clearAllMocks());

    test('returns early when no client', async () => {
        await expect(destroyClient(makeCtx(null), new StringSession(''))).resolves.toBeUndefined();
    });

    test('destroys client and performs cleanup', async () => {
        const client = {
            _errorHandler: () => {},
            destroy: jest.fn().mockResolvedValue(undefined),
            _eventBuilders: [1],
            _sender: { disconnect: jest.fn() },
        };
        const session = new StringSession('');
        jest.spyOn(session, 'delete');
        await destroyClient(makeCtx(client), session);
        expect(client.destroy).toHaveBeenCalled();
        expect(client._eventBuilders).toEqual([]);
        expect(session.delete).toHaveBeenCalled();
    });

    test('falls back to sender disconnect when destroy fails', async () => {
        const disconnect = jest.fn().mockResolvedValue(undefined);
        const client = {
            _errorHandler: null,
            destroy: jest.fn().mockRejectedValue(new Error('destroy fail')),
            _sender: { disconnect },
        };
        await destroyClient(makeCtx(client), new StringSession(''));
        expect(disconnect).toHaveBeenCalled();
    });

    test('swallows sender disconnect failure', async () => {
        const client = {
            _errorHandler: null,
            destroy: jest.fn().mockRejectedValue(new Error('destroy fail')),
            _sender: { disconnect: jest.fn().mockRejectedValue(new Error('sender fail')) },
        };
        await expect(destroyClient(makeCtx(client), new StringSession(''))).resolves.toBeUndefined();
    });
});

describe('handleClientError', () => {
    afterEach(() => { jest.clearAllMocks(); jest.useRealTimers(); });

    test('returns null for non-timeout error', () => {
        const result = handleClientError(makeCtx({ connected: true }), new Error('random'));
        expect(result).toBeNull();
    });

    test('schedules unregister on TIMEOUT and fires when disconnected', () => {
        jest.useFakeTimers();
        const ctx = makeCtx({ connected: false });
        const result = handleClientError(ctx, new Error('TIMEOUT'));
        expect(result).not.toBeNull();
        jest.runAllTimers();
        expect(unregisterClient).toHaveBeenCalledWith('900');
    });

    test('logs reconnected when client connected after timeout', () => {
        jest.useFakeTimers();
        const ctx = makeCtx({ connected: true });
        handleClientError(ctx, new Error('TIMEOUT'));
        jest.runAllTimers();
        expect(ctx.logger.debug).toHaveBeenCalledWith('900', 'Client Connected after Retry');
    });

    test('logs client-does-not-exist when client is gone', () => {
        jest.useFakeTimers();
        const ctx = makeCtx();
        ctx.client = null;
        const result = handleClientError(ctx, new Error('TIMEOUT'));
        jest.runAllTimers();
        expect(result).not.toBeNull();
        expect(ctx.logger.debug).toHaveBeenCalledWith('900', 'Client does not exist');
    });
});

describe('handleIncomingEvent', () => {
    afterEach(() => jest.clearAllMocks());

    test('ignores non-private events', async () => {
        await handleIncomingEvent(makeCtx(), { isPrivate: false } as any);
        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    test('notifies on login code from 777000', async () => {
        const event = {
            isPrivate: true,
            message: { chatId: { toString: () => '777000' }, text: 'Login code: 12345', date: 1000 },
        };
        await handleIncomingEvent(makeCtx(), event as any);
        expect(fetchWithTimeout).toHaveBeenCalled();
    });

    test('ignores private messages from other chats', async () => {
        const event = { isPrivate: true, message: { chatId: { toString: () => '999' }, text: 'hi', date: 1 } };
        await handleIncomingEvent(makeCtx(), event as any);
        expect(fetchWithTimeout).not.toHaveBeenCalled();
    });
});
