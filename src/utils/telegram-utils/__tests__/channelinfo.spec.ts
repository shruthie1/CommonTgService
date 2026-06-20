// No mock of ../channel-live-facts: the REAL getTelegramChannelLiveFacts computes canSendMsgs
// from the (stubbed) dialog entities returned by the fake client.

import { Api } from 'telegram';
import { channelInfo } from '../channelinfo';

// canSendMsgs is true only when none of broadcast/restricted/left/private/forbidden/
// sendMessages/sendPlain are set. Pass flag overrides to make the real fact computation
// yield canSend false.
function makeChannelEntity(id: string, overrides: Record<string, unknown> = {}) {
    return Object.assign(Object.create(Api.Channel.prototype), {
        id: { toString: () => id },
        ...overrides,
    });
}

function makeDialog(opts: { isChannel?: boolean; isGroup?: boolean; entity: any }) {
    return { isChannel: !!opts.isChannel, isGroup: !!opts.isGroup, entity: opts.entity };
}

function makeClient(dialogs: any[]) {
    return {
        iterDialogs: jest.fn(() => {
            let i = 0;
            return {
                [Symbol.asyncIterator]() {
                    return {
                        next() {
                            if (i < dialogs.length) {
                                return Promise.resolve({ value: dialogs[i++], done: false });
                            }
                            return Promise.resolve({ value: undefined, done: true });
                        },
                    };
                },
            };
        }),
    } as any;
}

describe('channelInfo', () => {
    beforeEach(() => jest.clearAllMocks());

    test('throws when client is not initialized', async () => {
        await expect(channelInfo(null as any)).rejects.toThrow('Client is not initialized');
    });

    test('counts canSend true vs false channels and returns ids when requested', async () => {
        // c1: a normal supergroup with no restrictions -> real canSendMsgs === true.
        const c1 = makeChannelEntity('-1001000'); // normalizes to 1000
        // c2: a broadcast channel -> real canSendMsgs === false.
        const c2 = makeChannelEntity('2000', { broadcast: true });
        const dialogs = [
            makeDialog({ isChannel: true, entity: c1 }),
            makeDialog({ isGroup: true, entity: c2 }),
        ];

        const result = await channelInfo(makeClient(dialogs), true);

        expect(result.chatsArrayLength).toBe(2);
        expect(result.canSendTrueCount).toBe(1);
        expect(result.canSendFalseCount).toBe(1);
        expect(result.ids).toEqual(['1000']);
        expect(result.canSendFalseChats).toEqual(['2000']);
    });

    test('omits ids array when sendIds is false (default)', async () => {
        const c1 = makeChannelEntity('1000'); // no restrictions -> real canSendMsgs true

        const result = await channelInfo(makeClient([makeDialog({ isChannel: true, entity: c1 })]));

        expect(result.canSendTrueCount).toBe(1);
        expect(result.ids).toEqual([]);
    });

    test('skips dialogs that are neither channel nor group', async () => {
        const userDialog = makeDialog({ entity: Object.create(Api.User.prototype) });
        const result = await channelInfo(makeClient([userDialog]));

        // Not a channel/group dialog -> never counted, so the live-facts branch never runs.
        expect(result.chatsArrayLength).toBe(0);
        expect(result.canSendTrueCount).toBe(0);
        expect(result.canSendFalseCount).toBe(0);
    });

    test('skips channel dialogs whose entity is not a channel/group entity', async () => {
        // isChannel true but entity is a plain object -> isChannelOrGroupEntity false -> continue
        const dialog = makeDialog({ isChannel: true, entity: { id: { toString: () => '5' } } });
        const result = await channelInfo(makeClient([dialog]));

        // Entity fails isChannelOrGroupEntity -> skipped before the live-facts computation.
        expect(result.chatsArrayLength).toBe(0);
        expect(result.canSendTrueCount).toBe(0);
        expect(result.canSendFalseCount).toBe(0);
    });

    test('treats null liveFacts as canSend false', async () => {
        // An entity whose id normalizes to an invalid channel id makes the REAL
        // getTelegramChannelLiveFacts return null, which channelInfo treats as canSend false.
        const c1 = makeChannelEntity('0');

        const result = await channelInfo(makeClient([makeDialog({ isChannel: true, entity: c1 })]));

        expect(result.canSendFalseCount).toBe(1);
        expect(result.canSendFalseChats).toEqual(['0']);
    });

    test('catches per-dialog errors and continues', async () => {
        // c1: accessing participantsCount throws, so the REAL getTelegramChannelLiveFacts
        // throws (after channelInfo already incremented totalCount) -> caught and skipped.
        const c1 = makeChannelEntity('4000');
        Object.defineProperty(c1, 'participantsCount', {
            get() { throw new Error('boom'); },
            enumerable: true,
        });
        // c2: a clean supergroup -> real canSendMsgs true.
        const c2 = makeChannelEntity('5000');

        const result = await channelInfo(makeClient([
            makeDialog({ isChannel: true, entity: c1 }),
            makeDialog({ isChannel: true, entity: c2 }),
        ]));

        // first errored after totalCount++ so chatsArrayLength counts both
        expect(result.chatsArrayLength).toBe(2);
        expect(result.canSendTrueCount).toBe(1);
    });
});
