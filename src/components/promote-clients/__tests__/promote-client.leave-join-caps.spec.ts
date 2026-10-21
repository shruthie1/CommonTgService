/**
 * Promote join-prep / refill guards (2026-10-21 regressions).
 *
 * Leave guard: a fresh account (ENROLLED/SETTLING/IDENTITY) must never be queued to leave its
 * can't-send chats, and any account leaves at most MAX_LEAVES_PER_DAY chats per day. Live: an
 * account enrolled that day left 438 chats in 3h.
 * Join-cap guard: the prep sweep must not connect a mobile already at the daily join cap, and
 * must ask for only the remaining allowance. Live: 41 connects, 23/23 capped, 0 joins.
 *
 * Real MongoDB (memory server) + real PromoteClientService; only Telegram externals are mocked.
 */
import { Connection, Model } from 'mongoose';
import { PromoteClient, PromoteClientSchema } from '../schemas/promote-client.schema';
import { PromoteClientService } from '../promote-client.service';
import { WarmupPhase } from '../../shared/base-client.service';
import {
    MongoTestContext, startMongo, stopMongo,
    makePromoteClientData, resetCounter,
    mockBotsService, mockActiveChannelsService, mockChannelsService, mockSessionService,
} from '../../__tests__/api-test-helpers';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import * as channelInfoModule from '../../../utils/telegram-utils/channelinfo';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../../utils/bot-notice', () => ({
    sendBotNotice: jest.fn(() => Promise.resolve({ sent: true })),
}));
jest.mock('../../../utils/isPermanentError', () => ({
    __esModule: true,
    default: jest.fn(() => false),
}));

describe('PromoteClientService leave + join-cap guards', () => {
    let ctx: MongoTestContext;
    let connection: Connection;
    let PromoteClientModel: Model<PromoteClient>;
    let service: PromoteClientService;
    let activeChannelsService: ReturnType<typeof mockActiveChannelsService>;
    let channelsService: any;
    let bufferModel: Model<any>;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('promote-leave-join-caps-test');
        connection = ctx.connection;
        PromoteClientModel = connection.model<PromoteClient>('PromoteClientLeaveCaps', PromoteClientSchema);
        await PromoteClientModel.init();
        bufferModel = connection.model<any>('BufferForPromoteLeaveCaps', PromoteClientSchema);
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    beforeEach(() => {
        resetCounter();
        activeChannelsService = mockActiveChannelsService();
        channelsService = mockChannelsService();
        channelsService.getActiveChannels = jest.fn().mockResolvedValue([]);
        service = new PromoteClientService(
            PromoteClientModel as any,
            { hasActiveClientSetup: jest.fn(() => false) } as any,
            { search: jest.fn(async () => []), update: jest.fn(async () => 1) } as any,
            activeChannelsService as any,
            {
                findAll: jest.fn(async () => [{ clientId: 'test-client-1', mobile: '15559999999' }]),
                getActiveClientAssignment: jest.fn(async () => null),
            } as any,
            channelsService as any,
            { findAll: jest.fn(async () => []), existsByMobile: jest.fn(async () => false), model: bufferModel } as any,
            mockSessionService() as any,
            mockBotsService() as any,
        );
        jest.spyOn(service as any, 'createTimeout').mockImplementation(() => 1 as any);
    });

    afterEach(async () => {
        await PromoteClientModel.deleteMany({});
        jest.restoreAllMocks();
    });

    function stubTelegram(canSendFalseCount: number) {
        const leaveChannels = jest.fn(async (ids: string[]) => ({ successCount: ids.length, skipCount: 0 }));
        const getClient = jest.spyOn(connectionManager, 'getClient')
            .mockResolvedValue({ client: {}, leaveChannels } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({
            ids: ['a'], canSendFalseCount,
            canSendFalseChats: Array.from({ length: canSendFalseCount }, (_, i) => `${1000 + i}`),
        } as any);
        const candidate = { channelId: 'n1', username: 'n1', canSendMsgs: true };
        activeChannelsService.getActiveChannels.mockResolvedValue([candidate]);
        channelsService.getActiveChannels.mockResolvedValue([candidate]);
        return { getClient, leaveChannels };
    }

    async function seed(mobile: string, phase: string) {
        await service.create(makePromoteClientData({ mobile, channels: 10, status: 'active', clientId: 'test-client-1' }));
        await PromoteClientModel.collection.updateMany({ mobile }, { $set: { warmupPhase: phase } });
    }

    const leaveMap = () => (service as any).leaveChannelMap as Map<string, string[]>;

    describe('leave guard', () => {
        it('prep sweep: ENROLLED account with 438 can\'t-send chats is not queued to leave', async () => {
            await seed('15551700001', WarmupPhase.ENROLLED);
            stubTelegram(438);
            await service.joinchannelForPromoteClients(true);
            expect(leaveMap().has('15551700001')).toBe(false);
        });

        it('refill: ENROLLED account with 438 can\'t-send chats is not queued to leave', async () => {
            await seed('15551700002', WarmupPhase.ENROLLED);
            stubTelegram(438);
            await service.refillJoinQueue();
            expect(leaveMap().has('15551700002')).toBe(false);
        });

        it.each([WarmupPhase.SETTLING, WarmupPhase.IDENTITY])('prep sweep: %s account is not queued to leave', async (phase) => {
            await seed('15551700003', phase);
            stubTelegram(438);
            await service.joinchannelForPromoteClients(true);
            expect(leaveMap().has('15551700003')).toBe(false);
        });

        it('GROWING account is queued, but leaves at most 20 chats per day across rounds', async () => {
            await seed('15551700004', WarmupPhase.GROWING);
            const { leaveChannels } = stubTelegram(438);
            await service.joinchannelForPromoteClients(true);
            expect(leaveMap().has('15551700004')).toBe(true);

            for (let round = 0; round < 10; round++) {
                await (service as any).processLeaveChannelSequentially();
            }
            const left = leaveChannels.mock.calls.reduce((sum, [ids]) => sum + ids.length, 0);
            expect(left).toBe(20);
            // Allowance used up: the rest of the queue is dropped (next run re-queues).
            expect(leaveMap().has('15551700004')).toBe(false);
        });

        it('GROWING account via refill is queued but also capped at 20 leaves per day', async () => {
            await seed('15551700005', WarmupPhase.GROWING);
            const { leaveChannels } = stubTelegram(438);
            await service.refillJoinQueue();
            expect(leaveMap().has('15551700005')).toBe(true);
            for (let round = 0; round < 10; round++) {
                await (service as any).processLeaveChannelSequentially();
            }
            expect(leaveChannels.mock.calls.reduce((sum, [ids]) => sum + ids.length, 0)).toBe(20);
        });
    });

    describe('join-cap guard in the prep sweep', () => {
        it('does not connect a mobile already at the daily join cap', async () => {
            await seed('15551700006', WarmupPhase.GROWING);
            const { getClient } = stubTelegram(0);
            (service as any).resetDailyJoinCountersIfNeeded();
            (service as any).dailyJoinCounts.set('15551700006', 25);
            await service.joinchannelForPromoteClients(true);
            expect(getClient.mock.calls.map(([m]) => m)).not.toContain('15551700006');
        });

        it('asks fetchJoinCandidates for only the remaining daily allowance', async () => {
            await seed('15551700007', WarmupPhase.GROWING);
            stubTelegram(0);
            const fetchJoinCandidates = jest.spyOn(service as any, 'fetchJoinCandidates').mockResolvedValue([]);
            (service as any).resetDailyJoinCountersIfNeeded();
            (service as any).dailyJoinCounts.set('15551700007', 20);
            await service.joinchannelForPromoteClients(true);
            expect(fetchJoinCandidates).toHaveBeenCalledWith('15551700007', 1, 5, expect.anything());
        });
    });
});
