import { Api } from 'telegram';
import { normalizeChatId, expandChatIdVariants, isChannelOrGroupEntity } from '../dialog-chat-utils';

describe('dialog-chat-utils', () => {
    describe('normalizeChatId', () => {
        test('strips leading -100 from a string id', () => {
            expect(normalizeChatId('-1001179403119')).toBe('1179403119');
        });

        test('leaves a plain id unchanged', () => {
            expect(normalizeChatId('1179403119')).toBe('1179403119');
        });

        test('handles numeric input', () => {
            expect(normalizeChatId(123456)).toBe('123456');
        });

        test('handles bigint input', () => {
            expect(normalizeChatId(BigInt('1179403119'))).toBe('1179403119');
        });

        test('only strips the -100 prefix, not embedded -100', () => {
            expect(normalizeChatId('5001005')).toBe('5001005');
        });
    });

    describe('expandChatIdVariants', () => {
        test('returns both normalized and -100 prefixed variants from a -100 id', () => {
            expect(expandChatIdVariants('-1001179403119')).toEqual(['1179403119', '-1001179403119']);
        });

        test('returns both variants from a plain id', () => {
            expect(expandChatIdVariants('1179403119')).toEqual(['1179403119', '-1001179403119']);
        });

        test('works for numeric input', () => {
            expect(expandChatIdVariants(123)).toEqual(['123', '-100123']);
        });
    });

    describe('isChannelOrGroupEntity', () => {
        test('returns true for an Api.Channel instance', () => {
            const channel = Object.create(Api.Channel.prototype);
            expect(isChannelOrGroupEntity(channel)).toBe(true);
        });

        test('returns true for an Api.Chat instance', () => {
            const chat = Object.create(Api.Chat.prototype);
            expect(isChannelOrGroupEntity(chat)).toBe(true);
        });

        test('returns false for a plain object', () => {
            expect(isChannelOrGroupEntity({ id: 1 })).toBe(false);
        });

        test('returns false for null/undefined/primitives', () => {
            expect(isChannelOrGroupEntity(null)).toBe(false);
            expect(isChannelOrGroupEntity(undefined)).toBe(false);
            expect(isChannelOrGroupEntity('channel')).toBe(false);
            expect(isChannelOrGroupEntity(123)).toBe(false);
        });

        test('returns false for an Api.User instance', () => {
            const user = Object.create(Api.User.prototype);
            expect(isChannelOrGroupEntity(user)).toBe(false);
        });
    });
});
