/**
 * Buffer Client API integration tests.
 *
 * Real MongoDB (memory server) + real service logic.
 * Only external dependencies (Telegram, bots, notifications) are mocked.
 *
 * Every assertion matches exact real-world expected behavior — return types,
 * field isolation, side-effect verification, and error contract.
 */
import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { BufferClient } from '../buffer-clients/schemas/buffer-client.schema';
import { BufferClientService } from '../buffer-clients/buffer-client.service';
import {
    MongoTestContext, startMongo, stopMongo,
    createBufferClientModel, makeBufferClientData, resetCounter,
    mockBotsService, mockTelegramService, mockUsersService,
    mockClientService, mockActiveChannelsService, mockChannelsService,
    mockSessionService,
} from './api-test-helpers';

jest.mock('telegram/Helpers', () => ({
    ...jest.requireActual('telegram/Helpers'),
    sleep: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../utils/fetchWithTimeout', () => ({
    fetchWithTimeout: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock('../../utils/logbots', () => ({
    notifbot: jest.fn(() => 'https://example.test/mock-bot'),
}));

describe('Buffer Client API', () => {
    let ctx: MongoTestContext;
    let BufferClientModel: Model<BufferClient>;
    let service: BufferClientService;
    let botsService: ReturnType<typeof mockBotsService>;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('buffer-client-api-test');
        BufferClientModel = createBufferClientModel(ctx.connection);
        await BufferClientModel.init();
    });

    beforeEach(() => {
        resetCounter();
        botsService = mockBotsService();
        service = new BufferClientService(
            BufferClientModel as any,
            mockTelegramService() as any,
            mockUsersService() as any,
            mockActiveChannelsService() as any,
            mockClientService([{ clientId: 'test-client-1', mobile: '+15559999999' }]) as any,
            mockChannelsService() as any,
            { findAll: jest.fn().mockResolvedValue([]) } as any,
            mockSessionService() as any,
            botsService as any,
        );
    });

    afterEach(async () => {
        await BufferClientModel.deleteMany({});
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    // ─── CREATE ──────────────────────────────────────────────────────────────

    describe('create()', () => {
        it('creates with all defaults and returns full document', async () => {
            const data = makeBufferClientData({ mobile: '+15550100001' });
            const result = await service.create(data);

            // Input fields preserved
            expect(result.mobile).toBe('+15550100001');
            expect(result.tgId).toBe(data.tgId);
            expect(result.session).toBe(data.session);
            expect(result.channels).toBe(data.channels);
            expect(result.clientId).toBe(data.clientId);
            expect(result.availableDate).toBe(data.availableDate);

            // Schema defaults applied
            expect(result.status).toBe('active');
            expect(result.message).toBe('Account is functioning properly');
            expect(result.inUse).toBe(false);
            expect(result.failedUpdateAttempts).toBe(0);
            expect(result.warmupJitter).toBe(0);
            expect(result.warmupPhase).toBeNull();
            expect(result.enrolledAt).toBeNull();
            expect(result.username).toBeNull();
            expect(result.lastUsed).toBeNull();
            expect(result.lastChecked).toBeNull();
            expect(result.lastUpdateAttempt).toBeNull();
            expect(result.lastUpdateFailure).toBeNull();
            expect(result.privacyUpdatedAt).toBeNull();
            expect(result.profilePicsUpdatedAt).toBeNull();
            expect(result.nameBioUpdatedAt).toBeNull();
            expect(result.profilePicsDeletedAt).toBeNull();
            expect(result.usernameUpdatedAt).toBeNull();
            expect(result.twoFASetAt).toBeNull();
            expect(result.otherAuthsRemovedAt).toBeNull();
            expect(result.organicActivityAt).toBeNull();
            expect(result.sessionRotatedAt).toBeNull();
            expect(result.assignedFirstName).toBeNull();
            expect(result.assignedLastName).toBeNull();
            expect(result.assignedBio).toBeNull();
            expect(result.assignedProfilePics).toEqual([]);

            // Timestamps auto-generated
            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.updatedAt).toBeInstanceOf(Date);
        });

        it('sends bot notification with correct content on create', async () => {
            const data = makeBufferClientData({ mobile: '+15550100002', clientId: 'notif-test' });
            await service.create(data);

            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
            const [category, message] = botsService.sendMessageByCategory.mock.calls[0];
            expect(category).toBe('ACCOUNT_NOTIFICATIONS');
            expect(message).toContain('Buffer Client Created');
            expect(message).toContain('+15550100002');
            expect(message).toContain('notif-test');
        });

        it('rejects duplicate mobile with MongoServerError 11000', async () => {
            await service.create(makeBufferClientData({ mobile: '+15550100003' }));

            await expect(
                service.create(makeBufferClientData({ mobile: '+15550100003', tgId: 'different' })),
            ).rejects.toMatchObject({ code: 11000 });
        });

        it('preserves explicit non-default values', async () => {
            const data = makeBufferClientData({
                mobile: '+15550100004',
                status: 'inactive',
                message: 'custom msg',
                channels: 0,
            });
            const result = await service.create(data);
            expect(result.status).toBe('inactive');
            expect(result.message).toBe('custom msg');
            expect(result.channels).toBe(0);
        });
    });

    // ─── FIND ────────────────────────────────────────────────────────────────

    describe('findOne()', () => {
        it('returns the exact document by mobile', async () => {
            const data = makeBufferClientData({ mobile: '+15550200001', username: 'testuser1' });
            await service.create(data);

            const found = await service.findOne('+15550200001');
            expect(found.mobile).toBe('+15550200001');
            expect(found.tgId).toBe(data.tgId);
            expect(found.username).toBe('testuser1');
        });

        it('throws NotFoundException with descriptive message for unknown mobile', async () => {
            await expect(service.findOne('+15559999999'))
                .rejects.toThrow(NotFoundException);
            await expect(service.findOne('+15559999999'))
                .rejects.toThrow('BufferClient with mobile +15559999999 not found');
        });

        it('returns undefined (not null) with throwErr=false for unknown mobile', async () => {
            const result = await service.findOne('+15559999999', false);
            // Service uses ?.toJSON() which yields undefined for null mongoose result
            expect(result).toBeUndefined();
        });
    });

    describe('findAll()', () => {
        it('returns all buffer clients regardless of status', async () => {
            await service.create(makeBufferClientData({ mobile: '+15550300001', status: 'active' }));
            await service.create(makeBufferClientData({ mobile: '+15550300002', status: 'inactive' }));

            const all = await service.findAll();
            expect(all).toHaveLength(2);
            const mobiles = all.map(c => c.mobile).sort();
            expect(mobiles).toEqual(['+15550300001', '+15550300002']);
        });

        it('filters by status=active — excludes inactive', async () => {
            await service.create(makeBufferClientData({ mobile: '+15550300003', status: 'active' }));
            await service.create(makeBufferClientData({ mobile: '+15550300004', status: 'inactive' }));

            const active = await service.findAll('active');
            expect(active).toHaveLength(1);
            expect(active[0].mobile).toBe('+15550300003');
            expect(active[0].status).toBe('active');
        });

        it('returns empty array when collection is empty', async () => {
            const all = await service.findAll();
            expect(all).toEqual([]);
            expect(Array.isArray(all)).toBe(true);
        });
    });

    // ─── UPDATE (PATCH) ──────────────────────────────────────────────────────

    describe('update()', () => {
        it('updates only the specified field — others unchanged', async () => {
            await service.create(makeBufferClientData({
                mobile: '+15550400001', channels: 100, warmupPhase: null, username: null,
            }));

            const updated = await service.update('+15550400001', { channels: 250 });
            expect(updated.channels).toBe(250);
            // These must remain unchanged
            expect(updated.mobile).toBe('+15550400001');
            expect(updated.warmupPhase).toBeNull();
            expect(updated.username).toBeNull();
            expect(updated.status).toBe('active');
            expect(updated.inUse).toBe(false);
        });

        it('updates warmupPhase through valid enum transitions', async () => {
            await service.create(makeBufferClientData({ mobile: '+15550400002' }));

            const phases = ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'] as const;
            for (const phase of phases) {
                const updated = await service.update('+15550400002', { warmupPhase: phase });
                expect(updated.warmupPhase).toBe(phase);
            }
        });

        it('updates multiple fields atomically', async () => {
            await service.create(makeBufferClientData({ mobile: '+15550400003' }));
            const now = new Date();

            const updated = await service.update('+15550400003', {
                warmupPhase: 'maturing',
                username: 'newuser42',
                channels: 200,
                lastUpdateAttempt: now,
            });
            expect(updated.warmupPhase).toBe('maturing');
            expect(updated.username).toBe('newuser42');
            expect(updated.channels).toBe(200);
            expect(updated.lastUpdateAttempt.getTime()).toBe(now.getTime());
        });

        it('throws NotFoundException for unknown mobile', async () => {
            await expect(service.update('+15559999999', { channels: 50 }))
                .rejects.toThrow(NotFoundException);
        });

        it('updates updatedAt timestamp', async () => {
            const created = await service.create(makeBufferClientData({ mobile: '+15550400004' }));
            const originalUpdatedAt = created.updatedAt;

            // Small delay to ensure timestamp differs
            await new Promise(r => setTimeout(r, 50));
            const updated = await service.update('+15550400004', { channels: 999 });
            expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    // ─── CREATE OR UPDATE (PUT) ──────────────────────────────────────────────

    describe('createOrUpdate()', () => {
        it('creates a new doc when mobile does not exist and verifies defaults', async () => {
            const data = makeBufferClientData({ mobile: '+15550500001' });
            const result = await service.createOrUpdate('+15550500001', data);

            expect(result.mobile).toBe('+15550500001');
            expect(result.status).toBe('active');
            expect(result.inUse).toBe(false);
            // Only 1 doc in DB
            const count = await BufferClientModel.countDocuments({ mobile: '+15550500001' });
            expect(count).toBe(1);
        });

        it('updates existing doc without creating duplicate', async () => {
            await service.create(makeBufferClientData({ mobile: '+15550500002', channels: 50 }));

            const updated = await service.createOrUpdate('+15550500002', makeBufferClientData({
                mobile: '+15550500002', channels: 200,
            }));
            expect(updated.channels).toBe(200);

            const count = await BufferClientModel.countDocuments({ mobile: '+15550500002' });
            expect(count).toBe(1);
        });
    });

    // ─── UPDATE STATUS ──────────────────────────────────────────────────────

    describe('updateStatus()', () => {
        it('inactive: sets status, message, clears inUse, sends notification', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550600001', inUse: true, status: 'active',
            }));

            const updated = await service.updateStatus('+15550600001', 'inactive', 'banned by TG');
            expect(updated.status).toBe('inactive');
            expect(updated.inUse).toBe(false);
            expect(updated.message).toBe('banned by TG');

            // Notification sent with correct details
            expect(botsService.sendMessageByCategory).toHaveBeenCalledWith(
                'ACCOUNT_NOTIFICATIONS',
                expect.stringContaining('+15550600001'),
                expect.anything(),
            );
            const notifMsg = botsService.sendMessageByCategory.mock.calls[0][1];
            expect(notifMsg).toContain('inactive');
            expect(notifMsg).toContain('banned by TG');
        });

        it('active: sets status, does NOT touch inUse', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550600002', inUse: false, status: 'inactive',
            }));

            const updated = await service.updateStatus('+15550600002', 'active', 'restored');
            expect(updated.status).toBe('active');
            // inUse must NOT be changed on activate — only cleared on deactivate
            expect(updated.inUse).toBe(false);
            expect(updated.message).toBe('restored');
        });

        it('active without message: preserves old message (service-level behavior)', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550600003', status: 'inactive', message: 'old reason',
            }));

            const updated = await service.updateStatus('+15550600003', 'active');
            expect(updated.status).toBe('active');
            // No message passed → updateData has no message key → old value preserved
            expect(updated.message).toBe('old reason');
        });
    });

    // ─── MARK AS INACTIVE (deactivate) ──────────────────────────────────────

    describe('markAsInactive()', () => {
        it('sets inactive + inUse=false and passes reason as message', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550700001', inUse: true, status: 'active',
            }));

            const result = await service.markAsInactive('+15550700001', 'health check failed');
            expect(result.status).toBe('inactive');
            expect(result.inUse).toBe(false);
            expect(result.message).toBe('health check failed');
        });

        it('returns null (not throw) for unknown mobile — error swallowed', async () => {
            const result = await service.markAsInactive('+15559999999', 'test');
            expect(result).toBeNull();
        });

        it('does not affect other buffer clients for same clientId', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550700002', clientId: 'shared', inUse: false, status: 'active',
            }));
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550700003', clientId: 'shared', inUse: true, status: 'active',
            }));

            await service.markAsInactive('+15550700003', 'banned');

            // Other client untouched
            const other = await BufferClientModel.findOne({ mobile: '+15550700002' }).lean();
            expect(other.status).toBe('active');
            expect(other.inUse).toBe(false);
        });
    });

    // ─── MARK AS USED ────────────────────────────────────────────────────────

    describe('markAsUsed()', () => {
        it('sets lastUsed to current time, does NOT change inUse or status', async () => {
            const beforeCall = new Date();
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550800001', inUse: false, status: 'active', lastUsed: null,
            }));

            const updated = await service.markAsUsed('+15550800001');
            expect(updated.lastUsed).toBeInstanceOf(Date);
            expect(updated.lastUsed.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
            expect(updated.lastUsed.getTime()).toBeLessThanOrEqual(Date.now());
            // These must NOT change
            expect(updated.inUse).toBe(false);
            expect(updated.status).toBe('active');
        });

        it('with message: sets both lastUsed and message', async () => {
            await BufferClientModel.create(makeBufferClientData({ mobile: '+15550800002' }));

            const updated = await service.markAsUsed('+15550800002', 'campaign-xyz');
            expect(updated.lastUsed).toBeInstanceOf(Date);
            expect(updated.message).toBe('campaign-xyz');
        });

        it('without message: preserves existing message', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550800003', message: 'original msg',
            }));

            const updated = await service.markAsUsed('+15550800003');
            expect(updated.message).toBe('original msg');
        });
    });

    // ─── RESET FAILURES ─────────────────────────────────────────────────────

    describe('resetFailures (via update)', () => {
        it('resets failure counters without touching other fields', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15550900001',
                failedUpdateAttempts: 5,
                lastUpdateFailure: new Date('2026-04-01'),
                warmupPhase: 'settling',
                channels: 100,
            }));

            const updated = await service.update('+15550900001', {
                failedUpdateAttempts: 0,
                lastUpdateFailure: null,
            });
            expect(updated.failedUpdateAttempts).toBe(0);
            expect(updated.lastUpdateFailure).toBeNull();
            // Other fields unchanged
            expect(updated.warmupPhase).toBe('settling');
            expect(updated.channels).toBe(100);
        });
    });

    // ─── DELETE ──────────────────────────────────────────────────────────────

    describe('remove()', () => {
        it('deletes doc from DB and returns void', async () => {
            await service.create(makeBufferClientData({ mobile: '+15551000001' }));

            const result = await service.remove('+15551000001');
            expect(result).toBeUndefined(); // remove returns void

            const dbDoc = await BufferClientModel.findOne({ mobile: '+15551000001' }).lean();
            expect(dbDoc).toBeNull();
        });

        it('throws for unknown mobile (wraps NotFoundException as HttpException)', async () => {
            await expect(service.remove('+15559999999')).rejects.toThrow();
            // Verify no accidental side-effect docs
            const count = await BufferClientModel.countDocuments({});
            expect(count).toBe(0);
        });

        it('does not affect other documents', async () => {
            await service.create(makeBufferClientData({ mobile: '+15551000002' }));
            await service.create(makeBufferClientData({ mobile: '+15551000003' }));

            await service.remove('+15551000002');

            const remaining = await BufferClientModel.find({}).lean();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].mobile).toBe('+15551000003');
        });
    });

    // ─── EXECUTE QUERY ──────────────────────────────────────────────────────

    describe('executeQuery()', () => {
        it('runs a MongoDB filter and returns matching docs only', async () => {
            await service.create(makeBufferClientData({ mobile: '+15551100001', channels: 50 }));
            await service.create(makeBufferClientData({ mobile: '+15551100002', channels: 200 }));
            await service.create(makeBufferClientData({ mobile: '+15551100003', channels: 150 }));

            const results = await service.executeQuery({ channels: { $gte: 150 } });
            expect(results).toHaveLength(2);
            const mobiles = results.map(r => r.mobile).sort();
            expect(mobiles).toEqual(['+15551100002', '+15551100003']);
        });

        it('throws BadRequestException on null query', async () => {
            await expect(service.executeQuery(null as any)).rejects.toThrow('Query is invalid');
        });
    });

    // ─── SET PRIMARY IN USE ─────────────────────────────────────────────────

    describe('setPrimaryInUse()', () => {
        it('marks target as inUse=true and revokes other inUse=true for same clientId', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551200001', clientId: 'client-x', inUse: true,
            }));
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551200002', clientId: 'client-x', inUse: false,
            }));
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551200003', clientId: 'client-y', inUse: true,
            }));

            const result = await service.setPrimaryInUse('client-x', '+15551200002');
            expect(result.inUse).toBe(true);
            expect(result.mobile).toBe('+15551200002');

            // Old primary in client-x should be revoked
            const old = await BufferClientModel.findOne({ mobile: '+15551200001' }).lean();
            expect(old.inUse).toBe(false);
            expect(old.lastUsed).toBeInstanceOf(Date); // set when revoked

            // Different clientId untouched
            const otherClient = await BufferClientModel.findOne({ mobile: '+15551200003' }).lean();
            expect(otherClient.inUse).toBe(true);
        });
    });

    // ─── NEXT AVAILABLE / UNUSED — real query logic ─────────────────────────

    describe('getNextAvailableBufferClient()', () => {
        it('returns null when no session_rotated + active + available clients exist', async () => {
            // Active but not session_rotated
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551300001', status: 'active', warmupPhase: 'ready',
                availableDate: '2020-01-01',
            }));
            const result = await service.getNextAvailableBufferClient('test-client-1');
            expect(result).toBeNull();
        });

        it('returns the least recently used session_rotated client', async () => {
            const yesterday = '2026-04-30';
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551300002', warmupPhase: 'session_rotated', status: 'active',
                availableDate: yesterday, lastUsed: new Date('2026-04-01'),
            }));
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551300003', warmupPhase: 'session_rotated', status: 'active',
                availableDate: yesterday, lastUsed: new Date('2026-03-15'),
            }));

            const result = await service.getNextAvailableBufferClient('test-client-1');
            // Should pick the one with older lastUsed
            expect(result).not.toBeNull();
            expect(result.mobile).toBe('+15551300003');
        });

        it('excludes inUse=true clients', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551300004', warmupPhase: 'session_rotated', status: 'active',
                availableDate: '2020-01-01', inUse: true,
            }));
            const result = await service.getNextAvailableBufferClient('test-client-1');
            expect(result).toBeNull();
        });

        it('excludes inactive clients', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551300005', warmupPhase: 'session_rotated', status: 'inactive',
                availableDate: '2020-01-01',
            }));
            const result = await service.getNextAvailableBufferClient('test-client-1');
            expect(result).toBeNull();
        });

        it('excludes clients with future availableDate', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551300006', warmupPhase: 'session_rotated', status: 'active',
                availableDate: '2099-01-01',
            }));
            const result = await service.getNextAvailableBufferClient('test-client-1');
            expect(result).toBeNull();
        });
    });

    describe('getUnusedBufferClients()', () => {
        it('returns clients not used in the last N hours', async () => {
            const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago
            const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago

            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551400001', warmupPhase: 'session_rotated', status: 'active',
                availableDate: '2020-01-01', lastUsed: oldDate,
            }));
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551400002', warmupPhase: 'session_rotated', status: 'active',
                availableDate: '2020-01-01', lastUsed: recentDate,
            }));

            const unused = await service.getUnusedBufferClients(24, 'test-client-1');
            expect(unused).toHaveLength(1);
            expect(unused[0].mobile).toBe('+15551400001');
        });

        it('includes clients with null lastUsed (never used)', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551400003', warmupPhase: 'session_rotated', status: 'active',
                availableDate: '2020-01-01', lastUsed: null,
            }));

            const unused = await service.getUnusedBufferClients(24, 'test-client-1');
            expect(unused).toHaveLength(1);
            expect(unused[0].mobile).toBe('+15551400003');
        });
    });

    // ─── FIELD ISOLATION ────────────────────────────────────────────────────

    describe('field isolation', () => {
        it('updating doc A does not affect doc B', async () => {
            await service.create(makeBufferClientData({ mobile: '+15551500001', channels: 100 }));
            await service.create(makeBufferClientData({ mobile: '+15551500002', channels: 200 }));

            await service.update('+15551500001', { channels: 999 });

            const docB = await BufferClientModel.findOne({ mobile: '+15551500002' }).lean();
            expect(docB.channels).toBe(200);
        });

        it('deactivating doc A does not deactivate doc B', async () => {
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551500003', clientId: 'client-iso-a', status: 'active', inUse: true,
            }));
            await BufferClientModel.create(makeBufferClientData({
                mobile: '+15551500004', clientId: 'client-iso-b', status: 'active', inUse: true,
            }));

            await service.updateStatus('+15551500003', 'inactive', 'banned');

            const docB = await BufferClientModel.findOne({ mobile: '+15551500004' }).lean();
            expect(docB.status).toBe('active');
            expect(docB.inUse).toBe(true);
        });
    });
});
