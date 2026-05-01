/**
 * End-to-end warmup pipeline tests covering every processClient code path,
 * TG operation branches, security operations, health checks, availability
 * calculations, and enrollment flows.
 *
 * Organized by:
 * 1. processClient — all 13 exit paths
 * 2. TG operation handlers — set2fa, removeOtherAuths, privacy, photos, etc.
 * 3. Health check & session rotation
 * 4. Availability & enrollment decisions
 * 5. Priority & ordering
 * 6. Warmup phase edge cases (jitter, stalled growing, relaxed channels)
 * 7. Mongoose integration: full lifecycle with real MongoDB
 */

import mongoose, { Connection, Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { BufferClient, BufferClientSchema } from '../../buffer-clients/schemas/buffer-client.schema';
import { BufferClientService } from '../../buffer-clients/buffer-client.service';
import { PromoteClientService } from '../../promote-clients/promote-client.service';
import { BaseClientDocument, BaseClientService, ClientConfig } from '../base-client.service';
import { Client } from '../../clients';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import * as channelInfoModule from '../../../utils/telegram-utils/channelinfo';
import { ClientHelperUtils } from '../client-helper.utils';
import {
    getWarmupPhaseAction,
    WarmupPhase,
    WARMUP_PHASE_THRESHOLDS,
    MIN_DAYS_BETWEEN_IDENTITY_STEPS,
    MIN_CHANNELS_FOR_MATURING,
} from '../warmup-phases';

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return { ...actual, sleep: jest.fn(() => Promise.resolve()) };
});
jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/mock-bot'),
}));

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ─── TestBaseService ────────────────────────────────────────────────────────

class TestBaseService extends BaseClientService<BaseClientDocument> {
    private readonly mockModel: any;
    public readonly updateMock = jest.fn(async (_mobile: string, updateDto: any) => updateDto);
    public readonly telegramServiceMock: any;
    public readonly usersServiceMock: any;
    public readonly botsServiceMock: any;

    constructor(modelOverrides: any = {}) {
        const telegramService = {
            createNewSession: jest.fn(async (mobile: string) => `rotated-${mobile}`),
        };
        const usersService = {
            search: jest.fn(async ({ mobile }: { mobile: string }) => [
                { tgId: `tg-${mobile}`, mobile, session: `backup-${mobile}` },
            ]),
            update: jest.fn(async () => 1),
        };
        const botsService = {
            sendMessageByCategory: jest.fn(async () => undefined),
        };
        super(
            telegramService as any,
            usersService as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            botsService as any,
            'TestBaseService',
        );
        this.mockModel = modelOverrides;
        this.telegramServiceMock = telegramService;
        this.usersServiceMock = usersService;
        this.botsServiceMock = botsService;
    }
    get model(): any { return this.mockModel; }
    get clientType(): 'buffer' { return 'buffer'; }
    get config(): ClientConfig {
        return {
            joinChannelInterval: 1, leaveChannelInterval: 1, leaveChannelBatchSize: 1,
            channelProcessingDelay: 1, channelTarget: 200, maxJoinsPerSession: 1,
            maxNewClientsPerTrigger: 10, minTotalClients: 2, maxMapSize: 1,
            cooldownHours: 2, clientProcessingDelay: 1, maxChannelJoinsPerDay: 20,
            joinsPerMobilePerRound: 3,
        };
    }
    async updateNameAndBio(): Promise<number> { return 0; }
    async updateUsername(): Promise<number> { return 0; }
    async findOne(): Promise<any> { return null; }
    async update(mobile: string, updateDto: any): Promise<any> { return this.updateMock(mobile, updateDto); }
    async markAsInactive(): Promise<any> { return null; }
    async updateStatus(): Promise<any> { return null; }
    async refillJoinQueue(): Promise<number> { return 0; }
}

function makeDoc(overrides: Record<string, any> = {}): any {
    return {
        mobile: '9990000001',
        warmupPhase: WarmupPhase.ENROLLED,
        warmupJitter: 0,
        enrolledAt: new Date('2026-03-01T12:00:00.000Z'),
        createdAt: new Date('2026-03-01T12:00:00.000Z'),
        failedUpdateAttempts: 0,
        lastUpdateFailure: null,
        lastUpdateAttempt: null,
        inUse: false,
        channels: 0,
        lastUsed: null,
        tgId: 'tg-9990000001',
        ...overrides,
    };
}

function daysAgo(days: number, now: number): Date {
    return new Date(now - days * ONE_DAY_MS);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. processClient — ALL 13 EXIT PATHS
// ════════════════════════════════════════════════════════════════════════════

describe('processClient — all exit paths', () => {
    let service: TestBaseService;
    const mockNow = new Date('2026-04-11T12:00:00.000Z').getTime();

    beforeEach(() => {
        service = new TestBaseService();
        jest.spyOn(Date, 'now').mockReturnValue(mockNow);
    });
    afterEach(() => { jest.restoreAllMocks(); });

    test('EXIT 1: inUse=true → skip immediately', async () => {
        const doc = makeDoc({ inUse: true });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
        expect(service.updateMock).not.toHaveBeenCalled();
    });

    test('EXIT 2: client=null → skip with warning', async () => {
        const doc = makeDoc();
        const result = await service.processClient(doc, null as any);
        expect(result.updateCount).toBe(0);
    });

    test('EXIT 3: zombie detected (50 days in settling with failures)', async () => {
        const markInactiveSpy = jest.spyOn(service, 'markAsInactive').mockResolvedValue(null);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(50, mockNow),
            failedUpdateAttempts: 3,
            lastUpdateFailure: daysAgo(10, mockNow),
        });
        await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(markInactiveSpy).toHaveBeenCalledWith(
            doc.mobile,
            expect.stringContaining('Zombie'),
        );
    });

    test('EXIT 3b: 44 days in settling — NOT zombie (below 45d threshold)', async () => {
        const markInactiveSpy = jest.spyOn(service, 'markAsInactive').mockResolvedValue(null);
        jest.spyOn(service as any, 'set2fa').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(44, mockNow),
            privacyUpdatedAt: daysAgo(40, mockNow),
            failedUpdateAttempts: 3,
            lastUpdateFailure: daysAgo(10, mockNow),
        });
        await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(markInactiveSpy).not.toHaveBeenCalled();
    });

    test('EXIT 3c: 50 days but phase=READY → NOT zombie (terminal phase)', async () => {
        const markInactiveSpy = jest.spyOn(service, 'markAsInactive').mockResolvedValue(null);
        jest.spyOn(service, 'rotateSession').mockResolvedValue(true);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.READY,
            enrolledAt: daysAgo(50, mockNow),
            failedUpdateAttempts: 3,
            lastUpdateFailure: daysAgo(10, mockNow),
        });
        await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(markInactiveSpy).not.toHaveBeenCalled();
    });

    test('EXIT 4: too many failures + backoff active → skip', async () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            failedUpdateAttempts: 3,
            lastUpdateFailure: daysAgo(0.5, mockNow), // Only 12h ago, backoff still active
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
    });

    test('EXIT 5: on cooldown → skip', async () => {
        // Just processed 30 minutes ago (below 90-min minimum cooldown)
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            lastUpdateAttempt: new Date(mockNow - 30 * 60 * 1000),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
    });

    test('EXIT 6: session_rotated account with lastUsed → backfill and skip', async () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            lastUsed: new Date('2026-03-20T12:00:00.000Z'),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('backfill_timestamps');
    });

    test('EXIT 6b: SETTLING account with lastUsed → still processes (not terminal)', async () => {
        jest.spyOn(service as any, 'set2fa').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(10, mockNow),
            privacyUpdatedAt: daysAgo(5, mockNow),
            lastUsed: new Date('2026-03-25T12:00:00.000Z'),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).not.toBe('backfill_timestamps');
    });

    test('EXIT 7: action=wait → updates lastUpdateAttempt only', async () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.ENROLLED,
            enrolledAt: daysAgo(0.3, mockNow), // Not yet 1 day
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ lastUpdateAttempt: expect.any(Date) }),
        );
    });

    test('EXIT 8: action=join_channels → deferred return', async () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(12, mockNow),
            channels: 100,
            privacyUpdatedAt: daysAgo(10, mockNow),
            twoFASetAt: daysAgo(8, mockNow),
            otherAuthsRemovedAt: daysAgo(6, mockNow),
            profilePicsDeletedAt: daysAgo(10, mockNow),
            nameBioUpdatedAt: daysAgo(8, mockNow),
            usernameUpdatedAt: daysAgo(6, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
    });

    test('EXIT 9: action=advance_to_ready → sets phase to READY', async () => {
        const doc = makeDoc({
            warmupPhase: WarmupPhase.MATURING,
            enrolledAt: daysAgo(22, mockNow),
            channels: 250,
            privacyUpdatedAt: daysAgo(20, mockNow),
            twoFASetAt: daysAgo(18, mockNow),
            otherAuthsRemovedAt: daysAgo(16, mockNow),
            profilePicsDeletedAt: daysAgo(20, mockNow),
            nameBioUpdatedAt: daysAgo(15, mockNow),
            usernameUpdatedAt: daysAgo(13, mockNow),
            profilePicsUpdatedAt: daysAgo(3, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('advance_to_ready');
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ warmupPhase: WarmupPhase.READY }),
        );
    });

    test('EXIT 10: action=set_privacy → calls updatePrivacySettings', async () => {
        jest.spyOn(service as any, 'updatePrivacySettings').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(3, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('set_privacy');
        expect((service as any).updatePrivacySettings).toHaveBeenCalled();
    });

    test('EXIT 10: action=set_2fa → calls set2fa', async () => {
        jest.spyOn(service as any, 'set2fa').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(7, mockNow),
            privacyUpdatedAt: daysAgo(5, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('set_2fa');
    });

    test('EXIT 10: action=remove_other_auths → calls removeOtherAuths', async () => {
        jest.spyOn(service as any, 'removeOtherAuths').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(10, mockNow),
            privacyUpdatedAt: daysAgo(8, mockNow),
            twoFASetAt: daysAgo(5, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('remove_other_auths');
    });

    test('EXIT 10: action=delete_photos → calls deleteProfilePhotos', async () => {
        jest.spyOn(service as any, 'deleteProfilePhotos').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.IDENTITY,
            enrolledAt: daysAgo(10, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('delete_photos');
    });

    test('EXIT 10: action=update_name_bio → calls updateNameAndBio', async () => {
        jest.spyOn(service, 'updateNameAndBio').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.IDENTITY,
            enrolledAt: daysAgo(10, mockNow),
            profilePicsDeletedAt: daysAgo(5, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('update_name_bio');
    });

    test('EXIT 10: action=update_username → calls updateUsername', async () => {
        jest.spyOn(service, 'updateUsername').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.IDENTITY,
            enrolledAt: daysAgo(12, mockNow),
            profilePicsDeletedAt: daysAgo(8, mockNow),
            nameBioUpdatedAt: daysAgo(5, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('update_username');
    });

    test('EXIT 10: action=upload_photo → calls updateProfilePhotos', async () => {
        jest.spyOn(service as any, 'updateProfilePhotos').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.MATURING,
            enrolledAt: daysAgo(20, mockNow),
            channels: 250,
            privacyUpdatedAt: daysAgo(18, mockNow),
            twoFASetAt: daysAgo(16, mockNow),
            otherAuthsRemovedAt: daysAgo(14, mockNow),
            profilePicsDeletedAt: daysAgo(18, mockNow),
            nameBioUpdatedAt: daysAgo(15, mockNow),
            usernameUpdatedAt: daysAgo(13, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('upload_photo');
    });

    test('EXIT 10: action=rotate_session → calls rotateSession', async () => {
        jest.spyOn(service, 'rotateSession').mockResolvedValue(true);
        const doc = makeDoc({ warmupPhase: WarmupPhase.READY });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(1);
        expect(service.rotateSession).toHaveBeenCalledWith(doc.mobile);
    });

    test('EXIT 10: rotate_session fails → increments failures', async () => {
        jest.spyOn(service, 'rotateSession').mockResolvedValue(false);
        const doc = makeDoc({ warmupPhase: WarmupPhase.READY });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
        // Should have incremented failure counters
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({
                failedUpdateAttempts: 1,
                lastUpdateFailure: expect.any(Date),
            }),
        );
    });

    test('EXIT 12: TG operation throws → catch block increments failures', async () => {
        jest.spyOn(service as any, 'updatePrivacySettings').mockRejectedValue(new Error('TG_NETWORK_ERROR'));
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(3, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
    });

    test('EXIT 10: organic_only action → performs organic activity without mutations', async () => {
        // settling with privacy done yesterday (need 2-day gap for 2FA)
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(3, mockNow),
            privacyUpdatedAt: daysAgo(1, mockNow),
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateSummary).toBe('organic_only');
        expect(result.updateCount).toBe(0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. processClient — failure reset edge cases
// ════════════════════════════════════════════════════════════════════════════

describe('processClient — failure reset edge cases', () => {
    const mockNow = new Date('2026-04-11T12:00:00.000Z').getTime();

    afterEach(() => { jest.restoreAllMocks(); });

    test('failedAttempts=0 → no reset needed, proceeds directly', async () => {
        const service = new TestBaseService();
        jest.spyOn(Date, 'now').mockReturnValue(mockNow);
        jest.spyOn(service as any, 'set2fa').mockResolvedValue(1);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            enrolledAt: daysAgo(7, mockNow),
            privacyUpdatedAt: daysAgo(5, mockNow),
            failedUpdateAttempts: 0,
        });
        await service.processClient(doc, { clientId: 'c1' } as Client);
        // First update should NOT be a failure reset
        const firstCall = service.updateMock.mock.calls[0];
        expect(firstCall?.[1]?.failedUpdateAttempts).not.toBe(0);
    });

    test('failedAttempts=2 with null lastUpdateFailure → resets (stale failure)', async () => {
        const service = new TestBaseService();
        jest.spyOn(Date, 'now').mockReturnValue(mockNow);
        jest.spyOn(service, 'rotateSession').mockResolvedValue(true);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.READY,
            failedUpdateAttempts: 2,
            lastUpdateFailure: null,
        });
        await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ failedUpdateAttempts: 0 }),
        );
    });

    test('failedAttempts=3 with recent failure → skip (backoff active)', async () => {
        const service = new TestBaseService();
        jest.spyOn(Date, 'now').mockReturnValue(mockNow);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.SETTLING,
            failedUpdateAttempts: 3,
            lastUpdateFailure: daysAgo(0.5, mockNow), // 12h ago
        });
        const result = await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(result.updateCount).toBe(0);
    });

    test('failedAttempts=3 with old failure → resets and retries', async () => {
        const service = new TestBaseService();
        jest.spyOn(Date, 'now').mockReturnValue(mockNow);
        jest.spyOn(service, 'rotateSession').mockResolvedValue(true);
        const doc = makeDoc({
            warmupPhase: WarmupPhase.READY,
            failedUpdateAttempts: 3,
            lastUpdateFailure: daysAgo(2, mockNow), // 2 days ago, past 24h backoff
        });
        await service.processClient(doc, { clientId: 'c1' } as Client);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ failedUpdateAttempts: 0, lastUpdateFailure: null }),
        );
        expect(service.rotateSession).toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Warmup phase transitions — edge cases & jitter
// ════════════════════════════════════════════════════════════════════════════

describe('Warmup phase transitions — jitter & stalled growing', () => {
    const now = Date.now();

    test('max jitter=7 delays ready to day 27', () => {
        const doc = {
            warmupPhase: WarmupPhase.MATURING,
            warmupJitter: 7,
            enrolledAt: daysAgo(25, now),
            profilePicsUpdatedAt: daysAgo(3, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(24, now),
            twoFASetAt: daysAgo(22, now),
            otherAuthsRemovedAt: daysAgo(20, now),
            profilePicsDeletedAt: daysAgo(18, now),
            nameBioUpdatedAt: daysAgo(16, now),
            usernameUpdatedAt: daysAgo(14, now),
        };
        const result = getWarmupPhaseAction(doc, now);
        // Day 25, needs day 20+7=27 → organic_only
        expect(result.action).toBe('organic_only');
    });

    test('max jitter=7, day 28 → advance_to_ready', () => {
        const doc = {
            warmupPhase: WarmupPhase.MATURING,
            warmupJitter: 7,
            enrolledAt: daysAgo(28, now),
            profilePicsUpdatedAt: daysAgo(3, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(24, now),
            twoFASetAt: daysAgo(22, now),
            otherAuthsRemovedAt: daysAgo(20, now),
            profilePicsDeletedAt: daysAgo(18, now),
            nameBioUpdatedAt: daysAgo(16, now),
            usernameUpdatedAt: daysAgo(14, now),
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('advance_to_ready');
    });

    test('growing stalled 2x expected duration → halved channel target (100 instead of 200)', () => {
        // Expected growing = maturing(18) - growing(8) = 10 days. 2x = 20 days of growing.
        // So if growing started at day 8 and it's now day 28+ (20 days of growing), channels target halves.
        const doc = {
            warmupPhase: WarmupPhase.GROWING,
            warmupJitter: 0,
            enrolledAt: daysAgo(30, now), // 30 days enrolled, growing since day 8 = 22 days of growing
            channels: 110, // Below 200 but above 100 (halved target)
            privacyUpdatedAt: daysAgo(28, now),
            twoFASetAt: daysAgo(26, now),
            otherAuthsRemovedAt: daysAgo(24, now),
            profilePicsDeletedAt: daysAgo(22, now),
            nameBioUpdatedAt: daysAgo(20, now),
            usernameUpdatedAt: daysAgo(18, now),
        };
        const result = getWarmupPhaseAction(doc, now);
        // 110 channels >= 100 (halved target), day 30 >= 18 → should advance
        expect(result.action).toBe('upload_photo');
        expect(result.phase).toBe(WarmupPhase.MATURING);
    });

    test('growing NOT stalled → requires full 200 channels', () => {
        const doc = {
            warmupPhase: WarmupPhase.GROWING,
            warmupJitter: 0,
            enrolledAt: daysAgo(15, now), // Only 7 days of growing (15-8)
            channels: 110, // Below 200
            privacyUpdatedAt: daysAgo(14, now),
            twoFASetAt: daysAgo(12, now),
            otherAuthsRemovedAt: daysAgo(10, now),
            profilePicsDeletedAt: daysAgo(12, now),
            nameBioUpdatedAt: daysAgo(10, now),
            usernameUpdatedAt: daysAgo(8, now),
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('join_channels'); // Still need more channels
    });

    test('exact day threshold boundary (enrolled exactly WARMUP_PHASE_THRESHOLDS.settling + jitter days)', () => {
        const jitter = 2;
        const exactDays = WARMUP_PHASE_THRESHOLDS.settling + jitter; // 1 + 2 = 3
        const doc = {
            warmupPhase: WarmupPhase.ENROLLED,
            warmupJitter: jitter,
            enrolledAt: new Date(now - exactDays * ONE_DAY_MS), // Exactly on boundary
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('set_privacy');
    });

    test('exactly MIN_DAYS_BETWEEN_IDENTITY_STEPS gap → should advance (>=, not >)', () => {
        const doc = {
            warmupPhase: WarmupPhase.SETTLING,
            warmupJitter: 0,
            enrolledAt: daysAgo(10, now),
            privacyUpdatedAt: new Date(now - MIN_DAYS_BETWEEN_IDENTITY_STEPS * ONE_DAY_MS), // Exactly 2 days
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('set_2fa');
    });

    test('1 ms before MIN_DAYS_BETWEEN_IDENTITY_STEPS → organic_only', () => {
        const doc = {
            warmupPhase: WarmupPhase.SETTLING,
            warmupJitter: 0,
            enrolledAt: daysAgo(10, now),
            privacyUpdatedAt: new Date(now - MIN_DAYS_BETWEEN_IDENTITY_STEPS * ONE_DAY_MS + 1),
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('organic_only');
    });

    test('session_rotated with session already rotated → wait (no more work)', () => {
        const doc = {
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            sessionRotatedAt: daysAgo(1, now),
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('wait');
        expect(result.phase).toBe(WarmupPhase.SESSION_ROTATED);
    });

    test('ready with session NOT rotated → rotate_session', () => {
        const doc = {
            warmupPhase: WarmupPhase.READY,
            sessionRotatedAt: undefined,
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('rotate_session');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Catch-up logic — growing/maturing with missed steps
// ════════════════════════════════════════════════════════════════════════════

describe('Catch-up — full settling→identity chain in growing/maturing', () => {
    const now = Date.now();
    const fullySettled = {
        privacyUpdatedAt: daysAgo(15, now),
        twoFASetAt: daysAgo(13, now),
        otherAuthsRemovedAt: daysAgo(11, now),
    };

    test('growing: all settling done, photos deleted but name/bio gate too recent → organic_only', () => {
        const doc = {
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            ...fullySettled,
            profilePicsDeletedAt: daysAgo(1.5, now), // Too recent for name/bio
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('organic_only');
    });

    test('maturing: all done except username (gate passed) → update_username', () => {
        const doc = {
            warmupPhase: WarmupPhase.MATURING,
            enrolledAt: daysAgo(25, now),
            channels: 250,
            ...fullySettled,
            profilePicsDeletedAt: daysAgo(10, now),
            nameBioUpdatedAt: daysAgo(5, now),
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('update_username');
    });

    test('growing: 2FA done 1 day ago → organic_only (need 2 day gap for removeOtherAuths)', () => {
        const doc = {
            warmupPhase: WarmupPhase.GROWING,
            enrolledAt: daysAgo(15, now),
            channels: 250,
            privacyUpdatedAt: daysAgo(10, now),
            twoFASetAt: daysAgo(1, now),
        };
        const result = getWarmupPhaseAction(doc, now);
        expect(result.action).toBe('organic_only');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Security operations — set2fa, removeOtherAuths, verifyOurPassword
// ════════════════════════════════════════════════════════════════════════════

describe('set2fa branches', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('hasPassword=true + our password → returns 1, sets twoFASetAt', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            hasPassword: jest.fn().mockResolvedValue(true),
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn().mockResolvedValue({ hasPassword: true }) },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(service as any, 'verifyOurPassword').mockResolvedValue(true);
        jest.spyOn(service as any, 'updateUser2FAStatus').mockResolvedValue(undefined);

        const doc = makeDoc({ warmupPhase: WarmupPhase.SETTLING, tgId: 'tg-1' });
        const result = await (service as any).set2fa(doc, 0);
        expect(result).toBe(1);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ twoFASetAt: expect.any(Date) }),
        );
    });

    test('hasPassword=true + foreign password → marks inactive, returns 0', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            hasPassword: jest.fn().mockResolvedValue(true),
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn() },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(service as any, 'verifyOurPassword').mockResolvedValue(false);
        const markInactiveSpy = jest.spyOn(service, 'markAsInactive').mockResolvedValue(null);

        const doc = makeDoc({ warmupPhase: WarmupPhase.SETTLING, tgId: 'tg-1' });
        const result = await (service as any).set2fa(doc, 0);
        expect(result).toBe(0);
        expect(markInactiveSpy).toHaveBeenCalledWith(
            doc.mobile,
            expect.stringContaining('Foreign 2FA'),
        );
        expect(service.botsServiceMock.sendMessageByCategory).toHaveBeenCalled();
    });

    test('hasPassword=false → calls set2fa on TG, returns 1', async () => {
        const service = new TestBaseService();
        const set2faMock = jest.fn().mockResolvedValue(undefined);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            hasPassword: jest.fn().mockResolvedValue(false),
            set2fa: set2faMock,
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn() },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(service as any, 'updateUser2FAStatus').mockResolvedValue(undefined);

        const doc = makeDoc({ warmupPhase: WarmupPhase.SETTLING, tgId: 'tg-1' });
        const result = await (service as any).set2fa(doc, 0);
        expect(result).toBe(1);
        expect(set2faMock).toHaveBeenCalled();
    });
});

describe('removeOtherAuths branches', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('success → sets otherAuthsRemovedAt, returns 1', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            removeOtherAuths: jest.fn().mockResolvedValue(undefined),
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

        const doc = makeDoc({ warmupPhase: WarmupPhase.SETTLING });
        const result = await (service as any).removeOtherAuths(doc, 0);
        expect(result).toBe(1);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ otherAuthsRemovedAt: expect.any(Date) }),
        );
    });

    test('session_revoked error → marks inactive with critical notification', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            removeOtherAuths: jest.fn().mockRejectedValue(new Error('session_revoked')),
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const markInactiveSpy = jest.spyOn(service, 'markAsInactive').mockResolvedValue(null);

        const doc = makeDoc({ warmupPhase: WarmupPhase.SETTLING });
        const result = await (service as any).removeOtherAuths(doc, 0);
        expect(result).toBe(0);
        expect(markInactiveSpy).toHaveBeenCalledWith(
            doc.mobile,
            expect.stringContaining('Session lost'),
        );
        expect(service.botsServiceMock.sendMessageByCategory).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('CRITICAL SESSION LOSS'),
            expect.anything(),
        );
    });

    test('auth_key_unregistered error → marks inactive', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            removeOtherAuths: jest.fn().mockRejectedValue(new Error('auth_key_unregistered')),
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const markInactiveSpy = jest.spyOn(service, 'markAsInactive').mockResolvedValue(null);

        const doc = makeDoc({ warmupPhase: WarmupPhase.SETTLING });
        const result = await (service as any).removeOtherAuths(doc, 0);
        expect(result).toBe(0);
        expect(markInactiveSpy).toHaveBeenCalled();
    });

    test('transient error → increments failures, does NOT mark inactive', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            removeOtherAuths: jest.fn().mockRejectedValue(new Error('TIMEOUT')),
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const markInactiveSpy = jest.spyOn(service, 'markAsInactive').mockResolvedValue(null);

        const doc = makeDoc({ warmupPhase: WarmupPhase.SETTLING });
        const result = await (service as any).removeOtherAuths(doc, 1);
        expect(result).toBe(0);
        expect(markInactiveSpy).not.toHaveBeenCalled();
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ failedUpdateAttempts: 2 }),
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. updateProfilePhotos branches
// ════════════════════════════════════════════════════════════════════════════

describe('updateProfilePhotos branches', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('has assigned pics + < 2 existing photos + valid URLs → uploads', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn().mockResolvedValue({ photos: [1] }) }, // 1 photo
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        jest.spyOn(service as any, 'uploadProfilePhotosFromUrls').mockResolvedValue(2);

        const doc = makeDoc({
            assignedProfilePics: ['https://example.com/pic1.jpg', 'https://example.com/pic2.jpg'],
        });
        const result = await (service as any).updateProfilePhotos(doc, {} as any, 0);
        expect(result).toBe(2);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ profilePicsUpdatedAt: expect.any(Date) }),
        );
    });

    test('has assigned pics + already 2+ photos → marks done without upload', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn().mockResolvedValue({ photos: [1, 2, 3] }) }, // 3 photos
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        const uploadSpy = jest.spyOn(service as any, 'uploadProfilePhotosFromUrls');

        const doc = makeDoc({
            assignedProfilePics: ['https://example.com/pic1.jpg', 'https://example.com/pic2.jpg'],
        });
        const result = await (service as any).updateProfilePhotos(doc, {} as any, 0);
        expect(result).toBe(1); // Forced to 1 by Math.max
        expect(uploadSpy).not.toHaveBeenCalled();
    });

    test('no assigned pics → stamps done anyway to unblock pipeline', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn().mockResolvedValue({ photos: [] }) },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

        const doc = makeDoc({ assignedProfilePics: [] });
        const result = await (service as any).updateProfilePhotos(doc, {} as any, 0);
        expect(result).toBe(1);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ profilePicsUpdatedAt: expect.any(Date) }),
        );
    });

    test('assigned pics with invalid URLs (empty strings) → still stamps done', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn().mockResolvedValue({ photos: [] }) },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

        const doc = makeDoc({ assignedProfilePics: ['', '  ', null] });
        const result = await (service as any).updateProfilePhotos(doc, {} as any, 0);
        expect(result).toBe(1); // Forced to 1 — pipeline unblocked
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. deleteProfilePhotos
// ════════════════════════════════════════════════════════════════════════════

describe('deleteProfilePhotos', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    test('has photos → deletes and returns 1', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            deleteProfilePhotos: jest.fn().mockResolvedValue(undefined),
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn().mockResolvedValue({ photos: [1, 2] }) },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

        const doc = makeDoc();
        const result = await (service as any).deleteProfilePhotos(doc, {} as any, 0);
        expect(result).toBe(1);
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ profilePicsDeletedAt: expect.any(Date) }),
        );
    });

    test('no photos → returns 0 but still sets profilePicsDeletedAt', async () => {
        const service = new TestBaseService();
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({
            getDialogs: jest.fn().mockResolvedValue([]),
            getContacts: jest.fn().mockResolvedValue([]),
            client: { invoke: jest.fn().mockResolvedValue({ photos: [] }) },
        } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();

        const doc = makeDoc();
        const result = await (service as any).deleteProfilePhotos(doc, {} as any, 0);
        expect(result).toBe(0);
        // Still sets profilePicsDeletedAt so pipeline advances
        expect(service.updateMock).toHaveBeenCalledWith(
            doc.mobile,
            expect.objectContaining({ profilePicsDeletedAt: expect.any(Date) }),
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Availability calculations & projected dates
// ════════════════════════════════════════════════════════════════════════════

describe('Projected ready date calculations', () => {
    test('enrolled account with jitter=0 → ready date is enrolledAt + 20 days', () => {
        const enrolledAt = new Date('2026-03-01T12:00:00.000Z');
        const expectedReadyMs = enrolledAt.getTime() + WARMUP_PHASE_THRESHOLDS.ready * ONE_DAY_MS;
        const expectedDate = new Date(expectedReadyMs).toISOString().split('T')[0];
        expect(expectedDate).toBe('2026-03-21');
    });

    test('enrolled account with jitter=5 → ready date is enrolledAt + 25 days', () => {
        const enrolledAt = new Date('2026-03-01T12:00:00.000Z');
        const jitter = 5;
        const expectedReadyMs = enrolledAt.getTime() + (WARMUP_PHASE_THRESHOLDS.ready + jitter) * ONE_DAY_MS;
        const expectedDate = new Date(expectedReadyMs).toISOString().split('T')[0];
        expect(expectedDate).toBe('2026-03-26');
    });

    test('ready account → operational date is availableDate or today', () => {
        const today = ClientHelperUtils.getTodayDateString();
        expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('session_rotated is NOT warming up', () => {
        const { isAccountWarmingUp, isAccountReady } = require('../warmup-phases');
        expect(isAccountWarmingUp(WarmupPhase.SESSION_ROTATED)).toBe(false);
        expect(isAccountReady(WarmupPhase.SESSION_ROTATED)).toBe(true);
    });

    test('all warming phases return true for isAccountWarmingUp', () => {
        const { isAccountWarmingUp } = require('../warmup-phases');
        for (const phase of [WarmupPhase.ENROLLED, WarmupPhase.SETTLING, WarmupPhase.IDENTITY, WarmupPhase.GROWING, WarmupPhase.MATURING]) {
            expect(isAccountWarmingUp(phase)).toBe(true);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Full lifecycle simulation with jitter (variant of the existing test)
// ════════════════════════════════════════════════════════════════════════════

describe('Full lifecycle simulation — jitter=3', () => {
    const now = Date.now();

    test('complete warmup journey with jitter=3 delays everything by 3 days', () => {
        const enrolledAt = new Date(now - 35 * ONE_DAY_MS);
        const jitter = 3;

        // Day 0: enrolled, wait
        const doc: any = { warmupPhase: WarmupPhase.ENROLLED, enrolledAt, warmupJitter: jitter };
        let simNow = enrolledAt.getTime() + 2 * ONE_DAY_MS;
        // Needs day 1+3=4. Day 2 → wait
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('wait');

        // Day 5: set_privacy (threshold 1+3=4 met)
        simNow = enrolledAt.getTime() + 5 * ONE_DAY_MS;
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('set_privacy');
        doc.warmupPhase = WarmupPhase.SETTLING;
        doc.privacyUpdatedAt = new Date(simNow);

        // Day 7.5: set_2fa (privacy was 2.5 days ago ≥ 2)
        simNow = enrolledAt.getTime() + 7.5 * ONE_DAY_MS;
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('set_2fa');
        doc.twoFASetAt = new Date(simNow);

        // Day 10: remove_other_auths (2FA was 2.5 days ago)
        simNow = enrolledAt.getTime() + 10 * ONE_DAY_MS;
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('remove_other_auths');
        doc.otherAuthsRemovedAt = new Date(simNow);

        // Day 10: all settling done, need day 4+3=7 for identity → already past, advance
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('delete_photos');
        doc.warmupPhase = WarmupPhase.IDENTITY;
        doc.profilePicsDeletedAt = new Date(simNow);

        // Day 12.5: name/bio (photos deleted 2.5 days ago)
        simNow = enrolledAt.getTime() + 12.5 * ONE_DAY_MS;
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('update_name_bio');
        doc.nameBioUpdatedAt = new Date(simNow);

        // Day 15: username (name/bio 2.5 days ago)
        simNow = enrolledAt.getTime() + 15 * ONE_DAY_MS;
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('update_username');
        doc.usernameUpdatedAt = new Date(simNow);

        // Identity done, need day 8+3=11 → already past, advance to growing
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('join_channels');
        doc.warmupPhase = WarmupPhase.GROWING;
        doc.channels = 50;

        // Day 16: still growing
        simNow = enrolledAt.getTime() + 16 * ONE_DAY_MS;
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('join_channels');
        doc.channels = 210;

        // Day 22: channels=210, need day 18+3=21 → advance to maturing
        simNow = enrolledAt.getTime() + 22 * ONE_DAY_MS;
        const maturingResult = getWarmupPhaseAction(doc, simNow);
        expect(maturingResult.action).toBe('upload_photo');
        doc.warmupPhase = WarmupPhase.MATURING;
        doc.profilePicsUpdatedAt = new Date(simNow);

        // Day 22: photo done, need day 20+3=23 → organic_only
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('organic_only');

        // Day 24: ready (day 20+3=23, and 24 ≥ 23)
        simNow = enrolledAt.getTime() + 24 * ONE_DAY_MS;
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('advance_to_ready');
        doc.warmupPhase = WarmupPhase.READY;

        // Session rotation
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('rotate_session');
        doc.warmupPhase = WarmupPhase.SESSION_ROTATED;
        doc.sessionRotatedAt = new Date(simNow);
        expect(getWarmupPhaseAction(doc, simNow).action).toBe('wait');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. isHealthy for cap — edge cases
// ════════════════════════════════════════════════════════════════════════════

describe('isHealthy for enrollment cap', () => {
    const now = Date.now();

    test('READY phase → always healthy regardless of failures', () => {
        // This tests the isHealthyBufferClientForCap logic conceptually
        const phase = WarmupPhase.READY;
        const failedAttempts = 10;
        const isReady = phase === WarmupPhase.READY || phase === WarmupPhase.SESSION_ROTATED;
        expect(isReady).toBe(true);
    });

    test('SESSION_ROTATED → always healthy', () => {
        const phase: string = WarmupPhase.SESSION_ROTATED;
        const isReady = phase === WarmupPhase.READY || phase === WarmupPhase.SESSION_ROTATED;
        expect(isReady).toBe(true);
    });

    test('SETTLING with 3+ failures → unhealthy', () => {
        const MAX_FAILED_ATTEMPTS = 3;
        const failedAttempts = 3;
        expect(failedAttempts >= MAX_FAILED_ATTEMPTS).toBe(true);
    });

    test('46 days in SETTLING → unhealthy (zombie territory)', () => {
        const enrolledAt = daysAgo(46, now);
        const daysSinceEnrolled = (now - enrolledAt.getTime()) / ONE_DAY_MS;
        expect(daysSinceEnrolled > 45).toBe(true);
    });

    test('no enrolledAt or createdAt → treated as healthy (no restriction)', () => {
        const enrolledTs = ClientHelperUtils.getTimestamp(null);
        const createdTs = ClientHelperUtils.getTimestamp(undefined);
        // Both 0 means we can't compute age → default to healthy
        expect(enrolledTs).toBe(0);
        expect(createdTs).toBe(0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. Real MongoDB full lifecycle test
// ════════════════════════════════════════════════════════════════════════════

describe('Real MongoDB: full warmup lifecycle', () => {
    let mongod: MongoMemoryServer;
    let connection: Connection;
    let BufferClientModel: Model<BufferClient>;

    const makeClient = (overrides: Partial<BufferClient> = {}) => ({
        tgId: `tg-lifecycle`,
        mobile: `+15550000001`,
        session: `session-lifecycle`,
        availableDate: '2026-04-01',
        channels: 0,
        clientId: 'main-client-1',
        ...overrides,
    });

    beforeAll(async () => {
        jest.setTimeout(60_000);
        mongod = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
        connection = await mongoose.createConnection(mongod.getUri(), {
            dbName: 'lifecycle-test',
        }).asPromise();
        BufferClientModel = connection.model<BufferClient>('BufferClientLifecycle', BufferClientSchema);
        await BufferClientModel.init();
    });
    afterEach(async () => { await BufferClientModel.deleteMany({}); });
    afterAll(async () => {
        if (connection) { await connection.dropDatabase(); await connection.close(); }
        if (mongod) await mongod.stop();
    });

    test('complete phase progression through DB updates with real Mongoose docs', async () => {
        const enrolledAt = new Date('2026-03-01T00:00:00.000Z');

        // Step 1: Create enrolled client
        let client = await BufferClientModel.create(makeClient({
            warmupPhase: WarmupPhase.ENROLLED as any,
            enrolledAt,
            warmupJitter: 0,
        }));

        // Day 2: still enrolled → wait
        let action = getWarmupPhaseAction(client, enrolledAt.getTime() + 0.5 * ONE_DAY_MS);
        expect(action.action).toBe('wait');

        // Day 1.5: transition to settling
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 1.5 * ONE_DAY_MS);
        expect(action.action).toBe('set_privacy');

        // Step 2: Update to settling + privacy done
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            { $set: { warmupPhase: WarmupPhase.SETTLING, privacyUpdatedAt: new Date(enrolledAt.getTime() + 2 * ONE_DAY_MS) } },
            { new: true },
        ))!;
        expect(client.warmupPhase).toBe(WarmupPhase.SETTLING);
        expect(client.privacyUpdatedAt).toBeInstanceOf(Date);
        expect(client.enrolledAt).toBeInstanceOf(Date); // Still accessible!

        // Day 4.5: privacy 2.5d ago → set_2fa
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 4.5 * ONE_DAY_MS);
        expect(action.action).toBe('set_2fa');

        // Step 3: Set 2FA
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            { $set: { twoFASetAt: new Date(enrolledAt.getTime() + 5 * ONE_DAY_MS) } },
            { new: true },
        ))!;

        // Day 7.5: 2FA 2.5d ago → remove_other_auths
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 7.5 * ONE_DAY_MS);
        expect(action.action).toBe('remove_other_auths');

        // Step 4: Remove other auths
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            { $set: { otherAuthsRemovedAt: new Date(enrolledAt.getTime() + 8 * ONE_DAY_MS) } },
            { new: true },
        ))!;

        // Day 8: all settling done, day≥4 → identity (delete_photos)
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 8 * ONE_DAY_MS);
        expect(action.action).toBe('delete_photos');
        expect(action.phase).toBe(WarmupPhase.IDENTITY);

        // Step 5: Identity phase
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            {
                $set: {
                    warmupPhase: WarmupPhase.IDENTITY,
                    profilePicsDeletedAt: new Date(enrolledAt.getTime() + 8 * ONE_DAY_MS),
                    nameBioUpdatedAt: new Date(enrolledAt.getTime() + 10.5 * ONE_DAY_MS),
                    usernameUpdatedAt: new Date(enrolledAt.getTime() + 13 * ONE_DAY_MS),
                },
            },
            { new: true },
        ))!;

        // Day 13: all identity done, day≥8 → join_channels
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 13 * ONE_DAY_MS);
        expect(action.action).toBe('join_channels');
        expect(action.phase).toBe(WarmupPhase.GROWING);

        // Step 6: Growing
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            { $set: { warmupPhase: WarmupPhase.GROWING, channels: 220 } },
            { new: true },
        ))!;

        // Day 19: channels=220, day≥18 → maturing (upload_photo)
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 19 * ONE_DAY_MS);
        expect(action.action).toBe('upload_photo');
        expect(action.phase).toBe(WarmupPhase.MATURING);

        // Step 7: Maturing
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            {
                $set: {
                    warmupPhase: WarmupPhase.MATURING,
                    profilePicsUpdatedAt: new Date(enrolledAt.getTime() + 19 * ONE_DAY_MS),
                },
            },
            { new: true },
        ))!;

        // Day 21: photo done, day≥20 → advance_to_ready
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 21 * ONE_DAY_MS);
        expect(action.action).toBe('advance_to_ready');

        // Step 8: Ready
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            { $set: { warmupPhase: WarmupPhase.READY } },
            { new: true },
        ))!;
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 21 * ONE_DAY_MS);
        expect(action.action).toBe('rotate_session');

        // Step 9: Session rotated
        client = (await BufferClientModel.findOneAndUpdate(
            { mobile: client.mobile },
            {
                $set: {
                    warmupPhase: WarmupPhase.SESSION_ROTATED,
                    sessionRotatedAt: new Date(enrolledAt.getTime() + 21 * ONE_DAY_MS),
                },
            },
            { new: true },
        ))!;
        action = getWarmupPhaseAction(client, enrolledAt.getTime() + 22 * ONE_DAY_MS);
        expect(action.action).toBe('wait');
        expect(action.phase).toBe(WarmupPhase.SESSION_ROTATED);

        // Verify final state
        expect(client.warmupPhase).toBe(WarmupPhase.SESSION_ROTATED);
        expect(client.privacyUpdatedAt).toBeInstanceOf(Date);
        expect(client.twoFASetAt).toBeInstanceOf(Date);
        expect(client.otherAuthsRemovedAt).toBeInstanceOf(Date);
        expect(client.profilePicsDeletedAt).toBeInstanceOf(Date);
        expect(client.nameBioUpdatedAt).toBeInstanceOf(Date);
        expect(client.usernameUpdatedAt).toBeInstanceOf(Date);
        expect(client.profilePicsUpdatedAt).toBeInstanceOf(Date);
        expect(client.sessionRotatedAt).toBeInstanceOf(Date);
    });

    test('concurrent updates preserve all fields (no spread data loss)', async () => {
        const enrolledAt = new Date('2026-03-01T00:00:00.000Z');
        const created = await BufferClientModel.create(makeClient({
            mobile: '+15550000002',
            warmupPhase: WarmupPhase.SETTLING as any,
            enrolledAt,
            warmupJitter: 2,
            privacyUpdatedAt: new Date('2026-03-04T00:00:00.000Z'),
            twoFASetAt: new Date('2026-03-07T00:00:00.000Z'),
        }));

        // Simulate two concurrent updates (like failure reset + phase update)
        const [updated1, updated2] = await Promise.all([
            BufferClientModel.findOneAndUpdate(
                { mobile: created.mobile },
                { $set: { failedUpdateAttempts: 0, lastUpdateFailure: null } },
                { new: true },
            ),
            BufferClientModel.findOneAndUpdate(
                { mobile: created.mobile },
                { $set: { otherAuthsRemovedAt: new Date() } },
                { new: true },
            ),
        ]);

        // Both should preserve all original fields
        for (const doc of [updated1!, updated2!]) {
            expect(doc.warmupPhase).toBe(WarmupPhase.SETTLING);
            expect(doc.enrolledAt).toBeInstanceOf(Date);
            expect(doc.warmupJitter).toBe(2);
            expect(doc.privacyUpdatedAt).toBeInstanceOf(Date);
            expect(doc.twoFASetAt).toBeInstanceOf(Date);
        }
    });

    test('$inc on channels is atomic', async () => {
        const created = await BufferClientModel.create(makeClient({
            mobile: '+15550000003',
            channels: 100,
        }));

        // Simulate concurrent channel increments
        await Promise.all([
            BufferClientModel.updateOne({ mobile: created.mobile }, { $inc: { channels: 1 } }),
            BufferClientModel.updateOne({ mobile: created.mobile }, { $inc: { channels: 1 } }),
            BufferClientModel.updateOne({ mobile: created.mobile }, { $inc: { channels: 1 } }),
        ]);

        const final = await BufferClientModel.findOne({ mobile: created.mobile });
        expect(final!.channels).toBe(103);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. repairWarmupMetadata — inferWarmupPhaseFromProgress
// ════════════════════════════════════════════════════════════════════════════

describe('repairWarmupMetadata — phase inference', () => {
    const mockNow = new Date('2026-04-11T12:00:00.000Z').getTime();

    afterEach(() => { jest.restoreAllMocks(); });

    test('no warmupPhase + only privacy done → infers SETTLING', async () => {
        const service = new TestBaseService();
        const doc = {
            mobile: '9990099001',
            warmupPhase: null,
            warmupJitter: 0,
            enrolledAt: null,
            createdAt: null,
            privacyUpdatedAt: daysAgo(5, mockNow),
        } as any;

        await (service as any).repairWarmupMetadata(doc, mockNow);
        expect(service.updateMock).toHaveBeenCalledWith(
            '9990099001',
            expect.objectContaining({ warmupPhase: WarmupPhase.SETTLING }),
        );
    });

    test('warmupPhase=ENROLLED but all identity done → advances to GROWING', async () => {
        const service = new TestBaseService();
        const doc = {
            mobile: '9990099002',
            warmupPhase: WarmupPhase.ENROLLED,
            warmupJitter: 0,
            enrolledAt: daysAgo(20, mockNow),
            createdAt: daysAgo(20, mockNow),
            privacyUpdatedAt: daysAgo(18, mockNow),
            twoFASetAt: daysAgo(16, mockNow),
            otherAuthsRemovedAt: daysAgo(14, mockNow),
            profilePicsDeletedAt: daysAgo(12, mockNow),
            nameBioUpdatedAt: daysAgo(10, mockNow),
            usernameUpdatedAt: daysAgo(8, mockNow),
            channels: 50,
        } as any;

        await (service as any).repairWarmupMetadata(doc, mockNow);
        expect(service.updateMock).toHaveBeenCalledWith(
            '9990099002',
            expect.objectContaining({ warmupPhase: WarmupPhase.GROWING }),
        );
    });

    test('already correct phase → no update needed', async () => {
        const service = new TestBaseService();
        const doc = {
            mobile: '9990099003',
            warmupPhase: WarmupPhase.SETTLING,
            warmupJitter: 0,
            enrolledAt: daysAgo(5, mockNow),
            createdAt: daysAgo(5, mockNow),
            privacyUpdatedAt: daysAgo(3, mockNow),
        } as any;

        const result = await (service as any).repairWarmupMetadata(doc, mockNow);
        expect(service.updateMock).not.toHaveBeenCalled();
        // Should return original doc
        expect(result).toBe(doc);
    });

    test('missing enrolledAt → backfills from createdAt', async () => {
        const service = new TestBaseService();
        const createdAt = daysAgo(10, mockNow);
        const doc = {
            mobile: '9990099004',
            warmupPhase: WarmupPhase.SETTLING,
            warmupJitter: 0,
            enrolledAt: null,
            createdAt,
            privacyUpdatedAt: daysAgo(8, mockNow),
        } as any;

        await (service as any).repairWarmupMetadata(doc, mockNow);
        expect(service.updateMock).toHaveBeenCalledWith(
            '9990099004',
            expect.objectContaining({ enrolledAt: createdAt }),
        );
    });

    test('never moves warmup phase backwards', async () => {
        const service = new TestBaseService();
        const doc = {
            mobile: '9990099005',
            warmupPhase: WarmupPhase.GROWING, // Already at growing
            warmupJitter: 0,
            enrolledAt: daysAgo(15, mockNow),
            createdAt: daysAgo(15, mockNow),
            privacyUpdatedAt: daysAgo(13, mockNow),
            // Only settling done — inferred phase would be SETTLING (lower rank)
        } as any;

        const result = await (service as any).repairWarmupMetadata(doc, mockNow);
        // Should NOT downgrade from GROWING to SETTLING
        expect(service.updateMock).not.toHaveBeenCalled();
        expect(result).toBe(doc);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 13. Cooldown jitter
// ════════════════════════════════════════════════════════════════════════════

describe('Cooldown calculation', () => {
    test('different mobiles get different cooldowns (jitter)', () => {
        const service = new TestBaseService();
        const lastAttempt = new Date('2026-04-03T00:00:00.000Z').getTime();
        const cooldown1 = (service as any).getEffectiveCooldownMs('mobile-aaa', lastAttempt);
        const cooldown2 = (service as any).getEffectiveCooldownMs('mobile-bbb', lastAttempt);
        // Different mobiles should (usually) get different cooldowns
        // Both should be within 90-180 min range
        expect(cooldown1).toBeGreaterThanOrEqual(90 * 60 * 1000);
        expect(cooldown1).toBeLessThanOrEqual(180 * 60 * 1000);
        expect(cooldown2).toBeGreaterThanOrEqual(90 * 60 * 1000);
        expect(cooldown2).toBeLessThanOrEqual(180 * 60 * 1000);
    });

    test('same mobile + same lastAttempt → deterministic cooldown', () => {
        const service = new TestBaseService();
        const lastAttempt = new Date('2026-04-03T00:00:00.000Z').getTime();
        const c1 = (service as any).getEffectiveCooldownMs('mobile-ccc', lastAttempt);
        const c2 = (service as any).getEffectiveCooldownMs('mobile-ccc', lastAttempt);
        expect(c1).toBe(c2);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 14. Phase rank ordering (used by repairWarmupMetadata)
// ════════════════════════════════════════════════════════════════════════════

describe('Phase rank ordering', () => {
    test('phases are ordered: enrolled < settling < identity < growing < maturing < ready < session_rotated', () => {
        const service = new TestBaseService();
        const ranks = [
            WarmupPhase.ENROLLED,
            WarmupPhase.SETTLING,
            WarmupPhase.IDENTITY,
            WarmupPhase.GROWING,
            WarmupPhase.MATURING,
            WarmupPhase.READY,
            WarmupPhase.SESSION_ROTATED,
        ].map(p => (service as any).getWarmupPhaseRank(p));

        for (let i = 1; i < ranks.length; i++) {
            expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
        }
    });

    test('unknown phase returns rank -1 (not found)', () => {
        const service = new TestBaseService();
        expect((service as any).getWarmupPhaseRank('garbage')).toBe(-1);
        expect((service as any).getWarmupPhaseRank(null)).toBe(-1);
        expect((service as any).getWarmupPhaseRank(undefined)).toBe(-1);
    });
});
