import { getTelegramCommonChatIds } from '../common-chats';
import { Api } from 'telegram/tl';

describe('getTelegramCommonChatIds', () => {
    function makeClient(result: any) {
        return { invoke: jest.fn().mockResolvedValue(result) };
    }

    test('throws when client is missing', async () => {
        await expect(getTelegramCommonChatIds(null as any, { userId: 'u' })).rejects.toThrow(
            'Telegram client with invoke is required',
        );
    });

    test('throws when client.invoke is not a function', async () => {
        await expect(
            getTelegramCommonChatIds({ invoke: undefined } as any, { userId: 'u' }),
        ).rejects.toThrow('Telegram client with invoke is required');
    });

    test('returns normalized, deduplicated channel ids', async () => {
        const client = makeClient({
            chats: [
                { id: '-1001000' },
                { id: '1000' }, // duplicate after normalization
                { id: '2000' },
            ],
        });

        const ids = await getTelegramCommonChatIds(client, { userId: 'user1' });

        expect(ids).toEqual(['1000', '2000']);
        expect(client.invoke).toHaveBeenCalledTimes(1);
        expect(client.invoke.mock.calls[0][0]).toBeInstanceOf(Api.messages.GetCommonChats);
    });

    test('skips chats with invalid/empty ids', async () => {
        const client = makeClient({ chats: [{ id: null }, { id: undefined }, {}, { id: '500' }] });

        const ids = await getTelegramCommonChatIds(client, { userId: 'u' });

        expect(ids).toEqual(['500']);
    });

    test('returns empty array when result has no chats array', async () => {
        const client = makeClient({ chats: null });
        expect(await getTelegramCommonChatIds(client, { userId: 'u' })).toEqual([]);
    });

    test('returns empty array when result is null/undefined', async () => {
        const client = makeClient(undefined);
        expect(await getTelegramCommonChatIds(client, { userId: 'u' })).toEqual([]);
    });

    test('normalizes a numeric limit and clamps to 500 max', async () => {
        const client = makeClient({ chats: [] });
        await getTelegramCommonChatIds(client, { userId: 'u', limit: 9999 });
        const req = client.invoke.mock.calls[0][0] as any;
        expect(Number(req.limit)).toBe(500);
    });

    test('floors fractional limits', async () => {
        const client = makeClient({ chats: [] });
        await getTelegramCommonChatIds(client, { userId: 'u', limit: 12.9 });
        const req = client.invoke.mock.calls[0][0] as any;
        expect(Number(req.limit)).toBe(12);
    });

    test('defaults limit to 100 for invalid/zero/negative limit', async () => {
        const client = makeClient({ chats: [] });
        await getTelegramCommonChatIds(client, { userId: 'u', limit: 0 });
        let req = client.invoke.mock.calls[0][0] as any;
        expect(Number(req.limit)).toBe(100);

        client.invoke.mockClear();
        await getTelegramCommonChatIds(client, { userId: 'u', limit: -5 });
        req = client.invoke.mock.calls[0][0] as any;
        expect(Number(req.limit)).toBe(100);
    });

    test('normalizes maxId from a number', async () => {
        const client = makeClient({ chats: [] });
        await getTelegramCommonChatIds(client, { userId: 'u', maxId: 42 });
        const req = client.invoke.mock.calls[0][0] as any;
        expect(req.maxId.toString()).toBe('42');
    });

    test('normalizes maxId from a numeric string', async () => {
        const client = makeClient({ chats: [] });
        await getTelegramCommonChatIds(client, { userId: 'u', maxId: '777' });
        const req = client.invoke.mock.calls[0][0] as any;
        expect(req.maxId.toString()).toBe('777');
    });

    test('normalizes maxId from an object with toString', async () => {
        const client = makeClient({ chats: [] });
        await getTelegramCommonChatIds(client, { userId: 'u', maxId: { toString: () => '999' } });
        const req = client.invoke.mock.calls[0][0] as any;
        expect(req.maxId.toString()).toBe('999');
    });

    test('defaults maxId to 0 for negative number / empty string / unsupported input', async () => {
        const client = makeClient({ chats: [] });
        await getTelegramCommonChatIds(client, { userId: 'u', maxId: -1 });
        let req = client.invoke.mock.calls[0][0] as any;
        expect(req.maxId.toString()).toBe('0');

        client.invoke.mockClear();
        await getTelegramCommonChatIds(client, { userId: 'u', maxId: '   ' });
        req = client.invoke.mock.calls[0][0] as any;
        expect(req.maxId.toString()).toBe('0');

        client.invoke.mockClear();
        await getTelegramCommonChatIds(client, { userId: 'u', maxId: undefined });
        req = client.invoke.mock.calls[0][0] as any;
        expect(req.maxId.toString()).toBe('0');
    });
});
