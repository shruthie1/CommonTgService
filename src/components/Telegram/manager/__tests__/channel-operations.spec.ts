import { Api } from 'telegram';
import { leaveChannels } from '../channel-operations';

function makeChannelEntity(id: string, overrides: Record<string, unknown> = {}) {
    return Object.assign(Object.create(Api.Channel.prototype), {
        id: {
            toString: () => id,
        },
        broadcast: true,
        ...overrides,
    });
}

describe('leaveChannels', () => {
    test('resolves a -100 chat ID consistently against dialog entities', async () => {
        const channel = makeChannelEntity('1179403119');
        const ctx = {
            phoneNumber: '9990004444',
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            },
            client: {
                iterDialogs: async function* () {
                    yield { entity: channel };
                },
                getMe: jest.fn().mockResolvedValue({ id: 'me' }),
                invoke: jest.fn().mockResolvedValue(undefined),
            },
        } as any;

        const result = await leaveChannels(ctx, ['-1001179403119']);

        expect(result).toEqual({
            successCount: 1,
            skipCount: 0,
            totalCount: 1,
        });
        expect(ctx.client.invoke).toHaveBeenCalledTimes(1);
        expect(ctx.logger.warn).not.toHaveBeenCalledWith(
            ctx.phoneNumber,
            expect.stringContaining('not found in dialogs'),
        );
    });

    test('reports skipped chats when requested IDs are no longer in dialogs', async () => {
        const ctx = {
            phoneNumber: '9990004445',
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            },
            client: {
                iterDialogs: async function* () {
                    return;
                },
                getMe: jest.fn().mockResolvedValue({ id: 'me' }),
                invoke: jest.fn(),
            },
        } as any;

        const result = await leaveChannels(ctx, ['1179403119']);

        expect(result).toEqual({
            successCount: 0,
            skipCount: 1,
            totalCount: 1,
        });
    });
});
