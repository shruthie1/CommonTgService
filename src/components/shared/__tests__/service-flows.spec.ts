import { BufferClientService } from '../../buffer-clients/buffer-client.service';
import { PromoteClientService } from '../../promote-clients/promote-client.service';
import { BaseClientDocument, BaseClientService, ClientConfig, WarmupPhase } from '../base-client.service';
import { Client } from '../../clients';
import { connectionManager } from '../../Telegram/utils/connection-manager';
import * as channelInfoModule from '../../../utils/telegram-utils/channelinfo';
import { ClientHelperUtils } from '../client-helper.utils';

jest.mock('telegram/Helpers', () => {
    const actual = jest.requireActual('telegram/Helpers');
    return {
        ...actual,
        sleep: jest.fn(() => Promise.resolve()),
    };
});

jest.mock('../../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock('../../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/mock-bot'),
}));

class TestBaseService extends BaseClientService<BaseClientDocument> {
    private readonly mockModel: any;
    public readonly updateMock = jest.fn(async (_mobile: string, updateDto: any) => updateDto);

    constructor(modelOverrides: any = {}) {
        const telegramService = {
            createNewSession: jest.fn(async (mobile: string) => `rotated-${mobile}`),
        };
        const usersService = {
            search: jest.fn(async ({ mobile }: { mobile: string }) => [{ tgId: `tg-${mobile}`, mobile, session: `backup-${mobile}` }]),
            update: jest.fn(async () => 1),
        };
        super(
            telegramService as any,
            usersService as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            'TestBaseService',
        );
        this.mockModel = modelOverrides;
    }

    get model(): any {
        return this.mockModel;
    }

    get clientType(): 'buffer' {
        return 'buffer';
    }

    get config(): ClientConfig {
        return {
            joinChannelInterval: 1,
            leaveChannelInterval: 1,
            leaveChannelBatchSize: 1,
            channelProcessingDelay: 1,
            channelTarget: 200,
            maxJoinsPerSession: 1,
            maxNewClientsPerTrigger: 1,
            minTotalClients: 1,
            maxMapSize: 1,
            cooldownHours: 2,
            clientProcessingDelay: 1,
            maxChannelJoinsPerDay: 20,
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

    public effectiveCooldown(mobile: string, lastUpdateAttempt: number): number {
        return this.getEffectiveCooldownMs(mobile, lastUpdateAttempt);
    }

    public async repair(doc: BaseClientDocument, now: number): Promise<BaseClientDocument> {
        return this.repairWarmupMetadata(doc, now);
    }

    public async permanentReason(baseReason: string, telegramClient?: any): Promise<string> {
        return this.buildPermanentAccountReason(baseReason, telegramClient);
    }

    public async availabilityNeeds(clientId: string) {
        return this.calculateAvailabilityBasedNeeds(clientId);
    }
}

function createQueryChain(executor: () => any) {
    return {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        exec: jest.fn(async () => executor()),
    };
}

function makeBufferService(bufferModel: any) {
    return new BufferClientService(
        bufferModel as any,
        { getActiveClientSetup: jest.fn(() => false) } as any,
        {} as any,
        { getActiveChannels: jest.fn().mockResolvedValue([]) } as any,
        { findAll: jest.fn().mockResolvedValue([]) } as any,
        { getActiveChannels: jest.fn().mockResolvedValue([]) } as any,
        { findAll: jest.fn().mockResolvedValue([]) } as any,
        {} as any,
        { sendMessageByCategory: jest.fn() } as any,
    );
}

function makePromoteService(promoteModel: any, clientsList: any[] = [{ clientId: 'client-1', mobile: 'main-1' }]) {
    return new PromoteClientService(
        promoteModel as any,
        { getActiveClientSetup: jest.fn(() => false) } as any,
        {} as any,
        {} as any,
        { findAll: jest.fn().mockResolvedValue(clientsList) } as any,
        {} as any,
        { findAll: jest.fn().mockResolvedValue([]) } as any,
        {} as any,
        { sendMessageByCategory: jest.fn() } as any,
    );
}

describe('Service flow reliability', () => {
    afterAll(async () => {
        await connectionManager.shutdown();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();
    });

    test('shared cooldown jitter is deterministic for the same mobile + attempt and stays within 90-180 minutes', () => {
        const service = new TestBaseService();
        const lastAttempt = new Date('2026-04-03T00:00:00.000Z').getTime();

        const first = service.effectiveCooldown('9990001111', lastAttempt);
        const second = service.effectiveCooldown('9990001111', lastAttempt);

        expect(first).toBe(second);
        expect(first).toBeGreaterThanOrEqual(90 * 60 * 1000);
        expect(first).toBeLessThanOrEqual(180 * 60 * 1000);
    });

    test('corrupted warmup metadata is auto-repaired instead of leaving the account stuck', async () => {
        const service = new TestBaseService();
        const now = new Date('2026-04-03T12:00:00.000Z').getTime();
        const doc = {
            mobile: '9990002222',
            warmupPhase: null,
            warmupJitter: 0,
            createdAt: null,
            enrolledAt: null,
            privacyUpdatedAt: new Date('2026-03-28T12:00:00.000Z'),
            twoFASetAt: null,
            otherAuthsRemovedAt: null,
            profilePicsDeletedAt: null,
            nameBioUpdatedAt: null,
            usernameUpdatedAt: null,
            profilePicsUpdatedAt: null,
            channels: 0,
        } as any;

        const repaired = await service.repair(doc, now);

        expect(service.updateMock).toHaveBeenCalledWith(
            '9990002222',
            expect.objectContaining({
                warmupPhase: WarmupPhase.SETTLING,
                enrolledAt: expect.any(Date),
            }),
        );
        expect(repaired.warmupPhase).toBe(WarmupPhase.SETTLING);
        expect(repaired.enrolledAt).toBeInstanceOf(Date);
    });

    test('stale warmupPhase is advanced to match completed progress fields', async () => {
        const service = new TestBaseService();
        const now = new Date('2026-04-03T12:00:00.000Z').getTime();
        const doc = {
            mobile: '9990003333',
            warmupPhase: WarmupPhase.ENROLLED,
            warmupJitter: 0,
            createdAt: new Date('2026-03-01T12:00:00.000Z'),
            enrolledAt: new Date('2026-03-01T12:00:00.000Z'),
            privacyUpdatedAt: new Date('2026-03-02T12:00:00.000Z'),
            twoFASetAt: new Date('2026-03-05T12:00:00.000Z'),
            otherAuthsRemovedAt: new Date('2026-03-07T12:00:00.000Z'),
            profilePicsDeletedAt: new Date('2026-03-10T12:00:00.000Z'),
            nameBioUpdatedAt: new Date('2026-03-13T12:00:00.000Z'),
            usernameUpdatedAt: new Date('2026-03-16T12:00:00.000Z'),
            profilePicsUpdatedAt: null,
            channels: 50,
        } as any;

        const repaired = await service.repair(doc, now);

        expect(service.updateMock).toHaveBeenCalledWith(
            '9990003333',
            expect.objectContaining({ warmupPhase: WarmupPhase.GROWING }),
        );
        expect(repaired.warmupPhase).toBe(WarmupPhase.GROWING);
    });

    test('processClient resets max failures when lastUpdateFailure is missing instead of skipping forever', async () => {
        const service = new TestBaseService();
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-03T12:00:00.000Z').getTime());
        const doc = {
            mobile: '9990004444',
            warmupPhase: WarmupPhase.READY,
            enrolledAt: new Date('2026-03-01T12:00:00.000Z'),
            createdAt: new Date('2026-03-01T12:00:00.000Z'),
            failedUpdateAttempts: 3,
            lastUpdateFailure: null,
            lastUpdateAttempt: null,
            inUse: false,
        } as any;

        await service.processClient(doc, { clientId: 'client-1' } as Client);

        expect(service.updateMock).toHaveBeenNthCalledWith(
            1,
            '9990004444',
            expect.objectContaining({ failedUpdateAttempts: 0, lastUpdateFailure: null }),
        );
        expect(service.updateMock).toHaveBeenCalledWith(
            '9990004444',
            expect.objectContaining({ lastUpdateAttempt: expect.any(Date) }),
        );
        nowSpy.mockRestore();
    });

    test('frozen permanent reasons include freeze metadata when Telegram app config exposes it', async () => {
        const service = new TestBaseService();
        const invoke = jest.fn().mockResolvedValue({
            config: [
                { key: 'freeze_since_date', value: '1760000000' },
                { key: 'freeze_until_date', value: '1760500000' },
                { key: 'freeze_appeal_url', value: 'https://example.test/appeal' },
            ],
        });

        const reason = await service.permanentReason(
            'FROZEN_METHOD_INVALID',
            { client: { invoke } } as any,
        );

        expect(invoke).toHaveBeenCalled();
        expect(reason).toContain('FROZEN_METHOD_INVALID');
        expect(reason).toContain('freeze_since=');
        expect(reason).toContain('freeze_until=');
        expect(reason).toContain('appeal_url=https://example.test/appeal');
    });

    test('joinchannelForBufferClients preserves mobiles with remaining channels when skipExisting=true', async () => {
        let capturedQuery: Record<string, any> | undefined;
        const bufferModel: any = {
            find: jest.fn((query: Record<string, any>) => {
                capturedQuery = query;
                return {
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockResolvedValue([]),
                    }),
                };
            }),
            aggregate: jest.fn(),
        };

        const service = makeBufferService(bufferModel);
        jest.spyOn(service as any, 'clearJoinChannelInterval').mockImplementation(() => {});
        jest.spyOn(service as any, 'clearLeaveChannelInterval').mockImplementation(() => {});
        // Mobile with remaining channels should be preserved and excluded from query
        (service as any).joinChannelMap.set('has-channels', [{ username: 'ch1' }]);
        // Mobile with empty array should be cleaned up and NOT excluded
        (service as any).joinChannelMap.set('empty-mobile', []);

        await service.joinchannelForBufferClients(true);

        expect(capturedQuery?.mobile?.$nin).toEqual(['has-channels']);
        expect((service as any).joinChannelMap.has('has-channels')).toBe(true);
        expect((service as any).joinChannelMap.has('empty-mobile')).toBe(false);
    });

    test('joinchannelForBufferClients does not exclude existing queued mobiles when skipExisting=false', async () => {
        let capturedQuery: Record<string, any> | undefined;
        const bufferModel: any = {
            find: jest.fn((query: Record<string, any>) => {
                capturedQuery = query;
                return {
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockResolvedValue([]),
                    }),
                };
            }),
            aggregate: jest.fn(),
        };

        const service = makeBufferService(bufferModel);
        jest.spyOn(service as any, 'clearJoinChannelInterval').mockImplementation(() => {});
        jest.spyOn(service as any, 'clearLeaveChannelInterval').mockImplementation(() => {});
        (service as any).joinChannelMap.set('existing-mobile', []);

        await service.joinchannelForBufferClients(false);

        expect(capturedQuery?.mobile?.$nin).toEqual([]);
    });

    test('checkPromoteClients skips health checks for warming accounts but still processes warmup', async () => {
        const warmDoc = {
            mobile: '90001',
            clientId: 'client-1',
            warmupPhase: WarmupPhase.IDENTITY,
            lastUpdateAttempt: null,
            lastUsed: null,
        } as any;

        const promoteModel: any = {
            find: jest.fn((query?: Record<string, any>) => {
                if (query?.clientId?.$exists === true) {
                    if (query?.clientId?.$ne === null) {
                        return { exec: jest.fn().mockResolvedValue([warmDoc]) };
                    }
                    return { distinct: jest.fn().mockResolvedValue([]) };
                }
                return createQueryChain(() => []);
            }),
            aggregate: jest.fn().mockResolvedValue([
                { _id: 'client-1', count: 1, mobiles: ['90001'] },
            ]),
            countDocuments: jest.fn().mockResolvedValue(1),
        };

        const service = makePromoteService(promoteModel);
        jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue(true);
        jest.spyOn(service as any, 'processClient').mockResolvedValue(1);
        jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
            totalNeeded: 0,
            windowNeeds: [],
            totalActive: 0,
            totalNeededForCount: 0,
            calculationReason: 'test',
            priority: 0,
        });
        jest.spyOn(service as any, 'addNewUserstoPromoteClientsDynamic').mockResolvedValue(undefined);

        await service.checkPromoteClients();

        expect((service as any).performHealthCheck).not.toHaveBeenCalled();
        expect((service as any).processClient).toHaveBeenCalledWith(warmDoc, { clientId: 'client-1', mobile: 'main-1' });
    });

    test('checkPromoteClients performs health checks for ready accounts before processing', async () => {
        const readyDoc = {
            mobile: '90002',
            clientId: 'client-1',
            warmupPhase: WarmupPhase.READY,
            lastChecked: null,
            lastUpdateAttempt: null,
            lastUsed: null,
        } as any;

        const promoteModel: any = {
            find: jest.fn((query?: Record<string, any>) => {
                if (query?.clientId?.$exists === true) {
                    if (query?.clientId?.$ne === null) {
                        return { exec: jest.fn().mockResolvedValue([readyDoc]) };
                    }
                    return { distinct: jest.fn().mockResolvedValue([]) };
                }
                return createQueryChain(() => []);
            }),
            aggregate: jest.fn().mockResolvedValue([
                { _id: 'client-1', count: 1, mobiles: ['90002'] },
            ]),
            countDocuments: jest.fn().mockResolvedValue(1),
        };

        const service = makePromoteService(promoteModel);
        const healthSpy = jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue(true);
        const processSpy = jest.spyOn(service as any, 'processClient').mockResolvedValue(1);
        jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
            totalNeeded: 0,
            windowNeeds: [],
            totalActive: 0,
            totalNeededForCount: 0,
            calculationReason: 'test',
            priority: 0,
        });
        jest.spyOn(service as any, 'addNewUserstoPromoteClientsDynamic').mockResolvedValue(undefined);

        await service.checkPromoteClients();

        expect(healthSpy).toHaveBeenCalledWith('90002', 0, expect.any(Number));
        expect(processSpy).toHaveBeenCalledWith(readyDoc, { clientId: 'client-1', mobile: 'main-1' });
        expect(healthSpy.mock.invocationCallOrder[0]).toBeLessThan(processSpy.mock.invocationCallOrder[0]);
    });

    test('checkPromoteClients globally prioritizes warming accounts with older attempts before ready accounts', async () => {
        const readyDoc = {
            mobile: '90011',
            clientId: 'client-1',
            warmupPhase: WarmupPhase.READY,
            lastChecked: null,
            lastUpdateAttempt: new Date('2026-04-03T11:00:00.000Z'),
            lastUsed: null,
            failedUpdateAttempts: 0,
        } as any;
        const warmingDoc = {
            mobile: '90022',
            clientId: 'client-2',
            warmupPhase: WarmupPhase.IDENTITY,
            lastChecked: null,
            lastUpdateAttempt: null,
            lastUsed: null,
            failedUpdateAttempts: 0,
        } as any;

        const promoteModel: any = {
            find: jest.fn((query?: Record<string, any>) => {
                if (query?.clientId?.$exists === true) {
                    if (query?.clientId?.$ne === null) {
                        return {
                            exec: jest.fn().mockResolvedValue([
                                readyDoc,
                                warmingDoc,
                            ]),
                        };
                    }
                    return { distinct: jest.fn().mockResolvedValue([]) };
                }
                return createQueryChain(() => []);
            }),
            aggregate: jest.fn().mockResolvedValue([
                { _id: 'client-1', count: 1, mobiles: ['90011'] },
                { _id: 'client-2', count: 1, mobiles: ['90022'] },
            ]),
            countDocuments: jest.fn().mockResolvedValue(1),
        };

        const service = makePromoteService(promoteModel, [
            { clientId: 'client-1', mobile: 'main-1' },
            { clientId: 'client-2', mobile: 'main-2' },
        ]);
        jest.spyOn(service as any, 'performHealthCheck').mockResolvedValue(true);
        const processSpy = jest.spyOn(service as any, 'processClient').mockResolvedValue(1);
        jest.spyOn(service as any, 'calculateAvailabilityBasedNeedsForCurrentState').mockResolvedValue({
            totalNeeded: 0,
            windowNeeds: [],
            totalActive: 0,
            totalNeededForCount: 0,
            calculationReason: 'test',
            priority: 0,
        });
        jest.spyOn(service as any, 'addNewUserstoPromoteClientsDynamic').mockResolvedValue(undefined);

        await service.checkPromoteClients();

        expect(processSpy).toHaveBeenNthCalledWith(1, warmingDoc, { clientId: 'client-2', mobile: 'main-2' });
        expect(processSpy).toHaveBeenNthCalledWith(2, readyDoc, { clientId: 'client-1', mobile: 'main-1' });
    });

    test('buffer join query only targets warmup phases that are allowed to join', async () => {
        let capturedQuery: Record<string, any> | undefined;
        const bufferModel: any = {
            find: jest.fn((query: Record<string, any>) => {
                capturedQuery = query;
                return {
                    sort: jest.fn().mockReturnValue({
                        limit: jest.fn().mockResolvedValue([]),
                    }),
                };
            }),
            aggregate: jest.fn(),
        };

        const service = makeBufferService(bufferModel);
        jest.spyOn(service as any, 'clearJoinChannelInterval').mockImplementation(() => {});
        jest.spyOn(service as any, 'clearLeaveChannelInterval').mockImplementation(() => {});
        jest.spyOn(channelInfoModule, 'channelInfo').mockResolvedValue({ ids: [], canSendFalseCount: 0, canSendFalseChats: [] } as any);
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);

        await service.joinchannelForBufferClients(true);

        expect(capturedQuery?.warmupPhase?.$in).toEqual(['growing', 'maturing', 'ready', 'session_rotated']);
    });

    test('operational selection self-heals legacy used accounts before querying session-rotated pool', async () => {
        let normalized = false;
        const legacyDoc = {
            mobile: '9990005555',
            clientId: 'client-1',
            status: 'active',
            session: 'active-9990005555',
            lastUsed: new Date('2026-03-20T12:00:00.000Z'),
            createdAt: new Date('2025-01-01T12:00:00.000Z'),
        };
        const rotatedDoc = {
            mobile: '9990005555',
            clientId: 'client-1',
            status: 'active',
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            lastUsed: new Date('2026-03-20T12:00:00.000Z'),
        };

        const mockModel = {
            find: jest.fn((query: Record<string, any>) => {
                const isMissingWarmupRepairQuery =
                    query?.status === 'active' &&
                    query?.clientId === 'client-1' &&
                    query?.lastUsed?.$exists === true;
                const isReadySelectionQuery =
                    query?.warmupPhase === WarmupPhase.SESSION_ROTATED &&
                    query?.clientId === 'client-1';

                if (isMissingWarmupRepairQuery) {
                    return createQueryChain(() => (normalized ? [] : [legacyDoc]));
                }
                if (isReadySelectionQuery) {
                    return createQueryChain(() => (normalized ? [rotatedDoc] : []));
                }
                return createQueryChain(() => []);
            }),
        };

        const service = new TestBaseService(mockModel);
        service.updateMock.mockImplementation(async (_mobile: string, updateDto: any) => {
            if (updateDto?.warmupPhase === WarmupPhase.SESSION_ROTATED) {
                normalized = true;
            }
            return updateDto;
        });

        const selected = await service.getNextAvailableClient('client-1');

        expect(selected).toEqual(rotatedDoc);
        expect(service.updateMock).toHaveBeenCalledWith(
            '9990005555',
            expect.objectContaining({
                warmupPhase: WarmupPhase.SESSION_ROTATED,
                sessionRotatedAt: expect.any(Date),
                enrolledAt: expect.any(Date),
                twoFASetAt: expect.any(Date),
                otherAuthsRemovedAt: expect.any(Date),
            }),
        );
    });

    test('availability calculation self-heals legacy used accounts before counting ready pool', async () => {
        let normalized = false;
        const legacyDoc = {
            mobile: '9990006666',
            clientId: 'client-2',
            status: 'active',
            session: 'active-9990006666',
            lastUsed: new Date('2026-03-22T12:00:00.000Z'),
            createdAt: new Date('2025-01-01T12:00:00.000Z'),
        };

        const mockModel = {
            find: jest.fn((query: Record<string, any>) => {
                const isMissingWarmupRepairQuery =
                    query?.status === 'active' &&
                    query?.clientId === 'client-2' &&
                    query?.lastUsed?.$exists === true;
                if (isMissingWarmupRepairQuery) {
                    return createQueryChain(() => (normalized ? [] : [legacyDoc]));
                }
                const isActiveClientQuery =
                    query?.status === 'active' &&
                    query?.clientId === 'client-2' &&
                    query?.lastUsed === undefined;
                if (isActiveClientQuery) {
                    return createQueryChain(() => (normalized ? [{
                        ...legacyDoc,
                        warmupPhase: WarmupPhase.SESSION_ROTATED,
                    }] : []));
                }
                return createQueryChain(() => []);
            }),
        };

        const service = new TestBaseService(mockModel);
        service.updateMock.mockImplementation(async (_mobile: string, updateDto: any) => {
            if (updateDto?.warmupPhase === WarmupPhase.SESSION_ROTATED) {
                normalized = true;
            }
            return updateDto;
        });

        const result = await service.availabilityNeeds('client-2');

        expect(result.totalActive).toBe(1);
        expect(service.updateMock).toHaveBeenCalledWith(
            '9990006666',
            expect.objectContaining({ warmupPhase: WarmupPhase.SESSION_ROTATED }),
        );
    });

    test('availability calculation credits warming pipeline without over-enrolling for short windows', async () => {
        class PipelinePlanningService extends TestBaseService {
            get config(): ClientConfig {
                return {
                    ...super.config,
                    minTotalClients: 2,
                };
            }
        }

        const oneDayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const today = new Date(now).toISOString().split('T')[0];
        const warmingDocs = [
            {
                mobile: '9990007771',
                clientId: 'client-3',
                status: 'active',
                warmupPhase: WarmupPhase.ENROLLED,
                warmupJitter: 0,
                enrolledAt: new Date(now - oneDayMs),
                availableDate: today,
            },
            {
                mobile: '9990007772',
                clientId: 'client-3',
                status: 'active',
                warmupPhase: WarmupPhase.SETTLING,
                warmupJitter: 0,
                enrolledAt: new Date(now - 2 * oneDayMs),
                availableDate: today,
            },
        ];

        const mockModel = {
            find: jest.fn((query: Record<string, any>) => {
                const isActiveClientQuery =
                    query?.status === 'active' &&
                    query?.clientId === 'client-3' &&
                    query?.lastUsed === undefined &&
                    !query?.$and;
                if (isActiveClientQuery) {
                    return createQueryChain(() => warmingDocs);
                }
                return createQueryChain(() => []);
            }),
        };

        const service = new PipelinePlanningService(mockModel);
        const result = await service.availabilityNeeds('client-3');

        expect(result.readyActive).toBe(0);
        expect(result.warmingPipeline).toBe(2);
        expect(result.totalActive).toBe(2);
        expect(result.totalNeededForCount).toBe(0);
        expect(result.totalNeeded).toBe(0);
        expect(result.windowNeeds.find((window) => window.window === 'today')?.needed).toBeGreaterThan(0);
        expect(result.replenishmentWindowNeeds?.find((window) => window.window === 'oneMonth')?.needed).toBe(0);
        expect(result.calculationReason).toContain('3-4 week horizon');
    });

    test('availability calculation still adds when near-soon pipeline is below target', async () => {
        class PipelinePlanningService extends TestBaseService {
            get config(): ClientConfig {
                return {
                    ...super.config,
                    minTotalClients: 2,
                };
            }
        }

        const oneDayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        const today = new Date(now).toISOString().split('T')[0];
        const warmingDocs = [
            {
                mobile: '9990008881',
                clientId: 'client-4',
                status: 'active',
                warmupPhase: WarmupPhase.SETTLING,
                warmupJitter: 0,
                enrolledAt: new Date(now - oneDayMs),
                availableDate: today,
            },
        ];

        const mockModel = {
            find: jest.fn((query: Record<string, any>) => {
                const isActiveClientQuery =
                    query?.status === 'active' &&
                    query?.clientId === 'client-4' &&
                    query?.lastUsed === undefined &&
                    !query?.$and;
                if (isActiveClientQuery) {
                    return createQueryChain(() => warmingDocs);
                }
                return createQueryChain(() => []);
            }),
        };

        const service = new PipelinePlanningService(mockModel);
        const result = await service.availabilityNeeds('client-4');

        expect(result.readyActive).toBe(0);
        expect(result.warmingPipeline).toBe(1);
        expect(result.totalNeededForCount).toBe(1);
        expect(result.totalNeeded).toBe(1);
        expect(result.replenishmentWindowNeeds?.find((window) => window.window === 'oneMonth')?.needed).toBe(1);
        expect(result.calculationReason).toContain('threeWeeks');
    });

    test('next available selection excludes ready accounts whose availableDate is in the future', async () => {
        let capturedQuery: Record<string, any> | undefined;
        const mockModel = {
            find: jest.fn((query: Record<string, any>) => {
                capturedQuery = query;
                return createQueryChain(() => []);
            }),
        };

        const service = new TestBaseService(mockModel);
        const selected = await service.getNextAvailableClient('client-5');

        expect(selected).toBeNull();
        expect(capturedQuery?.clientId).toBe('client-5');
        expect(capturedQuery?.warmupPhase).toBe(WarmupPhase.SESSION_ROTATED);
        expect(capturedQuery?.$or).toEqual([
            { availableDate: { $lte: expect.any(String) } },
            { availableDate: { $exists: false } },
            { availableDate: null },
        ]);
    });

    test('unused selection allows legacy session-rotated accounts with missing availableDate', async () => {
        let capturedQuery: Record<string, any> | undefined;
        const legacyReadyDoc = {
            mobile: '9990009991',
            clientId: 'client-6',
            status: 'active',
            warmupPhase: WarmupPhase.SESSION_ROTATED,
            lastUsed: null,
        };
        const mockModel = {
            find: jest.fn((query: Record<string, any>) => {
                capturedQuery = query;
                return createQueryChain(() => [legacyReadyDoc]);
            }),
        };

        const service = new TestBaseService(mockModel);
        const results = await service.getUnusedClients(24, 'client-6');

        expect(results).toEqual([legacyReadyDoc]);
        expect(capturedQuery?.clientId).toBe('client-6');
        expect(capturedQuery?.$and).toEqual([
            {
                $or: [
                    { availableDate: { $lte: expect.any(String) } },
                    { availableDate: { $exists: false } },
                    { availableDate: null },
                ],
            },
            {
                $or: [
                    { lastUsed: { $lt: expect.any(Date) } },
                    { lastUsed: { $exists: false } },
                    { lastUsed: null },
                ],
            },
        ]);
    });

    test('processJoinChannelSequentially uses round-robin: each mobile gets joinsPerMobilePerRound before rotating', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])), updateOne: jest.fn().mockResolvedValue({}) };
        const service = new TestBaseService(mockModel);

        jest.spyOn(service, 'config', 'get').mockReturnValue({
            ...service.config,
            maxJoinsPerSession: 10,
            joinsPerMobilePerRound: 2,
            maxChannelJoinsPerDay: 20,
            maxMapSize: 100,
        });

        const joinOrder: string[] = [];
        (service as any).telegramService = {
            tryJoiningChannel: jest.fn(async (mobile: string) => { joinOrder.push(mobile); }),
            getChannelInfo: jest.fn(),
        };
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        (service as any).activeChannelsService = { findOne: jest.fn().mockResolvedValue(null) };

        (service as any).joinChannelMap.set('mobile-A', [
            { channelId: 'a1', username: 'a1' }, { channelId: 'a2', username: 'a2' },
            { channelId: 'a3', username: 'a3' }, { channelId: 'a4', username: 'a4' },
            { channelId: 'a5', username: 'a5' },
        ]);
        (service as any).joinChannelMap.set('mobile-B', [
            { channelId: 'b1', username: 'b1' }, { channelId: 'b2', username: 'b2' },
            { channelId: 'b3', username: 'b3' }, { channelId: 'b4', username: 'b4' },
            { channelId: 'b5', username: 'b5' },
        ]);

        await (service as any).processJoinChannelSequentially();

        expect(joinOrder).toEqual(['mobile-A', 'mobile-A', 'mobile-B', 'mobile-B']);
        expect((service as any).joinChannelMap.get('mobile-A')?.length).toBe(3);
        expect((service as any).joinChannelMap.get('mobile-B')?.length).toBe(3);
    });

    test('processJoinChannelSequentially skips mobiles that hit daily cap', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])), updateOne: jest.fn().mockResolvedValue({}) };
        const service = new TestBaseService(mockModel);

        jest.spyOn(service, 'config', 'get').mockReturnValue({
            ...service.config,
            maxJoinsPerSession: 10,
            joinsPerMobilePerRound: 5,
            maxChannelJoinsPerDay: 2,
            maxMapSize: 100,
        });

        const joinOrder: string[] = [];
        (service as any).telegramService = {
            tryJoiningChannel: jest.fn(async (mobile: string) => { joinOrder.push(mobile); }),
            getChannelInfo: jest.fn(),
        };
        jest.spyOn(connectionManager, 'getClient').mockResolvedValue({ client: {} } as any);
        jest.spyOn(connectionManager, 'unregisterClient').mockResolvedValue();
        (service as any).activeChannelsService = { findOne: jest.fn().mockResolvedValue(null) };

        (service as any).joinChannelMap.set('capped-mobile', [
            { channelId: 'c1', username: 'c1' }, { channelId: 'c2', username: 'c2' },
            { channelId: 'c3', username: 'c3' },
        ]);
        (service as any).joinChannelMap.set('fresh-mobile', [
            { channelId: 'f1', username: 'f1' }, { channelId: 'f2', username: 'f2' },
        ]);

        (service as any).dailyJoinCounts.set('capped-mobile', 2);
        (service as any).dailyJoinDate = ClientHelperUtils.getTodayDateString();

        await (service as any).processJoinChannelSequentially();

        expect(joinOrder).toEqual(['fresh-mobile', 'fresh-mobile']);
        expect((service as any).joinChannelMap.has('capped-mobile')).toBe(false);
    });

    test('scheduleNextJoinRound calls refillJoinQueue when map is empty and continues if refill adds mobiles', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])) };
        const service = new TestBaseService(mockModel);

        let refillCalled = false;
        jest.spyOn(service, 'refillJoinQueue').mockImplementation(async () => {
            refillCalled = true;
            (service as any).joinChannelMap.set('refilled-mobile', [{ channelId: 'r1', username: 'r1' }]);
            return 1;
        });

        const createTimeoutSpy = jest.spyOn(service as any, 'createTimeout').mockReturnValue(setTimeout(() => {}, 0));

        await (service as any).scheduleNextJoinRound();

        expect(refillCalled).toBe(true);
        expect(createTimeoutSpy).toHaveBeenCalled();
    });

    test('scheduleNextJoinRound stops when refillJoinQueue returns 0', async () => {
        const mockModel = { find: jest.fn(() => createQueryChain(() => [])) };
        const service = new TestBaseService(mockModel);

        jest.spyOn(service, 'refillJoinQueue').mockResolvedValue(0);
        const clearSpy = jest.spyOn(service as any, 'clearJoinChannelInterval');

        await (service as any).scheduleNextJoinRound();

        expect(clearSpy).toHaveBeenCalled();
    });
});
