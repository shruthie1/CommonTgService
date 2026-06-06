import { getTelegramChannelLiveFacts, normalizeTelegramChannelId } from '../channel-live-facts';

function makeEntity(overrides: Record<string, unknown> = {}) {
    return {
        id: 123456,
        title: 'Test Channel',
        username: 'test_channel',
        participantsCount: 5000,
        broadcast: false,
        restricted: false,
        left: false,
        private: false,
        forbidden: false,
        megagroup: true,
        defaultBannedRights: { sendMessages: false, sendPlain: false },
        ...overrides,
    };
}

const stubClient = { getEntity: jest.fn() };

describe('getTelegramChannelLiveFacts', () => {
    beforeEach(() => stubClient.getEntity.mockReset());

    test('returns canSendMsgs=true for a normal megagroup', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity(),
        });

        expect(result).toMatchObject({
            channelId: '123456',
            canSendMsgs: true,
            broadcast: false,
            sendMessages: false,
            sendPlain: false,
        });
        expect(stubClient.getEntity).not.toHaveBeenCalled();
    });

    test('returns canSendMsgs=false for broadcast channels', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ broadcast: true }),
        });

        expect(result!.canSendMsgs).toBe(false);
        expect(result!.broadcast).toBe(true);
    });

    test('returns canSendMsgs=false when defaultBannedRights.sendMessages is true', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ defaultBannedRights: { sendMessages: true, sendPlain: false } }),
        });

        expect(result!.canSendMsgs).toBe(false);
        expect(result!.sendMessages).toBe(true);
    });

    test('returns canSendMsgs=false when defaultBannedRights.sendPlain is true', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ defaultBannedRights: { sendMessages: false, sendPlain: true } }),
        });

        expect(result!.canSendMsgs).toBe(false);
        expect(result!.sendPlain).toBe(true);
    });

    test('detects ChannelForbidden by className', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ className: 'ChannelForbidden' }),
        });

        expect(result!.forbidden).toBe(true);
        expect(result!.private).toBe(true);
        expect(result!.canSendMsgs).toBe(false);
    });

    test('returns canSendMsgs=false for restricted channels', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ restricted: true }),
        });

        expect(result!.canSendMsgs).toBe(false);
    });

    test('returns canSendMsgs=false for left channels', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ left: true }),
        });

        expect(result!.canSendMsgs).toBe(false);
    });

    test('returns null for invalid channelId', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '',
            entity: makeEntity(),
        });

        expect(result).toBeNull();
    });

    test('returns null for non-object entity', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: 'not-an-object',
        });

        expect(result).toBeNull();
    });

    test('falls back to client.getEntity when entity is not provided', async () => {
        stubClient.getEntity.mockResolvedValue(makeEntity());

        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
        });

        expect(stubClient.getEntity).toHaveBeenCalledWith('-100123456');
        expect(result!.canSendMsgs).toBe(true);
    });

    test('uses resolveParticipantsCount callback when provided', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ participantsCount: 100 }),
            resolveParticipantsCount: async () => 9999,
        });

        expect(result!.participantsCount).toBe(9999);
    });

    test('falls back to entity.participantsCount when resolver returns null', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ participantsCount: 3000 }),
            resolveParticipantsCount: async () => null,
        });

        expect(result!.participantsCount).toBe(3000);
    });

    test('strips -100 prefix from channelId', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '-100123456',
            entity: makeEntity(),
        });

        expect(result!.channelId).toBe('123456');
    });

    test('handles missing defaultBannedRights gracefully', async () => {
        const result = await getTelegramChannelLiveFacts(stubClient, {
            channelId: '123456',
            entity: makeEntity({ defaultBannedRights: undefined }),
        });

        expect(result!.canSendMsgs).toBe(true);
        expect(result!.sendMessages).toBe(false);
        expect(result!.sendPlain).toBe(false);
    });
});

describe('normalizeTelegramChannelId', () => {
    test('returns digits for valid id', () => {
        expect(normalizeTelegramChannelId('123456')).toBe('123456');
    });

    test('strips -100 prefix', () => {
        expect(normalizeTelegramChannelId('-100123456')).toBe('123456');
    });

    test('strips single dash prefix', () => {
        expect(normalizeTelegramChannelId('-123456')).toBe('123456');
    });

    test('returns empty for zero', () => {
        expect(normalizeTelegramChannelId('0')).toBe('');
    });

    test('returns empty for non-numeric', () => {
        expect(normalizeTelegramChannelId('abc')).toBe('');
    });

    test('returns empty for null/undefined', () => {
        expect(normalizeTelegramChannelId(null)).toBe('');
        expect(normalizeTelegramChannelId(undefined)).toBe('');
    });
});
