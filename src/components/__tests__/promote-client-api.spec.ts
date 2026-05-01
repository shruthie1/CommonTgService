/**
 * Promote Client API integration tests.
 *
 * Real MongoDB (memory server) + real service logic.
 * Only external dependencies (Telegram, bots, notifications) are mocked.
 *
 * Every assertion matches exact real-world expected behavior — return types,
 * field isolation, side-effect verification, and error contract.
 */
import { NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { PromoteClient } from '../promote-clients/schemas/promote-client.schema';
import { PromoteClientService } from '../promote-clients/promote-client.service';
import {
    MongoTestContext, startMongo, stopMongo,
    createPromoteClientModel, makePromoteClientData, resetCounter,
    mockBotsService, mockTelegramService, mockUsersService,
    mockClientService, mockActiveChannelsService, mockChannelsService,
    mockSessionService,
} from './api-test-helpers';

// Mock external modules
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

describe('Promote Client API', () => {
    let ctx: MongoTestContext;
    let PromoteClientModel: Model<PromoteClient>;
    let service: PromoteClientService;
    let botsService: ReturnType<typeof mockBotsService>;

    beforeAll(async () => {
        jest.setTimeout(60_000);
        ctx = await startMongo('promote-client-api-test');
        PromoteClientModel = createPromoteClientModel(ctx.connection);
        await PromoteClientModel.init();
    });

    beforeEach(() => {
        resetCounter();
        botsService = mockBotsService();
        service = new PromoteClientService(
            PromoteClientModel as any,
            mockTelegramService() as any,
            mockUsersService() as any,
            mockActiveChannelsService() as any,
            mockClientService([{ clientId: 'test-client-1', mobile: '+15559999999' }]) as any,
            mockChannelsService() as any,
            { findAll: jest.fn().mockResolvedValue([]) } as any, // bufferClientService
            mockSessionService() as any,
            botsService as any,
        );
    });

    afterEach(async () => {
        await PromoteClientModel.deleteMany({});
    });

    afterAll(async () => {
        await stopMongo(ctx);
    });

    // ─── CREATE ──────────────────────────────────────────────────────────────

    describe('create()', () => {
        it('creates with all defaults and returns full document', async () => {
            const data = makePromoteClientData({ mobile: '+15550100001' });
            const result = await service.create(data);

            // Input fields preserved
            expect(result.mobile).toBe('+15550100001');
            expect(result.tgId).toBe(data.tgId);
            expect(result.channels).toBe(data.channels);
            expect(result.clientId).toBe(data.clientId);
            expect(result.availableDate).toBe(data.availableDate);
            expect(result.lastActive).toBe(data.lastActive);

            // Schema defaults applied
            expect(result.status).toBe('active');
            expect(result.message).toBe('Account is functioning properly');
            expect(result.inUse).toBe(false);
            expect(result.failedUpdateAttempts).toBe(0);
            expect(result.warmupJitter).toBe(0);
            expect(result.warmupPhase).toBeNull();
            expect(result.enrolledAt).toBeNull();
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
            const data = makePromoteClientData({ mobile: '+15550100002', clientId: 'notif-test' });
            await service.create(data);

            expect(botsService.sendMessageByCategory).toHaveBeenCalledTimes(1);
            const [category, message] = botsService.sendMessageByCategory.mock.calls[0];
            expect(category).toBe('ACCOUNT_NOTIFICATIONS');
            expect(message).toContain('Promote Client Created');
            expect(message).toContain('+15550100002');
            expect(message).toContain('notif-test');
        });

        it('rejects duplicate mobile with MongoServerError 11000', async () => {
            await service.create(makePromoteClientData({ mobile: '+15550100003' }));

            await expect(
                service.create(makePromoteClientData({ mobile: '+15550100003', tgId: 'different' })),
            ).rejects.toMatchObject({ code: 11000 });
        });

        it('preserves explicit non-default values', async () => {
            const data = makePromoteClientData({
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
            const data = makePromoteClientData({ mobile: '+15550200001' });
            await service.create(data);

            const found = await service.findOne('+15550200001');
            expect(found.mobile).toBe('+15550200001');
            expect(found.tgId).toBe(data.tgId);
            expect(found.channels).toBe(data.channels);
        });

        it('throws NotFoundException with descriptive message for unknown mobile', async () => {
            await expect(service.findOne('+15559999999'))
                .rejects.toThrow(NotFoundException);
            await expect(service.findOne('+15559999999'))
                .rejects.toThrow('PromoteClient with mobile +15559999999 not found');
        });

        it('returns undefined (not null) with throwErr=false for unknown mobile', async () => {
            const result = await service.findOne('+15559999999', false);
            // Service uses ?.toJSON() which yields undefined for null mongoose result
            expect(result).toBeUndefined();
        });
    });

    describe('findAll()', () => {
        it('returns all promote clients regardless of status', async () => {
            await service.create(makePromoteClientData({ mobile: '+15550300001', status: 'active' }));
            await service.create(makePromoteClientData({ mobile: '+15550300002', status: 'inactive' }));

            const all = await service.findAll();
            expect(all).toHaveLength(2);
            const mobiles = all.map(c => c.mobile).sort();
            expect(mobiles).toEqual(['+15550300001', '+15550300002']);
        });

        it('filters by status=active — excludes inactive', async () => {
            await service.create(makePromoteClientData({ mobile: '+15550300003', status: 'active' }));
            await service.create(makePromoteClientData({ mobile: '+15550300004', status: 'inactive' }));

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
            await service.create(makePromoteClientData({
                mobile: '+15550400001', channels: 100, warmupPhase: null,
            }));

            const updated = await service.update('+15550400001', { channels: 250 });
            expect(updated.channels).toBe(250);
            // These must remain unchanged
            expect(updated.mobile).toBe('+15550400001');
            expect(updated.warmupPhase).toBeNull();
            expect(updated.status).toBe('active');
            expect(updated.inUse).toBe(false);
        });

        it('updates warmupPhase through valid enum transitions', async () => {
            await service.create(makePromoteClientData({ mobile: '+15550400002' }));

            const phases = ['enrolled', 'settling', 'identity', 'growing', 'maturing', 'ready', 'session_rotated'] as const;
            for (const phase of phases) {
                const updated = await service.update('+15550400002', { warmupPhase: phase });
                expect(updated.warmupPhase).toBe(phase);
            }
        });

        it('updates multiple fields atomically', async () => {
            await service.create(makePromoteClientData({ mobile: '+15550400003' }));
            const now = new Date();

            const updated = await service.update('+15550400003', {
                warmupPhase: 'maturing',
                channels: 200,
                lastUpdateAttempt: now,
            });
            expect(updated.warmupPhase).toBe('maturing');
            expect(updated.channels).toBe(200);
            expect(updated.lastUpdateAttempt.getTime()).toBe(now.getTime());
        });

        it('throws NotFoundException for unknown mobile', async () => {
            await expect(service.update('+15559999999', { channels: 50 }))
                .rejects.toThrow(NotFoundException);
        });

        it('preserves fields not in the update', async () => {
            await service.create(makePromoteClientData({
                mobile: '+15550400004', channels: 150,
            }));

            await service.update('+15550400004', { warmupPhase: 'settling' });
            const found = await service.findOne('+15550400004');
            expect(found.channels).toBe(150);
            expect(found.warmupPhase).toBe('settling');
        });

        it('updates updatedAt timestamp', async () => {
            const created = await service.create(makePromoteClientData({ mobile: '+15550400005' }));
            const originalUpdatedAt = created.updatedAt;

            await new Promise(r => setTimeout(r, 50));
            const updated = await service.update('+15550400005', { channels: 999 });
            expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    // ─── CREATE OR UPDATE (PUT) ──────────────────────────────────────────────

    describe('createOrUpdate()', () => {
        it('creates a new doc when mobile does not exist and verifies defaults', async () => {
            const data = makePromoteClientData({ mobile: '+15550500001' });
            const result = await service.createOrUpdate('+15550500001', data);

            expect(result.mobile).toBe('+15550500001');
            expect(result.status).toBe('active');
            expect(result.inUse).toBe(false);
            const count = await PromoteClientModel.countDocuments({ mobile: '+15550500001' });
            expect(count).toBe(1);
        });

        it('updates existing doc without creating duplicate', async () => {
            await service.create(makePromoteClientData({ mobile: '+15550500002', channels: 50 }));

            const updated = await service.createOrUpdate('+15550500002', makePromoteClientData({
                mobile: '+15550500002', channels: 200,
            }));
            expect(updated.channels).toBe(200);

            const count = await PromoteClientModel.countDocuments({ mobile: '+15550500002' });
            expect(count).toBe(1);
        });
    });

    // ─── UPDATE STATUS ──────────────────────────────────────────────────────

    describe('updateStatus()', () => {
        it('inactive: sets status, message, clears inUse, sends notification', async () => {
            await PromoteClientModel.create(makePromoteClientData({
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
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15550600002', inUse: false, status: 'inactive',
            }));

            const updated = await service.updateStatus('+15550600002', 'active', 'restored');
            expect(updated.status).toBe('active');
            // inUse must NOT be changed on activate — only cleared on deactivate
            expect(updated.inUse).toBe(false);
            expect(updated.message).toBe('restored');
        });

        it('active without message: preserves old message (service-level behavior)', async () => {
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15550600003', status: 'inactive', message: 'old reason',
            }));

            const updated = await service.updateStatus('+15550600003', 'active');
            expect(updated.status).toBe('active');
            // No message passed → updateData has no message key → old value preserved
            expect(updated.message).toBe('old reason');
        });
    });

    // ─── MARK AS ACTIVE ─────────────────────────────────────────────────────

    describe('markAsActive()', () => {
        it('activates with default message "Account is functioning properly"', async () => {
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15550650001', status: 'inactive', message: 'old ban message',
            }));

            const result = await service.markAsActive('+15550650001');
            expect(result.status).toBe('active');
            expect(result.message).toBe('Account is functioning properly');
        });

        it('activates with custom message', async () => {
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15550650002', status: 'inactive',
            }));

            const result = await service.markAsActive('+15550650002', 'manually restored');
            expect(result.status).toBe('active');
            expect(result.message).toBe('manually restored');
        });
    });

    // ─── MARK AS INACTIVE (deactivate) ──────────────────────────────────────

    describe('markAsInactive()', () => {
        it('sets inactive + inUse=false and passes reason as message', async () => {
            await PromoteClientModel.create(makePromoteClientData({
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

        it('does not affect other promote clients for same clientId', async () => {
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15550700002', clientId: 'shared', inUse: false, status: 'active',
            }));
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15550700003', clientId: 'shared', inUse: true, status: 'active',
            }));

            await service.markAsInactive('+15550700003', 'banned');

            const other = await PromoteClientModel.findOne({ mobile: '+15550700002' }).lean();
            expect(other.status).toBe('active');
            expect(other.inUse).toBe(false);
        });
    });

    // ─── UPDATE LAST USED ────────────────────────────────────────────────────

    describe('updateLastUsed()', () => {
        it('sets lastUsed to current time, does NOT change inUse or status', async () => {
            const beforeCall = new Date();
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15550800001', inUse: false, status: 'active', lastUsed: null,
            }));

            const updated = await service.updateLastUsed('+15550800001');
            expect(updated.lastUsed).toBeInstanceOf(Date);
            expect(updated.lastUsed.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
            expect(updated.lastUsed.getTime()).toBeLessThanOrEqual(Date.now());
            // These must NOT change
            expect(updated.inUse).toBe(false);
            expect(updated.status).toBe('active');
        });
    });

    // ─── RESET FAILURES ─────────────────────────────────────────────────────

    describe('resetFailures (via update)', () => {
        it('resets failure counters without touching other fields', async () => {
            await PromoteClientModel.create(makePromoteClientData({
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
            await service.create(makePromoteClientData({ mobile: '+15551000001' }));

            const result = await service.remove('+15551000001');
            expect(result).toBeUndefined(); // remove returns void

            const dbDoc = await PromoteClientModel.findOne({ mobile: '+15551000001' }).lean();
            expect(dbDoc).toBeNull();
        });

        it('throws NotFoundException for unknown mobile', async () => {
            await expect(service.remove('+15559999999')).rejects.toThrow('not found');
            // Verify no accidental side-effect docs
            const count = await PromoteClientModel.countDocuments({});
            expect(count).toBe(0);
        });

        it('does not affect other documents', async () => {
            await service.create(makePromoteClientData({ mobile: '+15551000002' }));
            await service.create(makePromoteClientData({ mobile: '+15551000003' }));

            await service.remove('+15551000002');

            const remaining = await PromoteClientModel.find({}).lean();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].mobile).toBe('+15551000003');
        });
    });

    // ─── EXECUTE QUERY ──────────────────────────────────────────────────────

    describe('executeQuery()', () => {
        it('runs a MongoDB filter and returns matching docs only', async () => {
            await service.create(makePromoteClientData({ mobile: '+15551100001', channels: 50 }));
            await service.create(makePromoteClientData({ mobile: '+15551100002', channels: 200 }));
            await service.create(makePromoteClientData({ mobile: '+15551100003', channels: 150 }));

            const results = await service.executeQuery({ channels: { $gte: 150 } });
            expect(results).toHaveLength(2);
            const mobiles = results.map(r => r.mobile).sort();
            expect(mobiles).toEqual(['+15551100002', '+15551100003']);
        });

        it('supports sort and limit', async () => {
            await service.create(makePromoteClientData({ mobile: '+15551100004', channels: 300 }));
            await service.create(makePromoteClientData({ mobile: '+15551100005', channels: 100 }));
            await service.create(makePromoteClientData({ mobile: '+15551100006', channels: 200 }));

            const results = await service.executeQuery({}, { channels: 1 }, 2);
            expect(results).toHaveLength(2);
            expect(results[0].channels).toBe(100);
            expect(results[1].channels).toBe(200);
        });

        it('throws BadRequestException on null query', async () => {
            await expect(service.executeQuery(null as any)).rejects.toThrow('Query is invalid');
        });
    });

    // ─── PROMOTE-SPECIFIC: getPromoteClientsByStatus ─────────────────────────

    describe('getPromoteClientsByStatus()', () => {
        it('returns only clients with matching status', async () => {
            await service.create(makePromoteClientData({ mobile: '+15551200001', status: 'active' }));
            await service.create(makePromoteClientData({ mobile: '+15551200002', status: 'inactive' }));
            await service.create(makePromoteClientData({ mobile: '+15551200003', status: 'active' }));

            const active = await service.getPromoteClientsByStatus('active');
            expect(active).toHaveLength(2);
            const mobiles = active.map(c => c.mobile).sort();
            expect(mobiles).toEqual(['+15551200001', '+15551200003']);

            const inactive = await service.getPromoteClientsByStatus('inactive');
            expect(inactive).toHaveLength(1);
            expect(inactive[0].mobile).toBe('+15551200002');
        });
    });

    // ─── PROMOTE-SPECIFIC: getPromoteClientsWithMessages ─────────────────────

    describe('getPromoteClientsWithMessages()', () => {
        it('returns mobile, status, message, clientId, lastUsed for all clients', async () => {
            await service.create(makePromoteClientData({
                mobile: '+15551300001',
                clientId: 'client-a',
            }));
            await service.create(makePromoteClientData({
                mobile: '+15551300002',
                clientId: 'client-b',
                status: 'inactive',
                message: 'banned',
            }));

            const msgs = await service.getPromoteClientsWithMessages();
            expect(msgs).toHaveLength(2);

            const banned = msgs.find((m: any) => m.mobile === '+15551300002');
            expect(banned?.status).toBe('inactive');
            expect(banned?.message).toBe('banned');
            expect(banned?.clientId).toBe('client-b');
        });
    });

    // ─── SCHEMA DEFAULTS ────────────────────────────────────────────────────

    describe('schema defaults', () => {
        it('sets correct defaults on raw creation', async () => {
            const doc = await PromoteClientModel.create(makePromoteClientData());
            const found = await PromoteClientModel.findOne({ mobile: doc.mobile }).lean();

            expect(found?.status).toBe('active');
            expect(found?.inUse).toBe(false);
            expect(found?.failedUpdateAttempts).toBe(0);
            expect(found?.warmupJitter).toBe(0);
            expect(found?.warmupPhase).toBeNull();
            expect(found?.enrolledAt).toBeNull();
            expect(found?.lastUsed).toBeNull();
            expect(found?.assignedFirstName).toBeNull();
            expect(found?.assignedLastName).toBeNull();
            expect(found?.assignedBio).toBeNull();
            expect(found?.assignedProfilePics).toEqual([]);
            expect(found?.message).toBe('Account is functioning properly');
        });
    });

    // ─── FIELD ISOLATION ────────────────────────────────────────────────────

    describe('field isolation', () => {
        it('updating doc A does not affect doc B', async () => {
            await service.create(makePromoteClientData({ mobile: '+15551500001', channels: 100 }));
            await service.create(makePromoteClientData({ mobile: '+15551500002', channels: 200 }));

            await service.update('+15551500001', { channels: 999 });

            const docB = await PromoteClientModel.findOne({ mobile: '+15551500002' }).lean();
            expect(docB.channels).toBe(200);
        });

        it('deactivating doc A does not deactivate doc B', async () => {
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15551500003', clientId: 'client-iso-a', status: 'active', inUse: true,
            }));
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15551500004', clientId: 'client-iso-b', status: 'active', inUse: true,
            }));

            await service.updateStatus('+15551500003', 'inactive', 'banned');

            const docB = await PromoteClientModel.findOne({ mobile: '+15551500004' }).lean();
            expect(docB.status).toBe('active');
            expect(docB.inUse).toBe(true);
        });
    });

    // ─── CONSISTENCY WITH BUFFER ─────────────────────────────────────────────

    describe('consistency with buffer client behavior', () => {
        it('inactive status clears inUse (same as buffer)', async () => {
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15551600001', inUse: true, status: 'active',
            }));

            const updated = await service.updateStatus('+15551600001', 'inactive', 'test');
            expect(updated.inUse).toBe(false);
        });

        it('markAsActive resets message to default (same as buffer activate)', async () => {
            await PromoteClientModel.create(makePromoteClientData({
                mobile: '+15551600002', status: 'inactive', message: 'was banned',
            }));

            const updated = await service.markAsActive('+15551600002');
            expect(updated.message).toBe('Account is functioning properly');
        });
    });
});
